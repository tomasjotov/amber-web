// Ports of ItemGridScreen, ItemPickerScreen, InputAmountScreen, ItemScreen and ItemDetailsScreen.
import { Screen, ScreenType } from './screen.js';
import { ButtonGridScreen } from './buttonGridScreen.js';
import { WindowScreen } from './textScreens.js';
import { TextAlignment, TransparentPaper } from '../ui/text.js';
import { ButtonType, CursorType, UIGraphic, UIText } from '../../data/enums.js';
import { BuiltinPalette } from '../../engine/layerSetup.js';
import { Key, KeyModifiers, MouseButtons } from '../keys.js';
import { limit } from '../util.js';
import { ItemFlags, ItemSlotFlags, GenderFlags } from '../../data/characters.js';
import { Text } from '../../data/text.js';

export class ItemGridScreen extends ButtonGridScreen {
	showMessage(messageIndex, waitForClick = true, closeAfterClick = false) { }
	hideMessage() { }
	pickItem(sourceScreen, index) { }
	get itemContainers() { return []; }

	update(elapsedTicks) {
		super.update(elapsedTicks);
		for (const item of this.itemContainers)
			item.update();
	}
}

export class ItemPickerScreen extends Screen {
	constructor() {
		super();
		this.parentScreen = null;
		this.items = [];
		this.pickedItem = null;
		this.itemNameTooltip = null;
	}

	get transparent() { return true; }
	get mouseTrapArea() { throw new Error('abstract'); }
	get message() { throw new Error('abstract'); }
	get itemTooltipArea() { throw new Error('abstract'); }
	get hoverCursorType() { return CursorType.Sword; }
	get hideItemsAfterPicking() { return true; }

	init() {
		super.init();
		this.parentScreen = this.game.screenHandler.activeScreen;
		this.items = [...(this.parentScreen?.itemContainers ?? [])];
	}

	open(closeAction) {
		super.open(closeAction);
		// The parent screen is the active screen below us
		this.parentScreen = this.game.screenHandler.lastScreen ?? this.parentScreen;
		this.items = [...(this.parentScreen?.itemContainers ?? [])];
		const { x, y, w, h } = this.itemTooltipArea;
		this.itemNameTooltip = this.addLabelArea(x, y, w, h, 100);
		this.itemNameTooltip.alignment = TextAlignment.Center;
		this.itemNameTooltip.visible = false;
		this.pickedItem = null;
		this.parentScreen?.showMessage(this.message, false, false);
		this.items.forEach(i => { if (!i.empty) i.visible = true; });
		this.game.trapMouse(this.mouseTrapArea);
		this.game.cursor.cursorType = this.hoverCursorType;
	}

	close() {
		this.parentScreen?.hideMessage();
		this.game.untrapMouse();
		this.game.cursor.cursorType = CursorType.Sword;
		if (this.hideItemsAfterPicking)
			this.items.forEach(i => i.visible = false);
		super.close();
		this.parentScreen?.pickItem(this.type, this.pickedItem);
	}

	keyDown(key, modifiers) {
		if (key === Key.Escape || key === Key.Space) {
			this.pickedItem = null;
			this.game.screenHandler.popScreen();
			return true;
		}
		return super.keyDown(key, modifiers);
	}

	mouseDown(position, buttons, modifiers) {
		if (buttons === MouseButtons.Left) {
			for (let i = 0; i < this.items.length; i++) {
				const item = this.items[i];
				if (!item.empty && item.contains(position)) {
					this.pickedItem = i;
					this.game.screenHandler.popScreen();
					return true;
				}
			}
		} else if (buttons === MouseButtons.Right) {
			this.pickedItem = null;
			this.game.screenHandler.popScreen();
			return true;
		}
		return super.mouseDown(position, buttons, modifiers);
	}

	mouseMove(position, buttons) {
		super.mouseMove(position, buttons);
		for (const item of this.items) {
			if (!item.empty && item.contains(position)) {
				this.itemNameTooltip.setText(this.game.assets.fragmentText(item.item.nameIndex), 320 - this.itemNameTooltip.area.x, 15, 0, this.parentScreen.buttonGridPaletteIndex);
				this.itemNameTooltip.visible = true;
				return;
			}
		}
		this.itemNameTooltip.visible = false;
	}
}

const IA = { X: 32, Y: 112, W: 10, H: 6, WindowLayer: 150, ControlLayer: 175 };

export class InputAmountScreen extends WindowScreen {
	constructor() {
		super(IA.X, IA.Y, IA.W, IA.H, IA.WindowLayer);
	}

	get graphic() { throw new Error('abstract'); }
	get inputLabelText() { throw new Error('abstract'); }
	get messageIndex() { throw new Error('abstract'); }
	get closeOnEscape() { return false; }

	init() {
		super.init();
		const game = this.game;
		this.setAnchor(0, 0);
		const createLabel = (x, y, width, text = null) => {
			const label = this.addLabelArea(x, y, width, 7, IA.ControlLayer);
			if (text)
				label.setText(text, width);
			return label;
		};
		const createFixedLabel = (x, y, text) => createLabel(x, y, game.getMaxLineWidth(text), text);
		let x = IA.X + 16, y = IA.Y + 16;
		this.addImage(x, y, 16, 16, game.graphicIndexProvider.getUIGraphicIndex(UIGraphic.EmptyItemSlot), IA.ControlLayer, true);
		const image = this.addImage(x, y, 16, 16, game.graphicIndexProvider.getItemGraphicIndex(this.graphic), IA.ControlLayer + 5);
		image.paletteIndex = BuiltinPalette.Item;
		x += 16 + 3;
		y += 2;
		createFixedLabel(x, y, this.inputLabelText).visible = true;
		y += 11;
		this.inputValue = createLabel(x, y, 52);
		this.inputValue.alignment = TextAlignment.Right;
		x = IA.X + 16 + 1;
		y += 9;
		createFixedLabel(x, y, game.assets.message(this.messageIndex)).visible = true;
		x = IA.X + 16;
		y = IA.Y + 48;
		this.upButton = this.addButton(x, y, ButtonType.ArrowUp, IA.ControlLayer);
		this.upButton.clickAction.add(() => this.#changeAmount(1));
		this.upButton.rightClickAction.add(() => this.#changeAmount(32767));
		this.downButton = this.addButton(x, y + 16, ButtonType.ArrowDown, IA.ControlLayer);
		this.downButton.clickAction.add(() => this.#changeAmount(-1));
		this.downButton.rightClickAction.add(() => this.#changeAmount(-32768));
		const exit = this.addButton(x + 48, y + 16, ButtonType.Exit, IA.ControlLayer);
		exit.clickAction.add(() => game.screenHandler.popScreen());
	}

	#changeAmount(change) {
		if (change === 0)
			return;
		const game = this.game;
		game.currentAmount = limit(0, game.currentAmount + change, game.currentMaxAmount);
		this.#updateControls();
	}

	#updateControls() {
		const game = this.game;
		this.inputValue.setText(String(game.currentAmount));
		this.inputValue.visible = true;
		this.upButton.disabled = game.currentAmount === game.currentMaxAmount;
		this.downButton.disabled = game.currentAmount === 0;
	}

	open(closeAction) {
		if (this.game.currentMaxAmount <= 0)
			throw new Error('InputAmountScreen needs currentMaxAmount to be set beforehand.');
		super.open(closeAction);
		this.#updateControls();
	}

	keyDown(key, modifiers) {
		const game = this.game;
		switch (key) {
			case Key.Up:
				this.#changeAmount(modifiers === KeyModifiers.None ? 1 : game.currentMaxAmount - game.currentAmount);
				return true;
			case Key.Down:
				this.#changeAmount(modifiers === KeyModifiers.None ? -1 : -game.currentAmount);
				return true;
			case Key.PageUp:
				this.#changeAmount(modifiers === KeyModifiers.None ? 10 : game.currentMaxAmount - game.currentAmount);
				return true;
			case Key.PageDown:
				this.#changeAmount(modifiers === KeyModifiers.None ? -10 : -game.currentAmount);
				return true;
			case Key.Escape:
				game.currentAmount = 0;
				game.screenHandler.popScreen();
				return true;
			case Key.Space:
			case Key.Enter:
				game.screenHandler.popScreen();
				return true;
		}
		return false;
	}

	mouseDown(position, buttons, modifiers) {
		if (modifiers !== KeyModifiers.None)
			buttons = MouseButtons.Right;
		return super.mouseDown(position, buttons, modifiers);
	}

	mouseWheel(position, scrollX, scrollY) {
		if (scrollY > 0) this.#changeAmount(1);
		else if (scrollY < 0) this.#changeAmount(-1);
		return true;
	}
}

const IS = { X: 16, Y: 112, W: 18, H: 6, WindowLayer: 100, ControlLayer: 125 };

export class ItemScreen extends WindowScreen {
	constructor() {
		super(IS.X, IS.Y, IS.W, IS.H, IS.WindowLayer);
		this.classLabels = new Array(8).fill(null);
	}

	get type() { return ScreenType.ItemView; }

	init() {
		super.init();
		const game = this.game;
		const createLabel = (x, y, width, text = null) => {
			const label = this.addLabelArea(x, y, width, 7, IS.ControlLayer);
			if (text)
				label.setText(text, width);
			return label;
		};
		const weightText = game.loadUIText(UIText.WeightWithColon);
		const handsText = game.loadUIText(UIText.Hands);
		const fingersText = game.loadUIText(UIText.Fingers);
		const damageText = game.loadUIText(UIText.Damage);
		const shieldText = game.loadUIText(UIText.Protection);
		const classesText = game.loadUIText(UIText.Classes);
		const genderText = game.loadUIText(UIText.Gender);

		this.itemNameLabel = createLabel(19, 1, 126);
		this.itemTypeLabel = createLabel(19, 9, 126);
		const weightLabel = createLabel(0, 19, game.getMaxLineWidth(weightText), weightText);
		this.weightValue = createLabel(60, 19, 54 + 91 - weightLabel.area.w);
		const handsLabel = createLabel(0, 30, game.getMaxLineWidth(handsText), handsText);
		this.handsValue = createLabel(60, 30, 54 + 91 - handsLabel.area.w);
		const fingersLabel = createLabel(0, 38, game.getMaxLineWidth(fingersText), fingersText);
		this.fingersValue = createLabel(60, 38, 54 + 91 - fingersLabel.area.w);
		const damageLabel = createLabel(0, 46, game.getMaxLineWidth(damageText), damageText);
		this.damageValue = createLabel(60, 46, 54 + 91 - damageLabel.area.w);
		const shieldLabel = createLabel(0, 54, game.getMaxLineWidth(shieldText), shieldText);
		this.shieldValue = createLabel(60, 54, 54 + 91 - shieldLabel.area.w);

		createLabel(19 + 126, 1, 112, classesText);
		let x = 19 + 126, y = 8;
		const width = 54;
		for (let i = 0; i < 8; i++) {
			this.classLabels[i] = createLabel(x, y, width);
			if (i % 2 === 0)
				x += width;
			else {
				x -= width;
				y += 7;
			}
		}
		y += 3;
		const genderLabel = createLabel(x, y, game.getMaxLineWidth(genderText), genderText);
		this.genderValue = createLabel(x + genderLabel.area.w, y, 114 - genderLabel.area.w);

		this.showDetailsButton = this.addButton(224, 48, ButtonType.Eye, IS.ControlLayer);
		this.showDetailsButton.disabled = true;
		this.showDetailsButton.clickAction.add(() => game.screenHandler.pushScreen(ScreenType.ItemDetails));
	}

	open(closeAction) {
		const game = this.game;
		const item = game.currentItem;
		if (!item)
			throw new Error('ItemScreen needs currentItem to be set beforehand.');
		super.open(closeAction);
		this.#initTexts(item);
		this.addImage(0, 0, 16, 16, game.graphicIndexProvider.getUIGraphicIndex(UIGraphic.EmptyItemSlot), 105, true);
		const itemImage = this.addImage(0, 0, 16, 16, game.graphicIndexProvider.getItemGraphicIndex(item.graphicIndex), 110);
		itemImage.paletteIndex = BuiltinPalette.Item;
		this.showDetailsButton.disabled = !(item.slotFlags & ItemSlotFlags.Identified) && game.state.travelType !== 6;
		this.showDetailsButton.visible = true;
	}

	#initTexts(item) {
		const game = this.game;
		const show = (label, text) => {
			label.setText(text);
			label.visible = true;
		};
		show(this.itemNameLabel, game.assets.fragmentText(item.nameIndex));
		show(this.itemTypeLabel, game.nameText('itemType', item.type));
		show(this.weightValue, `${item.weight}${game.loadUIText(UIText.Grams).getString()}`);
		show(this.handsValue, `${item.hands}`);
		show(this.fingersValue, `${item.fingers}`);
		show(this.damageValue, `${item.damage}`);
		show(this.shieldValue, `${item.defense}`);
		show(this.genderValue, game.loadUIText(item.genders === GenderFlags.Male ? UIText.Male : item.genders === GenderFlags.Female ? UIText.Female : UIText.Both));
		let classIndex = 1;
		for (let x = 0; x < 2; x++) {
			for (let y = 0; y < 4; y++) {
				const label = this.classLabels[x + y * 2];
				if (item.usableClasses & (1 << classIndex)) {
					label.setText(game.nameText('class', classIndex));
					label.visible = true;
				} else {
					label.visible = false;
				}
				classIndex++;
			}
		}
	}

	keyDown(key, modifiers) {
		this.game.screenHandler.popScreen();
		return true;
	}

	mouseDown(position, buttons, modifiers) {
		if (this.showDetailsButton?.mouseClick(position))
			return true;
		this.game.screenHandler.popScreen();
		return true;
	}
}

const ID = { X: 32, Y: 48, W: 12, H: 6, WindowLayer: 150, TextLayer: 175 };

export class ItemDetailsScreen extends WindowScreen {
	constructor() {
		super(ID.X, ID.Y, ID.W, ID.H, ID.WindowLayer);
	}

	get type() { return ScreenType.ItemDetails; }
	get closeOnNextInput() { return true; }

	init() {
		super.init();
		const game = this.game;
		const createLabel = (x, y, width, text = null) => {
			const label = this.addLabelArea(x, y, width, 7, ID.TextLayer);
			if (text)
				label.setText(text, width);
			return label;
		};
		const createPair = (x, y, labelText, twoLines = false) => {
			const label = createLabel(x, y, game.getMaxLineWidth(labelText), labelText);
			const value = createLabel(twoLines ? x : x + label.area.w, twoLines ? y + 7 : y, twoLines ? 160 : 80 - label.area.w);
			label.visible = true;
			value.visible = true;
			return { label, value };
		};
		let y = 0;
		this.lpMax = createPair(0, y, game.loadUIText(UIText.LPMax)).value;
		this.spMax = createPair(80, y, game.loadUIText(UIText.SPMax)).value;
		y += 7;
		this.mbw = createPair(0, y, game.loadUIText(UIText.MBW)).value;
		this.mba = createPair(80, y, game.loadUIText(UIText.MBA)).value;
		y += 7;
		this.attribute = createPair(0, y, game.loadUIText(UIText.Attribute), true).value;
		y += 14;
		this.skill = createPair(0, y, game.loadUIText(UIText.Skill), true).value;
		y += 14;
		const spell = createPair(0, y, game.loadUIText(UIText.Magic), true);
		this.spellLabel = spell.label;
		this.spell = spell.value;
	}

	open(closeAction) {
		if (!this.game.currentItem)
			throw new Error('ItemDetailsScreen needs currentItem to be set beforehand.');
		super.open(closeAction);
		this.#initValues(this.game.currentItem);
	}

	#initValues(item) {
		const game = this.game;
		const cursed = (item.flags & ItemFlags.Cursed) !== 0;
		const setText = (label, text, color = 15) => {
			label.setText(text, color, TransparentPaper, BuiltinPalette.UI);
			label.visible = true;
		};
		const setValue = (label, value) => setText(label, `${cursed ? -value : value}`);
		setValue(this.lpMax, item.hitPoints);
		setValue(this.spMax, item.spellPoints);
		setValue(this.mbw, item.magicWeaponBonus);
		setValue(this.mba, item.magicArmorBonus);
		const colon = game.loadUIText(UIText.Colon).getString();
		if (item.attribute === 0)
			this.attribute.visible = false;
		else
			setText(this.attribute, `${game.nameString('attribute', item.attribute - 1)}${colon}${cursed ? -item.attributeValue : item.attributeValue}`);
		if (item.skill === 0)
			this.skill.visible = false;
		else
			setText(this.skill, `${game.nameString('skill', item.skill - 1)}${colon}${cursed ? -item.skillValue : item.skillValue}`);
		if (item.spellCharges === 0)
			this.spell.visible = false;
		else {
			const schoolName = game.nameString('spellSchool', item.spellSchool);
			const spellName = game.nameString('spell', (item.spellSchool - 1) * 30 + item.spellIndex);
			const open = game.loadUIText(UIText.OpenBracket).getString();
			const close = game.loadUIText(UIText.CloseBracket).getString();
			const charges = item.spellCharges === 255 ? game.loadUIText(UIText.ThreeStars).getString() : `${item.spellCharges}`;
			setText(this.spellLabel, schoolName, 1);
			setText(this.spell, `${spellName}${open}${charges}${close}`);
		}
	}
}
