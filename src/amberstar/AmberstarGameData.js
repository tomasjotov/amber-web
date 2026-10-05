// Amberstar running on the Ambermoon engine.
//
// The Ambermoon engine (src/ambermoon) works on an IGameData object. Here an IGameData is built that
// takes the user interface, fonts, cursors and other engine assets from the Ambermoon data and the
// world (maps, tilesets, labyrinths, characters, items, texts, music) from the Amberstar data.
// See AMBERSTAR.md for the conversion contracts.
import { AssetProvider as AmberstarAssets } from '../../amberstar/src/data/assets.js';
import { GraphicType } from '../ambermoon/Ambermoon.Data.Common/IGraphicProvider.js';
import { toAmbermoonPalette } from './common.js';
import * as Graphics2D from './convert/graphics2D.js';
import * as Maps2D from './convert/maps2D.js';
import * as Labyrinths from './convert/labyrinths.js';
import * as Characters from './convert/characters.js';
import * as Music from './convert/music.js';
import { installAmberstarExtensions } from './extensions/index.js';

/** Registry for additional palettes (keys continue after the highest Ambermoon palette key). */
export class PaletteRegistry {
	constructor(palettes) {
		this.palettes = palettes; // Map<int, Graphic> (copy of the Ambermoon palettes)
		this.nextKey = Math.max(...palettes.keys()) + 1;
		this.cache = new Map();
	}

	/**
	 * Adds a palette and returns its key. Map.PaletteIndex uses the key directly (sprites use key - 1).
	 * `id` is an optional cache id so the same Amberstar palette is only added once.
	 */
	add(paletteGraphic, id = null) {
		if (id != null && this.cache.has(id))
			return this.cache.get(id);
		const key = this.nextKey++;
		this.palettes.set(key, paletteGraphic);
		if (id != null)
			this.cache.set(id, key);
		return key;
	}

	/** Adds an Amberstar palette ([r,g,b][]) */
	addAmberstar(colors, id = null) {
		return this.add(toAmbermoonPalette(colors), id);
	}
}

/**
 * Context passed to all converters.
 *  source   Amberstar AssetProvider (amberstar/src/data/assets.js)
 *  base     the loaded Ambermoon GameData (UI, fonts, cursors, layouts, ...)
 *  palettes PaletteRegistry
 *  graphics Map<GraphicType, Graphic[]> graphic lists that replace the Ambermoon ones
 *  result   filled by the converters (see AMBERSTAR.md)
 */
export function createContext(base, amberstarFiles) {
	const source = new AmberstarAssets(amberstarFiles);
	const baseProvider = base.GraphicInfoProvider;
	return {
		source,
		base,
		baseProvider,
		palettes: new PaletteRegistry(new Map(baseProvider.Palettes)),
		uiPalette: baseProvider.Palettes.get(baseProvider.PrimaryUIPaletteIndex),
		graphics: new Map(),
		result: {
			maps: new Map(), // index -> Ambermoon Map
			tilesets: [], // Ambermoon Tileset (Index 1-based, tilesets[Index - 1])
			labdata: [], // Ambermoon Labdata (Index 1-based)
			npcGraphicOffsets: null, // Map<int, int> or null
			npcGraphicFrameCounts: null, // Map<int, int[]> or null
			characterManager: null,
			itemManager: null,
			places: null,
			dataNameProvider: null, // object overriding members of the Ambermoon DataNameProvider
			savegameManager: null,
			songManager: null,
			combatBackgrounds2D: null, // index -> CombatBackgroundInfo
			combatBackgrounds3D: null,
			lightEffectProvider: null,
			dictionary: null, // TextDictionary
			stationaryImageInfos: null,
			travelGraphicInfo: null, // (type, direction) -> TravelGraphicInfo
			playerAnimationInfo: null,
		},
	};
}

function createMapManager(ctx) {
	const maps = [...ctx.result.maps.values()].sort((a, b) => a.Index - b.Index);
	const tilesets = ctx.result.tilesets;
	const labdata = ctx.result.labdata;
	return {
		Maps: maps,
		Tilesets: tilesets,
		Labdata: labdata,
		GetMap(index) { return ctx.result.maps.get(index) ?? null; },
		GetTilesetForMap(map) { return tilesets[map.TilesetOrLabdataIndex - 1] ?? null; },
		GetLabdataForMap(map) { return labdata[map.TilesetOrLabdataIndex - 1] ?? null; },
	};
}

function createGraphicProvider(ctx) {
	const base = ctx.baseProvider;
	const provider = Object.create(base);
	provider.Palettes = ctx.palettes.palettes;
	provider.graphics = new Map(base.graphics);
	for (const [type, list] of ctx.graphics)
		provider.graphics.set(type, list);
	if (ctx.result.npcGraphicOffsets)
		provider.npcGraphicOffsets = ctx.result.npcGraphicOffsets;
	if (ctx.result.npcGraphicFrameCounts)
		provider.npcGraphicFrameCounts = ctx.result.npcGraphicFrameCounts;
	if (ctx.result.eventPicturePalettes)
		provider.EventPicturePalettes = ctx.result.eventPicturePalettes;
	if (ctx.result.combatBackgrounds2D) {
		const backgrounds2D = ctx.result.combatBackgrounds2D;
		const backgrounds3D = ctx.result.combatBackgrounds3D ?? backgrounds2D;
		provider.Get2DCombatBackground = index => backgrounds2D[index] ?? backgrounds2D[0];
		provider.Get3DCombatBackground = index => backgrounds3D[index] ?? backgrounds3D[0];
	}
	return provider;
}

function overrideObject(base, overrides) {
	if (!overrides)
		return base;
	const result = Object.create(base);
	for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(overrides)))
		Object.defineProperty(result, key, descriptor);
	return result;
}

/**
 * Builds the Amberstar game data. `base` is a loaded Ambermoon GameData (Legacy), `amberstarFiles`
 * a Map<string, Uint8Array> with the Amberstar files (upper case names, `_NEW/...` for the new game files).
 */
export function createAmberstarGameData(base, amberstarFiles, log = console) {
	const ctx = createContext(base, amberstarFiles);
	const steps = [
		['graphics 2D', () => Graphics2D.convert(ctx)],
		['maps 2D', () => Maps2D.convert(ctx)],
		['labyrinths', () => Labyrinths.convert(ctx)],
		['characters', () => Characters.convert(ctx)],
		['music', () => Music.convert(ctx)],
	];
	for (const [name, step] of steps) {
		const start = performance.now();
		step();
		log?.info?.(`Amberstar ${name} converted in ${Math.round(performance.now() - start)} ms`);
	}

	const r = ctx.result;
	const gameData = Object.create(base);
	gameData.IsAmberstar = true;
	gameData.Advanced = false;
	gameData.GraphicInfoProvider = createGraphicProvider(ctx);
	gameData.MapManager = createMapManager(ctx);
	if (r.characterManager)
		gameData.CharacterManager = r.characterManager;
	if (r.itemManager) {
		// ItemManager is a getter on GameData (ExecutableData.ItemManager)
		Object.defineProperty(gameData, 'ItemManager', { value: r.itemManager });
	}
	if (r.places)
		gameData.Places = r.places;
	if (r.dataNameProvider)
		gameData.DataNameProvider = overrideObject(base.DataNameProvider, r.dataNameProvider);
	if (r.songManager)
		gameData.SongManager = r.songManager;
	if (r.lightEffectProvider)
		gameData.LightEffectProvider = r.lightEffectProvider;
	if (r.dictionary)
		gameData.Dictionary = r.dictionary;
	if (r.stationaryImageInfos)
		gameData.StationaryImageInfos = r.stationaryImageInfos;
	if (r.travelGraphicInfo)
		gameData.GetTravelGraphicInfo = r.travelGraphicInfo;
	if (r.playerAnimationInfo)
		Object.defineProperty(gameData, 'PlayerAnimationInfo', { value: r.playerAnimationInfo });
	gameData.AmberstarContext = ctx;
	// Engine extensions (main menu picture, altar, outro, game over picture, guilds), see extensions/index.js
	installAmberstarExtensions(ctx, gameData);
	return { gameData, savegameManager: r.savegameManager, context: ctx };
}

export { GraphicType };
