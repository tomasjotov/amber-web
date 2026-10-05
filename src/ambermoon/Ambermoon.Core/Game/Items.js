// Port of Ambermoon.Core/Game/Items.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Chest } from '../../Ambermoon.Data.Common/Chest.js';
import { ItemSlot } from '../../Ambermoon.Data.Common/ItemSlot.js';
import { ItemFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemFlags.js';
import { ItemSlotFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemSlotFlags.js';
import { Class } from '../../Ambermoon.Data.Common/Enumerations/Class.js';
import { GenderFlag } from '../../Ambermoon.Data.Common/Enumerations/Gender.js';
import { Spell } from '../../Ambermoon.Data.Common/Enumerations/Spells.js';
import { ButtonType } from '../../Ambermoon.Data.Common/Enumerations/ButtonType.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { CollectionExtensions } from '../../Ambermoon.Common/CollectionExtensions.js';
import { EnumHelper } from '../../Ambermoon.Common/EnumHelper.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { TextAlign } from '../Render/TextAlign.js';
import { Window } from '../UI/Window.js';
import { Button } from '../UI/Button.js';
import { Global } from '../UI/Global.js';
import { MouseButtons } from '../MouseButtons.js';
import { format, hasFlag, firstOrDefault, toShort } from '../../../runtime.js';

const LockpickItemIndex = 138;

/** int.ToString("+#;-#; 0") */
function formatSigned(value) {
	if (value > 0)
		return '+' + value;
	if (value < 0)
		return '-' + (-value);
	return ' 0';
}

export class GameCore_Items {
	static LockpickItemIndex = LockpickItemIndex;

	static initFields(self) {
		self.itemDragCancelledHandler = null;
		// public IItemManager ItemManager { get; } (assigned in GameCore constructor)
	}

	DropGold(amount) {
		this.layout.ClosePopup(false, true);
		this.CurrentInventory.RemoveGold(amount);
		this.layout.UpdateLayoutButtons();
		this.UpdateCharacterInfo();
	}

	DropFood(amount) {
		this.layout.ClosePopup(false, true);
		this.CurrentInventory.RemoveFood(amount);
		this.layout.UpdateLayoutButtons();
		this.UpdateCharacterInfo();
	}

	StoreGold(amount) {
		this.layout.ClosePopup(false, true);
		const chest = this.OpenStorage instanceof Chest ? this.OpenStorage : null;
		const MaxGoldPerChest = 0xffff;
		amount = Math.min(amount, MaxGoldPerChest - chest.Gold);
		this.CurrentInventory.RemoveGold(amount);
		chest.Gold += amount;
		this.layout.UpdateLayoutButtons();
		this.UpdateCharacterInfo();
	}

	StoreFood(amount) {
		this.layout.ClosePopup(false, true);
		const chest = this.OpenStorage instanceof Chest ? this.OpenStorage : null;
		const MaxFoodPerChest = 0xffff;
		amount = Math.min(amount, MaxFoodPerChest - chest.Food);
		this.CurrentInventory.RemoveFood(amount);
		chest.Food += amount;
		this.layout.UpdateLayoutButtons();
		this.UpdateCharacterInfo();
	}

	/**
	 * Tries to store the item inside the opened storage.
	 * @param itemSlot Item to store. Don't change the itemSlot itself!
	 * @returns Status of dropping
	 */
	StoreItem(itemSlot, maxAmount) {
		if (this.OpenStorage == null)
			return false; // should not happen

		const slots = CollectionExtensions.ToList(this.OpenStorage.Slots);

		if (hasFlag(this.ItemManager.GetItem(itemSlot.ItemIndex).Flags, ItemFlags.Stackable)) {
			for (const slot of slots) {
				if (!slot.Empty && slot.ItemIndex === itemSlot.ItemIndex) {
					// This will update itemSlot
					const oldAmount = itemSlot.Amount;
					slot.Add(itemSlot, maxAmount);
					const dropped = oldAmount - itemSlot.Amount;
					maxAmount -= dropped;
					if (maxAmount === 0)
						return true;
				}
			}
		}

		for (const slot of slots) {
			if (slot.Empty) {
				// This will update itemSlot
				slot.Add(itemSlot, maxAmount);
				return true;
			}
		}

		return false;
	}

	/**
	 * Overloads:
	 * - DropItem(PartyMember partyMember, uint itemIndex, int amount)
	 * - DropItem(int partyMemberIndex, int? slotIndex, ItemSlot item):
	 *   Drops the item in the inventory of the given player.
	 *   Returns the remaining amount of items that could not
	 *   be dropped or 0 if all items were dropped successfully.
	 */
	DropItem(a, b, c) {
		if (typeof c === 'number') {
			const partyMember = a;
			const itemIndex = b;
			const amount = c;
			return this.DropItem(this.SlotFromPartyMember(partyMember), null, ItemSlot.CreateFromItem(this.ItemManager, itemIndex, amount, true)[0]);
		}

		const partyMemberIndex = a;
		const slotIndex = b;
		const item = c;
		const partyMember = this.GetPartyMember(partyMemberIndex);

		if (partyMember == null || !partyMember.CanTakeItems(this.ItemManager, item))
			return item.Amount;

		const stackable = hasFlag(this.ItemManager.GetItem(item.ItemIndex).Flags, ItemFlags.Stackable);

		const slots = slotIndex == null
			? stackable ? partyMember.Inventory.Slots.filter(s => s.ItemIndex === item.ItemIndex && s.Amount < 99) : []
			: [partyMember.Inventory.Slots[slotIndex]];
		const amountToAdd = item.Amount;

		if (slots.length === 0) { // no slot found -> try any empty slot
			const emptySlot = firstOrDefault(partyMember.Inventory.Slots, s => s.Empty);

			if (emptySlot == null) // no free slot
				return item.Amount;

			// This reduces item.Amount internally.
			const remaining = emptySlot.Add(item);
			const added = amountToAdd - remaining;

			this.InventoryItemAdded(this.ItemManager.GetItem(emptySlot.ItemIndex), added, partyMember);

			return remaining;
		}

		const itemToAdd = this.ItemManager.GetItem(item.ItemIndex);

		for (const slot of slots) {
			// This reduces item.Amount internally.
			slot.Add(item);

			if (item.Empty)
				break;
		}

		const addedAmount = amountToAdd - item.Amount;
		this.InventoryItemAdded(itemToAdd, addedAmount, partyMember);

		return item.Amount;
	}

	/**
	 * Overloads:
	 * - InventoryItemAdded(Item item, int amount, PartyMember? partyMember = null)
	 * - InventoryItemAdded(uint itemIndex, int amount, PartyMember partyMember)
	 */
	InventoryItemAdded(item, amount, partyMember = null) {
		if (typeof item === 'number') {
			this.InventoryItemAdded(this.ItemManager.GetItem(item), amount, partyMember);
			return;
		}

		partyMember ??= this.CurrentInventory;

		if (partyMember != null)
			partyMember.TotalWeight += amount * item.Weight;

		if (this.CurrentWindow.Window === Window.Inventory)
			this.layout.UpdateLayoutButtons();
	}

	/**
	 * Overloads:
	 * - InventoryItemRemoved(Item item, int amount, PartyMember? partyMember = null)
	 * - InventoryItemRemoved(uint itemIndex, int amount, PartyMember? partyMember = null)
	 */
	InventoryItemRemoved(item, amount, partyMember = null) {
		if (typeof item === 'number') {
			this.InventoryItemRemoved(this.ItemManager.GetItem(item), amount, partyMember);
			return;
		}

		partyMember ??= this.CurrentInventory;

		partyMember.TotalWeight -= amount * item.Weight;

		if (this.CurrentWindow.Window === Window.Inventory)
			this.layout.UpdateLayoutButtons();
	}

	/**
	 * Overloads:
	 * - EquipmentAdded(Item item, int amount, Character? character = null)
	 * - EquipmentAdded(uint itemIndex, int amount, Character character)
	 */
	EquipmentAdded(item, amount, character = null) {
		if (typeof item === 'number') {
			this.EquipmentAdded(this.ItemManager.GetItem(item), amount, character);
			return;
		}

		const cursed = hasFlag(item.Flags, ItemFlags.Accursed);

		character ??= this.CurrentInventory;

		// Note: amount is only used for ammunition. The weight is
		// influenced by the amount but not the damage/defense etc.
		character.BonusAttackDamage = toShort(character.BonusAttackDamage + (cursed ? -1 : 1) * item.Damage);
		character.BonusDefense = toShort(character.BonusDefense + (cursed ? -1 : 1) * item.Defense);
		character.MagicAttack = toShort(character.MagicAttack + item.MagicAttackLevel);
		character.MagicDefense = toShort(character.MagicDefense + item.MagicArmorLevel);
		character.HitPoints.BonusValue += (cursed ? -1 : 1) * item.HitPoints;
		character.SpellPoints.BonusValue += (cursed ? -1 : 1) * item.SpellPoints;
		if (character.HitPoints.CurrentValue > character.HitPoints.TotalMaxValue)
			character.HitPoints.CurrentValue = character.HitPoints.TotalMaxValue;
		if (character.SpellPoints.CurrentValue > character.SpellPoints.TotalMaxValue)
			character.SpellPoints.CurrentValue = character.SpellPoints.TotalMaxValue;
		if (item.Attribute != null)
			character.Attributes[item.Attribute].BonusValue += (cursed ? -1 : 1) * item.AttributeValue;
		if (item.Skill != null)
			character.Skills[item.Skill].BonusValue += (cursed ? -1 : 1) * item.SkillValue;
		if (item.SkillPenalty1Value !== 0)
			character.Skills[item.SkillPenalty1].BonusValue -= item.SkillPenalty1Value;
		if (item.SkillPenalty2Value !== 0)
			character.Skills[item.SkillPenalty2].BonusValue -= item.SkillPenalty2Value;
		character.TotalWeight += amount * item.Weight;

		if (this.CurrentWindow.Window === Window.Inventory)
			this.layout.UpdateLayoutButtons();
	}

	/**
	 * Overloads:
	 * - EquipmentRemoved(Character character, Item item, int amount, bool cursed)
	 * - EquipmentRemoved(Item item, int amount, bool cursed)
	 * - EquipmentRemoved(uint itemIndex, int amount, bool cursed)
	 * - EquipmentRemoved(Character character, uint itemIndex, int amount, bool cursed)
	 */
	EquipmentRemoved(...args) {
		if (args.length === 3) {
			const [itemOrIndex, amount, cursed] = args;
			const item = typeof itemOrIndex === 'number' ? this.ItemManager.GetItem(itemOrIndex) : itemOrIndex;
			this.EquipmentRemoved(this.CurrentInventory, item, amount, cursed);
			return;
		}

		const [character, itemOrIndex, amount, cursed] = args;

		if (typeof itemOrIndex === 'number') {
			this.EquipmentRemoved(character, this.ItemManager.GetItem(itemOrIndex), amount, cursed);
			return;
		}

		const item = itemOrIndex;

		// Note: amount is only used for ammunition. The weight is
		// influenced by the amount but not the damage/defense etc.
		character.BonusAttackDamage = toShort(character.BonusAttackDamage - (cursed ? -1 : 1) * item.Damage);
		character.BonusDefense = toShort(character.BonusDefense - (cursed ? -1 : 1) * item.Defense);
		character.MagicAttack = toShort(character.MagicAttack - item.MagicAttackLevel);
		character.MagicDefense = toShort(character.MagicDefense - item.MagicArmorLevel);
		character.HitPoints.BonusValue -= (cursed ? -1 : 1) * item.HitPoints;
		character.SpellPoints.BonusValue -= (cursed ? -1 : 1) * item.SpellPoints;
		if (character.HitPoints.CurrentValue > character.HitPoints.TotalMaxValue)
			character.HitPoints.CurrentValue = character.HitPoints.TotalMaxValue;
		if (character.SpellPoints.CurrentValue > character.SpellPoints.TotalMaxValue)
			character.SpellPoints.CurrentValue = character.SpellPoints.TotalMaxValue;
		if (item.Attribute != null)
			character.Attributes[item.Attribute].BonusValue -= (cursed ? -1 : 1) * item.AttributeValue;
		if (item.Skill != null)
			character.Skills[item.Skill].BonusValue -= (cursed ? -1 : 1) * item.SkillValue;
		if (item.SkillPenalty1Value !== 0)
			character.Skills[item.SkillPenalty1].BonusValue += item.SkillPenalty1Value;
		if (item.SkillPenalty2Value !== 0)
			character.Skills[item.SkillPenalty2].BonusValue += item.SkillPenalty2Value;
		character.TotalWeight -= amount * item.Weight;

		if (this.CurrentWindow.Window === Window.Inventory)
			this.layout.UpdateLayoutButtons();
	}

	ItemDraggingCancelled() {
		this.itemDragCancelledHandler?.();
	}

	ShowItemPopup(itemSlot, closeAction) {
		const item = this.ItemManager.GetItem(itemSlot.ItemIndex);
		const popup = this.layout.OpenPopup(new Position(16, 84), 18, 6, true, false);
		const itemArea = new Rect(31, 99, 18, 18);
		popup.AddSunkenBox(itemArea);
		popup.AddItemImage(itemArea.CreateModified(1, 1, -2, -2), item.GraphicIndex);
		popup.AddText(new Position(51, 101), item.Name, TextColor.White);
		popup.AddText(new Position(51, 109), this.DataNameProvider.GetItemTypeName(item.Type), TextColor.White);
		popup.AddText(new Position(32, 120), format(this.DataNameProvider.ItemWeightDisplay.replaceAll('{0:00000}', '{0,5}'), item.Weight), TextColor.White);
		popup.AddText(new Position(32, 130), format(this.DataNameProvider.ItemHandsDisplay, item.NumberOfHands), TextColor.White);
		popup.AddText(new Position(32, 138), format(this.DataNameProvider.ItemFingersDisplay, item.NumberOfFingers), TextColor.White);
		const showCursed = hasFlag(item.Flags, ItemFlags.Accursed) && hasFlag(itemSlot.Flags, ItemSlotFlags.Identified);
		const damage = showCursed ? -item.Damage : item.Damage;
		const defense = showCursed ? -item.Defense : item.Defense;
		const valueOffset = this.DataNameProvider.ItemFingersDisplay.indexOf('{') - 1;
		popup.AddText(new Position(32, 146), this.DataNameProvider.ItemDamageDisplay.substring(0, valueOffset) + formatSigned(damage), TextColor.White);
		popup.AddText(new Position(32, 154), this.DataNameProvider.ItemDefenseDisplay.substring(0, valueOffset) + formatSigned(defense), TextColor.White);

		popup.AddText(new Position(177, 99), this.DataNameProvider.ClassesHeaderString, TextColor.LightGray);
		let column = 0;
		let row = 0;
		for (const _class of EnumHelper.GetValues(Class)) {
			const classFlag = 1 << _class;

			if (hasFlag(item.Classes, classFlag)) {
				popup.AddText(new Position(177 + column * 54, 107 + row * Global.GlyphLineHeight), this.DataNameProvider.GetClassName(_class), TextColor.White);

				if (++row === 5) {
					++column;
					row = 0;
				}
			}
		}
		popup.AddText(new Position(177, 146), this.DataNameProvider.GenderHeaderString, TextColor.LightGray);
		popup.AddText(new Position(177, 154), this.DataNameProvider.GetGenderName(item.Genders, GenderFlag), TextColor.White);

		const Close = () => {
			this.ClosePopup();
			// Note: If we call closeAction directly any new nextClickAction
			// assignment will be lost when we return true below because the
			// nextClickHandler processing will set it to null then afterwards.
			this.ExecuteNextUpdateCycle(closeAction);
		};

		const HandleRightClick = () => {
			if (!popup.HasChildPopup) {
				Close();
			} else {
				this.ExecuteNextUpdateCycle(() => {
					popup.CloseChildPopup();
					SetupRightClickHandler();
				});
			}
		};

		const SetupRightClickHandler = () => {
			this.nextClickHandler = button => {
				if (button === MouseButtons.Right) {
					HandleRightClick();
					return true;
				}
				return false;
			};
		};

		// This can only be closed with right click
		SetupRightClickHandler();

		if (hasFlag(itemSlot.Flags, ItemSlotFlags.Identified)) {
			const eyeButton = popup.AddButton(new Position(popup.ContentArea.Right - Button.Width + 1, popup.ContentArea.Bottom - Button.Height + 1));
			eyeButton.ButtonType = ButtonType.Eye;
			eyeButton.Disabled = false;
			eyeButton.LeftClickAction = combineActions(eyeButton.LeftClickAction, () => this.ShowItemDetails(popup, itemSlot));
			eyeButton.RightClickAction = combineActions(eyeButton.RightClickAction, Close);
			eyeButton.Visible = true;
		}
	}

	ShowItemDetails(itemPopup, itemSlot) {
		this.layout.HideTooltip();
		const item = this.ItemManager.GetItem(itemSlot.ItemIndex);
		const cursed = hasFlag(itemSlot.Flags, ItemSlotFlags.Cursed) || hasFlag(item.Flags, ItemFlags.Accursed);
		const factor = cursed ? -1 : 1;
		const detailsPopup = itemPopup.AddPopup(new Position(32, 52), 12, 6);

		const AddValueDisplay = (position, formatString, value) => {
			detailsPopup.AddText(position, formatString.replaceAll('000', '00')
				.replaceAll(' {0:00}', formatSigned(value)), TextColor.White);
		};

		AddValueDisplay(new Position(48, 68), this.DataNameProvider.MaxLPDisplay, factor * item.HitPoints);
		AddValueDisplay(new Position(128, 68), this.DataNameProvider.MaxSPDisplay, factor * item.SpellPoints);
		AddValueDisplay(new Position(48, 75), this.DataNameProvider.MBWDisplay, item.MagicAttackLevel);
		AddValueDisplay(new Position(128, 75), this.DataNameProvider.MBRDisplay, item.MagicArmorLevel);
		detailsPopup.AddText(new Position(48, 82), this.DataNameProvider.AttributeHeader, TextColor.LightOrange);
		if (item.Attribute != null && item.AttributeValue !== 0) {
			detailsPopup.AddText(new Position(48, 89), this.DataNameProvider.GetAttributeName(item.Attribute), TextColor.White);
			detailsPopup.AddText(new Position(170, 89), formatSigned(factor * item.AttributeValue), TextColor.White);
		}
		detailsPopup.AddText(new Position(48, 96), this.DataNameProvider.SkillsHeaderString, TextColor.LightOrange);
		if (item.Skill != null && item.SkillValue !== 0) {
			detailsPopup.AddText(new Position(48, 103), this.DataNameProvider.GetSkillName(item.Skill), TextColor.White);
			detailsPopup.AddText(new Position(170, 103), formatSigned(factor * item.SkillValue), TextColor.White);
		}
		detailsPopup.AddText(new Position(48, 110), this.DataNameProvider.FunctionHeader, TextColor.LightOrange);
		if (item.Spell !== Spell.None && (item.InitialCharges !== 0 || item.MaxCharges !== 0)) {
			detailsPopup.AddText(new Position(48, 117),
				`${this.DataNameProvider.GetSpellName(item.Spell)} (${(itemSlot.NumRemainingCharges > 99 ? '**' : String(itemSlot.NumRemainingCharges))})`,
				TextColor.White);
		}
		if (cursed) {
			const contentArea = detailsPopup.ContentArea;
			this.AddAnimatedText((area, text, color, align) => detailsPopup.AddText(area, text, color, align),
				new Rect(contentArea.X, 127, contentArea.Width, Global.GlyphLineHeight), this.DataNameProvider.Cursed,
				TextAlign.Center, () => this.layout.PopupActive && itemPopup?.HasChildPopup === true, 50, false);
		}
	}
}

/** Multicast delegate combine for `action += handler` on plain delegate properties. */
function combineActions(existing, handler) {
	if (existing == null)
		return handler;
	return () => {
		existing();
		handler();
	};
}
