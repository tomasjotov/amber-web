// Port of Ambermoon.net/Font.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
import { toByte, tryGetValue, getValue, orderBy } from '../../runtime.js';
import { Graphic } from '../Ambermoon.Data.Common/Graphic.js';
import { Glyph } from '../Ambermoon.Data.Common/Glyph.js';
import { TextProcessor } from '../Ambermoon.Data.Legacy/Text.js';
import { Color as TextColor } from '../Ambermoon.Data.Common/Enumerations/Color.js';
import { Rect } from '../Ambermoon.Common/Rect.js';
import { TextAlign } from '../Ambermoon.Core/Render/TextAlign.js';
import { TextureAtlasManager } from '../Ambermoon.Core/Render/TextureAtlasManager.js';

/** char.ToUpper (single char, never expands like 'ß' -> 'SS' in JS) */
function toUpperChar(ch) {
	const upper = ch.toUpperCase();
	return upper.length === 1 ? upper : ch;
}

/** string.ToUpper with .NET like per char mapping */
function toUpperString(text) {
	let result = '';
	for (let i = 0; i < text.length; ++i)
		result += toUpperChar(text[i]);
	return result;
}

export class Text {
	constructor(renderView, layer, text, glyphs, characters, displayLayer, spaceWidth, upperOnly, textureAtlasIndexOffset,
		alpha = 255, clipArea = null) {
		this.renderGlyphs = [];
		this.visible = false;
		this.totalWidth = 0;
		this.baseX = 0;
		this.textColor = TextColor.White;
		this.alpha = 255;
		this.clipArea = null;

		this.totalWidth = 0;
		this.alpha = alpha;
		this.clipArea = clipArea;
		const textureAtlas = TextureAtlasManager.Instance.GetOrCreate(layer);

		if (upperOnly)
			text = toUpperString(text);

		for (let c = 0; c < text.length; ++c) {
			const ch = text[c];

			if (ch === ' ')
				this.totalWidth += spaceWidth;
			else {
				const [found, glyph] = tryGetValue(glyphs, ch);

				if (found) {
					const sprite = renderView.SpriteFactory.CreateWithAlpha(glyph.Graphic.Width, glyph.Graphic.Height, displayLayer);
					sprite.TextureAtlasOffset = textureAtlas.GetOffset(characters.indexOf(ch) + textureAtlasIndexOffset);
					sprite.Alpha = alpha;
					sprite.ClipArea = clipArea;
					sprite.X = this.totalWidth;
					sprite.Y = 0;
					sprite.Layer = renderView.GetLayer(layer);
					sprite.PaletteIndex = toByte(renderView.GraphicInfoProvider.PrimaryUIPaletteIndex - 1);
					sprite.Visible = false;
					this.renderGlyphs.push(sprite);
					this.totalWidth += glyph.Advance;
				}
			}
		}
	}

	get TextColor() {
		return this.textColor;
	}

	set TextColor(value) {
		if (this.textColor === value)
			return;

		this.textColor = value;
		this.renderGlyphs?.forEach(g => { if (g != null) g.MaskColor = toByte(this.textColor); });
	}

	get Alpha() {
		return this.alpha;
	}

	set Alpha(value) {
		if (this.alpha === value)
			return;

		this.alpha = value;
		this.renderGlyphs?.forEach(g => { if (g != null) g.Alpha = this.alpha; });
	}

	get ClipArea() {
		return this.clipArea;
	}

	set ClipArea(value) {
		if (Rect.op_Equality(this.clipArea, value))
			return;

		this.clipArea = value;
		this.renderGlyphs?.forEach(g => { if (g != null) g.ClipArea = this.clipArea; });
	}

	Move(x, y) {
		this.renderGlyphs.forEach(g => { g.X += x; g.Y += y; });
	}

	Place(area, textAlign) {
		let xOffset = -this.baseX;

		switch (textAlign) {
			case TextAlign.Left:
				this.baseX = area.Left;
				break;
			case TextAlign.Center:
			{
				const offset = Math.trunc((area.Width - this.totalWidth) / 2);
				this.baseX = area.X + offset;
				break;
			}
			case TextAlign.Right:
				this.baseX = area.Right - this.totalWidth;
				break;
		}

		xOffset += this.baseX;

		this.renderGlyphs.forEach(g => { g.X += xOffset; g.Y = area.Y; });
	}

	get OnScreen() {
		return this.renderGlyphs == null ? false : this.renderGlyphs.some(g => g.Visible);
	}

	get Visible() {
		return this.visible;
	}

	set Visible(value) {
		if (this.visible === value)
			return;

		this.visible = value;
		this.renderGlyphs?.forEach(g => g.Visible = value);
	}

	Destroy() {
		this.renderGlyphs?.forEach(g => g?.Delete());
	}
}

class IngameFont {
	constructor(fontReader, digitFonts) {
		this.digitFonts = digitFonts;
		// 12x14 pixels per glyph
		const data = fontReader.ReadToEnd();
		const glyphCount = Math.trunc(data.length / (14 * 2)); // 14 pixels and 2 bytes per glyph width
		this.glyphGraphics = new Map();
		// We use 12x16 as it is mapped to the size 6x8.
		// The lower 2 pixels are empty for every character.
		for (let i = 0; i < glyphCount; ++i)
			this.glyphGraphics.set(i, new Graphic(12, 16, 0));
		let lineStart = 0;
		for (let y = 0; y < 14; ++y) {
			for (let g = 0; g < glyphCount; ++g) {
				const graphic = getValue(this.glyphGraphics, g);
				let mask = 0x80;
				let index = lineStart + g * 2;

				for (let x = 0; x < 8; ++x) {
					if ((data[index] & mask) !== 0)
						graphic.Data[x + y * 12] = 1;
					mask >>= 1;
				}

				mask = 0x80;
				++index;

				for (let x = 8; x < 12; ++x) {
					if ((data[index] & mask) !== 0)
						graphic.Data[x + y * 12] = 1;
					mask >>= 1;
				}
			}

			lineStart += glyphCount * 2;
		}
	}

	get GlyphCount() {
		return this.glyphGraphics.size;
	}

	// We add 1 "pixel" above but as the graphic is double the resolution
	// we actually have 2 additional pixels inside the graphic to place
	// accents etc.
	get GlyphHeight() {
		return 8;
	}

	GetGlyphGraphic(glyphIndex) {
		return getValue(this.glyphGraphics, glyphIndex);
	}

	GetDigitGlyphGraphic(glyphIndex) {
		return this.digitFonts.GetDigitGlyphGraphic(glyphIndex);
	}
}

export class IngameFontProvider {
	constructor(fontReader, digitFonts) {
		this.ingameFont = new IngameFont(fontReader, digitFonts);
	}

	GetFont() {
		return this.ingameFont;
	}
}

IngameFontProvider.IngameFont = IngameFont;

export class Font {
	/**
	 * Font(IReadOnlyDictionary<char, Glyph> glyphs, int spaceWidth, uint textureAtlasIndexOffset)
	 * Font(byte[] data, int spaceWidth)
	 */
	constructor(glyphsOrData, spaceWidth, textureAtlasIndexOffset) {
		this.textureAtlasIndexOffset = 0;

		if (!(glyphsOrData instanceof Uint8Array) && !Array.isArray(glyphsOrData)) {
			const glyphs = glyphsOrData;
			this.glyphs = glyphs;
			this.spaceWidth = spaceWidth;
			this.upperOnly = false;
			this.characters = orderBy(glyphs.keys(), k => k);
			this.textureAtlasIndexOffset = textureAtlasIndexOffset;
		} else {
			const data = glyphsOrData;
			const glyphs = new Map();
			this.spaceWidth = spaceWidth;
			this.upperOnly = true;
			let position = 0;
			const readByte = () => {
				if (position >= data.length)
					throw new Error('End of stream');
				return data[position++];
			};
			const LoadGraphic = (width, height) => {
				const graphic = new Graphic(width, height, 0);

				for (let y = 0; y < height; ++y) {
					for (let x = 0; x < Math.trunc(width / 8); ++x) {
						const bits = readByte();

						for (let b = 0; b < 8; ++b) {
							if ((bits & (1 << (7 - b))) !== 0)
								graphic.Data[x * 8 + b + y * width] = 2; // Color index 2 is white
						}
					}
				}

				return graphic;
			};

			while (position < data.length) {
				const ch = String.fromCharCode(readByte());
				const width = readByte();
				const height = readByte();
				const glyph = new Glyph();
				glyph.Advance = readByte();
				glyph.Graphic = LoadGraphic(width, height);
				if (glyphs.has(ch))
					throw new Error('An item with the same key has already been added.');
				glyphs.set(ch, glyph);
			}

			this.characters = orderBy(glyphs.keys(), k => k);

			this.glyphs = glyphs;
		}
	}

	get GlyphGraphics() {
		const result = new Map();
		orderBy(this.glyphs, g => g[0]).forEach((g, i) => {
			const key = this.textureAtlasIndexOffset + i;
			if (result.has(key))
				throw new Error('An item with the same key has already been added.');
			result.set(key, g[1].Graphic);
		});
		return result;
	}

	CreateText(renderView, layer, area, text, displayLayer, textAlign = TextAlign.Center, alpha = 255, clipArea = null) {
		const source = TextProcessor.RemoveDiacritics(text);
		let filtered = '';
		for (let i = 0; i < source.length; ++i) {
			const ch = source[i];
			if (ch === ' ' || this.glyphs.has(this.upperOnly ? toUpperChar(ch) : ch))
				filtered += ch;
		}
		text = filtered;
		const renderText = new Text(renderView, layer, text, this.glyphs, this.characters, displayLayer, this.spaceWidth, this.upperOnly,
			this.textureAtlasIndexOffset, alpha, clipArea);
		renderText.Place(area, textAlign);
		return renderText;
	}

	MeasureTextWidth(text) {
		let totalWidth = 0;
		const upper = toUpperString(text);

		for (let i = 0; i < upper.length; ++i) {
			const ch = upper[i];

			if (ch === ' ')
				totalWidth += this.spaceWidth;
			else
				totalWidth += getValue(this.glyphs, ch).Advance;
		}

		return totalWidth;
	}
}
