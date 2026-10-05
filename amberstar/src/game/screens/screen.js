// Port of Amberstar.Game.Screens.Screen and ScreenHandler.
import { Key, KeyModifiers, MouseButtons } from '../keys.js';
import { Button, Image, Window } from '../ui/controls.js';
import { Label, TransparentPaper } from '../ui/text.js';
import { BuiltinPalette, Layer } from '../../engine/layerSetup.js';
import { EventEmitter } from '../util.js';

export const ScreenType = {
	CharacterCreation: 0, Map2D: 1, Map3D: 2, Inventory: 3, CharacterStats: 4, Camp: 5, BattlePositions: 6,
	Door: 7, Chest: 8, PictureText: 9, TextBox: 10, Conversation: 11, Place: 12, ItemView: 13, ItemDetails: 14,
	SelectWord: 15, InputWord: 16, Confirmation: 17, InventoryDropItem: 18, LockedUseItem: 19, ChestGiveItem: 20,
	ChestExamineItem: 21, ChestGiveGold: 22, ConversationPickupItem: 23, ConversationDropItem: 24,
	ConversationShowItem: 25, ConversationGiveItem: 26, ConversationGiveGold: 27, ConversationGiveFood: 28,
	Automap: 29, InventoryUseItem: 30, InventoryExamineItem: 31, InventoryGiveItem: 32, InventoryGiveGold: 33, InventoryGiveFood: 34,
	PlaceBuy: 35, PlaceSell: 36, PlaceAmount: 37, Camp: 38, Options: 39, Riddlemouth: 40, Battle: 41,
	MainMenu: 42, SaveSlots: 43, LoadSlots: 44, NameInput: 45,
};

export const ScreenFadeType = { None: 0, In: 1, Out: 2, Both: 3 };

export class Screen {
	constructor() {
		this.closeAction = null;
		this.game = null;
		this.anchors = [];
		this.createdControlsInInit = [];
		this.createdControlsInOpen = [];
		this.createdControlsInInitVisibility = [];
		this.createdControlsInOpenVisibility = [];
		this.initialized = false;
	}

	get type() { throw new Error('abstract'); }
	get fadeType() { return ScreenFadeType.Both; }
	get transparent() { return false; }
	get allowCharacterSelection() { return true; }
	get allowInventoryAccess() { return true; }
	get closeOnEscape() { return true; }
	get closeOnRightClick() { return false; }
	get closeOnSpace() { return this.closeOnRightClick; }

	get createdControls() { return [...this.createdControlsInOpen, ...this.createdControlsInInit]; }

	setCloseAction(action) { this.closeAction = action; }

	init() { }

	preInit(game) { this.game = game; }

	afterInit() {
		this.initialized = true;
		this.createdControlsInInitVisibility = this.createdControlsInInit.map(c => c.visible);
		this.createdControlsInInit.forEach(c => c.visible = false);
	}

	destroy() {
		this.createdControlsInInit.forEach(c => c.destroy());
		this.createdControlsInInit = [];
		this.createdControlsInInitVisibility = [];
	}

	preOpen() {
		this.createdControlsInInit.forEach((c, i) => c.visible = this.createdControlsInInitVisibility[i]);
	}

	open(closeAction) {
		this.setCloseAction(closeAction);
	}

	close() {
		this.createdControlsInInit.forEach(c => c.visible = false);
		this.createdControlsInOpen.forEach(c => c.destroy());
		this.createdControlsInOpen = [];
		this.createdControlsInOpenVisibility = [];
		this.closeAction?.();
	}

	screenPushed(screen) {
		if (!screen.transparent) {
			this.createdControlsInInitVisibility = this.createdControlsInInit.map(c => c.visible);
			this.createdControlsInOpenVisibility = this.createdControlsInOpen.map(c => c.visible);
			this.createdControlsInInit.forEach(c => c.visible = false);
			this.createdControlsInOpen.forEach(c => c.visible = false);
		}
	}

	screenPopped(screen) {
		if (!screen.transparent) {
			this.createdControlsInInit.forEach((c, i) => c.visible = this.createdControlsInInitVisibility[i] ?? false);
			this.createdControlsInOpen.forEach((c, i) => c.visible = this.createdControlsInOpenVisibility[i] ?? false);
		}
	}

	update(elapsedTicks) { }

	keyDown(key, modifiers) {
		const game = this.game;
		if (this.allowInventoryAccess && key >= Key.F1 && key <= Key.F6) {
			const slot = 1 + (key - Key.F1);
			if (game.state.hasPartyMemberInSlot(slot))
				game.openInventory(slot);
			return true;
		}
		if (this.closeOnEscape && key === Key.Escape && modifiers === KeyModifiers.None) {
			game.screenHandler.popScreen();
			return true;
		}
		if (this.closeOnSpace && key === Key.Space && modifiers === KeyModifiers.None) {
			game.screenHandler.popScreen();
			return true;
		}
		return false;
	}

	keyUp(key, modifiers) { return false; }

	keyChar(ch, modifiers) {
		if (this.allowCharacterSelection && modifiers === KeyModifiers.None && ch >= '1' && ch <= '6') {
			this.game.state.setActivePartyMember(ch.charCodeAt(0) - 48);
			return true;
		}
		return false;
	}

	mouseDown(position, buttons, modifiers) {
		const game = this.game;
		if (this.closeOnRightClick && buttons === MouseButtons.Right) {
			game.screenHandler.popScreen();
			return true;
		}
		for (const control of this.createdControls) {
			if (control instanceof Button && control.visible && !control.disabled && control.mouseClick(position, buttons))
				return true;
		}
		if (this.allowCharacterSelection && buttons === MouseButtons.Left) {
			const slot = game.testPartyPortraitHit(position);
			if (slot != null) {
				game.state.setActivePartyMember(slot);
				return true;
			}
		} else if (this.allowInventoryAccess && buttons === MouseButtons.Right) {
			const slot = game.testPartyPortraitHit(position);
			if (slot != null) {
				game.openInventory(slot);
				return true;
			}
		}
		return false;
	}

	mouseUp(position, buttons, modifiers) { return false; }
	mouseMove(position, buttons) { }
	mouseWheel(position, scrollX, scrollY, buttons) { return false; }

	// ---- controls ----

	setAnchorToWindow(window) {
		this.setAnchor(window.clientArea.x, window.clientArea.y);
	}

	setAnchor(x, y) {
		this.anchors = [];
		this.pushAnchor(x, y);
	}

	pushAnchor(x, y) { this.anchors.push({ x, y }); }
	popAnchor() { this.anchors.pop(); }

	#base() {
		return this.anchors.length !== 0 ? this.anchors[this.anchors.length - 1] : { x: 0, y: 0 };
	}

	#register(control) {
		(this.initialized ? this.createdControlsInOpen : this.createdControlsInInit).push(control);
		return control;
	}

	addButton(x, y, buttonType, displayLayer = 0) {
		const b = this.#base();
		return this.#register(new Button(this.game, b.x + x, b.y + y, buttonType, displayLayer));
	}

	addImage(x, y, width, height, textureIndex, displayLayer = 0, opaque = false, layer = Layer.UI) {
		const b = this.#base();
		return this.#register(new Image(this.game, b.x + x, b.y + y, width, height, textureIndex, displayLayer, layer, null, opaque));
	}

	/** Adds an item container (implemented in ui/itemContainer.js) */
	addItem(x, y, item = null, count = 1, displayLayer = 0) {
		const b = this.#base();
		const ItemContainer = this.game.uiClasses.ItemContainer;
		const container = new ItemContainer(this.game, { x: b.x + x, y: b.y + y }, item == null ? 0 : count, item, displayLayer);
		container.displayLayer = displayLayer;
		container.visible = true;
		return this.#register(container);
	}

	addLabelArea(x, y, width, height, displayLayer = 0) {
		const b = this.#base();
		const label = new Label(this.game);
		label.area = { x: b.x + x, y: b.y + y, w: width, h: height };
		label.displayLayer = displayLayer;
		label.visible = true;
		return this.#register(label);
	}

	/** addLabel(x, y, text (string or Text), width?, height?, displayLayer?) */
	addLabel(x, y, text, width = null, height = null, displayLayer = 0) {
		const b = this.#base();
		if (typeof text === 'string')
			width ??= Math.max(...text.split('\n').map(l => l.length)) * 6;
		else
			width ??= this.game.getMaxLineWidth(text);
		height ??= 7;
		const label = new Label(this.game);
		label.area = { x: b.x + x, y: b.y + y, w: width, h: height };
		label.displayLayer = displayLayer;
		label.visible = true;
		if (typeof text === 'string')
			label.setText(text, 15, TransparentPaper, BuiltinPalette.UI);
		else
			label.setText(text, width, 15, TransparentPaper, BuiltinPalette.UI);
		return this.#register(label);
	}

	addList(x, y, width, height, displayLayer = 0, backgroundColorIndex = null, paletteIndex = null) {
		const b = this.#base();
		const List = this.game.uiClasses.List;
		const list = new List(this.game, b.x + x, b.y + y, width, height, displayLayer, backgroundColorIndex, paletteIndex);
		list.visible = true;
		return this.#register(list);
	}

	addInput(x, y, width, displayLayer = 0, maxLength = null) {
		const b = this.#base();
		const Input = this.game.uiClasses.Input;
		const input = new Input(this.game, b.x + x, b.y + y, width, displayLayer, maxLength);
		input.visible = true;
		return this.#register(input);
	}

	addWindow(x, y, widthInTiles, heightInTiles, dark = false, displayLayer = 0, paletteIndex = null) {
		const b = this.#base();
		return this.#register(new Window(this.game, b.x + x, b.y + y, widthInTiles, heightInTiles, dark, displayLayer, paletteIndex));
	}
}

export class ScreenHandler {
	/** @param {Record<number, () => Screen>} factories */
	constructor(game, factories) {
		this.game = game;
		this.factories = factories;
		this.screens = [];
		this.createdScreens = new Map();
		this.screenChanged = new EventEmitter();
	}

	get activeScreen() { return this.screens.length === 0 ? null : this.screens[this.screens.length - 1]; }
	get lastScreen() { return this.screens.length < 2 ? null : this.screens[this.screens.length - 2]; }

	create(screenType) {
		const factory = this.factories[screenType];
		if (!factory)
			throw new Error(`Screen type ${screenType} is not implemented yet.`);
		const screen = factory();
		screen.preInit(this.game);
		screen.init();
		screen.afterInit();
		this.createdScreens.set(screenType, screen);
		return screen;
	}

	pushScreen(screenType, followAction = null) {
		const currentScreen = this.activeScreen;

		if (currentScreen?.type === screenType) {
			followAction?.();
			return false;
		}

		let screen = this.createdScreens.get(screenType);
		if (!screen)
			screen = this.create(screenType);

		const push = () => {
			this.screens.push(screen);
			currentScreen?.screenPushed(screen);
			screen.preOpen();
			screen.open(followAction);
			this.screenChanged.invoke(screen, currentScreen);
		};

		const transparent = currentScreen?.transparent === true || screen.transparent;
		const fadeOut = currentScreen != null && (currentScreen.fadeType === ScreenFadeType.Out || currentScreen.fadeType === ScreenFadeType.Both);
		const fadeIn = screen.fadeType === ScreenFadeType.In || screen.fadeType === ScreenFadeType.Both;

		if (!transparent && (fadeIn || fadeOut))
			this.game.fade(this.game.constructor.DefaultFadeTime, null, push);
		else
			push();

		return true;
	}

	popScreen() {
		if (this.screens.length === 0)
			return null;

		const screen = this.screens.pop();
		const prevScreen = this.activeScreen;

		const pop = () => {
			screen.close();
			prevScreen?.screenPopped(screen);
			this.screenChanged.invoke(prevScreen ?? screen, screen);
		};

		const transparent = prevScreen?.transparent === true || screen.transparent;
		const fadeIn = prevScreen != null && (prevScreen.fadeType === ScreenFadeType.In || prevScreen.fadeType === ScreenFadeType.Both);
		const fadeOut = screen.fadeType === ScreenFadeType.Out || screen.fadeType === ScreenFadeType.Both;

		if (!transparent && (fadeIn || fadeOut))
			this.game.fade(this.game.constructor.DefaultFadeTime, null, pop);
		else
			pop();

		return screen;
	}

	clearAllScreens() {
		while (this.screens.length !== 0)
			this.screens.pop().close();
	}

	replaceScreen(screenType, followAction = null) {
		this.popScreen();
		this.pushScreen(screenType, followAction);
	}

	findScreen(screenType) {
		for (const s of this.screens)
			if (s.type === screenType)
				return s;
		return null;
	}

	dispose() {
		for (const s of this.createdScreens.values())
			s.destroy();
		this.createdScreens.clear();
	}
}
