// HD graphics mode of the web port: all game graphics are upscaled 4x (MMPX, palette index preserving, see
// src/ambermoon/Ambermoon.Renderer.OpenGL/PixelArtUpscaler.js) and drawn with the texture factor 4, so the game keeps
// its 320x200 layout but shows 4x more detail at Full HD and above.
//
// CreateHDSettings returns the value for TextureAtlasManager.HD: which layers are upscaled, how their atlases are laid
// out, which palette is used for the luminance decisions of the upscaler and which graphics consist of several
// animation frames (they are upscaled frame by frame).
import { Layer } from '../ambermoon/Ambermoon.Core/Render/Layer.js';
import { Graphics } from '../ambermoon/Ambermoon.Core/Render/Graphics.js';
import { UpscaleFlags } from '../ambermoon/Ambermoon.Core/Render/TextureAtlasManager.js';
import { UICustomGraphic } from '../ambermoon/Ambermoon.Data.Common/Enumerations/UICustomGraphic.js';
import { AutomapGraphic } from '../ambermoon/Ambermoon.Data.Common/Enumerations/AutomapGraphic.js';
import { MapType } from '../ambermoon/Ambermoon.Data.Common/Enumerations/MapType.js';
import { IntroData } from '../ambermoon/Ambermoon.Data.Legacy/Serialization/IntroData.js';
import { FantasyIntroGraphic } from '../ambermoon/Ambermoon.Data.Common/IFantasyIntroData.js';

export const HDFactor = 4;

function mostCommon(values, fallback) {
	const counts = new Map();
	let best = fallback;
	let bestCount = 0;

	for (const value of values) {
		const count = (counts.get(value) ?? 0) + 1;
		counts.set(value, count);

		if (count > bestCount) {
			best = value;
			bestCount = count;
		}
	}

	return best;
}

function tryGet(getter, fallback) {
	try {
		return getter() ?? fallback;
	} catch {
		return fallback;
	}
}

/**
 * Most common neighbor graphics of each tile graphic of a tileset on all 2D maps.
 * Returns Map<atlas key (graphic index - 1), [left, right, top, bottom]> (atlas keys or null).
 */
export function TileNeighbors(gameData, maps2D, tilesetIndex, maxCells = 200000) {
	const tileset = gameData.MapManager.GetTilesetForMap({ TilesetOrLabdataIndex: tilesetIndex });
	const tiles = tileset.Tiles;
	// tile index (1 based) -> atlas key (graphic index - 1), -1 = none
	const tileKeys = new Int32Array(tiles.length + 1).fill(-1);

	for (let i = 0; i < tiles.length; ++i) {
		if (tiles[i]?.GraphicIndex > 0)
			tileKeys[i + 1] = tiles[i].GraphicIndex - 1;
	}

	// counts: ((key * 4 + direction) * 65536 + neighbor key) -> count
	const counts = new Map();
	const count = (key, direction, neighbor) => {
		const id = (key * 4 + direction) * 65536 + neighbor;
		counts.set(id, (counts.get(id) ?? 0) + 1);
	};
	const maps = maps2D.filter(map => map.TilesetOrLabdataIndex === tilesetIndex && map.Tiles);
	const totalCells = maps.reduce((sum, map) => sum + map.Width * map.Height, 0);
	// Large tilesets (world maps) are sampled: the most common neighbors are clear long before all maps are counted.
	const step = Math.max(1, Math.ceil(totalCells / maxCells));

	for (let m = 0; m < maps.length; m += step) {
		const map = maps[m];
		const width = map.Width, height = map.Height;

		for (const layerName of ['BackTileIndex', 'FrontTileIndex']) {
			const keys = new Int32Array(width * height);

			for (let x = 0; x < width; ++x) {
				const column = map.Tiles[x];

				for (let y = 0; y < height; ++y) {
					const tileIndex = column[y][layerName];
					keys[y * width + x] = tileIndex > 0 && tileIndex < tileKeys.length ? tileKeys[tileIndex] : -1;
				}
			}

			for (let y = 0; y < height; ++y) {
				for (let x = 0; x < width; ++x) {
					const key = keys[y * width + x];

					if (key < 0)
						continue;

					if (x + 1 < width && keys[y * width + x + 1] >= 0) {
						count(key, 1, keys[y * width + x + 1]); // right
						count(keys[y * width + x + 1], 0, key); // left of the right neighbor
					}

					if (y + 1 < height && keys[(y + 1) * width + x] >= 0) {
						count(key, 3, keys[(y + 1) * width + x]); // bottom
						count(keys[(y + 1) * width + x], 2, key); // top of the bottom neighbor
					}
				}
			}
		}
	}

	// most common neighbor per key and direction
	const best = new Map(); // key * 4 + direction -> [neighbor, count]

	for (const [id, n] of counts) {
		const keyDirection = Math.floor(id / 65536);
		const neighbor = id - keyDirection * 65536;
		const current = best.get(keyDirection);

		if (current == null || n > current[1])
			best.set(keyDirection, [neighbor, n]);
	}

	const result = new Map();

	for (const [keyDirection, [neighbor]] of best) {
		const key = keyDirection >> 2;
		let entry = result.get(key);

		if (!entry)
			result.set(key, entry = [null, null, null, null]);

		entry[keyDirection & 3] = neighbor;
	}

	// animation frames (following graphics) have the neighbors of the first frame
	for (const tile of tiles) {
		const key = tile.GraphicIndex - 1;

		if (tile.NumAnimationFrames > 1 && result.has(key)) {
			for (let frame = 1; frame < tile.NumAnimationFrames; ++frame) {
				if (!result.has(key + frame))
					result.set(key + frame, result.get(key));
			}
		}
	}

	return result;
}

export function CreateHDSettings(gameData, maxTextureSize, factor = HDFactor) {
	const info = gameData.GraphicInfoProvider;
	const uiPalette = Math.max(0, (info.PrimaryUIPaletteIndex ?? 1) - 1); // palette rows: sprites use PaletteIndex = row
	const introPalette = info.FirstIntroPaletteIndex ?? uiPalette;
	const maps = tryGet(() => gameData.MapManager.Maps, []);
	const maps2D = maps.filter(map => map.Type === MapType.Map2D);
	const characterPalette = Math.max(0, mostCommon(maps2D.map(map => map.PaletteIndex), 1) - 1);

	const tilesetPalette = tilesetIndex => Math.max(0, mostCommon(maps2D.filter(map => map.TilesetOrLabdataIndex === tilesetIndex)
		.map(map => map.PaletteIndex), characterPalette + 1) - 1);

	const layers = new Map();
	const add = (layer, settings) => layers.set(layer, settings);

	// 2D maps: tiles are upscaled one by one (animation frames are separate graphics). The upscaler sees the most
	// common neighbor tiles of each tile on the maps, so edges continue smoothly across tile borders (no seams).
	for (let i = 0; i < 10; ++i) {
		const palette = tilesetPalette(i + 1);
		let neighbors = null;
		const settings = {
			regionInfo: key => {
				neighbors ??= tryGet(() => TileNeighbors(gameData, maps2D, i + 1), new Map());
				return { palette, neighbors: neighbors.get(key) };
			}
		};
		add(Layer.MapBackground1 + i, settings);
		add(Layer.MapForeground1 + i, settings);
	}

	add(Layer.Characters, { regionInfo: () => ({ palette: characterPalette }) });

	// UI: layouts, UI elements, portraits, 80x80 pictures, event pictures, battle field icons, automap, riddlemouth
	const animatedAutomapGraphics = new Map([
		[AutomapGraphic.Riddlemouth, 4], [AutomapGraphic.Teleport, 4], [AutomapGraphic.Spinner, 4], [AutomapGraphic.Trap, 4],
		[AutomapGraphic.TrapDoor, 4], [AutomapGraphic.Special, 4], [AutomapGraphic.Monster, 4], [AutomapGraphic.GotoPoint, 8]
	]);
	const uiCustomFrameWidths = new Map([
		[UICustomGraphic.HealingStarAnimation, 7],
		[UICustomGraphic.ItemMagicAnimation, 16],
		[UICustomGraphic.AutomapWallFrames, 8]
	]);
	add(Layer.UI, {
		regionInfo: (key, graphic) => {
			const result = { palette: uiPalette };

			if (key >= Graphics.UICustomGraphicOffset && uiCustomFrameWidths.has(key - Graphics.UICustomGraphicOffset))
				result.frameWidth = uiCustomFrameWidths.get(key - Graphics.UICustomGraphicOffset);
			else if (key >= Graphics.AutomapOffset && key < Graphics.AutomapOffset + 100 && animatedAutomapGraphics.has(key - Graphics.AutomapOffset))
				result.frameWidth = graphic.Width / animatedAutomapGraphics.get(key - Graphics.AutomapOffset);
			else if (key === Graphics.RiddlemouthEyeIndex || key === Graphics.RiddlemouthMouthIndex)
				result.frameWidth = 48;
			else if (key >= Graphics.EventPictureOffset && key < Graphics.EventPictureOffset + 50)
				result.flags = UpscaleFlags.Opaque; // black instead of transparent

			return result;
		}
	});
	add(Layer.Items, { regionInfo: () => ({ palette: uiPalette }) });
	add(Layer.Cursor, { regionInfo: () => ({ palette: uiPalette }) });

	// Battle
	add(Layer.CombatBackground, { regionInfo: () => ({ palette: uiPalette, flags: UpscaleFlags.Opaque }) });
	add(Layer.BattleEffects, {
		regionInfo: key => ({
			palette: uiPalette,
			frameWidth: tryGet(() => info.GetCombatGraphicInfo(key - Graphics.CombatGraphicOffset).GraphicInfo.Width, undefined)
		})
	});
	let monsterFrameWidths = null;
	add(Layer.BattleMonsterRow, {
		layout: 'packed',
		regionInfo: key => {
			monsterFrameWidths ??= new Map(tryGet(() => gameData.CharacterManager.Monsters, []).map(monster => [monster.Index, monster.FrameWidth]));
			return { palette: uiPalette, frameWidth: monsterFrameWidths.get(key) };
		}
	});

	// 3D (labdata atlases are created per labyrinth, see RenderMap3D.EnsureLabdataTextureAtlas)
	for (const layer of [Layer.Map3DBackground, Layer.Map3DCeiling, Layer.Map3D, Layer.Billboards3D])
		add(layer, { layout: 'packed' });

	// Main menu, intro, outro, fantasy intro
	const introGraphicPalette = key => {
		const palettes = tryGet(() => IntroData.GraphicPalettes, null);
		const palette = palettes?.get?.(key);
		return palette != null ? introPalette + palette - 1 : introPalette;
	};
	add(Layer.MainMenuGraphics, { regionInfo: key => ({ palette: introGraphicPalette(key) }) });
	add(Layer.MainMenuText, { regionInfo: () => ({ palette: introPalette }) });
	add(Layer.IntroGraphics, { layout: 'shelf', regionInfo: key => ({ palette: introGraphicPalette(key) }) });
	add(Layer.IntroText, { regionInfo: () => ({ palette: introPalette }) });
	add(Layer.OutroGraphics, { regionInfo: () => ({ palette: info.FirstOutroPaletteIndex ?? uiPalette, flags: UpscaleFlags.Opaque }) });
	add(Layer.OutroText, { regionInfo: () => ({ palette: info.FirstOutroPaletteIndex ?? uiPalette }) });
	// Fantasy intro: fairy frames are 64x71 (6 per row), the sparks are vertical strips of 9 resp. 5 pixel high frames
	const fantasyFrames = new Map([[FantasyIntroGraphic.Fairy, [64, 71]], [FantasyIntroGraphic.WritingSparks, [undefined, 9]], [FantasyIntroGraphic.FairySparks, [undefined, 5]]]);
	add(Layer.FantasyIntroGraphics, {
		regionInfo: key => ({
			palette: info.FirstFantasyIntroPaletteIndex ?? uiPalette,
			frameWidth: fantasyFrames.get(key)?.[0],
			frameHeight: fantasyFrames.get(key)?.[1]
		})
	});

	return {
		Factor: factor,
		MaxTextureSize: maxTextureSize,
		Layers: layers
	};
}
