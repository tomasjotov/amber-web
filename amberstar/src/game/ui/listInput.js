// Ports of Amberstar.Game.UI.List and Input.
import { Layer, BuiltinPalette } from '../../engine/layerSetup.js';
import { Label, TransparentPaper } from './text.js';
import { EventEmitter, rectContains } from '../util.js';
import { Key } from '../keys.js';

export class List {
	static LineHeight = 7;

	constructor(game, x, y, width, height, displayLayer, backgroundColorIndex = null, paletteIndex = null) {
		this.game = game;
		this._displayLayer = Math.min(displayLayer, 250);
		this._paletteIndex = paletteIndex ?? BuiltinPalette.UI;
		this.backgroundColorIndex = backgroundColorIndex;
		this.area = { x, y, w: width, h: height };
		this.labels = [];
		this.texts = [];
		this._visible = false;
		this.destroyed = false;
		this.currentLabelY = 0;
		this.scrollOffset = 0;
		this.maxScrollOffset = 0;
		this.itemClicked = new EventEmitter();
		this.background = null;
		if (backgroundColorIndex != null) {
			this.background = game.createColoredRect(Layer.UI, { x, y }, { width, height },
				game.paletteColorProvider.getPaletteColor(this._paletteIndex, backgroundColorIndex));
			this.background.displayLayer = this._displayLayer;
		}
	}

	get visible() { return this._visible && !this.destroyed; }
	set visible(v) {
		if (!this.destroyed || !v) {
			this._visible = v;
			this.#updateLabelVisibility();
			if (this.background)
				this.background.visible = v;
		}
	}

	#updateLabelVisibility() {
		for (const label of this.labels) {
			const y = label.area.y;
			label.visible = this._visible && y >= this.area.y && y + List.LineHeight <= this.area.y + this.area.h;
		}
	}

	get displayLayer() { return this._displayLayer; }
	set displayLayer(v) {
		if (this.destroyed || this._displayLayer === v)
			return;
		this._displayLayer = v;
		this.labels.forEach(l => l.displayLayer = v + 3);
		if (this.background)
			this.background.displayLayer = v;
	}

	get paletteIndex() { return this._paletteIndex; }
	set paletteIndex(v) {
		if (this.destroyed || this._paletteIndex === v)
			return;
		this._paletteIndex = v;
		this.labels.forEach(l => l.paletteIndex = v);
		if (this.background)
			this.background.color = this.game.paletteColorProvider.getPaletteColor(v, this.backgroundColorIndex);
	}

	destroy() {
		this.visible = false;
		this.destroyed = true;
		this.clear();
	}

	clear() {
		this.labels.forEach(l => l.destroy());
		this.labels = [];
		this.texts = [];
		this.currentLabelY = 0;
		this.scrollOffset = 0;
		this.maxScrollOffset = 0;
	}

	/** addItem(string) or addItem(Text) */
	addItem(text, ink = 15) {
		const label = this.#addLabel();
		if (typeof text === 'string') {
			label.setText(text, ink, TransparentPaper, this._paletteIndex);
			this.texts.push(text);
		} else {
			label.setText(text, this.area.w - 3, ink, TransparentPaper, this._paletteIndex);
			this.texts.push(text.getString());
		}
		this.#updateLabelVisibility();
		return label;
	}

	#addLabel() {
		if (this.destroyed)
			throw new Error('Adding items to a destroyed list is not allowed.');
		const label = new Label(this.game);
		label.area = { x: this.area.x + 3, y: this.area.y + this.currentLabelY - this.scrollOffset * List.LineHeight, w: this.area.w - 3, h: List.LineHeight };
		label.displayLayer = this._displayLayer + 3;
		this.currentLabelY += List.LineHeight;
		this.labels.push(label);
		this.maxScrollOffset = Math.max(0, Math.ceil((this.currentLabelY - this.area.h) / List.LineHeight));
		return label;
	}

	#redraw(scrollDiff) {
		const dy = scrollDiff * List.LineHeight;
		for (const label of this.labels)
			label.area = { ...label.area, y: label.area.y - dy };
		this.#updateLabelVisibility();
	}

	scroll(amount) {
		if (amount === 0 || this.maxScrollOffset === 0)
			return;
		const newOffset = Math.max(0, Math.min(this.maxScrollOffset, this.scrollOffset + amount));
		const diff = newOffset - this.scrollOffset;
		if (diff === 0)
			return;
		this.scrollOffset = newOffset;
		this.#redraw(diff);
	}

	scrollToBegin() { this.scroll(-100000); }
	scrollToEnd() { this.scroll(100000); }

	mouseWheel(amount) {
		if (amount < 0) this.scroll(1);
		else if (amount > 0) this.scroll(-1);
	}

	mouseClick(position) {
		for (let i = 0; i < this.labels.length; i++) {
			const label = this.labels[i];
			if (label.visible && rectContains(label.area, position)) {
				this.itemClicked.invoke(i, this.texts[i]);
				return true;
			}
		}
		return false;
	}
}

export class Input {
	static Height = 8;

	constructor(game, x, y, width, displayLayer, maxLength = null) {
		this.game = game;
		this._displayLayer = Math.min(displayLayer, 250);
		this._paletteIndex = BuiltinPalette.UI;
		this.area = { x, y, w: width, h: Input.Height };
		this._visible = false;
		this.destroyed = false;
		this.value = '_';
		this.background = game.createColoredRect(Layer.UI, { x, y }, { width, height: Input.Height },
			game.paletteColorProvider.getPaletteColor(this._paletteIndex, 3));
		this.background.displayLayer = displayLayer;
		this.maxLength = maxLength ?? Math.floor((width - 1) / 6) - 1;
		this.label = new Label(game);
		this.label.area = { x: x + 1, y: y + 1, w: width - 1, h: 7 };
		this.label.displayLayer = displayLayer + 3;
		this.label.visible = true;
		this.#updateText();
	}

	get text() { return this.value.slice(0, -1); }

	get visible() { return this._visible && !this.destroyed; }
	set visible(v) {
		if (!this.destroyed || !v) {
			this._visible = v;
			this.background.visible = v;
			this.label.visible = v;
		}
	}

	get displayLayer() { return this._displayLayer; }
	set displayLayer(v) {
		if (this.destroyed || this._displayLayer === v)
			return;
		this._displayLayer = v;
		this.background.displayLayer = v;
		this.label.displayLayer = v + 3;
	}

	get paletteIndex() { return this._paletteIndex; }
	set paletteIndex(v) {
		if (this.destroyed || this._paletteIndex === v)
			return;
		this._paletteIndex = v;
		this.background.color = this.game.paletteColorProvider.getPaletteColor(v, 3);
		this.label.paletteIndex = v;
	}

	destroy() {
		this.visible = false;
		this.destroyed = true;
		this.label.destroy();
	}

	clear() {
		this.value = '_';
		this.#updateText();
	}

	setText(text) {
		this.value = text.toUpperCase().slice(0, Math.max(0, this.maxLength - 1)) + '_';
		this.#updateText();
	}

	#updateText() {
		this.label.setText(this.value);
	}

	keyDown(key) {
		if (this.destroyed || !this.visible)
			return false;
		if (key === Key.Backspace || key === Key.Delete) {
			if (this.value.length > 1) {
				this.value = this.value.slice(0, -2) + '_';
				this.#updateText();
			}
			return true;
		}
		return false;
	}

	keyChar(ch) {
		if (this.destroyed || !this.visible)
			return false;
		if (this.value.length === this.maxLength)
			return true;
		if (/^[\p{L}\p{N} .']$/u.test(ch)) {
			this.value = this.value.slice(0, -1) + ch.toUpperCase() + '_';
			this.#updateText();
		}
		return true;
	}
}
