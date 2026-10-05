// Port of Ambermoon.Data.Common/IItemStorage.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// IItemStorage and ITreasureStorage are pure interfaces; only the extension class is ported.
// Slots (ItemSlot[,]) is an array of arrays: Slots[i][j] == C# Slots[i, j].

import { CollectionExtensions } from '../Ambermoon.Common/CollectionExtensions.js';
import { ItemFlags } from './Enumerations/ItemFlags.js';

/** foreach over a C# 2D array (row-major order) */
function* iterate2D(array) {
	for (const row of array)
		for (const item of row)
			yield item;
}

export class ItemStorageExtensions {
	static *GetImportantItems(itemStorage, itemManager) {
		for (const slot of iterate2D(itemStorage.Slots)) {
			if (slot != null && slot.ItemIndex !== 0) {
				const item = itemManager.GetItem(slot.ItemIndex);

				if ((item.Flags & ItemFlags.NotImportant) !== ItemFlags.NotImportant)
					yield slot;
			}
		}
	}

	static *GetImportantItemNames(itemStorage, itemManager) {
		for (const slot of iterate2D(itemStorage.Slots)) {
			if (slot != null && slot.ItemIndex !== 0) {
				const item = itemManager.GetItem(slot.ItemIndex);

				if ((item.Flags & ItemFlags.NotImportant) !== ItemFlags.NotImportant)
					yield item.Name;
			}
		}
	}

	static HasAnyImportantItem(itemStorage, itemManager) {
		for (const slot of iterate2D(itemStorage.Slots)) {
			if (slot != null && slot.ItemIndex !== 0) {
				const item = itemManager.GetItem(slot.ItemIndex);

				if (item.IsImportant)
					return true;
			}
		}

		return false;
	}

	static CanStoreItems(itemStorage, itemManager, itemSlot) {
		const slots = CollectionExtensions.ToList(itemStorage.Slots);

		// Test if we have enough inventory slots to store the items.
		if (!slots.some(s => s.Empty)) {
			const item = itemManager.GetItem(itemSlot.ItemIndex);

			if ((item.Flags & ItemFlags.Stackable) !== ItemFlags.Stackable)
				return false;

			// If no slot is empty but the item is stackable we check
			// if there are slots with the same item and look if the
			// items would fit into these slots.
			let remainingCount = itemSlot.Amount;

			for (const slot of slots.filter(s => s.ItemIndex === itemSlot.ItemIndex))
				remainingCount -= (99 - slot.Amount);

			// TODO: unlimited stack slots (merchants)

			if (remainingCount > 0)
				return false;
		}

		return true;
	}

	static HasEmptySlots(itemStorage) {
		return CollectionExtensions.ToList(itemStorage.Slots).some(slot => slot.Empty);
	}
}
