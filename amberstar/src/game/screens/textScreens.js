// Ports of WindowScreen, TextBoxScreen, PictureTextScreen, ConfirmationScreen and TextScrollHandler.
import { Screen, ScreenType } from './screen.js';
import { Window, Button } from '../ui/controls.js';
import { ButtonType, CursorType, Layout } from '../../data/enums.js';
import { Key } from '../keys.js';
import { limit, EventEmitter } from '../util.js';
import { BuiltinPalette } from '../../engine/layerSetup.js';

export class WindowScreen extends Screen {
	constructor(x, y, widthInTiles, heightInTiles, windowDisplayLayer = 0) {
		super();
		this.wx = x;
		this.wy = y;
		this.widthInTiles = widthInTiles;
		this._heightInTiles = heightInTiles;
		this.windowDisplayLayer = windowDisplayLayer;
		this.window = null;
	}

	get heightInTiles() { return this._heightInTiles; }
	get closeOnNextInput() { return false; }
	get createWindowInOpenHandler() { return false; }
	get trapMouse() { return true; }
	get dark() { return false; }
	get paletteIndex() { return null; }
	get transparent() { return true; }

	get clientArea() {
		return this.window?.clientArea ?? { x: this.wx, y: this.wy, w: this.widthInTiles * 16, h: this.heightInTiles * 16 };
	}

	init() {
		super.init();
		if (!this.createWindowInOpenHandler)
			this.#createWindow();
	}

	open(closeAction) {
		if (this.createWindowInOpenHandler)
			this.#createWindow();
		super.open(closeAction);
		if (this.trapMouse)
			this.game.trapMouse(this.clientArea);
	}

	close() {
		if (this.trapMouse)
			this.game.untrapMouse();
		super.close();
	}

	screenPushed(screen) {
		if (this.trapMouse)
			this.game.untrapMouse();
		super.screenPushed(screen);
	}

	screenPopped(screen) {
		super.screenPopped(screen);
		if (this.trapMouse)
			this.game.trapMouse(this.clientArea);
	}

	#createWindow() {
		this.setAnchor(0, 0);
		this.window?.destroy();
		this.window = this.addWindow(this.wx, this.wy, this.widthInTiles, this.heightInTiles, this.dark, this.windowDisplayLayer, this.paletteIndex);
		this.setAnchorToWindow(this.window);
	}

	keyDown(key, modifiers) {
		if (this.closeOnNextInput) {
			this.game.screenHandler.popScreen();
			return true;
		}
		return super.keyDown(key, modifiers);
	}

	mouseDown(position, buttons, modifiers) {
		if (this.closeOnNextInput) {
			this.game.screenHandler.popScreen();
			return true;
		}
		return super.mouseDown(position, buttons, modifiers);
	}
}

const TB = { X: 16, Y: 52, W: 18, MinH: 4, MaxH: 9, WindowLayer: 200, TextLayer: 210 };

export class TextBoxScreen extends WindowScreen {
	constructor() {
		super(TB.X, TB.Y, TB.W, TB.MinH, TB.WindowLayer);
		this.displayText = null;
		this.scrolling = false;
		this.closeOnNextInputFlag = false;
		this.height = TB.MinH;
		this._palette = 0;
	}

	get type() { return ScreenType.TextBox; }
	get dark() { return true; }
	get createWindowInOpenHandler() { return true; }
	get heightInTiles() { return this.height; }
	get paletteIndex() { return this._palette; }

	open(closeAction) {
		const game = this.game;
		let text;
		const ev = game.eventHandler.currentEvent;
		if (!ev || !ev.isTextEvent) {
			text = game.currentText;
			if (!text)
				throw new Error('TextBox screen opened without providing a text.');
		} else {
			const mapIndex = game.eventHandler.currentEventMapIndex;
			text = game.assets.text('map', mapIndex).getTextBlock(ev.textIndex);
		}

		this._palette = this.#getPalette();
		this.scrolling = false;
		// The label is created before the window exists (anchor is reset in the window creation)
		this.setAnchor(0, 0);
		this.displayText = this.addLabel(0, 0, text, (TB.W - 2) * 16, TB.MaxH * 16 + 7, TB.TextLayer);
		this.displayText.paletteIndex = this._palette;
		const numTextLines = this.displayText.textLineCount;
		this.height = limit(TB.MinH, Math.floor((numTextLines * this.displayText.lineHeight + 15) / 16) + 2, TB.MaxH);

		super.open(closeAction);

		const { x, y, w, h } = this.clientArea;
		const textY = y + Math.max(0, Math.floor((h - numTextLines * this.displayText.lineHeight) / 2));
		this.displayText.area = { x, y: textY, w, h };
		this.closeOnNextInputFlag = !this.displayText.supportsScrolling;
		game.cursor.cursorType = CursorType.Sword;
	}

	#getPalette() {
		const last = this.game.screenHandler.lastScreen ?? this.game.screenHandler.activeScreen;
		if (last?.type === ScreenType.Map2D)
			return this.game.paletteIndexProvider.getTilesetPaletteIndex(last.map.tileset);
		if (last?.type === ScreenType.Map3D)
			return this.game.paletteIndexProvider.getLabyrinthPaletteIndex(last.labData.paletteIndex - 1);
		return BuiltinPalette.UI;
	}

	keyDown(key, modifiers) {
		return this.#scrollOrClose() || super.keyDown(key, modifiers);
	}

	mouseDown(position, buttons, modifiers) {
		return this.#scrollOrClose() || super.mouseDown(position, buttons, modifiers);
	}

	#scrollOrClose() {
		if (this.closeOnNextInputFlag) {
			this.game.screenHandler.popScreen();
			return true;
		}
		if (!this.scrolling && this.displayText?.supportsScrolling) {
			if (!this.displayText.text.scrollFullHeight()) {
				this.closeOnNextInputFlag = true;
				this.game.screenHandler.popScreen();
			} else {
				this.scrolling = true;
				const handler = () => {
					this.scrolling = false;
					this.displayText?.text?.scrollEnded.remove(handler);
				};
				this.displayText.text.scrollEnded.add(handler);
			}
			return true;
		}
		return this.scrolling;
	}
}

export class TextScrollHandler {
	constructor() {
		this.label = null;
		this.scrolling = false;
		this.canAbort = false;
		this.aborted = new EventEmitter();
		this.scrollEnded = new EventEmitter();
		this.boundScrolledToEnd = () => this.#scrolledToEnd();
	}

	attach(label) {
		this.label = label;
		this.scrolling = label.text.scrolling;
		if (this.scrolling)
			label.text.scrollEnded.add(this.boundScrolledToEnd);
	}

	detach() {
		this.label?.text?.scrollEnded.remove(this.boundScrolledToEnd);
		this.label = null;
		this.scrolling = false;
	}

	#scrolledToEnd() {
		this.label?.text?.scrollEnded.remove(this.boundScrolledToEnd);
		this.scrolling = false;
	}

	#scrollOrEnd() {
		if (!this.scrolling && this.label?.supportsScrolling) {
			if (!this.label.text.scrollFullHeight()) {
				this.scrollEnded.invoke();
				return true;
			}
			this.scrolling = true;
			this.label.text.scrollEnded.add(this.boundScrolledToEnd);
			return true;
		}
		return this.scrolling;
	}

	mouseWheel(scrollY) {
		if (!this.label || !this.label.visible || !this.label.supportsScrolling)
			return false;
		if (scrollY > 0)
			return this.#scrollOrEnd();
		return true;
	}

	mouseDown(buttons) {
		if (buttons === 0)
			return false;
		if (!this.label || !this.label.visible || !this.label.supportsScrolling)
			return false;
		return this.#scrollOrEnd();
	}

	keyDown(key) {
		if (!this.label || !this.label.visible || !this.label.supportsScrolling)
			return false;
		if (key === Key.Escape && this.canAbort) {
			this.label.text.scrollEnded.remove(this.boundScrolledToEnd);
			this.scrolling = false;
			this.aborted.invoke();
			return true;
		}
		if (key === Key.Escape || key === Key.Space || key === Key.Down || key === Key.PageDown || key === Key.Enter)
			return this.#scrollOrEnd();
		return false;
	}
}

const PT = { TextX: 112, TextY: 50, TextWidth: 192, TextHeight: 140, ControlLayer: 100 };

export class PictureTextScreen extends Screen {
	constructor() {
		super();
		this.textScrollHandler = new TextScrollHandler();
		this.image = null;
		this.displayText = null;
		this.closeOnNextInputFlag = false;
	}

	get type() { return ScreenType.PictureText; }

	init() {
		super.init();
		this.textScrollHandler.scrollEnded.add(() => this.game.screenHandler.popScreen());
	}

	open(closeAction) {
		super.open(closeAction);
		const game = this.game;
		game.cursor.cursorType = CursorType.Zzz;
		const ev = game.eventHandler.currentEvent;
		const imageType = ev.picture;
		const palette = game.paletteIndexProvider.get80x80ImagePaletteIndex(imageType);
		this.image = this.addImage(16, 81, 80, 80, game.graphicIndexProvider.get80x80ImageIndex(imageType), PT.ControlLayer, true);
		this.image.paletteIndex = palette;
		this.image.visible = true;
		game.setLayout(Layout.PictureText, palette);
		const mapIndex = game.eventHandler.currentEventMapIndex;
		const text = game.assets.text('map', mapIndex).getTextBlock(ev.textIndex);
		this.displayText = this.addLabel(PT.TextX, PT.TextY, text, PT.TextWidth, PT.TextHeight, PT.ControlLayer);
		this.displayText.paletteIndex = palette;
		this.closeOnNextInputFlag = !this.displayText.supportsScrolling;
		this.textScrollHandler.attach(this.displayText);
	}

	close() {
		this.game.cursor.cursorType = CursorType.Sword;
		this.textScrollHandler.detach();
		super.close();
	}

	keyDown(key, modifiers) {
		if (this.closeOnNextInputFlag) {
			this.closeOnNextInputFlag = false;
			this.game.screenHandler.popScreen();
			return true;
		}
		return this.textScrollHandler.keyDown(key) || super.keyDown(key, modifiers);
	}

	mouseDown(position, buttons, modifiers) {
		if (this.closeOnNextInputFlag) {
			this.closeOnNextInputFlag = false;
			this.game.screenHandler.popScreen();
			return true;
		}
		return this.textScrollHandler.mouseDown(buttons) || super.mouseDown(position, buttons, modifiers);
	}
}

const CF = { X: 48, Y: 60, W: 12, H: 5, WindowLayer: 150, ControlLayer: 175 };

export class ConfirmationScreen extends WindowScreen {
	constructor() {
		super(CF.X, CF.Y, CF.W, CF.H, CF.WindowLayer);
		this.text = null;
	}

	get type() { return ScreenType.Confirmation; }

	init() {
		super.init();
		this.text = this.addLabel(0, 0, '', this.clientArea.w, 32, CF.ControlLayer);
		this.text.visible = false;
		const yes = this.addButton(16, 32, ButtonType.ThumbsUp, CF.ControlLayer);
		const no = this.addButton(16 + Button.Width, 32, ButtonType.ThumbsDown, CF.ControlLayer);
		yes.clickAction.add(() => this.#result(true));
		no.clickAction.add(() => this.#result(false));
	}

	open(closeAction) {
		if (!this.game.currentText)
			throw new Error('ConfirmationScreen needs currentText to be set beforehand.');
		super.open(closeAction);
		this.text.setText(this.game.currentText, this.clientArea.w, 15, -1, BuiltinPalette.UI);
		this.text.visible = true;
		this.game.currentResult = false;
	}

	#result(value) {
		this.game.currentResult = value;
		this.game.screenHandler.popScreen();
	}

	keyDown(key, modifiers) {
		if (key === Key.Enter || key === Key.LetterA + ('Y'.charCodeAt(0) - 65)) {
			this.#result(true);
			return true;
		}
		if (key === Key.Escape || key === Key.LetterA + ('N'.charCodeAt(0) - 65)) {
			this.#result(false);
			return true;
		}
		return super.keyDown(key, modifiers);
	}
}
