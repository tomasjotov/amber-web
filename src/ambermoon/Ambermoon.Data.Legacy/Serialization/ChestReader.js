// Port of Ambermoon.Data.Legacy/Serialization/ChestReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ItemSlot } from '../../Ambermoon.Data.Common/ItemSlot.js';
import { ItemSlotReader } from './ItemSlotReader.js';

export class ChestReader {
	ReadChest(chest, dataReader) {
		for (let y = 0; y < 4; ++y) {
			for (let x = 0; x < 6; ++x) {
				const itemSlot = new ItemSlot();
				ItemSlotReader.ReadItemSlot(itemSlot, dataReader);
				chest.Slots[x][y] = itemSlot; // C# Slots[x, y]
			}
		}

		chest.Gold = dataReader.ReadWord();
		chest.Food = dataReader.ReadWord();
	}
}
