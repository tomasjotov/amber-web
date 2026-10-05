// Places (merchants, inns, healers, guilds, ...).
// The C# port only has a stub for this screen ("TODO: Rework and implement fully"),
// so this is a new implementation following the original game mechanics and messages.
import { ScreenType } from './screen.js';
import { ItemGridScreen, ItemPickerScreen, InputAmountScreen } from './itemScreens.js';
import { TextAlignment, TransparentPaper } from '../ui/text.js';
import { ButtonType, CursorType, Image80x80, Layout, UIText, ItemGraphic } from '../../data/enums.js';
import { Key, MouseButtons } from '../keys.js';
import { Message } from '../messages.js';
import { Condition, isDead, hasAnyConditionOf, removeCondition, fillHitPoints, fillSpellPoints, ItemSlotFlags, readItem, ItemFlags } from '../../data/characters.js';
import { Text } from '../../data/text.js';
import { GameState } from '../gameState.js';
import { pad } from '../util.js';
import { DataReader } from '../../data/reader.js';

export const PlaceType = {
	None: 0, WarriorGuild: 1, PaladinGuild: 2, RangerGuild: 3, ThiefGuild: 4, MonkGuild: 5, WhiteWizardGuild: 6,
	GreyWizardGuild: 7, BlackWizardGuild: 8, Merchant: 9, FoodDealer: 10, Unused: 11, HorseDealer: 12, Healer: 13,
	Sage: 14, RaftDealer: 15, ShipDealer: 16, Inn: 17, Library: 18,
};

const MessageDisplayArea = { x: 112, y: 49, w: 192, h: 48 };
const SlotPositions = Array.from({ length: 12 }, (_, i) => ({ x: 16 + (i % 6) * 32, y: 37 + 108 + Math.floor(i / 6) * 32 }));
const ItemArea = { x: 16, y: 145, w: SlotPositions[11].x + 16 - 16, h: SlotPositions[11].y + 16 - 145 };
const ItemTooltipArea = { x: MessageDisplayArea.x, y: MessageDisplayArea.y + 7, w: MessageDisplayArea.w, h: 7 };
const GoldDisplayArea = { x: 112, y: 37 + 76, w: 64, h: 16 };

// Condition -> healer price word index
const HealerPrices = [
	[Condition.Stunned, 0], [Condition.Poisoned, 1], [Condition.Petrified, 2], [Condition.Diseased, 3],
	[Condition.Aging, 4], [Condition.Mad, 5], [Condition.Blind, 6], [Condition.Dead, 7], [Condition.Ashes, 8], [Condition.Dust, 9],
];

function imageForPlace(type) {
	if (type >= PlaceType.WarriorGuild && type <= PlaceType.BlackWizardGuild) return Image80x80.Guild;
	switch (type) {
		case PlaceType.Merchant: return Image80x80.Merchant;
		case PlaceType.FoodDealer: return Image80x80.Merchant;
		case PlaceType.HorseDealer: return Image80x80.HorseStable;
		case PlaceType.Healer: return Image80x80.Healer;
		case PlaceType.Sage: return Image80x80.Sage;
		case PlaceType.RaftDealer:
		case PlaceType.ShipDealer: return Image80x80.ShipDealer;
		case PlaceType.Inn: return Image80x80.Inn;
		case PlaceType.Library: return Image80x80.Library;
		default: return Image80x80.Merchant;
	}
}

export class PlaceScreen extends ItemGridScreen {
	constructor() {
		super();
		this.slots = [];
		this.placeEvent = null;
		this.placeType = 0;
		this.data = null;
		this.wares = [];
		this.image = Image80x80.Merchant;
		this.waitForClick = false;
		this.afterWaitClickAction = null;
		this.pendingAction = null;
		this.pickMode = null;
		this.pickTarget = null; // 'wares' | 'inventory'
	}

	get type() { return ScreenType.Place; }
	get buttonGridPaletteIndex() { return this.game?.paletteIndexProvider.get80x80ImagePaletteIndex(this.image) ?? 0; }
	get itemContainers() { return this.slots; }

	init() {
		super.init();
		for (const p of SlotPositions)
			this.slots.push(this.addItem(p.x, p.y, null, 0, 10));
		this.imageControl = this.addImage(16, 49, 80, 80, this.game.graphicIndexProvider.get80x80ImageIndex(this.image), 0, true);
		this.messageLabel = this.addLabelArea(MessageDisplayArea.x, MessageDisplayArea.y, MessageDisplayArea.w, MessageDisplayArea.h, 20);
		this.goldLabel = this.addLabel(GoldDisplayArea.x, GoldDisplayArea.y, this.game.loadUIText(UIText.Gold), GoldDisplayArea.w, GoldDisplayArea.h);
		this.goldLabel.alignment = TextAlignment.Center;
		this.goldDisplay = this.addLabel(GoldDisplayArea.x, GoldDisplayArea.y + 7, '0', GoldDisplayArea.w, GoldDisplayArea.h);
		this.goldDisplay.alignment = TextAlignment.Center;
	}

	get partyGold() {
		let gold = 0;
		for (const pm of this.game.state.members())
			gold += pm.gold;
		return gold;
	}

	/** Pays the given amount of gold from the party (active member first). Returns false if not enough gold. */
	pay(amount) {
		const game = this.game;
		if (this.partyGold < amount)
			return false;
		const members = [game.state.activePartyMember, ...[...game.state.members()].filter(m => m !== game.state.activePartyMember)];
		for (const pm of members) {
			const take = Math.min(pm.gold, amount);
			pm.gold -= take;
			amount -= take;
			GameState.recalculateWeight(pm);
			if (amount === 0)
				break;
		}
		this.#updateGold();
		return true;
	}

	#updateGold() {
		const palette = this.buttonGridPaletteIndex;
		this.goldLabel.paletteIndex = palette;
		this.goldDisplay.setText(pad(Math.min(99999, this.partyGold), 5), 15, TransparentPaper, palette);
		this.goldLabel.visible = true;
		this.goldDisplay.visible = true;
	}

	open(closeAction) {
		super.open(closeAction);
		const game = this.game;
		this.placeEvent = game.eventHandler.currentEvent;
		this.placeType = this.placeEvent.placeType;
		this.data = game.assets.loadPlaceData(this.placeEvent.placeIndex);
		this.image = imageForPlace(this.placeType);
		this.imageControl.setTextureIndex(game.graphicIndexProvider.get80x80ImageIndex(this.image));
		const palette = game.paletteIndexProvider.get80x80ImagePaletteIndex(this.image);
		this.imageControl.paletteIndex = palette;
		this.imageControl.visible = true;
		game.setLayout(Layout.Place, palette);
		game.cursor.cursorType = CursorType.Sword;
		game.cursor.paletteIndex = palette;
		this.requestButtonGridPaletteUpdate();
		this.wares = [];
		if (this.#hasWares())
			this.#loadWares();
		this.#showWares();
		this.#updateGold();
		this.#showWelcome();
		this.requestButtonSetup();
	}

	#hasWares() {
		return (this.placeType === PlaceType.Merchant || this.placeType === PlaceType.Library) && this.placeEvent.waresIndex > 0;
	}

	#loadWares() {
		const game = this.game;
		const reader = game.assets.reader('WARESDAT.AMB', this.placeEvent.waresIndex);
		const counts = game.state.getWareCounts(this.placeEvent.waresIndex);
		this.wares = [];
		for (let i = 0; i < 12; i++) {
			const item = reader && reader.remaining >= 40 ? readItem(reader) : null;
			this.wares.push({ item: item && item.index !== 0 ? item : null, count: counts[i] ?? 0 });
		}
	}

	#saveWares() {
		this.game.state.setWareCounts(this.placeEvent.waresIndex, this.wares.map(w => w.count));
	}

	#showWares() {
		this.slots.forEach((slot, i) => {
			const w = this.wares[i];
			if (w?.item && w.count > 0)
				slot.setItem(Math.min(w.count, 99), w.item);
			else
				slot.clearItem();
		});
	}

	#showInventory() {
		const pm = this.game.state.activePartyMember;
		this.slots.forEach((slot, i) => {
			const s = pm.inventory[i];
			if (s?.item && s.count > 0)
				slot.setItem(s.count, s.item);
			else
				slot.clearItem();
		});
	}

	#showWelcome() {
		const game = this.game;
		let message = null;
		if (this.placeType === PlaceType.Inn) message = Message.InnWelcome;
		else if (this.placeType === PlaceType.Sage) message = Message.ExaminerWelcome;
		else if (this.placeType >= PlaceType.WarriorGuild && this.placeType <= PlaceType.BlackWizardGuild) message = Message.GuildWelcome;
		const name = Text.fromString(this.data.name);
		if (message != null)
			this.showText(game.assets.message(message), false);
		else
			this.showText(name, false);
	}

	close() {
		this.hideMessage();
		this.slots.forEach(s => s.clearItem());
		this.goldLabel.visible = false;
		this.goldDisplay.visible = false;
		this.game.afterPartyChange();
		// Leaving the place pushes the party back (it was reset when entering already)
		super.close();
		const active = this.game.screenHandler.activeScreen;
		if (active)
			this.game.cursor.paletteIndex = active.buttonGridPaletteIndex ?? 0;
	}

	setupButtons(grid) {
		const game = this.game;
		const t = this.placeType;
		for (let i = 0; i < 9; i++)
			grid.setButton(i, ButtonType.Empty);
		grid.setButton(2, ButtonType.Exit);
		const isGuild = t >= PlaceType.WarriorGuild && t <= PlaceType.BlackWizardGuild;
		if (t === PlaceType.Merchant || t === PlaceType.Library) {
			grid.setButton(0, ButtonType.BuyItem);
			grid.enableButton(0, this.wares.some(w => w.item && w.count > 0));
			if (t === PlaceType.Merchant) {
				grid.setButton(1, ButtonType.SellItem);
				grid.enableButton(1, game.state.activePartyMember.inventory.some(s => s.count > 0));
			}
			grid.setButton(3, ButtonType.ExamineItem);
			grid.enableButton(3, this.wares.some(w => w.item && w.count > 0));
		} else if (t === PlaceType.FoodDealer) {
			grid.setButton(0, ButtonType.BuyFood);
		} else if (t === PlaceType.Inn) {
			grid.setButton(0, ButtonType.Sleep);
		} else if (t === PlaceType.Healer) {
			grid.setButton(0, ButtonType.UseMagic);
		} else if (t === PlaceType.Sage) {
			grid.setButton(0, ButtonType.ExamineItem);
			grid.enableButton(0, game.state.activePartyMember.inventory.some(s => s.count > 0));
		} else if (t === PlaceType.HorseDealer) {
			grid.setButton(0, ButtonType.BuyHorse);
		} else if (t === PlaceType.RaftDealer) {
			grid.setButton(0, ButtonType.BuyRaft);
		} else if (t === PlaceType.ShipDealer) {
			grid.setButton(0, ButtonType.BuyShip);
		} else if (isGuild) {
			grid.setButton(0, ButtonType.AskToJoin);
		}
	}

	buttonClicked(index) {
		const game = this.game;
		const t = this.placeType;
		if (index === 2) {
			game.screenHandler.popScreen();
			return;
		}
		if (index === 0) {
			if (t === PlaceType.Merchant || t === PlaceType.Library) {
				this.#showWares();
				this.pickMode = 'buy';
				game.screenHandler.pushScreen(ScreenType.PlaceBuy);
			} else if (t === PlaceType.FoodDealer) {
				this.#buyFood();
			} else if (t === PlaceType.Inn) {
				this.#rent();
			} else if (t === PlaceType.Healer) {
				this.#heal();
			} else if (t === PlaceType.Sage) {
				this.#showInventory();
				this.pickMode = 'identify';
				game.screenHandler.pushScreen(ScreenType.PlaceSell);
			} else if (t === PlaceType.HorseDealer || t === PlaceType.RaftDealer || t === PlaceType.ShipDealer) {
				this.#buyTransport();
			} else if (t >= PlaceType.WarriorGuild && t <= PlaceType.BlackWizardGuild) {
				this.#joinGuild();
			}
		} else if (index === 1 && t === PlaceType.Merchant) {
			this.#showInventory();
			this.pickMode = 'sell';
			game.screenHandler.pushScreen(ScreenType.PlaceSell);
		} else if (index === 3 && (t === PlaceType.Merchant || t === PlaceType.Library)) {
			this.#showWares();
			this.pickMode = 'examine';
			game.screenHandler.pushScreen(ScreenType.PlaceBuy);
		}
	}

	#askPrice(message, price, action) {
		const game = this.game;
		const text = Text.fromString(`${game.assets.message(message).getLines(1000).join(' ')} ${price}`);
		game.askForConfirmation(text, () => {
			if (!this.pay(price)) {
				this.showMessage(Message.NotEnoughGold);
				return;
			}
			action();
		});
	}

	#buyFood() {
		const game = this.game;
		const price = Math.max(1, this.data.words[0]);
		const max = Math.min(99, Math.floor(this.partyGold / price));
		if (max <= 0) {
			this.showMessage(Message.NotEnoughGold);
			return;
		}
		game.currentAmount = 0;
		game.currentMaxAmount = max;
		this.amountConfig = { graphic: ItemGraphic.Ration, label: UIText.Food, message: Message.FoodPrice };
		this.pendingAction = amount => {
			if (amount <= 0 || !this.pay(amount * price))
				return;
			game.state.activePartyMember.food += amount;
			this.showText(Text.fromString(`${game.assets.message(Message.FoodPrice).getLines(1000).join(' ')} ${price}`), true);
		};
		game.screenHandler.pushScreen(ScreenType.PlaceAmount);
	}

	#rent() {
		const game = this.game;
		const price = this.data.words[0] * game.state.partySize;
		this.#askPrice(Message.InnRoomPrice, price, () => {
			game.foreachPartyMember(pm => {
				fillHitPoints(pm);
				fillSpellPoints(pm);
			}, Condition.DeadAshesDust);
			// Rest for 8 hours
			for (let i = 0; i < 8 * 12; i++)
				game.time.tick();
			game.afterPartyChange();
			this.showMessage(Message.PartyRestsEightHours);
		});
	}

	#heal() {
		const game = this.game;
		const pm = game.state.activePartyMember;
		let price = 0;
		let conditions = 0;
		for (const [condition, wordIndex] of HealerPrices) {
			if (hasAnyConditionOf(pm, condition)) {
				price += this.data.words[wordIndex];
				conditions |= condition;
			}
		}
		const missingHP = pm.hitPoints.totalMax - pm.hitPoints.currentValue;
		if (conditions === 0 && missingHP > 0)
			price += missingHP; // 1 gold per hit point
		if (price === 0) {
			this.showText(Text.fromString(this.data.name), false);
			return;
		}
		this.#askPrice(Message.HealingPrice, price, () => {
			removeCondition(pm, conditions);
			if ((conditions & Condition.DeadAshesDust) !== 0) {
				pm.hitPoints.currentValue = Math.max(1, pm.hitPoints.currentValue);
				this.showMessage(Message.ResurrectedResponse);
			} else {
				fillHitPoints(pm);
			}
			game.afterPartyChange();
		});
	}

	#buyTransport() {
		const game = this.game;
		const [price, x, y, mapIndex, type] = this.data.words;
		const messages = {
			[PlaceType.HorseDealer]: [Message.HorsesPrice, Message.HorsesReady],
			[PlaceType.RaftDealer]: [Message.RaftPrice, Message.RaftReady],
			[PlaceType.ShipDealer]: [Message.ShipPrice, Message.ShipReady],
		}[this.placeType];
		this.#askPrice(messages[0], price, () => {
			const free = game.state.transports.findIndex(t => t.type === 0);
			if (free >= 0)
				game.state.transports[free] = { type, x, y, mapIndex };
			this.showMessage(messages[1]);
		});
	}

	#joinGuild() {
		const game = this.game;
		const pm = game.state.activePartyMember;
		const guildClass = this.placeType; // guild types are 1..8 like the classes
		if (pm.class === guildClass) {
			this.showText(game.assets.message(Message.GuildWelcome), true);
			return;
		}
		if (pm.class !== 0 || !(pm.possibleClasses & (1 << guildClass))) {
			this.showMessage(Message.WrongClass);
			return;
		}
		this.#askPrice(Message.GuildMembershipPrice, this.data.words[0], () => {
			pm.class = guildClass;
			game.afterPartyChange();
			this.showText(game.assets.message(Message.GuildWelcome), true);
		});
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

	#endClickWait() {
		this.waitForClick = false;
		this.game.cursor.cursorType = CursorType.Sword;
		this.game.untrapMouse();
		this.hideMessage();
		const a = this.afterWaitClickAction;
		this.afterWaitClickAction = null;
		a?.();
		this.requestButtonSetup();
	}

	showMessage(messageIndex, waitForClick = true) {
		this.showText(this.game.assets.message(messageIndex), waitForClick);
	}

	showText(text, waitForClick = true) {
		this.messageLabel.setText(text, MessageDisplayArea.w, 15, TransparentPaper, this.buttonGridPaletteIndex);
		this.messageLabel.visible = true;
		this.waitForClick = waitForClick;
		if (waitForClick) {
			this.game.cursor.cursorType = CursorType.Zzz;
			this.game.trapMouse(MessageDisplayArea);
		}
	}

	hideMessage() {
		if (this.messageLabel)
			this.messageLabel.visible = false;
	}

	screenPopped(screen) {
		super.screenPopped(screen);
		const game = this.game;
		if (!screen.transparent)
			game.setLayout(Layout.Place, this.buttonGridPaletteIndex);
		this.#updateGold();
		if (screen.type === ScreenType.PlaceAmount) {
			const action = this.pendingAction;
			this.pendingAction = null;
			action?.(game.currentAmount);
		}
		this.requestButtonSetup();
	}

	pickItem(sourceScreen, index) {
		const game = this.game;
		const mode = this.pickMode;
		this.pickMode = null;
		if (index == null) {
			this.#showWares();
			return;
		}
		const pm = game.state.activePartyMember;
		if (mode === 'examine') {
			game.currentItem = this.wares[index].item;
			game.screenHandler.pushScreen(ScreenType.ItemView);
		} else if (mode === 'buy') {
			const ware = this.wares[index];
			const price = ware.item.buyPrice;
			this.#askPrice(Message.PriceForItem, price, () => {
				if (!game.tryAddItem(game.state.activePartyMemberIndex, { ...ware.item }, 1)) {
					// refund
					pm.gold += price;
					this.showMessage(Message.NoRoomForItem);
					return;
				}
				GameState.recalculateWeight(pm);
				if (ware.count < 255)
					ware.count--;
				this.#saveWares();
				this.#showWares();
				this.#updateGold();
			});
		} else if (mode === 'sell') {
			const slot = pm.inventory[index];
			const item = slot.item;
			const offer = Math.floor(item.buyPrice / 2);
			if (offer === 0 || item.type === 13 /* special item */) {
				this.showMessage(Message.WontBuyThat);
				this.afterWaitClickAction = () => this.#showWares();
				return;
			}
			const text = Text.fromString(`${game.assets.message(Message.OfferForItem).getLines(1000).join(' ')} ${offer}`);
			game.askForConfirmation(text, () => {
				game.removeInventoryItem(pm, index, 1);
				pm.gold = Math.min(32767, pm.gold + offer);
				GameState.recalculateWeight(pm);
				this.#updateGold();
				this.#showWares();
			}, () => this.#showWares());
		} else if (mode === 'identify') {
			const slot = pm.inventory[index];
			if (slot.item.slotFlags & ItemSlotFlags.Identified) {
				this.showMessage(Message.ItemAlreadyExamined);
				return;
			}
			this.#askPrice(Message.ExaminationPrice, this.data.words[0], () => {
				slot.item.slotFlags |= ItemSlotFlags.Identified;
				game.currentItem = slot.item;
				game.screenHandler.pushScreen(ScreenType.ItemView);
			});
		}
	}
}

export class PlaceBuyScreen extends ItemPickerScreen {
	get type() { return ScreenType.PlaceBuy; }
	get mouseTrapArea() { return ItemArea; }
	get message() { return Message.WhatToBuy; }
	get itemTooltipArea() { return ItemTooltipArea; }
	get hideItemsAfterPicking() { return false; }
}

export class PlaceSellScreen extends ItemPickerScreen {
	get type() { return ScreenType.PlaceSell; }
	get mouseTrapArea() { return ItemArea; }
	get message() { return this.parentScreen?.pickMode === 'identify' ? Message.ExamineWhichItem : Message.WhatToSell; }
	get itemTooltipArea() { return ItemTooltipArea; }
	get hideItemsAfterPicking() { return false; }
}

export class PlaceAmountScreen extends InputAmountScreen {
	get type() { return ScreenType.PlaceAmount; }
	get graphic() { return ItemGraphic.Ration; }
	get inputLabelText() { return this.game.loadUIText(UIText.Food); }
	get messageIndex() { return Message.HowManyToBuy; }
}
