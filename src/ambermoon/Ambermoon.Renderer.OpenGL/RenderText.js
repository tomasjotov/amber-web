// Port of Ambermoon.Renderer.OpenGL/RenderText.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// RenderText.cs - Text render node (one sprite per glyph)

import { getValue, toByte } from '../../runtime.js';
import { Position } from '../Ambermoon.Common/Position.js';
import { Size } from '../Ambermoon.Common/Size.js';
import { Rect } from '../Ambermoon.Common/Rect.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { Color as TextColor } from '../Ambermoon.Data.Common/Enumerations/Color.js';
import { SpecialGlyph } from '../Ambermoon.Data.Common/IText.js';
import { TextAlign } from '../Ambermoon.Core/Render/TextAlign.js';
import { RenderNode } from './RenderNode.js';
import { TextCharacterSprite } from './Sprite.js';

const CharacterWidth = 6;
const LineHeight = 7;
const CharacterHeight = LineHeight; // important to show lower diacritics

export class RenderText extends RenderNode {
	static CharacterWidth = CharacterWidth;
	static CharacterHeight = CharacterHeight; // important to show lower diacritics
	static LineHeight = LineHeight;
	static get ShadowColorIndex() { return TextColor.Black; }

	/**
	 * new RenderText(defaultTextPaletteIndex, virtualScreen, glyphTextureMapping)
	 * new RenderText(defaultTextPaletteIndex, virtualScreen, glyphTextureMapping, layer, text, textColor, shadow)
	 * new RenderText(defaultTextPaletteIndex, virtualScreen, glyphTextureMapping, layer, text, textColor, shadow, bounds, textAlign,
	 *     characterWidth = CharacterWidth, characterHeight = CharacterHeight, lineHeight = LineHeight)
	 *
	 * glyphTextureMapping: Map<byte, Position>
	 */
	constructor(defaultTextPaletteIndex, virtualScreen, glyphTextureMapping, layer, text, textColor, shadow, bounds, textAlign,
		characterWidth = CharacterWidth, characterHeight = CharacterHeight, lineHeight = LineHeight) {
		const overload = arguments.length <= 3 ? 1 : arguments.length <= 7 ? 2 : 3;

		if (overload === 1)
			super(0, 0, virtualScreen);
		else if (overload === 2)
			super(text.MaxLineSize * CharacterWidth, text.LineCount * CharacterHeight - (LineHeight - CharacterHeight), virtualScreen);
		else
			super(text.MaxLineSize * characterWidth, text.LineCount * characterHeight - (lineHeight - characterHeight), virtualScreen);

		// field initializers
		this.drawIndex = -1;
		this.displayLayer = 0;
		this.paletteIndex = 0;
		this.textColor = 0;
		this.shadow = false;
		this.text = null;
		this.bounds = null;
		this.textAlign = TextAlign.Left;
		this.characterShadowSprites = [];
		this.characterSprites = [];
		this.glyphTextureMapping = null;
		this.characterPositions = null;
		this.lastCharacterToRender = -1;
		this.updatingPositions = false;
		this.characterWidth = CharacterWidth;
		this.characterHeight = CharacterHeight;
		this.lineHeight = LineHeight;

		this.paletteIndex = defaultTextPaletteIndex;
		this.glyphTextureMapping = glyphTextureMapping;

		if (overload === 1) {
			this.bounds = virtualScreen;
		} else if (overload === 2) {
			this.bounds = virtualScreen;
			this.Layer = layer;
			this.Text = text;
			this.TextColor = textColor;
			this.Shadow = shadow;
		} else {
			this.bounds = bounds;
			this.textAlign = textAlign;
			this.Layer = layer;
			this.Text = text;
			this.TextColor = textColor;
			this.Shadow = shadow;
			this.X = bounds.Left;
			this.Y = bounds.Top;
			this.characterWidth = characterWidth;
			this.characterHeight = characterHeight;
			this.lineHeight = lineHeight;
		}
	}

	get DisplayLayer() {
		return this.displayLayer;
	}

	set DisplayLayer(value) {
		if (this.displayLayer === value)
			return;

		this.displayLayer = value;

		this.UpdateDisplayLayer();
	}

	get PaletteIndex() {
		return this.paletteIndex;
	}

	set PaletteIndex(value) {
		if (this.paletteIndex === value)
			return;

		this.paletteIndex = value;

		this.UpdatePaletteIndex();
	}

	get TextColor() {
		return this.textColor;
	}

	set TextColor(value) {
		if (this.textColor === value)
			return;

		this.textColor = value;

		for (const sprite of this.characterSprites) {
			sprite.TextColorIndex = toByte(this.textColor);
			sprite.UpdateTextColorIndex();
		}
	}

	get TextAlign() {
		return this.textAlign;
	}

	set TextAlign(value) {
		if (this.textAlign === value)
			return;

		this.textAlign = value;

		this.UpdateTextSprites();
	}

	get Shadow() {
		return this.shadow;
	}

	set Shadow(value) {
		if (this.shadow === value)
			return;

		this.shadow = value;
		this.UpdateTextSprites();
	}

	get Text() {
		return this.text;
	}

	set Text(value) {
		if (this.text === value)
			return;

		this.text = value;

		this.UpdateTextSprites();
	}

	/** Override of the virtual CheckOnScreen() (uses the text bounds). */
	CheckOnScreen(bounds) {
		if (arguments.length === 0)
			return super.CheckOnScreen(this.bounds);

		return super.CheckOnScreen(bounds);
	}

	GetTextColorPerLine(text = null) {
		text ??= this.text;
		const lineColors = [];
		let color = this.TextColor;

		for (const line of text.Lines) {
			if (line.length === 0) {
				lineColors.push(color);
				continue;
			}

			for (const b of line) {
				if (b < SpecialGlyph.SoftSpace) {
					lineColors.push(color);
					break;
				} else if (b >= SpecialGlyph.FirstColor) {
					lineColors.push(b - SpecialGlyph.FirstColor);
					break;
				}
			}

			// Use the last color specification in line if any for following lines
			let lastColorSpec = 0;

			for (let i = line.length - 1; i >= 0; --i) {
				if (line[i] >= SpecialGlyph.FirstColor) {
					lastColorSpec = line[i];
					break;
				}
			}

			if (lastColorSpec !== 0)
				color = lastColorSpec - SpecialGlyph.FirstColor;
		}

		return lineColors;
	}

	UpdateDisplayLayer() {
		const textDisplayLayer = toByte(Util.Min(255, this.DisplayLayer + 2)); // draw above shadow a bit

		this.characterSprites.forEach(s => s.DisplayLayer = textDisplayLayer);
		this.characterShadowSprites.forEach(s => s.DisplayLayer = this.DisplayLayer);
	}

	UpdatePaletteIndex() {
		this.characterSprites.forEach(s => s.PaletteIndex = this.PaletteIndex);
		this.characterShadowSprites.forEach(s => s.PaletteIndex = this.PaletteIndex);
	}

	UpdateCharacterPositions() {
		if (this.updatingPositions)
			return false;

		this.updatingPositions = true;

		if (this.X === 32767 || this.Y === 32767) { // not on screen
			this.lastCharacterToRender = -1;
			this.characterPositions = null;
			this.Resize(0, 0);
			this.updatingPositions = false;
			return false;
		}

		const text = this.text;
		const bounds = this.bounds;
		const characterPositions = new Array(text.GlyphIndices.length).fill(null);
		let x = this.X;
		let y = this.Y;
		let width = 0;
		let lastWhitespaceIndex = -1;
		let lastLineBreakIndex = -1;
		this.characterPositions = characterPositions;
		this.lastCharacterToRender = -1;
		let numEmptyCharacterInLine = 0; // e.g. color swaps

		const NewLine = () => {
			if (x > this.X + width)
				width = x - this.X;

			x = this.X;
			y += this.lineHeight;
			numEmptyCharacterInLine = 0;

			return y + this.characterHeight - 1 <= bounds.Bottom;
		};

		const AdjustLineAlign = (lineEndGlyphIndex) => {
			if (this.textAlign === TextAlign.Left)
				return;

			const remainingWidth = bounds.Width - (lineEndGlyphIndex - lastLineBreakIndex - numEmptyCharacterInLine) * this.characterWidth;
			const adjustment = this.textAlign === TextAlign.Right
				? remainingWidth
				: Math.trunc(remainingWidth / 2); // center

			for (let i = lastLineBreakIndex + 1; i <= lineEndGlyphIndex; ++i) {
				if (characterPositions[i] != null)
					characterPositions[i].X += adjustment;
			}
		};

		for (let i = 0; i < text.GlyphIndices.length; ++i) {
			const glyphIndex = text.GlyphIndices[i];

			if (glyphIndex >= SpecialGlyph.NoTrim) {
				++numEmptyCharacterInLine;
				continue;
			}

			// Space is not rendered.
			// $ is used for non-breaking (hard) space. Also not rendered.
			// ^ is used as a line-break. Also not rendered.
			if (glyphIndex === SpecialGlyph.SoftSpace || glyphIndex === SpecialGlyph.HardSpace) {
				lastWhitespaceIndex = i;
				x += this.characterWidth;

				if (x + this.characterWidth - 1 >= bounds.Right && i + 1 < text.GlyphIndices.length && text.GlyphIndices[i + 1] !== SpecialGlyph.NewLine) {
					AdjustLineAlign(i - 1);
					lastLineBreakIndex = i;

					if (!NewLine())
						break; // nothing more to draw
				}

				continue;
			}
			if (glyphIndex === SpecialGlyph.NewLine) {
				lastWhitespaceIndex = i;
				AdjustLineAlign(i - 1);
				lastLineBreakIndex = i;

				if (!NewLine())
					break; // nothing more to draw

				continue;
			}

			characterPositions[i] = new Position(x, y);

			x += this.characterWidth;

			if (x > bounds.Right) { // the character didn't fit into the line -> move the whole word to next line
				const nextLineVisible = NewLine();
				AdjustLineAlign(lastWhitespaceIndex - 1);
				lastLineBreakIndex = lastWhitespaceIndex;

				for (let j = lastWhitespaceIndex + 1; j <= i; ++j) {
					if (nextLineVisible)
						characterPositions[i] = null;
					else {
						characterPositions[i] = new Position(x, y);
						x += this.characterWidth;
					}
				}

				if (!nextLineVisible) {
					break; // nothing more to draw
				}
			}
		}

		if (x - bounds.Left > width)
			width = x - bounds.Left;

		this.Resize(width, y + this.characterHeight - this.Y);

		let lastIndex = -1;

		for (let i = characterPositions.length - 1; i >= 0; --i) {
			if (characterPositions[i] != null) {
				lastIndex = i;
				break;
			}
		}

		this.lastCharacterToRender = lastIndex;

		AdjustLineAlign(this.lastCharacterToRender);

		this.updatingPositions = false;

		return true;
	}

	UpdateTextSprites() {
		this.characterSprites.forEach(s => s?.Delete());
		this.characterSprites.length = 0;
		this.characterShadowSprites.forEach(s => s?.Delete());
		this.characterShadowSprites.length = 0;

		if (this.text == null)
			return;

		if (!this.UpdateCharacterPositions())
			return;

		let colorIndex = toByte(this.TextColor);

		for (let i = 0; i <= this.lastCharacterToRender; ++i) {
			const glyphIndex = this.text.GlyphIndices[i];

			if (glyphIndex === SpecialGlyph.NoTrim)
				continue;

			if (glyphIndex >= SpecialGlyph.FirstColor) {
				colorIndex = toByte(glyphIndex - SpecialGlyph.FirstColor);

				if (colorIndex === 32) // Special -> default color
					colorIndex = toByte(this.TextColor);
			}

			if (this.characterPositions[i] == null)
				continue;

			const position = this.characterPositions[i];
			const textureCoord = getValue(this.glyphTextureMapping, glyphIndex);
			const sprite = new TextCharacterSprite(this.characterWidth, this.characterHeight, textureCoord.X, textureCoord.Y, this.virtualScreen,
				toByte(Util.Min(255, this.DisplayLayer + 2))); // ensure to draw it in front of the shadow
			sprite.TextColorIndex = colorIndex;
			sprite.X = position.X;
			sprite.Y = position.Y;
			sprite.Layer = this.Layer;
			sprite.PaletteIndex = this.PaletteIndex;
			sprite.Visible = this.Visible;
			sprite.ClipArea = this.ClipArea;
			sprite.TextureSize = new Size(this.characterWidth, this.characterHeight);

			this.characterSprites.push(sprite);
		}

		if (this.Shadow) {
			for (const characterSprite of this.characterSprites) {
				const shadowSprite = new TextCharacterSprite(this.characterWidth, this.characterHeight,
					characterSprite.TextureAtlasOffset.X, characterSprite.TextureAtlasOffset.Y,
					this.virtualScreen, this.DisplayLayer);
				shadowSprite.TextColorIndex = RenderText.ShadowColorIndex;
				shadowSprite.X = characterSprite.X + 1;
				shadowSprite.Y = characterSprite.Y + 1;
				shadowSprite.Layer = this.Layer;
				shadowSprite.PaletteIndex = this.PaletteIndex;
				shadowSprite.Visible = this.Visible;
				shadowSprite.TextureSize = new Size(this.characterWidth, this.characterHeight);
				shadowSprite.ClipArea = this.ClipArea;

				this.characterShadowSprites.push(shadowSprite);
			}
		}
	}

	/**
	 * Place(x, y) or Place(rect, textAlign = TextAlign.Left)
	 */
	Place(rectOrX, yOrTextAlign) {
		if (typeof rectOrX === 'number') {
			const x = rectOrX;
			const y = yOrTextAlign;
			this.Place(new Rect(x, y, this.virtualScreen.Right - x, this.virtualScreen.Bottom - y));
			return;
		}

		const rect = rectOrX;
		const textAlign = yOrTextAlign ?? TextAlign.Left;

		if (this.X !== rect.Left || this.Y !== rect.Top || !Rect.op_Equality(this.bounds, rect) || this.textAlign !== textAlign) {
			this.X = rect.Left;
			this.Y = rect.Top;
			this.bounds = rect;
			this.textAlign = textAlign;
			this.UpdateTextSprites();
		}
	}

	OnVisibilityChanged() {
		if (this.Visible)
			this.UpdateTextSprites(); // this automatically set sprite.Visible to true
		else
			this.RemoveFromLayer();
	}

	AddToLayer() {
		for (const sprite of this.characterShadowSprites)
			sprite.Visible = true;
		for (const sprite of this.characterSprites)
			sprite.Visible = true;
	}

	RemoveFromLayer() {
		for (const sprite of this.characterShadowSprites)
			sprite.Visible = false;
		for (const sprite of this.characterSprites)
			sprite.Visible = false;
	}

	UpdatePosition() {
		this.UpdateTextSprites();

		for (const sprite of this.characterShadowSprites)
			sprite.Visible = this.Visible && sprite.InsideClipArea(this.ClipArea);
		for (const sprite of this.characterSprites)
			sprite.Visible = this.Visible && sprite.InsideClipArea(this.ClipArea);
	}

	OnClipAreaChanged(onScreen, needUpdate) {
		if (onScreen && needUpdate) {
			this.UpdateTextSprites();
		}
	}
}

const DigitWidth = 5;
const DigitHeight = 5;

class DigitText extends RenderText {
	constructor(defaultTextPaletteIndex, virtualScreen, glyphTextureMapping, layer, digits, textColor, shadow, bounds, textAlign) {
		super(defaultTextPaletteIndex, virtualScreen, glyphTextureMapping, layer, digits, textColor, shadow, bounds, textAlign, DigitWidth, DigitHeight, DigitHeight);
	}
}

export class RenderTextFactory {
	constructor(virtualScreen) {
		this.VirtualScreen = virtualScreen;

		/** Map<byte, Position> */
		this.GlyphTextureMapping = null;
		/** Map<byte, Position> */
		this.DigitGlyphTextureMapping = null;
	}

	static DigitText = DigitText;

	/**
	 * Create(defaultTextPaletteIndex)
	 * Create(defaultTextPaletteIndex, layer, text, textColor, shadow)
	 * Create(defaultTextPaletteIndex, layer, text, textColor, shadow, bounds, textAlign = TextAlign.Left)
	 * Create(defaultTextPaletteIndex, layer, text, textColor, shadow, bounds, positionFactor, sizeFactor, textAlign = TextAlign.Left)
	 */
	Create(defaultTextPaletteIndex, layer, text, textColor, shadow, bounds, a, b, c) {
		const VirtualScreen = this.VirtualScreen;

		if (arguments.length <= 1)
			return new RenderText(defaultTextPaletteIndex, VirtualScreen, this.GlyphTextureMapping);

		if (arguments.length <= 5)
			return new RenderText(defaultTextPaletteIndex, VirtualScreen, this.GlyphTextureMapping, layer, text, textColor, shadow);

		if (arguments.length <= 7) {
			const textAlign = a ?? TextAlign.Left;
			return new RenderText(defaultTextPaletteIndex, VirtualScreen, this.GlyphTextureMapping, layer, text, textColor, shadow, bounds, textAlign);
		}

		const positionFactor = a;
		const sizeFactor = b;
		const textAlign = c ?? TextAlign.Left;

		return new RenderText(defaultTextPaletteIndex,
			new Rect(Position.op_Multiply(positionFactor, VirtualScreen.Position), Size.op_Multiply(sizeFactor, VirtualScreen.Size)),
			this.GlyphTextureMapping, layer, text, textColor, shadow,
			new Rect(Position.op_Multiply(positionFactor, bounds.Position), Size.op_Multiply(sizeFactor, bounds.Size)),
			textAlign, sizeFactor * RenderText.CharacterWidth, sizeFactor * RenderText.CharacterHeight, sizeFactor * RenderText.LineHeight);
	}

	CreateDigits(defaultTextPaletteIndex, layer, digits, textColor, shadow, bounds, textAlign = TextAlign.Left) {
		return new DigitText(defaultTextPaletteIndex, this.VirtualScreen, this.DigitGlyphTextureMapping, layer, digits, textColor, shadow, bounds, textAlign);
	}
}
