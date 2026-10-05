// Port of Ambermoon.Data.Common/Equipment.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { EnumHelper } from '../Ambermoon.Common/EnumHelper.js';
import { EquipmentSlot } from './Enumerations/EquipmentSlot.js';
import { ItemSlotFlags } from './Enumerations/ItemSlotFlags.js';
import { ItemSlot } from './ItemSlot.js';

export class Equipment {
	constructor() {
		/** Map<EquipmentSlot, ItemSlot> */
		this.Slots = new Map();

		for (const equipmentSlot of EnumHelper.GetValues(EquipmentSlot)) {
			if (equipmentSlot !== EquipmentSlot.None) {
				const slot = new ItemSlot();
				slot.ItemIndex = 0;
				slot.Amount = 0;
				slot.Flags = ItemSlotFlags.None;
				this.Slots.set(equipmentSlot, slot);
			}
		}
	}
}
