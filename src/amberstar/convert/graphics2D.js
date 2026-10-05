// Converter 1 (see AMBERSTAR.md): Amberstar 2D graphics -> Ambermoon.
//
// Inputs:  ICON_DAT.AMB (tilesets 1 = world, 2 = indoor) via ctx.source.loadTileset(n), MAP_DATA.AMB (only to find out
//          with which map types a tileset is used).
// Outputs:
//  - ctx.result.tilesets[n - 1]                      Ambermoon Tileset (Index n) with 250 tiles each
//  - ctx.graphics[GraphicType.Tileset1 + n - 1]       the 16x16 tile graphics (Tile.GraphicIndex = Amberstar image index,
//                                                     which is 1-based like Ambermoon's: RenderMap2D uses GraphicIndex - 1)
//  - palettes 'tileset<n>' (ctx.palettes)            32 colors: the 16 Amberstar colors + extra slots (see palettePlan.js).
//                                                     Map.PaletteIndex of 2D maps must be tilesetPaletteIndex(ctx, n).
//  - ctx.graphics[GraphicType.Player]                 3 * 17 frames of 16x32 (built from the indoor party sprite)
//  - ctx.graphics[GraphicType.TravelGfx]              11 * 4 frames (world map travel icons), ctx.result.travelGraphicInfo
//  - ctx.graphics[GraphicType.Transports]             5 stationary transports, ctx.result.stationaryImageInfos
//  - ctx.graphics[GraphicType.NPC]                    one NPC graphic set per tileset (Map.NPCGfxIndex = tileset index)
//                                                     with one (animated) 16x32 graphic per tile, see npcGraphicIndexForIcon
//  - ctx.result.npcGraphicOffsets / npcGraphicFrameCounts / playerAnimationInfo
import { Tileset } from '../../ambermoon/Ambermoon.Data.Common/Tileset.js';
import { GraphicType } from '../../ambermoon/Ambermoon.Data.Common/IGraphicProvider.js';
import { GraphicInfo, GraphicFormat } from '../../ambermoon/Ambermoon.Data.Common/Graphic.js';
import { TravelType } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/TravelType.js';
import { TravelGraphicInfo } from '../../ambermoon/Ambermoon.Data.Common/TravelGraphicInfo.js';
import { Character2DAnimationInfo } from '../../ambermoon/Ambermoon.Data.Common/Render/Character2DAnimationInfo.js';
import { CharacterDirection } from '../../ambermoon/Ambermoon.Common/Direction.js';
import { toAmbermoonGraphic, emptyGraphic, placeGraphic, compoundGraphic } from '../common.js';
import {
	PalettePlan, ColorIndexMapping, allocateSharedSlot, unmappedHighSlots, planMinimapColors,
	ColorIndexOffsetNonWorld2D, ColorIndexOffsetWorld2D,
} from './graphics2D/palettePlan.js';

export const TilesetCount = 2;
export const TilesPerTileset = 250;

// ---- Amberstar tile flags (see ../Amberstar-main/FileSpecs/TileFlags.md) ----
export const AmberstarTileFlags = Object.freeze({
	WaveAnimation: 0x1,
	BlockSight: 0x2,
	Animated: 0x4, // animation is given by the frame count anyway
	Seat: 0x8, // chair or bed: while occupied the next tile is shown
	RandomAnimation: 0x10,
	UnderlayHasPriority: 0x20,
	Foreground: 0x40,
	BlockAllMovement: 0x80,
	AllowWalk: 0x100,
	AllowHorse: 0x200,
	AllowRaft: 0x400,
	AllowShip: 0x800,
	AllowDisc: 0x1000,
	AllowEagle: 0x2000,
	AllowSwim: 0x4000,
	PartyInvisible: 0x8000,
	FirstCombatBackground: 0x10000, // bits 16..29: combat background 1..14 (COM_BACK.AMB)
	Poison: 0x80000000,
});

const AmberstarTravelType = Object.freeze({ Walk: 0, Horse: 1, Raft: 2, Ship: 3, MagicDisc: 4, Eagle: 5, SuperChicken: 6 });

/** Amberstar travel type -> Ambermoon TravelType. The super chicken (cheat) is a flying caped hero like Ambermoon's Fly. */
export const TravelTypeFromAmberstar = Object.freeze([
	TravelType.Walk, TravelType.Horse, TravelType.Raft, TravelType.Ship, TravelType.MagicalDisc, TravelType.Eagle, TravelType.Fly,
]);

const SitSleep = Object.freeze({ None: 0, SitUp: 1, SitRight: 2, SitDown: 3, SitLeft: 4, Sleep: 5 });

/**
 * Seat tiles (Amberstar flag 0x8) -> Ambermoon sit/sleep value. The direction can not be derived from the data,
 * it was taken from the graphics (the occupied variant is always the next tile). Unknown seats default to SitDown.
 */
const SeatTypes = new Map([
	[2, new Map([[84, SitSleep.SitDown], [86, SitSleep.SitUp], [88, SitSleep.SitRight], [90, SitSleep.SitLeft], [147, SitSleep.Sleep]])],
]);

function seatType(tilesetIndex, tileIndex) {
	return SeatTypes.get(tilesetIndex)?.get(tileIndex) ?? SitSleep.SitDown;
}

/** Amberstar combat background number (1..14) of tile flags or 0 if none is given. */
export function amberstarCombatBackground(flags) {
	for (let i = 0; i < 14; i++)
		if (flags & (AmberstarTileFlags.FirstCombatBackground << i))
			return i + 1;
	return 0;
}

/**
 * Ambermoon combat background index (Tile.CombatBackgroundIndex, 0..15) for Amberstar tile flags.
 * Convention for the combat background converter (labyrinths.js): index = Amberstar COM_BACK.AMB number - 1,
 * i.e. 0 outdoors, 1 forest, 2 desert, 3 swamp, 4 sea, 5 mountain, 6 river, 7 town, 8 tower/tunnel/cellar,
 * 9 temple of Sansri, 10 sewers, 11 graveyard, 12 villa, 13 bridge. Tiles without a combat bit use 0.
 */
export function combatBackgroundIndexFromFlags(flags) {
	return Math.max(0, amberstarCombatBackground(flags) - 1);
}

/**
 * Converts Amberstar tile flags to Ambermoon Tileset.TileFlags (plus sit/sleep and combat background bits).
 *  - wave/random animation, block sight, block all, underlay priority (= UseBackgroundTileFlags),
 *    foreground (= BringToFront) and the travel bits walk..eagle have the same bit positions.
 *  - Ambermoon's Background flag (0x4) is set for all tiles: in Amberstar overlays are drawn behind the party unless
 *    they have the foreground flag (BringToFront overrides Background in RenderMap2D) and Map.UpdateTile (change
 *    tile events) only puts a tile into the front layer if it has this flag; Amberstar always changes the overlay.
 *  - Amberstar's swim bit (0x4000, the water tiles which can be walked into) -> AllowMovementSwim + AllowMovementWalk
 *    (TileType.Water): on the world maps walking into such water makes the party swim (with swim damage).
 *  - The super chicken (cheat travel type) may fly everywhere (AllowMovementFly on all tiles).
 *  - Party invisible -> PlayerInvisible, poison -> AutoPoison.
 *  - Seats -> sit direction / sleep (bits 23..25), combat backgrounds -> bits 28..31.
 */
export function convertTileFlags(flags, sitSleep = SitSleep.None) {
	const F = Tileset.TileFlags;
	const A = AmberstarTileFlags;
	flags >>>= 0;
	let result = F.Background | F.AllowMovementFly;
	const copy = [
		[A.WaveAnimation, F.WaveAnimation], [A.BlockSight, F.BlockSight], [A.RandomAnimation, F.RandomAnimationStart],
		[A.UnderlayHasPriority, F.UseBackgroundTileFlags], [A.Foreground, F.BringToFront], [A.BlockAllMovement, F.BlockAllMovement],
		[A.AllowWalk, F.AllowMovementWalk], [A.AllowHorse, F.AllowMovementHorse], [A.AllowRaft, F.AllowMovementRaft],
		[A.AllowShip, F.AllowMovementShip], [A.AllowDisc, F.AllowMovementMagicalDisc], [A.AllowEagle, F.AllowMovementEagle],
		[A.AllowSwim, F.AllowMovementSwim], [A.PartyInvisible, F.PlayerInvisible], [A.Poison, F.AutoPoison],
	];
	for (const [from, to] of copy)
		if (flags & from)
			result |= to;
	// Swim tiles must also allow walking: Ambermoon only lets a walking party enter tiles which allow walking
	// (Player2D.Move). Tiles which allow walking and swimming are TileType.Water (Map.TileTypeFromTile) and on the
	// world maps the party starts swimming there (GameCore.PlayerMoved -> StartSwimming).
	if (flags & A.AllowSwim)
		result |= F.AllowMovementWalk;
	// Amberstar replaces an occupied seat/bed by the next tile (person on the chair/in the bed), Ambermoon draws the
	// sitting/sleeping character sprite (the occupied tile, see createPlayerFrames) over the seat tile. A foreground
	// seat tile would hide that sprite (e.g. sleeping NPCs in the beds of the taverns), so seats are no foreground.
	if (sitSleep !== SitSleep.None)
		result &= ~F.BringToFront;
	result |= (sitSleep & 0x7) << 23;
	result |= combatBackgroundIndexFromFlags(flags) << 28;
	return result >>> 0;
}

// ---- helpers for the other converters ----

/** Palette key (Map.PaletteIndex) of a tileset. Only valid after convert(). */
export function tilesetPaletteIndex(ctx, tilesetIndex) {
	return ctx.palettes.cache.get(`tileset${tilesetIndex}`);
}

/**
 * NPC graphic index (Map.CharacterReference.GraphicIndex) of an Amberstar map character with the given icon
 * (map character icon = 1-based tile index of the map's tileset). Use it with Map.NPCGfxIndex = tileset index and
 * without the UseTileset character flag: the NPC graphic set of a tileset has one graphic per tile, so the index
 * is simply icon - 1. The graphic is the (animated) tile image placed bottom aligned into 16x32 frames.
 * Alternative: CharacterFlags.UseTileset with GraphicIndex = icon draws the tile itself (16x16, 1 tile high).
 */
export function npcGraphicIndexForIcon(ctx, tilesetIndex, iconIndex) { // eslint-disable-line no-unused-vars
	return Math.max(0, iconIndex - 1);
}

// ---- conversion ----

function amberstarGraphic(tileset, imageIndex) {
	return tileset.graphics[imageIndex - 1] ?? { width: 16, height: 16, data: new Uint8Array(256) };
}

/** Frames of a tile (wave animations are baked as ping-pong because NPC animations are always cyclic). */
function tileFrames(tileset, tile, bakeWave) {
	const count = Math.max(1, tile.frameCount);
	const frames = Array.from({ length: count }, (_, f) => amberstarGraphic(tileset, tile.imageIndex + f));
	if (bakeWave && count > 2 && (tile.flags & AmberstarTileFlags.WaveAnimation))
		for (let f = count - 2; f > 0; f--)
			frames.push(frames[f]);
	return frames;
}

function remap(graphic, mapping) {
	graphic.Data = graphic.Data.map(c => mapping[c] ?? c);
	return graphic;
}

/** Which ColorIndexMapping offsets (world / non-world) are needed for each tileset. */
function tilesetMapUsage(source) {
	const usage = new Map();
	for (const key of source.keys('MAP_DATA.AMB')) {
		let map;
		try {
			map = source.loadMap(key);
		} catch {
			continue;
		}
		if (map.is3D)
			continue;
		const counts = usage.get(map.tileset) ?? new Map();
		// World maps (Amberstar maps 1..64, wilderness flag) become Ambermoon world maps (see AMBERSTAR.md).
		const offset = (map.flags & 0x20) ? ColorIndexOffsetWorld2D : ColorIndexOffsetNonWorld2D;
		counts.set(offset, (counts.get(offset) ?? 0) + 1);
		usage.set(map.tileset, counts);
	}
	return usage;
}

function createTileset(index, source, colorIndexMapping) {
	const tileset = new Tileset();
	tileset.Index = index;
	tileset.Tiles = source.tiles.map((tile, i) => {
		const t = new Tileset.Tile();
		t.GraphicIndex = tile.imageIndex;
		t.NumAnimationFrames = Math.max(1, tile.frameCount);
		t.ColorIndex = colorIndexMapping[tile.minimapColorIndex & 0xf];
		const sitSleep = (tile.flags & AmberstarTileFlags.Seat) ? seatType(index, i + 1) : SitSleep.None;
		t.Flags = convertTileFlags(tile.flags, sitSleep);
		return t;
	});
	return tileset;
}

/**
 * Player graphics: 17 frames per world (3 stand frames per direction up/right/down/left, 4 sit frames, 1 sleep frame).
 * Amberstar has one party icon per direction (no walk animation) and shows the occupied variant of a seat tile
 * (the next tile) while the party sits/sleeps. These occupied tiles become the sit/sleep frames: they are drawn
 * over the seat tile at the same position, so the result looks exactly like in Amberstar.
 */
function createPlayerFrames(partyTileset, partyTilesetIndex, mapping) {
	const partyTile = partyTileset.tiles[partyTileset.playerSpriteIndex - 1];
	const frame = graphic => remap(placeGraphic(graphic, 16, 32, 0, 16), mapping);
	const standFrames = [CharacterDirection.Up, CharacterDirection.Right, CharacterDirection.Down, CharacterDirection.Left]
		.map(direction => amberstarGraphic(partyTileset, partyTile.imageIndex + direction));
	const sit = new Map();
	partyTileset.tiles.forEach((tile, i) => {
		if (!(tile.flags & AmberstarTileFlags.Seat))
			return;
		const type = seatType(partyTilesetIndex, i + 1);
		const occupied = partyTileset.tiles[i + 1];
		if (occupied && !sit.has(type))
			sit.set(type, amberstarGraphic(partyTileset, occupied.imageIndex));
	});
	const frames = [];
	for (const graphic of standFrames)
		for (let f = 0; f < 3; f++)
			frames.push(frame(graphic));
	[SitSleep.SitUp, SitSleep.SitRight, SitSleep.SitDown, SitSleep.SitLeft].forEach((type, direction) =>
		frames.push(frame(sit.get(type) ?? standFrames[direction])));
	frames.push(frame(sit.get(SitSleep.Sleep) ?? standFrames[CharacterDirection.Down]));
	// 3 worlds (Lyramion, forest moon, Morag): all maps use Lyramion but the engine expects all 3 sets.
	return [...frames, ...frames, ...frames];
}

/** Collects the colors used by the player frames (before remapping). */
function playerColors(partyTileset, partyTilesetIndex) {
	const colors = new Set();
	for (const graphic of createPlayerFrames(partyTileset, partyTilesetIndex, []).slice(0, 17))
		graphic.Data.forEach(c => colors.add(c));
	colors.delete(0);
	return [...colors].sort((a, b) => a - b);
}

/**
 * Travel graphics: Amberstar's world tileset player sprite tile is followed by 4 direction icons for each Amberstar
 * travel type (walk, horse, raft, ship, magic disc, eagle, super chicken). They are 16x16 and drawn exactly on the
 * party tile (TravelGraphicInfo offset 16/16 = no draw offset, see GameCore.GetPlayerDrawOffset).
 * Ambermoon-only travel types: swim uses the walk icon sunk into the water, the others use the walk icons.
 */
function createTravelGraphics(worldTileset) {
	const base = worldTileset.tiles[worldTileset.playerSpriteIndex - 1].imageIndex;
	const icon = (amberstarTravelType, direction) => amberstarGraphic(worldTileset, base + amberstarTravelType * 4 + direction);
	const graphics = [];
	const infos = [];
	for (let type = 0; type <= TravelType.SandShip; type++) {
		const amberstarType = TravelTypeFromAmberstar.indexOf(type);
		for (let direction = 0; direction < 4; direction++) {
			let graphic;
			if (type === TravelType.Swim)
				graphic = placeGraphic(icon(AmberstarTravelType.Walk, direction), 16, 16, 0, 6); // only head and shoulders
			else
				graphic = toAmbermoonGraphic(icon(amberstarType < 0 ? AmberstarTravelType.Walk : amberstarType, direction));
			graphics.push(graphic);
			const info = new TravelGraphicInfo();
			info.Width = 16;
			info.Height = 16;
			info.OffsetX = 16;
			info.OffsetY = 16;
			infos.push(info);
		}
	}
	return { graphics, infos };
}

// Amberstar world tileset tiles used for parked transports (savegame transport types: horse, raft, ship).
const StationaryTransportTiles = new Map([
	[TravelType.Horse, 245], [TravelType.Raft, 246], [TravelType.Ship, 247],
	[TravelType.SandLizard, 245], [TravelType.SandShip, 247], // Ambermoon only, never used
]);
// RenderMap2D.PlaceTransport draws a stationary image at ((16 - W) / 2 - 2, (16 - H) / 2 - 2) relative to the
// tile. A 20x20 image with the 16x16 icon at (4, 4) puts the icon exactly onto the tile like in Amberstar.
const StationaryImageSize = 20;
const StationaryIconOffset = 4;

function createTransports(worldTileset) {
	const infos = new Map();
	const graphics = [];
	// Order must match TravelTypeExtensions.AsStationaryImageIndex (and the iteration order of the map).
	for (const type of [TravelType.Horse, TravelType.Raft, TravelType.Ship, TravelType.SandLizard, TravelType.SandShip]) {
		const info = new GraphicInfo();
		info.Width = StationaryImageSize;
		info.Height = StationaryImageSize;
		info.GraphicFormat = GraphicFormat.Palette5Bit;
		info.Alpha = true;
		infos.set(type, info);
		const tile = worldTileset.tiles[StationaryTransportTiles.get(type) - 1];
		graphics.push(placeGraphic(amberstarGraphic(worldTileset, tile.imageIndex), StationaryImageSize, StationaryImageSize,
			StationaryIconOffset, StationaryIconOffset));
	}
	return { infos, graphics };
}

/** One NPC graphic per tile: the tile frames bottom aligned in 16x32 frames (compound graphic, frames side by side). */
function createNPCGraphics(tileset) {
	const graphics = [];
	const frameCounts = [];
	for (const tile of tileset.tiles) {
		const frames = tileFrames(tileset, tile, true).map(g => placeGraphic(g, 16, 32, 0, 16));
		graphics.push(compoundGraphic(frames));
		frameCounts.push(frames.length);
	}
	return { graphics, frameCounts };
}

function createPlayerAnimationInfo() {
	// Same layout as Ambermoon (GameData.PlayerAnimationInfo).
	const info = new Character2DAnimationInfo();
	info.FrameWidth = 16;
	info.FrameHeight = 32;
	info.StandFrameIndex = 0;
	info.SitFrameIndex = 12;
	info.SleepFrameIndex = 16;
	info.NumStandFrames = 3;
	info.NumSitFrames = 1;
	info.NumSleepFrames = 1;
	info.TicksPerFrame = 0;
	info.NoDirections = false;
	info.IgnoreTileType = false;
	info.UseTopSprite = true;
	return info;
}

export function convert(ctx) {
	const source = ctx.source;
	const tilesets = [];
	for (let n = 1; n <= TilesetCount; n++)
		tilesets.push(source.loadTileset(n));
	const usage = tilesetMapUsage(source);

	// The party sprite of the indoor tileset is used for all non-world maps. Choose the tileset used by most
	// non-world 2D maps (Amberstar: tileset 2).
	const nonWorldCount = n => usage.get(n)?.get(ColorIndexOffsetNonWorld2D) ?? 0;
	const partyTilesetIndex = tilesets.map((_, i) => i + 1).sort((a, b) => nonWorldCount(b) - nonWorldCount(a))[0];
	const partyTileset = tilesets[partyTilesetIndex - 1];
	const worldTileset = tilesets[0];

	// ---- palettes ----
	// Each tile has only one ColorIndex, so the minimap colors can only be exact for one ColorIndexMapping offset
	// per tileset: the one of the map type which uses the tileset most (world maps for tileset 1). The minimap of
	// the few other maps (Amberstar maps 77, 91, 111, 120 are non-world maps with tileset 1) uses wrong colors.
	// Order: minimap of the world tileset (most constrained), then the party colors (shared slots), then the rest.
	const plans = tilesets.map(t => new PalettePlan(t.palette));
	const minimapOffset = tilesets.map((_, i) => {
		const counts = usage.get(i + 1) ?? new Map();
		return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ColorIndexOffsetNonWorld2D;
	});
	const colorIndexMappings = [];
	const planMinimap = i => {
		const minimapUsage = new Map();
		for (const tile of tilesets[i].tiles)
			minimapUsage.set(tile.minimapColorIndex & 0xf, (minimapUsage.get(tile.minimapColorIndex & 0xf) ?? 0) + 1);
		const { mapping, inexact } = planMinimapColors(plans[i], tilesets[i].palette, minimapUsage, [minimapOffset[i]]);
		if (inexact.length)
			ctx.log?.(`Amberstar tileset ${i + 1}: inexact minimap colors ${inexact.join(', ')}`);
		colorIndexMappings[i] = mapping;
	};
	const isWorld = i => minimapOffset[i] === ColorIndexOffsetWorld2D ? 1 : 0;
	const order = tilesets.map((_, i) => i).sort((a, b) => isWorld(b) - isWorld(a));
	planMinimap(order[0]);
	const playerMapping = Array.from({ length: 32 }, (_, i) => i);
	// Prefer slots the party tileset's minimap reaches (they hold colors of the party tileset palette, so its
	// minimap can reuse them), then slots no minimap color can reach.
	const partyOffset = minimapOffset[partyTilesetIndex - 1];
	// Colors which the party minimap can already reach through a low slot go to unreachable slots first.
	const partyReachable = ColorIndexMapping.slice(partyOffset, partyOffset + 16);
	const reachableSlots = partyReachable.filter(s => s >= 16);
	for (const c of playerColors(partyTileset, partyTilesetIndex)) {
		const color = partyTileset.palette[c];
		const reachableLow = partyReachable.some(s => s > 0 && s < 16 && plans[partyTilesetIndex - 1].holds(s, color));
		const preference = reachableLow ? [...unmappedHighSlots(minimapOffset), ...reachableSlots] : [...reachableSlots, ...unmappedHighSlots(minimapOffset)];
		const slot = allocateSharedSlot(plans, color, preference);
		if (slot != null)
			playerMapping[c] = slot;
		else
			ctx.log?.(`Amberstar party color ${c} has no shared palette slot`);
	}
	order.slice(1).forEach(planMinimap);
	tilesets.forEach((t, i) => ctx.palettes.addAmberstar(plans[i].colors(t.palette[0]), `tileset${i + 1}`));

	// ---- tilesets and tile graphics ----
	tilesets.forEach((t, i) => {
		ctx.result.tilesets[i] = createTileset(i + 1, t, colorIndexMappings[i]);
		ctx.graphics.set(GraphicType.Tileset1 + i, t.graphics.map(g => toAmbermoonGraphic(g)));
	});

	// ---- player ----
	ctx.graphics.set(GraphicType.Player, createPlayerFrames(partyTileset, partyTilesetIndex, playerMapping));
	ctx.result.playerAnimationInfo = createPlayerAnimationInfo();

	// ---- travel graphics and transports (only drawn on world maps -> world tileset colors) ----
	const travel = createTravelGraphics(worldTileset);
	ctx.graphics.set(GraphicType.TravelGfx, travel.graphics);
	ctx.result.travelGraphicInfo = (type, direction) => travel.infos[type * 4 + direction];
	const transports = createTransports(worldTileset);
	ctx.graphics.set(GraphicType.Transports, transports.graphics);
	ctx.result.stationaryImageInfos = transports.infos;

	// ---- NPC graphics: one set per tileset (key = tileset index = Map.NPCGfxIndex) ----
	const npcGraphics = [];
	ctx.result.npcGraphicOffsets = new Map();
	ctx.result.npcGraphicFrameCounts = new Map();
	tilesets.forEach((t, i) => {
		const { graphics, frameCounts } = createNPCGraphics(t);
		ctx.result.npcGraphicOffsets.set(i + 1, npcGraphics.length);
		ctx.result.npcGraphicFrameCounts.set(i + 1, frameCounts);
		npcGraphics.push(...graphics);
	});
	while (npcGraphics.length < 34) // TextureAtlasManager.AddAll requires at least 34
		npcGraphics.push(emptyGraphic(16, 32));
	ctx.graphics.set(GraphicType.NPC, npcGraphics);
}
