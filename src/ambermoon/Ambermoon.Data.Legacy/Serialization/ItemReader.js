// Port of Ambermoon.Data.Legacy/Serialization/ItemReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ItemFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemFlags.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { toSByte } from '../../../runtime.js';

/** string.TrimEnd(' ', '\0') */
function trimEndSpaceAndNull(s) {
	return s.replace(/[ \0]+$/, '');
}

export class ItemReader {
	ReadItem(item, dataReader) {
		item.GraphicIndex = dataReader.ReadByte();
		item.Type = dataReader.ReadByte();
		item.EquipmentSlot = dataReader.ReadByte();
		item.BreakChance = dataReader.ReadByte();
		item.Genders = dataReader.ReadByte();
		item.NumberOfHands = dataReader.ReadByte();
		item.NumberOfFingers = dataReader.ReadByte();
		item.HitPoints = toSByte(dataReader.ReadByte());
		item.SpellPoints = toSByte(dataReader.ReadByte());
		const attribute = dataReader.ReadByte();
		const attributeValue = toSByte(dataReader.ReadByte());
		if (attributeValue !== 0) {
			item.Attribute = attribute;
			item.AttributeValue = attributeValue;
		}
		const skill = dataReader.ReadByte();
		const skillValue = toSByte(dataReader.ReadByte());
		if (skillValue !== 0) {
			item.Skill = skill;
			item.SkillValue = skillValue;
		}
		item.Defense = toSByte(dataReader.ReadByte());
		item.Damage = toSByte(dataReader.ReadByte());
		item.AmmunitionType = dataReader.ReadByte();
		item.UsedAmmunitionType = dataReader.ReadByte();
		// TODO: There are 4 items in Ambermoon which use this:
		// - Whip: 01 00 0A 00
		// - Banded Armour: 00 00 04 00
		// - Plate Armour: 00 00 06 00
		// - Knight's Armour: 00 00 08 00
		// Only the whip has an effect of -10 Attack skill
		// as for the other 3 the first or second byte is 0.
		// Either the data is wrong or the original code.
		// But it's hard to reverse engineer the meaning this way.
		item.SkillPenalty1 = dataReader.ReadByte();
		item.SkillPenalty2 = dataReader.ReadByte();
		item.SkillPenalty1Value = dataReader.ReadByte();
		item.SkillPenalty2Value = dataReader.ReadByte();
		item.SpecialValue = dataReader.ReadByte();
		item.TextSubIndex = dataReader.ReadByte();
		item.SpellSchool = dataReader.ReadByte();
		item.SpellIndex = dataReader.ReadByte();
		item.InitialCharges = dataReader.ReadByte();
		item.InitialRecharges = dataReader.ReadByte();
		item.MaxRecharges = dataReader.ReadByte();
		item.MaxCharges = dataReader.ReadByte();
		item.RechargePrice = dataReader.ReadByte();
		item.MagicArmorLevel = toSByte(dataReader.ReadByte());
		item.MagicAttackLevel = toSByte(dataReader.ReadByte());
		item.Flags = dataReader.ReadByte();
		item.DefaultSlotFlags = dataReader.ReadByte();
		item.Classes = dataReader.ReadWord();
		item.Price = dataReader.ReadWord();
		item.Weight = dataReader.ReadWord();
		item.Name = trimEndSpaceAndNull(dataReader.ReadString(19));

		if (dataReader.ReadByte() !== 0) // end of item
			throw new AmbermoonException(ExceptionScope.Data, 'Invalid item data.');

		if ((item.Flags & ItemFlags.ExtendedGraphicIndex) === ItemFlags.ExtendedGraphicIndex)
			item.GraphicIndex += 256;
	}
}
