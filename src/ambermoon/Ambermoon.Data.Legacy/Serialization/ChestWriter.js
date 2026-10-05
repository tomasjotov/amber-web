// Port of Ambermoon.Data.Legacy/Serialization/ChestWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ItemSlotWriter } from './ItemSlotWriter.js';

export class ChestWriter {
	WriteChest(chest, dataWriter) {
		for (let y = 0; y < 4; ++y) {
			for (let x = 0; x < 6; ++x) {
				ItemSlotWriter.WriteItemSlot(chest.Slots[x][y], dataWriter); // C# Slots[x, y]
			}
		}

		dataWriter.WriteWord(chest.Gold);
		dataWriter.WriteWord(chest.Food);
	}
}
