// Screens which are not implemented in the C# port (only TODO stubs there):
// riddlemouth, camp and the options (save/load) window.
import { ScreenType } from './screen.js';
import { ButtonGridScreen } from './buttonGridScreen.js';
import { WindowScreen, TextScrollHandler } from './textScreens.js';
import { Button } from '../ui/controls.js';
import { TextAlignment, TransparentPaper } from '../ui/text.js';
import { ButtonType, CursorType, Image80x80, Layout } from '../../data/enums.js';
import { BuiltinPalette } from '../../engine/layerSetup.js';
import { Key, MouseButtons } from '../keys.js';
import { Message } from '../messages.js';
import { Condition, fillHitPoints, fillSpellPoints, healHitPoints, healSpellPoints } from '../../data/characters.js';
import { Text } from '../../data/text.js';

const RiddleTextArea = { x: 16, y: 50, w: 176, h: 140 };

export class RiddlemouthScreen extends ButtonGridScreen {
	constructor() {
		super();
		this.event = null;
		this.textLabel = null;
		this.image = null;
		this.textScrollHandler = new TextScrollHandler();
		this.solved = false;
		this.waitForClick = false;
	}

	get type() { return ScreenType.Riddlemouth; }
	get buttonGridPaletteIndex() { return this.game?.paletteIndexProvider.get80x80ImagePaletteIndex(Image80x80.Riddlemouth) ?? 0; }

	setupButtons(grid) {
		for (let i = 0; i < 9; i++)
			grid.setButton(i, ButtonType.Empty);
		grid.setButton(0, ButtonType.Mouth);
		grid.enableButton(0, !this.solved);
		grid.setButton(2, ButtonType.Exit);
	}

	init() {
		super.init();
		const game = this.game;
		this.image = this.addImage(224, 49, 80, 80, game.graphicIndexProvider.get80x80ImageIndex(Image80x80.Riddlemouth), 10, true);
		this.textLabel = this.addLabelArea(RiddleTextArea.x, RiddleTextArea.y, RiddleTextArea.w, RiddleTextArea.h, 20);
	}

	open(closeAction) {
		super.open(closeAction);
		const game = this.game;
		this.event = game.eventHandler.currentEvent;
		this.solved = false;
		const palette = this.buttonGridPaletteIndex;
		this.image.paletteIndex = palette;
		this.image.visible = true;
		game.setLayout(Layout.Riddlemouth, palette);
		game.cursor.cursorType = CursorType.Sword;
		game.cursor.paletteIndex = palette;
		this.requestButtonGridPaletteUpdate();
		this.#showMapText(this.event.riddleTextIndex);
	}

	close() {
		this.textScrollHandler.detach();
		this.textLabel.visible = false;
		super.close();
		const active = this.game.screenHandler.activeScreen;
		if (active)
			this.game.cursor.paletteIndex = active.buttonGridPaletteIndex ?? 0;
	}

	#showMapText(index) {
		const game = this.game;
		const text = game.assets.text('map', game.eventHandler.currentEventMapIndex).getTextBlock(index);
		this.#showText(text);
	}

	#showText(text) {
		this.textLabel.setText(text, RiddleTextArea.w, 15, TransparentPaper, this.buttonGridPaletteIndex);
		this.textLabel.visible = true;
		this.textScrollHandler.detach();
		this.textScrollHandler.attach(this.textLabel);
	}

	screenPopped(screen) {
		super.screenPopped(screen);
		const game = this.game;
		if (!screen.transparent)
			game.setLayout(Layout.Riddlemouth, this.buttonGridPaletteIndex);
		if ((screen.type === ScreenType.SelectWord || screen.type === ScreenType.InputWord) && game.currentWord)
			this.#answer(game.currentWord);
	}

	#answer(word) {
		const game = this.game;
		const index = game.assets.findWord(word.trim());
		if (index != null && index === this.event.wordIndex) {
			this.solved = true;
			game.state.learnWord(index);
			this.#showMapText(this.event.solvedTextIndex);
			if (this.event.iconIndex) {
				const mapIndex = game.eventHandler.currentEventMapIndex;
				game.state.saveTileChange(mapIndex, this.event.x, this.event.y, this.event.iconIndex);
				game.screenHandler.lastScreen?.tileChanged?.(mapIndex, this.event.x, this.event.y, this.event.iconIndex);
			}
			if (this.event.saveEvent)
				game.saveEvent(this.event.index);
			this.requestButtonSetup();
		} else {
			this.#showText(game.assets.message(Message.WrongAnswer));
		}
	}

	buttonClicked(index) {
		const game = this.game;
		if (index === 0 && !this.solved)
			game.screenHandler.pushScreen(ScreenType.SelectWord);
		else if (index === 2)
			game.screenHandler.popScreen();
	}

	keyDown(key, modifiers) {
		if (this.textScrollHandler.keyDown(key))
			return true;
		return super.keyDown(key, modifiers);
	}

	mouseDown(position, buttons, modifiers) {
		if (position.x < 200 && this.textScrollHandler.mouseDown(buttons))
			return true;
		return super.mouseDown(position, buttons, modifiers);
	}
}

const OW = { X: 64, Y: 64, W: 12, H: 5, WindowLayer: 150, ControlLayer: 175 };

/** Options window (disk button): save, load and close */
export class OptionsScreen extends WindowScreen {
	constructor() {
		super(OW.X, OW.Y, OW.W, OW.H, OW.WindowLayer);
	}

	get type() { return ScreenType.Options; }

	init() {
		super.init();
		const game = this.game;
		const label = this.addLabel(0, 0, 'AMBERSTAR WEB', this.clientArea.w, 7, OW.ControlLayer);
		label.alignment = TextAlignment.Center;
		let x = 0;
		const y = 24;
		const save = this.addButton(x, y, ButtonType.Save, OW.ControlLayer);
		x += Button.Width;
		const load = this.addButton(x, y, ButtonType.Load, OW.ControlLayer);
		x += Button.Width;
		const musicType = () => game.musicEnabled ? ButtonType.Music : ButtonType.NoMusic;
		const music = this.addButton(x, y, musicType(), OW.ControlLayer);
		music.clickAction.add(() => {
			game.setMusicEnabled(!game.musicEnabled);
			music.setButtonType(musicType());
		});
		x += Button.Width;
		const quit = this.addButton(x, y, ButtonType.Quit, OW.ControlLayer);
		x += Button.Width;
		const exit = this.addButton(x, y, ButtonType.Exit, OW.ControlLayer);
		save.clickAction.add(() => {
			game.screenHandler.popScreen();
			game.screenHandler.pushScreen(ScreenType.SaveSlots);
		});
		load.clickAction.add(() => {
			game.screenHandler.popScreen();
			game.screenHandler.pushScreen(ScreenType.LoadSlots);
		});
		quit.clickAction.add(() => {
			game.screenHandler.popScreen();
			game.askForConfirmation(Message.ReallyQuitProgram, () => game.openMainMenu());
		});
		exit.clickAction.add(() => game.screenHandler.popScreen());
	}
}

/** Camp: the party rests for 8 hours and consumes one ration per member */
export function openCamp(game) {
	game.askForConfirmation(Message.PartyRestsEightHours, () => {
		const hungry = [];
		game.foreachPartyMember(pm => {
			if (pm.food > 0) {
				pm.food--;
				fillHitPoints(pm);
				fillSpellPoints(pm);
			} else {
				hungry.push(pm.name);
			}
		}, Condition.DeadAshesDust);
		for (let i = 0; i < 8 * 12; i++)
			game.time.tick();
		game.afterPartyChange();
		if (hungry.length) {
			const text = game.assets.message(Message.NoFoodCannotRecover).getLines(1000).join(' ');
			game.showTextMessage(hungry.map(n => `${n} ${text}`).join('#'));
		}
	});
}
