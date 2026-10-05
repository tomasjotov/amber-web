// Port of Ambermoon.Data.Common/Merchant.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { firstOrDefault, newArray2D } from '../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { CollectionExtensions } from '../Ambermoon.Common/CollectionExtensions.js';
import { PlaceType } from './Enumerations/PlaceType.js';

export class Merchant {
	static SlotsPerRow = 6;
	static SlotRows = 4;

	constructor() {
		/** C# ItemSlot[6, 4] -> jagged array Slots[column][row] */
		this.Slots = newArray2D(6, 4);
		this.AllowsItemDrop = false;
		this.AvailableGold = 0;
		this.Name = null;
	}

	get PlaceType() { return PlaceType.Merchant; }

	static Load(merchantReader, dataReader) {
		const merchant = new Merchant();

		merchantReader.ReadMerchant(merchant, dataReader);

		return merchant;
	}

	ResetItem(slot, item) {
		const column = slot % Merchant.SlotsPerRow;
		const row = Math.trunc(slot / Merchant.SlotsPerRow);

		if (this.Slots[column][row].Add(item) !== 0)
			throw new AmbermoonException(ExceptionScope.Application, 'Unable to reset merchant item.');
	}

	GetSlot(slot) {
		return this.Slots[slot % Merchant.SlotsPerRow][Math.trunc(slot / Merchant.SlotsPerRow)];
	}

	AddItems(itemManager, itemIndex, amount, sourceSlot) {
		if (amount === 0)
			return;

		const item = itemManager.GetItem(itemIndex); // eslint-disable-line no-unused-vars
		const slots = CollectionExtensions.ToList(this.Slots);
		let remainingAmount = amount;

		// Note: Merchants can stack all items.
		for (const slot of slots.filter(s => s.ItemIndex === itemIndex)) {
			if (slot.Amount > 99) // unlimited stack slot
				return;
			else {
				remainingAmount -= Math.min(remainingAmount, 99 - slot.Amount);
				slot.Amount = Math.min(99, slot.Amount + amount);

				if (remainingAmount === 0)
					return;
			}
		}

		if (remainingAmount > 99)
			throw new AmbermoonException(ExceptionScope.Application, 'Cannot add more than 99 items at once to a merchant.');

		const emptySlot = firstOrDefault(slots, s => s.Empty);

		if (emptySlot == null)
			throw new AmbermoonException(ExceptionScope.Application, 'Tried to add item to a full merchant.');

		emptySlot.ItemIndex = itemIndex;
		emptySlot.Amount = remainingAmount;
		emptySlot.Flags = sourceSlot.Flags;
		emptySlot.NumRemainingCharges = sourceSlot.NumRemainingCharges;
		emptySlot.RechargeTimes = sourceSlot.RechargeTimes;
	}

	TakeItems(column, row, amount) {
		if (amount === 0)
			return;

		const slot = this.Slots[column][row];

		if (slot == null || slot.Amount < amount)
			throw new AmbermoonException(ExceptionScope.Application, 'Taking more items from a merchant slot than he has.');

		if (slot.Amount > 99) // unlimited item slot
			return;

		slot.Remove(amount);
	}
}
