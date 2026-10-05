// Port of Ambermoon.Data.Legacy/Serialization/MerchantWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ItemSlotWriter } from './ItemSlotWriter.js';

export class MerchantWriter {
	WriteMerchant(merchant, dataWriter) {
		for (let y = 0; y < 4; ++y) {
			for (let x = 0; x < 6; ++x) {
				ItemSlotWriter.WriteItemSlot(merchant.Slots[x][y], dataWriter); // C# Slots[x, y]
			}
		}
	}
}
