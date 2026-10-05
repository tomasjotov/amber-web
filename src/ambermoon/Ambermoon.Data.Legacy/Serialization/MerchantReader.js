// Port of Ambermoon.Data.Legacy/Serialization/MerchantReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ItemSlot } from '../../Ambermoon.Data.Common/ItemSlot.js';
import { ItemSlotReader } from './ItemSlotReader.js';

export class MerchantReader {
	ReadMerchant(merchant, dataReader) {
		for (let y = 0; y < 4; ++y) {
			for (let x = 0; x < 6; ++x) {
				const itemSlot = new ItemSlot();
				ItemSlotReader.ReadItemSlot(itemSlot, dataReader);
				merchant.Slots[x][y] = itemSlot; // C# Slots[x, y]
			}
		}
	}
}
