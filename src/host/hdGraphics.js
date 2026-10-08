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
export function TileNeighbors(gameData, maps2D, tilesetIndex) {
	const tileset = gameData.MapManager.GetTilesetForMap({ TilesetOrLabdataIndex: tilesetIndex });
	const counts = new Map(); // key -> [Map(neighbor -> count) x 4]
	const graphicKey = tileIndex => {
		const tile = tileIndex > 0 ? tileset.Tiles[tileIndex - 1] : null;
		return tile != null && tile.GraphicIndex > 0 ? tile.GraphicIndex - 1 : null;
	};
	const count = (key, direction, neighbor) => {
		if (key == null || neighbor == null)
			return;
		let entry = counts.get(key);
		if (!entry)
			counts.set(key, entry = [new Map(), new Map(), new Map(), new Map()]);
		entry[direction].set(neighbor, (entry[direction].get(neighbor) ?? 0) + 1);
	};
	const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

	for (const map of maps2D) {
		if (map.TilesetOrLabdataIndex !== tilesetIndex || !map.Tiles)
			continue;

		for (let x = 0; x < map.Width; ++x) {
			for (let y = 0; y < map.Height; ++y) {
				const tile = map.Tiles[x][y];

				for (const layerName of ['BackTileIndex', 'FrontTileIndex']) {
					const key = graphicKey(tile[layerName]);

					if (key == null)
						continue;

					directions.forEach(([dx, dy], direction) => {
						const nx = x + dx, ny = y + dy;
						if (nx >= 0 && ny >= 0 && nx < map.Width && ny < map.Height)
							count(key, direction, graphicKey(map.Tiles[nx][ny][layerName]));
					});
				}
			}
		}
	}

	const result = new Map();

	for (const [key, entry] of counts)
		result.set(key, entry.map(neighbors => neighbors.size === 0 ? null : [...neighbors].reduce((a, b) => b[1] > a[1] ? b : a)[0]));

	// animation frames (following graphics) have the neighbors of the first frame
	for (const tile of tileset.Tiles) {
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
