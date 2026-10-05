// Port of Ambermoon.Data.Common/Character.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { hasFlag } from '../../runtime.js';
import { EnumHelper } from '../Ambermoon.Common/EnumHelper.js';
import { CharacterType } from './Enumerations/CharacterType.js';
import { Condition, ConditionExtensions } from './Enumerations/Condition.js';
import { Spell } from './Enumerations/Spells.js';
import { BattleFlags } from './Enumerations/BattleFlags.js';
import { CharacterElement } from './Enumerations/CharacterElement.js';
import { CharacterValue, CharacterValueCollection } from './CharacterValue.js';
import { Inventory } from './Inventory.js';
import { Equipment } from './Equipment.js';

// Note: Character must not import its subclass Monster (circular base class import).
// `this is Monster` is therefore checked via `this.Type === CharacterType.Monster`.

let possibleConditions = null;
let possibleVisibleConditions = null;

export class Character {
	static GoldWeight = 5;
	static FoodWeight = 250;

	static get PossibleConditions() {
		if (possibleConditions === null)
			possibleConditions = EnumHelper.GetValues(Condition).filter(a => a !== Condition.None);
		return possibleConditions;
	}

	static get PossibleVisibleConditions() {
		if (possibleVisibleConditions === null)
			possibleVisibleConditions = Character.PossibleConditions
				.filter(a => a !== Condition.Fleeing && a !== Condition.DeadAshes && a !== Condition.DeadDust);
		return possibleVisibleConditions;
	}

	constructor(type) {
		this.Index = 0;
		this.Gender = 0;
		this.Race = 0;
		this.Class = 0;
		this.SpellMastery = 0;
		this.Level = 0;
		this.NumberOfOccupiedHands = 0;
		this.NumberOfOccupiedFingers = 0;
		this.SpokenLanguages = 0;
		this.SpokenExtendedLanguages = 0;
		this.InventoryInaccessible = false; // This is not bound to conditions but its own "inventory is secret" flag
		this.PortraitIndex = 0;
		/// <summary>
		/// Not used in Ambermoon.
		/// </summary>
		this.JoinPercentage = 0;
		/// <summary>
		/// Not used in Ambermoon.
		/// </summary>
		this.SpellChancePercentage = 0;
		/// <summary>
		/// Not used in Ambermoon.
		/// </summary>
		this.MagicHitBonus = 0;
		this.SpellTypeImmunity = 0;
		this.AttacksPerRound = 0;
		this.Element = 0;
		this.BattleFlags = 0;
		this.SpellLearningPoints = 0;
		this.TrainingPoints = 0;
		this.Gold = 0;
		this.Food = 0;
		/// <summary>
		/// Is used for party members to identify their associated map character.
		/// 0xffff means "use the map character you talked to".
		/// But party members like Selena, Sabine or Valdyn will move to another
		/// location after you met them. This character bit represents the new
		/// location.
		/// </summary>
		this.CharacterBitIndex = 0;
		this.Conditions = 0;
		/// <summary>
		/// This was called "Battle round spell point usage".
		/// But it is never used in Ambermoon.
		/// </summary>
		this.BattleRoundSpellPointUsage = 0;
		this.Attributes = new CharacterValueCollection(10); // 8 attribute + age + a hidden attribute
		this.Skills = new CharacterValueCollection(10);
		this.HitPoints = new CharacterValue();
		this.SpellPoints = new CharacterValue();
		this.BaseAttackDamage = 0;
		this.BaseDefense = 0;
		this.BonusAttackDamage = 0;
		this.BonusDefense = 0;
		this.MagicAttack = 0;
		this.MagicDefense = 0;
		this.AttacksPerRoundIncreaseLevels = 0;
		this.HitPointsPerLevel = 0;
		this.SpellPointsPerLevel = 0;
		this.SpellLearningPointsPerLevel = 0;
		this.TrainingPointsPerLevel = 0;
		// 0 for most chars but there are exceptions like Dönner
		this.LookAtCharTextIndex = 0;
		this.ExperiencePoints = 0;
		this.LearnedHealingSpells = 0;
		this.LearnedAlchemisticSpells = 0;
		this.LearnedMysticSpells = 0;
		this.LearnedDestructionSpells = 0;
		this.LearnedSpellsType5 = 0;
		this.LearnedSpellsType6 = 0;
		this.LearnedSpellsType7 = 0;
		this.TotalWeight = 0;
		this.Name = null;
		/** Action<Character> delegate (plain function or null) */
		this.Died = null;
		this.Inventory = new Inventory();
		this.Equipment = new Equipment();

		this.Type = type;
	}

	get Alive() {
		return !hasFlag(this.Conditions, Condition.DeadCorpse) &&
			!hasFlag(this.Conditions, Condition.DeadAshes) &&
			!hasFlag(this.Conditions, Condition.DeadDust);
	}

	/// <summary>
	/// Checks if the character is immune to the given
	/// spell.
	/// </summary>
	/// <param name="spell">The spell to check</param>
	/// <param name="silent">If true no "is immune to" message should be shown on cast. This is used for holy spells for example.</param>
	/// <returns></returns>
	/** Returns [immune, silent] (out parameter silent). */
	IsImmuneToSpell(spell, supportElements) {
		let silent = false;

		// Only monsters can have spell immunities
		if (this.Type !== CharacterType.Monster)
			return [false, silent];

		const monster = this;

		// Note: This only checks for immunities based on monster flags and elements.
		// Other things like condition-dependent immunities or spell type immunities
		// are not checked here.
		const boss = hasFlag(monster.BattleFlags, BattleFlags.Boss);
		const undead = hasFlag(monster.BattleFlags, BattleFlags.Undead);
		const demon = hasFlag(monster.BattleFlags, BattleFlags.Demon); // eslint-disable-line no-unused-vars
		const animal = hasFlag(monster.BattleFlags, BattleFlags.Animal); // eslint-disable-line no-unused-vars

		silent = !undead &&
			(spell === Spell.DispellUndead ||
			spell === Spell.DestroyUndead ||
			spell === Spell.HolyWord);

		const Element = this.Element;
		let result;

		switch (spell) {
			case Spell.DispellUndead: result = !undead || boss; break;
			case Spell.DestroyUndead: result = !undead || boss; break;
			case Spell.HolyWord: result = !undead || boss; break;
			case Spell.GhostWeapon: result = Element === CharacterElement.Spirit; break;
			case Spell.GhostInferno: result = Element === CharacterElement.Spirit; break;
			case Spell.LPStealer: result = Element === CharacterElement.Undead; break;
			case Spell.SPStealer: result = Element === CharacterElement.Spirit; break;
			case Spell.MonsterKnowledge: result = Element === CharacterElement.Mental; break;
			case Spell.RecognizeWeakPoint: result = Element === CharacterElement.Mental; break;
			case Spell.SeeWeaknesses: result = Element === CharacterElement.Mental; break;
			case Spell.KnowledgeOfTheWeakness: result = Element === CharacterElement.Mental; break;
			case Spell.MysticDecay: result = Element === CharacterElement.Mental; break;
			case Spell.ElementToEarth: result = boss || Element === CharacterElement.Earth; break;
			case Spell.ElementToWind: result = boss || Element === CharacterElement.Wind; break;
			case Spell.ElementToFire: result = boss || Element === CharacterElement.Fire; break;
			case Spell.ElementToWater: result = boss || Element === CharacterElement.Water; break;
			case Spell.MysticImitation: result = Element === CharacterElement.Spirit; break;
			case Spell.MagicalProjectile: result = Element === CharacterElement.Spirit; break;
			case Spell.MagicalArrows: result = Element === CharacterElement.Spirit; break;
			case Spell.Lame: result = boss || Element === CharacterElement.Physical; break;
			case Spell.Poison: result = Element === CharacterElement.Physical; break;
			case Spell.Petrify: result = boss || Element === CharacterElement.Undead; break;
			case Spell.CauseDisease: result = Element === CharacterElement.Physical; break;
			case Spell.CauseAging: result = Element === CharacterElement.Undead; break;
			case Spell.Irritate: result = boss || Element === CharacterElement.Mental; break;
			case Spell.CauseMadness: result = boss || Element === CharacterElement.Mental; break;
			case Spell.Sleep: result = Element === CharacterElement.Mental; break;
			case Spell.Fear: result = boss || Element === CharacterElement.Mental; break;
			case Spell.Blind: result = Element === CharacterElement.Spirit; break;
			case Spell.Drug: result = boss || Element === CharacterElement.Physical; break;
			case Spell.DissolveVictim: result = boss || Element === CharacterElement.Spirit; break;
			case Spell.Mudsling: result = supportElements && Element === CharacterElement.Earth; break;
			case Spell.Rockfall: result = supportElements && Element === CharacterElement.Earth; break;
			case Spell.Earthslide: result = supportElements && Element === CharacterElement.Earth; break;
			case Spell.Earthquake: result = supportElements && Element === CharacterElement.Earth; break;
			case Spell.Winddevil: result = supportElements && Element === CharacterElement.Wind; break;
			case Spell.Windhowler: result = supportElements && Element === CharacterElement.Wind; break;
			case Spell.Thunderbolt: result = supportElements && Element === CharacterElement.Wind; break;
			case Spell.Whirlwind: result = supportElements && Element === CharacterElement.Wind; break;
			case Spell.Firebeam: result = supportElements && Element === CharacterElement.Fire; break;
			case Spell.Fireball: result = supportElements && Element === CharacterElement.Fire; break;
			case Spell.Firestorm: result = supportElements && Element === CharacterElement.Fire; break;
			case Spell.Firepillar: result = supportElements && Element === CharacterElement.Fire; break;
			case Spell.Waterfall: result = supportElements && Element === CharacterElement.Water; break;
			case Spell.Iceball: result = supportElements && Element === CharacterElement.Water; break;
			case Spell.Icestorm: result = supportElements && Element === CharacterElement.Water; break;
			case Spell.Iceshower: result = supportElements && Element === CharacterElement.Water; break;
			default: result = false; break;
		}

		return [!!result, silent];
	}

	HasAnySpell() {
		return this.LearnedHealingSpells !== 0 ||
			this.LearnedAlchemisticSpells !== 0 ||
			this.LearnedMysticSpells !== 0 ||
			this.LearnedDestructionSpells !== 0 ||
			(this.Type === CharacterType.Monster && this.LearnedSpellsType7 !== 0);
	}

	HasSpell(spell) {
		const school = Math.trunc((spell - 1) / 30);

		if (school > 3) // Only spells of the 4 main schools can be learned
			return false;

		const spellIndex = spell - school * 30;
		const spellBit = (1 << spellIndex) >>> 0;

		switch (school) {
			case 0: // healing
				return (this.LearnedHealingSpells & spellBit) !== 0;
			case 1: // alchemistic
				return (this.LearnedAlchemisticSpells & spellBit) !== 0;
			case 2: // mystic
				return (this.LearnedMysticSpells & spellBit) !== 0;
			case 3: // destruction
				return (this.LearnedDestructionSpells & spellBit) !== 0;
			default:
				return false;
		}
	}

	AddSpell(spell) {
		const school = Math.trunc((spell - 1) / 30);

		if (school > 3) // Only spells of the 4 main schools can be learned
			return;

		const spellIndex = spell - school * 30;

		switch (school) {
			case 0: // healing
				this.LearnedHealingSpells = (this.LearnedHealingSpells | (1 << spellIndex)) >>> 0;
				break;
			case 1: // alchemistic
				this.LearnedAlchemisticSpells = (this.LearnedAlchemisticSpells | (1 << spellIndex)) >>> 0;
				break;
			case 2: // mystic
				this.LearnedMysticSpells = (this.LearnedMysticSpells | (1 << spellIndex)) >>> 0;
				break;
			case 3: // destruction
				this.LearnedDestructionSpells = (this.LearnedDestructionSpells | (1 << spellIndex)) >>> 0;
				break;
		}
	}

	get LearnedSpells() {
		const learnedSpells = [];
		if (this.LearnedHealingSpells !== 0) {
			for (let i = 1; i < 31; ++i) {
				if ((this.LearnedHealingSpells & (1 << i)) !== 0)
					learnedSpells.push(i);
			}
		}
		if (this.LearnedAlchemisticSpells !== 0) {
			for (let i = 1; i < 31; ++i) {
				if ((this.LearnedAlchemisticSpells & (1 << i)) !== 0)
					learnedSpells.push(i + 30);
			}
		}
		if (this.LearnedMysticSpells !== 0) {
			for (let i = 1; i < 31; ++i) {
				if ((this.LearnedMysticSpells & (1 << i)) !== 0)
					learnedSpells.push(i + 60);
			}
		}
		if (this.LearnedDestructionSpells !== 0) {
			for (let i = 1; i < 31; ++i) {
				if ((this.LearnedDestructionSpells & (1 << i)) !== 0)
					learnedSpells.push(i + 90);
			}
		}
		if (this.Type === CharacterType.Monster && this.LearnedSpellsType7 !== 0) {
			for (let i = 1; i < 31; ++i) {
				if ((this.LearnedSpellsType7 & (1 << i)) !== 0)
					learnedSpells.push(i + 180);
			}
		}
		return learnedSpells;
	}

	Die(deathCondition = Condition.DeadCorpse) {
		this.Conditions = deathCondition;
		this.Died?.(this);
	}

	/**
	 * Overloads:
	 *  - Damage(damage, deathCondition = Condition.DeadCorpse)
	 *  - Damage(damage, deathAction, deathCondition = Condition.DeadCorpse)
	 */
	Damage(damage, ...args) {
		let deathAction;
		let deathCondition;

		if (args.length === 0 || typeof args[0] === 'number' || args[0] === undefined) {
			deathCondition = args[0] ?? Condition.DeadCorpse;
			deathAction = condition => this.Die(condition);
		} else {
			deathAction = args[0];
			deathCondition = args[1] ?? Condition.DeadCorpse;
		}

		this.HitPoints.CurrentValue = this.HitPoints.CurrentValue <= damage ? 0 : this.HitPoints.CurrentValue - damage;

		if (this.HitPoints.CurrentValue === 0)
			deathAction?.(deathCondition);
	}

	Heal(amount) {
		this.HitPoints.CurrentValue = Math.min(this.HitPoints.TotalMaxValue, this.HitPoints.CurrentValue + amount);
	}

	CanMove(battle = true) { // eslint-disable-line no-unused-vars
		return ConditionExtensions.CanMove(this.Conditions);
	}

	CanFlee() {
		return ConditionExtensions.CanFlee(this.Conditions);
	}

	get VisibleConditions() {
		if (!this.Alive) // When dead, only show the dead condition.
			return [Condition.DeadCorpse];
		else
			return Character.PossibleVisibleConditions.filter(a => hasFlag(this.Conditions, a));
	}
}
