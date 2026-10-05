# Amberstar on the Ambermoon engine

Goal: play Amberstar (1992) with the engine, controls, user interface and graphics style of the Ambermoon
port (`src/ambermoon`, a port of Ambermoon.net). The Ambermoon engine works on an `IGameData` object; we build
one whose **world** comes from the Amberstar data and whose **engine assets** (layouts, buttons, UI graphics,
fonts, cursors, combat effect graphics, automap graphics, texts of the UI) come from the Ambermoon data.

- Amberstar data: `data/Amberstar/` (Amiga English 1.96 files + `_new/` with the fresh new-game files),
  loaded with the existing Amberstar loaders: `amberstar/src/data/assets.js` (`AssetProvider`, read it - maps,
  tilesets, lab blocks, lab data, characters, monsters, items, texts, places, palettes, graphics are all there).
  Format docs: `../Amberstar-main/FileSpecs/*.md`, C# reference: `../Amber-main/` (Amberstar.* projects).
- Ambermoon data: `data/Ambermoon/`, loaded with `src/ambermoon/Ambermoon.Data.Legacy/GameData.js`.
- Entry point: `src/amberstar/AmberstarGameData.js` → `createAmberstarGameData(ambermoonGameData, amberstarFiles)`.
  It creates a context `ctx` and runs the converters in `src/amberstar/convert/` in this order:
  `graphics2D`, `maps2D`, `labyrinths`, `characters`, `music`. Each exports `convert(ctx)`.
  The resulting game data is `Object.create(ambermoonGameData)` with the converted parts replacing the Ambermoon parts.
- Shared helpers: `src/amberstar/common.js` (palette conversion, graphic conversion, color remapping, compound graphics).
- Code style and C#-port conventions: see `PORTING.md` (member names of the Ambermoon classes are the C# names).

## The context (`ctx`)

| member | meaning |
|---|---|
| `ctx.source` | Amberstar `AssetProvider` |
| `ctx.base` | loaded Ambermoon `GameData` |
| `ctx.baseProvider` | Ambermoon `GraphicProvider` |
| `ctx.palettes` | `PaletteRegistry`: `addAmberstar(colors, id)` returns the palette key. `Map.PaletteIndex` = key, sprites use key - 1. Use ids `tileset<N>`, `labdata<N>`, `80x80<N>`, ... so palettes are shared. |
| `ctx.uiPalette` | Ambermoon primary UI palette graphic (32 colors) - the palette used for portraits, items and the whole UI |
| `ctx.graphics` | `Map<GraphicType, Graphic[]>` - graphic lists replacing the Ambermoon ones (only set the types you convert) |
| `ctx.result` | outputs, see `createContext` in `AmberstarGameData.js` |

## Index conventions (all converters rely on these)

- **Maps**: Amberstar map `i` → Ambermoon `Map` with `Index = i` in `ctx.result.maps`. World maps are Amberstar 1..64
  (8x8 grid of 50x50 maps, wrapping): `Flags` include `WorldSurface | StationaryGraphics | Outdoor`, `World = World.Lyramion`,
  `WorldMapDimensionOverride = 8`, `BaseWorldMapIndexOverride = 1`. Every map gets `NameOverride` = the Amberstar map name
  (Map.Name would otherwise give "Lyramion065" for maps < 256). The map title text should also be `Texts[0]`... no: Ambermoon
  uses `Texts[0]` as title for maps >= 256 only; keep Amberstar map texts in their original order in `Texts`
  and use `NameOverride` for the title.
- **Tilesets**: Amberstar tileset `n` (1, 2) → `ctx.result.tilesets[n - 1]` with `Index = n`, graphics in
  `ctx.graphics.set(GraphicType.Tileset1 + n - 1, [...])`, palette id `tileset<n>`. 2D maps: `TilesetOrLabdataIndex = n`.
- **Labdata**: Amberstar lab data `n` → `ctx.result.labdata[n - 1]` with `Index = n`, palette id `labdata<n>`.
  3D maps: `TilesetOrLabdataIndex = n`.
- **Characters**: Amberstar `CHARDATA.AMB` index `i` keeps its number: party members `GetInitialPartyMember(i)`,
  NPCs `GetNPC(i)`, monsters `GetMonster(i)`. Monster groups: Amberstar `MON_DATA.AMB` group `g` → `GetMonsterGroup(g)`.
  Map character references (`Map.CharacterReferences[k].Index`) use these numbers.
- **Items**: Amberstar item index keeps its number (`ItemManager.GetItem(i)`), chests `i`, places `i` keep theirs.
- **Songs**: Amberstar song `s` (1..19) → `Map.MusicIndex = s`, `SongManager.GetSong(s)`.
- **Texts**: Amberstar text formatting must be converted to Ambermoon text formatting (`Text.js`/`TextProcessor` in
  Ambermoon.Data.Legacy explain the codes: `^` new line etc.).
- Anything Amberstar does not have (e.g. Ambermoon-only transport types) is simply not used.

## Converters and their outputs

1. `graphics2D.js` — tilesets (`Tileset` objects with tiles, flags, animation frames, minimap colors), tileset graphics,
   player graphics (`GraphicType.Player`: exactly 3*17 frames of 16x32, see TextureAtlasManager.AddAll), travel graphics
   (`GraphicType.TravelGfx`: 11*4), transports (`GraphicType.Transports`: 5), NPC graphics (`GraphicType.NPC`, plus
   `ctx.result.npcGraphicOffsets` / `npcGraphicFrameCounts` - one NPC graphic set per tileset is a good choice:
   `Map.NPCGfxIndex` selects it), `stationaryImageInfos`, `travelGraphicInfo`, `playerAnimationInfo`.
   Amberstar uses 16x16 icons from the tileset for the party and map characters; put them bottom aligned into 16x32 frames.
2. `maps2D.js` — all 2D maps (tiles, character references, goto points, flags, palette, music, world map settings)
   and **events for all maps** (`convertEvents(ctx, amberstarMap, ambermoonMap)` exported for the 3D converter):
   Amberstar event types → Ambermoon `Event` subclasses (`Ambermoon.Data.Common/Event.js`), map texts → `Map.Texts`.
3. `labyrinths.js` — `Labdata` for every Amberstar lab data (wall textures, objects/billboards, floor/ceiling,
   built from the pre-rendered Amberstar lab blocks: extract the front view of each block as a texture), all 3D maps
   (`Map.Blocks`), lab backgrounds (`GraphicType.LabBackground`), sky/light handling, combat backgrounds
   (`GraphicType.CombatBackground`, `ctx.result.combatBackgrounds2D/3D`).
4. `characters.js` — `CharacterManager` (party members, NPCs, monsters with combat graphics, monster groups),
   `ItemManager`, `Places`, chests/merchants (initial savegame data), portraits (`GraphicType.Portrait`), item graphics
   (`GraphicType.Item`), 80x80 pictures and event pictures (`GraphicType.Pics80x80`, `GraphicType.EventPictures`),
   `dataNameProvider` overrides (class, race, spell names...), the initial savegame and `savegameManager`
   (implements ISavegameManager: LoadInitial, Load, Save, GetSavegameNames, ... using browser storage).
5. `music.js` — `songManager` playing the Amberstar COSO songs (player in `amberstar/src/audio/hippelCoso.js` +
   `paula.js`) through the Ambermoon `IAudioOutput` (see `src/ambermoon/Ambermoon.Data.Legacy/Audio/Song.js` for the
   ISong/IAudioStream shapes), mapping the Ambermoon `Song` enum values the engine requests (battle, ...) to Amberstar songs.

## Testing

`node tools/test-amberstar.mjs` builds the game data in Node (no rendering) and prints statistics.
The browser page `amberstar-am.html` runs it (`?map=65&x=..&y=..` for direct start).
