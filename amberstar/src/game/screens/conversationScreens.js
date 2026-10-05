// Ports of ConversationScreen (with sub screens), SelectWordScreen and InputWordScreen.
import { ScreenType } from './screen.js';
import { ItemGridScreen, ItemPickerScreen, InputAmountScreen } from './itemScreens.js';
import { WindowScreen, TextScrollHandler } from './textScreens.js';
import { Button } from '../ui/controls.js';
import { TextAlignment } from '../ui/text.js';
import { ItemContainer } from '../ui/itemContainer.js';
import { PersonInfoView } from '../ui/personInfoView.js';
import { ButtonType, CursorType, Layout, UIText, UIGraphic, ItemGraphic } from '../../data/enums.js';
import { BuiltinPalette } from '../../engine/layerSetup.js';
import { Key, KeyModifiers, MouseButtons } from '../keys.js';
import { Message } from '../messages.js';
import { ItemSlot, InteractionTriggerType, ReactionType, cloneItem, Skill, Attribute } from '../../data/characters.js';
import { Text } from '../../data/text.js';
import { GameState } from '../gameState.js';
import { pad, rectContains } from '../util.js';

const ItemSlotCount = 12;
const MessageBaseY = 63;
const ItemSlotPositions = Array.from({ length: 12 }, (_, i) => ({ x: 16 + (i % 6) * 32, y: 37 + 108 + Math.floor(i / 6) * 32 }));
const ItemArea = { x: 16, y: 145, w: ItemSlotPositions[11].x + 16 - 16, h: ItemSlotPositions[11].y + 16 - 145 };
const TextDisplayArea = { x: 16, y: 49, w: 174, h: 77 };
const ItemTooltipArea = { x: 16, y: 72, w: 174, h: 7 };

export class ConversationScreen extends ItemGridScreen {
	constructor() {
		super();
		this.textScrollHandler = new TextScrollHandler();
		this.items = [];
		this.receivedItems = [];
		this.person = null;
		this.map = null;
		this.characterIndex = 0;
		this.mapCharacterIndex = 0;
		this.personInfoView = null;
		this.conversationText = null;
		this.afterWaitClickAction = null;
		this.waitForClick = false;
		this.closeAfterClick = false;
		this.insideParty = false;
		this.dragSourceItemSlot = null;
	}

	get type() { return ScreenType.Conversation; }
	get buttonGridPaletteIndex() { return BuiltinPalette.UI; }
	get itemContainers() { return this.items; }

	setupButtons(grid) {
		const pm = this.game.state.activePartyMember;
		const itemsAvailable = this.receivedItems.length > 0;
		const hasItems = pm.inventory.some(s => s.count > 0);
		const allow = !this.insideParty && this.receivedItems.length < ItemSlotCount;
		grid.setButton(0, ButtonType.GiveItem);
		grid.setButton(1, ButtonType.DropItem);
		grid.setButton(2, ButtonType.Exit);
		grid.setButton(3, ButtonType.ExamineItem);
		grid.setButton(4, ButtonType.Mouth);
		grid.setButton(5, ButtonType.AskToJoin);
		grid.setButton(6, ButtonType.GiveItemToPerson);
		grid.setButton(7, ButtonType.GiveGoldToPerson);
		grid.setButton(8, ButtonType.GiveFoodToPerson);
		grid.enableButton(0, itemsAvailable);
		grid.enableButton(1, itemsAvailable);
		grid.enableButton(2, !itemsAvailable);
		grid.enableButton(3, allow && hasItems);
		grid.enableButton(4, allow);
		grid.enableButton(5, allow && this.game.state.partySize < 6);
		grid.enableButton(6, allow && hasItems);
		grid.enableButton(7, allow && pm.gold > 0);
		grid.enableButton(8, allow && pm.food > 0);
	}

	init() {
		super.init();
		const game = this.game;
		const dialog = this.addLabel(16, 39, game.loadUIText(UIText.Dialog), 176, 7);
		dialog.alignment = TextAlignment.Center;
		this.conversationText = this.addLabelArea(TextDisplayArea.x, TextDisplayArea.y, TextDisplayArea.w, TextDisplayArea.h);
		this.textScrollHandler.scrollEnded.add(() => this.#endClickWait());
		for (const p of ItemSlotPositions)
			this.items.push(this.addItem(p.x, p.y, null, 0, 10));
		let x = 208;
		const y = 113;
		this.addImage(x, y, 16, 16, game.graphicIndexProvider.getUIGraphicIndex(UIGraphic.EmptyItemSlot), 10, true);
		const goldIcon = this.addImage(x, y, 16, 16, game.graphicIndexProvider.getItemGraphicIndex(ItemGraphic.WishingCoins), 15);
		goldIcon.paletteIndex = BuiltinPalette.Item;
		x += 16;
		this.goldValue = this.addLabelArea(x + 1, y + 5, 30, 7, 15);
		x += 32;
		this.addImage(x, y, 16, 16, game.graphicIndexProvider.getUIGraphicIndex(UIGraphic.EmptyItemSlot), 10, true);
		const foodIcon = this.addImage(x, y, 16, 16, game.graphicIndexProvider.getItemGraphicIndex(ItemGraphic.Ration), 15);
		foodIcon.paletteIndex = BuiltinPalette.Item;
		x += 16;
		this.foodValue = this.addLabelArea(x + 1, y + 5, 30, 7, 15);
	}

	open(closeAction) {
		super.open(closeAction);
		const game = this.game;
		game.setLayout(Layout.Conversation, BuiltinPalette.UI);
		game.cursor.cursorType = CursorType.Sword;
		game.cursor.paletteIndex = BuiltinPalette.UI;
		const cc = game.state.currentConversationCharacter;
		if (!cc)
			throw new Error('No conversation character specified.');
		// Party members use their (changed) state copy
		this.person = game.state.partyMembers.get(cc.characterIndex) ?? game.assets.loadPerson(cc.characterIndex);
		this.personInfoView = new PersonInfoView(game, this.person, cc.characterIndex, BuiltinPalette.UI);
		this.personInfoView.extended = false;
		this.map = cc.map;
		this.mapCharacterIndex = cc.index + 1;
		this.characterIndex = cc.characterIndex;
		this.insideParty = game.state.partyCharacterIndices.includes(this.characterIndex);
		this.waitForClick = false;
		this.closeAfterClick = false;
		this.receivedItems = [];
		this.#updateGoldFood();
		this.#hideText();
		this.#showReceivedItems();
		this.requestButtonSetup();
	}

	#updateGoldFood() {
		const pm = this.game.state.activePartyMember;
		this.goldValue.setText(pad(pm.gold, 5));
		this.goldValue.visible = true;
		this.foodValue.setText(pad(pm.food, 5));
		this.foodValue.visible = true;
	}

	close() {
		this.personInfoView?.destroy();
		this.personInfoView = null;
		this.#hideText();
		this.items.forEach(i => i.clearItem());
		this.game.afterPartyChange();
		super.close();
		const active = this.game.screenHandler.activeScreen;
		if (active)
			this.game.cursor.paletteIndex = active.buttonGridPaletteIndex ?? BuiltinPalette.UI;
	}

	screenPushed(screen) {
		if (!screen.transparent && this.personInfoView)
			this.personInfoView.visible = false;
		super.screenPushed(screen);
	}

	screenPopped(screen) {
		super.screenPopped(screen);
		const game = this.game;
		if (!screen.transparent) {
			game.setLayout(Layout.Conversation, BuiltinPalette.UI);
			if (this.personInfoView)
				this.personInfoView.visible = true;
		}
		this.#showReceivedItems();
		if (screen.type === ScreenType.SelectWord && game.currentWord) {
			this.#checkWord(game.currentWord);
		} else if (screen.type === ScreenType.ConversationGiveGold && game.currentAmount > 0) {
			const amount = game.currentAmount;
			if (this.#tryExecuteReactions(InteractionTriggerType.Pay, amount, () => this.#showReceivedItems())) {
				game.state.activePartyMember.gold -= amount;
				this.#updateGoldFood();
			} else {
				this.#showMessage(Message.KeepYourGold);
			}
		} else if (screen.type === ScreenType.ConversationGiveFood && game.currentAmount > 0) {
			const amount = game.currentAmount;
			if (this.#tryExecuteReactions(InteractionTriggerType.Feed, amount, () => this.#showReceivedItems())) {
				game.state.activePartyMember.food -= amount;
				this.#updateGoldFood();
			} else {
				this.#showMessage(Message.KeepYourFood);
			}
		}
		this.requestButtonSetup();
	}

	#endClickWait() {
		this.waitForClick = false;
		this.game.cursor.cursorType = CursorType.Sword;
		this.#hideText();
		this.game.untrapMouse();
		const action = this.afterWaitClickAction;
		this.afterWaitClickAction = null;
		action?.();
		if (this.closeAfterClick)
			this.game.screenHandler.popScreen();
	}

	#checkWord(word) {
		word = word.trim();
		if (word.length !== 0) {
			const wordIndex = this.game.assets.findWord(word);
			if (wordIndex != null && this.#tryExecuteReactions(InteractionTriggerType.Say, wordIndex))
				return;
		}
		this.#showMessage(Message.NothingToSayAboutThat);
	}

	#tryExecuteReactions(triggerType, param = 0, finishAction = null) {
		const cd = this.person.conversationData;
		const questCompleted = this.game.state.isQuestBitSet(cd.questCompletionIndex);
		const interactions = questCompleted ? cd.secondaryInteractions : cd.primaryInteractions;
		const match = interactions.find(i => i.trigger.type === triggerType && i.trigger.argument === param);
		if (!match)
			return false;
		let bound = false;
		for (const reaction of match.reactions) {
			if (!bound && reaction.type === ReactionType.Say) {
				this.afterWaitClickAction = finishAction;
				bound = true;
			}
			this.#executeReaction(reaction);
		}
		if (!bound)
			finishAction?.();
		return true;
	}

	#executeReaction(reaction) {
		const game = this.game;
		switch (reaction.type) {
			case ReactionType.Say:
				if (this.person.conversationData.texts)
					this.#showText(this.person.conversationData.texts.getTextBlock(reaction.arg2));
				break;
			case ReactionType.TeachWord:
				game.state.learnWord(reaction.arg2);
				break;
			case ReactionType.GiveItem: {
				const slotIndex = reaction.arg2 - 1;
				const slot = reaction.arg2 < 10 ? this.person.equipment[slotIndex] : this.person.inventory[slotIndex - 9];
				if (slot?.item && this.receivedItems.length < ItemSlotCount) {
					this.receivedItems.push(new ItemSlot(Math.max(1, slot.count), cloneItem(slot.item)));
					this.#showReceivedItems();
					this.requestButtonSetup();
				}
				break;
			}
			case ReactionType.GiveGold:
				game.distributeGold(reaction.arg2);
				this.#updateGoldFood();
				this.requestButtonSetup();
				break;
			case ReactionType.GiveFood:
				game.distributeFood(reaction.arg2);
				this.#updateGoldFood();
				this.requestButtonSetup();
				break;
			case ReactionType.CompleteQuest:
				game.state.setQuestBit(reaction.arg2 & 0xff);
				break;
			case ReactionType.ChangeStat:
				this.#changeStat(reaction.arg0, reaction.arg1, reaction.arg2);
				game.afterPartyChange();
				break;
		}
	}

	#changeStat(offset, action, value) {
		const target = this.game.state.activePartyMember;
		const change = old => {
			switch (action) {
				case 1: return old + value;
				case 2: return old - value;
				case 3: return old & ~(1 << value);
				case 4: return old | (1 << value);
				case 5: return old ^ (1 << value);
				default: return old;
			}
		};
		const clampByte = v => Math.max(0, Math.min(255, v));
		const clampWord = v => Math.max(0, Math.min(65535, v));
		const changeValue = (cv, max) => {
			if (max)
				cv.maxValue = clampWord(change(cv.maxValue));
			else
				cv.currentValue = clampWord(change(cv.currentValue));
		};
		if (offset >= 0x06 && offset <= 0x19)
			changeValue(target.skills[1 + (offset - 6) % 10], offset >= 0x10);
		else if (offset === 0x1b) target.level = clampByte(change(target.level));
		else if (offset === 0x1e) target.defense = clampByte(change(target.defense));
		else if (offset === 0x1f) target.damage = clampByte(change(target.damage));
		else if (offset === 0x20) target.magicBonusWeapon = clampByte(change(target.magicBonusWeapon));
		else if (offset === 0x21) target.magicBonusArmor = clampByte(change(target.magicBonusArmor));
		else if (offset === 0x37) target.conversationData.learnedLanguages = clampByte(change(target.conversationData.learnedLanguages));
		else if (offset === 0x3a) target.physicalConditions = clampByte(change(target.physicalConditions));
		else if (offset === 0x3b) target.mentalConditions = clampByte(change(target.mentalConditions));
		else if (offset === 0x43) target.attacksPerRound = clampByte(change(target.attacksPerRound));
		else if (offset === 0x46) target.possibleClasses = clampWord(change(target.possibleClasses));
		else if (offset >= 0x48 && offset <= 0x6a) {
			const attribute = target.attributes[1 + Math.floor((offset - 0x48) / 2) % 10];
			if (attribute)
				changeValue(attribute, offset >= 0x5c);
		}
		else if (offset === 0x86) changeValue(target.hitPoints, false);
		else if (offset === 0x88) changeValue(target.hitPoints, true);
		else if (offset === 0x8a) changeValue(target.spellPoints, false);
		else if (offset === 0x8c) changeValue(target.spellPoints, true);
		else if (offset === 0x8e) target.spellLearningPoints = clampWord(change(target.spellLearningPoints));
		else if (offset === 0x90) target.gold = clampWord(change(target.gold));
		else if (offset === 0x92) target.food = clampWord(change(target.food));
		else if (offset === 0xcc) target.experiencePoints = change(target.experiencePoints) >>> 0;
		else if (offset === 0xd0) target.learnedWhiteSpells = change(target.learnedWhiteSpells) >>> 0;
		else if (offset === 0xd4) target.learnedGraySpells = change(target.learnedGraySpells) >>> 0;
		else if (offset === 0xd8) target.learnedBlackSpells = change(target.learnedBlackSpells) >>> 0;
		else if (offset === 0xe8) target.learnedSpecialSpells = change(target.learnedSpecialSpells) >>> 0;
	}

	#showMessage(message) {
		this.#showText(this.game.assets.message(message));
	}

	#showText(text, waitForClick = true, closeAfterClick = false, yOffset = 0, center = false) {
		const label = this.conversationText;
		label.area = { x: TextDisplayArea.x, y: TextDisplayArea.y + yOffset, w: TextDisplayArea.w, h: TextDisplayArea.h - yOffset };
		label.alignment = center ? TextAlignment.Center : TextAlignment.Left;
		label.setText(text);
		label.visible = true;
		this.textScrollHandler.attach(label);
		this.game.trapMouse(label.area);
		this.game.cursor.cursorType = waitForClick ? CursorType.Zzz : CursorType.Sword;
		this.waitForClick = waitForClick;
		this.closeAfterClick = closeAfterClick;
	}

	#hideText() {
		if (this.conversationText)
			this.conversationText.visible = false;
		this.textScrollHandler.detach();
	}

	buttonClicked(index) {
		const game = this.game;
		switch (index) {
			case 0:
				this.#showReceivedItems();
				game.screenHandler.pushScreen(ScreenType.ConversationPickupItem);
				break;
			case 1:
				this.#showReceivedItems();
				game.screenHandler.pushScreen(ScreenType.ConversationDropItem);
				break;
			case 2:
				game.screenHandler.popScreen();
				break;
			case 3:
				this.#showInventoryItems();
				game.screenHandler.pushScreen(ScreenType.ConversationShowItem);
				break;
			case 4:
				game.screenHandler.pushScreen(ScreenType.SelectWord);
				break;
			case 5: {
				const cd = this.person.conversationData;
				const joins = cd.joinChance === 100 || (cd.joinChance !== 0 && game.probe(cd.joinChance));
				if (!joins) {
					this.#showMessage(Message.NotInterestedInJoining);
				} else {
					const slot = game.state.tryAddPartyMember(this.characterIndex);
					if (slot < 0)
						return;
					const joined = () => {
						const pm = game.state.partyMembers.get(this.characterIndex);
						if (pm)
							pm.saveBit = (this.map.index - 1) * 24 + this.mapCharacterIndex;
						game.state.setMapCharacterActive(this.map.index, this.mapCharacterIndex, false);
						game.updatePartyMembers();
						game.resetStatusIcons();
						this.insideParty = true;
						this.#showReceivedItems();
						this.requestButtonSetup();
					};
					if (!this.#tryExecuteReactions(InteractionTriggerType.Join, 0, joined))
						joined();
				}
				break;
			}
			case 6:
				this.#showInventoryItems();
				game.screenHandler.pushScreen(ScreenType.ConversationGiveItem);
				break;
			case 7:
				game.currentAmount = 0;
				game.currentMaxAmount = game.state.activePartyMember.gold;
				game.screenHandler.pushScreen(ScreenType.ConversationGiveGold);
				break;
			case 8:
				game.currentAmount = 0;
				game.currentMaxAmount = game.state.activePartyMember.food;
				game.screenHandler.pushScreen(ScreenType.ConversationGiveFood);
				break;
		}
	}

	keyDown(key, modifiers) {
		if (this.waitForClick) {
			if (this.textScrollHandler.keyDown(key))
				return true;
			if (key === Key.Escape || key === Key.Space || key === Key.Enter || key === Key.Down || key === Key.PageDown)
				this.#endClickWait();
			return true;
		}
		if (key === Key.Escape && ItemContainer.isDragging) {
			this.#abortItemDrag();
			return true;
		}
		if (key === Key.Escape && this.receivedItems.length > 0)
			return true; // items must be handled first
		return super.keyDown(key, modifiers);
	}

	mouseDown(position, buttons, modifiers) {
		const game = this.game;
		if (this.waitForClick) {
			if (this.textScrollHandler.mouseDown(buttons))
				return true;
			this.#endClickWait();
			return true;
		}
		if (buttons === MouseButtons.Right) {
			if (ItemContainer.isDragging) {
				this.#abortItemDrag();
				return true;
			}
		} else if (buttons === MouseButtons.Left) {
			const slot = game.testPartyPortraitHit(position);
			if (ItemContainer.isDragging) {
				if (slot != null) {
					if (game.tryAddItem(slot, game.currentItem)) {
						GameState.recalculateWeight(game.state.getPartyMember(slot));
						const source = this.receivedItems[this.dragSourceItemSlot];
						if (source.count <= 1)
							this.receivedItems.splice(this.dragSourceItemSlot, 1);
						else
							source.count--;
						ItemContainer.consumeDragged(game);
						game.untrapMouse();
						game.resetStatusIcons();
						this.#showReceivedItems();
						this.requestButtonSetup();
					} else {
						this.#abortItemDrag();
					}
					return true;
				}
			} else if (slot != null) {
				this.#switchToPartyMember(slot);
				return true;
			}
		}
		return super.mouseDown(position, buttons, modifiers);
	}

	mouseMove(position, buttons) {
		ItemContainer.updateDragPosition(this.game, position);
		super.mouseMove(position, buttons);
	}

	#abortItemDrag() {
		this.game.untrapMouse();
		ItemContainer.abortDrag(this.game);
		this.game.resetStatusIcons();
	}

	showMessage(messageIndex, waitForClick = true, closeAfterClick = false) {
		const text = this.game.assets.message(messageIndex);
		const multiline = text.getLines(Math.floor(TextDisplayArea.w / 6)).length > 1;
		let yOffset = MessageBaseY - TextDisplayArea.y;
		let center = true;
		if (multiline) {
			yOffset -= 8;
			center = false;
		}
		this.#showText(text, waitForClick, closeAfterClick, yOffset, center);
	}

	hideMessage() { this.#hideText(); }

	pickItem(sourceScreen, index) {
		const game = this.game;
		if (index == null) {
			this.#showReceivedItems();
			return;
		}
		switch (sourceScreen) {
			case ScreenType.ConversationPickupItem:
				game.currentItem = this.items[index].item;
				if (game.setHandIconsByItem(game.currentItem) > 0) {
					this.dragSourceItemSlot = index;
					this.items[index].startDragging();
					game.trapMouseInPortraitArea();
				} else {
					game.resetStatusIcons();
					this.showMessage(Message.NoMemberHasRoomForItem);
				}
				break;
			case ScreenType.ConversationDropItem:
				game.askForConfirmation(Message.ReallyDropItem, () => {
					this.receivedItems.splice(index, 1);
					this.#showReceivedItems();
					this.requestButtonSetup();
				});
				break;
			case ScreenType.ConversationShowItem: {
				const item = this.items[index].item;
				if (!this.#tryExecuteReactions(InteractionTriggerType.Show, item.index, () => this.#showReceivedItems())) {
					this.afterWaitClickAction = () => this.#showReceivedItems();
					this.#showMessage(Message.NotInterestedInItem);
				}
				break;
			}
			case ScreenType.ConversationGiveItem: {
				const item = this.items[index].item;
				const pm = game.state.activePartyMember;
				if (!this.#tryExecuteReactions(InteractionTriggerType.Give, item.index, () => {
					game.removeInventoryItem(pm, index, 1);
					GameState.recalculateWeight(pm);
					this.requestButtonSetup();
					this.#showReceivedItems();
				})) {
					this.afterWaitClickAction = () => this.#showReceivedItems();
					this.#showMessage(Message.NotInterestedInItem);
				}
				break;
			}
		}
	}

	#showItems(slots) {
		for (let i = 0; i < this.items.length; i++) {
			const container = this.items[i];
			const slot = slots[i];
			if (slot?.item && slot.count > 0)
				container.setItem(slot.count, slot.item);
			else
				container.clearItem();
		}
	}

	#switchToPartyMember(index) {
		const game = this.game;
		if (game.state.activePartyMemberIndex === index)
			return;
		game.state.setActivePartyMember(index);
		this.#updateGoldFood();
		game.updatePartyMembers();
		this.requestButtonSetup();
	}

	#showInventoryItems() { this.#showItems(this.game.state.activePartyMember.inventory); }
	#showReceivedItems() { this.#showItems(this.receivedItems); }
}

class ConversationItemScreen extends ItemPickerScreen {
	get mouseTrapArea() { return ItemArea; }
	get itemTooltipArea() { return ItemTooltipArea; }
	get hideItemsAfterPicking() { return false; }
}

export class ConversationPickupItemScreen extends ConversationItemScreen {
	get type() { return ScreenType.ConversationPickupItem; }
	get message() { return Message.TransferWhichItem; }
}

export class ConversationDropItemScreen extends ConversationItemScreen {
	get type() { return ScreenType.ConversationDropItem; }
	get message() { return Message.DropWhichItem; }
}

export class ConversationShowItemScreen extends ConversationItemScreen {
	get type() { return ScreenType.ConversationShowItem; }
	get message() { return Message.ShowWhichItem; }
}

export class ConversationGiveItemScreen extends ConversationItemScreen {
	get type() { return ScreenType.ConversationGiveItem; }
	get message() { return Message.GiveWhichItem; }
}

export class ConversationGiveGoldScreen extends InputAmountScreen {
	get type() { return ScreenType.ConversationGiveGold; }
	get graphic() { return ItemGraphic.WishingCoins; }
	get inputLabelText() { return this.game.loadUIText(UIText.Gold); }
	get messageIndex() { return Message.GiveHowMuch; }
}

export class ConversationGiveFoodScreen extends InputAmountScreen {
	get type() { return ScreenType.ConversationGiveFood; }
	get graphic() { return ItemGraphic.Ration; }
	get inputLabelText() { return this.game.loadUIText(UIText.Food); }
	get messageIndex() { return Message.TransferHowManyFood; }
}

const SW = { X: 32, Y: 40, W: 10, H: 10, WindowLayer: 110, ControlLayer: 120 };

export class SelectWordScreen extends WindowScreen {
	constructor() {
		super(SW.X, SW.Y, SW.W, SW.H, SW.WindowLayer);
		this.list = null;
	}

	get type() { return ScreenType.SelectWord; }
	get dark() { return true; }

	init() {
		super.init();
		const game = this.game;
		const { w, h } = this.clientArea;
		this.list = this.addList(0, 0, w, h - Button.Height, SW.ControlLayer, 3);
		this.list.itemClicked.add((_, word) => {
			game.currentWord = word;
			game.screenHandler.popScreen();
		});
		let x = 0;
		const y = this.list.area.h;
		const mouth = this.addButton(x, y, ButtonType.Mouth, SW.ControlLayer);
		mouth.clickAction.add(() => game.screenHandler.pushScreen(ScreenType.InputWord));
		x += Button.Width;
		this.upButton = this.addButton(x, y, ButtonType.ArrowUp, SW.ControlLayer);
		this.upButton.clickAction.add(() => this.list.scroll(-1));
		this.upButton.rightClickAction.add(() => this.list.scrollToBegin());
		x += Button.Width;
		this.downButton = this.addButton(x, y, ButtonType.ArrowDown, SW.ControlLayer);
		this.downButton.clickAction.add(() => this.list.scroll(1));
		this.downButton.rightClickAction.add(() => this.list.scrollToEnd());
		x += Button.Width;
		const exit = this.addButton(x, y, ButtonType.Exit, SW.ControlLayer);
		exit.clickAction.add(() => {
			game.currentWord = null;
			game.screenHandler.popScreen();
		});
	}

	open(closeAction) {
		super.open(closeAction);
		const game = this.game;
		this.list.clear();
		const words = [];
		for (let i = 1; i < Math.min(5000, game.assets.textFragments.length); i++)
			if (game.state.isWordKnown(i))
				words.push(game.assets.fragment(i));
		words.sort();
		for (const word of words)
			this.list.addItem(word);
		this.list.visible = true;
	}

	screenPopped(screen) {
		super.screenPopped(screen);
		if (screen.type === ScreenType.InputWord && this.game.currentWord)
			this.game.screenHandler.popScreen();
	}

	keyDown(key, modifiers) {
		const list = this.list;
		switch (key) {
			case Key.Up: modifiers === KeyModifiers.None ? list.scroll(-1) : list.scrollToBegin(); return true;
			case Key.Down: modifiers === KeyModifiers.None ? list.scroll(1) : list.scrollToEnd(); return true;
			case Key.PageUp: modifiers === KeyModifiers.None ? list.scroll(-10) : list.scrollToBegin(); return true;
			case Key.PageDown: modifiers === KeyModifiers.None ? list.scroll(10) : list.scrollToEnd(); return true;
			case Key.Home: list.scrollToBegin(); return true;
			case Key.End: list.scrollToEnd(); return true;
			case Key.Escape:
			case Key.Space:
				this.game.currentWord = null;
				this.game.screenHandler.popScreen();
				return true;
			case Key.Enter:
				this.game.screenHandler.pushScreen(ScreenType.InputWord);
				return true;
		}
		return false;
	}

	mouseDown(position, buttons, modifiers) {
		if (buttons === MouseButtons.Left && this.list.mouseClick(position))
			return true;
		if (modifiers !== KeyModifiers.None && (rectContains(this.upButton.area, position) || rectContains(this.downButton.area, position)))
			buttons = MouseButtons.Right;
		return super.mouseDown(position, buttons, modifiers);
	}

	mouseWheel(position, scrollX, scrollY) {
		this.list.mouseWheel(Math.sign(scrollY));
		return true;
	}
}

const IW = { X: 48, Y: 80, W: 10, H: 4, WindowLayer: 180, ControlLayer: 190 };

export class InputWordScreen extends WindowScreen {
	constructor() {
		super(IW.X, IW.Y, IW.W, IW.H, IW.WindowLayer);
		this.input = null;
	}

	get type() { return ScreenType.InputWord; }
	get closeOnRightClick() { return true; }
	get closeOnSpace() { return false; }

	init() {
		super.init();
		this.addLabel(0, 7, this.game.loadUIText(UIText.EnterWord), 144, 7, IW.ControlLayer);
		this.input = this.addInput(-1, 16, 128, IW.ControlLayer);
	}

	open(closeAction) {
		this.game.currentWord = '';
		this.input.clear();
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
		} else if (key === Key.Enter) {
			game.currentWord = this.input.text.length === 0 ? null : this.input.text;
			game.screenHandler.popScreen();
			return true;
		}
		if (this.input.keyDown(key))
			return true;
		// Letters are handled in keyChar
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
