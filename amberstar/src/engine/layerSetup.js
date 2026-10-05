// Port of Amberstar.net LayerSetup: creates the render layers, texture atlases,
// the palette list and the graphic/palette index providers.
import { Renderer, RenderLayer, TextureAtlas, LayerFeatures } from './renderer.js';
import { UIPalette, ItemPalette, AutomapPalette } from '../data/assets.js';
import { UIGraphic, ButtonType, StatusIcon, ItemGraphicCount, CursorTypeCount, Image80x80 } from '../data/enums.js';
import { Graphic } from '../data/graphic.js';

export const Layer = { Layout: 0, UI: 1, Map2D: 2, Text: 3, Map3D: 4, TopMost: 5, Battle: 6 };
export const BuiltinPalette = { UI: 0, Item: 1, Automap: 2 };

export function setupLayers(assets) {
	const renderer = new Renderer(320, 200);

	// ---- palettes ----
	const palettes = [UIPalette, ItemPalette, AutomapPalette];
	const generalPaletteIndices = new Map(); // 0-based general palette -> palette index
	for (let i = 0; i < 10; i++) {
		generalPaletteIndices.set(i, palettes.length);
		palettes.push(assets.loadPalette(i + 1));
	}
	const tilesetPaletteIndices = new Map();
	for (let i = 1; i <= 2; i++) {
		tilesetPaletteIndices.set(i, palettes.length);
		palettes.push(assets.loadTileset(i).palette);
	}
	const image80x80PaletteIndices = new Map();
	for (let i = 1; i <= Image80x80.Amberstar; i++) {
		image80x80PaletteIndices.set(i, palettes.length);
		palettes.push(assets.load80x80(i).palette);
	}
	const combatPaletteIndices = new Map();
	assets.loadCombatPalettes().forEach((p, i) => {
		combatPaletteIndices.set(i + 1, palettes.length);
		palettes.push(p);
	});
	renderer.setPalettes(palettes);

	// ---- Layouts ----
	let graphics = new Map([[0, assets.portraitArea]]);
	for (let i = 1; i <= 11; i++)
		graphics.set(i, assets.loadLayout(i));
	renderer.addLayer(new RenderLayer(Layer.Layout, {
		baseZ: 0.0, features: LayerFeatures.DisplayLayers, texture: new TextureAtlas(graphics),
	}));

	// ---- UI ----
	graphics = new Map();
	let index = 0;
	const uiGraphicOffset = index;
	for (let i = 0; i <= UIGraphic.LastUIGraphic; i++)
		graphics.set(uiGraphicOffset + i, assets.loadUIGraphic(i));
	index = graphics.size;
	const buttonOffset = index;
	for (let i = 0; i <= ButtonType.DistributeItems; i++)
		graphics.set(buttonOffset + i, assets.loadButton(i));
	index = graphics.size;
	const statusIconOffset = index;
	for (let i = 0; i <= StatusIcon.LastStatusIcon; i++)
		graphics.set(statusIconOffset + i, assets.loadStatusIcon(i));
	index = graphics.size;
	const image80x80Offset = index - 1; // enum is 1-based
	for (let i = 1; i <= Image80x80.Amberstar; i++)
		graphics.set(image80x80Offset + i, assets.load80x80(i).graphic);
	index = graphics.size;
	const itemGraphicOffset = index;
	for (let i = 0; i < ItemGraphicCount; i++)
		graphics.set(itemGraphicOffset + i, assets.loadItemGraphic(i));
	index = graphics.size;
	const windowGraphicOffset = index;
	for (let i = 0; i < 2; i++)
		graphics.set(windowGraphicOffset + i, Graphic.fromFrames(assets.loadWindowGraphics(i === 0)));
	index = graphics.size;
	const cursorGraphicOffset = index;
	for (let i = 0; i < CursorTypeCount; i++)
		graphics.set(cursorGraphicOffset + i, assets.loadCursor(i).graphic);
	const personPortraitIndices = new Map();
	for (const [key, portrait] of assets.loadPersonPortraits()) {
		personPortraitIndices.set(key, graphics.size);
		graphics.set(graphics.size, portrait);
	}
	renderer.addLayer(new RenderLayer(Layer.UI, {
		baseZ: 0.7, features: LayerFeatures.Transparency | LayerFeatures.DisplayLayers, texture: new TextureAtlas(graphics),
	}));

	// ---- Map2D ----
	graphics = new Map();
	index = 1;
	for (const g of assets.loadTileset(1).graphics)
		graphics.set(index++, g);
	index++;
	for (const g of assets.loadTileset(2).graphics)
		graphics.set(index++, g);
	renderer.addLayer(new RenderLayer(Layer.Map2D, {
		baseZ: 0.1, features: LayerFeatures.Transparency, texture: new TextureAtlas(graphics),
	}));

	// ---- Text ----
	graphics = new Map();
	const font = assets.loadFont();
	const textGlyphTextureIndices = new Map();
	const runeGlyphTextureIndices = new Map();
	let glyphTextureIndex = 0;
	for (let i = 33; i < 256; i++) {
		const glyph = font.getGlyphIndex(i, false);
		if (glyph >= 0 && font.glyphs[glyph]) {
			textGlyphTextureIndices.set(i, glyphTextureIndex);
			graphics.set(glyphTextureIndex++, font.glyphs[glyph]);
		}
	}
	for (let i = 33; i < 256; i++) {
		const glyph = font.getGlyphIndex(i, true);
		if (glyph >= 0 && font.glyphs[glyph]) {
			runeGlyphTextureIndices.set(i, glyphTextureIndex);
			graphics.set(glyphTextureIndex++, font.glyphs[glyph]);
		}
	}
	renderer.addLayer(new RenderLayer(Layer.Text, {
		baseZ: 0.7, features: LayerFeatures.Transparency | LayerFeatures.DisplayLayers | LayerFeatures.Alpha, texture: new TextureAtlas(graphics),
	}));

	// ---- Map3D ----
	graphics = new Map();
	index = 0;
	const labBlockImageIndices = new Map();
	for (const [key, block] of assets.loadAllLabBlocks()) {
		const images = new Map(); // location -> Map(facing -> index)
		for (const p of block.perspectives) {
			if (!images.has(p.location))
				images.set(p.location, new Map());
			images.get(p.location).set(p.facing, index);
			graphics.set(index++, Graphic.fromFrames(p.frames));
		}
		labBlockImageIndices.set(key, images);
	}
	const backgroundGraphicIndices = new Map();
	for (const key of assets.backgroundKeys) {
		backgroundGraphicIndices.set(key, index);
		graphics.set(index++, assets.loadBackground(key));
	}
	const cloudGraphicIndices = new Map();
	for (const key of assets.backgroundKeys) {
		const cloud = assets.loadCloud(key);
		if (cloud) {
			cloudGraphicIndices.set(key, index);
			graphics.set(index++, cloud);
		}
	}
	renderer.addLayer(new RenderLayer(Layer.Map3D, {
		baseZ: 0.1, features: LayerFeatures.Transparency | LayerFeatures.DisplayLayers, texture: new TextureAtlas(graphics),
	}));

	// ---- TopMost ----
	renderer.addLayer(new RenderLayer(Layer.TopMost, {
		baseZ: 0.9, features: LayerFeatures.Transparency | LayerFeatures.DisplayLayers | LayerFeatures.Alpha,
	}));

	// ---- Battle ----
	graphics = new Map();
	index = 0;
	const combatBackgroundIndices = new Map();
	for (let i = 1; i <= 14; i++) {
		combatBackgroundIndices.set(i, index);
		graphics.set(index++, assets.loadCombatBackground(i));
	}
	const tacticOffset = index;
	for (const icon of assets.loadTacticIcons())
		graphics.set(index++, icon);
	const combatAnimationOffset = index;
	for (const icon of assets.loadCombatAnimations())
		graphics.set(index++, icon);
	const monsterFrameIndices = new Map(); // key gfx:distance -> [indices]
	for (let gfx = 1; gfx <= 21; gfx++) {
		const groups = assets.loadMonsterGraphics(gfx);
		if (!groups)
			continue;
		groups.forEach((frames, d) => {
			monsterFrameIndices.set(`${gfx}:${d}`, frames.map(f => {
				graphics.set(index, f);
				return index++;
			}));
		});
	}
	renderer.addLayer(new RenderLayer(Layer.Battle, {
		baseZ: 0.1, features: LayerFeatures.Transparency | LayerFeatures.DisplayLayers, texture: new TextureAtlas(graphics),
	}));

	const graphicIndexProvider = {
		getCombatBackgroundIndex: i => combatBackgroundIndices.get(i),
		getTacticIconIndex: i => tacticOffset + i,
		getCombatAnimationIndex: i => combatAnimationOffset + i,
		getMonsterFrameIndices: (gfx, distance) => monsterFrameIndices.get(`${gfx}:${distance}`) ?? [],
		get80x80ImageIndex: image => image80x80Offset + image,
		getButtonIndex: button => buttonOffset + button,
		getItemGraphicIndex: graphic => itemGraphicOffset + graphic,
		getStatusIconIndex: icon => statusIconOffset + icon,
		getUIGraphicIndex: graphic => uiGraphicOffset + graphic,
		getLabBlockGraphicIndex: (labBlockIndex, location, facing) => labBlockImageIndices.get(labBlockIndex)?.get(location)?.get(facing),
		getBackgroundGraphicIndex: i => backgroundGraphicIndices.get(i),
		getCloudGraphicIndex: i => cloudGraphicIndices.get(i),
		getWindowGraphicIndex: dark => windowGraphicOffset + (dark ? 0 : 1),
		getCursorGraphicIndex: cursor => cursorGraphicOffset + cursor,
		getPersonPortraitIndex: i => personPortraitIndices.get(i),
	};

	const paletteIndexProvider = {
		builtinPaletteIndices: { ...BuiltinPalette },
		get80x80ImagePaletteIndex: image => image80x80PaletteIndices.get(image),
		getLabyrinthPaletteIndex: paletteIndex => generalPaletteIndices.get(paletteIndex),
		getTextPaletteIndex: () => BuiltinPalette.UI,
		getTilesetPaletteIndex: tileset => tilesetPaletteIndices.get(tileset),
		getCombatPaletteIndex: i => combatPaletteIndices.get(i),
	};

	const paletteColorProvider = {
		getPaletteColor: (paletteIndex, colorIndex) => {
			const c = palettes[paletteIndex][colorIndex];
			return { r: c[0], g: c[1], b: c[2], a: 255 };
		},
	};

	const fontInfoProvider = { textGlyphTextureIndices, runeGlyphTextureIndices };

	return { renderer, graphicIndexProvider, paletteIndexProvider, paletteColorProvider, fontInfoProvider };
}
