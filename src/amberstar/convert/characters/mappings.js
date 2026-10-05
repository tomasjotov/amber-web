// Mapping of the Amberstar enumerations (classes, races, skills, attributes, languages, conditions,
// spells, item types, ...) to the Ambermoon ones. See ../characters.js for the overview.
//
// Amberstar values are the raw values of the data files (see ../../../../amberstar/src/data/characters.js
// and ../../../../Amberstar-main/FileSpecs/CharData.md, Items.md, Spells.md).
import { Class, ClassFlag } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Class.js';
import { Race } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Race.js';
import { Skill } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Skill.js';
import { Attribute } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Attribute.js';
import { Language } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Language.js';
import { Condition } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Condition.js';
import { Spell } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Spells.js';
import { SpellTypeMastery } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/SpellSchool.js';
import { ItemType } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/ItemType.js';
import { GenderFlag } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Gender.js';
import { CharacterElement } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/CharacterElement.js';
import { BattleFlags } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/BattleFlags.js';

// ---------------------------------------------------------------------------------------------
// Classes
//
// Amberstar: 0 None ("nothing", must join a guild), 1 Warrior, 2 Paladin, 3 Ranger, 4 Thief, 5 Monk,
// 6 White wizard, 7 Grey wizard, 8 Black wizard, 9 Animal ("special"), 10 Monster.
//
//  None         -> Adventurer  (the Ambermoon class without specialization; the engine has no class change,
//                               so the Amberstar guild membership can not be changed later, see places.js)
//  Warrior      -> Warrior
//  Paladin      -> Paladin     (both use healing magic)
//  Ranger       -> Ranger
//  Thief        -> Thief
//  Monk         -> Mystic      (Amberstar monks like Melchior learn grey magic; Mystic is the Ambermoon class
//                               between fighter and magician)
//  White wizard -> Healer      (white magic = healing, curing, holy spells)
//  Grey wizard  -> Alchemist   (grey magic = light, protection, weapon power, anti-magic, haste... = alchemistic)
//  Black wizard -> Mage        (black magic = elemental destruction spells)
//  Animal       -> Animal, Monster -> Monster
// ---------------------------------------------------------------------------------------------
export const ClassMapping = [
	Class.Adventurer, Class.Warrior, Class.Paladin, Class.Ranger, Class.Thief, Class.Mystic,
	Class.Healer, Class.Alchemist, Class.Mage, Class.Animal, Class.Monster,
];

export function mapClass(amberstarClass) {
	return ClassMapping[amberstarClass] ?? Class.Monster;
}

/** Amberstar class bit field (bit n = Amberstar class n) -> Ambermoon ClassFlag. */
export function mapClassFlags(amberstarClasses) {
	if ((amberstarClasses & 0x7fff) === 0x7fff)
		return ClassFlag.All;
	let flags = 0;
	for (let c = 0; c < ClassMapping.length; c++) {
		if (amberstarClasses & (1 << c))
			flags |= 1 << ClassMapping[c];
	}
	return flags;
}

/** The spell schools (SpellTypeMastery) a class can use in Ambermoon. */
export function classSpellMastery(ambermoonClass) {
	switch (ambermoonClass) {
		case Class.Adventurer: return SpellTypeMastery.Alchemistic;
		case Class.Paladin: return SpellTypeMastery.Healing;
		case Class.Ranger: return SpellTypeMastery.Mystic;
		case Class.Healer: return SpellTypeMastery.Healing;
		case Class.Alchemist: return SpellTypeMastery.Alchemistic;
		case Class.Mystic: return SpellTypeMastery.Mystic;
		case Class.Mage: return SpellTypeMastery.Destruction;
		default: return SpellTypeMastery.None;
	}
}

// ---------------------------------------------------------------------------------------------
// Races: Human, Elf, Dwarf, Gnome and Half-elf exist in both games. Halfling and Half-orc do not exist
// in Ambermoon and use the unused race values 9 and 10 (named by the data name provider overrides).
// The engine only checks Race < Animal (horse/inn costs) and Race.Animal/Monster.
// ---------------------------------------------------------------------------------------------
export const RaceHalfling = Race.Unknown9;
export const RaceHalfOrc = Race.Unknown10;

export function mapRace(amberstarRace) {
	switch (amberstarRace) {
		case 0: return Race.Human;
		case 1: return Race.Elf;
		case 2: return Race.Dwarf;
		case 3: return Race.Gnome;
		case 4: return RaceHalfling;
		case 5: return Race.HalfElf;
		case 6: return RaceHalfOrc;
		case 13: return Race.Animal;
		case 14: return Race.Monster;
		default: return Race.Monster;
	}
}

// ---------------------------------------------------------------------------------------------
// Skills: the Amberstar skills have the same order as the Ambermoon skills, only "Listen" (index 3)
// takes the place of Ambermoon's "Critical hit". Listening is not supported by the engine, so the
// critical hit skill gets 0 as current value (Amberstar listen values of 30-90% would be far too high
// as a critical hit chance) but keeps the maximum value. Item bonuses on listening are dropped.
// Amberstar skill indices here are 0-based (Attack = 0).
// ---------------------------------------------------------------------------------------------
export const AmberstarSkillListen = 3;

export function mapSkill(amberstarSkill0) {
	if (amberstarSkill0 == null || amberstarSkill0 < 0 || amberstarSkill0 > 9 || amberstarSkill0 === AmberstarSkillListen)
		return null;
	return amberstarSkill0; // Attack, Parry, Swim, -, FindTraps, DisarmTraps, LockPicking, Searching, ReadMagic, UseMagic
}

// Attributes: same order in both games (Strength, Intelligence, Dexterity, Speed, Stamina/Constitution,
// Charisma, Luck, Anti-magic, Age). Amberstar indices here are 0-based.
export function mapAttribute(amberstarAttribute0) {
	if (amberstarAttribute0 == null || amberstarAttribute0 < 0 || amberstarAttribute0 > Attribute.Age)
		return null;
	return amberstarAttribute0;
}

// ---------------------------------------------------------------------------------------------
// Languages: Human, Elf, Dwarf, Gnome have the same bits. Halfling (0x10) uses the Sylphic bit, Orcish
// (0x20) the Felinic bit (both renamed by the name overrides) and Animal (0x40) -> Animal (0x80).
// ---------------------------------------------------------------------------------------------
export function mapLanguages(amberstarLanguages) {
	let result = amberstarLanguages & 0x3f;
	if (amberstarLanguages & 0x40)
		result |= Language.Animal;
	return result;
}

/** Bit index of an Amberstar language bit (0..6) -> Ambermoon language bit index. */
export function mapLanguageBit(bit) {
	return bit === 6 ? 7 : bit;
}

// ---------------------------------------------------------------------------------------------
// Conditions: Amberstar stores physical conditions in the high byte and mental conditions in the low
// byte. This gives exactly the Ambermoon Condition bits: Irritated, Crazy (mad), Sleep, Panic, Blind,
// Lamed (stunned), Poisoned, Petrified, Diseased, Aging, DeadCorpse, DeadAshes, DeadDust.
// The Amberstar "overloaded" condition (0x20) is computed from the weight in Ambermoon and dropped
// (0x20 is "drugged" in Ambermoon).
// ---------------------------------------------------------------------------------------------
export function mapConditions(physical, mental) {
	return (((physical & 0xff) << 8) | (mental & 0x1f)) & 0xffff;
}

/** Bit index (0..15) of the combined Amberstar condition word -> Ambermoon condition bit index or null. */
export function mapConditionBit(bit) {
	return bit === 5 || bit === 6 || bit === 7 ? null : bit;
}

// ---------------------------------------------------------------------------------------------
// Spells. Amberstar spell schools: 1 white, 2 grey, 3 black, 7 special (items and monsters).
// Each Amberstar spell is mapped to the Ambermoon spell with the closest effect. Ambermoon spells of
// another school than the caster class school are fine (the engine lists all learned spells), only
// spell scrolls are restricted to the class school.
// ---------------------------------------------------------------------------------------------
const WhiteSpells = [
	Spell.None,
	Spell.HealingHand, // 1 Healing 1
	Spell.SmallHealing, // 2 Healing 2
	Spell.MediumHealing, // 3 Healing 3
	Spell.GreatHealing, // 4 Healing 4
	Spell.GreatHealing, // 5 Healing 5 (no stronger single target healing in Ambermoon)
	Spell.MassHealing, // 6 Salvation (heals all)
	Spell.WakeTheDead, // 7 Reincarnation
	Spell.ChangeAshes, // 8 Conversion of ashes
	Spell.ChangeDust, // 9 Conversion of dust
	Spell.NeutralizePoison, // 10 Neutralise poison
	Spell.RemoveLamedness, // 11 Heal stun (stunned -> lamed)
	Spell.RemoveDisease, // 12 Heal sickness
	Spell.HealAging, // 13 Rejuvenation
	Spell.StoneToFlesh, // 14 De-petrification
	Spell.WakeUp, // 15 Wake up
	Spell.RemovePanic, // 16 Calm panic
	Spell.RemoveIrritation, // 17 Remove irritation
	Spell.RemoveBlindness, // 18 Heal blindness
	Spell.RemoveMadness, // 19 Heal madness
	Spell.Lame, // 20 Stun
	Spell.Sleep, // 21 Sleep
	Spell.Fear, // 22 Fear
	Spell.Irritate, // 23 Irritation
	Spell.Blind, // 24 Blind
	Spell.DestroyUndead, // 25 Destroy undead
	Spell.HolyWord, // 26 Holy word
	Spell.RemoveCurses, // 27 Remove curse
	Spell.CreateFood, // 28 Provide food
];

const GreySpells = [
	Spell.None,
	Spell.Light, // 1 Light 1
	Spell.MagicalLantern, // 2 Light 2
	Spell.MagicalSun, // 3 Light 3
	Spell.MagicalShield, // 4 Armour protection 1
	Spell.MagicalWall, // 5 Armour protection 2
	Spell.MagicalBarrier, // 6 Armour protection 3
	Spell.MagicalWeapon, // 7 Weapons power 1
	Spell.MagicalAssault, // 8 Weapons power 2
	Spell.MagicalAttack, // 9 Weapons power 3
	Spell.AntiMagicWall, // 10 Anti-magic 1
	Spell.AntiMagicSphere, // 11 Anti-magic 2
	Spell.AntiMagicSphere, // 12 Anti-magic 3
	Spell.Clairvoyance, // 13 Clairvoyance 1
	Spell.SeeTheTruth, // 14 Clairvoyance 2
	Spell.SeeTheTruth, // 15 Clairvoyance 3
	Spell.None, // 16 Invisibility 1 (no invisibility in Ambermoon)
	Spell.None, // 17 Invisibility 2
	Spell.None, // 18 Invisibility 3
	Spell.AlchemisticGlobe, // 19 Magic sphere (all protections at once)
	Spell.MagicalCompass, // 20 Magic compass
	Spell.Identification, // 21 Identification
	Spell.Levitation, // 22 Levitation
	Spell.Hurry, // 23 Haste
	Spell.MassHurry, // 24 Mass haste
	Spell.Jump, // 25 Teleport (Ambermoon has no free teleport, jump is the closest one)
	Spell.FindSecretDoors, // 26 X-ray vision (see through walls)
];

const BlackSpells = [
	Spell.None,
	Spell.Firebeam, // 1 Beam of fire
	Spell.Fireball, // 2 Wall of fire
	Spell.Fireball, // 3 Fireball
	Spell.Firestorm, // 4 Fire storm
	Spell.Firepillar, // 5 Fire cascade
	Spell.Waterfall, // 6 Waterhole
	Spell.Waterfall, // 7 Waterfall
	Spell.Iceball, // 8 Ice ball
	Spell.Iceshower, // 9 Ice shower
	Spell.Icestorm, // 10 Hail storm
	Spell.Mudsling, // 11 Mud catapult
	Spell.Rockfall, // 12 Falling rock
	Spell.Earthslide, // 13 Bog
	Spell.Earthslide, // 14 Landslide
	Spell.Earthquake, // 15 Earthquake
	Spell.Winddevil, // 16 Strong wind
	Spell.Winddevil, // 17 Storm
	Spell.Windhowler, // 18 Tornado
	Spell.Thunderbolt, // 19 Thunder
	Spell.Whirlwind, // 20 Hurricane
	Spell.DissolveVictim, // 21 Desintegration
	Spell.MagicalArrows, // 22 Magic arrows
];

const SpecialSpells = [
	Spell.None,
	Spell.Lame, // 1 Stunned
	Spell.Poison, // 2 Poison
	Spell.Petrify, // 3 Flesh to stone
	Spell.CauseDisease, // 4 Make ill
	Spell.CauseAging, // 5 Aging
	Spell.Irritate, // 6 Irritation
	Spell.CauseMadness, // 7 Make mad
	Spell.Sleep, // 8 Sleep
	Spell.Fear, // 9 Panic
	Spell.Blind, // 10 Blinding flash
	Spell.Petrify, // 11 Flesh to stone
	Spell.MagicalMap, // 12 Mapshow
	Spell.DispellUndead, // 13 Banish demon (no demon banishing in Ambermoon)
	Spell.SpellPointsI, // 14 Spellpoints 1
	Spell.SpellPointsII, // 15 Spellpoints 2
	Spell.RepairItem, // 16 Weapon balm
	Spell.DecreaseAge, // 17 Youth
	Spell.Lockpicking, // 18 Pick lock
	Spell.CallEagle, // 19 Eagle call
	Spell.PlayElfHarp, // 20 Music
];

const SpellTables = { 1: WhiteSpells, 2: GreySpells, 3: BlackSpells, 7: SpecialSpells };

/** Amberstar spell (school, 1-based index) -> Ambermoon Spell (0 = none). */
export function mapSpell(school, index) {
	return SpellTables[school]?.[index] ?? Spell.None;
}

/** Ambermoon spell -> [school, index in school] like Item.SpellSchool/SpellIndex. */
export function spellToSchoolAndIndex(spell) {
	if (!spell)
		return [0, 0];
	const school = Math.trunc((spell - 1) / 30);
	return [school, spell - school * 30];
}

/** Representative Amberstar names for the mapped Ambermoon spells: Map<Spell, [school, index]> (first mapping wins). */
export function getSpellNameSources() {
	const result = new Map();
	for (const [school, table] of Object.entries(SpellTables)) {
		table.forEach((spell, index) => {
			if (spell !== Spell.None && !result.has(spell))
				result.set(spell, [Number(school), index]);
		});
	}
	return result;
}

/**
 * Adds a list of Ambermoon spells to the learned spell fields of a character.
 * School 6 (function spells like lockpicking) is stored in LearnedSpellsType7 which only monsters use.
 */
export function addLearnedSpell(character, spell) {
	if (!spell)
		return;
	const [school, index] = spellToSchoolAndIndex(spell);
	const bit = (1 << index) >>> 0;
	switch (school) {
		case 0: character.LearnedHealingSpells = (character.LearnedHealingSpells | bit) >>> 0; break;
		case 1: character.LearnedAlchemisticSpells = (character.LearnedAlchemisticSpells | bit) >>> 0; break;
		case 2: character.LearnedMysticSpells = (character.LearnedMysticSpells | bit) >>> 0; break;
		case 3: character.LearnedDestructionSpells = (character.LearnedDestructionSpells | bit) >>> 0; break;
		case 6: character.LearnedSpellsType7 = (character.LearnedSpellsType7 | bit) >>> 0; break;
	}
}

/** Learned spell bits of a party member (bit n = spell id n) of school 1/2/3/7 -> Ambermoon spells. */
export function learnedSpellBitsToSpells(school, bits) {
	const spells = [];
	for (let i = 1; i < 32; i++) {
		if ((bits >>> 0) & ((1 << i) >>> 0)) {
			const spell = mapSpell(school, i);
			if (spell)
				spells.push(spell);
		}
	}
	return spells;
}

/** SpellTypeMastery flags of all schools of the given spells. */
export function spellMasteryOfSpells(spells) {
	let mastery = 0;
	for (const spell of spells) {
		const [school] = spellToSchoolAndIndex(spell);
		if (school <= 3)
			mastery |= 1 << school;
	}
	return mastery;
}

// ---------------------------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------------------------
// Amberstar item type -> Ambermoon item type (Amberstar: 0 armor, 1 headgear, 2 footgear, 3 shield,
// 4 close range, 5 long range, 6 ammunition, 7 text scroll, 8 spell scroll, 9 potion, 10 amulet,
// 11 brooch, 12 ring, 13 special item, 14 magic item, 15 key, 16 normal item, 17 monster item,
// 18 transportation).
const ItemTypeMapping = [
	ItemType.Armor, ItemType.Headgear, ItemType.Footgear, ItemType.Shield, ItemType.CloseRangeWeapon,
	ItemType.LongRangeWeapon, ItemType.Ammunition, ItemType.TextScroll, ItemType.SpellScroll, ItemType.Potion,
	ItemType.Amulet, ItemType.Brooch, ItemType.Ring, ItemType.SpecialItem, ItemType.MagicalItem,
	ItemType.Key, ItemType.NormalItem, ItemType.NormalItem, ItemType.Transportation,
];

export function mapItemType(amberstarType) {
	return ItemTypeMapping[amberstarType] ?? ItemType.NormalItem;
}

/** Ambermoon item type -> Amberstar item type (for the item type names) */
export function amberstarItemTypeOf(ambermoonType) {
	return ItemTypeMapping.indexOf(ambermoonType);
}

/** Amberstar genders (0 both, 1 male, 2 female) -> GenderFlag */
export function mapGenders(amberstarGenders) {
	switch (amberstarGenders) {
		case 1: return GenderFlag.Male;
		case 2: return GenderFlag.Female;
		default: return GenderFlag.Both;
	}
}

// ---------------------------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------------------------
// Amberstar monster flags: 1 undead, 2 demon, 4 immune to ailments (bosses).
export function mapBattleFlags(monsterFlags, race) {
	let flags = 0;
	if (monsterFlags & 1)
		flags |= BattleFlags.Undead;
	if (monsterFlags & 2)
		flags |= BattleFlags.Demon;
	if (monsterFlags & 4)
		flags |= BattleFlags.Boss;
	if (race === 13)
		flags |= BattleFlags.Animal;
	return flags;
}

// Amberstar elemental flags: immunities 1 fire, 2 earth, 4 water, 8 wind; vulnerabilities 0x10 fire,
// 0x20 earth, 0x40 water, 0x80 wind. Ambermoon monsters have one element: monsters of an element take
// less damage of it. Undead monsters get the undead element like in Ambermoon.
export function mapElement(elementalFlags, monsterFlags) {
	if (monsterFlags & 1)
		return CharacterElement.Undead;
	if (elementalFlags & 1)
		return CharacterElement.Fire;
	if (elementalFlags & 4)
		return CharacterElement.Water;
	if (elementalFlags & 2)
		return CharacterElement.Earth;
	if (elementalFlags & 8)
		return CharacterElement.Wind;
	return CharacterElement.None;
}

export { Condition };
