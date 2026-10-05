// Port of Ambermoon.Data.Legacy/Serialization/ItemWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ItemFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemFlags.js';

export class ItemWriter {
	static WriteItem(item, dataWriter) {
		const WriteSignedByte = value => dataWriter.WriteByte(value & 0xff);

		dataWriter.WriteByte(item.GraphicIndex % 256);
		dataWriter.WriteEnumAsByte(item.Type);
		dataWriter.WriteEnumAsByte(item.EquipmentSlot);
		dataWriter.WriteByte(item.BreakChance);
		dataWriter.WriteEnumAsByte(item.Genders);
		dataWriter.WriteByte(item.NumberOfHands);
		dataWriter.WriteByte(item.NumberOfFingers);
		WriteSignedByte(item.HitPoints);
		WriteSignedByte(item.SpellPoints);
		if (item.Attribute == null) {
			dataWriter.WriteByte(0);
			dataWriter.WriteByte(0);
		} else {
			dataWriter.WriteEnumAsByte(item.Attribute);
			WriteSignedByte(item.AttributeValue);
		}
		if (item.Skill == null) {
			dataWriter.WriteByte(0);
			dataWriter.WriteByte(0);
		} else {
			dataWriter.WriteEnumAsByte(item.Skill);
			WriteSignedByte(item.SkillValue);
		}
		WriteSignedByte(item.Defense);
		WriteSignedByte(item.Damage);
		dataWriter.WriteEnumAsByte(item.AmmunitionType);
		dataWriter.WriteEnumAsByte(item.UsedAmmunitionType);
		dataWriter.WriteEnumAsByte(item.SkillPenalty1);
		dataWriter.WriteEnumAsByte(item.SkillPenalty2);
		dataWriter.WriteByte(item.SkillPenalty1Value);
		dataWriter.WriteByte(item.SkillPenalty2Value);
		dataWriter.WriteByte(item.SpecialValue);
		dataWriter.WriteByte(item.TextSubIndex);
		dataWriter.WriteEnumAsByte(item.SpellSchool);
		dataWriter.WriteByte(item.SpellIndex);
		dataWriter.WriteByte(item.InitialCharges);
		dataWriter.WriteByte(item.InitialRecharges);
		dataWriter.WriteByte(item.MaxRecharges);
		dataWriter.WriteByte(item.MaxCharges);
		dataWriter.WriteByte(item.RechargePrice);
		WriteSignedByte(item.MagicArmorLevel);
		WriteSignedByte(item.MagicAttackLevel);
		let flags = item.Flags;
		if (item.GraphicIndex >= 256)
			flags |= ItemFlags.ExtendedGraphicIndex;
		dataWriter.WriteEnumAsByte(flags);
		dataWriter.WriteEnumAsByte(item.DefaultSlotFlags);
		dataWriter.WriteEnumAsWord(item.Classes);
		dataWriter.WriteWord(item.Price);
		dataWriter.WriteWord(item.Weight);
		if (item.Name == null)
			dataWriter.Write(new Uint8Array(20));
		else
			dataWriter.WriteWithoutLength(item.Name.substring(0, Math.min(item.Name.length, 19)).padEnd(20, '\0'));
	}
}
