// Port of Ambermoon.Data.Legacy/Characters/CharacterReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentOutOfRangeException, Exception, toShort } from '../../../runtime.js';
import { Monster } from '../../Ambermoon.Data.Common/Monster.js';
import { PartyMember } from '../../Ambermoon.Data.Common/PartyMember.js';
import { Inventory } from '../../Ambermoon.Data.Common/Inventory.js';
import { CharacterType } from '../../Ambermoon.Data.Common/Enumerations/CharacterType.js';
import { EquipmentSlot } from '../../Ambermoon.Data.Common/Enumerations/EquipmentSlot.js';
import { ItemSlotReader } from '../Serialization/ItemSlotReader.js';

// Enum.GetValues: all values ordered by their unsigned value
const getValues = enumObject => Object.values(enumObject).sort((a, b) => (a >>> 0) - (b >>> 0));

export class CharacterReader {
	ReadCharacter(character, dataReader) {
		dataReader.Position = 0;

		if (dataReader.ReadByte() !== (character.Type & 0xff))
			throw new Exception('Wrong character type.');

		character.Gender = dataReader.ReadByte();
		character.Race = dataReader.ReadByte();
		character.Class = dataReader.ReadByte();
		character.SpellMastery = dataReader.ReadByte();
		character.Level = dataReader.ReadByte();
		character.NumberOfOccupiedHands = dataReader.ReadByte();
		character.NumberOfOccupiedFingers = dataReader.ReadByte();
		character.SpokenLanguages = dataReader.ReadByte();
		character.InventoryInaccessible = dataReader.ReadByte() !== 0;
		character.PortraitIndex = dataReader.ReadByte();
		if (character instanceof Monster)
			character.AdvancedMonsterFlags = dataReader.ReadByte();
		else
			character.JoinPercentage = dataReader.ReadByte();
		this.ProcessIfMonster(dataReader, character, (monster, value) => monster.CombatGraphicIndex = value);
		if (character instanceof Monster)
			character.SpellChancePercentage = dataReader.ReadByte();
		else
			character.SpokenExtendedLanguages = dataReader.ReadByte();
		character.MagicHitBonus = dataReader.ReadByte();
		this.ProcessIfMonsterOrPartyMember(dataReader, character, (monster, value) => monster.Morale = value,
			(partyMember, value) => partyMember.MaxReachedLevel = value);
		character.SpellTypeImmunity = dataReader.ReadByte();
		character.AttacksPerRound = dataReader.ReadByte();
		character.BattleFlags = dataReader.ReadByte();
		character.Element = dataReader.ReadByte();
		character.SpellLearningPoints = dataReader.ReadWord();
		character.TrainingPoints = dataReader.ReadWord();
		character.Gold = dataReader.ReadWord();
		character.Food = dataReader.ReadWord();
		character.CharacterBitIndex = dataReader.ReadWord();
		character.Conditions = dataReader.ReadWord();
		this.ProcessIfMonster(dataReader, character, (monster, value) => monster.DefeatExperience = value, true);
		character.BattleRoundSpellPointUsage = dataReader.ReadWord(); // Unknown
		// mark of return location is stored here: word x, word y, word mapIndex
		this.ProcessIfPartyMember(dataReader, character, (member, value) => member.MarkOfReturnX = value);
		this.ProcessIfPartyMember(dataReader, character, (member, value) => member.MarkOfReturnY = value);
		this.ProcessIfPartyMember(dataReader, character, (member, value) => member.MarkOfReturnMapIndex = value);
		for (const attribute of character.Attributes) // Note: this includes Age and the 10th unused attribute
		{
			attribute.CurrentValue = dataReader.ReadWord();
			attribute.MaxValue = dataReader.ReadWord();
			attribute.BonusValue = toShort(dataReader.ReadWord());
			attribute.StoredValue = dataReader.ReadWord();
		}
		for (const skill of character.Skills) {
			skill.CurrentValue = dataReader.ReadWord();
			skill.MaxValue = dataReader.ReadWord();
			skill.BonusValue = toShort(dataReader.ReadWord());
			skill.StoredValue = dataReader.ReadWord();
		}
		character.HitPoints.CurrentValue = dataReader.ReadWord();
		character.HitPoints.MaxValue = dataReader.ReadWord();
		character.HitPoints.BonusValue = toShort(dataReader.ReadWord());
		character.SpellPoints.CurrentValue = dataReader.ReadWord();
		character.SpellPoints.MaxValue = dataReader.ReadWord();
		character.SpellPoints.BonusValue = toShort(dataReader.ReadWord());
		character.BaseDefense = toShort(dataReader.ReadWord());
		character.BonusDefense = toShort(dataReader.ReadWord());
		character.BaseAttackDamage = toShort(dataReader.ReadWord());
		character.BonusAttackDamage = toShort(dataReader.ReadWord());
		character.MagicAttack = toShort(dataReader.ReadWord());
		character.MagicDefense = toShort(dataReader.ReadWord());
		character.AttacksPerRoundIncreaseLevels = dataReader.ReadWord();
		character.HitPointsPerLevel = dataReader.ReadWord();
		character.SpellPointsPerLevel = dataReader.ReadWord();
		character.SpellLearningPointsPerLevel = dataReader.ReadWord();
		character.TrainingPointsPerLevel = dataReader.ReadWord();
		character.LookAtCharTextIndex = dataReader.ReadWord();
		character.ExperiencePoints = dataReader.ReadDword();
		character.LearnedHealingSpells = dataReader.ReadDword();
		character.LearnedAlchemisticSpells = dataReader.ReadDword();
		character.LearnedMysticSpells = dataReader.ReadDword();
		character.LearnedDestructionSpells = dataReader.ReadDword();
		character.LearnedSpellsType5 = dataReader.ReadDword();
		character.LearnedSpellsType6 = dataReader.ReadDword();
		character.LearnedSpellsType7 = dataReader.ReadDword();
		character.TotalWeight = dataReader.ReadDword();
		character.Name = dataReader.ReadString(16);

		const terminatingNullIndex = character.Name.indexOf('\0');

		if (terminatingNullIndex !== 0) {
			if (terminatingNullIndex < 0) // string.Substring(0, -1) throws in C#
				throw new ArgumentOutOfRangeException('length');
			character.Name = character.Name.substring(0, terminatingNullIndex).trimEnd();
		}
		else
			character.Name = character.Name.trimEnd();

		if (!(character instanceof Monster) && character.LookAtCharTextIndex === 0xffff)
			character.LookAtCharTextIndex = 0; // fallback to text index 0, as there are some flawed characters

		if (character.Type !== CharacterType.NPC) {
			// Equipment
			for (const equipmentSlot of getValues(EquipmentSlot)) {
				if (equipmentSlot !== EquipmentSlot.None)
					ItemSlotReader.ReadItemSlot(character.Equipment.Slots.get(equipmentSlot), dataReader);
			}

			// Inventory
			for (let i = 0; i < Inventory.Width * Inventory.Height; ++i)
				ItemSlotReader.ReadItemSlot(character.Inventory.Slots[i], dataReader);
		}
	}

	/**
	 * Note: C# has two overloads (Action<Monster, byte> and Action<Monster, ushort>) which can't be
	 * distinguished at runtime. The 4th parameter selects the ushort overload.
	 */
	ProcessIfMonster(reader, character, processor, wordValue = false) {
		if (wordValue) {
			if (character instanceof Monster)
				processor(character, reader.ReadWord());
			else
				reader.Position += 2;
		}
		else {
			if (character instanceof Monster)
				processor(character, reader.ReadByte());
			else
				reader.Position += 1;
		}
	}

	ProcessIfPartyMember(reader, character, processor) {
		if (character instanceof PartyMember)
			processor(character, reader.ReadWord());
		else
			reader.Position += 2;
	}

	ProcessIfMonsterOrPartyMember(reader, character, monsterProcessor, partyMemberProcessor) {
		if (character instanceof Monster)
			monsterProcessor(character, reader.ReadByte());
		else if (character instanceof PartyMember)
			partyMemberProcessor(character, reader.ReadByte());
		else
			reader.Position += 1;
	}
}
