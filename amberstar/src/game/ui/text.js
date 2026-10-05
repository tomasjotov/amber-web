// Port of Amberstar.Game.UI.Text (TextManager, render texts, Label).
import { Layer } from '../../engine/layerSetup.js';
import { limit } from '../util.js';
import { EventEmitter } from '../util.js';

export const TextAlignment = { Left: 0, Center: 1, Right: 2 };

export const DefaultInkColorIndex = 15;
export const TransparentPaper = -1;
export const DefaultPaperColorIndex = TransparentPaper;
export const DefaultPaletteIndex = 0;
const TicksPerScroll = 4;

const UnicodeToAtariST = {
	'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'å': 0x86, 'ç': 0x87, 'ê': 0x88, 'ë': 0x89,
	'è': 0x8A, 'ï': 0x8B, 'î': 0x8C, 'ì': 0x8D, 'Ä': 0x8E, 'Å': 0x8F, 'É': 0x90, 'æ': 0x91, 'Æ': 0x92, 'ô': 0x93,
	'ö': 0x94, 'ò': 0x95, 'û': 0x96, 'ù': 0x97, 'ÿ': 0x98, 'Ö': 0x99, 'Ü': 0x9A, '¢': 0x9B, '£': 0x9C, '¥': 0x9D,
	'ß': 0x9E, 'ƒ': 0x9F, 'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5, '¿': 0xA8, '¬': 0xAA,
	'¡': 0xAD, '«': 0xAE, '»': 0xAF, 'ã': 0xB0, 'õ': 0xB1, 'Ø': 0xB2, 'ø': 0xB3, 'œ': 0xB4, 'Œ': 0xB5, 'À': 0xB6,
	'Ã': 0xB7, 'Õ': 0xB8, '§': 0xDD, '°': 0xF8, '²': 0xFD, '³': 0xFE,
};

function convertChar(ch) {
	return UnicodeToAtariST[ch] ?? ch.charCodeAt(0);
}

const EmptyLine = { blocks: [] };

class RenderText {
	constructor(game, textLines, font, fontInfoProvider, paletteIndex) {
		this.game = game;
		this.layer = game.getRenderLayer(Layer.Text);
		this.textLines = textLines;
		this.font = font;
		this.fontInfoProvider = fontInfoProvider;
		this._paletteIndex = paletteIndex;
		this.glyphShadows = [];
		this.glyphs = [];
		this.startedScrollActions = [];
		this.maxScroll = 0;
		this.areaX = 0;
		this.areaY = 0;
		this.areaHeight = 0;
		this.scrollOffsetInPixels = 0;
		this.scrollOffsetInLines = 0;
		this._displayLayer = 0;
		this._alpha = 255;
		this._visible = false;
		this.scrollEnded = new EventEmitter();
		this.supportsScrolling = false;
		this.scrolling = false;
	}

	get textLineCount() { return this.textLines.length; }
	get lineHeight() { return this.font.lineHeight; }

	#allSprites() {
		return [...this.glyphs.flat(), ...this.glyphShadows.flat()];
	}

	get visible() { return this._visible; }
	set visible(value) {
		if (this._visible === value)
			return;
		if (value && this.glyphs.length === 0)
			return;
		this._visible = value;
		for (const s of this.#allSprites())
			s.visible = value;
	}

	get alpha() { return this._alpha; }
	set alpha(value) {
		if (this._alpha === value)
			return;
		this._alpha = value;
		for (const s of this.#allSprites())
			s.alpha = value;
	}

	get displayLayer() { return this._displayLayer; }
	set displayLayer(value) {
		if (this._displayLayer === value)
			return;
		this._displayLayer = value;
		for (const s of this.glyphs.flat())
			s.displayLayer = limit(0, value + 2, 255);
		for (const s of this.glyphShadows.flat())
			s.displayLayer = value;
	}

	get paletteIndex() { return this._paletteIndex; }
	set paletteIndex(value) {
		if (this._paletteIndex === value)
			return;
		this._paletteIndex = value;
		for (const s of this.glyphs.flat())
			s.paletteIndex = value;
	}

	#createTextSprite(x, y, glyphIndex, colorIndex, displayLayerOffset, shadow) {
		const atlas = this.layer.config.texture;
		const glyph = this.layer.createAlphaSprite();
		glyph.displayLayer = limit(0, this._displayLayer + displayLayerOffset, 255);
		glyph.x = x;
		glyph.y = y;
		glyph.width = this.font.glyphWidth;
		glyph.height = this.font.glyphHeight;
		glyph.textureOffset = atlas.getOffset(glyphIndex);
		const clipHeight = this.areaHeight === 0 ? 100000 : this.areaHeight;
		glyph.clipRect = { x: this.areaX, y: this.areaY, w: 100000, h: clipHeight };
		glyph.maskColorIndex = colorIndex;
		glyph.paletteIndex = shadow ? 0 : this._paletteIndex;
		glyph.alpha = this._alpha;
		glyph.visible = true;
		return glyph;
	}

	#setupTextLine(x, y, line, textLine) {
		let glyphLine, shadowLine;
		if (line === this.glyphs.length) {
			glyphLine = [];
			shadowLine = [];
			this.glyphs.push(glyphLine);
			this.glyphShadows.push(shadowLine);
		} else {
			this.glyphs[line].forEach(g => g.visible = false);
			this.glyphs[line].length = 0;
			this.glyphShadows[line].forEach(g => g.visible = false);
			this.glyphShadows[line].length = 0;
			glyphLine = this.glyphs[line];
			shadowLine = this.glyphShadows[line];
		}

		for (const block of textLine.blocks) {
			const mapper = block.runes ? this.fontInfoProvider.runeGlyphTextureIndices : this.fontInfoProvider.textGlyphTextureIndices;
			for (const ch of block.text) {
				if (ch.charCodeAt(0) === 14)
					x -= this.font.advance;
				else if (ch === ' ' || ch === '\t')
					x += this.font.advance;
				else {
					const glyphIndex = mapper.get(convertChar(ch));
					if (glyphIndex !== undefined) {
						shadowLine.push(this.#createTextSprite(x + 1, y + 1, glyphIndex, 0, 0, true));
						glyphLine.push(this.#createTextSprite(x, y, glyphIndex, block.ink, 2, false));
					}
					x += this.font.advance;
				}
			}
		}
	}

	#internalShow(x, y, displayLayer, lineCount) {
		this.areaX = x;
		this.areaY = y;
		this.scrollOffsetInPixels = 0;
		this.scrollOffsetInLines = 0;
		this._displayLayer = displayLayer;

		this.delete();

		lineCount = Math.min(lineCount, this.textLines.length);

		if (this.supportsScrolling) {
			this.textLines.splice(0, 0, ...Array(lineCount).fill(EmptyLine));
			this.scrolling = true;
			this.game.addDelayedAction(10, () => {
				const oldMaxScroll = this.maxScroll;
				this.maxScroll = lineCount;
				this.scroll(lineCount);
				this.maxScroll = oldMaxScroll;
			});
		}

		for (let i = 0; i < lineCount; i++) {
			this.#setupTextLine(x, y, i, this.textLines[i]);
			y += this.font.lineHeight;
		}

		this.visible = true;
	}

	showInArea(x, y, width, height, displayLayer, alignment = TextAlignment.Left) {
		if (typeof x === 'object') { // rect overload
			alignment = height ?? TextAlignment.Left;
			displayLayer = width;
			({ x, y, w: width, h: height } = x);
		}
		const font = this.font;
		if (height <= 0)
			height = this.textLines.length * font.lineHeight - Math.max(0, font.lineHeight - font.glyphHeight);
		const diff = limit(0, font.lineHeight - font.glyphHeight, height - 1);
		const numDisplayedRows = Math.floor((height + diff) / font.lineHeight);
		this.areaHeight = height;
		this.maxScroll = Math.max(0, this.textLines.length - numDisplayedRows);
		this.supportsScrolling = numDisplayedRows < this.textLines.length;

		if (alignment !== TextAlignment.Left) {
			const lineLength = l => l.blocks.reduce((s, b) => s + b.text.length, 0) * font.advance;
			const maxLineWidth = Math.max(0, ...this.textLines.map(lineLength));
			if (width <= 0)
				width = maxLineWidth;
			if (alignment === TextAlignment.Right)
				x = x + width - maxLineWidth;
			else if (maxLineWidth < width)
				x += Math.floor((width - maxLineWidth) / 2);
		}

		this.#internalShow(x, y, displayLayer, numDisplayedRows);
	}

	show(x, y, displayLayer) {
		this.areaHeight = 0;
		this.supportsScrolling = false;
		this.#internalShow(x, y, displayLayer, this.textLines.length);
	}

	scroll(lines) {
		if (this.maxScroll === 0)
			return false;

		this.scrolling = true;
		const font = this.font;
		const scrollAmount = Math.max(1, Math.floor(font.lineHeight / 2));

		if (lines > this.maxScroll)
			lines = this.maxScroll;
		this.maxScroll -= lines;

		const scrollTextBy = amount => {
			const diff = limit(0, font.lineHeight - font.glyphHeight, this.areaHeight - 1);
			const numDisplayedRows = Math.floor((this.areaHeight + diff) / font.lineHeight);
			this.scrollOffsetInPixels += amount;

			if (this.scrollOffsetInPixels >= font.lineHeight) {
				this.scrollOffsetInPixels -= font.lineHeight;
				this.scrollOffsetInLines++;
				const firstLine = this.glyphs.shift();
				const firstShadowLine = this.glyphShadows.shift();
				for (const g of this.glyphs.flat()) g.y -= amount;
				for (const g of this.glyphShadows.flat()) g.y -= amount;
				firstLine?.forEach(g => g.visible = false);
				firstShadowLine?.forEach(g => g.visible = false);
			} else {
				for (const g of this.glyphs.flat()) g.y -= amount;
				for (const g of this.glyphShadows.flat()) g.y -= amount;
				if (this.glyphs.length === numDisplayedRows) {
					const newLineIndex = this.scrollOffsetInLines + numDisplayedRows;
					if (newLineIndex < this.textLines.length)
						this.#setupTextLine(this.areaX, this.areaY - this.scrollOffsetInPixels + numDisplayedRows * font.lineHeight, this.glyphs.length, this.textLines[newLineIndex]);
				}
			}
		};

		const scrollEnd = () => {
			this.scrolling = false;
			this.scrollEnded.invoke();
		};

		const totalScrolls = Math.floor(lines * font.lineHeight / scrollAmount);
		const actions = this.startedScrollActions;
		for (let i = 0; i < totalScrolls; i++)
			actions.push(this.game.addDelayedAction(i * TicksPerScroll, () => scrollTextBy(scrollAmount)));
		const totalScrollAmount = totalScrolls * scrollAmount;
		if (totalScrollAmount < lines * font.lineHeight) {
			const amount = lines * font.lineHeight - totalScrollAmount;
			actions.push(this.game.addDelayedAction(totalScrolls * TicksPerScroll, () => scrollTextBy(amount)));
			actions.push(this.game.addDelayedAction((totalScrolls + 1) * TicksPerScroll, scrollEnd));
		} else {
			actions.push(this.game.addDelayedAction(totalScrolls * TicksPerScroll, scrollEnd));
		}
		return true;
	}

	scrollFullHeight() {
		const font = this.font;
		const diff = limit(0, font.lineHeight - font.glyphHeight, this.areaHeight - 1);
		const numDisplayedRows = Math.floor((this.areaHeight + diff) / font.lineHeight);
		return this.scroll(numDisplayedRows);
	}

	delete() {
		if (this.startedScrollActions.length !== 0) {
			this.game.deleteDelayedActions(...this.startedScrollActions);
			this.startedScrollActions = [];
		}
		for (const s of this.#allSprites())
			s.visible = false;
		this.glyphs = [];
		this.glyphShadows = [];
		this._visible = false;
	}
}

export class TextManager {
	constructor(game, font, fontInfoProvider) {
		this.game = game;
		this.font = font;
		this.fontInfoProvider = fontInfoProvider;
	}

	getTextRenderWidth(text) {
		if (text.replace(/^\n+|\n+$/g, '').length === 0)
			return 0;
		return Math.max(...text.split('\n').map(l => l.length)) * this.font.advance;
	}

	#parse(lines, defaultInk, defaultPaper, fromIText) {
		const textLines = [];
		let blocks = [];
		let current = '';
		let ink = defaultInk;
		let paper = defaultPaper;
		let runes = false;

		const endBlock = () => {
			if (current.length > 0) {
				blocks.push({ ink, paper, text: current, runes });
				current = '';
			}
		};
		const endLine = (last = false) => {
			if (!last || blocks.length !== 0)
				textLines.push({ blocks });
			blocks = [];
		};

		for (const line of lines) {
			for (let i = 0; i < line.length; i++) {
				const ch = line[i];
				const code = ch.charCodeAt(0);
				if (code === 1) {
					const newInk = line.charCodeAt(++i);
					if (newInk === ink)
						continue;
					endBlock();
					ink = newInk;
				} else if (code === 2) {
					let newPaper = line.charCodeAt(++i);
					if (newPaper === 255)
						newPaper = TransparentPaper;
					if (newPaper === paper)
						continue;
					endBlock();
					paper = newPaper;
				} else if (ch === '~') {
					endBlock();
					runes = !runes;
				} else if (ch === '#' || ch === '\n') {
					endBlock();
					endLine(!fromIText && i === line.length - 1);
				} else {
					current += ch;
				}
			}
			if (fromIText) {
				endBlock();
				endLine(true);
			}
		}
		if (!fromIText) {
			endBlock();
			endLine(true);
		}
		return textLines;
	}

	/**
	 * Creates a render text. If text is a Text object (compressed text), maxWidth is required.
	 */
	create(text, maxWidthOrInk, ...rest) {
		if (typeof text === 'string') {
			const [ink = DefaultInkColorIndex, paper = DefaultPaperColorIndex, palette = DefaultPaletteIndex] = [maxWidthOrInk, ...rest];
			const lines = this.#parse([text], ink, paper, false);
			return new RenderText(this.game, lines, this.font, this.fontInfoProvider, palette);
		}
		const maxWidth = maxWidthOrInk;
		const [ink = DefaultInkColorIndex, paper = DefaultPaperColorIndex, palette = DefaultPaletteIndex] = rest;
		const lines = text.getLines(Math.floor(maxWidth / this.font.advance));
		const textLines = this.#parse(lines, ink, paper, true);
		return new RenderText(this.game, textLines, this.font, this.fontInfoProvider, palette);
	}
}

export class Label {
	static TicksPerBlinkAnimationHold = 35;
	static TicksPerBlinkAnimationFade = 8;
	static blinkAnimationAlpha = 255;

	constructor(game) {
		this.game = game;
		this._area = { x: 0, y: 0, w: 0, h: 0 };
		this.renderText = null;
		this._displayLayer = 0;
		this._paletteIndex = 0;
		this._alpha = 255;
		this._alignment = TextAlignment.Left;
		this.needsShowCall = true;
		this.visibleRequest = false;
	}

	get visible() { return this.visibleRequest || (this.renderText?.visible ?? false); }
	set visible(value) {
		if (this.renderText) {
			if (this.needsShowCall && value)
				this.#show(true);
			else {
				this.visibleRequest = false;
				this.renderText.visible = value;
			}
		} else {
			this.visibleRequest = value;
		}
	}

	get alpha() { return this._alpha; }
	set alpha(v) {
		if (this._alpha === v) return;
		this._alpha = v;
		if (this.renderText) this.renderText.alpha = v;
	}

	get text() { return this.renderText; }

	get displayLayer() { return this._displayLayer; }
	set displayLayer(v) {
		if (this._displayLayer === v) return;
		this._displayLayer = v;
		if (this.renderText) this.renderText.displayLayer = v;
	}

	get paletteIndex() { return this._paletteIndex; }
	set paletteIndex(v) {
		if (this._paletteIndex === v) return;
		this._paletteIndex = v;
		if (this.renderText) this.renderText.paletteIndex = v;
	}

	get alignment() { return this._alignment; }
	set alignment(v) {
		if (this._alignment === v) return;
		this._alignment = v;
		this.#show();
	}

	get area() { return this._area; }
	set area(v) {
		const a = this._area;
		if (a.x === v.x && a.y === v.y && a.w === v.w && a.h === v.h)
			return;
		this._area = { ...v };
		this.#show();
	}

	get supportsScrolling() { return this.renderText?.supportsScrolling ?? false; }
	get textLineCount() { return this.renderText?.textLineCount ?? 0; }
	get lineHeight() { return this.renderText?.lineHeight ?? 0; }

	#show(wasVisible = null) {
		if (this.renderText) {
			wasVisible ??= this.renderText.visible || this.visibleRequest;
			this.needsShowCall = false;
			this.visibleRequest = false;
			this.renderText.showInArea(this._area.x, this._area.y, this._area.w, this._area.h, this._displayLayer, this._alignment);
			this.renderText.visible = wasVisible;
		}
	}

	/** setText(string, ink, paper, palette) or setText(Text, maxWidth, ink, paper, palette) */
	setText(text, ...args) {
		const wasVisible = this.visibleRequest || (this.renderText?.visible ?? false);
		this.renderText?.delete();
		if (typeof text === 'string') {
			const [ink = DefaultInkColorIndex, paper = DefaultPaperColorIndex, palette = DefaultPaletteIndex] = args;
			this.renderText = this.game.textManager.create(text, ink, paper, palette);
		} else {
			let [maxWidth, ink = DefaultInkColorIndex, paper = DefaultPaperColorIndex, palette = DefaultPaletteIndex] = args;
			maxWidth ??= this._area.w;
			this.renderText = this.game.textManager.create(text, maxWidth, ink, paper, palette);
		}
		this.renderText.alpha = this._alpha;
		if (wasVisible)
			this.#show(wasVisible);
		else
			this.needsShowCall = true;
	}

	destroy() {
		this.renderText?.delete();
		this.renderText = null;
		this.needsShowCall = true;
	}

	static updateBlinkAnimations(ticks) {
		const holdHigh = Label.TicksPerBlinkAnimationHold, fadeOut = Label.TicksPerBlinkAnimationFade;
		const holdLow = holdHigh, fadeIn = fadeOut;
		const t = ticks % (holdHigh + fadeOut + holdLow + fadeIn);
		if (t < holdHigh)
			Label.blinkAnimationAlpha = 255;
		else if (t < holdHigh + fadeOut)
			Label.blinkAnimationAlpha = 255 - Math.round(255 * (t - holdHigh) / fadeOut);
		else if (t < holdHigh + fadeOut + holdLow)
			Label.blinkAnimationAlpha = 0;
		else
			Label.blinkAnimationAlpha = Math.round(255 * (t - holdHigh - fadeOut - holdLow) / fadeIn);
	}
}
