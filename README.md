# Silk Touch Spawners
**Minecraft Bedrock Silk Touch Spawners Add-On**

Mine a mob spawner with a **Silk Touch pickaxe** and it drops as a **Mob Spawner** item. Place it anywhere and you get the same spawner back: same mob, same settings.

No experimental toggles needed. It uses only stable Script API features (`@minecraft/server` 2.11.0).

## How it works
- **Picking up:** the spawner is saved as a one-block structure in the world, then removed. The item that drops remembers which saved structure it came from.
- **Placing:** using the item on a block places the saved structure on that side. In Survival the item and its saved copy are then removed. In Creative the item isn't used up, so you can place copies.
- Picking up costs the pickaxe one point of durability, and Unbreaking applies as normal.
- Spawners can't be placed inside a player, on top of a block that's in the way, or in Adventure mode.

## Limits
- The item doesn't show which mob is inside. The Script API can't read a spawner's mob.
- If a picked-up spawner item is destroyed (lava, despawning), its saved structure stays in the world file. Each one is tiny.
- Without Silk Touch, spawners break like vanilla.

## Install for testing
Copy `silk_touch_spawners_bp` into `com.mojang/development_behavior_packs` and `silk_touch_spawners_rp` into `com.mojang/development_resource_packs`, then turn on the behavior pack in the world (it brings the resource pack with it).

When new versions of Minecraft come out, this pack may need updating. Bump the `@minecraft/server` version and `min_engine_version` in the manifests.
