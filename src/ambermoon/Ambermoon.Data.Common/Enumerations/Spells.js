// Port of Ambermoon.Data.Common/Enumerations/Spells.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { getValue } from '../../../runtime.js';
import { SpellInfos } from '../SpellInfo.js';
import { SpellSchool } from './SpellSchool.js';

export const Spell = Object.freeze({
	None: 0,
	HealingHand: 1,
	RemoveFear: 2,
	RemovePanic: 3,
	RemoveShadows: 4,
	RemoveBlindness: 5,
	RemovePain: 6,
	RemoveDisease: 7,
	SmallHealing: 8,
	RemovePoison: 9,
	NeutralizePoison: 10,
	MediumHealing: 11,
	DispellUndead: 12,
	DestroyUndead: 13,
	HolyWord: 14,
	WakeTheDead: 15,
	ChangeAshes: 16,
	ChangeDust: 17,
	GreatHealing: 18,
	MassHealing: 19,
	Resurrection: 20,
	RemoveRigidness: 21,
	RemoveLamedness: 22,
	HealAging: 23,
	StopAging: 24,
	StoneToFlesh: 25,
	WakeUp: 26,
	RemoveIrritation: 27,
	RemoveDrugged: 28,
	RemoveMadness: 29,
	RestoreStamina: 30,
	ChargeItem: 31,
	Light: 32,
	MagicalTorch: 33,
	MagicalLantern: 34,
	MagicalSun: 35,
	GhostWeapon: 36,
	CreateFood: 37,
	RemoveCurses: 38,
	Blink: 39,
	Jump: 40,
	Escape: 41,
	WordOfMarking: 42,
	WordOfReturning: 43,
	MagicalShield: 44,
	MagicalWall: 45,
	MagicalBarrier: 46,
	MagicalWeapon: 47,
	MagicalAssault: 48,
	MagicalAttack: 49,
	Levitation: 50,
	AntiMagicWall: 51,
	AntiMagicSphere: 52,
	AlchemisticGlobe: 53,
	Hurry: 54,
	MassHurry: 55,
	RepairItem: 56,
	DuplicateItem: 57,
	LPStealer: 58,
	SPStealer: 59,
	GhostInferno: 60, // Advanced only
	MonsterKnowledge: 61,
	Identification: 62,
	Knowledge: 63,
	Clairvoyance: 64,
	SeeTheTruth: 65,
	MapView: 66,
	MagicalCompass: 67,
	FindTraps: 68,
	FindMonsters: 69,
	FindPersons: 70,
	FindSecretDoors: 71,
	MysticalMapping: 72,
	MysticalMapI: 73,
	MysticalMapII: 74,
	MysticalMapIII: 75,
	MysticalGlobe: 76,
	ShowMonsterLP: 77,
	ShowElements: 78, // Advanced only
	RecognizeWeakPoint: 79, // Advanced only
	SeeWeaknesses: 80, // Advanced only
	KnowledgeOfTheWeakness: 81, // Advanced only
	ForeseeMagic: 82, // Advanced only
	ForeseeAttack: 83, // Advanced only
	MysticDecay: 84, // Advanced only
	ProtectionSphere: 85, // Advanced only
	ElementToEarth: 86, // Advanced only
	ElementToWind: 87, // Advanced only
	ElementToFire: 88, // Advanced only
	ElementToWater: 89, // Advanced only
	MysticImitation: 90, // Advanced only
	MagicalProjectile: 91,
	MagicalArrows: 92,
	Lame: 93,
	Poison: 94,
	Petrify: 95,
	CauseDisease: 96,
	CauseAging: 97,
	Irritate: 98,
	CauseMadness: 99,
	Sleep: 100,
	Fear: 101,
	Blind: 102,
	Drug: 103,
	DissolveVictim: 104,
	Mudsling: 105,
	Rockfall: 106,
	Earthslide: 107,
	Earthquake: 108,
	Winddevil: 109,
	Windhowler: 110,
	Thunderbolt: 111,
	Whirlwind: 112,
	Firebeam: 113,
	Fireball: 114,
	Firestorm: 115,
	Firepillar: 116,
	Waterfall: 117,
	Iceball: 118,
	Icestorm: 119,
	Iceshower: 120,
	// Special spells
	Lockpicking: 181, // 6 * 30 + 1
	CallEagle: 182,
	DecreaseAge: 183, // youth potion / youth
	PlayElfHarp: 184, // magic music
	SpellPointsI: 185,
	SpellPointsII: 186,
	SpellPointsIII: 187,
	SpellPointsIV: 188,
	SpellPointsV: 189,
	AllHealing: 190, // all healing potion
	MagicalMap: 191,
	AddStrength: 192,
	AddIntelligence: 193,
	AddDexterity: 194,
	AddSpeed: 195,
	AddStamina: 196,
	AddCharisma: 197,
	AddLuck: 198,
	AddAntiMagic: 199,
	Rope: 200, // levitation on a rope / climb
	Drugs: 201, // stinking mushroom
	SelfHealing: 202, // Advanced only
	SelfReviving: 203, // Advanced only
	ExpExchange: 204, // Advanced only
	MountWasp: 205, // Advanced only
	MagicSwordAttack: 206 // Advanced only
});

export const HealingSpell = Object.freeze({
	None: 0,
	HealingHand: 1,
	RemoveFear: 2,
	RemovePanic: 3,
	RemoveShadows: 4,
	RemoveBlindness: 5,
	RemovePain: 6,
	RemoveDisease: 7,
	SmallHealing: 8,
	RemovePoison: 9,
	NeutralizePoison: 10,
	MediumHealing: 11,
	DispellUndead: 12,
	DestroyUndead: 13,
	HolyWord: 14,
	WakeTheDead: 15,
	ChangeAshes: 16,
	ChangeDust: 17,
	GreatHealing: 18,
	MassHealing: 19,
	Resurrection: 20,
	RemoveRigidness: 21,
	RemoveLamedness: 22,
	HealAging: 23,
	StopAging: 24,
	StoneToFlesh: 25,
	WakeUp: 26,
	RemoveIrritation: 27,
	RemoveDrugged: 28,
	RemoveMadness: 29,
	RestoreStamina: 30
});

export const AlchemisticSpell = Object.freeze({
	None: 0,
	ChargeItem: 1,
	Light: 2,
	MagicalTorch: 3,
	MagicalLantern: 4,
	MagicalSun: 5,
	GhostWeapon: 6,
	CreateFood: 7,
	RemoveCurses: 8,
	Blink: 9,
	Jump: 10,
	Flight: 11,
	WordOfMarking: 12,
	WordOfReturning: 13,
	MagicalShield: 14,
	MagicalWall: 15,
	MagicalBarrier: 16,
	MagicalWeapon: 17,
	MagicalAssault: 18,
	MagicalAttack: 19,
	Levitation: 20,
	AntiMagicWall: 21,
	AntiMagicSphere: 22,
	AlchemisticGlobe: 23,
	Hurry: 24,
	MassHurry: 25,
	RepairItem: 26,
	DuplicateItem: 27,
	LPStealer: 28,
	SPStealer: 29,
	GhostInferno: 30 // Advanced only
});

export const MysticSpell = Object.freeze({
	None: 0,
	MonsterKnowledge: 1,
	Identification: 2,
	Knowledge: 3,
	Clairvoyance: 4,
	SeeTheTruth: 5,
	MapView: 6,
	MagicalCompass: 7,
	FindTraps: 8,
	FindMonsters: 9,
	FindPersons: 10,
	FindSecretDoors: 11,
	MysticalMapping: 12,
	MysticalMapI: 13,
	MysticalMapII: 14,
	MysticalMapIII: 15,
	MysticalGlobe: 16,
	ShowMonsterLP: 17,
	ShowElements: 18, // Advanced only
	RecognizeWeakPoint: 19, // Advanced only
	SeeWeaknesses: 20, // Advanced only
	KnowledgeOfTheWeakness: 21, // Advanced only
	ForeseeMagic: 22, // Advanced only
	ForeseeAttack: 23, // Advanced only
	MysticDecay: 24, // Advanced only
	ProtectionSphere: 25, // Advanced only
	ElementToEarth: 26, // Advanced only
	ElementToWind: 27, // Advanced only
	ElementToFire: 28, // Advanced only
	ElementToWater: 29, // Advanced only
	MysticImitation: 30 // Advanced only
});

export const DestructionSpell = Object.freeze({
	None: 0,
	MagicalProjectile: 1,
	MagicalArrows: 2,
	Lame: 3,
	Poison: 4,
	Petrify: 5,
	CauseDisease: 6,
	CauseAging: 7,
	Irritate: 8,
	CauseMadness: 9,
	Sleep: 10,
	Fear: 11,
	Blind: 12,
	Drug: 13,
	DissolveVictim: 14,
	Mudsling: 15,
	Rockfall: 16,
	Earthslide: 17,
	Earthquake: 18,
	Winddevil: 19,
	Windhowler: 20,
	Thunderbolt: 21,
	Whirlwind: 22,
	Firebeam: 23,
	Fireball: 24,
	Firestorm: 25,
	Firepillar: 26,
	Waterfall: 27,
	Iceball: 28,
	Icestorm: 29,
	Iceshower: 30
});

export class SpellExtensions {
	static FailsAgainstPetrifiedEnemy(spell) {
		// Most damage dealing spells except for
		// dissolving spells fail against petrified enemies.
		return spell === Spell.GhostWeapon ||
			spell === Spell.GhostInferno ||
			spell === Spell.LPStealer ||
			spell === Spell.SPStealer ||
			spell === Spell.MysticDecay ||
			spell === Spell.MagicalProjectile ||
			spell === Spell.MagicalArrows ||
			spell === Spell.MagicSwordAttack ||
			(spell >= Spell.Mudsling && spell <= Spell.Iceshower);
	}

	static DealsDamage(spell) {
		// No dissolve spells.
		return spell === Spell.GhostWeapon ||
			spell === Spell.GhostInferno ||
			spell === Spell.LPStealer ||
			spell === Spell.SPStealer ||
			spell === Spell.MysticDecay ||
			spell === Spell.MagicalProjectile ||
			spell === Spell.MagicalArrows ||
			spell === Spell.MagicSwordAttack ||
			(spell >= Spell.Mudsling && spell <= Spell.Iceshower);
	}

	static IsCastableByMonster(spell) {
		return spell === Spell.LPStealer ||
			spell === Spell.SPStealer ||
			spell === Spell.GhostWeapon ||
			spell === Spell.MagicSwordAttack ||
			getValue(SpellInfos.Entries, spell).SpellSchool === SpellSchool.Destruction;
	}

	static IsPhysicallyBlocked(spell) {
		return spell === Spell.MagicSwordAttack;
	}
}
