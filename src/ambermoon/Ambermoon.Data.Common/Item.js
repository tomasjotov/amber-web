// Port of Ambermoon.Data.Common/Item.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { hasFlag, toByte } from '../../runtime.js';
import { ItemType } from './Enumerations/ItemType.js';
import { ItemFlags } from './Enumerations/ItemFlags.js';
import { Spell } from './Enumerations/Spells.js';

export class Item {
	constructor() {
		this.Index = 0;
		this.GraphicIndex = 0;
		this.Type = 0;
		this.EquipmentSlot = 0;
		this.BreakChance = 0;
		this.Genders = 0;
		this.NumberOfHands = 0;
		this.NumberOfFingers = 0;
		this.HitPoints = 0;
		this.SpellPoints = 0;
		/** Attribute? */
		this.Attribute = null;
		this.AttributeValue = 0;
		/** Skill? */
		this.Skill = null;
		this.SkillValue = 0;
		this.Defense = 0;
		this.Damage = 0;
		/// <summary>
		/// Used if this is a ammunition.
		/// </summary>
		this.AmmunitionType = 0;
		/// <summary>
		/// Used if this is a long-ranged weapon with ammunition.
		/// </summary>
		this.UsedAmmunitionType = 0;
		this.SkillPenalty1 = 0;
		this.SkillPenalty1Value = 0;
		this.SkillPenalty2 = 0;
		this.SkillPenalty2Value = 0;
		/// <summary>
		/// This value is used for:
		/// - Special item purposes like clock, compass, etc (<see cref="SpecialItemPurpose"/>)
		/// - Transportation (<see cref="Transportation"/>)
		/// - Text index of text scrolls (<see cref="TextIndex"/>)
		/// </summary>
		this.SpecialValue = 0; // special item purpose, transportation, etc
		this.TextSubIndex = 0;
		this.SpellSchool = 0;
		this.SpellIndex = 0;
		this.InitialCharges = 0; // 255 = infinite
		this.InitialRecharges = 0; // initial times of recharging
		this.MaxRecharges = 0; // only used by enchanter
		this.MaxCharges = 0;
		this.RechargePrice = 0; // if 0, use enchanter base price
		this.MagicArmorLevel = 0; // M-B-R
		this.MagicAttackLevel = 0; // M-B-W
		this.Flags = 0;
		this.DefaultSlotFlags = 0;
		this.Classes = 0;
		this.Price = 0;
		this.Weight = 0;
		this.Name = null;
	}

	/// <summary>
	/// Used only for weapons.
	///
	/// Note that this is the same as <see cref="SpecialValue"/>.
	/// </summary>
	get Element() { return this.SpecialValue; }
	set Element(value) { this.SpecialValue = toByte(value); }

	/// <summary>
	/// Used only for special items.
	///
	/// Note that this is the same as <see cref="SpecialValue"/>.
	/// </summary>
	get SpecialItemPurpose() { return this.SpecialValue; }
	set SpecialItemPurpose(value) { this.SpecialValue = toByte(value); }

	/// <summary>
	/// Used only for transportation items.
	///
	/// Note that this is the same as <see cref="SpecialValue"/>.
	/// </summary>
	get Transportation() { return this.SpecialValue; }
	set Transportation(value) { this.SpecialValue = toByte(value); }

	/// <summary>
	/// Used only for text scrolls.
	///
	/// Note that this is the same as <see cref="SpecialValue"/>.
	/// </summary>
	get TextIndex() { return this.SpecialValue; }
	set TextIndex(value) { this.SpecialValue = toByte(value); }

	get Spell() { return this.SpellIndex === 0 ? Spell.None : this.SpellSchool * 30 + this.SpellIndex; }

	get IsUsable() {
		return this.Spell !== Spell.None || this.Type === ItemType.Potion || this.Type === ItemType.SpecialItem || this.Type === ItemType.SpellScroll ||
			this.Type === ItemType.TextScroll || this.Type === ItemType.Tool || this.Type === ItemType.Transportation;
	}

	get IsImportant() { return !hasFlag(this.Flags, ItemFlags.NotImportant) && !hasFlag(this.Flags, ItemFlags.Cloneable); }

	get CanBreak() {
		if (!(this.BreakChance !== 0 && !hasFlag(this.Flags, ItemFlags.Indestructible) &&
			!hasFlag(this.Flags, ItemFlags.DestroyAfterUsage) && !hasFlag(this.Flags, ItemFlags.Stackable)))
			return false;

		switch (this.Type) {
			case ItemType.CloseRangeWeapon: return true;
			case ItemType.LongRangeWeapon: return true;
			case ItemType.Armor: return true;
			case ItemType.Shield: return true;
			case ItemType.Tool: return true;
			case ItemType.NormalItem: return true;
			case ItemType.TextScroll: return true;
			default: return false;
		}
	}

	static Load(index, itemReader, dataReader) {
		const item = new Item();
		item.Index = index;

		itemReader.ReadItem(item, dataReader);

		return item;
	}
}
