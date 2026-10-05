// Port of Ambermoon.Data.Legacy/Characters/CharacterWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Monster } from '../../Ambermoon.Data.Common/Monster.js';
import { PartyMember } from '../../Ambermoon.Data.Common/PartyMember.js';
import { Inventory } from '../../Ambermoon.Data.Common/Inventory.js';
import { CharacterType } from '../../Ambermoon.Data.Common/Enumerations/CharacterType.js';
import { EquipmentSlot } from '../../Ambermoon.Data.Common/Enumerations/EquipmentSlot.js';
import { ItemSlotWriter } from '../Serialization/ItemSlotWriter.js';

// Enum.GetValues: all values ordered by their unsigned value
const getValues = enumObject => Object.values(enumObject).sort((a, b) => (a >>> 0) - (b >>> 0));

// Note: IDataWriter.Write(byte/ushort/uint) can't be distinguished in JS. The DataWriter port provides
// WriteByte / WriteWord / WriteDword for this.
const writeByte = (writer, value) => writer.WriteByte(value & 0xff);
const writeWord = (writer, value) => writer.WriteWord(value & 0xffff);
const writeDword = (writer, value) => writer.WriteDword(value >>> 0);

export class CharacterWriter {
	WriteCharacter(character, dataWriter) {
		writeByte(dataWriter, character.Type);
		writeByte(dataWriter, character.Gender);
		writeByte(dataWriter, character.Race);
		writeByte(dataWriter, character.Class);
		writeByte(dataWriter, character.SpellMastery);
		writeByte(dataWriter, character.Level);
		writeByte(dataWriter, character.NumberOfOccupiedHands);
		writeByte(dataWriter, character.NumberOfOccupiedFingers);
		writeByte(dataWriter, character.SpokenLanguages);
		writeByte(dataWriter, character.InventoryInaccessible ? 0xff : 0);
		writeByte(dataWriter, character.PortraitIndex);
		if (character instanceof Monster)
			writeByte(dataWriter, character.AdvancedMonsterFlags);
		else
			writeByte(dataWriter, character.JoinPercentage);
		writeByte(dataWriter, this.GetIfMonster(character, monster => monster.CombatGraphicIndex & 0xff, 0));
		if (character instanceof Monster)
			writeByte(dataWriter, character.SpellChancePercentage);
		else
			writeByte(dataWriter, character.SpokenExtendedLanguages);
		writeByte(dataWriter, character.MagicHitBonus);
		writeByte(dataWriter, this.GetIfMonsterOrPartyMember(character, monster => monster.Morale & 0xff, partyMember => partyMember.MaxReachedLevel, 0));
		writeByte(dataWriter, character.SpellTypeImmunity);
		writeByte(dataWriter, character.AttacksPerRound);
		writeByte(dataWriter, character.BattleFlags);
		writeByte(dataWriter, character.Element);
		writeWord(dataWriter, character.SpellLearningPoints);
		writeWord(dataWriter, character.TrainingPoints);
		writeWord(dataWriter, character.Gold);
		writeWord(dataWriter, character.Food);
		writeWord(dataWriter, character.CharacterBitIndex);
		writeWord(dataWriter, character.Conditions);
		writeWord(dataWriter, this.GetIfMonster(character, monster => monster.DefeatExperience, 0));
		writeWord(dataWriter, character.BattleRoundSpellPointUsage);
		writeWord(dataWriter, this.GetIfPartyMember(character, member => member.MarkOfReturnX, 0));
		writeWord(dataWriter, this.GetIfPartyMember(character, member => member.MarkOfReturnY, 0));
		writeWord(dataWriter, this.GetIfPartyMember(character, member => member.MarkOfReturnMapIndex, 0));
		for (const attribute of character.Attributes) // Note: this includes Age and the 10th unused attribute
		{
			writeWord(dataWriter, attribute.CurrentValue);
			writeWord(dataWriter, attribute.MaxValue);
			writeWord(dataWriter, attribute.BonusValue);
			writeWord(dataWriter, attribute.StoredValue);
		}
		for (const skill of character.Skills) {
			writeWord(dataWriter, skill.CurrentValue);
			writeWord(dataWriter, skill.MaxValue);
			writeWord(dataWriter, skill.BonusValue);
			writeWord(dataWriter, skill.StoredValue);
		}
		writeWord(dataWriter, character.HitPoints.CurrentValue);
		writeWord(dataWriter, character.HitPoints.MaxValue);
		writeWord(dataWriter, character.HitPoints.BonusValue);
		writeWord(dataWriter, character.SpellPoints.CurrentValue);
		writeWord(dataWriter, character.SpellPoints.MaxValue);
		writeWord(dataWriter, character.SpellPoints.BonusValue);
		writeWord(dataWriter, character.BaseDefense);
		writeWord(dataWriter, character.BonusDefense);
		writeWord(dataWriter, character.BaseAttackDamage);
		writeWord(dataWriter, character.BonusAttackDamage);
		writeWord(dataWriter, character.MagicAttack);
		writeWord(dataWriter, character.MagicDefense);
		writeWord(dataWriter, character.AttacksPerRoundIncreaseLevels);
		writeWord(dataWriter, character.HitPointsPerLevel);
		writeWord(dataWriter, character.SpellPointsPerLevel);
		writeWord(dataWriter, character.SpellLearningPointsPerLevel);
		writeWord(dataWriter, character.TrainingPointsPerLevel);
		writeWord(dataWriter, character.LookAtCharTextIndex);
		writeDword(dataWriter, character.ExperiencePoints);
		writeDword(dataWriter, character.LearnedHealingSpells);
		writeDword(dataWriter, character.LearnedAlchemisticSpells);
		writeDword(dataWriter, character.LearnedMysticSpells);
		writeDword(dataWriter, character.LearnedDestructionSpells);
		writeDword(dataWriter, character.LearnedSpellsType5);
		writeDword(dataWriter, character.LearnedSpellsType6);
		writeDword(dataWriter, character.LearnedSpellsType7);
		writeDword(dataWriter, character.TotalWeight);
		const serializedCharacterName = character.Name.length === 16
			? character.Name.substring(0, 15) + '\0'
			: character.Name.padEnd(16, '\0');
		dataWriter.WriteWithoutLength(serializedCharacterName);

		if (character.Type !== CharacterType.NPC) {
			// Equipment
			for (const equipmentSlot of getValues(EquipmentSlot)) {
				if (equipmentSlot !== EquipmentSlot.None)
					ItemSlotWriter.WriteItemSlot(character.Equipment.Slots.get(equipmentSlot), dataWriter);
			}

			// Inventory
			for (let i = 0; i < Inventory.Width * Inventory.Height; ++i)
				ItemSlotWriter.WriteItemSlot(character.Inventory.Slots[i], dataWriter);
		}
	}

	GetIfMonster(character, valueProvider, nonMonsterValue) {
		return character instanceof Monster ? valueProvider(character) : nonMonsterValue;
	}

	GetIfPartyMember(character, valueProvider, nonPartyMemberValue) {
		return character instanceof PartyMember ? valueProvider(character) : nonPartyMemberValue;
	}

	GetIfMonsterOrPartyMember(character, monsterValueProvider, partyMemberValueProvider, defaultValue) {
		if (character instanceof Monster)
			return monsterValueProvider(character);
		if (character instanceof PartyMember)
			return partyMemberValueProvider(character);
		return defaultValue;
	}
}
