// Port of Ambermoon.Data.Common/Enumerations/ItemType.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { EquipmentSlot } from './EquipmentSlot.js';
import { ItemFlags } from './ItemFlags.js';

export const ItemType = Object.freeze({
	None: 0,
	Armor: 1,
	Headgear: 2,
	Footgear: 3,
	Shield: 4,
	CloseRangeWeapon: 5,
	LongRangeWeapon: 6,
	Ammunition: 7,
	TextScroll: 8,
	SpellScroll: 9,
	Potion: 10,
	Amulet: 11,
	Brooch: 12,
	Ring: 13,
	Gem: 14,
	Tool: 15,
	Key: 16,
	NormalItem: 17, // collectable / loot
	MagicalItem: 18, // lantern, torch, etc
	SpecialItem: 19, // clock, monster eye, compass, etc
	Transportation: 20, // witch broom, flute, magical flying disc, etc
	Condition: 21
});

const EquipmentItemFlags = ItemFlags.Accursed | ItemFlags.Cloneable |
	ItemFlags.Indestructible | ItemFlags.NotImportant |
	ItemFlags.RemovableDuringFight;
const NormalItemFlags = ItemFlags.Cloneable | ItemFlags.NotImportant |
	ItemFlags.Stackable | ItemFlags.DestroyAfterUsage;

export class ItemTypeExtensions {
	static IsEquipment(itemType) {
		switch (itemType) {
			case ItemType.Armor:
			case ItemType.Headgear:
			case ItemType.Footgear:
			case ItemType.Shield:
			case ItemType.CloseRangeWeapon:
			case ItemType.LongRangeWeapon:
			case ItemType.Ammunition:
			case ItemType.Amulet:
			case ItemType.Brooch:
			case ItemType.Ring:
				return true;
			default:
				return false;
		}
	}

	static UsesHandCount(itemType) {
		switch (itemType) {
			case ItemType.Shield:
			case ItemType.CloseRangeWeapon:
			case ItemType.LongRangeWeapon:
			case ItemType.Ammunition:
				return true;
			default:
				return false;
		}
	}

	static UsesFingerCount(itemType) {
		return itemType === ItemType.Ring;
	}

	static IsBreakable(itemType) {
		switch (itemType) {
			case ItemType.Armor:
			case ItemType.CloseRangeWeapon:
			case ItemType.LongRangeWeapon:
			case ItemType.Shield:
			case ItemType.Tool:
			case ItemType.TextScroll:
			case ItemType.NormalItem:
				return true;
			default:
				return false;
		}
	}

	static ToEquipmentSlot(itemType) {
		switch (itemType) {
			case ItemType.Armor: return EquipmentSlot.Body;
			case ItemType.Headgear: return EquipmentSlot.Head;
			case ItemType.Footgear: return EquipmentSlot.Feet;
			case ItemType.Shield: return EquipmentSlot.LeftHand;
			case ItemType.CloseRangeWeapon: return EquipmentSlot.RightHand;
			case ItemType.LongRangeWeapon: return EquipmentSlot.RightHand;
			case ItemType.Ammunition: return EquipmentSlot.LeftHand;
			case ItemType.Amulet: return EquipmentSlot.Neck;
			case ItemType.Brooch: return EquipmentSlot.Chest;
			case ItemType.Ring: return EquipmentSlot.RightFinger;
			default: return EquipmentSlot.None;
		}
	}

	static AllowedFlags(itemType) {
		switch (itemType) {
			case ItemType.Armor: return EquipmentItemFlags;
			case ItemType.Headgear: return EquipmentItemFlags;
			case ItemType.Footgear: return EquipmentItemFlags;
			case ItemType.Shield: return EquipmentItemFlags;
			case ItemType.CloseRangeWeapon: return EquipmentItemFlags;
			case ItemType.LongRangeWeapon: return EquipmentItemFlags;
			case ItemType.Ammunition: return EquipmentItemFlags | ItemFlags.Stackable;
			case ItemType.Amulet: return EquipmentItemFlags;
			case ItemType.Brooch: return EquipmentItemFlags;
			case ItemType.Ring: return EquipmentItemFlags;
			case ItemType.Transportation: return ItemFlags.NotImportant;
			case ItemType.Condition: return ItemFlags.None;
			case ItemType.TextScroll: return ItemFlags.NotImportant | ItemFlags.Stackable | ItemFlags.Indestructible;
			case ItemType.Tool: return EquipmentItemFlags | ItemFlags.DestroyAfterUsage;
			case ItemType.NormalItem: return NormalItemFlags | ItemFlags.Indestructible;
			case ItemType.SpecialItem: return ItemFlags.NotImportant | ItemFlags.DestroyAfterUsage | ItemFlags.Cloneable;
			default: return NormalItemFlags;
		}
	}
}
