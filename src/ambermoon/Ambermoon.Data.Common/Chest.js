// Port of Ambermoon.Data.Common/Chest.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { newArray2D } from '../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';

export const ChestType = Object.freeze({
	/// <summary>
	/// Normal chest. You can put items, gold and rations into it.
	/// </summary>
	Chest: 0,
	/// <summary>
	/// Junk pile or item pickups. You can not put items into it but no gold or rations.
	/// </summary>
	Junk: 1
});

export class Chest {
	static SlotsPerRow = 6;
	static SlotRows = 4;

	constructor() {
		this.Type = ChestType.Chest;
		/** C# ItemSlot[SlotsPerRow, SlotRows] -> jagged array Slots[column][row] */
		this.Slots = newArray2D(Chest.SlotsPerRow, Chest.SlotRows);
		this.Gold = 0;
		this.Food = 0;
		this.AllowsItemDrop = true;
		this.IsBattleLoot = false;
	}

	get Empty() {
		return this.Gold === 0 && this.Food === 0 && !this.Slots.flat().some(s => s.Amount !== 0);
	}

	static Load(chestReader, dataReader) {
		const chest = new Chest();

		chestReader.ReadChest(chest, dataReader);

		return chest;
	}

	ResetItem(slot, item) {
		const column = slot % Chest.SlotsPerRow;
		const row = Math.trunc(slot / Chest.SlotsPerRow);

		if (this.Slots[column][row].Add(item) !== 0)
			throw new AmbermoonException(ExceptionScope.Application, 'Unable to reset chest item.');
	}

	GetSlot(slot) {
		return this.Slots[slot % Chest.SlotsPerRow][Math.trunc(slot / Chest.SlotsPerRow)];
	}

	Equals(other, includeChargesAndFlags = true) {
		if (other == null)
			return false;

		if (other === this)
			return true;

		if (this.Gold !== other.Gold || this.Food !== other.Food)
			return false;

		for (let y = 0; y < Chest.SlotRows; ++y) {
			for (let x = 0; x < Chest.SlotsPerRow; ++x) {
				if (!this.Slots[x][y].Equals(other.Slots[x][y], includeChargesAndFlags))
					return false;
			}
		}

		return true;
	}
}
