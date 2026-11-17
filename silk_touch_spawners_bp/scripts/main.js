import { world, system, GameMode, ItemStack, StructureSaveMode, Direction } from "@minecraft/server";

// How it works
// Breaking: when a player mines a mob spawner with a Silk Touch pickaxe, the
// break is cancelled and the spawner (with its mob and settings) is saved as a
// one-block structure in the world. The spawner is removed and a "Mob Spawner"
// item drops that remembers which structure it came from.
// Placing: using that item on a block places the saved structure next to it,
// which brings the exact spawner back, then the item and the saved copy are
// removed.

const SPAWNER = "minecraft:mob_spawner";
const ITEM = "coberto:picked_up_spawner";
const STRUCTURE_PROPERTY = "coberto:spawner_structure"; // dynamic property on the item

const FACE_OFFSETS = {
	[Direction.Up]: { x: 0, y: 1, z: 0 },
	[Direction.Down]: { x: 0, y: -1, z: 0 },
	[Direction.North]: { x: 0, y: 0, z: -1 },
	[Direction.South]: { x: 0, y: 0, z: 1 },
	[Direction.East]: { x: 1, y: 0, z: 0 },
	[Direction.West]: { x: -1, y: 0, z: 0 },
};

// ---- Breaking ------------------------------------------------------------

world.beforeEvents.playerBreakBlock.subscribe((event) => {
	const { block, player, itemStack } = event;
	if (block.typeId !== SPAWNER || !isSilkTouchPickaxe(itemStack)) return;

	event.cancel = true;
	const dimension = block.dimension;
	const location = { x: block.x, y: block.y, z: block.z };
	const slot = player.selectedSlotIndex;
	// The world can't be changed inside a "before" event, so do the rest next tick.
	system.run(() => pickUp(player, dimension, location, slot));
});

function pickUp(player, dimension, location, slot) {
	const block = dimension.getBlock(location);
	if (block?.typeId !== SPAWNER) return; // it changed in the meantime

	const id = newStructureId();
	try {
		world.structureManager.createFromWorld(id, dimension, location, location, {
			includeBlocks: true,
			includeEntities: false,
			saveMode: StructureSaveMode.World,
		});
	} catch (e) {
		console.warn(`[Silk Touch Spawners] Couldn't save the spawner: ${e}`);
		if (player.isValid) player.sendMessage("§cThat spawner couldn't be picked up.");
		return;
	}

	block.setType("minecraft:air");

	const item = new ItemStack(ITEM, 1);
	item.setDynamicProperty(STRUCTURE_PROPERTY, id);
	item.setLore(["§r§7Place it to put the spawner back."]);
	dimension.spawnItem(item, { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 });
	dimension.playSound("dig.stone", location);

	if (player.isValid) damageTool(player, slot);
}

function isSilkTouchPickaxe(itemStack) {
	if (!itemStack?.hasTag("minecraft:is_pickaxe")) return false;
	try {
		return itemStack.getComponent("minecraft:enchantable")?.hasEnchantment("silk_touch") ?? false;
	} catch {
		return false;
	}
}

// Uses up one point of durability, the same as mining any other block,
// including Unbreaking's chance to skip it.
function damageTool(player, slot) {
	if (player.getGameMode() === GameMode.Creative) return;
	const container = player.getComponent("minecraft:inventory")?.container;
	const tool = container?.getItem(slot);
	const durability = tool?.getComponent("minecraft:durability");
	if (!durability) return;

	const unbreaking = tool.getComponent("minecraft:enchantable")?.getEnchantment("unbreaking")?.level ?? 0;
	if (Math.random() >= 1 / (unbreaking + 1)) return;

	if (durability.damage + 1 > durability.maxDurability) {
		container.setItem(slot, undefined);
		player.playSound("random.break");
		return;
	}
	durability.damage += 1;
	container.setItem(slot, tool);
}

function newStructureId() {
	const time = Date.now().toString(36);
	const random = Math.floor(Math.random() * 0xffffff).toString(36);
	return `coberto_sts:spawner_${time}_${random}`;
}

// ---- Placing -------------------------------------------------------------

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
	const { itemStack, player, block, blockFace } = event;
	if (itemStack?.typeId !== ITEM) return;

	event.cancel = true; // stop the held item from also opening chests, doors, etc.
	if (!event.isFirstEvent) return; // holding the button down repeats the event

	const id = itemStack.getDynamicProperty(STRUCTURE_PROPERTY);
	const offset = FACE_OFFSETS[blockFace];
	const location = { x: block.x + offset.x, y: block.y + offset.y, z: block.z + offset.z };
	const dimension = block.dimension;
	const slot = player.selectedSlotIndex;
	system.run(() => place(player, dimension, location, id, slot));
});

function place(player, dimension, location, id, slot) {
	if (!player.isValid) return;
	const gameMode = player.getGameMode();
	if (gameMode === GameMode.Adventure || gameMode === GameMode.Spectator) return;

	let target;
	try {
		target = dimension.getBlock(location);
	} catch {
		return; // outside the world's height limits
	}
	if (!target || !(target.isAir || target.isLiquid)) return; // something's in the way
	if (isPlayerInside(dimension, location)) return;

	if (typeof id !== "string" || !world.structureManager.get(id)) {
		player.sendMessage("§cThis spawner's saved data is missing, so it can't be placed.");
		return;
	}

	try {
		world.structureManager.place(id, dimension, location);
	} catch (e) {
		console.warn(`[Silk Touch Spawners] Couldn't place the spawner: ${e}`);
		player.sendMessage("§cThe spawner couldn't be placed here.");
		return;
	}
	dimension.playSound("dig.stone", location);

	// In Creative the item isn't used up, so keep its saved copy too.
	if (gameMode === GameMode.Creative) return;

	world.structureManager.delete(id);
	const container = player.getComponent("minecraft:inventory")?.container;
	const held = container?.getItem(slot);
	if (held?.typeId === ITEM && held.getDynamicProperty(STRUCTURE_PROPERTY) === id) {
		container.setItem(slot, undefined);
	}
}

// Stops a spawner from being placed inside a player (feet or head height).
function isPlayerInside(dimension, location) {
	return dimension.getPlayers().some((p) => {
		const { x, y, z } = p.location;
		return (
			Math.floor(x) === location.x &&
			Math.floor(z) === location.z &&
			(Math.floor(y) === location.y || Math.floor(y + 1) === location.y)
		);
	});
}
