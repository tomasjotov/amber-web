// Port of Amberstar.Game.Screens.ButtonGridScreen.
import { Screen } from './screen.js';
import { ButtonGrid } from '../ui/controls.js';
import { ButtonType } from '../../data/enums.js';
import { Key, KeyModifiers } from '../keys.js';

export class ButtonGridScreen extends Screen {
	constructor() {
		super();
		this.buttonGrid = null;
		this.boundButtonClicked = index => this.buttonClicked(index);
	}

	setupButtons(buttonGrid) { }
	buttonClicked(index) { }
	get buttonGridPaletteIndex() { return 0; }

	/** Whether a keypad key press (released) should press the grid button with the given index */
	keypadPressesButton(index) { return true; }

	requestButtonSetup() { if (this.buttonGrid) this.setupButtons(this.buttonGrid); }
	requestButtonGridPaletteUpdate() { if (this.buttonGrid) this.buttonGrid.paletteIndex = this.buttonGridPaletteIndex; }

	getButtonType(index) { return this.buttonGrid?.getButtonType(index) ?? ButtonType.Empty; }

	#createGrid() {
		this.buttonGrid = new ButtonGrid(this.game);
		this.buttonGrid.paletteIndex = this.buttonGridPaletteIndex;
		this.buttonGrid.clickButtonAction.add(this.boundButtonClicked);
	}

	#destroyGrid() {
		if (this.buttonGrid) {
			this.buttonGrid.clickButtonAction.remove(this.boundButtonClicked);
			this.buttonGrid.destroy();
			this.buttonGrid = null;
		}
	}

	open(closeAction) {
		super.open(closeAction);
		if (!this.buttonGrid)
			this.#createGrid();
		this.setupButtons(this.buttonGrid);
	}

	close() {
		this.#destroyGrid();
		super.close();
	}

	screenPushed(screen) {
		if (!screen.transparent)
			this.#destroyGrid();
		super.screenPushed(screen);
	}

	screenPopped(screen) {
		if (!screen.transparent) {
			if (!this.buttonGrid)
				this.#createGrid();
			this.setupButtons(this.buttonGrid);
		}
		super.screenPopped(screen);
	}

	keyUp(key, modifiers) {
		if (modifiers === KeyModifiers.None && key >= Key.Keypad1 && key <= Key.Keypad9) {
			// Keypad layout: 7 8 9 is the upper row
			const n = key - Key.Keypad1; // 0..8 for 1..9
			const row = 2 - Math.floor(n / 3);
			const index = row * 3 + (n % 3);
			if (this.keypadPressesButton(index) && this.buttonGrid?.isButtonEnabled(index))
				this.buttonGrid.press(index);
			return true;
		}
		return super.keyUp(key, modifiers);
	}

	mouseDown(position, buttons, modifiers) {
		if (this.buttonGrid?.mouseClick(position))
			return true;
		return super.mouseDown(position, buttons, modifiers);
	}
}
