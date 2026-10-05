// Port of Ambermoon.Data.Common/ItemSlot.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { hasFlag } from '../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { ItemFlags } from './Enumerations/ItemFlags.js';
import { ItemSlotFlags } from './Enumerations/ItemSlotFlags.js';

export class ItemSlot {
	constructor() {
		this.ItemIndex = 0;
		this.Amount = 0; // 0-255, 255 = unlimited (**)
		this.NumRemainingCharges = 0; // 0-255, 255 = unlimited (**)
		this.Flags = 0;
		/// <summary>
		/// How often the item was recharged. Only enchanters count, not the spell ChargeItem.
		/// </summary>
		this.RechargeTimes = 0;
	}

	get Empty() { return this.Amount === 0; }
	get Unlimited() { return this.Amount === 255; }
	get Stacked() { return this.Amount > 1; }
	get Draggable() { return this.ItemIndex !== 0 && this.Amount !== 0 && !hasFlag(this.Flags, ItemSlotFlags.Locked); }

	/** ref int amount -> returns [itemSlot, amount] */
	static CreateFromItem(itemManager, itemIndex, amount, forceInSingleSlot = false) {
		if (itemIndex === 0)
			return [new ItemSlot(), amount];

		const item = itemManager.GetItem(itemIndex);
		const usedAmount = forceInSingleSlot || hasFlag(item.Flags, ItemFlags.Stackable) ? Math.min(amount, 99) : 1;
		amount -= usedAmount;

		const itemSlot = new ItemSlot();
		itemSlot.ItemIndex = itemIndex;
		itemSlot.Amount = usedAmount;
		itemSlot.Flags = item.DefaultSlotFlags;
		itemSlot.NumRemainingCharges = Math.max(item.MaxCharges === 0 ? 0 : 1, item.InitialCharges);
		itemSlot.RechargeTimes = item.InitialRecharges;

		return [itemSlot, amount];
	}

	/** ref int amount -> returns [amount] */
	FillWithNewItem(itemManager, itemIndex, amount) {
		let itemSlot;
		[itemSlot, amount] = ItemSlot.CreateFromItem(itemManager, itemIndex, amount);

		this.ItemIndex = itemSlot.ItemIndex;
		this.Amount = itemSlot.Amount;
		this.Flags = itemSlot.Flags;
		this.NumRemainingCharges = itemSlot.NumRemainingCharges;
		this.RechargeTimes = itemSlot.RechargeTimes;

		return [amount];
	}

	Add(item, maxAmount = 99) {
		const amountToAdd = Math.min(item.Amount, maxAmount);

		if (item.ItemIndex === this.ItemIndex) {
			if (this.Amount + amountToAdd > 99) {
				item.Amount = this.Amount + item.Amount - 99;
				this.Amount = 99;
				return item.Amount;
			} else {
				this.Amount += amountToAdd;
				item.Remove(amountToAdd);
				return item.Amount;
			}
		} else if (!this.Empty) {
			return item.Amount;
		} else {
			this.ItemIndex = item.ItemIndex;
			this.Amount = amountToAdd;
			this.Flags = item.Flags;
			this.NumRemainingCharges = item.NumRemainingCharges;
			this.RechargeTimes = item.RechargeTimes;
			item.Remove(amountToAdd);
			return item.Amount;
		}
	}

	Remove(amount) {
		if (amount < 0)
			throw new AmbermoonException(ExceptionScope.Application, 'Remove should not be called with negative amount.');
		if (amount > this.Amount)
			throw new AmbermoonException(ExceptionScope.Application, 'Tried to remove more items than existed.');

		if (amount === this.Amount)
			this.Clear();
		else
			this.Amount -= amount;
	}

	Clear() {
		this.ItemIndex = 0;
		this.Amount = 0;
		this.Flags = ItemSlotFlags.None;
		this.NumRemainingCharges = 0;
		this.RechargeTimes = 0;
	}

	Exchange(item) {
		const itemIndex = this.ItemIndex;
		const amount = this.Amount;
		const flags = this.Flags;
		const numRemainingCharges = this.NumRemainingCharges;
		const rechargeTimes = this.RechargeTimes;

		this.ItemIndex = item.ItemIndex;
		this.Amount = item.Amount;
		this.Flags = item.Flags;
		this.NumRemainingCharges = item.NumRemainingCharges;
		this.RechargeTimes = item.RechargeTimes;

		item.ItemIndex = itemIndex;
		item.Amount = amount;
		item.Flags = flags;
		item.NumRemainingCharges = numRemainingCharges;
		item.RechargeTimes = rechargeTimes;
	}

	Replace(item) {
		this.ItemIndex = item.ItemIndex;
		this.Amount = item.Amount;
		this.Flags = item.Flags;
		this.NumRemainingCharges = item.NumRemainingCharges;
		this.RechargeTimes = item.RechargeTimes;
	}

	Copy() {
		const copy = new ItemSlot();
		copy.ItemIndex = this.ItemIndex;
		copy.Amount = this.Amount;
		copy.Flags = this.Flags;
		copy.NumRemainingCharges = this.NumRemainingCharges;
		copy.RechargeTimes = this.RechargeTimes;
		return copy;
	}

	Equals(other, includeChargesAndFlags = true) {
		if (other == null)
			return false;

		if (other === this)
			return true;

		if (includeChargesAndFlags) {
			return this.ItemIndex === other.ItemIndex &&
				this.Amount === other.Amount &&
				this.Flags === other.Flags &&
				this.NumRemainingCharges === other.NumRemainingCharges &&
				this.RechargeTimes === other.RechargeTimes;
		}

		return this.ItemIndex === other.ItemIndex && this.Amount === other.Amount;
	}
}
