// Converter 3 (see ../../../AMBERSTAR.md): Amberstar labyrinths -> Ambermoon textured 3D.
//
//  - every Amberstar lab data (LAB_DATA.AMB, palette, floor/ceiling backgrounds and the lab blocks of LABBLOCK.AMB)
//    -> an Ambermoon Labdata (ctx.result.labdata[n - 1], Index = n, palette id `labdata<n>`)
//  - all Amberstar 3D maps -> Ambermoon 3D maps (ctx.result.maps, Index = Amberstar map index)
//  - outdoor horizon graphics (GraphicType.LabBackground), sky gradients and daylight (ctx.result.lightEffectProvider)
//  - combat backgrounds (GraphicType.CombatBackground, ctx.result.combatBackgrounds2D/3D), see labyrinths/combat.js
//
// Amberstar 3D maps consist of lab tiles (per map: flags, primary lab block, secondary lab block, automap color).
// The primary block is a wall, an overlay (decoration drawn over the secondary block, e.g. a door on a wall) or an
// object (furniture, figures, or a picture which fills the whole view like stairs). Ambermoon blocks are a wall
// (WallIndex) or an object (ObjectIndex). The Ambermoon Walls/Objects of a labdata are the distinct combinations
// (graphics + converted flags) of the lab tiles of all maps which use the lab data (see analyze()).
// Textures are cut out of the pre-rendered Amberstar views, see labyrinths/textures.js.
import { Map as AmbermoonMap } from '../../ambermoon/Ambermoon.Data.Common/Map.js';
import { MapFlags } from '../../ambermoon/Ambermoon.Data.Common/Map.js';
import { MapType } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/MapType.js';
import { World } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/World.js';
import { CharacterType } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/CharacterType.js';
import { AutomapType } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/AutomapType.js';
import { Labdata } from '../../ambermoon/Ambermoon.Data.Common/Labdata.js';
import { Tileset } from '../../ambermoon/Ambermoon.Data.Common/Tileset.js';
import { GraphicType } from '../../ambermoon/Ambermoon.Data.Common/IGraphicProvider.js';
import { newArray2D } from '../../runtime.js';
import { AutomapPalette } from '../../../amberstar/src/data/assets.js';
import { buildColorMapping } from '../common.js';
import { amberstarCombatBackground } from './graphics2D.js';
import * as Maps2D from './maps2D.js';
import {
	LabBlockType, OpaqueBlackIndex, SkyColorIndex, SkyMarkerIndex, viewGeometry, wallHeight, createWallTexture, createInvisibleWallTexture,
	isFullViewObject, createObjectTexture, createFloorTexture, createHorizon, dominantColor, frontPerspective,
} from './labyrinths/textures.js';
import { AmberstarLightEffectProvider } from './labyrinths/sky.js';
import { convertCombatBackgrounds } from './labyrinths/combat.js';

const TileFlags = Tileset.TileFlags;

/** Amberstar lab tile flags (FileSpecs/TileFlags.md) */
export const AmberstarLabTileFlags = Object.freeze({
	WaveAnimation: 0x1,
	BlockSight: 0x2,
	RandomAnimation: 0x10,
	Illusion: 0x20, // illusion walls (passable)
	BlockAllMovement: 0x80,
	AllowClass1: 0x100, // the party
	AllowClass2: 0x200,
	AllowClass3: 0x400,
	FirstCombatBackground: 0x10000, // bits 16..29: combat background 1..14
});

// Ambermoon limits (ChangeTileEvent / map file format): objects 1..100, walls 1..154 (100 + wall < 255)
const MaxObjects = 100;
const MaxWalls = 154;

/** Combat background (Ambermoon index = Amberstar COM_BACK number - 1) of a 3D tile (Map3DScreen.combatBackground). */
function combatBackgroundIndex(flags, amberstarMapFlags) {
	const number = amberstarCombatBackground(flags >>> 0);
	if (number !== 0)
		return number - 1;
	return (amberstarMapFlags & Maps2D.AmberstarMapFlags.City) ? 7 : 8; // town / tower,tunnel,cellar
}

/**
 * Amberstar lab tile flags -> Ambermoon wall/object flags. The animation, sight and collision bits have the
 * same positions in both games. Bits 16..31 are different (Amberstar: combat background bits, Ambermoon: more
 * collision classes, player invisible, auto poison, combat background index in the upper 4 bits), so only the
 * combat background index is put into bits 28..31 (MapHandling.GetTileFlags).
 */
function convertLabTileFlags(flags, combatBackground) {
	const A = AmberstarLabTileFlags;
	let result = flags & (A.WaveAnimation | A.BlockSight | A.RandomAnimation | A.BlockAllMovement | 0x7f00);
	result |= (combatBackground & 0xf) << 28;
	return result >>> 0;
}

function blocksMovement(flags) {
	return (flags & AmberstarLabTileFlags.BlockAllMovement) !== 0 || (flags & AmberstarLabTileFlags.AllowClass1) === 0;
}

function threeDMapIndices(ctx) {
	const result = [];
	for (const key of ctx.source.keys('MAP_DATA.AMB').slice().sort((a, b) => a - b)) {
		const map = ctx.source.loadMap(key);
		if (map.is3D)
			result.push(key);
	}
	return result;
}

/**
 * Classification of an Amberstar lab tile:
 *  { kind: 'empty' } | { kind: 'wall', key, wallBlock, overlayBlock, fullViewObject, invisible } | { kind: 'object', key, block }
 */
function classifyLabTile(lab, geometry, labTile, amberstarMap) {
	const flags = labTile.flags >>> 0;
	const bg = combatBackgroundIndex(flags, amberstarMap.flags);
	const converted = convertLabTileFlags(flags, bg);
	const primary = lab.labBlocks[labTile.primaryLabBlockIndex - 1] ?? null;
	const secondary = lab.labBlocks[labTile.secondaryLabBlockIndex - 1] ?? null;
	const blocking = blocksMovement(flags);

	if (primary?.type === LabBlockType.Wall && frontPerspective(primary))
		return { kind: 'wall', key: `W${primary.index}:${converted}`, wallBlock: primary, flags: converted, blocking };
	if (primary?.type === LabBlockType.Overlay && frontPerspective(primary)) {
		const wall = secondary?.type === LabBlockType.Wall && frontPerspective(secondary) ? secondary : null;
		return { kind: 'wall', key: `W${wall?.index ?? 0}+${primary.index}:${converted}`, wallBlock: wall, overlayBlock: primary, flags: converted, blocking };
	}
	if (primary?.type === LabBlockType.Object && frontPerspective(primary)) {
		if (isFullViewObject(geometry, primary))
			return { kind: 'wall', key: `F${primary.index}:${converted}`, fullViewObject: primary, flags: converted, blocking };
		return { kind: 'object', key: `O${primary.index}:${converted}`, block: primary, flags: converted, blocking };
	}
	// Nothing to draw. Blocking empty tiles get an invisible wall.
	if (blocking)
		return { kind: 'wall', key: `I:${converted}`, invisible: true, flags: converted, blocking };
	return { kind: 'empty' };
}

/**
 * Analysis of all 3D maps (cached in ctx): which Ambermoon walls/objects each lab data needs and the
 * Ambermoon block value of every lab tile of every 3D map.
 */
function analyze(ctx) {
	if (ctx.labyrinthAnalysis)
		return ctx.labyrinthAnalysis;
	const source = ctx.source;
	const labs = new Map(); // lab data index -> plan
	const maps = new Map(); // map index -> { labIndex, tileValues: [labTileIndex] -> block value }
	const plan = labIndex => {
		let p = labs.get(labIndex);
		if (!p) {
			const lab = source.loadLabData(labIndex);
			p = {
				index: labIndex, lab, geometry: viewGeometry(lab.labBlocks), maps: [],
				walls: new Map(), objects: new Map(), // key -> { index (1-based), info }
				combatBackgroundCounts: new Array(16).fill(0),
			};
			labs.set(labIndex, p);
		}
		return p;
	};
	const add = (list, key, info, max, what, labIndex) => {
		let entry = list.get(key);
		if (!entry) {
			if (list.size >= max) {
				console.warn(`Amberstar lab data ${labIndex}: too many ${what} (max ${max})`);
				return 0;
			}
			entry = { index: list.size + 1, info };
			list.set(key, entry);
		}
		return entry.index;
	};

	for (const mapIndex of threeDMapIndices(ctx)) {
		const a = source.loadMap(mapIndex);
		const p = plan(a.tileset);
		p.maps.push(mapIndex);
		const tileValues = [0];
		a.labTiles.forEach(labTile => {
			const c = classifyLabTile(p.lab, p.geometry, labTile, a);
			if (c.kind === 'wall')
				tileValues.push(100 + add(p.walls, c.key, c, MaxWalls, 'walls', p.index));
			else if (c.kind === 'object')
				tileValues.push(add(p.objects, c.key, c, MaxObjects, 'objects', p.index));
			else
				tileValues.push(0);
		});
		// Combat background statistics of the walkable tiles (Ambermoon uses one per labdata, see CombatBackground)
		for (const tile of a.tiles) {
			const labTile = tile.labTileIndex === 0 ? null : a.labTiles[tile.labTileIndex - 1];
			const flags = labTile ? labTile.flags >>> 0 : 0;
			if (!blocksMovement(flags) || !labTile)
				p.combatBackgroundCounts[combatBackgroundIndex(flags, a.flags)]++;
		}
		// Objects for the map characters (they use object lab blocks as graphics)
		const characterObjects = [];
		a.characters.forEach((c, slot) => {
			const block = c.index !== 0 && c.icon !== 0 ? p.lab.labBlocks[c.icon - 1] : null;
			if (!block || !frontPerspective(block)) {
				characterObjects[slot] = 0;
				return;
			}
			characterObjects[slot] = add(p.objects, `C${block.index}`, { kind: 'object', block, flags: 0, character: true }, MaxObjects, 'objects', p.index);
		});
		maps.set(mapIndex, { labIndex: a.tileset, tileValues, characterObjects });
	}
	ctx.labyrinthAnalysis = { labs, maps };
	return ctx.labyrinthAnalysis;
}

/**
 * Ambermoon block value (ChangeTileEvent.FrontTileIndex encoding: 0 = empty, 1..100 object, 101..254 = 100 + wall)
 * of an Amberstar lab tile (1-based index into the lab tiles of the 3D map, 0 = empty) of the given map.
 */
export function labTileToBlockValue(ctx, mapIndex, labTileIndex) {
	const map = analyze(ctx).maps.get(mapIndex);
	return map?.tileValues[labTileIndex] ?? 0;
}

function labPalette(ctx, labIndex, lab) {
	const colors = ctx.source.loadPalette(lab.paletteIndex).slice(0, 16);
	while (colors.length < 32)
		colors.push([0, 0, 0]);
	colors[OpaqueBlackIndex] = colors[0]; // opaque black for walls (color 0 is transparent)
	colors[SkyMarkerIndex] = colors[SkyColorIndex]; // sky marker (replaced with the sky color on outdoor maps)
	// Star colors of the Ambermoon night sky (RenderMap3D.UpdateStars uses the colors 29..31)
	colors[29] = [96, 96, 96];
	colors[30] = [160, 160, 160];
	colors[31] = [224, 224, 224];
	return ctx.palettes.addAmberstar(colors, `labdata${labIndex}`);
}

/** Builds the Ambermoon Labdata of an Amberstar lab data plan. */
function createLabdata(ctx, p) {
	const lab = p.lab;
	const outdoor = lab.outdoors || p.maps.some(m => (ctx.source.loadMap(m).flags & Maps2D.AmberstarMapFlags.City) !== 0);
	const paletteKey = labPalette(ctx, p.index, lab);
	const palette = ctx.palettes.palettes.get(paletteKey);
	const minimapColors = buildColorMapping(AutomapPalette, palette, Array.from({ length: 15 }, (_, i) => i + 1));

	const labdata = new Labdata();
	labdata.Index = p.index;
	labdata.PaletteIndex = paletteKey;
	labdata.Outdoor = outdoor;
	labdata.WallHeight = wallHeight(p.geometry);
	// Ambermoon uses a single combat background for all 3D battles of a labdata: the most frequent one.
	labdata.CombatBackground = p.combatBackgroundCounts.indexOf(Math.max(...p.combatBackgroundCounts));
	labdata.Flags = labdata.CombatBackground;

	// Floor / ceiling
	const floor = ctx.source.loadBackground(lab.floorIndex);
	const ceiling = ctx.source.loadBackground(lab.ceilingIndex);
	labdata.FloorGraphic = floor ? createFloorTexture(floor, false) : null;
	labdata.FloorTextureIndex = floor ? lab.floorIndex : 0;
	labdata.FloorColorIndex = floor ? dominantColor(floor, 0, floor.height - 24, floor.width, 24) : OpaqueBlackIndex;
	if (outdoor) {
		// Sky: no ceiling texture, the ceiling color is the Amberstar sky color which Ambermoon replaces with the
		// sky gradient color in textures (RenderView.SetSkyColorReplacement) like Amberstar shows the sky through it.
		labdata.CeilingGraphic = null;
		labdata.CeilingTextureIndex = 0;
		labdata.CeilingColorIndex = SkyMarkerIndex;
	} else {
		labdata.CeilingGraphic = ceiling ? createFloorTexture(ceiling, true) : null;
		labdata.CeilingTextureIndex = ceiling ? lab.ceilingIndex : 0;
		labdata.CeilingColorIndex = ceiling ? dominantColor(ceiling, 0, 0, ceiling.width, 24) : OpaqueBlackIndex;
	}
	if (labdata.FloorColorIndex === 0)
		labdata.FloorColorIndex = OpaqueBlackIndex;
	if (labdata.CeilingColorIndex === 0)
		labdata.CeilingColorIndex = OpaqueBlackIndex;

	// Walls
	const wallTextures = new Map();
	for (const [key, { info }] of p.walls) {
		const textureKey = key.replace(/:.*$/, '');
		let texture = wallTextures.get(textureKey);
		if (!texture) {
			texture = info.invisible ? { graphic: createInvisibleWallTexture(), transparent: true }
				: createWallTexture(p.geometry, info.wallBlock ?? null, info.overlayBlock ?? null, outdoor, info.fullViewObject ?? null);
			wallTextures.set(textureKey, texture);
		}
		const wall = new Labdata.WallData();
		wall.Flags = (info.flags | (texture.transparent ? TileFlags.Transparency : 0)) >>> 0;
		wall.TextureIndex = labdata.Walls.length + 1;
		// Only real blocking walls are walls for the automap (and for the face culling of neighbor walls).
		wall.AutomapType = !texture.transparent && info.blocking ? AutomapType.Wall : AutomapType.None;
		wall.ColorIndex = minimapColors[info.minimapColor ?? 0] ?? 0;
		wall.Overlays = null; // overlays are already part of the texture
		labdata.Walls.push(wall);
		labdata.WallGraphics.push(texture.graphic);
	}

	// Objects (billboards). Texture indices are the keys in the labdata texture atlas (walls use 1000+).
	const objectTextures = new Map(); // lab block index -> { texture, textureIndex }
	for (const [, { info }] of p.objects) {
		let entry = objectTextures.get(info.block.index);
		if (!entry) {
			const texture = createObjectTexture(p.geometry, info.block);
			entry = { texture, textureIndex: objectTextures.size + 1 };
			objectTextures.set(info.block.index, entry);
		}
		const t = entry.texture;
		const obj = new Labdata.Object();
		obj.AutomapType = info.character ? AutomapType.Invalid : AutomapType.None;
		obj.SubObjects = [];
		if (t) {
			const objectInfo = new Labdata.ObjectInfo();
			let flags = info.flags;
			if (t.floor)
				flags |= TileFlags.Floor;
			if (t.frames <= 1)
				flags |= TileFlags.No3DAnimation;
			objectInfo.Flags = flags >>> 0;
			objectInfo.TextureIndex = entry.textureIndex;
			objectInfo.NumAnimationFrames = t.frames;
			objectInfo.ColorIndex = 0;
			objectInfo.TextureWidth = t.textureWidth;
			objectInfo.TextureHeight = t.textureHeight;
			objectInfo.MappedTextureWidth = t.mappedWidth;
			objectInfo.MappedTextureHeight = t.mappedHeight;
			if (!labdata.ObjectInfos.includes(objectInfo)) {
				labdata.ObjectInfos.push(objectInfo);
				labdata.ObjectGraphics.push(t.graphic);
			}
			const position = new Labdata.ObjectPosition();
			position.X = 256; // tile center
			position.Y = 256;
			position.Z = t.z;
			position.Object = objectInfo;
			obj.SubObjects.push(position);
		}
		labdata.Objects.push(obj);
	}
	return labdata;
}

/** Wall/object info needs the automap color of the lab tile: collected separately (first use wins). */
function attachMinimapColors(ctx, analysis) {
	for (const [mapIndex] of analysis.maps) {
		const a = ctx.source.loadMap(mapIndex);
		const p = analysis.labs.get(a.tileset);
		for (const labTile of a.labTiles) {
			const c = classifyLabTile(p.lab, p.geometry, labTile, a);
			if (c.kind === 'wall') {
				const info = p.walls.get(c.key)?.info;
				if (info && info.minimapColor == null)
					info.minimapColor = labTile.minimapColorIndex;
			}
		}
	}
}

/** Converts one Amberstar 3D map (blocks, characters, events). */
function convertMap3D(ctx, analysis, amberstarMap, labdata, horizonIndex) {
	const a = amberstarMap;
	const mapInfo = analysis.maps.get(a.index);
	const map = new AmbermoonMap();
	map.Index = a.index;
	map.Type = MapType.Map3D;
	map.Flags = Maps2D.convertMapFlags(a);
	if (labdata.Outdoor && (map.Flags & MapFlags.Outdoor) === 0) {
		map.Flags &= ~(MapFlags.Indoor | MapFlags.Dungeon);
		map.Flags |= MapFlags.Outdoor;
	}
	if (labdata.Outdoor)
		map.Flags |= MapFlags.Sky;
	map.MusicIndex = a.songIndex;
	map.Width = a.width;
	map.Height = a.height;
	map.TilesetOrLabdataIndex = a.tileset;
	map.NPCGfxIndex = 0;
	// Horizon graphic (GraphicType.LabBackground). Note: RenderMap3D uses labBackgroundGraphics[Map.World];
	// see the engine change in the report to use LabyrinthBackgroundIndex instead.
	map.LabyrinthBackgroundIndex = labdata.Outdoor ? horizonIndex + 1 : 0;
	map.PaletteIndex = labdata.PaletteIndex;
	map.World = World.Lyramion;
	map.NameOverride = a.name;
	map.Tiles = null;
	map.InitialTiles = null;
	map.Blocks = newArray2D(a.width, a.height);
	map.InitialBlocks = newArray2D(a.width, a.height);
	for (let y = 0; y < a.height; y++) {
		for (let x = 0; x < a.width; x++) {
			const value = mapInfo.tileValues[a.tiles[x + y * a.width].labTileIndex] ?? 0;
			const block = new AmbermoonMap.Block();
			block.ObjectIndex = value > 0 && value <= 100 ? value : 0;
			block.WallIndex = value > 100 ? value - 100 : 0;
			block.MapEventId = 0;
			block.MapBorder = false;
			map.Blocks[x][y] = block;
			map.InitialBlocks[x][y] = block.Clone();
		}
	}
	map.GotoPoints = [];
	map.Texts = Maps2D.convertMapTexts?.(ctx, a.index) ?? [];

	// Characters: graphic = labdata object of the character's lab block
	Maps2D.convertCharacterReferences(ctx, a, map, {
		graphicIndex: (c, slot) => mapInfo.characterObjects[slot] || null,
	});
	const slots = map.AmberstarCharacterSlots ?? [];
	map.CharacterReferences.forEach((ref, i) => {
		if (!ref)
			return;
		// Combat background from the lab tile the character starts on
		const p = ref.Positions[0];
		let flags = 0;
		if (p && p.X > 0 && p.Y > 0 && p.X <= a.width && p.Y <= a.height) {
			const labTileIndex = a.tiles[(p.X - 1) + (p.Y - 1) * a.width].labTileIndex;
			flags = labTileIndex ? a.labTiles[labTileIndex - 1]?.flags ?? 0 : 0;
		}
		ref.CombatBackgroundIndex = combatBackgroundIndex(flags, a.flags);
		ref.TileFlags = ((ref.CombatBackgroundIndex & 0xf) << 28) >>> 0;
		if (!ref.GraphicIndex) {
			console.warn(`Amberstar map ${a.index}: character ${slots[i]} has no 3D graphic`);
			ref.GraphicIndex = 1;
		}
	});

	// Events (maps2D converter); ChangeTile events need the Ambermoon block value of a lab tile.
	map.AmberstarTileIndexToBlockValue = labTileIndex => mapInfo.tileValues[labTileIndex] ?? 0;
	if (typeof Maps2D.convertEvents === 'function')
		Maps2D.convertEvents(ctx, a, map, { convertTileIndex: labTileIndex => mapInfo.tileValues[labTileIndex] ?? 0 });
	return map;
}

export function convert(ctx) {
	const analysis = analyze(ctx);
	attachMinimapColors(ctx, analysis);

	// Combat backgrounds (2D and 3D)
	convertCombatBackgrounds(ctx);

	// Labdata
	const labIndices = [...analysis.labs.keys()].sort((a, b) => a - b);
	const maxLab = Math.max(0, ...ctx.source.keys('LAB_DATA.AMB'));
	for (let n = 1; n <= maxLab; n++) {
		const p = analysis.labs.get(n) ?? (() => {
			const lab = ctx.source.loadLabData(n);
			return {
				index: n, lab, geometry: viewGeometry(lab.labBlocks), maps: [], walls: new Map(), objects: new Map(),
				combatBackgroundCounts: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
			};
		})();
		ctx.result.labdata[n - 1] = createLabdata(ctx, p);
	}

	// Horizons of the outdoor labdata (GraphicType.LabBackground, one per distinct sky background)
	const horizons = [];
	const horizonIndexByBackground = new Map();
	for (const n of labIndices) {
		const labdata = ctx.result.labdata[n - 1];
		if (!labdata.Outdoor)
			continue;
		const ceilingIndex = analysis.labs.get(n).lab.ceilingIndex;
		if (!horizonIndexByBackground.has(ceilingIndex)) {
			horizonIndexByBackground.set(ceilingIndex, horizons.length);
			horizons.push(createHorizon(ctx.source.loadBackground(ceilingIndex)));
		}
		labdata.HorizonIndex = horizonIndexByBackground.get(ceilingIndex);
	}
	if (horizons.length !== 0) {
		// The engine indexes the list with Map.World (0 = Lyramion for all Amberstar maps): the most used
		// horizon comes first.
		ctx.graphics.set(GraphicType.LabBackground, horizons);
	}

	// Maps
	for (const [mapIndex, info] of analysis.maps) {
		const labdata = ctx.result.labdata[info.labIndex - 1];
		const map = convertMap3D(ctx, analysis, ctx.source.loadMap(mapIndex), labdata, labdata.HorizonIndex ?? 0);
		ctx.result.maps.set(mapIndex, map);
	}

	// Sky gradients and daylight for the cities
	ctx.result.lightEffectProvider = new AmberstarLightEffectProvider(ctx.source.loadSkyGradients(), ctx.palettes.palettes);
	return analysis;
}
