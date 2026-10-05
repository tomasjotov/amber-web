// Port of Ambermoon.Data.Common/Inventory.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { newArray } from '../../runtime.js';
import { ItemSlotFlags } from './Enumerations/ItemSlotFlags.js';
import { ItemSlot } from './ItemSlot.js';

export class Inventory {
	static Width = 3;
	static Height = 8;
	static VisibleWidth = 3;
	static VisibleHeight = 4;

	constructor() {
		this.Slots = newArray(Inventory.Width * Inventory.Height, null);

		for (let i = 0; i < this.Slots.length; ++i) {
			const slot = new ItemSlot();
			slot.ItemIndex = 0;
			slot.Amount = 0;
			slot.Flags = ItemSlotFlags.None;
			this.Slots[i] = slot;
		}
	}
}
