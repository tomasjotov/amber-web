// Port of Ambermoon.Core/Render/TextureAtlasManager.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException, ArgumentNullException, enumName, getValue, hasFlag, max, toDictionary, tryGetValue } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { GraphicType } from '../../Ambermoon.Data.Common/IGraphicProvider.js';
import { IntroGraphic } from '../../Ambermoon.Data.Common/IIntroData.js';
import { CombatGraphicIndex } from '../../Ambermoon.Data.Common/Enumerations/CombatGraphicIndex.js';
import { Features } from '../../Ambermoon.Data.Common/Enumerations/Features.js';
import { GameCore } from '../GameCore.js';
import { Layer } from './Layer.js';
import { Graphics } from './Graphics.js';

let instance = null;
let factory = null;
let converter = null;

// Interface checks (duck typing)
const isGraphicProvider = provider => provider != null && typeof provider.GetGraphics === 'function';
const isGraphicAtlasProvider = provider => provider != null && typeof provider.GetGraphicAtlas === 'function';

export class TextureAtlasManager {
	static get Instance() {
		return instance ??= new TextureAtlasManager();
	}

	constructor() {
		this.atlasBuilders = new Map();
		this.atlas = new Map();
	}

	static RegisterFactory(factory_) {
		factory = factory_;
	}

	static RegisterConverter(converter_) {
		converter = converter_;
	}

	// Note: Animation frames must be added as one large compound graphic.
	AddTexture(layer, index, texture) {
		if (factory == null)
			throw new AmbermoonException(ExceptionScope.Application, 'No TextureAtlasBuilderFactory was registered.');

		if (this.atlas.has(layer))
			throw new AmbermoonException(ExceptionScope.Application, `Texture atlas already created for layer ${enumName(Layer, layer)}.`);

		if (!this.atlasBuilders.has(layer))
			this.atlasBuilders.set(layer, factory.Create());

		getValue(this.atlasBuilders, layer).AddTexture(index, texture);
	}

	HasLayer(layer) {
		return this.atlas.has(layer);
	}

	GetOrCreate(layer) {
		if (!this.atlas.has(layer)) {
			const [found, value] = tryGetValue(this.atlasBuilders, layer);

			if (!found)
				return null; // no texture for this layer

			if (layer === Layer.BattleMonsterRow)
				this.atlas.set(layer, value.Create(1));
			else if (layer === Layer.Images || layer === Layer.MobileOverlays)
				this.atlas.set(layer, getValue(this.atlasBuilders, layer).Create(4));
			else
				this.atlas.set(layer, getValue(this.atlasBuilders, layer).CreateUnpacked(320, 1));
		}

		return getValue(this.atlas, layer);
	}

	AddFromGraphics(layer, graphics) {
		for (const [Key, Value] of graphics)
			this.AddTexture(layer, Key, Value);
	}

	AddAtlas(layer, atlas, offset = 0) {
		if (this.atlas.has(layer))
			throw new AmbermoonException(ExceptionScope.Application, `Texture atlas already created for layer ${enumName(Layer, layer)}.`);

		this.atlas.set(layer, converter.Convert(atlas, offset));
	}

	SetAtlas(layer, atlas, offset = 0) {
		this.atlas.set(layer, converter.Convert(atlas, offset));
	}

	/**
	 * AddAtlases(layer, ...atlases) where each atlas is a tuple { Offset, Atlas } (or [Offset, Atlas])
	 * AddAtlases(layer, Map<uint, IGraphicAtlas> atlases)
	 */
	AddAtlases(layer, ...args) {
		if (args.length === 1 && args[0] instanceof Map) {
			const atlases = args[0];

			if (this.atlas.has(layer))
				throw new AmbermoonException(ExceptionScope.Application, `Texture atlas already created for layer ${enumName(Layer, layer)}.`);

			this.atlas.set(layer, converter.Convert(atlases));
			return;
		}

		const atlases = args.map(a => (Array.isArray(a) ? { Offset: a[0], Atlas: a[1] } : a));
		this.AddAtlases(layer, toDictionary(atlases, a => a.Offset, a => a.Atlas));
	}

	static CreateFromGraphics(graphics, bytesPerPixel) {
		const builder = factory.Create();

		for (const [Key, Value] of graphics)
			builder.AddTexture(Key, Value);

		return builder.Create(bytesPerPixel);
	}

	static CreatePalette(paletteProvider, ...additionalPalettes) {
		const paletteBuilder = factory.Create();
		let index = 0;

		for (const [, Value] of paletteProvider.Palettes)
			paletteBuilder.AddTexture(index++, Value);

		if (additionalPalettes != null && additionalPalettes.length !== 0 && additionalPalettes[0] != null) {
			for (const palette of additionalPalettes)
				paletteBuilder.AddTexture(index++, palette);
		}

		return paletteBuilder.CreateUnpacked(32, 4).Texture;
	}

	/** Returns a KeyValuePair as { Key, Value } */
	static CreateUIOnly(graphicProvider, fontProvider) {
		const textureAtlasManager = new TextureAtlasManager();

		return {
			Key: textureAtlasManager,
			Value: () => {
				textureAtlasManager.AddUI(graphicProvider, new Map(), false);
				textureAtlasManager.AddCursors(graphicProvider);
				textureAtlasManager.AddFont(fontProvider);
			}
		};
	}

	static CreateEmpty() {
		return new TextureAtlasManager();
	}

	AddUIOnly(graphicInfoProvider, fontProvider) {
		const uiGraphicAtlases = new Map();

		this.AddUI(graphicInfoProvider, uiGraphicAtlases, false);
		this.AddCursors(graphicInfoProvider);
		this.AddFont(fontProvider);

		if (isGraphicAtlasProvider(graphicInfoProvider))
			this.AddAtlases(Layer.UI, uiGraphicAtlases);
	}

	AddUI(graphicInfoProvider, uiGraphicAtlases, withLayout = true) {
		if (withLayout) {
			if (isGraphicProvider(graphicInfoProvider)) {
				const graphicProvider1 = graphicInfoProvider;
				const layoutGraphics = graphicProvider1.GetGraphics(GraphicType.Layout);

				for (let i = 0; i < layoutGraphics.length; ++i)
					this.AddTexture(Layer.UI, Graphics.LayoutOffset + i, layoutGraphics[i]);
			} else if (isGraphicAtlasProvider(graphicInfoProvider)) {
				const graphicAtlasProvider = graphicInfoProvider;
				addToDictionary(uiGraphicAtlases, Graphics.LayoutOffset, graphicAtlasProvider.GetGraphicAtlas(GraphicType.Layout));
			}
		}

		if (isGraphicProvider(graphicInfoProvider)) {
			const graphicProvider = graphicInfoProvider;
			const uiElementGraphics = graphicProvider.GetGraphics(GraphicType.UIElements);

			for (let i = 0; i < uiElementGraphics.length; ++i) {
				this.AddTexture(Layer.UI, Graphics.UICustomGraphicOffset + i, uiElementGraphics[i]);
			}
			this.AddTexture(Layer.UI, Graphics.UICustomGraphicOffset + uiElementGraphics.length, GameCore.AutoBattleButton);
		} else if (isGraphicAtlasProvider(graphicInfoProvider)) {
			const graphicAtlasProvider = graphicInfoProvider;
			const uiElementGraphicAtlas = graphicAtlasProvider.GetGraphicAtlas(GraphicType.UIElements);

			// The last entry is the sword and mace image for the battle window.
			const oldSwordAndMaceKey = max(uiElementGraphicAtlas.Offsets.keys());
			const newSwordAndMaceKey = Graphics.CombatGraphicOffset + CombatGraphicIndex.UISwordAndMace - Graphics.UICustomGraphicOffset;

			if (oldSwordAndMaceKey !== newSwordAndMaceKey) {
				uiElementGraphicAtlas.Offsets.set(newSwordAndMaceKey, getValue(uiElementGraphicAtlas.Offsets, oldSwordAndMaceKey));
				uiElementGraphicAtlas.Offsets.delete(oldSwordAndMaceKey);
			}

			addToDictionary(uiGraphicAtlases, Graphics.UICustomGraphicOffset, uiElementGraphicAtlas);
		}
	}

	AddCursors(graphicInfoProvider) {
		if (isGraphicProvider(graphicInfoProvider)) {
			const graphicProvider = graphicInfoProvider;
			const cursorGraphics = graphicProvider.GetGraphics(GraphicType.Cursor);

			for (let i = 0; i < cursorGraphics.length; ++i)
				this.AddTexture(Layer.Cursor, i, cursorGraphics[i]);
		} else if (isGraphicAtlasProvider(graphicInfoProvider)) {
			const graphicAtlasProvider = graphicInfoProvider;
			this.AddAtlas(Layer.Cursor, graphicAtlasProvider.GetGraphicAtlas(GraphicType.Cursor));
		}
	}

	AddFont(fontProvider) {
		const font = fontProvider.GetFont();

		for (let i = 0; i < font.GlyphCount; ++i) {
			const glyphGraphic = font.GetGlyphGraphic(i);

			this.AddTexture(Layer.Text, i, glyphGraphic);
			this.AddTexture(Layer.SubPixelText, i, glyphGraphic);
		}

		// Add simple digits for damage display
		for (let i = 0; i < 10; ++i)
			this.AddTexture(Layer.SmallDigits, i, font.GetDigitGlyphGraphic(i));
	}

	ReplaceGraphic(layer, index, graphic) {
		if (this.atlas.has(layer))
			throw new AmbermoonException(ExceptionScope.Application, `Texture atlas already created for layer ${enumName(Layer, layer)}.`);

		const [found, builder] = tryGetValue(this.atlasBuilders, layer);

		if (!found)
			throw new AmbermoonException(ExceptionScope.Application, `No texture atlas builder for layer ${enumName(Layer, layer)}.`);

		builder.ReplaceTexture(index, graphic);
	}

	AddAll(gameData, graphicInfoProvider, fontProvider, introTextGlyphs, introLargeTextGlyphs,
		introGraphics, features, numTilesets) {
		if (gameData == null)
			throw new ArgumentNullException('gameData');
		if (graphicInfoProvider == null)
			throw new ArgumentNullException('graphicInfoProvider');

		const graphicProvider = isGraphicProvider(graphicInfoProvider) ? graphicInfoProvider : null;
		const graphicAtlasProvider = isGraphicAtlasProvider(graphicInfoProvider) ? graphicInfoProvider : null;

		if (graphicProvider == null && graphicAtlasProvider == null)
			throw new AmbermoonException(ExceptionScope.Application, 'GraphicInfoProvider must implement IGraphicProvider or IGraphicAtlasProvider.');

		// #region Map 2D

		if (graphicProvider != null) {
			for (let i = 0; i < numTilesets; ++i) {
				const tilesetGraphics = graphicProvider.GetGraphics(GraphicType.Tileset1 + i);

				for (let graphicIndex = 0; graphicIndex < tilesetGraphics.length; ++graphicIndex) {
					this.AddTexture(Layer.MapBackground1 + i, graphicIndex, tilesetGraphics[graphicIndex]);
					this.AddTexture(Layer.MapForeground1 + i, graphicIndex, tilesetGraphics[graphicIndex]);
				}
			}
		} else {
			for (let i = 0; i < numTilesets; ++i) {
				const atlas = graphicAtlasProvider.GetGraphicAtlas(GraphicType.Tileset1 + i);

				this.AddAtlas(Layer.MapBackground1 + i, atlas);
				this.AddAtlas(Layer.MapForeground1 + i, atlas);
			}
		}

		// #endregion

		// #region Player 2D

		if (graphicProvider != null) {
			const playerGraphics = graphicProvider.GetGraphics(GraphicType.Player);

			if (playerGraphics.length !== 3 * 17)
				throw new AmbermoonException(ExceptionScope.Data, 'Wrong number of player graphics.');

			// There are 3 player characters (one for each world, first lyramion, second forest moon, third morag).
			// Each has 17 frames: 3 back, 3 right, 3 front, 3 left, 1 sit back, 1 sit right, 1 sit front, 1 sit left, 1 bed/sleep.
			// All have a dimension of 16x32 pixels.
			for (let i = 0; i < playerGraphics.length; ++i)
				this.AddTexture(Layer.Characters, i, playerGraphics[i]);

			// On world maps the travel graphics are used.
			// Only 4 sprites are used (one for each direction).
			const travelGraphics = graphicProvider.GetGraphics(GraphicType.TravelGfx);
			const count = hasFlag(features, Features.WaspTransport) ? 12 : 11;

			if (travelGraphics.length !== count * 4)
				throw new AmbermoonException(ExceptionScope.Data, 'Wrong number of travel graphics.');

			for (let i = 0; i < travelGraphics.length; ++i)
				this.AddTexture(Layer.Characters, Graphics.TravelGraphicOffset + i, travelGraphics[i]);

			const transportGraphics = graphicProvider.GetGraphics(GraphicType.Transports);

			if (transportGraphics.length !== 5)
				throw new AmbermoonException(ExceptionScope.Data, 'Wrong number of transport graphics.');

			for (let i = 0; i < transportGraphics.length; ++i)
				this.AddTexture(Layer.Characters, Graphics.TransportGraphicOffset + i, transportGraphics[i]);

			const npcGraphics = graphicProvider.GetGraphics(GraphicType.NPC);

			if (npcGraphics.length < 34)
				throw new AmbermoonException(ExceptionScope.Data, 'Wrong number of NPC graphics.');

			for (let i = 0; i < npcGraphics.length; ++i)
				this.AddTexture(Layer.Characters, Graphics.NPCGraphicOffset + i, npcGraphics[i]);
		} else {
			this.AddAtlases(Layer.Characters,
				{ Offset: 0, Atlas: graphicAtlasProvider.GetGraphicAtlas(GraphicType.Player) },
				{ Offset: Graphics.TravelGraphicOffset, Atlas: graphicAtlasProvider.GetGraphicAtlas(GraphicType.TravelGfx) },
				{ Offset: Graphics.TransportGraphicOffset, Atlas: graphicAtlasProvider.GetGraphicAtlas(GraphicType.Transports) },
				{ Offset: Graphics.NPCGraphicOffset, Atlas: graphicAtlasProvider.GetGraphicAtlas(GraphicType.NPC) });
		}

		// #endregion

		// #region UI Layout

		const uiGraphicAtlases = new Map();

		this.AddUI(graphicInfoProvider, uiGraphicAtlases);

		// #endregion

		// #region Portraits

		if (graphicProvider != null) {
			const portraits = graphicProvider.GetGraphics(GraphicType.Portrait);

			for (let i = 0; i < portraits.length; ++i)
				this.AddTexture(Layer.UI, Graphics.PortraitOffset + i, portraits[i]);
		} else {
			addToDictionary(uiGraphicAtlases, Graphics.PortraitOffset, graphicAtlasProvider.GetGraphicAtlas(GraphicType.Portrait));
		}

		// #endregion

		// #region Pics 80x80

		if (graphicProvider != null) {
			const pics80x80Graphics = graphicProvider.GetGraphics(GraphicType.Pics80x80);

			for (let i = 0; i < pics80x80Graphics.length; ++i)
				this.AddTexture(Layer.UI, Graphics.Pics80x80Offset + i, pics80x80Graphics[i]);
		} else {
			addToDictionary(uiGraphicAtlases, Graphics.Pics80x80Offset, graphicAtlasProvider.GetGraphicAtlas(GraphicType.Pics80x80));
		}

		// #endregion

		// #region Event pix

		if (graphicProvider != null) {
			const eventGraphics = graphicProvider.GetGraphics(GraphicType.EventPictures);

			for (let i = 0; i < eventGraphics.length; ++i) {
				eventGraphics[i].ReplaceColor(0, 32); // Black instead of transparent
				this.AddTexture(Layer.UI, Graphics.EventPictureOffset + i, eventGraphics[i]);
			}
		} else {
			// Note: We assume, that the new graphic atlas format will
			// take care of the color replacement already!
			addToDictionary(uiGraphicAtlases, Graphics.EventPictureOffset, graphicAtlasProvider.GetGraphicAtlas(GraphicType.EventPictures));
		}

		// web port: additional UI graphics of other games (Amberstar altar, see src/amberstar/extensions)
		for (const [key, graphic] of gameData.ExtraUIGraphics ?? [])
			this.AddTexture(Layer.UI, Graphics.ExtraUIGraphicOffset + key, graphic);

		// #endregion

		// #region Text

		this.AddFont(fontProvider);

		// #endregion

		// #region Items

		if (graphicProvider != null) {
			const itemGraphics = graphicProvider.GetGraphics(GraphicType.Item);

			for (let i = 0; i < itemGraphics.length; ++i)
				this.AddTexture(Layer.Items, i, itemGraphics[i]);
		} else {
			this.AddAtlas(Layer.Items, graphicAtlasProvider.GetGraphicAtlas(GraphicType.Item));
		}

		// #endregion

		// #region Cursors

		this.AddCursors(graphicInfoProvider);

		// #endregion

		// #region Combat backgrounds

		if (graphicProvider != null) {
			const combatBackgrounds = graphicProvider.GetGraphics(GraphicType.CombatBackground);

			for (let i = 0; i < combatBackgrounds.length; ++i)
				this.AddTexture(Layer.CombatBackground, i, combatBackgrounds[i]);
		} else {
			this.AddAtlas(Layer.CombatBackground, graphicAtlasProvider.GetGraphicAtlas(GraphicType.CombatBackground));
		}

		// #endregion

		// #region Combat graphics (without battle field icons)

		if (graphicProvider != null) {
			const combatGraphics = graphicProvider.GetGraphics(GraphicType.CombatGraphics);

			for (let i = 0; i < combatGraphics.length; ++i) {
				// Note: One graphic is an UI element so we put it into the UI layer. The rest goes into the BattleEffects layer.
				this.AddTexture(i === CombatGraphicIndex.UISwordAndMace ? Layer.UI : Layer.BattleEffects, Graphics.CombatGraphicOffset + i, combatGraphics[i]);
			}
		} else {
			// NOTE: The new graphic atlas format will include the Sword and Mace image in the custom UI elements.
			// So here we only handle the battle effects graphics.
			this.AddAtlas(Layer.BattleEffects, graphicAtlasProvider.GetGraphicAtlas(GraphicType.CombatGraphics), Graphics.CombatGraphicOffset);
		}

		// #endregion

		// #region Battle field icons

		if (graphicProvider != null) {
			const battleFieldIcons = graphicProvider.GetGraphics(GraphicType.BattleFieldIcons);

			for (let i = 0; i < battleFieldIcons.length; ++i) {
				this.AddTexture(Layer.UI, Graphics.BattleFieldIconOffset + i, battleFieldIcons[i]);
			}
		} else {
			addToDictionary(uiGraphicAtlases, Graphics.BattleFieldIconOffset, graphicAtlasProvider.GetGraphicAtlas(GraphicType.BattleFieldIcons));
		}

		// #endregion

		// #region Automap graphics

		if (graphicProvider != null) {
			const automapGraphics = graphicProvider.GetGraphics(GraphicType.AutomapGraphics);

			for (let i = 0; i < automapGraphics.length; ++i)
				this.AddTexture(Layer.UI, Graphics.AutomapOffset + i, automapGraphics[i]);
		} else {
			addToDictionary(uiGraphicAtlases, Graphics.AutomapOffset, graphicAtlasProvider.GetGraphicAtlas(GraphicType.AutomapGraphics));
		}

		// #endregion

		// #region Riddlemouth graphics

		if (graphicProvider != null) {
			const riddlemouthGraphics = graphicProvider.GetGraphics(GraphicType.RiddlemouthGraphics);

			for (let i = 0; i < riddlemouthGraphics.length; ++i)
				this.AddTexture(Layer.UI, Graphics.RiddlemouthOffset + i, riddlemouthGraphics[i]);
		} else {
			addToDictionary(uiGraphicAtlases, Graphics.RiddlemouthOffset, graphicAtlasProvider.GetGraphicAtlas(GraphicType.RiddlemouthGraphics));
		}

		// #endregion

		// #region Intro Text

		for (const [Key, Value] of introTextGlyphs)
			this.AddTexture(Layer.IntroText, Key, Value);
		for (const [Key, Value] of introLargeTextGlyphs) {
			this.AddTexture(Layer.IntroText, Key, Value);
			this.AddTexture(Layer.MainMenuText, Key, Value);
		}

		// #endregion

		// #region Intro Graphics

		for (const [Key, Value] of introGraphics) {
			switch (Key) {
				case IntroGraphic.MainMenuBackground:
				case IntroGraphic.CloudsLeft:
				case IntroGraphic.CloudsRight:
					// We only need the background for the main menu and the clouds from the intro.
					// The intro does not need them as they only use the main menu layers.
					this.AddTexture(Layer.MainMenuGraphics, Key, Value);
					break;
				default:
					this.AddTexture(Layer.IntroGraphics, Key, Value);
					break;
			}
		}

		// #endregion

		if (graphicAtlasProvider != null)
			this.AddAtlases(Layer.UI, uiGraphicAtlases);
	}
}

/** Dictionary.Add (throws on duplicate keys like .NET) */
function addToDictionary(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}
