// Port of Ambermoon.Data.Common/SpellInfo.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { getValue, hasFlag, orderBy, tryGetValue } from '../../runtime.js';
import { Spell } from './Enumerations/Spells.js';
import { WorldFlag } from './Enumerations/World.js';
import { Features } from './Enumerations/Features.js';
import { BattleFlags } from './Enumerations/BattleFlags.js';
import { CharacterType } from './Enumerations/CharacterType.js';

// Note: PartyMember is not imported (Spells.js -> SpellInfo.js -> PartyMember.js -> Character.js -> Spells.js would be a
// circular import with a base class). `caster is PartyMember` is checked via `caster.Type === CharacterType.PartyMember`.

/// <summary>
/// This is very similar to <see cref="SpellSchool"/>
/// but spells like Holy Word or Ghost Weapon count
/// as Destruction.
/// </summary>
// [Flags]
export const SpellType = Object.freeze({
	Healing: 0x01,
	Alchemistic: 0x02,
	Mystic: 0x04,
	Destruction: 0x08,
	Unknown1: 0x10,
	Unknown2: 0x20,
	Function: 0x40 // lockpicking, call eagle, play elf harp etc
});

// [Flags]
export const SpellApplicationArea = Object.freeze({
	AnyMap: 0x01,
	Camp: 0x02,
	Battle: 0x04,
	WorldMapOnly: 0x08,
	DungeonOnly: 0x10, // this also includes indoor 3D maps
	All: 0x01 | 0x02 | 0x04, // AnyMap | Camp | Battle
	BattleOnly: 0x04, // Battle
	NoBattle: 0x01 | 0x02, // AnyMap | Camp
	CampAndBattle: 0x02 | 0x04 // Camp | Battle
});

export const SpellTarget = Object.freeze({
	None: -1,
	SingleFriend: 0,
	FriendRow: 1, // This is not used in Ambermoon and we don't need it. Instead we use it for "Enemy row" but in weapon range for Advanced.
	EnemyRowInWeaponRange: 1, // = FriendRow
	AllFriends: 2,
	SingleEnemy: 3,
	EnemyRow: 4,
	AllEnemies: 5,
	Item: 6,
	BattleField: 7 // Blink
});

export const SpellTargetType = Object.freeze({
	None: 0,
	SingleBattleField: 1,
	BattleFieldRow: 2,
	HalfBattleField: 3,
	Item: 4
});

export class SpellTargetExtensions {
	static TargetsEnemy(spellTarget) {
		switch (spellTarget) {
			case SpellTarget.SingleEnemy: return true;
			case SpellTarget.EnemyRow: return true;
			case SpellTarget.EnemyRowInWeaponRange: return true;
			case SpellTarget.AllEnemies: return true;
			default: return false;
		}
	}

	static TargetsMultipleEnemies(spellTarget) {
		return spellTarget === SpellTarget.EnemyRow || spellTarget === SpellTarget.AllEnemies;
	}

	static GetTargetType(spellTarget) {
		switch (spellTarget) {
			case SpellTarget.SingleEnemy: return SpellTargetType.SingleBattleField;
			case SpellTarget.SingleFriend: return SpellTargetType.SingleBattleField;
			case SpellTarget.EnemyRow: return SpellTargetType.BattleFieldRow;
			case SpellTarget.AllEnemies: return SpellTargetType.HalfBattleField;
			case SpellTarget.AllFriends: return SpellTargetType.HalfBattleField;
			case SpellTarget.Item: return SpellTargetType.Item;
			case SpellTarget.BattleField: return SpellTargetType.SingleBattleField;
			default: return SpellTargetType.None;
		}
	}
}

export class SpellInfo {
	constructor() {
		this.SpellSchool = 0;
		this.SpellType = 0;
		this.Spell = 0;
		this.SP = 0;
		this.SLP = 0;
		this.Target = 0;
		this.ApplicationArea = 0;
		this.Worlds = 0;
	}

	clone() {
		return Object.assign(new SpellInfo(), this);
	}
}

function info(sp, slp, target, applicationArea, worlds) {
	const spellInfo = new SpellInfo();
	spellInfo.SP = sp;
	spellInfo.SLP = slp;
	spellInfo.Target = target;
	spellInfo.ApplicationArea = applicationArea;
	spellInfo.Worlds = worlds;
	return spellInfo;
}

// Lazily initialized (instead of a static constructor) to avoid using imported enums at module evaluation time.
let entries = null;
let adjustedSLP = null;
let adjustedSP = null;

function createEntries() {
	return new Map([
		[Spell.HealingHand, info(3, 1, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.RemoveFear, info(5, 2, SpellTarget.SingleFriend, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.RemovePanic, info(15, 5, SpellTarget.AllFriends, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.RemoveShadows, info(8, 3, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.RemoveBlindness, info(20, 8, SpellTarget.AllFriends, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.RemovePain, info(15, 5, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.RemoveDisease, info(20, 10, SpellTarget.AllFriends, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.SmallHealing, info(15, 5, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.RemovePoison, info(15, 10, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.NeutralizePoison, info(25, 12, SpellTarget.AllFriends, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.MediumHealing, info(50, 15, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.DispellUndead, info(15, 10, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.DestroyUndead, info(50, 15, SpellTarget.EnemyRow, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.HolyWord, info(100, 20, SpellTarget.AllEnemies, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.WakeTheDead, info(100, 15, SpellTarget.SingleFriend, SpellApplicationArea.Camp, WorldFlag.All)],
		[Spell.ChangeAshes, info(150, 20, SpellTarget.SingleFriend, SpellApplicationArea.Camp, WorldFlag.All)],
		[Spell.ChangeDust, info(250, 25, SpellTarget.SingleFriend, SpellApplicationArea.Camp, WorldFlag.All)],
		[Spell.GreatHealing, info(100, 30, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.MassHealing, info(150, 20, SpellTarget.AllFriends, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.Resurrection, info(250, 30, SpellTarget.AllFriends, SpellApplicationArea.Camp, WorldFlag.All)],
		[Spell.RemoveRigidness, info(15, 5, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.RemoveLamedness, info(30, 10, SpellTarget.AllFriends, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.HealAging, info(50, 12, SpellTarget.SingleFriend, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.StopAging, info(100, 15, SpellTarget.AllFriends, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.StoneToFlesh, info(250, 20, SpellTarget.SingleFriend, SpellApplicationArea.Camp, WorldFlag.All)],
		[Spell.WakeUp, info(10, 5, SpellTarget.SingleFriend, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.RemoveIrritation, info(10, 5, SpellTarget.SingleFriend, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.RemoveDrugged, info(25, 10, SpellTarget.SingleFriend, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.RemoveMadness, info(100, 15, SpellTarget.SingleFriend, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.RestoreStamina, info(50, 15, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.ChargeItem, info(250, 20, SpellTarget.Item, SpellApplicationArea.Camp, WorldFlag.All)],
		[Spell.Light, info(5, 2, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.MagicalTorch, info(10, 5, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.MagicalLantern, info(25, 10, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.MagicalSun, info(50, 15, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.GhostWeapon, info(10, 5, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.CreateFood, info(25, 10, SpellTarget.AllFriends, SpellApplicationArea.Camp, WorldFlag.All)],
		[Spell.RemoveCurses, info(100, 20, SpellTarget.Item, SpellApplicationArea.Camp, WorldFlag.All)],
		[Spell.Blink, info(20, 5, SpellTarget.BattleField, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Jump, info(50, 10, SpellTarget.None, SpellApplicationArea.DungeonOnly, WorldFlag.All)],
		[Spell.Escape, info(50, 15, SpellTarget.None, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.WordOfMarking, info(150, 20, SpellTarget.None, SpellApplicationArea.AnyMap, WorldFlag.Lyramion)],
		[Spell.WordOfReturning, info(250, 20, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.Lyramion)],
		[Spell.MagicalShield, info(15, 10, SpellTarget.None, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.MagicalWall, info(30, 15, SpellTarget.None, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.MagicalBarrier, info(50, 20, SpellTarget.None, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.MagicalWeapon, info(15, 10, SpellTarget.None, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.MagicalAssault, info(30, 15, SpellTarget.None, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.MagicalAttack, info(50, 20, SpellTarget.None, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.Levitation, info(25, 10, SpellTarget.None, SpellApplicationArea.DungeonOnly, WorldFlag.All)],
		[Spell.AntiMagicWall, info(25, 5, SpellTarget.None, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.AntiMagicSphere, info(50, 15, SpellTarget.None, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.AlchemisticGlobe, info(250, 25, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.Hurry, info(25, 5, SpellTarget.SingleFriend, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.MassHurry, info(50, 10, SpellTarget.AllFriends, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.RepairItem, info(100, 15, SpellTarget.Item, SpellApplicationArea.Camp, WorldFlag.All)],
		[Spell.DuplicateItem, info(250, 25, SpellTarget.Item, SpellApplicationArea.Camp, WorldFlag.All)],
		[Spell.LPStealer, info(25, 5, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.SPStealer, info(25, 5, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.GhostInferno, info(35, 55, SpellTarget.AllEnemies, SpellApplicationArea.BattleOnly, WorldFlag.All)], // Advanced only
		[Spell.MonsterKnowledge, info(5, 3, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Identification, info(50, 15, SpellTarget.Item, SpellApplicationArea.Camp, WorldFlag.All)],
		[Spell.Knowledge, info(15, 10, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.Clairvoyance, info(30, 20, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.SeeTheTruth, info(60, 30, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.MapView, info(50, 15, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.MagicalCompass, info(5, 2, SpellTarget.None, SpellApplicationArea.AnyMap, WorldFlag.All)],
		[Spell.FindTraps, info(25, 10, SpellTarget.None, SpellApplicationArea.AnyMap, WorldFlag.All)],
		[Spell.FindMonsters, info(25, 10, SpellTarget.None, SpellApplicationArea.AnyMap, WorldFlag.All)],
		[Spell.FindPersons, info(25, 10, SpellTarget.None, SpellApplicationArea.AnyMap, WorldFlag.All)],
		[Spell.FindSecretDoors, info(25, 10, SpellTarget.None, SpellApplicationArea.AnyMap, WorldFlag.All)],
		[Spell.MysticalMapping, info(100, 25, SpellTarget.None, SpellApplicationArea.AnyMap, WorldFlag.All)],
		[Spell.MysticalMapI, info(25, 10, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.MysticalMapII, info(35, 15, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.MysticalMapIII, info(45, 20, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.MysticalGlobe, info(250, 25, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.ShowMonsterLP, info(15, 5, SpellTarget.None, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.ShowElements, info(10, 10, SpellTarget.None, SpellApplicationArea.BattleOnly, WorldFlag.All)], // Advanced only
		[Spell.RecognizeWeakPoint, info(15, 20, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)], // Advanced only
		[Spell.SeeWeaknesses, info(30, 25, SpellTarget.EnemyRow, SpellApplicationArea.BattleOnly, WorldFlag.All)], // Advanced only
		[Spell.KnowledgeOfTheWeakness, info(45, 30, SpellTarget.AllEnemies, SpellApplicationArea.BattleOnly, WorldFlag.All)], // Advanced only
		[Spell.ForeseeMagic, info(15, 20, SpellTarget.None, SpellApplicationArea.BattleOnly, WorldFlag.All)], // Advanced only
		[Spell.ForeseeAttack, info(15, 20, SpellTarget.None, SpellApplicationArea.BattleOnly, WorldFlag.All)], // Advanced only
		[Spell.MysticDecay, info(50, 25, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)], // Advanced only
		[Spell.ProtectionSphere, info(50, 20, SpellTarget.None, SpellApplicationArea.BattleOnly, WorldFlag.All)], // Advanced only
		[Spell.ElementToEarth, info(75, 35, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.ElementToWind, info(75, 35, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.ElementToFire, info(75, 35, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.ElementToWater, info(75, 35, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.MysticImitation, info(100, 100, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.MagicalProjectile, info(5, 5, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.MagicalArrows, info(15, 10, SpellTarget.EnemyRow, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Lame, info(10, 5, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Poison, info(15, 5, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Petrify, info(60, 5, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.CauseDisease, info(15, 5, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.CauseAging, info(15, 5, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Irritate, info(10, 5, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.CauseMadness, info(30, 10, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Sleep, info(15, 10, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Fear, info(50, 10, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Blind, info(15, 10, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Drug, info(15, 10, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.DissolveVictim, info(250, 25, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Mudsling, info(8, 1, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.Lyramion | WorldFlag.Morag)],
		[Spell.Rockfall, info(15, 5, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.Lyramion | WorldFlag.Morag)],
		[Spell.Earthslide, info(20, 10, SpellTarget.EnemyRow, SpellApplicationArea.BattleOnly, WorldFlag.Lyramion | WorldFlag.Morag)],
		[Spell.Earthquake, info(30, 15, SpellTarget.AllEnemies, SpellApplicationArea.BattleOnly, WorldFlag.Lyramion | WorldFlag.Morag)],
		[Spell.Winddevil, info(12, 5, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Windhowler, info(25, 10, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Thunderbolt, info(35, 15, SpellTarget.EnemyRow, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Whirlwind, info(50, 20, SpellTarget.AllEnemies, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Firebeam, info(25, 10, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Fireball, info(60, 15, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Firestorm, info(80, 20, SpellTarget.EnemyRow, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Firepillar, info(120, 25, SpellTarget.AllEnemies, SpellApplicationArea.BattleOnly, WorldFlag.All)],
		[Spell.Waterfall, info(50, 15, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.Lyramion | WorldFlag.ForestMoon)],
		[Spell.Iceball, info(100, 20, SpellTarget.SingleEnemy, SpellApplicationArea.BattleOnly, WorldFlag.Lyramion | WorldFlag.ForestMoon)],
		[Spell.Icestorm, info(150, 25, SpellTarget.EnemyRow, SpellApplicationArea.BattleOnly, WorldFlag.Lyramion | WorldFlag.ForestMoon)],
		[Spell.Iceshower, info(200, 30, SpellTarget.AllEnemies, SpellApplicationArea.BattleOnly, WorldFlag.Lyramion | WorldFlag.ForestMoon)],
		// Special spells
		[Spell.Lockpicking, info(0, 0, SpellTarget.None, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.CallEagle, info(0, 0, SpellTarget.None, SpellApplicationArea.WorldMapOnly, WorldFlag.Lyramion)],
		[Spell.DecreaseAge, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.NoBattle, WorldFlag.All)],
		[Spell.PlayElfHarp, info(0, 0, SpellTarget.None, SpellApplicationArea.AnyMap, WorldFlag.All)],
		[Spell.SpellPointsI, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.SpellPointsII, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.SpellPointsIII, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.SpellPointsIV, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.SpellPointsV, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.AllHealing, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.MagicalMap, info(0, 0, SpellTarget.None, SpellApplicationArea.WorldMapOnly, WorldFlag.Lyramion)],
		[Spell.AddStrength, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.AddIntelligence, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.AddDexterity, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.AddSpeed, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.AddStamina, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.AddCharisma, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.AddLuck, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.AddAntiMagic, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.Rope, info(0, 0, SpellTarget.None, SpellApplicationArea.DungeonOnly, WorldFlag.All)],
		[Spell.Drugs, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.SelfHealing, info(0, 0, SpellTarget.None, SpellApplicationArea.All, WorldFlag.All)],
		[Spell.SelfReviving, info(0, 0, SpellTarget.None, SpellApplicationArea.Camp, WorldFlag.All)],
		[Spell.ExpExchange, info(0, 0, SpellTarget.SingleFriend, SpellApplicationArea.Camp, WorldFlag.Lyramion)],
		[Spell.MountWasp, info(0, 0, SpellTarget.None, SpellApplicationArea.WorldMapOnly, WorldFlag.ForestMoon)],
		[Spell.MagicSwordAttack, info(0, 0, SpellTarget.EnemyRowInWeaponRange, SpellApplicationArea.BattleOnly, WorldFlag.All)],
	]);
}

function createAdjustedSLP() {
	return new Map([
		[Spell.RemoveFear, 10],
		[Spell.RemovePanic, 20],
		[Spell.RemoveShadows, 10],
		[Spell.RemoveBlindness, 20],
		[Spell.RemovePain, 20],
		[Spell.RemoveDisease, 30],
		[Spell.SmallHealing, 15],
		[Spell.RemovePoison, 20],
		[Spell.NeutralizePoison, 30],
		[Spell.MediumHealing, 35],
		[Spell.DestroyUndead, 25],
		[Spell.HolyWord, 35],
		[Spell.WakeTheDead, 60],
		[Spell.ChangeAshes, 30],
		[Spell.ChangeDust, 30],
		[Spell.GreatHealing, 45],
		[Spell.MassHealing, 45],
		[Spell.Resurrection, 80],
		[Spell.RemoveRigidness, 25],
		[Spell.RemoveLamedness, 35],
		[Spell.HealAging, 15],
		[Spell.StopAging, 20],
		[Spell.StoneToFlesh, 40],
		[Spell.WakeUp, 10],
		[Spell.RemoveIrritation, 15],
		[Spell.RemoveDrugged, 15],
		[Spell.RemoveMadness, 30],
		[Spell.RestoreStamina, 5],
		[Spell.ChargeItem, 60],
		[Spell.Light, 5],
		[Spell.MagicalTorch, 10],
		[Spell.MagicalLantern, 20],
		[Spell.MagicalSun, 35],
		[Spell.GhostWeapon, 25],
		[Spell.CreateFood, 30],
		[Spell.Blink, 15],
		[Spell.Jump, 30],
		[Spell.WordOfMarking, 50],
		[Spell.WordOfReturning, 40],
		[Spell.MagicalShield, 20],
		[Spell.MagicalWall, 25],
		[Spell.MagicalBarrier, 30],
		[Spell.MagicalWeapon, 20],
		[Spell.MagicalAssault, 25],
		[Spell.MagicalAttack, 30],
		[Spell.Levitation, 65],
		[Spell.AntiMagicWall, 25],
		[Spell.AntiMagicSphere, 40],
		[Spell.AlchemisticGlobe, 100],
		[Spell.Hurry, 25],
		[Spell.MassHurry, 40],
		[Spell.RepairItem, 40],
		[Spell.DuplicateItem, 65],
		[Spell.LPStealer, 25],
		[Spell.SPStealer, 25],
		[Spell.MonsterKnowledge, 15],
		[Spell.Identification, 35],
		[Spell.Knowledge, 5],
		[Spell.Clairvoyance, 15],
		[Spell.MagicalCompass, 5],
		[Spell.FindTraps, 15],
		[Spell.FindMonsters, 15],
		[Spell.FindPersons, 15],
		[Spell.FindSecretDoors, 15],
		[Spell.MysticalMapping, 60],
		[Spell.MysticalMapI, 65],
		[Spell.MysticalMapII, 70],
		[Spell.MysticalMapIII, 75],
		[Spell.MysticalGlobe, 100],
		[Spell.ShowMonsterLP, 15],
	]);
}

function createAdjustedSP() {
	return new Map([
		[Spell.Escape, 100],
		[Spell.AlchemisticGlobe, 200],
		[Spell.MysticalGlobe, 100],
		[Spell.Mudsling, 10],
		[Spell.Earthquake, 25],
		[Spell.Winddevil, 20],
		[Spell.Windhowler, 30],
		[Spell.Thunderbolt, 40],
		[Spell.Firebeam, 40],
		[Spell.Firepillar, 100],
		[Spell.Waterfall, 80],
		[Spell.Iceball, 120],
		[Spell.Icestorm, 160],
	]);
}

function ensureInitialized() {
	if (entries !== null)
		return;

	adjustedSLP = createAdjustedSLP();
	adjustedSP = createAdjustedSP();

	// static SpellInfos()
	const rawEntries = createEntries();
	const temp = new Map();
	for (const [Key, Value] of orderBy([...rawEntries], e => e[0])) {
		const spellInfo = new SpellInfo();
		spellInfo.Spell = Key;
		spellInfo.SpellSchool = Math.trunc((Key - 1) / 30);
		spellInfo.SpellType = SpellInfos.GetSpellType(Key);
		spellInfo.SP = Value.SP;
		spellInfo.SLP = Value.SLP;
		spellInfo.Target = Value.Target;
		spellInfo.ApplicationArea = Value.ApplicationArea;
		spellInfo.Worlds = Value.Worlds;
		temp.set(Key, spellInfo);
	}
	entries = temp;
}

// TODO: this is stored in AM2_CPU. Load it from there later.
export class SpellInfos {
	/** Extension method on IReadOnlyDictionary<Spell, SpellInfo>: SpellInfos.GetSPCost(SpellInfos.Entries, features, spell, caster) */
	static GetSPCost(spellInfos, features, spell, caster) {
		ensureInitialized();

		const GetBaseSP = spell => {
			const [found, sp] = hasFlag(features, Features.AdjustedSPAndSLP) ? tryGetValue(adjustedSP, spell) : [false, 0];
			return found ? sp : getValue(spellInfos, spell).SP;
		};

		if (caster != null && caster.Type === CharacterType.PartyMember) {
			if (spell >= Spell.Mudsling && spell <= Spell.Earthquake) {
				if (hasFlag(caster.BattleFlags, BattleFlags.EarthSpellDamageBonus))
					return GetBaseSP(spell + 12);
			} else if (spell >= Spell.Winddevil && spell <= Spell.Whirlwind) {
				if (hasFlag(caster.BattleFlags, BattleFlags.WindSpellDamageBonus))
					return GetBaseSP(spell + 8);
			} else if (spell >= Spell.Firebeam && spell <= Spell.Firepillar) {
				if (hasFlag(caster.BattleFlags, BattleFlags.FireSpellDamageBonus))
					return GetBaseSP(spell + 4);
			}
		}

		return GetBaseSP(spell);
	}

	/** Extension method on IReadOnlyDictionary<Spell, SpellInfo>: SpellInfos.GetSLPCost(SpellInfos.Entries, features, spell) */
	static GetSLPCost(spellInfos, features, spell) {
		ensureInitialized();

		const [found, slp] = hasFlag(features, Features.AdjustedSPAndSLP) ? tryGetValue(adjustedSLP, spell) : [false, 0];
		return found ? slp : getValue(spellInfos, spell).SLP;
	}

	static GetSpellType(spell) {
		switch (spell) {
			case Spell.DispellUndead:
			case Spell.DestroyUndead:
			case Spell.HolyWord:
			case Spell.GhostWeapon:
			case Spell.GhostInferno:
			case Spell.MysticDecay:
				return SpellType.Destruction;
			default:
				return 1 << Math.trunc((spell - 1) / 30);
		}
	}

	/** IReadOnlyDictionary<Spell, SpellInfo> -> Map (ordered by spell) */
	static get Entries() {
		ensureInitialized();
		return entries;
	}
}
