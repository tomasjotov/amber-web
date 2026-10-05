// Ports of LockedScreen, DoorScreen and ChestScreen (with their sub screens).
import { ScreenType } from './screen.js';
import { ItemGridScreen, ItemPickerScreen, InputAmountScreen } from './itemScreens.js';
import { TextAlignment, TransparentPaper } from '../ui/text.js';
import { ItemContainer } from '../ui/itemContainer.js';
import { ButtonType, CursorType, Image80x80, Layout, UIText, EventType } from '../../data/enums.js';
import { Key, MouseButtons } from '../keys.js';
import { Message } from '../messages.js';
import { Skill, Attribute, ItemFlags, Condition } from '../../data/characters.js';
import { EventTrigger, createEvent } from '../events.js';
import { pad } from '../util.js';

const MessageDisplayArea = { x: 112, y: 49, w: 192, h: 48 };
const InventorySlotPositions = Array.from({ length: 12 }, (_, i) => ({ x: 16 + (i % 6) * 32, y: 37 + 108 + Math.floor(i / 6) * 32 }));
const ItemArea = { x: 16, y: 145, w: InventorySlotPositions[11].x + 16 - 16, h: InventorySlotPositions[11].y + 16 - 145 };
const ItemTooltipArea = { x: MessageDisplayArea.x, y: MessageDisplayArea.y + 7, w: MessageDisplayArea.w, h: 7 };

const ItemGraphicWishingCoins = 96;
const SpecialSpellPickLock = 18;
const SpellSchoolSpecial = 7;

class LockedScreen extends ItemGridScreen {
	constructor() {
		super();
		this.trapFound = false;
		this.trapDisarmed = false;
		this.waitForClick = false;
		this.closeAfterClick = false;
		this.lockOpened = false;
		this.lockpickReduction = 0;
		this.inventoryItemSlots = [];
		this.imageControl = null;
		this.messageLabel = null;
		this.lockedEvent = null;
		this._image = Image80x80.LockedDoor;
		this.afterWaitClickAction = null;
	}

	get image() { return this._image; }
	set image(value) {
		this._image = value;
		if (this.imageControl) {
			this.imageControl.setTextureIndex(this.game.graphicIndexProvider.get80x80ImageIndex(value));
			this.imageControl.paletteIndex = this.game.paletteIndexProvider.get80x80ImagePaletteIndex(value);
		}
	}

	get layout() { throw new Error('abstract'); }
	get allowedUnlockItemIndex() { return null; }
	get transparent() { return false; }
	get buttonGridPaletteIndex() { return this.game?.paletteIndexProvider.get80x80ImagePaletteIndex(this._image) ?? 0; }
	get itemContainers() { return this.inventoryItemSlots; }

	provideCenterButton() { return [ButtonType.Empty, false]; }
	provideRightButton() { return [ButtonType.Empty, false]; }
	provideLowerButton() { return [ButtonType.Empty, false]; }
	provideLowerRightButton() { return [ButtonType.Empty, false]; }

	setupButtons(grid) {
		const pm = this.game?.state.activePartyMember;
		if (!pm)
			return;
		const [center, right, lower, lowerRight] = [this.provideCenterButton(), this.provideRightButton(), this.provideLowerButton(), this.provideLowerRightButton()];
		grid.setButton(0, ButtonType.PickLock);
		grid.setButton(1, ButtonType.UseItem);
		grid.setButton(2, ButtonType.Exit);
		grid.setButton(3, ButtonType.FindTrap);
		grid.setButton(4, center[0]);
		grid.setButton(5, right[0]);
		grid.setButton(6, ButtonType.DisarmTrap);
		grid.setButton(7, lower[0]);
		grid.setButton(8, lowerRight[0]);
		const blind = (pm.mentalConditions & 0x10) !== 0;
		grid.enableButton(0, !this.lockOpened);
		grid.enableButton(1, !this.lockOpened && pm.inventory.some(s => s.count > 0));
		grid.enableButton(3, !this.lockOpened && !this.trapFound && !blind);
		grid.enableButton(6, !this.lockOpened && this.trapFound && !this.trapDisarmed && !blind);
		if (center[0] !== ButtonType.Empty) grid.enableButton(4, center[1]);
		if (right[0] !== ButtonType.Empty) grid.enableButton(5, right[1]);
		if (lower[0] !== ButtonType.Empty) grid.enableButton(7, lower[1]);
		if (lowerRight[0] !== ButtonType.Empty) grid.enableButton(8, lowerRight[1]);
	}

	init() {
		super.init();
		for (const p of InventorySlotPositions)
			this.inventoryItemSlots.push(this.addItem(p.x, p.y, null, 0, 10));
		const image = this.addImage(16, 49, 80, 80, this.game.graphicIndexProvider.get80x80ImageIndex(this._image), 0, true);
		image.paletteIndex = this.game.paletteIndexProvider.get80x80ImagePaletteIndex(this._image);
		this.imageControl = image;
		this.messageLabel = this.addLabelArea(MessageDisplayArea.x, MessageDisplayArea.y, MessageDisplayArea.w, MessageDisplayArea.h, 20);
	}

	open(closeAction) {
		super.open(closeAction);
		const game = this.game;
		this.lockedEvent = game.eventHandler.currentEvent;
		this.trapFound = false;
		this.trapDisarmed = false;
		this.waitForClick = false;
		this.closeAfterClick = false;
		this.lockOpened = false;
		this.lockpickReduction = this.lockedEvent.lockpickReduction ?? 0;
		this.image = this._image; // refresh texture
		this.imageControl.visible = true;
		game.setLayout(this.layout, game.paletteIndexProvider.get80x80ImagePaletteIndex(this._image));
		game.cursor.cursorType = CursorType.Sword;
		this.requestButtonGridPaletteUpdate();
	}

	cleanUpItems() {
		this.inventoryItemSlots.forEach(s => s.clearItem());
	}

	setItem(slotIndex, count, item) {
		if (!item)
			this.inventoryItemSlots[slotIndex].clearItem();
		else
			this.inventoryItemSlots[slotIndex].setItem(count, item);
	}

	close() {
		this.hideMessage();
		this.cleanUpItems();
		if (!this.lockOpened) {
			const active = this.game.screenHandler.activeScreen;
			if (active?.resetPartyPosition)
				active.resetPartyPosition();
			else
				this.game.state.resetPartyPosition();
		}
		super.close();
	}

	screenPushed(screen) {
		if (screen.type === ScreenType.LockedUseItem)
			this.#updateInventoryItems();
		super.screenPushed(screen);
	}

	screenPopped(screen) {
		super.screenPopped(screen);
		if (!screen.transparent) {
			this.game.setLayout(this.layout, this.game.paletteIndexProvider.get80x80ImagePaletteIndex(this._image));
			this.game.cursor.cursorType = CursorType.Sword;
		}
	}

	#endClickWait() {
		this.waitForClick = false;
		this.game.cursor.cursorType = CursorType.Sword;
		this.hideMessage();
		this.game.untrapMouse();
		const action = this.afterWaitClickAction;
		this.afterWaitClickAction = null;
		action?.();
		if (this.closeAfterClick)
			this.game.screenHandler.popScreen();
	}

	keyDown(key, modifiers) {
		if (this.waitForClick) {
			if (key === Key.Space || key === Key.Escape || key === Key.Enter)
				this.#endClickWait();
			return true;
		}
		return super.keyDown(key, modifiers);
	}

	mouseDown(position, buttons, modifiers) {
		if (this.waitForClick) {
			this.#endClickWait();
			return true;
		}
		return super.mouseDown(position, buttons, modifiers);
	}

	#updateInventoryItems() {
		this.cleanUpItems();
		const pm = this.game.state.activePartyMember;
		if (!pm)
			return;
		pm.inventory.forEach((slot, i) => {
			if (slot.item && slot.count > 0)
				this.setItem(i, slot.count, slot.item);
		});
		this.requestButtonSetup();
	}

	centerButtonClicked() { }
	rightButtonClicked() { }
	lowerButtonClicked() { }
	lowerRightButtonClicked() { }

	buttonClicked(index) {
		switch (index) {
			case 0: this.#tryPickLock(); break;
			case 1: this.game.screenHandler.pushScreen(ScreenType.LockedUseItem); break;
			case 2: this.game.screenHandler.popScreen(); break;
			case 3: this.#tryFindTrap(); break;
			case 4: this.centerButtonClicked(); break;
			case 5: this.rightButtonClicked(); break;
			case 6: this.#tryDisarmTrap(); break;
			case 7: this.lowerButtonClicked(); break;
			case 8: this.lowerRightButtonClicked(); break;
		}
	}

	showMessage(messageIndex, waitForClick = true, closeAfterClick = false) {
		this.showText(this.game.assets.message(messageIndex), waitForClick, closeAfterClick);
	}

	showText(text, waitForClick = true, closeAfterClick = false) {
		this.messageLabel.setText(text, MessageDisplayArea.w, 15, TransparentPaper, this.buttonGridPaletteIndex);
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

	unlocked(message) { }

	#tryPickLock() {
		const game = this.game;
		if (this.lockpickReduction >= 100) {
			this.showMessage(Message.LockCannotBeOpened);
			return;
		}
		const pm = game.state.activePartyMember;
		const skill = pm.skills[Skill.PickLocks].totalCurrent - this.lockpickReduction;
		if (game.probe(skill)) {
			this.lockOpened = true;
			this.unlocked(Message.LockOpened);
		} else {
			this.lockpickReduction = Math.min(this.lockpickReduction + 10, 99);
			if (this.trapDisarmed || !this.lockedEvent.trapType)
				this.showMessage(Message.LockCannotBeOpened);
			else if (game.probe(pm.attributes[Attribute.Dexterity].totalCurrent))
				this.showMessage(Message.HeardStrangeNoise);
			else
				this.#triggerTrap();
		}
	}

	#tryFindTrap() {
		const game = this.game;
		if (!this.lockedEvent.trapType) {
			this.showMessage(Message.NoTrapDiscovered);
			return;
		}
		if (game.probe(game.state.activePartyMember.skills[Skill.FindTraps].totalCurrent)) {
			this.showMessage(Message.TrapDiscovered);
			this.trapFound = true;
			this.requestButtonSetup();
		} else {
			this.showMessage(Message.NoTrapDiscovered);
		}
	}

	#tryDisarmTrap() {
		const game = this.game;
		const pm = game.state.activePartyMember;
		if (game.probe(pm.skills[Skill.DisarmTraps].totalCurrent)) {
			this.showMessage(Message.TrapDisarmed);
			this.trapDisarmed = true;
			this.requestButtonSetup();
		} else if (game.probe(pm.attributes[Attribute.Dexterity].totalCurrent)) {
			this.showMessage(Message.HeardStrangeNoise);
		} else {
			this.#triggerTrap();
		}
	}

	#triggerTrap() {
		this.game.triggerTrap(this.lockedEvent.trapType, this.lockedEvent.trapDamage);
	}

	pickItem(sourceScreen, index) {
		const game = this.game;
		if (index == null) {
			this.cleanUpItems();
			return;
		}
		const slot = this.inventoryItemSlots[index];
		const item = slot.item;
		const pm = game.state.activePartyMember;
		if (item && this.allowedUnlockItemIndex != null && item.index === this.allowedUnlockItemIndex) {
			const open = () => {
				this.lockOpened = true;
				game.enableInput(true);
				this.cleanUpItems();
				this.unlocked(Message.ItemOpensDoor);
			};
			if (item.flags & ItemFlags.DestroyAfterUsage) {
				this.showMessage(Message.UseWhichItem, false);
				game.enableInput(false);
				pm.totalWeight = Math.max(0, pm.totalWeight - item.weight);
				game.removeInventoryItem(pm, index, 1);
				slot.reduceItemCount(1, true, open);
			} else {
				open();
			}
		} else if (item && item.spellSchool === SpellSchoolSpecial && item.spellIndex === SpecialSpellPickLock) {
			this.showMessage(Message.UseWhichItem, false);
			game.enableInput(false);
			game.removeInventoryItem(pm, index, 1);
			slot.reduceItemCount(1, true, () => {
				game.enableInput(true);
				this.cleanUpItems();
				if (this.lockedEvent.lockpickReduction >= 100) {
					this.requestButtonSetup();
					this.showMessage(Message.LockpickBreaks);
				} else {
					this.lockOpened = true;
					this.unlocked(Message.LockpickOpensLock);
				}
			});
		} else {
			// Not usable here, show the selection again
			this.cleanUpItems();
			game.screenHandler.pushScreen(ScreenType.LockedUseItem);
		}
	}
}

export class LockedUseItemScreen extends ItemPickerScreen {
	get type() { return ScreenType.LockedUseItem; }
	get mouseTrapArea() { return ItemArea; }
	get message() { return Message.UseWhichItem; }
	get itemTooltipArea() { return ItemTooltipArea; }
}

export class DoorScreen extends LockedScreen {
	get type() { return ScreenType.Door; }
	get layout() { return Layout.Door; }
	get allowedUnlockItemIndex() { return this.lockedEvent?.itemIndex ?? null; }

	#isOpenDoorWithExit() {
		const ev = this.game.eventHandler.currentEvent;
		return ev && ev.type === EventType.DoorExit && ev.openedEventIndex && this.game.isCurrentEventSaved();
	}

	unlocked(message) {
		this.game.saveEvent(this.lockedEvent.index);
		this.showMessage(message, true, true);
	}

	open(closeAction) {
		if (this.#isOpenDoorWithExit()) {
			this.setCloseAction(closeAction);
			this.lockOpened = true;
			this.lockedEvent = this.game.eventHandler.currentEvent;
			// Defer the pop, the screen is not pushed completely yet
			this.game.executeNextUpdateCycle(() => this.game.screenHandler.popScreen());
			return;
		}
		this.image = Image80x80.LockedDoor;
		super.open(closeAction);
	}

	close() {
		super.close();
		const game = this.game;
		const ev = game.eventHandler.currentEvent;
		if (this.lockOpened && ev && ev.type === EventType.DoorExit && ev.openedEventIndex) {
			const provider = game.eventHandler.currentEventProvider;
			const extraEvent = ev.openedEventIndex;
			const followUp = () => {
				game.screenHandler.screenChanged.remove(followUp);
				const map = provider?.events ? provider : game.screenHandler.activeScreen?.map;
				const data = map?.events?.[extraEvent - 1];
				const mapEvent = data ? createEvent(data, extraEvent) : null;
				if (mapEvent)
					game.eventHandler.handleEvent(EventTrigger.Move, mapEvent, map);
			};
			game.screenHandler.screenChanged.add(followUp);
		}
	}
}

const GoldDisplayArea = { x: 112, y: 37 + 76, w: 64, h: 16 };

export class ChestScreen extends LockedScreen {
	constructor() {
		super();
		this.chestHasItems = false;
		this.chestGold = 0;
		this.goldLabel = null;
		this.goldDisplay = null;
		this.currentChestSlot = null;
		this.goldDragging = false;
	}

	get type() { return ScreenType.Chest; }
	get layout() { return Layout.Chest; }

	unlocked(message) {
		this.afterWaitClickAction = () => this.#showOpenChest();
		this.game.saveEvent(this.lockedEvent.index);
		this.showMessage(message, true);
	}

	init() {
		super.init();
		const game = this.game;
		const { x, y, w, h } = GoldDisplayArea;
		this.goldLabel = this.addLabel(x, y, game.loadUIText(UIText.Gold), w, h);
		this.goldLabel.alignment = TextAlignment.Center;
		this.goldLabel.visible = false;
		this.goldDisplay = this.addLabel(x, y + 7, '0', w, h);
		this.goldDisplay.alignment = TextAlignment.Center;
		this.goldDisplay.visible = false;
	}

	open(closeAction) {
		const game = this.game;
		const ev = game.eventHandler.currentEvent;
		if (ev.hidden) {
			const search = game.state.activePartyMember.skills[Skill.Search].totalCurrent;
			if (!game.probe(search)) {
				this.setCloseAction(closeAction);
				this.lockOpened = true; // do not push back
				game.executeNextUpdateCycle(() => game.screenHandler.popScreen());
				return;
			}
		}
		const lockOpened = ev.lockpickReduction === 0 || game.isCurrentEventSaved() || (game.state.specialItems & 2) !== 0;
		this.image = lockOpened ? Image80x80.OpenChest : Image80x80.LockedChest;
		super.open(closeAction);
		this.goldLabel.visible = lockOpened;
		this.goldDisplay.visible = lockOpened;
		this.goldLabel.paletteIndex = this.buttonGridPaletteIndex;
		this.goldDragging = false;
		if (lockOpened) {
			this.lockOpened = true;
			this.#showOpenChest();
		}
	}

	close() {
		this.goldLabel.visible = false;
		this.goldDisplay.visible = false;
		super.close();
	}

	screenPopped(screen) {
		super.screenPopped(screen);
		const game = this.game;
		if (screen.type === ScreenType.ChestGiveGold && game.currentAmount > 0) {
			if (game.setHandIconsByGold(game.currentAmount) > 0) {
				this.goldDragging = true;
				game.trapMouseInPortraitArea();
				game.cursor.cursorType = CursorType.Gold;
			} else {
				game.resetStatusIcons();
				this.showMessage(Message.NoMemberCanCarryThatMuchGold);
			}
		}
	}

	#showOpenChest() {
		const game = this.game;
		this.image = Image80x80.OpenChest;
		const itemCount = this.#updateChestItems();
		const gold = this.#updateChestGold();
		if (itemCount === 0 && gold === 0) {
			game.executeNextUpdateCycle(() => {
				if (game.screenHandler.activeScreen === this)
					game.screenHandler.popScreen();
			});
			return;
		}
		this.requestButtonSetup();
		if (this.lockedEvent.textIndex < 26 && this.lockedEvent.textIndex !== 0) {
			const mapIndex = game.eventHandler.currentEventMapIndex;
			this.showText(game.assets.text('map', mapIndex).getTextBlock(this.lockedEvent.textIndex), true);
		}
	}

	#updateChestItems() {
		this.cleanUpItems();
		const game = this.game;
		const chestIndex = this.lockedEvent.chestIndex;
		const bits = game.state.getChestSlotBits(chestIndex);
		this.chestHasItems = bits !== 0;
		if (!this.chestHasItems)
			return 0;
		const chest = game.assets.loadChest(chestIndex);
		let count = 0;
		for (let i = 0; i < 12; i++) {
			const item = chest.items[i];
			if (item && (bits & (1 << i))) {
				this.setItem(i, 1, item);
				count++;
			}
		}
		this.chestHasItems = count !== 0;
		return count;
	}

	#updateChestGold() {
		this.chestGold = this.game.state.getChestGold(this.lockedEvent.chestIndex);
		this.#showGold();
		return this.chestGold;
	}

	#showGold() {
		this.goldDisplay.setText(pad(this.chestGold, 5), 15, TransparentPaper, this.buttonGridPaletteIndex);
		this.goldLabel.visible = true;
		this.goldDisplay.visible = true;
	}

	#closeIfEmpty() {
		if (this.chestGold === 0 && !this.chestHasItems)
			this.game.screenHandler.popScreen();
	}

	mouseMove(position, buttons) {
		ItemContainer.updateDragPosition(this.game, position);
		super.mouseMove(position, buttons);
	}

	mouseDown(position, buttons, modifiers) {
		const game = this.game;
		if (buttons === MouseButtons.Right) {
			if (ItemContainer.isDragging) {
				this.#abortItemDrag();
				return true;
			}
			if (this.goldDragging) {
				this.#abortGoldDrag();
				return true;
			}
		} else if (buttons === MouseButtons.Left) {
			if (ItemContainer.isDragging) {
				const slot = game.testPartyPortraitHit(position);
				if (slot != null) {
					if (game.tryAddItem(slot, game.currentItem)) {
						const pm = game.state.getPartyMember(slot);
						pm.totalWeight += game.currentItem.weight;
						game.state.setChestSlotBit(this.lockedEvent.chestIndex, this.currentChestSlot, false);
						ItemContainer.consumeDragged(game);
						game.untrapMouse();
						game.resetStatusIcons();
						this.#updateChestItems();
						this.requestButtonSetup();
						this.#closeIfEmpty();
					} else {
						this.#abortItemDrag();
					}
					return true;
				}
			} else if (this.goldDragging) {
				const gold = game.currentAmount;
				this.#abortGoldDrag();
				const slot = game.testPartyPortraitHit(position);
				if (slot != null && game.tryAddGold(slot, gold)) {
					const pm = game.state.getPartyMember(slot);
					pm.totalWeight += gold * 10;
					this.chestGold -= gold;
					game.state.setChestGold(this.lockedEvent.chestIndex, this.chestGold);
					this.#showGold();
					if (this.chestGold === 0) {
						this.requestButtonSetup();
						this.#closeIfEmpty();
					}
				}
				return true;
			}
		}
		return super.mouseDown(position, buttons, modifiers);
	}

	keyDown(key, modifiers) {
		if (key === Key.Escape) {
			if (ItemContainer.isDragging) {
				this.#abortItemDrag();
				return true;
			} else if (this.goldDragging) {
				this.#abortGoldDrag();
				return true;
			}
		}
		return super.keyDown(key, modifiers);
	}

	#abortItemDrag() {
		this.game.untrapMouse();
		ItemContainer.abortDrag(this.game);
		this.game.resetStatusIcons();
	}

	#abortGoldDrag() {
		this.goldDragging = false;
		this.game.currentAmount = 0;
		this.game.cursor.cursorType = CursorType.Sword;
		this.game.untrapMouse();
		this.game.resetStatusIcons();
	}

	centerButtonClicked() {
		if (this.lockOpened && this.chestHasItems)
			this.game.screenHandler.pushScreen(ScreenType.ChestExamineItem);
	}

	rightButtonClicked() {
		if (this.lockOpened && this.chestHasItems)
			this.game.screenHandler.pushScreen(ScreenType.ChestGiveItem);
	}

	lowerButtonClicked() {
		if (!this.lockOpened || this.chestGold === 0)
			return;
		this.game.currentAmount = 0;
		this.game.currentMaxAmount = this.chestGold;
		this.game.screenHandler.pushScreen(ScreenType.ChestGiveGold);
	}

	lowerRightButtonClicked() {
		if (!this.lockOpened || this.chestGold === 0)
			return;
		const before = this.chestGold;
		this.chestGold = this.game.distributeGold(this.chestGold);
		this.game.state.setChestGold(this.lockedEvent.chestIndex, this.chestGold);
		this.#showGold();
		if (this.chestGold === before)
			this.showMessage(Message.NoMemberCanCarryThatMuchGold);
		if (this.chestGold === 0) {
			this.requestButtonSetup();
			this.#closeIfEmpty();
		}
	}

	provideCenterButton() { return [ButtonType.ExamineItem, this.lockOpened && this.chestHasItems]; }
	provideRightButton() { return [ButtonType.GiveItem, this.lockOpened && this.chestHasItems]; }
	provideLowerButton() { return [ButtonType.GiveGold, this.lockOpened && this.chestGold !== 0]; }
	provideLowerRightButton() { return [ButtonType.DistributeGold, this.lockOpened && this.chestGold !== 0]; }

	pickItem(sourceScreen, index) {
		const game = this.game;
		switch (sourceScreen) {
			case ScreenType.LockedUseItem:
				super.pickItem(sourceScreen, index);
				break;
			case ScreenType.ChestExamineItem:
				if (index != null) {
					game.currentItem = this.itemContainers[index].item;
					game.screenHandler.pushScreen(ScreenType.ItemView);
				}
				break;
			case ScreenType.ChestGiveItem:
				if (index != null) {
					game.currentItem = this.itemContainers[index].item;
					if (game.setHandIconsByItem(game.currentItem) > 0) {
						this.currentChestSlot = index;
						this.itemContainers[index].startDragging();
						game.trapMouseInPortraitArea();
					} else {
						game.resetStatusIcons();
						this.showMessage(Message.NoMemberHasRoomForItem);
					}
				}
				break;
		}
	}
}

class ChestItemScreen extends ItemPickerScreen {
	get mouseTrapArea() { return ItemArea; }
	get itemTooltipArea() { return ItemTooltipArea; }
	get hideItemsAfterPicking() { return false; }
}

export class ChestGiveItemScreen extends ChestItemScreen {
	get type() { return ScreenType.ChestGiveItem; }
	get message() { return Message.TransferWhichItem; }
}

export class ChestExamineItemScreen extends ChestItemScreen {
	get type() { return ScreenType.ChestExamineItem; }
	get message() { return Message.ExamineWhichItem; }
	get hoverCursorType() { return CursorType.Eye; }
}

export class ChestGiveGoldScreen extends InputAmountScreen {
	get type() { return ScreenType.ChestGiveGold; }
	get graphic() { return ItemGraphicWishingCoins; }
	get inputLabelText() { return this.game.loadUIText(UIText.Gold); }
	get messageIndex() { return Message.GiveHowMuch; }
}
