// Converter 2 (see ../../../AMBERSTAR.md): all Amberstar 2D maps -> Ambermoon Map objects in ctx.result.maps,
// plus the event conversion for all maps (convertEvents, also used by the 3D converter).
//
// Amberstar map data: amberstar/src/data/maps.js (loadMap), FileSpecs/Maps.md.
// Ambermoon map data: src/ambermoon/Ambermoon.Data.Common/Map.js (read by MapReader.js).
import { Map as AmbermoonMap, MapFlags } from '../../ambermoon/Ambermoon.Data.Common/Map.js';
import { MapType } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/MapType.js';
import { CharacterType } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/CharacterType.js';
import { World } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/World.js';
import { TravelType } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/TravelType.js';
import { EventType, TeleportEvent } from '../../ambermoon/Ambermoon.Data.Common/Event.js';
import { Position } from '../../ambermoon/Ambermoon.Common/Position.js';
import { newArray2D } from '../../runtime.js';
import * as Graphics2D from './graphics2D.js';
import { convertEvents } from './maps2D/events.js';
import { convertMapTexts } from './maps2D/texts.js';

export {
	convertEvents, usedEventIds, getDoorIndex, ambermoonPlaceType, AmberstarEventType,
	AmberstarQuestBitGlobalVariableOffset, MaxEventListEntries,
} from './maps2D/events.js';
export { convertAmberstarText, convertMapTexts, convertMessage, sanitizeAmbermoonText } from './maps2D/texts.js';

/** Amberstar map flags (FileSpecs/Maps.md, amberstar/src/data/enums.js MapFlags) */
export const AmberstarMapFlags = Object.freeze({
	Light: 0x01, LightChange: 0x02, Darkness: 0x04, CanUseMapViewSpell: 0x08,
	CanCamp: 0x10, Wilderness: 0x20, City: 0x40, Dungeon: 0x80,
});

/** Amberstar map character (amberstar/src/data/enums.js) */
const AmberstarCharacterType = Object.freeze({ Person: 0, Monster: 1, Popup: 2 });
const AmberstarWalkType = Object.freeze({ Stationary: 0, Random: 1, Path: 2, Chase: 3 });

/** World maps: Amberstar maps 1..64 form an 8x8 grid of 50x50 maps (wrapping). */
export const FirstWorldMapIndex = 1;
export const WorldMapDimension = 8;
export const LastWorldMapIndex = FirstWorldMapIndex + WorldMapDimension * WorldMapDimension - 1;

export function isWorldMap(mapIndex) {
	return mapIndex >= FirstWorldMapIndex && mapIndex <= LastWorldMapIndex;
}

/**
 * Amberstar map flags -> Ambermoon MapFlags (used for 2D and 3D maps).
 *  Light (always light)      -> Indoor (full light)
 *  LightChange (sunlight)    -> Outdoor (light by daytime)
 *  Darkness (own light only) -> Dungeon
 *  CanUseMapViewSpell        -> Automapper (allows the map related spells)
 *  CanCamp                   -> CanRest
 *  City on a 3D map          -> Sky (Ambermoon towns show the sky)
 *  Amberstar has no "no magic" maps -> CanUseMagic is always set.
 *  World maps (1..64): WorldSurface | StationaryGraphics (transports, travel music, small player).
 */
export function convertMapFlags(amberstarMap) {
	const f = amberstarMap.flags;
	let flags = MapFlags.CanUseMagic;
	if (f & AmberstarMapFlags.Light)
		flags |= MapFlags.Indoor;
	else if (f & AmberstarMapFlags.LightChange)
		flags |= MapFlags.Outdoor;
	else if (f & AmberstarMapFlags.Darkness)
		flags |= MapFlags.Dungeon;
	else
		flags |= MapFlags.Indoor;
	if (f & AmberstarMapFlags.CanUseMapViewSpell)
		flags |= MapFlags.Automapper;
	if (f & AmberstarMapFlags.CanCamp)
		flags |= MapFlags.CanRest;
	if (amberstarMap.is3D && (f & AmberstarMapFlags.City))
		flags |= MapFlags.Sky;
	if (!amberstarMap.is3D && isWorldMap(amberstarMap.index))
		flags |= MapFlags.WorldSurface | MapFlags.StationaryGraphics | MapFlags.Outdoor;
	return flags;
}

function ambermoonTileset(ctx, tilesetIndex) {
	return ctx.result.tilesets?.[tilesetIndex - 1] ?? null;
}

function tileTypeOf(tile, tileset) {
	if (!tileset?.Tiles)
		return AmbermoonMap.TileType.Normal;
	const index = tile.FrontTileIndex === 0 ? tile.BackTileIndex : tile.FrontTileIndex;
	if (index === 0 || !tileset.Tiles[index - 1] || (tile.BackTileIndex !== 0 && !tileset.Tiles[tile.BackTileIndex - 1]))
		return AmbermoonMap.TileType.Normal;
	try {
		return AmbermoonMap.TileTypeFromTile(tile, tileset);
	} catch {
		return AmbermoonMap.TileType.Normal;
	}
}

/**
 * NPC graphic for a tileset icon (graphics2D converter). Falls back to null if graphics2D does not
 * provide npcGraphicIndexForIcon (then the tileset icon is used directly, flag UseTileset).
 */
function npcGraphicIndex(ctx, tilesetIndex, iconIndex) {
	const provider = Graphics2D.npcGraphicIndexForIcon;
	if (typeof provider !== 'function')
		return null;
	try {
		return provider(ctx, tilesetIndex, iconIndex) ?? null;
	} catch (e) {
		console.warn(`Amberstar: npcGraphicIndexForIcon(${tilesetIndex}, ${iconIndex}) failed: ${e.message}`);
		return null;
	}
}

/**
 * Converts the 24 Amberstar map characters into Ambermoon CharacterReferences (up to 32, compacted:
 * the engine stops at the first null entry). `ambermoonMap.AmberstarCharacterSlots[i]` gives the
 * Amberstar character slot (0-based) of CharacterReferences[i] (for the character bits of savegames).
 *
 *  Person -> PartyMember (if the person can join) or NPC, Index = CHARDATA index
 *  Monster -> Monster, Index = MON_DATA monster group index
 *  Popup  -> NPC with flag TextPopup, Index = 0-based map text index (Amberstar stores text + 1)
 *  Walk types: Random -> RandomMovement, Path -> 288 positions (one per 5 minutes like Ambermoon),
 *  Chase -> Ambermoon monster default (chases when it sees the party), Stationary monster -> no flag
 *  (Ambermoon has no non-moving monster, `AmberstarStationary` is set for an engine extension).
 *  Positions are 1-based in both games.
 *
 * options.graphicIndex(character, slot) can override the graphic (3D maps: labdata object index).
 */
export function convertCharacterReferences(ctx, amberstarMap, ambermoonMap, options = {}) {
	const Flags = AmbermoonMap.CharacterReference.Flags;
	const refs = new Array(32).fill(null);
	const slots = [];
	const tilesetIndex = amberstarMap.tileset;
	const tileset = amberstarMap.is3D ? null : ambermoonTileset(ctx, tilesetIndex);
	let next = 0;

	amberstarMap.characters.forEach((c, slot) => {
		if (c.index === 0 || next >= 32)
			return;
		const ref = new AmbermoonMap.CharacterReference();
		let flags = Flags.None;

		switch (c.type) {
			case AmberstarCharacterType.Monster:
				ref.Type = CharacterType.Monster;
				ref.Index = c.index;
				if (c.walkType === AmberstarWalkType.Stationary)
					ref.AmberstarStationary = true;
				else // Hunting monsters: Ambermoon 3D monsters only move (and chase the party) with RandomMovement
					flags |= Flags.RandomMovement; // (Character3D.Update), 2D monsters chase anyway and roam with it.
				break;
			case AmberstarCharacterType.Popup:
				ref.Type = CharacterType.NPC;
				ref.Index = c.index - 1;
				flags |= Flags.TextPopup;
				break;
			default: {
				let isPartyMember = false;
				try {
					isPartyMember = !!ctx.source.loadPerson(c.index)?.isPartyMember;
				} catch {
					// unknown person -> NPC
				}
				ref.Type = isPartyMember ? CharacterType.PartyMember : CharacterType.NPC;
				ref.Index = c.index;
				break;
			}
		}

		if (c.type !== AmberstarCharacterType.Monster && c.walkType === AmberstarWalkType.Random)
			flags |= Flags.RandomMovement;

		ref.CollisionClass = c.travelType;
		ref.EventIndex = 0;

		const positions = amberstarMap.characterPositions[slot] ?? [];
		const moving = c.type !== AmberstarCharacterType.Monster && c.walkType === AmberstarWalkType.Path;
		if (moving && positions.length >= 288)
			ref.Positions = positions.slice(0, 288).map(p => new Position(p.x, p.y));
		else
			ref.Positions = [new Position(positions[0]?.x ?? 0, positions[0]?.y ?? 0)];

		// Graphic
		let graphicIndex = options.graphicIndex ? options.graphicIndex(c, slot) : null;
		if (graphicIndex == null && !amberstarMap.is3D)
			graphicIndex = npcGraphicIndex(ctx, tilesetIndex, c.icon);
		if (graphicIndex == null && !amberstarMap.is3D) {
			// Fallback: draw the tileset icon itself (16x16, like Ambermoon map objects)
			flags |= Flags.UseTileset;
			graphicIndex = c.icon;
		}
		ref.GraphicIndex = graphicIndex ?? 0;

		// Combat background / tile flags: from the tile the character starts on (like 2D battle events).
		let combatBackground = 0;
		let tileFlags = 0;
		if (tileset?.Tiles) {
			const p = ref.Positions[0];
			if (p.X > 0 && p.Y > 0 && p.X <= amberstarMap.width && p.Y <= amberstarMap.height) {
				const t = amberstarMap.tiles[(p.X - 1) + (p.Y - 1) * amberstarMap.width];
				const tilesetTile = tileset.Tiles[(t.underlay || t.overlay) - 1];
				combatBackground = tilesetTile?.CombatBackgroundIndex ?? 0;
			}
			if ((flags & Flags.UseTileset) !== 0) {
				// map objects use the animation flags of their tile
				tileFlags = (tileset.Tiles[c.icon - 1]?.Flags ?? 0) & 0x0fffffff;
			}
		}
		ref.CombatBackgroundIndex = combatBackground;
		ref.TileFlags = (tileFlags | ((combatBackground & 0xf) << 28)) >>> 0;
		ref.CharacterFlags = flags;

		// Amberstar persons can be restricted to a day of a month. Ambermoon has no such feature;
		// the values are kept for a possible engine extension.
		if (c.day !== 0xff && c.month !== 0xff) {
			ref.AmberstarSpawnDay = c.day;
			ref.AmberstarSpawnMonth = c.month;
		}

		refs[next++] = ref;
		slots.push(slot);
	});

	ambermoonMap.CharacterReferences = refs;
	ambermoonMap.AmberstarCharacterSlots = slots;
	return refs;
}

/** Converts one Amberstar 2D map (without events). */
export function convertMap2D(ctx, amberstarMap) {
	const a = amberstarMap;
	const map = new AmbermoonMap();
	const world = isWorldMap(a.index);

	map.Index = a.index;
	map.Type = MapType.Map2D;
	map.Flags = convertMapFlags(a);
	map.MusicIndex = a.songIndex; // 0 = keep current song / travel music on world maps
	map.Width = a.width;
	map.Height = a.height;
	map.TilesetOrLabdataIndex = a.tileset;
	map.NPCGfxIndex = a.tileset; // one NPC graphic set per tileset (graphics2D)
	map.LabyrinthBackgroundIndex = world ? 1 : 0; // like the Ambermoon Lyramion world maps
	map.World = World.Lyramion;
	map.NameOverride = a.name;

	if (world) {
		map.WorldMapDimensionOverride = WorldMapDimension;
		map.BaseWorldMapIndexOverride = FirstWorldMapIndex;
	}

	const tilesetData = ctx.source.loadTileset(a.tileset);
	map.PaletteIndex = ctx.palettes.addAmberstar(tilesetData.palette, `tileset${a.tileset}`);

	// Tiles: Amberstar underlay = Ambermoon back layer, overlay = front layer (both 1-based, 0 = none)
	const tileset = ambermoonTileset(ctx, a.tileset);
	map.Tiles = newArray2D(a.width, a.height);
	map.InitialTiles = newArray2D(a.width, a.height);
	map.Blocks = null;
	map.InitialBlocks = null;
	for (let y = 0; y < a.height; y++) {
		for (let x = 0; x < a.width; x++) {
			const source = a.tiles[x + y * a.width];
			const tile = new AmbermoonMap.Tile();
			tile.BackTileIndex = source.underlay;
			tile.FrontTileIndex = source.overlay;
			tile.MapEventId = 0;
			tile.Type = tileTypeOf(tile, tileset);
			map.Tiles[x][y] = tile;
			map.InitialTiles[x][y] = tile.Clone();
		}
	}

	map.Texts = convertMapTexts(ctx, a.index);
	map.GotoPoints = []; // Amberstar has no goto points
	convertCharacterReferences(ctx, a, map);
	return map;
}

/**
 * Amberstar lets the party enter tiles with exit, teleporter, trapdoor, door and place events even if the
 * tile itself blocks movement (Map2DScreen.tileBlocksMovement). Ambermoon only triggers its "special"
 * events when the tile can be entered (Player2D.Move). Such tiles get a tile type which allows movement
 * (Tile.AllowMovement returns true for chair/bed types). The player never stands on them because the
 * special event is executed instead of the move (and map characters avoid these tiles).
 */
function makeEventTilesEnterable(ctx, map) {
	const tileset = ambermoonTileset(ctx, map.TilesetOrLabdataIndex);
	if (!tileset?.Tiles)
		return;
	for (let x = 0; x < map.Width; x++) {
		for (let y = 0; y < map.Height; y++) {
			const tile = map.Tiles[x][y];
			if (tile.MapEventId === 0 || tile.Type !== AmbermoonMap.TileType.Normal && tile.Type !== AmbermoonMap.TileType.Water)
				continue;
			// Note: Doors and one-time events (save action) are excluded as the player could stand on the tile
			// after the event was deactivated (and would be drawn sitting).
			let event = map.EventList[tile.MapEventId - 1];
			while (event && (event.Type === EventType.Condition || event.Type === EventType.MapText || event.Type === EventType.Trap))
				event = event.Next;
			const special = event != null && (event.Type === EventType.EnterPlace ||
				(event.Type === EventType.Teleport && event.Transition !== TeleportEvent.TransitionType.WindGate));
			if (!special)
				continue;
			let blocked;
			try {
				blocked = !tile.AllowMovement(tileset, TravelType.Walk);
			} catch {
				blocked = false;
			}
			if (blocked) {
				tile.Type = AmbermoonMap.TileType.ChairUp;
				map.InitialTiles[x][y].Type = tile.Type;
			}
		}
	}
}

export function convert(ctx) {
	const keys = ctx.source.keys('MAP_DATA.AMB').slice().sort((x, y) => x - y);
	let count = 0;
	for (const key of keys) {
		const amberstarMap = ctx.source.loadMap(key);
		if (amberstarMap.is3D)
			continue;
		const map = convertMap2D(ctx, amberstarMap);
		convertEvents(ctx, amberstarMap, map);
		makeEventTilesEnterable(ctx, map);
		ctx.result.maps.set(map.Index, map);
		count++;
	}
	return count;
}
