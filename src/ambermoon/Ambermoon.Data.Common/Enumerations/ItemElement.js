// Port of Ambermoon.Data.Common/Enumerations/ItemElement.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { EquipmentSlot } from './EquipmentSlot.js';
import { ItemType } from './ItemType.js';
import { AmmunitionType } from './AmmunitionType.js';

export const ItemElement = Object.freeze({
	None: 0,
	Spirit: 1,
	Undead: 3,
	Earth: 4,
	Wind: 5,
	Fire: 6,
	Water: 7
});

export class ItemElementExtensions {
	static GetCharacterWeaponElement(character, itemManager) {
		let element = ItemElement.None;
		const primaryWeaponIndex = character.Equipment.Slots.get(EquipmentSlot.RightHand).ItemIndex;
		const leftHandItemIndex = character.Equipment.Slots.get(EquipmentSlot.LeftHand).ItemIndex;

		if (primaryWeaponIndex === 0 && leftHandItemIndex !== 0) {
			const secondaryWeapon = itemManager.GetItem(leftHandItemIndex);

			if (secondaryWeapon.Type === ItemType.CloseRangeWeapon)
				element = secondaryWeapon.Element;
		} else if (primaryWeaponIndex !== 0) {
			const primaryWeapon = itemManager.GetItem(primaryWeaponIndex);

			element = primaryWeapon.Element;

			// Ammunition overrides the weapon element if it has one.
			if (primaryWeapon.UsedAmmunitionType !== AmmunitionType.None && leftHandItemIndex !== 0) {
				const ammunitionElement = itemManager.GetItem(leftHandItemIndex).Element;

				if (ammunitionElement !== ItemElement.None)
					element = ammunitionElement;
			}
		}

		return element;
	}
}
