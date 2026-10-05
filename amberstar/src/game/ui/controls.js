// Port of Amberstar.Game.UI controls: Button, ButtonGrid, Image, Cursor, Window.
import { Layer, BuiltinPalette } from '../../engine/layerSetup.js';
import { ButtonType, UIGraphic, CursorType } from '../../data/enums.js';
import { EventEmitter } from '../util.js';
import { MouseButtons } from '../keys.js';

export const ButtonWidth = 32;
export const ButtonHeight = 16;
const HighlightDelayMs = 80;

export class Button {
	static Width = ButtonWidth;
	static Height = ButtonHeight;

	constructor(game, x, y, buttonType, displayLayer, paletteIndex = null) {
		this.game = game;
		this.buttonType = buttonType;
		this.pressed = false;
		this._disabled = false;
		this.highlighted = false;
		this.clickAction = new EventEmitter();
		this.rightClickAction = new EventEmitter();
		const layer = game.getRenderLayer(Layer.UI);
		const atlas = layer.config.texture;
		paletteIndex ??= BuiltinPalette.UI;
		displayLayer = Math.max(2, Math.min(255 - 4, displayLayer));

		this.background = layer.createColoredRect();
		this.background.x = x + 2;
		this.background.y = y + 2;
		this.background.width = ButtonWidth - 4;
		this.background.height = ButtonHeight - 4;
		this.background.color = { r: 0, g: 0, b: 0, a: 255 };
		this.background.displayLayer = displayLayer - 2;
		this.background.visible = true;

		this.sprite = layer.createSprite();
		this.sprite.x = x;
		this.sprite.y = y;
		this.sprite.width = ButtonWidth;
		this.sprite.height = ButtonHeight;
		this.sprite.textureOffset = atlas.getOffset(game.graphicIndexProvider.getButtonIndex(buttonType));
		this.sprite.displayLayer = displayLayer;
		this.sprite.paletteIndex = paletteIndex;
		this.sprite.opaque = true;
		this.sprite.visible = true;

		this.highlightOverlay = layer.createSprite();
		Object.assign(this.highlightOverlay, { x, y, width: ButtonWidth, height: ButtonHeight, displayLayer: displayLayer + 2, paletteIndex });
		this.highlightOverlay.textureOffset = atlas.getOffset(game.graphicIndexProvider.getUIGraphicIndex(UIGraphic.FeedbackIcon));

		this.disabledOverlay = layer.createSprite();
		Object.assign(this.disabledOverlay, { x, y, width: ButtonWidth, height: ButtonHeight, displayLayer: displayLayer + 4, paletteIndex });
		this.disabledOverlay.textureOffset = atlas.getOffset(game.graphicIndexProvider.getUIGraphicIndex(UIGraphic.ChequeredIcon));
	}

	setButtonType(buttonType) {
		this.buttonType = buttonType;
		this.sprite.textureOffset = this.game.getRenderLayer(Layer.UI).config.texture.getOffset(this.game.graphicIndexProvider.getButtonIndex(buttonType));
	}

	get paletteIndex() { return this.sprite.paletteIndex; }
	set paletteIndex(v) {
		this.sprite.paletteIndex = v;
		this.highlightOverlay.paletteIndex = v;
	}

	get displayLayer() { return this.sprite.displayLayer; }
	set displayLayer(v) {
		v = Math.max(2, Math.min(255 - 4, v));
		this.background.displayLayer = v - 2;
		this.sprite.displayLayer = v;
		this.highlightOverlay.displayLayer = v + 2;
		this.disabledOverlay.displayLayer = v + 4;
	}

	get disabled() { return this._disabled || this.buttonType === ButtonType.Empty; }
	set disabled(v) {
		this._disabled = v;
		this.disabledOverlay.visible = v && this.visible;
	}

	get visible() { return this.sprite.visible; }
	set visible(v) {
		this.sprite.visible = v;
		this.background.visible = v;
		this.highlightOverlay.visible = v && this.highlighted;
		this.disabledOverlay.visible = v && this._disabled;
	}

	get position() { return { x: this.sprite.x, y: this.sprite.y }; }
	set position(p) {
		for (const s of [this.sprite, this.highlightOverlay, this.disabledOverlay]) {
			s.x = p.x;
			s.y = p.y;
		}
		this.background.x = p.x + 2;
		this.background.y = p.y + 2;
	}

	get area() { return { x: this.sprite.x, y: this.sprite.y, w: ButtonWidth, h: ButtonHeight }; }

	setType(buttonType) {
		const atlas = this.game.getRenderLayer(Layer.UI).config.texture;
		this.sprite.textureOffset = atlas.getOffset(this.game.graphicIndexProvider.getButtonIndex(buttonType));
		this.buttonType = buttonType;
	}

	mouseClick(position, mouseButtons = MouseButtons.Left) {
		if (this.disabled)
			return false;
		const { x, y } = this.sprite;
		if (position.x < x || position.y < y || position.x >= x + ButtonWidth || position.y >= y + ButtonHeight)
			return false;
		this.press(mouseButtons === MouseButtons.Right);
		return true;
	}

	tryPress(rightClick = false) {
		if (this.disabled)
			return false;
		this.press(rightClick);
		return true;
	}

	press(rightClick = false) {
		if (this.pressed || this.disabled)
			return;
		this.highlighted = true;
		this.highlightOverlay.visible = true;
		this.pressed = true;
		this.game.addDelayedActionMs(HighlightDelayMs, () => {
			this.highlighted = false;
			this.highlightOverlay.visible = false;
			this.pressed = false;
			if (rightClick)
				this.rightClickAction.invoke();
			else
				this.clickAction.invoke();
		});
	}

	destroy() {
		this.sprite.visible = false;
		this.background.visible = false;
		this.highlightOverlay.visible = false;
		this.disabledOverlay.visible = false;
	}
}

export class ButtonGrid {
	static OffsetX = 208;
	static OffsetY = 37 + 108;
	static Area = { x: 208, y: 145, w: 3 * ButtonWidth, h: 3 * ButtonHeight };

	constructor(game) {
		this.buttons = [];
		this.clickButtonAction = new EventEmitter();
		for (let y = 0; y < 3; y++) {
			for (let x = 0; x < 3; x++) {
				const index = x + y * 3;
				const b = new Button(game, ButtonGrid.OffsetX + x * ButtonWidth, ButtonGrid.OffsetY + y * ButtonHeight, ButtonType.Empty, 10);
				b.clickAction.add(() => this.clickButtonAction.invoke(index));
				this.buttons.push(b);
			}
		}
	}

	get paletteIndex() { return this.buttons[0].paletteIndex; }
	set paletteIndex(v) { this.buttons.forEach(b => b.paletteIndex = v); }

	setButton(index, buttonType) {
		const b = this.buttons[index];
		if (!b) return;
		b.setType(buttonType);
		b.disabled = false;
	}

	enableButton(index, enable) {
		const b = this.buttons[index];
		if (b) b.disabled = !enable;
	}

	isButtonEnabled(index) {
		const b = this.buttons[index];
		return b ? !b.disabled : false;
	}

	getButtonType(index) {
		return this.buttons[index]?.buttonType ?? ButtonType.Empty;
	}

	mouseClick(position) {
		for (const b of this.buttons)
			if (b.mouseClick(position))
				return true;
		return false;
	}

	press(index) {
		this.buttons[index]?.press();
	}

	destroy() {
		this.buttons.forEach(b => b.destroy());
	}
}

export class Image {
	constructor(game, x, y, width, height, textureIndex, displayLayer, layer = Layer.UI, paletteIndex = null, opaque = false) {
		this.image = game.createSprite(layer, { x, y }, { width, height }, textureIndex, paletteIndex ?? BuiltinPalette.UI, opaque);
		this.image.displayLayer = displayLayer;
		this.image.visible = true;
		this.destroyed = false;
	}

	get visible() { return this.image.visible && !this.destroyed; }
	set visible(v) { if (!this.destroyed) this.image.visible = v; }
	get displayLayer() { return this.image.displayLayer; }
	set displayLayer(v) { this.image.displayLayer = v; }
	get paletteIndex() { return this.image.paletteIndex; }
	set paletteIndex(v) { this.image.paletteIndex = v; }

	setTextureIndex(textureIndex) {
		this.image.textureOffset = this.image.layer.config.texture.getOffset(textureIndex);
	}

	destroy() {
		this.destroyed = true;
		this.image.visible = false;
	}
}

export class Cursor {
	static Width = 16;
	static Height = 16;

	constructor(game) {
		this.game = game;
		const layer = game.getRenderLayer(Layer.UI);
		this.hotspots = new Map();
		this._cursorType = CursorType.Sword;
		this.hotspot = { x: 0, y: 0 };
		this._position = { x: 0, y: 0 };
		this.sprite = layer.createSprite();
		this.sprite.width = Cursor.Width;
		this.sprite.height = Cursor.Height;
		this.sprite.textureOffset = layer.config.texture.getOffset(game.graphicIndexProvider.getCursorGraphicIndex(this._cursorType));
		this.sprite.displayLayer = 255;
		this.sprite.paletteIndex = BuiltinPalette.UI;
		this.sprite.transparentColorIndex = 14;
		this.sprite.visible = true;
		const cursor = game.assets.loadCursor(this._cursorType);
		this.hotspot = { x: cursor.hotspotX, y: cursor.hotspotY };
	}

	get visible() { return this.sprite.visible; }
	set visible(v) { this.sprite.visible = v; }

	get cursorType() { return this._cursorType; }
	set cursorType(value) {
		if (this._cursorType === value)
			return;
		this._cursorType = value;
		const layer = this.game.getRenderLayer(Layer.UI);
		this.sprite.textureOffset = layer.config.texture.getOffset(this.game.graphicIndexProvider.getCursorGraphicIndex(value));
		let hotspot = this.hotspots.get(value);
		if (!hotspot) {
			const c = this.game.assets.loadCursor(value);
			hotspot = { x: c.hotspotX, y: c.hotspotY };
			this.hotspots.set(value, hotspot);
		}
		this.hotspot = hotspot;
		this.#updatePosition();
	}

	get position() { return this._position; }
	set position(p) {
		this._position = { x: p.x, y: p.y };
		this.#updatePosition();
	}

	#updatePosition() {
		this.sprite.x = this._position.x - this.hotspot.x;
		this.sprite.y = this._position.y - this.hotspot.y;
	}

	get paletteIndex() { return this.sprite.paletteIndex; }
	set paletteIndex(v) { this.sprite.paletteIndex = v; }

	destroy() { this.sprite.visible = false; }
}

export class Window {
	static TileWidth = 16;
	static TileHeight = 16;

	constructor(game, x, y, widthInTiles, heightInTiles, dark, displayLayer, paletteIndex = null) {
		this.game = game;
		const TW = 16, TH = 16;
		widthInTiles = Math.max(3, widthInTiles);
		heightInTiles = Math.max(3, heightInTiles);
		this.clientArea = { x: x + TW, y: y + TH, w: (widthInTiles - 2) * TW, h: (heightInTiles - 2) * TH };
		paletteIndex ??= BuiltinPalette.UI;
		this.windowColorIndex = dark ? 3 : 2;
		const layer = game.getRenderLayer(Layer.UI);
		const textureOffset = layer.config.texture.getOffset(game.graphicIndexProvider.getWindowGraphicIndex(dark));
		this.borders = [];
		let imageIndex = 0;
		const lastRowX = x + (widthInTiles - 1) * TW;
		const lastRowY = y + (heightInTiles - 1) * TH;

		const createBorder = (bx, by, rel) => {
			const s = layer.createSprite();
			s.textureOffset = { x: textureOffset.x + rel * TW, y: textureOffset.y };
			s.x = bx;
			s.y = by;
			s.displayLayer = displayLayer;
			s.paletteIndex = paletteIndex;
			s.width = TW;
			s.height = TH;
			s.visible = true;
			this.borders.push(s);
		};

		createBorder(x, y, imageIndex++);
		createBorder(x, y + TH, imageIndex++);
		for (let i = 0; i < heightInTiles - 4; i++)
			createBorder(x, y + TH + (i + 1) * TH, imageIndex);
		imageIndex++;
		createBorder(x, lastRowY - TH, imageIndex++);
		createBorder(x, lastRowY, imageIndex++);
		createBorder(x + TW, y, imageIndex++);
		createBorder(x + TW, lastRowY, imageIndex++);
		for (let i = 0; i < widthInTiles - 4; i++)
			createBorder(x + (2 + i) * TW, y, imageIndex);
		imageIndex++;
		for (let i = 0; i < widthInTiles - 4; i++)
			createBorder(x + (2 + i) * TW, lastRowY, imageIndex);
		imageIndex++;
		createBorder(lastRowX - TW, y, imageIndex++);
		createBorder(lastRowX - TW, lastRowY, imageIndex++);
		createBorder(lastRowX, y, imageIndex++);
		createBorder(lastRowX, y + TH, imageIndex++);
		for (let i = 0; i < heightInTiles - 4; i++)
			createBorder(lastRowX, y + TH + (i + 1) * TH, imageIndex);
		imageIndex++;
		createBorder(lastRowX, lastRowY - TH, imageIndex++);
		createBorder(lastRowX, lastRowY, imageIndex++);

		this.fill = layer.createColoredRect();
		this.fill.color = game.paletteColorProvider.getPaletteColor(paletteIndex, this.windowColorIndex);
		this.fill.displayLayer = displayLayer;
		this.fill.x = this.clientArea.x;
		this.fill.y = this.clientArea.y;
		this.fill.width = this.clientArea.w;
		this.fill.height = this.clientArea.h;
		this.fill.visible = true;
	}

	get visible() { return this.fill.visible; }
	set visible(v) {
		this.fill.visible = v;
		this.borders.forEach(b => b.visible = v);
	}

	get displayLayer() { return this.fill.displayLayer; }
	set displayLayer(v) {
		this.fill.displayLayer = v;
		this.borders.forEach(b => b.displayLayer = v);
	}

	get paletteIndex() { return this.borders[0].paletteIndex; }
	set paletteIndex(v) {
		if (this.borders[0].paletteIndex === v)
			return;
		this.fill.color = this.game.paletteColorProvider.getPaletteColor(v, this.windowColorIndex);
		this.borders.forEach(b => b.paletteIndex = v);
	}

	destroy() {
		this.borders.forEach(b => b.visible = false);
		this.fill.visible = false;
	}
}
