// Ports of InventoryScreen (with sub screens) and CharacterStatsScreen.
// The C# version leaves several inventory buttons as TODO; they are implemented here.
import { ScreenType } from './screen.js';
import { ButtonGridScreen } from './buttonGridScreen.js';
import { ItemGridScreen, ItemPickerScreen, InputAmountScreen } from './itemScreens.js';
import { TextAlignment, TransparentPaper } from '../ui/text.js';
import { ItemContainer } from '../ui/itemContainer.js';
import { PersonInfoView } from '../ui/personInfoView.js';
import { ButtonType, CursorType, Layout, UIText, StatusIcon, ItemGraphic } from '../../data/enums.js';
import { BuiltinPalette, Layer } from '../../engine/layerSetup.js';
import { Key, MouseButtons } from '../keys.js';
import { Message } from '../messages.js';
import {
	EquipmentSlot, ItemFlags, ItemType, GenderFlags, Condition, isDead, maxWeight, Attribute,
} from '../../data/characters.js';
import { GameState } from '../gameState.js';

const MessageDisplayArea = { x: 16, y: 50, w: 176, h: 14 };
const ItemTooltipArea = { x: 16, y: 57, w: 176, h: 7 };
const EquipmentSlotPositions = Array.from({ length: 9 }, (_, i) => ({ x: 16 + (i % 3) * 32, y: 37 + 44 + Math.floor(i / 3) * 32 }));
const InventorySlotPositions = Array.from({ length: 12 }, (_, i) => ({ x: 112 + (i % 3) * 32, y: 37 + 44 + Math.floor(i / 3) * 32 }));
const AllItemsArea = { x: 16, y: 81, w: 112 + 2 * 32 + 16 - 16, h: 37 + 44 + 3 * 32 + 16 - 81 };

/** Applies (sign = 1) or removes (sign = -1) the bonus values of an equipped item */
export function applyEquipmentBonus(pm, item, sign) {
	const cursed = (item.flags & ItemFlags.Cursed) !== 0 ? -1 : 1;
	pm.usedHands = Math.max(0, pm.usedHands + sign * item.hands);
	pm.usedFingers = Math.max(0, pm.usedFingers + sign * item.fingers);
	pm.damage = Math.max(0, pm.damage + sign * item.damage);
	pm.defense = Math.max(0, pm.defense + sign * item.defense);
	pm.magicBonusWeapon = Math.max(0, pm.magicBonusWeapon + sign * item.magicWeaponBonus);
	pm.magicBonusArmor = Math.max(0, pm.magicBonusArmor + sign * item.magicArmorBonus);
	if (item.hitPoints)
		pm.hitPoints.bonusValue = Math.max(0, pm.hitPoints.bonusValue + sign * cursed * item.hitPoints);
	if (item.spellPoints)
		pm.spellPoints.bonusValue = Math.max(0, pm.spellPoints.bonusValue + sign * cursed * item.spellPoints);
	if (item.attribute && pm.attributes[item.attribute])
		pm.attributes[item.attribute].bonusValue += sign * cursed * item.attributeValue;
	if (item.skill && pm.skills[item.skill])
		pm.skills[item.skill].bonusValue += sign * cursed * item.skillValue;
	pm.hitPoints.currentValue = Math.min(pm.hitPoints.currentValue, pm.hitPoints.totalMax);
	pm.spellPoints.currentValue = Math.min(pm.spellPoints.currentValue, pm.spellPoints.totalMax);
}

export class InventoryScreen extends ItemGridScreen {
	constructor() {
		super();
		this.partyMember = null;
		this.itemDragged = false;
		this.waitForClick = false;
		this.closeAfterClick = false;
		this.inventoryItemSlots = [];
		this.equippedItemSlots = [];
		this.personInfoView = null;
		this.messageLabel = null;
		this.weightText = null;
		this.ignoreItemChangeEvents = false;
		this.pickMode = null;
		this.draggingStartedHandler = () => { this.itemDragged = true; this.game.cursor.visible = false; };
		this.draggingEndedHandler = () => { this.itemDragged = false; this.game.cursor.visible = true; };
		this.pendingGive = null; // { kind: 'item'|'gold'|'food', ... }
	}

	get type() { return ScreenType.Inventory; }
	get buttonGridPaletteIndex() { return BuiltinPalette.UI; }
	get itemContainers() { return [...this.equippedItemSlots, ...this.inventoryItemSlots]; }

	setupButtons(grid) {
		const pm = this.partyMember;
		if (!pm)
			return;
		grid.setButton(0, ButtonType.Stats);
		grid.setButton(1, ButtonType.DropItem);
		grid.setButton(2, ButtonType.Exit);
		grid.setButton(3, ButtonType.UseItem);
		grid.setButton(4, ButtonType.GatherGold);
		grid.setButton(5, ButtonType.ExamineItem);
		grid.setButton(6, ButtonType.GiveItem);
		grid.setButton(7, ButtonType.GiveGold);
		grid.setButton(8, ButtonType.GiveFood);
		const hasInventoryItems = pm.inventory.some(s => s.count > 0);
		const hasAnyItems = hasInventoryItems || pm.equipment.some(s => s.count > 0);
		const otherMembers = this.game.state.partySize > 1;
		grid.enableButton(1, hasInventoryItems);
		grid.enableButton(3, hasInventoryItems);
		grid.enableButton(4, false);
		grid.enableButton(5, hasAnyItems);
		grid.enableButton(6, hasInventoryItems && otherMembers);
		grid.enableButton(7, pm.gold > 0 && otherMembers);
		grid.enableButton(8, pm.food > 0 && otherMembers);
	}

	#setupEventHandlers() {
		ItemContainer.draggingStarted.add(this.draggingStartedHandler);
		ItemContainer.draggingEnded.add(this.draggingEndedHandler);
	}

	#cleanUpEventHandlers() {
		ItemContainer.draggingStarted.remove(this.draggingStartedHandler);
		ItemContainer.draggingEnded.remove(this.draggingEndedHandler);
	}

	init() {
		super.init();
		const updateInventoryItem = index => {
			if (this.ignoreItemChangeEvents || !this.partyMember)
				return;
			const slot = this.inventoryItemSlots[index];
			const target = this.partyMember.inventory[index];
			target.count = slot.itemCount;
			target.item = slot.item;
		};
		const updateEquipment = equipmentSlot => {
			if (this.ignoreItemChangeEvents || !this.partyMember)
				return;
			const slot = this.equippedItemSlots[equipmentSlot];
			const target = this.partyMember.equipment[equipmentSlot];
			if (slot.itemCount === ItemContainer.TwoHandedSecondSlotMarker) {
				target.count = 0;
				target.item = null;
			} else {
				target.count = slot.itemCount;
				target.item = slot.item;
			}
		};
		InventorySlotPositions.forEach((p, i) => {
			const slot = this.addItem(p.x, p.y, null, 0, 10);
			slot.draggable = true;
			slot.clicked.add((buttons, mods) => this.#inventorySlotClicked(i, buttons, mods));
			slot.slotChanged.add(() => updateInventoryItem(i));
			this.inventoryItemSlots.push(slot);
		});
		EquipmentSlotPositions.forEach((p, i) => {
			const slot = this.addItem(p.x, p.y, null, 0, 10);
			slot.draggable = true;
			slot.clicked.add((buttons, mods) => this.#equipmentSlotClicked(i, buttons, mods));
			slot.slotChanged.add(() => updateEquipment(i));
			this.equippedItemSlots.push(slot);
		});
		const weightLabel = this.addLabel(16, 178, this.game.loadUIText(UIText.Weight), 80, 10, 2);
		weightLabel.alignment = TextAlignment.Center;
		this.weightText = this.addLabel(16, 186, '0', 80, 10, 2);
		this.weightText.alignment = TextAlignment.Center;
		this.messageLabel = this.addLabel(MessageDisplayArea.x, MessageDisplayArea.y, '', MessageDisplayArea.w, MessageDisplayArea.h, 20);
	}

	open(closeAction) {
		super.open(closeAction);
		this.game.setLayout(Layout.Inventory, BuiltinPalette.UI);
		this.game.cursor.cursorType = CursorType.Sword;
		this.game.cursor.paletteIndex = BuiltinPalette.UI;
		this.hideMessage();
		this.switchToPartyMember(this.game.state.currentInventoryIndex, true);
		this.#setupEventHandlers();
	}

	#cleanUpItems() {
		this.ignoreItemChangeEvents = true;
		this.equippedItemSlots.forEach(s => s.clearItem());
		this.inventoryItemSlots.forEach(s => s.clearItem());
		this.ignoreItemChangeEvents = false;
	}

	close() {
		this.hideMessage();
		this.#cancelGive();
		this.#cleanUpEventHandlers();
		this.#cleanUpItems();
		this.personInfoView?.destroy();
		this.personInfoView = null;
		this.game.afterPartyChange();
		super.close();
		const active = this.game.screenHandler.activeScreen;
		if (active)
			this.game.cursor.paletteIndex = active.buttonGridPaletteIndex ?? BuiltinPalette.UI;
	}

	screenPushed(screen) {
		this.#cleanUpEventHandlers();
		if (!screen.transparent) {
			if (this.personInfoView) this.personInfoView.visible = false;
			if (this.messageLabel) this.messageLabel.visible = false;
		}
		super.screenPushed(screen);
	}

	screenPopped(screen) {
		super.screenPopped(screen);
		this.#setupEventHandlers();
		if (!screen.transparent) {
			this.game.setLayout(Layout.Inventory, BuiltinPalette.UI);
			if (this.personInfoView) this.personInfoView.visible = true;
		}
		if (screen.type === ScreenType.InventoryGiveGold || screen.type === ScreenType.InventoryGiveFood)
			this.#startGiveAmount(screen.type === ScreenType.InventoryGiveGold ? 'gold' : 'food');
	}

	keyDown(key, modifiers) {
		if (this.waitForClick) {
			if (key === Key.Space || key === Key.Escape || key === Key.Enter)
				this.#endClickWait();
			return true;
		}
		if (this.pendingGive && key === Key.Escape) {
			this.#cancelGive();
			return true;
		}
		return super.keyDown(key, modifiers);
	}

	mouseDown(position, buttons, modifiers) {
		const game = this.game;
		if (this.waitForClick) {
			this.#endClickWait();
			return true;
		}
		if (this.pendingGive) {
			if (buttons === MouseButtons.Left) {
				const slot = game.testPartyPortraitHit(position);
				if (slot != null)
					this.#finishGive(slot);
				else
					this.#cancelGive();
			} else {
				this.#cancelGive();
			}
			return true;
		}
		if (this.itemDragged && buttons === MouseButtons.Right) {
			ItemContainer.abortDrag(game);
			return true;
		}
		if (buttons === MouseButtons.Left) {
			for (const s of this.inventoryItemSlots)
				if (s.mouseClick(position, buttons, modifiers))
					return true;
			for (const s of this.equippedItemSlots)
				if (s.mouseClick(position, buttons, modifiers))
					return true;
		}
		return super.mouseDown(position, buttons, modifiers);
	}

	mouseMove(position, buttons) {
		super.mouseMove(position, buttons);
		ItemContainer.updateDragPosition(this.game, position);
	}

	switchToPartyMember(index, force) {
		const game = this.game;
		if (!force && game.state.currentInventoryIndex === index)
			return;
		this.#cancelGive();
		this.#cleanUpItems();
		game.state.setCurrentInventory(index);
		const pm = this.partyMember = game.state.currentInventory;
		this.ignoreItemChangeEvents = true;
		pm.equipment.forEach((e, i) => {
			if (e.item && e.count > 0)
				this.equippedItemSlots[i].setItem(e.count, e.item);
		});
		pm.inventory.forEach((s, i) => {
			if (s.item && s.count > 0)
				this.inventoryItemSlots[i].setItem(s.count, s.item);
		});
		this.ignoreItemChangeEvents = false;
		this.personInfoView?.destroy();
		this.personInfoView = new PersonInfoView(game, pm, game.state.partyCharacterIndices[index - 1], BuiltinPalette.UI);
		this.#updateWeight();
		this.requestButtonSetup();
	}

	#updateWeight() {
		const game = this.game;
		const pm = this.partyMember;
		GameState.recalculateWeight(pm);
		let w = game.uiTextString(UIText.WeightTwoValues);
		w = insertNumber(w, ' KG', false, Math.floor(pm.totalWeight / 1000), 3);
		w = insertNumber(w, '/', true, pm.attributes[Attribute.Strength].totalCurrent, 3);
		const overloaded = pm.totalWeight > maxWeight(pm);
		const color = overloaded ? 1 : 15;
		if (w.charCodeAt(0) === 1)
			w = '\x01' + String.fromCharCode(color) + w.slice(2);
		this.weightText.setText(w, color);
		this.weightText.visible = true;
	}

	#refresh() {
		this.switchToPartyMember(this.game.state.currentInventoryIndex, true);
		this.game.afterPartyChange();
	}

	buttonClicked(index) {
		const game = this.game;
		switch (index) {
			case 0:
				game.screenHandler.popScreen();
				game.screenHandler.pushScreen(ScreenType.CharacterStats);
				break;
			case 1:
				this.pickMode = 'drop';
				game.screenHandler.pushScreen(ScreenType.InventoryDropItem);
				break;
			case 2:
				game.screenHandler.popScreen();
				break;
			case 3:
				this.pickMode = 'use';
				game.screenHandler.pushScreen(ScreenType.InventoryUseItem);
				break;
			case 5:
				this.pickMode = 'examine';
				game.screenHandler.pushScreen(ScreenType.InventoryExamineItem);
				break;
			case 6:
				this.pickMode = 'give';
				game.screenHandler.pushScreen(ScreenType.InventoryGiveItem);
				break;
			case 7:
				game.currentAmount = 0;
				game.currentMaxAmount = this.partyMember.gold;
				game.screenHandler.pushScreen(ScreenType.InventoryGiveGold);
				break;
			case 8:
				game.currentAmount = 0;
				game.currentMaxAmount = this.partyMember.food;
				game.screenHandler.pushScreen(ScreenType.InventoryGiveFood);
				break;
		}
	}

	#inventorySlotClicked(index) {
		if (this.pendingGive)
			return;
		const slot = this.inventoryItemSlots[index];
		if (slot.itemCount <= 0)
			return;
		const pm = this.partyMember;
		const item = slot.item;
		if (item.type === ItemType.MonsterItem)
			return;
		let targetSlot = item.equipmentSlot;
		if (targetSlot == null) {
			this.showMessage(Message.ItemNotEquippable);
			return;
		}
		if (targetSlot === EquipmentSlot.RightFinger && pm.equipment[targetSlot].count > 0)
			targetSlot = EquipmentSlot.LeftFinger;
		const target = this.equippedItemSlots[targetSlot];
		if (target.itemCount > 0) {
			this.showMessage(Message.SameItemAlreadyInUse);
			return;
		}
		if (!(item.usableClasses & (1 << pm.class))) {
			this.showMessage(Message.WrongClass);
			return;
		}
		if (item.genders !== GenderFlags.Both && !(item.genders & (1 << pm.gender))) {
			this.showMessage(Message.WrongGender);
			return;
		}
		if (item.hands > 2 - pm.usedHands) {
			this.showMessage(Message.NotEnoughFreeHands);
			return;
		}
		if (item.fingers > 2 - pm.usedFingers) {
			this.showMessage(Message.NotEnoughFreeFingers);
			return;
		}
		target.setItem(1, item);
		slot.reduceItemCount(1);
		applyEquipmentBonus(pm, item, 1);
		if (item.flags & ItemFlags.Cursed)
			this.showMessage(Message.ItemIsCursed);
		this.#refresh();
	}

	#equipmentSlotClicked(equipmentSlot) {
		if (this.pendingGive)
			return;
		const slot = this.equippedItemSlots[equipmentSlot];
		if (slot.itemCount === 0)
			return;
		const item = slot.item;
		if (item.type === ItemType.MonsterItem)
			return;
		if (item.flags & ItemFlags.Cursed) {
			this.showMessage(Message.ItemIsCursed);
			return;
		}
		let targetIndex = -1;
		if (item.flags & ItemFlags.Stackable)
			targetIndex = this.inventoryItemSlots.findIndex(s => s.item?.index === item.index && s.itemCount < 99);
		if (targetIndex === -1)
			targetIndex = this.inventoryItemSlots.findIndex(s => s.empty);
		if (targetIndex === -1) {
			this.showMessage(Message.NoRoomForItem);
			return;
		}
		const target = this.inventoryItemSlots[targetIndex];
		target.setItem(target.itemCount + 1, item);
		slot.reduceItemCount(1);
		applyEquipmentBonus(this.partyMember, item, -1);
		this.#refresh();
	}

	#endClickWait() {
		this.waitForClick = false;
		this.game.cursor.cursorType = CursorType.Sword;
		this.hideMessage();
		this.game.untrapMouse();
		if (this.closeAfterClick)
			this.game.screenHandler.popScreen();
	}

	showMessage(messageIndex, waitForClick = true, closeAfterClick = false) {
		const text = typeof messageIndex === 'number' ? this.game.assets.message(messageIndex) : messageIndex;
		this.messageLabel.setText(text);
		this.messageLabel.visible = true;
		this.waitForClick = waitForClick;
		this.closeAfterClick = closeAfterClick;
		if (waitForClick) {
			this.game.cursor.cursorType = CursorType.Zzz;
			this.game.trapMouse(MessageDisplayArea);
		}
	}

	hideMessage() {
		if (this.messageLabel)
			this.messageLabel.visible = false;
	}

	/** Picked an item from one of the picker sub screens. index refers to itemContainers (equipment first). */
	pickItem(sourceScreen, index) {
		const game = this.game;
		const mode = this.pickMode;
		this.pickMode = null;
		if (index == null)
			return;
		const container = this.itemContainers[index];
		const item = container.item;
		if (!item)
			return;
		const inventoryIndex = index - 9;
		switch (mode) {
			case 'examine':
				game.currentItem = item;
				game.screenHandler.pushScreen(ScreenType.ItemView);
				break;
			case 'drop':
				if (inventoryIndex < 0)
					return;
				if (!(item.flags & ItemFlags.NotImportant)) {
					this.showMessage(Message.ItemCannotBeDropped);
					return;
				}
				game.askForConfirmation(Message.ReallyDropItem, () => {
					container.reduceItemCount(container.itemCount, true, () => this.#refresh());
				});
				break;
			case 'give':
				if (inventoryIndex < 0)
					return;
				this.#startGive({ kind: 'item', item, inventoryIndex });
				break;
			case 'use':
				if (inventoryIndex < 0)
					return;
				this.#useItem(item, inventoryIndex);
				break;
		}
	}

	#useItem(item, inventoryIndex) {
		const game = this.game;
		if (item.type === ItemType.TextScroll && item.textIndex) {
			game.showTextMessage(game.assets.text('item', item.textIndex));
			return;
		}
		// Other item usages (spells, potions, transport) are not implemented yet.
		this.showMessage(Message.ItemNotEquippable);
	}

	#startGive(give) {
		const game = this.game;
		this.pendingGive = give;
		if (give.kind === 'item')
			game.setHandIconsByItem(give.item, 1);
		else if (give.kind === 'gold')
			game.setHandIconsByGold(give.amount);
		else
			game.foreachPartyMemberSlot((i, pm) => pm ? game.setStatusIcon(i, StatusIcon.HandOpen, true, true) : game.hideStatusIcon(i));
		const currentSlot = game.state.currentInventoryIndex - 1;
		game.hideStatusIcon(currentSlot);
		game.cursor.cursorType = give.kind === 'gold' ? CursorType.Gold : give.kind === 'food' ? CursorType.Food : CursorType.Sword;
		this.showMessage(Message.WhomToTransferTo, false);
		game.trapMouseInPortraitArea();
	}

	#startGiveAmount(kind) {
		const amount = this.game.currentAmount;
		if (amount > 0)
			this.#startGive({ kind, amount });
	}

	#cancelGive() {
		if (!this.pendingGive)
			return;
		this.pendingGive = null;
		this.hideMessage();
		this.game.untrapMouse();
		this.game.cursor.cursorType = CursorType.Sword;
		this.game.resetStatusIcons();
	}

	#finishGive(targetSlot) {
		const game = this.game;
		const give = this.pendingGive;
		const pm = this.partyMember;
		this.#cancelGive();
		if (targetSlot === game.state.currentInventoryIndex)
			return;
		const target = game.state.getPartyMember(targetSlot);
		if (!target)
			return;
		if (give.kind === 'item') {
			if (game.tryAddItem(targetSlot, give.item, 1)) {
				this.inventoryItemSlots[give.inventoryIndex].reduceItemCount(1);
				GameState.recalculateWeight(target);
			} else {
				this.showMessage(Message.NoRoomForItem);
				return;
			}
		} else if (give.kind === 'gold') {
			if (game.tryAddGold(targetSlot, give.amount)) {
				pm.gold -= give.amount;
				GameState.recalculateWeight(target);
			} else {
				this.showMessage(Message.NoMemberCanCarryThatMuchGold);
				return;
			}
		} else {
			target.food = Math.min(32767, target.food + give.amount);
			pm.food -= give.amount;
		}
		this.#refresh();
	}
}

/** Same as the C# helper but tolerant against non space characters */
function insertNumber(text, marker, after, number, maxLength) {
	const markerIndex = text.indexOf(marker);
	if (markerIndex === -1)
		return text;
	let insertion = String(number).padStart(maxLength, '0');
	if (insertion.length > maxLength)
		insertion = '*'.repeat(maxLength);
	const position = after ? markerIndex + marker.length : markerIndex - insertion.length;
	const chars = [...text];
	for (let i = 0; i < insertion.length; i++)
		chars[position + i] = insertion[i];
	return chars.join('');
}

class InventoryPickerScreen extends ItemPickerScreen {
	get mouseTrapArea() { return AllItemsArea; }
	get itemTooltipArea() { return ItemTooltipArea; }
	get hideItemsAfterPicking() { return false; }
}

export class InventoryDropItemScreen extends InventoryPickerScreen {
	get type() { return ScreenType.InventoryDropItem; }
	get message() { return Message.DropWhichItem; }
}

export class InventoryUseItemScreen extends InventoryPickerScreen {
	get type() { return ScreenType.InventoryUseItem; }
	get message() { return Message.UseWhichItem; }
}

export class InventoryExamineItemScreen extends InventoryPickerScreen {
	get type() { return ScreenType.InventoryExamineItem; }
	get message() { return Message.ExamineWhichItem; }
	get hoverCursorType() { return CursorType.Eye; }
}

export class InventoryGiveItemScreen extends InventoryPickerScreen {
	get type() { return ScreenType.InventoryGiveItem; }
	get message() { return Message.TransferWhichItem; }
}

export class InventoryGiveGoldScreen extends InputAmountScreen {
	get type() { return ScreenType.InventoryGiveGold; }
	get graphic() { return ItemGraphic.WishingCoins; }
	get inputLabelText() { return this.game.loadUIText(UIText.Gold); }
	get messageIndex() { return Message.TransferHowManyGold; }
}

export class InventoryGiveFoodScreen extends InputAmountScreen {
	get type() { return ScreenType.InventoryGiveFood; }
	get graphic() { return ItemGraphic.Ration; }
	get inputLabelText() { return this.game.loadUIText(UIText.Food); }
	get messageIndex() { return Message.TransferHowManyFood; }
}

// ---------------- Character stats ----------------

const HeaderInfos = [
	{ x: 22, y: 50, width: 72, text: UIText.Attributes },
	{ x: 22, y: 115, width: 72, text: UIText.Skills },
	{ x: 106, y: 50, width: 0, text: UIText.Languages },
	{ x: 106, y: 115, width: 0, text: UIText.Body },
	{ x: 148, y: 115, width: 0, text: UIText.Mind },
];
const ConditionAdvances = [[0, 0], [18, 12], [0, 24], [18, 36], [0, 48]];

export class CharacterStatsScreen extends ButtonGridScreen {
	constructor() {
		super();
		this.partyMember = null;
		this.personInfoView = null;
		this.texts = [];
		this.sprites = [];
	}

	get type() { return ScreenType.CharacterStats; }
	get buttonGridPaletteIndex() { return BuiltinPalette.UI; }

	setupButtons(grid) {
		if (!this.partyMember)
			return;
		grid.setButton(0, ButtonType.Inventory);
		grid.setButton(2, ButtonType.Exit);
	}

	open(closeAction) {
		super.open(closeAction);
		this.game.setLayout(Layout.Stats, BuiltinPalette.UI);
		this.game.cursor.cursorType = CursorType.Sword;
		this.switchToPartyMember(this.game.state.currentInventoryIndex, true);
	}

	#clear() {
		this.personInfoView?.destroy();
		this.personInfoView = null;
		this.texts.forEach(t => t.delete());
		this.texts = [];
		this.sprites.forEach(s => s.visible = false);
		this.sprites = [];
	}

	close() {
		this.#clear();
		super.close();
	}

	screenPushed(screen) {
		if (!screen.transparent) {
			if (this.personInfoView) this.personInfoView.visible = false;
			this.texts.forEach(t => t.visible = false);
			this.sprites.forEach(s => s.visible = false);
		}
		super.screenPushed(screen);
	}

	screenPopped(screen) {
		super.screenPopped(screen);
		if (!screen.transparent) {
			this.game.setLayout(Layout.Stats, BuiltinPalette.UI);
			if (this.personInfoView) this.personInfoView.visible = true;
			this.texts.forEach(t => t.visible = true);
			this.sprites.forEach(s => s.visible = true);
		}
	}

	switchToPartyMember(index, force) {
		const game = this.game;
		if (!force && game.state.currentInventoryIndex === index)
			return;
		this.#clear();
		game.state.setCurrentInventory(index);
		const characterIndex = game.state.partyCharacterIndices[index - 1];
		const pm = this.partyMember = game.state.currentInventory;
		this.personInfoView = new PersonInfoView(game, pm, characterIndex, BuiltinPalette.UI);

		for (const h of HeaderInfos) {
			const maxWidth = h.width > 0 ? h.width : 1000;
			const header = game.textManager.create(game.loadUIText(h.text), maxWidth);
			if (h.width > 0)
				header.showInArea(h.x, h.y, maxWidth, 10, 0, TextAlignment.Center);
			else
				header.show(h.x, h.y, 0);
			this.texts.push(header);
		}

		const divider = game.uiTextString(UIText.NormalTwoValues);
		for (let i = 0; i < 8; i++) {
			const value = pm.attributes[i + 1];
			const name = game.nameString('attribute', i).slice(0, 3);
			let s = insertNumber(divider, '/', false, value.totalCurrent, 3);
			s = insertNumber(s, '/', true, value.maxValue, 3);
			const t = game.textManager.create(name + '  ' + s, 15);
			t.show(22, 57 + i * 7, 2);
			this.texts.push(t);
		}

		const percentDivider = game.uiTextString(UIText.PercentTwoValues);
		for (let i = 0; i < 10; i++) {
			const value = pm.skills[i + 1];
			const name = game.nameString('skill', i).slice(0, 3);
			let s = insertNumber(percentDivider, '%', false, value.totalCurrent, 2);
			s = insertNumber(s, '/', true, value.maxValue, 2);
			const t = game.textManager.create(name + '  ' + s, 15);
			t.show(22, 122 + i * 7, 2);
			this.texts.push(t);
		}

		let y = 57;
		for (let i = 0; i < 7; i++) {
			if (!(pm.conversationData.learnedLanguages & (1 << i)))
				continue;
			const t = game.textManager.create(game.nameString('language', i), 15);
			t.show(106, y, 2);
			this.texts.push(t);
			y += 7;
		}

		const addIcon = (x, y, icon) => {
			this.sprites.push(game.createSprite(Layer.UI, { x, y }, { width: 16, height: 16 }, game.graphicIndexProvider.getStatusIconIndex(icon), BuiltinPalette.UI));
		};
		if (isDead(pm)) {
			addIcon(106, 124, StatusIcon.Dead);
		} else {
			const physical = [StatusIcon.Stunned, StatusIcon.Poisoned, StatusIcon.Petrified, StatusIcon.Diseased, StatusIcon.Aging];
			const mental = [StatusIcon.Irritated, StatusIcon.Mad, StatusIcon.Sleeping, StatusIcon.Panicked, StatusIcon.Blind];
			for (let i = 0; i < 5; i++) {
				if (pm.physicalConditions & (1 << i))
					addIcon(106 + ConditionAdvances[i][0], 124 + ConditionAdvances[i][1], physical[i]);
				if (pm.mentalConditions & (1 << i))
					addIcon(148 + ConditionAdvances[i][0], 124 + ConditionAdvances[i][1], mental[i]);
			}
		}
		this.requestButtonSetup();
	}

	buttonClicked(index) {
		const game = this.game;
		switch (index) {
			case 0:
				game.screenHandler.popScreen();
				game.screenHandler.pushScreen(ScreenType.Inventory);
				break;
			case 2:
				game.screenHandler.popScreen();
				break;
		}
	}
}
