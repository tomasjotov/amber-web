// Main menu, save slots, name input and the creation of a new hero.
// None of this exists in the C# port. In the original game a new game was started by a separate
// program (installation with a fresh copy of the game files); here the fresh files from
// Amberfiles/_new are used.
import { Screen, ScreenType, ScreenFadeType } from './screen.js';
import { WindowScreen } from './textScreens.js';
import { CharacterStatsScreen } from './characterScreens.js';
import { Button } from '../ui/controls.js';
import { TextAlignment } from '../ui/text.js';
import { ButtonType, CursorType, Image80x80, Layout } from '../../data/enums.js';
import { BuiltinPalette } from '../../engine/layerSetup.js';
import { Key, MouseButtons } from '../keys.js';
import { Message } from '../messages.js';
import { Gender, Attribute } from '../../data/characters.js';
import { getSlots, getLastSlot, SlotCount } from '../saveSystem.js';
import { random } from '../util.js';
import { PersonInfoView } from '../ui/personInfoView.js';

const MenuArea = { x: 112, y: 50, w: 192, h: 140 };

export class MainMenuScreen extends Screen {
	constructor() {
		super();
		this.list = null;
		this.actions = [];
	}

	get type() { return ScreenType.MainMenu; }
	get allowCharacterSelection() { return false; }
	get allowInventoryAccess() { return false; }
	get closeOnEscape() { return false; }

	open(closeAction) {
		super.open(closeAction);
		const game = this.game;
		game.setPartyUIVisible(false);
		const palette = game.paletteIndexProvider.get80x80ImagePaletteIndex(Image80x80.Amberstar);
		game.setLayout(Layout.PictureText, palette);
		game.cursor.cursorType = CursorType.Sword;
		game.cursor.paletteIndex = BuiltinPalette.UI;
		const image = this.addImage(16, 81, 80, 80, game.graphicIndexProvider.get80x80ImageIndex(Image80x80.Amberstar), 10, true);
		image.paletteIndex = palette;
		const title = this.addLabel(MenuArea.x, MenuArea.y + 4, 'AMBERSTAR', MenuArea.w, 7, 20);
		title.alignment = TextAlignment.Center;
		const subtitle = this.addLabel(MenuArea.x, MenuArea.y + 14, 'WEB VERSION', MenuArea.w, 7, 20);
		subtitle.alignment = TextAlignment.Center;

		this.list = this.addList(MenuArea.x + 40, MenuArea.y + 40, MenuArea.w - 80, 80, 20);
		this.actions = [];
		const lastSlot = getLastSlot();
		const slots = getSlots();
		if (lastSlot && slots[lastSlot - 1])
			this.#add(`CONTINUE (${slots[lastSlot - 1].name})`, () => game.loadSlot(lastSlot));
		this.#add('NEW GAME', () => {
			if (!game.assets.hasNewGameData) {
				game.showTextMessage('THE FOLDER AMBERFILES/_NEW WITH THE DATA FOR A NEW GAME IS MISSING.');
				return;
			}
			game.screenHandler.replaceScreen(ScreenType.CharacterCreation);
		});
		if (slots.some(Boolean))
			this.#add('LOAD GAME', () => game.screenHandler.pushScreen(ScreenType.LoadSlots));
		this.list.itemClicked.add(index => this.actions[index]?.());
	}

	#add(text, action) {
		this.list.addItem(text);
		this.actions.push(action);
	}

	keyDown(key, modifiers) {
		if (key === Key.Enter && this.actions.length) {
			this.actions[0]();
			return true;
		}
		return super.keyDown(key, modifiers);
	}

	mouseDown(position, buttons, modifiers) {
		if (buttons === MouseButtons.Left && this.list?.mouseClick(position))
			return true;
		return super.mouseDown(position, buttons, modifiers);
	}
}

const SW = { X: 16, Y: 52, W: 18, H: 9, WindowLayer: 150, ControlLayer: 160 };

class SlotScreen extends WindowScreen {
	constructor() {
		super(SW.X, SW.Y, SW.W, SW.H, SW.WindowLayer);
		this.list = null;
	}

	get dark() { return true; }
	get title() { return ''; }

	init() {
		super.init();
		const { w, h } = this.clientArea;
		const title = this.addLabel(0, 0, this.title, w, 7, SW.ControlLayer);
		title.alignment = TextAlignment.Center;
		this.list = this.addList(0, 10, w, h - 10 - Button.Height - 2, SW.ControlLayer, 3);
		this.list.itemClicked.add(index => this.slotClicked(index + 1));
		const exit = this.addButton(w - Button.Width, h - Button.Height, ButtonType.Exit, SW.ControlLayer);
		exit.clickAction.add(() => this.game.screenHandler.popScreen());
	}

	open(closeAction) {
		super.open(closeAction);
		this.#fill();
	}

	#fill() {
		this.list.clear();
		const slots = getSlots();
		for (let i = 1; i <= SlotCount; i++) {
			const s = slots[i - 1];
			const text = s ? `${String(i).padStart(2, ' ')}. ${s.name.padEnd(15, ' ')} ${(s.location ?? '').slice(0, 20)}` : `${String(i).padStart(2, ' ')}. ---`;
			this.list.addItem(text, s ? 15 : 3);
		}
		this.list.visible = true;
	}

	refresh() { this.#fill(); }

	slotClicked(slot) { }

	mouseDown(position, buttons, modifiers) {
		if (buttons === MouseButtons.Left && this.list.mouseClick(position))
			return true;
		if (buttons === MouseButtons.Right) {
			this.game.screenHandler.popScreen();
			return true;
		}
		return super.mouseDown(position, buttons, modifiers);
	}
}

export class LoadSlotsScreen extends SlotScreen {
	get type() { return ScreenType.LoadSlots; }
	get title() { return 'LOAD GAME'; }

	slotClicked(slot) {
		const game = this.game;
		if (!getSlots()[slot - 1])
			return;
		game.screenHandler.popScreen();
		game.loadSlot(slot);
	}
}

export class SaveSlotsScreen extends SlotScreen {
	get type() { return ScreenType.SaveSlots; }
	get title() { return 'SAVE GAME'; }

	slotClicked(slot) {
		const game = this.game;
		this.pendingSlot = slot;
		game.inputPrompt = 'NAME OF THE SAVED GAME:';
		game.inputDefault = getSlots()[slot - 1]?.name ?? '';
		game.screenHandler.pushScreen(ScreenType.NameInput);
	}

	screenPopped(screen) {
		super.screenPopped(screen);
		const game = this.game;
		if (screen.type === ScreenType.NameInput && game.currentWord && this.pendingSlot) {
			const slot = this.pendingSlot;
			this.pendingSlot = null;
			const ok = game.saveSlot(slot, game.currentWord.trim().slice(0, 15));
			game.screenHandler.popScreen();
			game.showTextMessage(ok ? 'THE GAME WAS SAVED.' : 'SAVING FAILED.');
		}
	}
}

const NI = { X: 48, Y: 80, W: 12, H: 4, WindowLayer: 180, ControlLayer: 190 };

export class NameInputScreen extends WindowScreen {
	constructor() {
		super(NI.X, NI.Y, NI.W, NI.H, NI.WindowLayer);
	}

	get type() { return ScreenType.NameInput; }
	get closeOnRightClick() { return true; }
	get closeOnSpace() { return false; }

	init() {
		super.init();
		this.label = this.addLabelArea(0, 7, this.clientArea.w, 7, NI.ControlLayer);
		this.input = this.addInput(-1, 16, this.clientArea.w, NI.ControlLayer, 16);
	}

	open(closeAction) {
		const game = this.game;
		game.currentWord = null;
		this.label.setText(game.inputPrompt ?? 'NAME:');
		this.label.visible = true;
		this.input.setText(game.inputDefault ?? '');
		super.open(closeAction);
	}

	keyChar(ch, modifiers) {
		if (this.input.keyChar(ch))
			return true;
		return super.keyChar(ch, modifiers);
	}

	keyDown(key, modifiers) {
		const game = this.game;
		if (key === Key.Escape) {
			game.currentWord = null;
			game.screenHandler.popScreen();
			return true;
		}
		if (key === Key.Enter) {
			game.currentWord = this.input.text.trim() || null;
			game.screenHandler.popScreen();
			return true;
		}
		this.input.keyDown(key);
		return true;
	}

	mouseDown(position, buttons, modifiers) {
		if (buttons === MouseButtons.Right) {
			this.game.currentWord = null;
			this.game.screenHandler.popScreen();
			return true;
		}
		return super.mouseDown(position, buttons, modifiers);
	}
}

const RolledAttributes = [Attribute.Strength, Attribute.Intelligence, Attribute.Dexterity, Attribute.Speed, Attribute.Stamina, Attribute.Charisma, Attribute.Luck];

/**
 * Creation of the hero for a new game: name, gender and rolling the attributes
 * ("keep the dice rolling until you are satisfied").
 */
export class CharacterCreationScreen extends CharacterStatsScreen {
	get type() { return ScreenType.CharacterCreation; }
	get allowCharacterSelection() { return false; }
	get allowInventoryAccess() { return false; }
	get closeOnEscape() { return false; }

	open(closeAction) {
		const game = this.game;
		const data = game.assets.loadNewGame();
		this.newGame = data;
		game.state.loadFrom(data.savegame);
		game.state.partyMembers = data.partyMembers;
		game.state.setCurrentInventory(1);
		this.hero = game.state.getPartyMember(1);
		this.#roll();
		game.setPartyUIVisible(true);
		super.open(closeAction);
		this.#showHelp();
	}

	#showHelp() {
		this.help?.forEach(t => t.delete());
		this.help = [['NAME', 212], ['SEX', 247], ['ROLL', 276]].map(([text, x]) => {
			const t = this.game.textManager.create(text, 15, -1, BuiltinPalette.UI);
			t.show(x, 137, 50);
			return t;
		});
	}

	close() {
		this.help?.forEach(t => t.delete());
		this.help = null;
		super.close();
	}

	#roll() {
		for (const attribute of RolledAttributes) {
			const value = this.hero.attributes[attribute];
			const max = value.maxValue || 99;
			value.currentValue = Math.min(max, 15 + random(0, 46));
		}
	}

	#redraw() {
		this.switchToPartyMember(1, true);
		this.game.updatePartyMembers();
	}

	setupButtons(grid) {
		for (let i = 0; i < 9; i++)
			grid.setButton(i, ButtonType.Empty);
		grid.setButton(0, ButtonType.Mouth);
		grid.setButton(1, ButtonType.Stats);
		grid.setButton(2, ButtonType.RotateRight);
		grid.setButton(6, ButtonType.Exit);
		grid.setButton(8, ButtonType.ThumbsUp);
	}

	buttonClicked(index) {
		const game = this.game;
		switch (index) {
			case 0:
				game.inputPrompt = 'NAME OF YOUR HERO:';
				game.inputDefault = this.hero.name;
				game.screenHandler.pushScreen(ScreenType.NameInput);
				break;
			case 1:
				this.hero.gender = this.hero.gender === Gender.Male ? Gender.Female : Gender.Male;
				this.#redraw();
				break;
			case 2:
				this.#roll();
				this.#redraw();
				break;
			case 6:
				game.openMainMenu();
				break;
			case 8:
				game.startFromSaveData({ savegame: game.state.toSavegame(), partyMembers: game.state.partyMembers });
				break;
		}
	}

	screenPopped(screen) {
		super.screenPopped(screen);
		if (screen.type === ScreenType.NameInput && this.game.currentWord) {
			this.hero.name = this.game.currentWord.trim().slice(0, 15);
			this.#redraw();
		}
	}

	keyDown(key, modifiers) {
		if (key === Key.Enter) {
			this.buttonClicked(8);
			return true;
		}
		return super.keyDown(key, modifiers);
	}
}
