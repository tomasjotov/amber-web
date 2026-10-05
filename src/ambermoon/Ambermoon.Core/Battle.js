// Port of Ambermoon.Core/Battle.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Battle logic and visuals

import {
	Event, Queue, initPartFields, applyPartials, hasFlag, newArray, removeItem, orderBy, distinct, sum, count,
	firstOrDefault, max, average, groupBy, range, last, getValue, tryGetValue, format, formatNumber, toByte, toUInt,
	idiv, ArgumentException
} from '../../runtime.js';
import { Battle_AutoBattle } from './Game/AutoBattle.js';
import { ItemType } from '../Ambermoon.Data.Common/Enumerations/ItemType.js';
import { EquipmentSlot } from '../Ambermoon.Data.Common/Enumerations/EquipmentSlot.js';
import { AmmunitionType } from '../Ambermoon.Data.Common/Enumerations/AmmunitionType.js';
import { ItemSlotFlags } from '../Ambermoon.Data.Common/Enumerations/ItemSlotFlags.js';
import { Condition, ConditionExtensions } from '../Ambermoon.Data.Common/Enumerations/Condition.js';
import { Color as TextColor, TextColors } from '../Ambermoon.Data.Common/Enumerations/Color.js';
import { Spell, SpellExtensions } from '../Ambermoon.Data.Common/Enumerations/Spells.js';
import { SpellTarget, SpellTargetExtensions, SpellInfos, SpellApplicationArea } from '../Ambermoon.Data.Common/SpellInfo.js';
import { MonsterAnimationType } from '../Ambermoon.Data.Common/Enumerations/MonsterAnimationType.js';
import { Features } from '../Ambermoon.Data.Common/Enumerations/Features.js';
import { BattleFlags } from '../Ambermoon.Data.Common/Enumerations/BattleFlags.js';
import { ActiveSpellType } from '../Ambermoon.Data.Common/Enumerations/ActiveSpellType.js';
import { CursorType } from '../Ambermoon.Data.Common/CursorType.js';
import { Attribute } from '../Ambermoon.Data.Common/Enumerations/Attribute.js';
import { Skill } from '../Ambermoon.Data.Common/Enumerations/Skill.js';
import { Class } from '../Ambermoon.Data.Common/Enumerations/Class.js';
import { SpellTypeMastery } from '../Ambermoon.Data.Common/Enumerations/SpellSchool.js';
import { UIGraphic } from '../Ambermoon.Data.Common/Enumerations/UIGraphic.js';
import { AdvancedMonsterFlags } from '../Ambermoon.Data.Common/Enumerations/AdvancedMonsterFlags.js';
import { CharacterType } from '../Ambermoon.Data.Common/Enumerations/CharacterType.js';
import { ItemElement, ItemElementExtensions } from '../Ambermoon.Data.Common/Enumerations/ItemElement.js';
import { Monster } from '../Ambermoon.Data.Common/Monster.js';
import { PartyMember } from '../Ambermoon.Data.Common/PartyMember.js';
import { Position } from '../Ambermoon.Common/Position.js';
import { Rect } from '../Ambermoon.Common/Rect.js';
import { Size } from '../Ambermoon.Common/Size.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { EnumHelper } from '../Ambermoon.Common/EnumHelper.js';
import { SpellAnimation } from './Render/SpellAnimation.js';
import { BattleEffect, BattleEffects } from './Render/BattleEffects.js';
import { Layer } from './Render/Layer.js';
import { TextAlign } from './Render/TextAlign.js';
import { Graphics } from './Render/Graphics.js';
import { TextureAtlasManager } from './Render/TextureAtlasManager.js';
import { Global } from './UI/Global.js';

// Note: GameCore is not imported here to avoid module evaluation cycles
// (GameCore.js -> Game/BattleHandling.js -> Battle.js). Static GameCore
// members are accessed through this.game.constructor instead.
const GameCoreOf = game => game.constructor;

/** uint.MaxValue */
const UIntMaxValue = 0xffffffff;

/** Creates a GameCore.BattleEndInfo (declared in Game/BattleHandling.cs) */
function createBattleEndInfo(game, init) {
	return Object.assign(new (GameCoreOf(game).BattleEndInfo)(), init);
}

export class CharacterBattleExtensions {
	static HasLongRangedWeapon(character, itemManager) {
		const itemIndex = character.Equipment?.Slots.get(EquipmentSlot.RightHand)?.ItemIndex;

		if (itemIndex == null || itemIndex === 0)
			return false;

		const weapon = itemManager.GetItem(itemIndex);
		return weapon.Type === ItemType.LongRangeWeapon;
	}

	/** Returns [result, hasAmmo] */
	static HasLongRangedAttack(character, itemManager) {
		let hasAmmo = false;

		const itemIndex = character.Equipment?.Slots.get(EquipmentSlot.RightHand)?.ItemIndex;

		if (itemIndex == null || itemIndex === 0)
			return [false, hasAmmo];

		const weapon = itemManager.GetItem(itemIndex);
		const hasLongRangedWeapon = weapon.Type === ItemType.LongRangeWeapon;

		if (hasLongRangedWeapon) {
			if (weapon.UsedAmmunitionType === AmmunitionType.None) {
				hasAmmo = true;
				return [true, hasAmmo];
			}

			const ammoSlot = character.Equipment.Slots.get(EquipmentSlot.LeftHand);
			hasAmmo = ammoSlot?.ItemIndex != null && ammoSlot.ItemIndex !== 0 && ammoSlot.Amount > 0 &&
				itemManager.GetItem(ammoSlot.ItemIndex).AmmunitionType === weapon.UsedAmmunitionType;

			// I guess for monsters it's fine if the monster has the ammo in inventory
			if (!hasAmmo && character instanceof Monster) {
				hasAmmo = character.Inventory.Slots.some(slot => {
					if (slot?.ItemIndex == null || slot.ItemIndex === 0 || slot.Amount === 0)
						return false;

					const item = itemManager.GetItem(slot.ItemIndex);

					if (item?.Type !== ItemType.Ammunition || item.AmmunitionType !== weapon.UsedAmmunitionType)
						return false;

					return true;
				});
			}

			return [true, hasAmmo];
		}

		return [false, hasAmmo];
	}
}

export const BattleActionType = Object.freeze({
	None: 0,
	/// Parameter: New position index (0-29)
	///
	/// Plays the move animation for monsters and the moves
	/// the monster or party member.
	Move: 1,
	/// No parameter
	///
	/// This is an immediate action for the party and is therefore
	/// processed outside of battle rounds. If the monster group decides
	/// to move forward this is done as the last action in a battle round.
	MoveGroupForward: 2,
	/// - Lowest 5 bits: Tile index (0-29) to attack
	/// - Next 11 bits: Weapon item index (can be 0 -> attacking without weapon)
	/// - Next 11 bits: Optional ammunition item index
	///
	/// This plays a monster or attack animation and prints text about
	/// how much damage the attacker dealt or if he missed etc.
	///
	/// After this an additional Hurt action will follow
	/// which plays the hurt animation and removed the hitpoints from the enemy.
	Attack: 3,
	/// No parameter
	///
	/// This is not used as a real action and it is only available for party members.
	/// Each player who picks this action will get a chance equal to his Parry
	/// skill to block physical attacks. This is only checked if the attack did
	/// not miss or failed before.
	Parry: 4,
	/// Parameter:
	/// - Lowest 5 bits: Tile index (0-29) or row (0-4) to cast spell on
	/// - Next 11 bits: Item index (when spell came from an item, otherwise 0)
	/// - Upper 16 bits: Spell index
	///
	/// This plays the spell animation and also calculates and applies
	/// spell effects like damage. So this also plays hurt effects on monsters.
	CastSpell: 5,
	/// No parameter
	///
	/// Plays the flee animation for monsters and removes the monster or
	/// party member from the battle.
	Flee: 6,
	/// No parameter
	///
	/// This just prints text about what the actor is doing.
	/// The text depends on the following enqueued action.
	DisplayActionText: 7,
	/// - Lowest 5 bits: Tile index (0-29) which should be hurt
	/// - Rest: Damage amount
	///
	/// This is playing hurt animations like blood on monsters
	/// or claw on player. It also removes the hitpoints and
	/// displays this as an effect on players.
	/// This is used after attacks only, spells will automatically
	/// play the hurt animations as well.
	/// It is added for every  attack action but might be
	/// skipped if attack misses etc.
	Hurt: 8,
	// The following actions will be optional actions
	// that might occur by chance.
	WeaponBreak: 9,
	ArmorBreak: 10,
	DefenderWeaponBreak: 11,
	DefenderShieldBreak: 12,
	LastAmmo: 13,
	DropWeapon: 14
});

/*
 * Possible action chains:
 *
 *  - Attack
 *      1. DisplayActionText
 *      2. Attack
 *      3. Hurt
 *  - Cast spell
 *      1. DisplayActionText
 *      2. CastSpell
 *  - Move
 *      1. DisplayActionText
 *      2. Move
 *  - Flee
 *      1. DisplayActionText
 *      2. Flee
 *  - Parry
 *      This isn't executed in battle but a parrying
 *      character has a chance to parry an attack.
 *  - MoveGroupForward
 *      1. DisplayActionText
 *      2. MoveGroupForward
 */

export class PlayerBattleAction {
	constructor() {
		this.BattleAction = BattleActionType.None;
		this.Parameter = 0;
	}
}

export class BattleAction {
	constructor() {
		this.Character = null;
		this.Action = BattleActionType.None;
		this.ActionParameter = 0;
		this.Skip = false; // Used for hurt actions if attacks miss, etc.
	}
}

/** Creates a BattleAction like the C# object initializer */
function createBattleAction(character, action, actionParameter, skip = false) {
	const battleAction = new BattleAction();
	battleAction.Character = character;
	battleAction.Action = action;
	battleAction.ActionParameter = actionParameter;
	battleAction.Skip = skip;
	return battleAction;
}

const RangeType = Object.freeze({
	Move: 0,
	Enemy: 1,
	Friend: 2
});

// [Flags]
const AttackActionFlags = Object.freeze({
	BreakWeapon: 0x01000000,
	BreakArmor: 0x02000000,
	LastAmmo: 0x04000000,
	BreakDefenderWeapon: 0x08000000,
	BreakDefenderShield: 0x10000000
});

const AttackResult = Object.freeze({
	Damage: 0,
	Failed: 1, // Chance depending on attackers ATT skill
	NoDamage: 2, // Chance depending on ATK / DEF
	Missed: 3, // Target moved
	Blocked: 4, // Parry
	Protected: 5, // Magic protection level
	Petrified: 6, // Petrified monsters can't be damaged
	CriticalHit: 7,
	Immune: 8, // New in AA
});

class ImitationBackupData {
	static SkillIndexMapping = [Skill.Attack, Skill.Parry, Skill.CriticalHit, Skill.UseMagic];

	constructor(partyMember, monsterGraphicIndex) {
		this.currentAttributes = newArray(8, 0);
		this.maxAttributes = newArray(8, 0);
		this.currentSkills = newArray(4, 0);
		this.maxSkills = newArray(4, 0);
		this.MonsterGraphicIndex = monsterGraphicIndex;
		this.attacksPerRound = partyMember.AttacksPerRound;
		this.element = partyMember.Element;
		this.currentHitPoints = partyMember.HitPoints.CurrentValue;
		this.maxHitPoints = partyMember.HitPoints.MaxValue;
		this.currentSpellPoints = partyMember.SpellPoints.CurrentValue;
		this.maxSpellPoints = partyMember.SpellPoints.MaxValue;
		this.baseAttack = partyMember.BaseAttackDamage;
		this.baseDefense = partyMember.BaseDefense;
		this.magicAttack = partyMember.MagicAttack;
		this.magicDefense = partyMember.MagicDefense;
		for (let i = 0; i < 8; ++i) {
			const attribute = partyMember.Attributes[i];
			this.maxAttributes[i] = attribute.MaxValue;
			this.currentAttributes[i] = attribute.CurrentValue;
		}
		for (let i = 0; i < 4; ++i) {
			const skill = partyMember.Skills[ImitationBackupData.SkillIndexMapping[i]];
			this.maxSkills[i] = skill.MaxValue;
			this.currentSkills[i] = skill.CurrentValue;
		}
		this.learnedSpells = partyMember.LearnedMysticSpells;
	}

	ApplyToPartyMember(partyMember) {
		partyMember.AttacksPerRound = this.attacksPerRound;
		partyMember.Element = this.element;
		partyMember.HitPoints.MaxValue = this.maxHitPoints;
		if (partyMember.HitPoints.CurrentValue > this.maxHitPoints)
			partyMember.HitPoints.CurrentValue = this.maxHitPoints;
		partyMember.SpellPoints.MaxValue = this.maxSpellPoints;
		if (partyMember.SpellPoints.MaxValue === 0)
			partyMember.SpellPoints.CurrentValue = this.currentSpellPoints;
		else if (partyMember.SpellPoints.CurrentValue > this.maxSpellPoints)
			partyMember.SpellPoints.CurrentValue = this.maxSpellPoints;
		for (let i = 0; i < 8; ++i) {
			const attribute = partyMember.Attributes[i];
			attribute.MaxValue = this.maxAttributes[i];
			attribute.CurrentValue = this.currentAttributes[i];
		}
		for (let i = 0; i < 4; ++i) {
			const skill = partyMember.Skills[ImitationBackupData.SkillIndexMapping[i]];
			skill.MaxValue = this.maxSkills[i];
			skill.CurrentValue = this.currentSkills[i];
		}
		partyMember.LearnedHealingSpells = 0;
		partyMember.LearnedAlchemisticSpells = 0;
		partyMember.LearnedMysticSpells = this.learnedSpells;
		partyMember.LearnedDestructionSpells = 0;
		partyMember.SpellMastery = partyMember.Class === Class.Mystic ? SpellTypeMastery.Mystic | SpellTypeMastery.Mastered : SpellTypeMastery.Mystic;
		partyMember.BaseDefense = this.baseDefense;
		partyMember.BonusAttackDamage = this.baseDefense;
		partyMember.MagicAttack = this.magicAttack;
		partyMember.MagicDefense = this.magicDefense;
		partyMember.InventoryInaccessible = false;
	}
}

const kv = (Key, Value) => ({ Key, Value });

/** The BattleEndInfo which is used in several places when all monsters are defeated (inlined in C#) */
function createMonstersDefeatedBattleEndInfo(battle) {
	return createBattleEndInfo(battle.game, {
		MonstersDefeated: true,
		KilledMonsters: battle.initialMonsters.filter(m => !battle.fledCharacters.includes(m)),
		FledPartyMembers: battle.fledCharacters.filter(c => c?.Type === CharacterType.PartyMember),
		TotalExperience: sum(battle.initialMonsters, m => m.DefeatExperience),
		BrokenItems: battle.brokenItems
	});
}

// Note: The part list is built lazily. If Game/AutoBattle.js is the module which is evaluated
// first (import cycle), Battle_AutoBattle is not initialized yet when this module is evaluated.
// In that case the partials are applied on the first construction of a Battle (see ensurePartials).
const BattlePartials = () => [Battle_AutoBattle];
let battlePartialsApplied = false;

function ensurePartials() {
	if (!battlePartialsApplied) {
		applyPartials(Battle, BattlePartials());
		battlePartialsApplied = true;
	}
}

export class Battle {
	static BattleActionType = BattleActionType;
	static PlayerBattleAction = PlayerBattleAction;
	static BattleAction = BattleAction;
	static RangeType = RangeType;
	static AttackActionFlags = AttackActionFlags;
	static AttackResult = AttackResult;
	static ImitationBackupData = ImitationBackupData;

	static DestructionSpellDamageValues = [
		// Mudsling
		kv(4, 8),
		// Rockfall
		kv(10, 25),
		// Earthslide
		kv(8, 16),
		// Earthquake
		kv(8, 22),
		// Winddevil
		kv(8, 16),
		// Windhowler
		kv(16, 48),
		// Thunderbolt
		kv(20, 32),
		// Whirlwind
		kv(20, 35),
		// Firebeam
		kv(20, 30),
		// Fireball
		kv(40, 85),
		// Firestorm
		kv(35, 65),
		// Firepillar
		kv(40, 70),
		// Waterfall
		kv(32, 60),
		// Iceball
		kv(90, 180),
		// Icestorm
		kv(64, 128),
		// Iceshower
		kv(128, 256)
	];

	static AdjustedDestructionSpellDamageValues = [
		// Mudsling
		kv(5, 10),
		// Rockfall
		kv(15, 25),
		// Earthslide
		kv(10, 22),
		// Earthquake
		kv(8, 20),
		// Winddevil
		kv(20, 35),
		// Windhowler
		kv(30, 50),
		// Thunderbolt
		kv(25, 45),
		// Whirlwind
		kv(20, 40),
		// Firebeam
		kv(35, 55),
		// Fireball
		kv(70, 105),
		// Firestorm
		kv(65, 95),
		// Firepillar
		kv(55, 85),
		// Waterfall
		kv(60, 75),
		// Iceball
		kv(110, 150),
		// Icestorm
		kv(100, 135),
		// Iceshower
		kv(90, 120)
	];

	static SpellBonusTable = [
		0, 100, 100, 100, 100, 100, 100, 100, // Mental spells
		125, 0, 150, 150, 100, 100, 100, 100, // Spirit spells
		100, 100, 0, 100, 100, 100, 100, 100, // Physical spells
		100, 100, 100, 0, 100, 100, 100, 100, // Undead spells
		75, 100, 100, 75, 0, 50, 100, 150, // Earth spells
		75, 100, 100, 75, 150, 0, 50, 100, // Wind spells
		75, 75, 100, 125, 100, 150, 0, 50, // Fire spells
		75, 100, 100, 75, 50, 100, 150, 0  // Water spells
	];

	constructor(game, layout, partyMembers, monsterGroup, monsterBattleAnimations, needsClickForNextAction) {
		ensurePartials();
		initPartFields(this, BattlePartials());
		const maxPartyMembers = GameCoreOf(game).MaxPartyMembers;
		this.roundBattleActions = new Queue();
		this.battleField = newArray(6 * 5);
		this.parryingPlayers = [];
		this.fledCharacters = [];
		this.hurriedPlayers = [];
		this.monsterSizeDisplayLayerMapping = new Map();
		this.animationStartTicks = null;
		this.currentlyAnimatedMonster = null;
		this.currentBattleAnimation = null;
		this.startAnimationRunning = false;
		this.idleAnimationRunning = false;
		this.finishedStartAnimationCount = 0;
		this.nextIdleAnimationTicks = 0;
		this.startAnimationMonsters = new Queue();
		this.effectAnimations = null;
		this.currentSpellAnimation = null;
		this.brokenItems = [];
		this.droppedWeaponMonsters = [];
		this.totalPlayerDamage = newArray(maxPartyMembers, 0);
		this.numSuccessfulPlayerHits = newArray(maxPartyMembers, 0);
		this.averagePlayerDamage = newArray(maxPartyMembers, 0);
		this.monsterMorale = [];
		this.totalMonsterDamage = [];
		this.numSuccessfulMonsterHits = [];
		this.averageMonsterDamage = [];
		this.relativeDamageEfficiency = 0;
		this.showMonsterLP = false;
		this.showElements = false;
		this.foreseeMagic = false;
		this.foreseeAttack = false;
		this.weakenedMonsters = [];
		this.protectedCharacters = [];
		this.agingValues = new Map();
		this.anyMonsterWantedToFlee = false;
		this.NeedsClickForNextAction = false;
		this.Speed = 0;
		this.ReadyForNextAction = false;
		this.WaitForClick = false;
		this.SkipNextBattleFieldClick = false;
		this.StartAnimationFinished = new Event();
		this.RoundFinished = new Event();
		this.CharacterDied = new Event();
		this.BattleEnded = new Event();
		this.ActionCompleted = new Event();
		this.PlayerWeaponBroke = new Event();
		this.PlayerLastAmmoUsed = new Event();
		this.PlayerLostTarget = new Event();
		this.AnimationFinished = new Event();
		this.initialMonsters = [];
		this.battleFieldDamageTexts = new Map();
		this.RoundActive = false;
		this.HasStartAnimation = false;
		this.imitationBackupData = new Map();

		this.game = game;
		this.layout = layout;
		this.partyMembers = partyMembers;
		this.NeedsClickForNextAction = needsClickForNextAction;

		// place characters
		for (let i = 0; i < partyMembers.length; ++i) {
			if (partyMembers[i] != null && partyMembers[i].Alive) {
				this.battleField[18 + game.CurrentSavegame.BattlePositions[i]] = partyMembers[i];
			}
		}

		const monsterSizes = [];

		for (let y = 0; y < 3; ++y) {
			for (let x = 0; x < 6; ++x) {
				const monster = monsterGroup.Monsters[x][y];

				if (monster != null) {
					const index = x + y * 6;
					this.battleField[index] = monster;
					getValue(monsterBattleAnimations, index).AnimationFinished.add(() => this.MonsterAnimationFinished(monster));
					this.initialMonsters.push(monster);
					this.totalMonsterDamage.push(0);
					this.numSuccessfulMonsterHits.push(0);
					this.averageMonsterDamage.push(0);
					this.monsterMorale.push(monster.Morale);
					monsterSizes.push(monster.MappedFrameWidth);
				}
			}
		}

		monsterSizes.sort((a, b) => a - b);

		// Each row has a display layer range of 60 (row 0: 1-60, row 1: 61-120, row 2: 121-180, row 3: 181-240).
		// Depending on monster size an offset of 0, 6, 12, 18, 24, 30, 36, 42, 48 or 54 is possible (up to 10 monster sizes).
		// Smaller (thinner) monsters get higher values to appear in front of larger monsters.
		// Each column then increases the value by 0 to 5.
		let currentMonsterSizeIndex = 0;

		for (const monsterSize of distinct(monsterSizes)) {
			this.monsterSizeDisplayLayerMapping.set(monsterSize, (9 - currentMonsterSizeIndex) * 6);

			if (currentMonsterSizeIndex < 9)
				++currentMonsterSizeIndex;
		}

		this.effectAnimations = [];

		const startAnimationMonsters = this.Monsters.filter(m => m.Animations[MonsterAnimationType.Start].UsedAmount !== 0);

		if (startAnimationMonsters.length !== 0) {
			this.HasStartAnimation = true;
			this.animationStartTicks = 0;
			this.startAnimationRunning = true;
			this.currentlyAnimatedMonster = startAnimationMonsters[0];

			for (const monster of startAnimationMonsters.slice(1)) {
				this.startAnimationMonsters.Enqueue(monster);
				layout.UpdateMonsterCombatSprite(monster, MonsterAnimationType.Start, 0, 0);
			}

			layout.UpdateMonsterCombatSprite(this.currentlyAnimatedMonster, MonsterAnimationType.Start, 0, 0);
		} else {
			game.EndSequence();
			this.SetupNextIdleAnimation(0);
		}
	}

	get Monsters() { return this.battleField.filter(c => c?.Type === CharacterType.Monster); }
	get PartyMembers() { return this.battleField.filter(c => c?.Type === CharacterType.PartyMember); }
	get Characters() { return this.battleField.filter(c => c != null); }

	/** GetCharacterAt(index) or GetCharacterAt(column, row) */
	GetCharacterAt(column, row) {
		if (arguments.length >= 2)
			return this.GetCharacterAt(column + row * 6);
		return this.battleField[column] ?? null;
	}

	GetSlotFromCharacter(character) { return this.battleField.indexOf(character); }
	HasPartyMemberFled(partyMember) { return this.fledCharacters.includes(partyMember); }
	IsBattleFieldEmpty(slot) { return this.battleField[slot] == null; }

	get CanPartyMoveForward() {
		return !this.battleField.slice(12, 18).some(c => c != null) && // middle row empty
			!this.battleField.slice(18, 24).some(c => c?.Type === CharacterType.Monster); // and no monster in front row
	}

	get CanMonstersMoveForward() { return !this.battleField.slice(18, 24).some(c => c != null); } // 4th row empty
	get StartAnimationPlaying() { return this.startAnimationRunning; }

	SetMonsterAnimations(monsterBattleAnimations) {
		for (const [Key, Value] of monsterBattleAnimations) {
			const monster = this.GetCharacterAt(Key);
			if (monster instanceof Monster)
				Value.AnimationFinished.add(() => this.MonsterAnimationFinished(monster));
		}
	}

	MonsterAnimationFinished(monster) {
		if (!this.startAnimationRunning) {
			this.animationStartTicks = null;
			this.idleAnimationRunning = false;
			this.currentlyAnimatedMonster = null;
			this.layout.ResetMonsterCombatSprite(monster);
		}
	}

	SetupNextIdleAnimation(battleTicks) {
		// TODO: adjust to work like original
		// TODO: in original idle animations can also occur in active battle round while no other animation is played
		this.nextIdleAnimationTicks = battleTicks + Math.trunc(this.game.RandomInt(1, 16) * GameCoreOf(this.game).TicksPerSecond / 4);
	}

	InitImitatingPlayers() {
		for (const partyMember of this.PartyMembers.filter(partyMember => partyMember.Alive && !this.fledCharacters.includes(partyMember))) {
			const [found, backup] = tryGetValue(this.imitationBackupData, partyMember.Index);
			if (found) {
				this.game.ReplacePartyMemberBattleFieldSprite(partyMember, backup.MonsterGraphicIndex);
			}
		}
	}

	Update(battleTicks, normalizedBattleTicks) {
		const layout = this.layout;

		if (this.RoundActive && this.roundBattleActions.Count !== 0 && (this.currentlyAnimatedMonster == null || this.idleAnimationRunning)) {
			const currentAction = this.roundBattleActions.Peek();

			if (currentAction.Character instanceof Monster) {
				const currentMonster = currentAction.Character;
				const animationType = BattleActionExtensions.ToAnimationType(currentAction.Action);

				if (animationType != null) {
					if (this.idleAnimationRunning) { // idle animation still running
						this.idleAnimationRunning = false;
						layout.ResetMonsterCombatSprite(this.currentlyAnimatedMonster);
						this.animationStartTicks = battleTicks;
					} else if (this.animationStartTicks == null) {
						this.animationStartTicks = battleTicks;
					}

					const animationTicks = battleTicks - this.animationStartTicks;
					this.currentlyAnimatedMonster = currentMonster;
					layout.UpdateMonsterCombatSprite(this.currentlyAnimatedMonster, animationType, animationTicks, battleTicks);
				}
			}
		}

		if (!this.RoundActive && this.startAnimationRunning && this.finishedStartAnimationCount > 0)
			this.WaitForClick = true;

		if (this.startAnimationRunning) {
			const animationTicks = normalizedBattleTicks - this.animationStartTicks;

			if (layout.UpdateMonsterCombatSprite(this.currentlyAnimatedMonster, MonsterAnimationType.Start, animationTicks, normalizedBattleTicks)?.Finished !== false) {
				// start animation finished
				++this.finishedStartAnimationCount;

				if (this.startAnimationMonsters.Count !== 0) {
					// still more start animations to play
					this.animationStartTicks = normalizedBattleTicks;
					if (this.currentlyAnimatedMonster != null)
						layout.ResetMonsterCombatSprite(this.currentlyAnimatedMonster);
					this.currentlyAnimatedMonster = this.startAnimationMonsters.Dequeue();
					layout.UpdateMonsterCombatSprite(this.currentlyAnimatedMonster, MonsterAnimationType.Start, 0, normalizedBattleTicks);
				} else {
					this.WaitForClick = false;
					this.game.EndSequence();
					this.animationStartTicks = null;
					this.startAnimationRunning = false;
					if (this.currentlyAnimatedMonster != null)
						layout.ResetMonsterCombatSprite(this.currentlyAnimatedMonster);
					this.SetupNextIdleAnimation(normalizedBattleTicks);
					this.StartAnimationFinished.invoke();
				}
			}
		} else if (this.idleAnimationRunning) {
			const animationTicks = normalizedBattleTicks - this.animationStartTicks;

			// Note: Idle animations use the move animation.
			if (layout.UpdateMonsterCombatSprite(this.currentlyAnimatedMonster, MonsterAnimationType.Move, animationTicks, normalizedBattleTicks)?.Finished !== false) {
				this.animationStartTicks = null;
				this.idleAnimationRunning = false;
				if (this.currentlyAnimatedMonster != null)
					layout.ResetMonsterCombatSprite(this.currentlyAnimatedMonster);
				this.SetupNextIdleAnimation(normalizedBattleTicks);
			}
		} else if (!this.RoundActive) {
			if (normalizedBattleTicks >= this.nextIdleAnimationTicks) {
				const monsters = this.Monsters.filter(m => ConditionExtensions.CanMove(m.Conditions));

				if (monsters.length !== 0) {
					const index = this.game.RandomInt(0, monsters.length - 1);
					this.animationStartTicks = normalizedBattleTicks;
					this.idleAnimationRunning = true;
					this.currentlyAnimatedMonster = monsters[index];
					layout.UpdateMonsterCombatSprite(this.currentlyAnimatedMonster, MonsterAnimationType.Move, 0, normalizedBattleTicks);
				}
			}
		}

		if (this.ReadyForNextAction && (!this.NeedsClickForNextAction || !this.WaitForClick))
			this.NextAction(battleTicks);

		if (this.currentBattleAnimation != null) {
			if (!this.currentBattleAnimation.Update(battleTicks)) {
				this.currentBattleAnimation = null;
				this.AnimationFinished.invoke();
			} else if (this.currentlyAnimatedMonster != null) {
				this.SetMonsterDisplayLayer(this.currentBattleAnimation, this.currentlyAnimatedMonster);
			}
		}

		for (const effectAnimation of this.effectAnimations.slice()) {
			if (effectAnimation != null && !effectAnimation.Finished) {
				effectAnimation.Update(battleTicks);
			}
		}

		if (this.currentSpellAnimation != null)
			this.currentSpellAnimation.Update(battleTicks);
	}

	GetMonsterDisplayLayer(monster, position = null) {
		position ??= this.GetCharacterPosition(monster);
		// Each row has a display layer range of 60 (row 0: 1-60, row 1: 61-120, row 2: 121-180, row 3: 181-240).
		// Depending on monster size an offset of 0, 6, 12, 18, 24, 30, 36, 42, 48 or 54 is possible (up to 10 monster sizes).
		// Each column then increases the value by 0 to 5.
		const column = position % 6;
		const row = Math.trunc(position / 6);
		return toByte(1 + row * 60 + getValue(this.monsterSizeDisplayLayerMapping, monster.MappedFrameWidth) + column);
	}

	SetMonsterDisplayLayer(animation, monster, position = null) {
		const displayLayer = this.GetMonsterDisplayLayer(monster, position);
		animation.SetDisplayLayer(displayLayer);
	}

	static GetLPString(lp) { return lp > 999 ? '***' : String(lp); }

	static GetMonsterLPString(monster) {
		return `${Battle.GetLPString(monster.HitPoints.CurrentValue)}/${Battle.GetLPString(monster.HitPoints.TotalMaxValue)}`;
	}

	GetElementString(monster) {
		return `${this.game.DataNameProvider.ElementLabel} ${this.game.DataNameProvider.GetElementName(monster.Element)}`;
	}

	/// Called while updating the battle. Each call will
	/// perform the next action which can be a movement,
	/// attack, spell cast, flight or group forward move.
	///
	/// StartRound will automatically call
	/// this method.
	///
	/// Each action may trigger some text messages,
	/// animations or other changes.
	NextAction(battleTicks) {
		this.ReadyForNextAction = false;

		if (this.roundBattleActions.Count === 0) {
			// Check for monster advance at end of round
			if (!this.anyMonsterWantedToFlee && this.CanMonstersMoveForward && count(this.PartyMembers, p => p.Alive && !hasFlag(p.Conditions, Condition.Petrified) && !this.fledCharacters.includes(p)) > 1) {
				const firstMonster = firstOrDefault(this.Monsters, c => c.Alive && !this.fledCharacters.includes(c)); // take any existing one to avoid NullRef exception
				if (firstMonster != null) {
					this.roundBattleActions.Enqueue(createBattleAction(firstMonster, BattleActionType.DisplayActionText, 0));
					this.roundBattleActions.Enqueue(createBattleAction(firstMonster, BattleActionType.MoveGroupForward, 0));
					this.anyMonsterWantedToFlee = true; // set this so the monsters can't advance again this round
					this.NextAction(battleTicks); // call this again but now roundBattleActions.Count is not 0, so it will execute the advance actions
					return;
				}
			}

			this.anyMonsterWantedToFlee = false;
			this.RoundActive = false;
			if (this.showMonsterLP || this.showElements) {
				for (const monster of this.Monsters) {
					this.SetMonsterTooltip(monster);
				}
			}

			this.foreseeMagic = false;
			this.foreseeAttack = false;
			this.protectedCharacters.length = 0;

			for (const actor of this.Characters) {
				if (hasFlag(actor.Conditions, Condition.Aging)) {
					const [found, value] = tryGetValue(this.agingValues, actor);
					if (!found)
						this.agingValues.set(actor, 10);
					else if (value < 50)
						this.agingValues.set(actor, this.agingValues.get(actor) + 10);
				}
			}

			this.RoundFinished.invoke();

			return;
		}

		const action = this.roundBattleActions.Dequeue();

		if (action.Skip) {
			this.NextAction(battleTicks);
			return;
		}

		this.RunBattleAction(action, battleTicks);
	}

	SetMonsterTooltip(monster) {
		let tooltip = '';

		if (this.showMonsterLP) {
			tooltip = Battle.GetMonsterLPString(monster) + '^';

			if (this.showElements)
				tooltip += this.GetElementString(monster) + '^';
		} else if (this.showElements) {
			tooltip = this.GetElementString(monster) + '^';
		}

		tooltip += monster.Name;

		this.layout.GetMonsterBattleFieldTooltip(monster).Text = tooltip;
	}

	ResetClick() {
		this.SkipNextBattleFieldClick = false;
	}

	Click(battleTicks) {
		if (this.HasStartAnimation && this.startAnimationRunning && this.currentlyAnimatedMonster != null && this.finishedStartAnimationCount > 0) {
			// You can abort start animations after the first character by clicking
			this.startAnimationMonsters.Clear(); // clear all other start animation monsters
			for (const monster of this.Monsters.filter(m => m.Animations[MonsterAnimationType.Start].UsedAmount !== 0)) {
				if (monster !== this.currentlyAnimatedMonster)
					this.layout.GetMonsterBattleAnimation(monster).Reset();
			}
			this.layout.GetMonsterBattleAnimation(this.currentlyAnimatedMonster).Reset(); // this finishes the animation
			return;
		}

		this.SkipNextBattleFieldClick = false;

		if (!this.WaitForClick)
			return;

		this.WaitForClick = false;
		this.SkipNextBattleFieldClick = true;

		if (this.RoundActive) {
			if (this.ReadyForNextAction && this.NeedsClickForNextAction) {
				this.NextAction(battleTicks);
			}
		} else {
			this.layout.SetBattleMessage(null);
			this.game.InputEnable = true;
		}
	}

	PoisonDamageMonster(monster, followAction) {
		const game = this.game;
		const animation = this.layout.GetMonsterBattleAnimation(monster);
		const damage = game.RandomInt(1, 5);

		const EndHurt = () => {
			monster.Damage(damage);

			if (!monster.Alive) {
				this.HandleCharacterDeath(null, monster, followAction);
			} else {
				followAction?.();
			}
		};

		let hurtAnimFinished = false;
		let hurtSplashFinished = false;

		const HurtAnimationFinished = () => {
			animation.AnimationFinished.remove(HurtAnimationFinished);
			this.currentBattleAnimation = null;
			this.currentlyAnimatedMonster = null;
			hurtAnimFinished = true;

			if (hurtSplashFinished)
				EndHurt();
		};

		const HurtSplashFinished = () => {
			hurtSplashFinished = true;

			if (hurtAnimFinished)
				EndHurt();
		};

		animation.AnimationFinished.add(HurtAnimationFinished);
		const frames = monster.GetAnimationFrameIndices(MonsterAnimationType.Hurt);
		animation.Play(frames, Math.trunc(Math.trunc(GameCoreOf(game).TicksPerSecond / 2) / frames.length), game.CurrentBattleTicks);
		this.currentBattleAnimation = animation;
		this.currentlyAnimatedMonster = monster;
		const tile = this.GetSlotFromCharacter(monster);

		this.PlayBattleEffectAnimation(BattleEffect.HurtMonster, toUInt(tile), game.CurrentBattleTicks, HurtSplashFinished);
		this.ShowBattleFieldDamage(tile, damage);
		if (hasFlag(monster.Conditions, Condition.Sleep))
			game.RemoveCondition(Condition.Sleep, monster);
	}

	/// <summary>
	/// Starts a new battle round.
	/// </summary>
	/// <param name="playerBattleActions">Battle actions for party members 1-6.</param>
	/// <param name="battleTicks">Battle ticks when starting the round.</param>
	StartRound(playerBattleActions, battleTicks) {
		this.game.ProcessPoisonDamage(1, _ => {
			const Start = () => {
				// Recalculate the RDE value each round
				const partyDamage = Util.Limit(1, sum(this.averagePlayerDamage.filter((d, i) => this.partyMembers[i] != null && this.battleField.includes(this.partyMembers[i]))), 0x7fff);
				const monsterDamage = Util.Limit(1, sum(this.averageMonsterDamage.filter((d, i) => this.battleField.includes(this.initialMonsters[i]))), 0x7fff);
				this.relativeDamageEfficiency = Math.min(Math.trunc(partyDamage * 50 / monsterDamage), 100);

				const roundActors = orderBy(this.battleField.filter(f => f != null),
					[c => c.Attributes[Attribute.Speed].TotalCurrentValue, true],
					c => c.Type);
				this.parryingPlayers.length = 0;

				for (const droppedWeaponMonster of this.droppedWeaponMonsters) {
					if (roundActors.includes(droppedWeaponMonster)) {
						this.roundBattleActions.Enqueue(createBattleAction(droppedWeaponMonster, BattleActionType.DropWeapon, 0));
					}
				}

				this.droppedWeaponMonsters.length = 0;
				this.anyMonsterWantedToFlee = false;

				const forbiddenMoveSpots = playerBattleActions.filter(a => a != null && a.BattleAction === BattleActionType.Move)
					.map(a => Battle.GetTargetTileOrRowFromParameter(a.Parameter));
				const forbiddenMonsterMoveSpots = [];

				for (const roundActor of roundActors) {
					if (roundActor instanceof Monster) {
						this.AddMonsterActions(roundActor, forbiddenMonsterMoveSpots);
					} else {
						const partyMember = roundActor instanceof PartyMember ? roundActor : null;
						const playerIndex = this.partyMembers.indexOf(partyMember);
						const playerAction = playerBattleActions[playerIndex];

						if (hasFlag(partyMember.Conditions, Condition.Panic)) {
							this.PickPanicAction(partyMember, playerAction, forbiddenMoveSpots);
						} else if (hasFlag(partyMember.Conditions, Condition.Crazy)) {
							this.PickMadAction(partyMember, playerAction, forbiddenMoveSpots);
						}

						if (playerAction.BattleAction === BattleActionType.None)
							continue;
						if (playerAction.BattleAction === BattleActionType.Parry) {
							this.parryingPlayers.push(partyMember);
							continue;
						}

						// Note: We add twice as much attack actions but the second half with
						// Skip=true. They will be used if the player has the Hurry buff.
						const numActions = playerAction.BattleAction === BattleActionType.Attack
							? partyMember.AttacksPerRound * 2 : 1;

						for (let i = 0; i < numActions; ++i) {
							const skip = i >= partyMember.AttacksPerRound;
							this.roundBattleActions.Enqueue(createBattleAction(partyMember, BattleActionType.DisplayActionText, 0, skip));
							this.roundBattleActions.Enqueue(createBattleAction(partyMember, playerAction.BattleAction, playerAction.Parameter, skip));
							if (playerAction.BattleAction === BattleActionType.Attack) {
								const hurtParameter = () => Battle.CreateHurtParameter(Battle.GetTargetTileOrRowFromParameter(playerAction.Parameter));
								this.roundBattleActions.Enqueue(createBattleAction(partyMember, BattleActionType.WeaponBreak, hurtParameter(), skip));
								this.roundBattleActions.Enqueue(createBattleAction(partyMember, BattleActionType.ArmorBreak, hurtParameter(), skip));
								this.roundBattleActions.Enqueue(createBattleAction(partyMember, BattleActionType.DefenderWeaponBreak, hurtParameter(), skip));
								this.roundBattleActions.Enqueue(createBattleAction(partyMember, BattleActionType.DefenderShieldBreak, hurtParameter(), skip));
								this.roundBattleActions.Enqueue(createBattleAction(partyMember, BattleActionType.LastAmmo, hurtParameter(), skip));
								this.roundBattleActions.Enqueue(createBattleAction(partyMember, BattleActionType.Hurt, hurtParameter(), skip));
							}
						}
					}
				}

				this.RoundActive = true;
				this.NextAction(battleTicks);
			};

			// Remove all died party members from the battle field
			for (const partyMember of this.partyMembers.filter(p => p != null && !p.Alive))
				this.RemoveCharacterFromBattleField(partyMember);

			const poisonedMonsters = this.Monsters.filter(m => m.Alive && hasFlag(m.Conditions, Condition.Poisoned));

			if (poisonedMonsters.length === 0)
				Start();
			else {
				const HandleMonster = index => {
					const next = index === poisonedMonsters.length - 1
						? Start
						: () => HandleMonster(index + 1);
					const monster = poisonedMonsters[index];
					this.PoisonDamageMonster(monster, next);
				};

				HandleMonster(0);
			}
		});
	}

	AddMonsterActions(monster, forbiddenMonsterMoveSpots) {
		const wantsToFlee = this.MonsterWantsToFlee(monster);

		if (wantsToFlee)
			this.anyMonsterWantedToFlee = true;

		let action;
		let actionParameter;
		let canCast = true;

		while (true) {
			action = this.PickMonsterAction(monster, wantsToFlee, forbiddenMonsterMoveSpots, canCast);

			if (action === BattleActionType.None) // do nothing
				return;

			actionParameter = this.PickActionParameter(action, monster, wantsToFlee, forbiddenMonsterMoveSpots);

			if (action === BattleActionType.CastSpell && actionParameter === 0) {
				canCast = false;
				continue;
			}

			break;
		}

		const numActions = action === BattleActionType.Attack
			? monster.AttacksPerRound : 1;

		for (let i = 0; i < numActions; ++i) {
			this.roundBattleActions.Enqueue(createBattleAction(monster, BattleActionType.DisplayActionText, 0));
			this.roundBattleActions.Enqueue(createBattleAction(monster, action, actionParameter));
			if (action === BattleActionType.Attack) {
				const hurtParameter = () => Battle.CreateHurtParameter(Battle.GetTargetTileOrRowFromParameter(actionParameter));
				this.roundBattleActions.Enqueue(createBattleAction(monster, BattleActionType.WeaponBreak, hurtParameter()));
				this.roundBattleActions.Enqueue(createBattleAction(monster, BattleActionType.ArmorBreak, hurtParameter()));
				this.roundBattleActions.Enqueue(createBattleAction(monster, BattleActionType.DefenderWeaponBreak, hurtParameter()));
				this.roundBattleActions.Enqueue(createBattleAction(monster, BattleActionType.DefenderShieldBreak, hurtParameter()));
				this.roundBattleActions.Enqueue(createBattleAction(monster, BattleActionType.LastAmmo, hurtParameter()));
				this.roundBattleActions.Enqueue(createBattleAction(monster, BattleActionType.Hurt, hurtParameter()));
			}
		}
	}

	KillMonster(attacker, target, targetPosition) {
		this.CharacterDied.invoke(target);
		if (attacker == null) { // death from poison etc
			for (const partyMember of this.PartyMembers.filter(p => p.Alive)) {
				if ([...this.roundBattleActions].some(a => a.Character === partyMember &&
					a.Action === BattleActionType.Attack &&
					Battle.GetTargetTileOrRowFromParameter(a.ActionParameter) === targetPosition))
					this.PlayerLostTarget.invoke(partyMember);
			}
		} else
			this.PlayerLostTarget.invoke(attacker);
		if (this.Monsters.length === 0) {
			this.EndBattleCleanup();
			this.BattleEnded.invoke(createMonstersDefeatedBattleEndInfo(this));
		}
	}

	EndBattleCleanup() {
		this.autoBattleRoundText?.Delete();
		this.autoBattleRoundText = null;
		for (const [, Value] of this.battleFieldDamageTexts)
			Value?.Delete();
		this.battleFieldDamageTexts.clear();
		this.currentSpellAnimation?.Destroy();
		this.currentSpellAnimation = null;
		this.RestoreImitatingPartyMembers();
	}

	/// <summary>
	/// Note: This is only use to end a battle externally (e.g. through a cheat code).
	/// </summary>
	/// <param name="flee"></param>
	EndBattle(flee) {
		if (flee) {
			this.fledCharacters.push(...this.battleField.filter(c => c?.Type === CharacterType.PartyMember));
			this.EndBattleCleanup();
			this.BattleEnded.invoke(createBattleEndInfo(this.game, {
				MonstersDefeated: false
			}));
		} else {
			this.EndBattleCleanup();
			this.BattleEnded.invoke(createMonstersDefeatedBattleEndInfo(this));
		}
	}

	KillPlayer(target) {
		this.CharacterDied.invoke(target);

		if (!this.partyMembers.some(p => p != null && p.Alive && ConditionExtensions.CanFight(p.Conditions) && !this.fledCharacters.includes(p))) {
			this.EndBattleCleanup();
			this.BattleEnded.invoke(createBattleEndInfo(this.game, {
				MonstersDefeated: false
			}));
		} else {
			const targetPartyMember = target instanceof PartyMember ? target : null;
			this.layout.SetCharacter(this.game.SlotFromPartyMember(targetPartyMember), targetPartyMember);
		}
	}

	TrackPlayerHit(partyMember, damage) {
		const index = this.partyMembers.indexOf(partyMember);
		this.totalPlayerDamage[index] += damage;
		++this.numSuccessfulPlayerHits[index];
		this.averagePlayerDamage[index] = Math.trunc(this.totalPlayerDamage[index] / this.numSuccessfulPlayerHits[index]);
	}

	TrackMonsterHit(monster, damage) {
		const index = this.initialMonsters.indexOf(monster);
		this.totalMonsterDamage[index] += damage;
		++this.numSuccessfulMonsterHits[index];
		this.averageMonsterDamage[index] = Math.trunc(this.totalMonsterDamage[index] / this.numSuccessfulMonsterHits[index]);
	}

	Proceed(action, important = false) {
		this.game.AddTimedEvent(this.NeedsClickForNextAction ? 200 : (important ? 2750 : 850) + (100 - this.Speed) * 5, action);
	}

	RunBattleAction(battleAction, battleTicks) {
		const game = this.game;
		const layout = this.layout;
		const TicksPerSecond = GameCoreOf(game).TicksPerSecond;

		game.CursorType = CursorType.Sword;

		const ActionFinished = (needClickAfterwards = true) => {
			this.ActionCompleted.invoke(battleAction);
			if (this.NeedsClickForNextAction && needClickAfterwards)
				this.WaitForClick = true;
			this.ReadyForNextAction = true;
		};

		const DefenderEquipBreak = (flag, equipmentSlot) => {
			const [tile, damage, , flags] = Battle.GetAttackFollowUpInformation(battleAction.ActionParameter);
			const target = this.GetCharacterAt(tile);
			const nextAction = this.roundBattleActions.Peek();
			nextAction.ActionParameter = battleAction.ActionParameter;
			if (hasFlag(flags, flag)) {
				const textColor = target.Type === CharacterType.PartyMember ? TextColor.BattlePlayer : TextColor.BattleMonster;
				const equipSlot = getValue(target.Equipment.Slots, equipmentSlot);
				const itemIndex = equipSlot.ItemIndex;
				const item = game.ItemManager.GetItem(itemIndex);
				if (item.NumberOfHands === 2)
					target.Equipment.Slots.get(EquipmentSlot.LeftHand)?.Clear();
				game.EquipmentRemoved(target, itemIndex, 1, hasFlag(equipSlot.Flags, ItemSlotFlags.Cursed));
				this.brokenItems.push(kv(itemIndex, equipSlot.Flags));
				equipSlot.Clear();
				layout.SetBattleMessage(target.Name + format(game.DataNameProvider.BattleMessageWasBroken, item.Name), textColor);
				this.Proceed(() => ActionFinished(true), true);
			} else {
				ActionFinished(false);
			}
		};

		const SkipAllFollowingAttacks = (character = null) => {
			character ??= battleAction.Character;
			let foundNextDisplayAction = false;

			for (const action of [...this.roundBattleActions].filter(a => a.Character === character)) {
				if (!foundNextDisplayAction) {
					if (action.Action === BattleActionType.DisplayActionText) {
						foundNextDisplayAction = true;
						action.Skip = true;
					}
				} else {
					action.Skip = true;
				}
			}
		};

		const CheckAmmo = (weapon, ammoIndex) => {
			// Check for last ammunition consumption
			if (weapon?.Type === ItemType.LongRangeWeapon) {
				const LastAmmoUsed = () => {
					const followAction = this.roundBattleActions.Peek();
					followAction.ActionParameter = Battle.UpdateAttackFollowActionParameter(followAction.ActionParameter, AttackActionFlags.LastAmmo);
					SkipAllFollowingAttacks();
					if (battleAction.Character instanceof PartyMember)
						this.PlayerLastAmmoUsed.invoke(battleAction.Character);
				};

				const attacker = battleAction.Character;

				if (weapon.UsedAmmunitionType !== AmmunitionType.None) {
					const slot = attacker.Inventory.Slots.find(slot => slot.ItemIndex === ammoIndex && slot.Amount > 0) ?? null;

					if (slot != null) {
						slot.Remove(1);

						if (attacker instanceof PartyMember)
							game.InventoryItemRemoved(ammoIndex, 1, attacker);

						if (slot.Amount === 0) {
							// Do we have more in inventory?
							if (!attacker.Inventory.Slots.some(slot => slot.ItemIndex === ammoIndex && slot.Amount > 0)) {
								const ammoSlot = getValue(attacker.Equipment.Slots, EquipmentSlot.LeftHand);

								if (ammoSlot.ItemIndex !== ammoIndex || ammoSlot.Amount <= 0) {
									// Monsters might only have the ammo in inventory
									LastAmmoUsed();
									return false;
								}
							}
						}
					} else {
						const ammoSlot = getValue(attacker.Equipment.Slots, EquipmentSlot.LeftHand);

						if (ammoSlot.ItemIndex !== ammoIndex || ammoSlot.Amount <= 0) // This should not happen!
							throw new AmbermoonException(ExceptionScope.Application, 'Character used long ranged weapon without needed ammo.');

						ammoSlot.Remove(1);
						game.EquipmentRemoved(attacker, ammoIndex, 1, false);

						if (ammoSlot.Amount === 0) {
							LastAmmoUsed();
							return false;
						}
					}
				}
			}

			return true;
		};

		// If hurried and attacking, enable twice as much attack actions.
		if (battleAction.Character instanceof PartyMember &&
			this.hurriedPlayers.includes(battleAction.Character)) {
			const player = battleAction.Character;

			if ([...this.roundBattleActions].some(a => a.Action === BattleActionType.Attack && a.Character === player)) {
				removeItem(this.hurriedPlayers, player);

				for (const action of [...this.roundBattleActions].filter(a => a.Character === player))
					action.Skip = false;
			}
		}

		const textColorOf = character => character.Type === CharacterType.Monster ? TextColor.BattleMonster : TextColor.BattlePlayer;

		switch (battleAction.Action) {
			case BattleActionType.DropWeapon: {
				// Note: This only displays the message. The PickMonsterAction method will drop/switch ranged weapons automatically.
				layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageHasDroppedWeapon, TextColor.BrightGray);
				this.Proceed(() => ActionFinished());
				return;
			}
			case BattleActionType.DisplayActionText: {
				const next = this.roundBattleActions.Peek();
				let text;

				switch (next.Action) {
					case BattleActionType.Move: {
						const currentRow = Math.trunc(toUInt(this.GetCharacterPosition(next.Character)) / 6);
						const newRow = Math.trunc(next.ActionParameter / 6);
						const retreat = battleAction.Character.Type === CharacterType.Monster && newRow < currentRow;
						text = next.Character.Name + (retreat ? game.DataNameProvider.BattleMessageRetreats : game.DataNameProvider.BattleMessageMoves);
						break;
					}
					case BattleActionType.Flee:
						text = next.Character.Name + game.DataNameProvider.BattleMessageFlees;
						break;
					case BattleActionType.Attack: {
						const [targetTile, weaponIndex, ammoIndex] = Battle.GetAttackInformation(next.ActionParameter);
						const weapon = weaponIndex === 0 ? null : game.ItemManager.GetItem(weaponIndex);
						const target = this.battleField[targetTile] ?? null;

						if (target == null) {
							text = next.Character.Name + game.DataNameProvider.BattleMessageMissedTheTarget;
							this.roundBattleActions.Dequeue(); // Remove the attack action

							if (CheckAmmo(weapon, ammoIndex)) {
								for (const action of [...this.roundBattleActions].filter(a => a.Character === next.Character))
									action.Skip = true;
							}

							if (next.Character instanceof PartyMember)
								this.PlayerLostTarget.invoke(next.Character);
						} else if (weapon == null)
							text = next.Character.Name + format(game.DataNameProvider.BattleMessageAttacks, target.Name);
						else
							text = next.Character.Name + format(game.DataNameProvider.BattleMessageAttacksWith, target.Name, weapon.Name);
						break;
					}
					case BattleActionType.CastSpell: {
						const [, spell, itemSlotIndex, equippedItem] = Battle.GetCastSpellInformation(next.ActionParameter);
						const spellName = game.DataNameProvider.GetSpellName(spell);

						if (itemSlotIndex != null) {
							const itemSlot = equippedItem
								? getValue(battleAction.Character.Equipment.Slots, itemSlotIndex + 1)
								: battleAction.Character.Inventory.Slots[itemSlotIndex];
							const item = game.ItemManager.GetItem(itemSlot.ItemIndex);
							text = next.Character.Name + format(game.DataNameProvider.BattleMessageCastsSpellFrom, spellName, item.Name);
						} else
							text = next.Character.Name + format(game.DataNameProvider.BattleMessageCastsSpell, spellName);
						break;
					}
					case BattleActionType.MoveGroupForward:
						text = next.Character.Type === CharacterType.Monster
							? game.DataNameProvider.BattleMessageMonstersAdvance
							: game.DataNameProvider.BattleMessagePartyAdvances;
						break;
					default:
						text = null;
						break;
				}
				layout.SetBattleMessage(text, next.Character.Type === CharacterType.Monster ? TextColor.BattleMonster : TextColor.BattlePlayer);
				this.Proceed(() => ActionFinished());
				return;
			}
			case BattleActionType.Move: {
				layout.SetBattleMessage(null);

				const EndMove = () => {
					this.MoveCharacterTo(battleAction.ActionParameter, battleAction.Character);
					this.ActionCompleted.invoke(battleAction);
					this.ReadyForNextAction = true;
				};

				let moveFailed = false;
				if (!battleAction.Character.CanMove()) {
					// TODO: is this right or is the action just skipped?
					layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageCannotMove,
						textColorOf(battleAction.Character));
					moveFailed = true;
				} else if (this.battleField[battleAction.ActionParameter & 0x1f] != null) {
					layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageWayWasBlocked,
						textColorOf(battleAction.Character));
					moveFailed = true;
				}

				if (moveFailed) {
					this.Proceed(() => ActionFinished());
					return;
				}

				const currentPosition = this.GetCharacterPosition(battleAction.Character);

				this.HideBattleFieldDamage(currentPosition);

				if (battleAction.Character instanceof Monster) {
					const monster = battleAction.Character;
					const currentColumn = currentPosition % 6;
					const currentRow = Math.trunc(currentPosition / 6);
					const newPosition = Battle.GetTargetTileOrRowFromParameter(battleAction.ActionParameter);
					const newColumn = newPosition % 6;
					const newRow = Math.trunc(newPosition / 6);
					const retreat = newRow < currentRow;
					const animation = layout.GetMonsterBattleAnimation(monster);

					const MoveAnimationFinished = () => {
						animation.AnimationFinished.remove(MoveAnimationFinished);
						this.SetMonsterDisplayLayer(animation, monster, newPosition);
						EndMove();
						this.currentBattleAnimation = null;
						this.currentlyAnimatedMonster = null;
					};

					const newDisplayPosition = layout.GetMonsterCombatCenterPosition(battleAction.ActionParameter % 6, newRow, monster);
					animation.AnimationFinished.add(MoveAnimationFinished);
					const frames = monster.GetAnimationFrameIndices(MonsterAnimationType.Move);
					animation.Play(frames, Math.trunc(Math.max(Math.abs(newRow - currentRow), Math.abs(newColumn - currentColumn)) * TicksPerSecond / (2 * frames.length)),
						battleTicks, newDisplayPosition, layout.RenderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(newRow));
					this.currentBattleAnimation = animation;
					this.currentlyAnimatedMonster = monster;
				} else {
					this.Proceed(EndMove);
				}
				return;
			}
			case BattleActionType.MoveGroupForward:
				// No parameter
				layout.SetBattleMessage(null);
				this.Proceed(() => {
					for (const player of this.PartyMembers.filter(p => p.Alive && !this.fledCharacters.includes(p))) {
						const currentPosition = this.GetCharacterPosition(player);

						this.HideBattleFieldDamage(currentPosition);

						this.MoveCharacterTo(toUInt(currentPosition - 6), player);
					}

					this.ActionCompleted.invoke(battleAction);
					this.ReadyForNextAction = true;
				});
				return;
			case BattleActionType.Attack: {
				const [targetTile, weaponIndex, ammoIndex] = Battle.GetAttackInformation(battleAction.ActionParameter);

				const target = this.GetCharacterAt(targetTile);

				if (target == null) {
					ActionFinished(false);
					return;
				}

				const [attackResult, damage, abort] = this.ProcessAttack(battleAction.Character, targetTile);
				const textColor = textColorOf(battleAction.Character);

				if (abort) {
					for (const action of [...this.roundBattleActions].filter(a => a.Character === battleAction.Character))
						action.Skip = true;
				}

				if (attackResult === AttackResult.Missed && battleAction.Character instanceof PartyMember)
					this.PlayerLostTarget.invoke(battleAction.Character);

				const followAction = this.roundBattleActions.Peek();
				followAction.ActionParameter = Battle.UpdateHurtParameter(followAction.ActionParameter, toUInt(damage), attackResult);
				const weapon = weaponIndex === 0 ? null : game.ItemManager.GetItem(weaponIndex);
				const ammo = ammoIndex === 0 ? null : game.ItemManager.GetItem(ammoIndex);

				if (attackResult === AttackResult.Petrified) {
					if (target.Type === CharacterType.Monster) {
						layout.SetBattleMessage(game.DataNameProvider.BattleMessageCannotDamagePetrifiedMonsters, textColor);
						this.Proceed(() => ActionFinished(true), true);
					} else {
						layout.SetBattleMessage(null);
						ActionFinished(true);
					}
					return;
				}
				if (damage !== 0) {
					const trackDamage = attackResult === AttackResult.CriticalHit ? target.HitPoints.TotalMaxValue : toUInt(damage);

					// Update damage statistics
					if (battleAction.Character instanceof PartyMember) // Memorize last damage for players
						this.TrackPlayerHit(battleAction.Character, trackDamage);
					else if (battleAction.Character instanceof Monster) // Memorize monster damage stats
						this.TrackMonsterHit(battleAction.Character, trackDamage);
				}
				CheckAmmo(weapon, ammoIndex);
				// Check weapon or armor breakage
				if (attackResult !== AttackResult.Missed && attackResult !== AttackResult.Failed) {
					const RollDice1000 = () => game.RandomInt(0, 999);

					if (weapon != null && weapon.CanBreak && RollDice1000() < weapon.BreakChance) {
						followAction.ActionParameter = Battle.UpdateAttackFollowActionParameter(followAction.ActionParameter, AttackActionFlags.BreakWeapon);
						SkipAllFollowingAttacks();
					}

					if (attackResult === AttackResult.Blocked) {
						// When parried the defenders weapon and shield can break instead of the armor
						const enemyWeaponIndex = getValue(target.Equipment.Slots, EquipmentSlot.RightHand).ItemIndex;

						if (enemyWeaponIndex !== 0) {
							const enemyWeapon = game.ItemManager.GetItem(enemyWeaponIndex);

							if (enemyWeapon.CanBreak && RollDice1000() < enemyWeapon.BreakChance) {
								followAction.ActionParameter = Battle.UpdateAttackFollowActionParameter(followAction.ActionParameter, AttackActionFlags.BreakDefenderWeapon);

								if (target instanceof PartyMember) {
									// If the weapon of a party member breaks through parrying
									// he should no longer be able to attack.
									SkipAllFollowingAttacks(target);
								}
							}
						}

						const enemyShieldIndex = getValue(target.Equipment.Slots, EquipmentSlot.LeftHand).ItemIndex;

						if (enemyShieldIndex !== 0 && enemyShieldIndex !== enemyWeaponIndex) {
							const enemyShield = game.ItemManager.GetItem(enemyShieldIndex);

							if (enemyShield.Type === ItemType.Shield && enemyShield.CanBreak && RollDice1000() < enemyShield.BreakChance)
								followAction.ActionParameter = Battle.UpdateAttackFollowActionParameter(followAction.ActionParameter, AttackActionFlags.BreakDefenderShield);
						}
					} else {
						const enemyArmorIndex = getValue(target.Equipment.Slots, EquipmentSlot.Body).ItemIndex;

						if (enemyArmorIndex !== 0) {
							const enemyArmor = game.ItemManager.GetItem(enemyArmorIndex);

							if (enemyArmor.CanBreak && RollDice1000() < enemyArmor.BreakChance)
								followAction.ActionParameter = Battle.UpdateAttackFollowActionParameter(followAction.ActionParameter, AttackActionFlags.BreakArmor);
						}
					}
				}
				const ShowAttackMessage = () => {
					switch (attackResult) {
						case AttackResult.Failed:
							layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageAttackFailed, textColor);
							break;
						case AttackResult.NoDamage:
							layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageAttackDidNoDamage, textColor);
							break;
						case AttackResult.Missed:
							layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageMissedTheTarget, textColor);
							break;
						case AttackResult.Blocked:
							layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageAttackWasParried, textColor);
							break;
						case AttackResult.Protected:
							layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageCannotPenetrateMagicalAura, textColor);
							break;
						case AttackResult.CriticalHit:
							layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageMadeCriticalHit, textColor);
							break;
						case AttackResult.Damage:
							layout.SetBattleMessage(battleAction.Character.Name + format(game.DataNameProvider.BattleMessageDidPointsOfDamage, damage), textColor);
							break;
						case AttackResult.Immune:
							layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageImmuneToAttack + game.DataNameProvider.GetElementName(ItemElementExtensions.GetCharacterWeaponElement(battleAction.Character, game.ItemManager), ItemElement), textColor);
							break;
					}
					this.Proceed(() => ActionFinished(true));
				};
				if (battleAction.Character instanceof Monster) {
					const monster = battleAction.Character;
					const animation = layout.GetMonsterBattleAnimation(monster);

					const AttackAnimationFinished = () => {
						animation.AnimationFinished.remove(AttackAnimationFinished);
						if (weapon == null || weapon.Type !== ItemType.LongRangeWeapon) // in this case the ammunition effect calls it
							ShowAttackMessage();
						this.currentBattleAnimation = null;
						this.currentlyAnimatedMonster = null;
					};

					if (weapon?.Type === ItemType.LongRangeWeapon) {
						let effect;
						switch (weapon.UsedAmmunitionType) {
							case AmmunitionType.None: effect = BattleEffect.SickleAttack; break;
							case AmmunitionType.Slingstone: effect = BattleEffect.SlingstoneAttack; break;
							case AmmunitionType.Arrow: effect = BattleEffect.MonsterArrowAttack; break;
							case AmmunitionType.Bolt: effect = BattleEffect.MonsterBoltAttack; break;
							default: throw new AmbermoonException(ExceptionScope.Application, 'Invalid ammunition type for monster.');
						}
						this.PlayBattleEffectAnimation(effect, toUInt(this.GetCharacterPosition(battleAction.Character)), targetTile, battleTicks, ShowAttackMessage);
					}

					animation.AnimationFinished.add(AttackAnimationFinished);
					animation.Play(monster.GetAnimationFrameIndices(MonsterAnimationType.CloseRangedAttack), Math.trunc(TicksPerSecond / 6),
						battleTicks);
					this.currentBattleAnimation = animation;
					this.currentlyAnimatedMonster = monster;
				} else {
					if (weapon?.Type === ItemType.LongRangeWeapon) {
						let effect;
						switch (weapon.UsedAmmunitionType) {
							case AmmunitionType.None: effect = BattleEffect.SickleAttack; break;
							case AmmunitionType.Slingstone: effect = BattleEffect.SlingstoneAttack; break;
							case AmmunitionType.Arrow: effect = BattleEffect.PlayerArrowAttack; break;
							case AmmunitionType.Bolt: effect = BattleEffect.PlayerBoltAttack; break;
							case AmmunitionType.Slingdagger: effect = BattleEffect.SlingdaggerAttack; break;
							default: throw new AmbermoonException(ExceptionScope.Application, 'Invalid ammunition type for player.');
						}
						this.PlayBattleEffectAnimation(effect, toUInt(this.GetCharacterPosition(battleAction.Character)), targetTile, battleTicks, ShowAttackMessage);
					} else {
						this.PlayBattleEffectAnimation(BattleEffect.PlayerAttack, targetTile, battleTicks, ShowAttackMessage);
					}
				}
				return;
			}
			case BattleActionType.CastSpell: {
				layout.SetBattleMessage(null);
				const [targetRowOrTile, spell, itemSlotIndex, equippedItem] = Battle.GetCastSpellInformation(battleAction.ActionParameter);

				// Note: Support spells like healing can also miss. In this case no message is displayed but the SP is spent.

				const spellInfo = game.SpellInfos.get(spell);

				if (battleAction.Character instanceof PartyMember)
					game.CurrentCaster = battleAction.Character;

				const EndCast = (needClickAfterwards = false) => {
					if (itemSlotIndex != null) {
						// Note: It will always be a party member as monsters can't use item spells.
						const itemSlot = equippedItem
							? getValue(battleAction.Character.Equipment.Slots, itemSlotIndex + 1)
							: battleAction.Character.Inventory.Slots[itemSlotIndex];
						layout.ReduceItemCharge(itemSlot, false, equippedItem, battleAction.Character);
					}

					game.CurrentSpellTarget = null;

					if (this.currentSpellAnimation != null) {
						this.currentSpellAnimation.PostCast(() => {
							this.currentSpellAnimation?.Destroy();
							this.currentSpellAnimation = null;
							this.Proceed(() => ActionFinished(needClickAfterwards));
						});
					} else {
						this.Proceed(() => ActionFinished(needClickAfterwards));
					}
				};

				if (itemSlotIndex == null) {
					battleAction.Character.SpellPoints.CurrentValue = Math.max(0, battleAction.Character.SpellPoints.CurrentValue - SpellInfos.GetSPCost(game.SpellInfos, game.Features, spell, battleAction.Character));

					if (battleAction.Character instanceof PartyMember)
						layout.FillCharacterBars(battleAction.Character);

					if (!this.CheckSpellCast(battleAction.Character, spellInfo)) {
						EndCast(true);
						return;
					}
				}

				switch (spellInfo.Target) {
					case SpellTarget.SingleEnemy:
						if (this.GetCharacterAt(targetRowOrTile) == null) {
							layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageMissedTheTarget,
								textColorOf(battleAction.Character));
							this.Proceed(() => EndCast());
							return;
						}
						break;
					case SpellTarget.SingleFriend:
						if (this.GetCharacterAt(targetRowOrTile) == null) {
							EndCast();
							return;
						}
						break;
					// Note: For row spells the initial animation is cast and in "spell move to" the miss message is displayed.
				}

				this.currentSpellAnimation = new SpellAnimation(game, layout, this, spell,
					battleAction.Character.Type === CharacterType.Monster, this.GetCharacterPosition(battleAction.Character), targetRowOrTile);

				const CastSpellOn = (target, finishAction) => {
					if (target == null) {
						finishAction?.();
						return;
					}

					if (target instanceof PartyMember) {
						const targetPlayer = target;
						if ((spell === Spell.Hurry || spell === Spell.MassHurry) && !this.hurriedPlayers.includes(targetPlayer))
							this.hurriedPlayers.push(targetPlayer);
						else if (SpellExtensions.IsPhysicallyBlocked(spell) && this.IsParryingSuccessfully(targetPlayer, battleAction.Character)) {
							layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageAttackWasParried,
								textColorOf(battleAction.Character));
							finishAction?.();
							return;
						}
					}

					game.CurrentSpellTarget = target;
					const position = this.GetCharacterPosition(target);
					let failed = false;
					let spellBlocked = false;
					const earlyCheckSpell = spell === Spell.DispellUndead || spell === Spell.DestroyUndead ||
						spell === Spell.HolyWord || spell === Spell.DissolveVictim;
					if (earlyCheckSpell) {
						// Check spell deflection first so the spell animation won't
						// shrink/remove the monster sprite.
						if (!this.CheckSpell(battleAction.Character, target, spell, _ =>
							finishAction?.(), true))
							return;
					}
					// Note: Some spells like Fireball or Whirlwind move to the target.
					this.currentSpellAnimation.MoveTo(position, (ticks, playHurt, finish) => {
						if (finish && spellBlocked) {
							this.ShowSpellFailMessage(battleAction.Character, spellInfo, target.Name + game.DataNameProvider.BattleMessageDeflectedSpell, this.NeedsClickForNextAction ? finishAction : null);
							this.PlayBattleEffectAnimation(BattleEffect.BlockSpell, toUInt(this.GetSlotFromCharacter(target)), game.CurrentBattleTicks, this.NeedsClickForNextAction ? null : finishAction);
							return;
						} else if (playHurt || finish) {
							if (failed) {
								if (finish)
									finishAction?.();
								return;
							} else if (!earlyCheckSpell && !this.CheckSpell(battleAction.Character, target, spell, blocked => {
								if (finish)
									finishAction?.();
								else if (blocked)
									spellBlocked = true;
							}, finish, true, !SpellExtensions.IsPhysicallyBlocked(spell))) {
								failed = true;
								// Note: The finishAction is called automatically if CheckSpell returns false.
								// But it might be called a bit later (e.g. after block animation) so we won't
								// invoke it here ourself.
								return;
							}
						}

						if (playHurt && target instanceof Monster) { // This is only for the hurt monster animation
							const monster = target;
							const animation = layout.GetMonsterBattleAnimation(monster);

							const HurtAnimationFinished = () => {
								animation.AnimationFinished.remove(HurtAnimationFinished);
								this.currentBattleAnimation = null;
								this.currentlyAnimatedMonster = null;
							};

							const EffectApplied = () => {
								// We have to wait until the monster hurt animation finishes.
								// Otherwise the animation reset might not happen.
								if (this.currentBattleAnimation == null && this.currentlyAnimatedMonster == null)
									finishAction?.();
								else
									game.AddTimedEvent(25, EffectApplied);
							};

							animation.AnimationFinished.add(HurtAnimationFinished);
							animation.Play(monster.GetAnimationFrameIndices(MonsterAnimationType.Hurt), Math.trunc(TicksPerSecond / 5),
								game.CurrentBattleTicks);
							this.currentBattleAnimation = animation;
							this.currentlyAnimatedMonster = monster;
							if (finish) {
								this.ApplySpellEffect(battleAction.Character, target, spell, game.CurrentBattleTicks, EffectApplied);
							}
						} else if (finish) {
							this.ApplySpellEffect(battleAction.Character, target, spell, game.CurrentBattleTicks, finishAction);
						}
					});
				};

				const CastSpellOnRow = (characterType, row, finishAction) => {
					const targets = range(0, 6).map(column => this.battleField[5 - column + row * 6])
						.filter(c => c?.Type === characterType);

					if (targets.length === 0) {
						finishAction?.();
						return;
					}

					const Cast = index => {
						CastSpellOn(targets[index], () => {
							if (index === targets.length - 1)
								finishAction?.();
							else
								Cast(index + 1);
						});
					};

					Cast(0);
				};

				const CastSpellOnAll = (characterType, finishAction) => {
					const minRow = characterType === CharacterType.Monster ? 0 : 3;
					const maxRow = characterType === CharacterType.Monster ? 3 : 4;

					const Cast = row => {
						CastSpellOnRow(characterType, row, () => {
							if (row === minRow)
								finishAction?.();
							else
								Cast(row - 1);
						});
					};

					Cast(maxRow);
				};

				const StartCasting = () => {
					this.currentSpellAnimation.Play(() => {
						switch (spellInfo.Target) {
							case SpellTarget.None:
								if (spell === Spell.SelfHealing || spell === Spell.SelfReviving)
									CastSpellOn(battleAction.Character, () => EndCast());
								else
									this.ApplySpellEffect(battleAction.Character, null, spell, game.CurrentBattleTicks, () => EndCast());
								break;
							case SpellTarget.SingleEnemy:
							case SpellTarget.SingleFriend:
								CastSpellOn(this.GetCharacterAt(targetRowOrTile), () => EndCast());
								break;
							case SpellTarget.AllEnemies:
								CastSpellOnAll(battleAction.Character.Type === CharacterType.Monster
									? CharacterType.PartyMember : CharacterType.Monster, () => EndCast());
								break;
							case SpellTarget.AllFriends:
								CastSpellOnAll(battleAction.Character.Type, () => EndCast());
								break;
							case SpellTarget.EnemyRow:
							case SpellTarget.EnemyRowInWeaponRange: {
								const enemyType = battleAction.Character.Type === CharacterType.Monster ?
									CharacterType.PartyMember : CharacterType.Monster;
								if (!range(targetRowOrTile * 6, 6).some(p => this.GetCharacterAt(p)?.Type === enemyType)) {
									layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageMissedTheTarget,
										textColorOf(battleAction.Character));
									this.Proceed(() => EndCast());
									return;
								}
								CastSpellOnRow(enemyType, targetRowOrTile, () => EndCast());
								break;
							}
							/*case SpellTarget.FriendRow:
							{
								if (!Enumerable.Range((int)targetRowOrTile * 6, 6).Any(p => GetCharacterAt(p)?.Type == battleAction.Character.Type))
								{
									layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageMissedTheTarget,
										battleAction.Character.Type == CharacterType.Monster ? TextColor.BattleMonster : TextColor.BattlePlayer);
									Proceed(() => EndCast());
									return;
								}
								CastSpellOnRow(battleAction.Character.Type, (int)targetRowOrTile, () => EndCast());
								break;
							}*/
							case SpellTarget.BattleField: {
								const character = this.GetCharacterAt(Battle.GetBlinkCharacterPosition(battleAction.ActionParameter));
								if (character == null) {
									layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageMissedTheTarget,
										textColorOf(battleAction.Character));
									this.Proceed(() => EndCast());
									return;
								}
								this.ApplySpellEffect(battleAction.Character, character, spell, game.CurrentBattleTicks, () => EndCast(),
									targetRowOrTile);
								break;
							}
						}
					});
				};

				if (battleAction.Character instanceof Monster) {
					const monster = battleAction.Character;
					const animation = layout.GetMonsterBattleAnimation(monster);

					const CastAnimationFinished = () => {
						animation.AnimationFinished.remove(CastAnimationFinished);
						this.currentBattleAnimation = null;
						this.currentlyAnimatedMonster = null;
						StartCasting();
					};

					animation.AnimationFinished.add(CastAnimationFinished);
					animation.Play(monster.GetAnimationFrameIndices(MonsterAnimationType.Cast), Math.trunc(TicksPerSecond / 6),
						battleTicks);
					this.currentBattleAnimation = animation;
					this.currentlyAnimatedMonster = monster;
				} else {
					StartCasting();
				}
				return;
			}
			case BattleActionType.Flee: {
				layout.SetBattleMessage(null);
				const EndFlee = () => {
					this.fledCharacters.push(battleAction.Character);
					this.RemoveCharacterFromBattleField(battleAction.Character);
					this.ActionCompleted.invoke(battleAction);

					if (battleAction.Character.Type === CharacterType.Monster && this.Monsters.length === 0) {
						this.EndBattleCleanup();
						this.BattleEnded.invoke(createMonstersDefeatedBattleEndInfo(this));
						return;
					} else if (battleAction.Character.Type === CharacterType.PartyMember &&
						!this.battleField.some(c => c?.Type === CharacterType.PartyMember)) {
						this.EndBattleCleanup();
						this.BattleEnded.invoke(createBattleEndInfo(game, {
							MonstersDefeated: false
						}));
						return;
					}
					this.ReadyForNextAction = true;
				};
				if (battleAction.Character instanceof Monster) {
					const monster = battleAction.Character;
					const animation = layout.GetMonsterBattleAnimation(monster);

					const MoveAnimationFinished = () => {
						animation.AnimationFinished.remove(MoveAnimationFinished);
						EndFlee();
						this.currentBattleAnimation = null;
						this.currentlyAnimatedMonster = null;
					};

					animation.AnimationFinished.add(MoveAnimationFinished);
					animation.Play(monster.GetAnimationFrameIndices(MonsterAnimationType.Move), Math.trunc(TicksPerSecond / 20),
						battleTicks, new Position(160, 105), 0.0);
					this.currentBattleAnimation = animation;
					this.currentlyAnimatedMonster = monster;
				} else {
					EndFlee();
				}
				return;
			}
			case BattleActionType.WeaponBreak: {
				const [tile, damage, , flags] = Battle.GetAttackFollowUpInformation(battleAction.ActionParameter);
				const nextAction = this.roundBattleActions.Peek();
				nextAction.ActionParameter = battleAction.ActionParameter;
				if (hasFlag(flags, AttackActionFlags.BreakWeapon)) {
					const textColor = textColorOf(battleAction.Character);
					const weaponSlot = getValue(battleAction.Character.Equipment.Slots, EquipmentSlot.RightHand);
					const itemIndex = weaponSlot.ItemIndex;
					const weapon = game.ItemManager.GetItem(itemIndex);
					if (weapon.NumberOfHands === 2) {
						// Remove the cross from left hand slot
						battleAction.Character.Equipment.Slots.get(EquipmentSlot.LeftHand)?.Clear();
					}
					game.EquipmentRemoved(battleAction.Character, itemIndex, 1, hasFlag(weaponSlot.Flags, ItemSlotFlags.Cursed));
					this.brokenItems.push(kv(itemIndex, weaponSlot.Flags));
					weaponSlot.Clear();
					layout.SetBattleMessage(battleAction.Character.Name + format(game.DataNameProvider.BattleMessageWasBroken, weapon.Name), textColor);
					if (battleAction.Character instanceof PartyMember) {
						this.PlayerWeaponBroke.invoke(battleAction.Character);
					} else if (battleAction.Character instanceof Monster) {
						const monster = battleAction.Character;
						if (weapon.Type === ItemType.LongRangeWeapon) {
							// Switch to melee weapon if available
							const IsMeleeWeapon = itemIndex => game.ItemManager.GetItem(itemIndex).Type === ItemType.CloseRangeWeapon;
							const meleeWeaponSlot = battleAction.Character.Inventory.Slots.find(s => !s.Empty && IsMeleeWeapon(s.ItemIndex)) ?? null;
							if (meleeWeaponSlot != null) {
								weaponSlot.Exchange(meleeWeaponSlot);
								game.EquipmentAdded(weaponSlot.ItemIndex, 1, monster);
							}
						}

						if (monster.BaseAttackDamage + monster.BonusAttackDamage === 0) {
							const moraleIndex = this.initialMonsters.indexOf(monster);
							this.monsterMorale[moraleIndex] = Math.trunc(this.monsterMorale[moraleIndex] / 2);
						}
					}
					this.Proceed(() => ActionFinished(true), true);
				} else {
					ActionFinished(false);
				}
				return;
			}
			case BattleActionType.ArmorBreak: {
				DefenderEquipBreak(AttackActionFlags.BreakArmor, EquipmentSlot.Body);
				return;
			}
			case BattleActionType.DefenderWeaponBreak: {
				DefenderEquipBreak(AttackActionFlags.BreakDefenderWeapon, EquipmentSlot.RightHand);
				return;
			}
			case BattleActionType.DefenderShieldBreak: {
				DefenderEquipBreak(AttackActionFlags.BreakDefenderShield, EquipmentSlot.LeftHand);
				return;
			}
			case BattleActionType.LastAmmo: {
				const [tile, damage, , flags] = Battle.GetAttackFollowUpInformation(battleAction.ActionParameter);

				const nextAction = this.roundBattleActions.Peek();

				nextAction.ActionParameter = battleAction.ActionParameter;

				if (hasFlag(flags, AttackActionFlags.LastAmmo)) {
					const textColor = textColorOf(battleAction.Character);

					layout.SetBattleMessage(battleAction.Character.Name + game.DataNameProvider.BattleMessageUsedLastAmmunition, textColor);

					if (battleAction.Character instanceof Monster)
						this.droppedWeaponMonsters.push(battleAction.Character);

					this.Proceed(() => ActionFinished(true), true);
				} else {
					ActionFinished(false);
				}
				return;
			}
			case BattleActionType.Hurt: {
				layout.SetBattleMessage(null);

				const textColor = textColorOf(battleAction.Character);

				let [tile, damage, attackResult, flags] = Battle.GetAttackFollowUpInformation(battleAction.ActionParameter);

				const target = this.GetCharacterAt(tile);

				if (target == null) {
					ActionFinished(false);
					return;
				}

				if (attackResult !== AttackResult.Damage && attackResult !== AttackResult.CriticalHit) {
					ActionFinished(false);
					return;
				}

				const EndHurt = () => {
					if (!target.Alive) {
						this.HandleCharacterDeath(battleAction.Character, target, () => ActionFinished(false));
					} else {
						if (target instanceof PartyMember)
							layout.FillCharacterBars(target);

						ActionFinished(false);
					}
				};

				if (target instanceof PartyMember) {
					const partyMember = target;
					this.PlayBattleEffectAnimation(BattleEffect.HurtPlayer, tile, battleTicks, EndHurt);
					game.ShowPlayerDamage(game.SlotFromPartyMember(partyMember), Math.min(damage, partyMember.HitPoints.CurrentValue));
				} else if (target instanceof Monster) {
					const monster = target;
					const animation = layout.GetMonsterBattleAnimation(monster);

					const HurtAnimationFinished = () => {
						animation.AnimationFinished.remove(HurtAnimationFinished);
						this.currentBattleAnimation = null;
						this.currentlyAnimatedMonster = null;
						EndHurt();
					};

					animation.AnimationFinished.add(HurtAnimationFinished);

					const frames = monster.GetAnimationFrameIndices(MonsterAnimationType.Hurt);

					animation.Play(frames, Math.trunc(Math.trunc(TicksPerSecond / 2) / frames.length), battleTicks);

					this.currentBattleAnimation = animation;
					this.currentlyAnimatedMonster = monster;

					this.PlayBattleEffectAnimation(BattleEffect.HurtMonster, tile, battleTicks, null);

					if (game.Godmode)
						damage = target.HitPoints.CurrentValue;
				}

				this.ShowBattleFieldDamage(tile, damage);

				if (hasFlag(target.Conditions, Condition.Sleep))
					game.RemoveCondition(Condition.Sleep, target);

				if (target instanceof Monster)
					target.Damage(damage);
				else if (!game.Godmode)
					target.Damage(damage, deathCondition => game.KillPartyMember(target instanceof PartyMember ? target : null, deathCondition));

				return;
			}
			default:
				throw new AmbermoonException(ExceptionScope.Application, 'Invalid battle action.');
		}

		// eslint-disable-next-line no-unreachable
		throw new AmbermoonException(ExceptionScope.Application, 'Not processed battle action.');
	}

	HideAllBattleFieldDamage() {
		for (const [, Value] of this.battleFieldDamageTexts)
			Value?.Delete();

		this.battleFieldDamageTexts.clear();
	}

	HideBattleFieldDamage(tile) {
		if (this.battleFieldDamageTexts.has(tile)) {
			this.battleFieldDamageTexts.get(tile)?.Delete();
			this.battleFieldDamageTexts.delete(tile);
		}
	}

	ShowBattleFieldDamage(tile, damage) {
		const game = this.game;
		const layout = this.layout;
		const layer = layout.RenderView.GetLayer(Layer.SmallDigits);
		// Note: Don't use *** as the digit font has no such character.
		const text = layout.RenderView.TextProcessor.CreateText(damage >= 999 ? '999' : formatNumber(damage, '000'));
		const area = Global.BattleFieldSlotArea(tile).CreateModified(-5, 9, 12, 0);
		const damageText = layout.RenderView.RenderTextFactory.CreateDigits(
			game.UIPaletteIndex, layer, text, TextColor.Red, false, area, TextAlign.Center);
		const colors = TextColors.TextAnimationColors;
		let colorCycle = 0;
		let colorIndex = -1;
		const numColorCycles = 3;

		const [found, value] = tryGetValue(this.battleFieldDamageTexts, tile);
		if (found) {
			value.Delete();
			this.battleFieldDamageTexts.set(tile, damageText);
		} else {
			this.battleFieldDamageTexts.set(tile, damageText);
		}

		const ChangeColor = () => {
			if (!this.battleFieldDamageTexts.has(tile))
				return; // Might be removed by moving/dying or battle end

			++colorIndex;

			if (colorIndex === colors.length) {
				colorIndex = 0;

				if (++colorCycle === numColorCycles) {
					this.battleFieldDamageTexts.get(tile).Delete();
					this.battleFieldDamageTexts.delete(tile);
					return;
				}
			}

			this.battleFieldDamageTexts.get(tile).TextColor = colors[colorIndex];
			game.AddTimedEvent(150, ChangeColor);
		};

		game.AddTimedEvent(150, ChangeColor);

		damageText.DisplayLayer = 255;
		damageText.Visible = true;
	}

	CheckSpellCast(caster, spellInfo) {
		const game = this.game;
		let chance = caster.Skills[Skill.UseMagic].TotalCurrentValue;

		if (hasFlag(game.Features, Features.ExtendedCurseEffects) &&
			!hasFlag(caster.BattleFlags, BattleFlags.Boss) &&
			hasFlag(caster.Conditions, Condition.Drugged))
			chance -= 25;

		if (caster instanceof Monster && this.foreseeMagic)
			chance -= 25;

		if (game.RollDice100() >= chance) {
			this.layout.SetBattleMessage(caster.Name + game.DataNameProvider.SpellFailed,
				caster.Type === CharacterType.Monster ? TextColor.BattleMonster : TextColor.BattlePlayer);
			return false;
		}

		return true;
	}

	ShowSpellFailMessage(caster, spellInfo, message, finishAction) {
		const game = this.game;
		const color = caster.Type === CharacterType.Monster ? TextColor.BattleMonster : TextColor.BattlePlayer;
		const delay = 1100 - this.Speed * 4; // ms

		if (this.NeedsClickForNextAction && !SpellTargetExtensions.TargetsMultipleEnemies(spellInfo.Target)) {
			game.SetBattleMessageWithClick(message, color, finishAction, delay);
		} else {
			game.AddTimedEvent(delay, () => {
				this.layout.SetBattleMessage(message, color);
				this.Proceed(() => {
					this.layout.SetBattleMessage(null);
					finishAction?.();
				});
			});
		}
	}

	CheckSpell(caster, target, spell, failAction, playBlocked, showMessage = true, checkDeflection = true) {
		const game = this.game;
		const spellInfo = game.SpellInfos.get(spell);

		const Fail = () => failAction?.(false);

		const ShowFailMessage = (message, finishAction) => {
			if (showMessage)
				this.ShowSpellFailMessage(caster, spellInfo, message, finishAction);
			else
				finishAction?.();
		};

		if (target.Type !== caster.Type) {
			const godmode = game.Godmode && caster instanceof PartyMember;

			if (checkDeflection && !godmode) {
				const antiMagicBuffValue = target instanceof PartyMember ? game.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.AntiMagic) : 0;

				if (this.protectedCharacters.includes(target) || game.RollDice100() < Math.trunc(target.Attributes[Attribute.AntiMagic].TotalCurrentValue + antiMagicBuffValue)) {
					const BlockedAction = () => failAction?.(true);

					// Blocked
					if (playBlocked) {
						ShowFailMessage(target.Name + game.DataNameProvider.BattleMessageDeflectedSpell, this.NeedsClickForNextAction ? BlockedAction : null);
						this.PlayBattleEffectAnimation(BattleEffect.BlockSpell, toUInt(this.GetSlotFromCharacter(target)), game.CurrentBattleTicks, this.NeedsClickForNextAction ? null : BlockedAction);
					} else {
						BlockedAction();
					}
					return false;
				}
			}

			if (!godmode && (target.SpellTypeImmunity & spellInfo.SpellType) !== 0) {
				ShowFailMessage(target.Name + game.DataNameProvider.BattleMessageImmuneToSpellType, Fail);
				return false;
			}

			if (!godmode) {
				const [immune, silent] = target.IsImmuneToSpell(spell, hasFlag(game.Features, Features.Elements));

				if (immune) {
					if (silent)
						Fail();
					else
						ShowFailMessage(target.Name + game.DataNameProvider.BattleMessageImmuneToSpell, Fail);
					return false;
				}
			}
		}

		if (hasFlag(target.Conditions, Condition.Petrified) && SpellExtensions.FailsAgainstPetrifiedEnemy(spell)) {
			// Note: In original there is no message in this case but I think
			//       it's better to show the reason.
			ShowFailMessage(game.DataNameProvider.BattleMessageCannotDamagePetrifiedMonsters, Fail);
			return false;
		}

		return true;
	}

	RemoveCondition(condition, target) {
		// Healing spells or potions.
		// Sleep can be removed by attacking as well.
		target.Conditions &= ~condition;

		if (target instanceof PartyMember) {
			this.game.UpdateBattleStatus(target);
			this.layout.UpdateCharacterNameColors(this.game.CurrentSavegame.ActivePartyMemberSlot);
		}

		const SkipActions = () => {
			for (const action of [...this.roundBattleActions].filter(a => a.Character === target))
				action.Skip = true;
		};

		// Avoid fleeing or acting crazy if the condition is removed
		if (condition === Condition.Panic || condition === Condition.Crazy)
			SkipActions();
	}

	AddCondition(condition, target) {
		const game = this.game;

		if (target instanceof PartyMember && game.Godmode)
			return;

		target.Conditions |= condition;

		if (target instanceof PartyMember) {
			const partyMember = target;
			if (!ConditionExtensions.CanParry(condition) && this.parryingPlayers.includes(partyMember))
				removeItem(this.parryingPlayers, partyMember);

			game.ShowPlayerDamage(game.SlotFromPartyMember(partyMember), 0);
			game.UpdateBattleStatus(partyMember);
			this.layout.UpdateCharacterNameColors(game.CurrentSavegame.ActivePartyMemberSlot);
		}

		const SkipActions = () => {
			for (const action of [...this.roundBattleActions].filter(a => a.Character === target))
				action.Skip = true;
		};

		const anyAction = actionType => [...this.roundBattleActions].some(a => a.Character === target && a.Action === actionType);

		if (!ConditionExtensions.CanSelect(condition)) { // disabled
			// Still allow fleeing under fear
			if (hasFlag(condition, Condition.Panic) && ConditionExtensions.CanFlee(condition) && anyAction(BattleActionType.Flee))
				return;
			// Still allow moving and attacking when crazy
			if (hasFlag(condition, Condition.Crazy) &&
				(ConditionExtensions.CanMove(condition) && anyAction(BattleActionType.Move)) ||
				(ConditionExtensions.CanAttack(condition) && anyAction(BattleActionType.Attack)))
				return;

			SkipActions();
		} else {
			if (!ConditionExtensions.CanAttack(condition) && anyAction(BattleActionType.Attack)) {
				SkipActions();
			} else if (!ConditionExtensions.CanCastSpell(condition, game.Features) && anyAction(BattleActionType.CastSpell)) {
				SkipActions();
			} else if (!ConditionExtensions.CanMove(condition) && anyAction(BattleActionType.Move)) {
				SkipActions();
			} else if (!ConditionExtensions.CanFlee(condition) && anyAction(BattleActionType.Flee)) {
				SkipActions();
			}
		}
	}

	static GetMonsterDeathScale(monster) {
		// 59 is the normal frame height
		return Math.max(monster.MappedFrameWidth, monster.MappedFrameHeight) / 59.0;
	}

	HandleCharacterDeath(attacker, target, finishAction) {
		// Remove all actions that are performed by the dead target
		// or by the attacker. Note that following targets of a multi-target
		// spell won't be skipped as the spell cast action is already running.
		for (const action of [...this.roundBattleActions].filter(a => a.Character === target || a.Character === attacker))
			action.Skip = true;

		if (target instanceof Monster) {
			const battleFieldCopy = this.battleField.slice();
			const slot = this.GetSlotFromCharacter(target);
			if (this.currentBattleAnimation != null && target === this.currentlyAnimatedMonster) {
				this.currentBattleAnimation?.Destroy();
				this.currentBattleAnimation = null;
				this.currentlyAnimatedMonster = null;
			} else {
				this.layout.GetMonsterBattleAnimation(target)?.Destroy();
			}
			this.PlayBattleEffectAnimation(BattleEffect.Death, toUInt(slot), this.game.CurrentBattleTicks, () => {
				this.RemoveCharacterFromBattleField(target);
				finishAction?.();
				this.KillMonster(attacker instanceof PartyMember ? attacker : null, target, slot);
			}, Battle.GetMonsterDeathScale(target), battleFieldCopy);
		} else {
			this.RemoveCharacterFromBattleField(target);
			finishAction?.();
			this.KillPlayer(target);
		}
	}

	ImitateMonster(caster, monster, finishAction) {
		if ((caster.Class !== Class.Mystic && caster.Class !== Class.Ranger) || caster.Index > 13) {
			// This is for safety. For example it should be avoided that Kasimir or a thief can use
			// the spell from a scroll as the Amiga implementation only allows specific characters
			// which are Chris, Targor and Valdyn. In addition there should be no scroll for this
			// spell or it should not be usable by animals and thieves.
			finishAction?.();
			return;
		}

		if (this.imitationBackupData.has(caster.Index)) // Dictionary.Add
			throw new ArgumentException('An item with the same key has already been added.');
		this.imitationBackupData.set(caster.Index, new ImitationBackupData(caster, monster.CombatGraphicIndex));

		this.game.ReplacePartyMemberBattleFieldSprite(caster, monster.CombatGraphicIndex);

		caster.AttacksPerRound = monster.AttacksPerRound;
		caster.Element = monster.Element;
		caster.HitPoints.MaxValue = monster.HitPoints.MaxValue;
		caster.HitPoints.CurrentValue = monster.HitPoints.CurrentValue;
		caster.SpellPoints.MaxValue = monster.SpellPoints.MaxValue;
		caster.SpellPoints.CurrentValue = monster.SpellPoints.CurrentValue;
		caster.MagicAttack = monster.MagicAttack;
		caster.MagicDefense = monster.MagicDefense;
		for (const attribute of EnumHelper.GetValues(Attribute).slice(0, 8)) {
			caster.Attributes[attribute].MaxValue = monster.Attributes[attribute].MaxValue;
			caster.Attributes[attribute].CurrentValue = monster.Attributes[attribute].CurrentValue;
		}
		caster.Skills[Skill.Attack].MaxValue = monster.Skills[Skill.Attack].MaxValue;
		caster.Skills[Skill.Attack].CurrentValue = monster.Skills[Skill.Attack].CurrentValue;
		caster.Skills[Skill.Parry].MaxValue = monster.Skills[Skill.Parry].MaxValue;
		caster.Skills[Skill.Parry].CurrentValue = monster.Skills[Skill.Parry].CurrentValue;
		caster.Skills[Skill.CriticalHit].MaxValue = monster.Skills[Skill.CriticalHit].MaxValue;
		caster.Skills[Skill.CriticalHit].CurrentValue = monster.Skills[Skill.CriticalHit].CurrentValue;
		caster.Skills[Skill.UseMagic].MaxValue = monster.Skills[Skill.UseMagic].MaxValue;
		caster.Skills[Skill.UseMagic].CurrentValue = monster.Skills[Skill.UseMagic].CurrentValue;
		caster.LearnedHealingSpells = monster.LearnedHealingSpells;
		caster.LearnedAlchemisticSpells = monster.LearnedAlchemisticSpells;
		caster.LearnedMysticSpells = monster.LearnedMysticSpells;
		caster.LearnedDestructionSpells = monster.LearnedDestructionSpells;
		caster.SpellMastery = monster.SpellMastery;
		caster.BaseDefense = monster.BaseDefense;
		caster.BaseAttackDamage = monster.BaseAttackDamage;
		caster.InventoryInaccessible = true;

		finishAction?.();
	}

	RestoreImitatingPartyMembers() {
		for (const partyMember of this.game.PartyMembers) {
			const [found, backup] = tryGetValue(this.imitationBackupData, partyMember.Index);
			if (found) {
				backup.ApplyToPartyMember(partyMember);
			}
		}

		this.imitationBackupData.clear();
	}

	ShowMonsterInfo(monster, finishAction) {
		const game = this.game;
		const layout = this.layout;
		game.StartSequence();
		let area = new Rect(64, 38, 12 * 16, 10 * 16);
		const popup = layout.OpenPopup(area.Position, 12, 10, true, true, 225);
		area = area.CreateShrinked(16);
		const panelWidth = 12 * Global.GlyphWidth;
		// Attributes
		popup.AddText(new Rect(area.Position, new Size(panelWidth, Global.GlyphLineHeight)),
			game.DataNameProvider.AttributesHeaderString, TextColor.MonsterInfoHeader, TextAlign.Center);
		let position = new Position(area.Position.X, area.Position.Y + Global.GlyphLineHeight + 1);
		for (const attribute of EnumHelper.GetValues(Attribute)) {
			if (attribute === Attribute.Age)
				break;

			const attributeValues = monster.Attributes[attribute];
			popup.AddText(position,
				`${game.DataNameProvider.GetAttributeShortName(attribute)}  ${((attributeValues.TotalCurrentValue > 999 ? '***' : formatNumber(attributeValues.TotalCurrentValue, '000')) + `/${formatNumber(attributeValues.MaxValue, '000')}`)}`,
				TextColor.BrightGray);
			position.Y += Global.GlyphLineHeight;
		}
		// Skills
		position = Position.op_Addition(area.Position, new Position(panelWidth + Global.GlyphWidth, 0));
		popup.AddText(new Rect(position, new Size(panelWidth, Global.GlyphLineHeight)),
			game.DataNameProvider.SkillsHeaderString, TextColor.MonsterInfoHeader, TextAlign.Center);
		position.Y += Global.GlyphLineHeight + 1;
		for (const skill of EnumHelper.GetValues(Skill)) {
			const skillValues = monster.Skills[skill];
			popup.AddText(position,
				`${game.DataNameProvider.GetSkillShortName(skill)}  ${((skillValues.TotalCurrentValue > 99 ? '**' : formatNumber(skillValues.TotalCurrentValue, '00')) + `%/${formatNumber(skillValues.MaxValue, '00')}%`)}`,
				TextColor.BrightGray);
			position.Y += Global.GlyphLineHeight - 1;
		}
		// Data
		position.X = area.X;
		position.Y += 3;
		popup.AddText(new Rect(position, new Size(area.Width, Global.GlyphLineHeight)),
			game.DataNameProvider.DataHeaderString, TextColor.MonsterInfoHeader, TextAlign.Center);
		position.Y += Global.GlyphLineHeight + 1;
		popup.AddText(position,
			format(game.DataNameProvider.CharacterInfoHitPointsString, monster.HitPoints.CurrentValue > 999 ? '***' : String(monster.HitPoints.CurrentValue),
				monster.HitPoints.TotalMaxValue > 999 ? '***' : String(monster.HitPoints.TotalMaxValue)) + ' ' +
			format(game.DataNameProvider.CharacterInfoSpellPointsString, monster.SpellPoints.CurrentValue > 999 ? '***' : String(monster.SpellPoints.CurrentValue),
				monster.SpellPoints.TotalMaxValue > 999 ? '***' : String(monster.SpellPoints.TotalMaxValue)),
			TextColor.BrightGray);
		position.Y += Global.GlyphLineHeight;
		popup.AddText(position,
			format(game.DataNameProvider.CharacterInfoGoldAndFoodString.replaceAll(' ', '      '), monster.Gold, monster.Food),
			TextColor.BrightGray);
		position.Y += Global.GlyphLineHeight;
		popup.AddImage(new Rect(position.X, position.Y, 16, 9), Graphics.GetUIGraphicIndex(UIGraphic.Attack), Layer.UI, 1, game.UIPaletteIndex);
		const damage = monster.BaseAttackDamage + monster.BonusAttackDamage;
		popup.AddText(Position.op_Addition(position, new Position(6, 2)),
			format(game.DataNameProvider.CharacterInfoDamageString.replaceAll(' ', damage < 0 ? '-' : '+'), Math.abs(damage)),
			TextColor.BrightGray);
		position.X = area.X + panelWidth + Global.GlyphWidth;
		popup.AddImage(new Rect(position.X, position.Y, 16, 9), Graphics.GetUIGraphicIndex(UIGraphic.Defense), Layer.UI, 1, game.UIPaletteIndex);
		const defense = monster.BaseDefense + monster.BonusDefense;
		popup.AddText(Position.op_Addition(position, new Position(7, 2)),
			format(game.DataNameProvider.CharacterInfoDefenseString.replaceAll(' ', defense < 0 ? '-' : '+'), Math.abs(defense)),
			TextColor.BrightGray);
		position.X = area.X;
		position.Y += Global.GlyphLineHeight + 4;
		popup.AddText(position, `${game.DataNameProvider.CharacterInfoAPRString.trimEnd()}${monster.AttacksPerRound}`, TextColor.BrightGray);
		// Icon and level
		--position.X;
		position.Y += Global.GlyphLineHeight;
		popup.AddSunkenBox(new Rect(position, new Size(18, 18)));
		popup.AddImage(new Rect(position.X + 1, position.Y + 2, 16, 14), Graphics.BattleFieldIconOffset + Class.Monster + monster.CombatGraphicIndex - 1,
			Layer.UI, 2, game.PrimaryUIPaletteIndex);
		if (hasFlag(game.Features, Features.Elements)) {
			popup.AddText(Position.op_Addition(position, new Position(21, 2)), `${monster.Name} ${monster.Level}`, TextColor.BrightGray);
			popup.AddText(Position.op_Addition(position, new Position(21, 10)), `${game.DataNameProvider.ElementLabel} ${game.DataNameProvider.GetElementName(monster.Element)}`, TextColor.BrightGray);
		} else {
			popup.AddText(Position.op_Addition(position, new Position(21, 5)), `${monster.Name} ${monster.Level}`, TextColor.BrightGray);
		}
		// Closing
		game.TrapMouse(area);
		popup.Closed.add(() => {
			game.CursorType = CursorType.Sword;
			game.UntrapMouse();
			finishAction?.();
		});
		game.EndSequence();
	}

	static UnsignedToSigned(word) {
		const w = word & 0xffff;

		if ((w & 0x8000) === 0)
			return w;

		return w - 0x10000;
	}

	/** ref minDamage, ref maxDamage -> returns [minDamage, maxDamage] */
	AdjustDamage(minDamage, maxDamage, spellBonus) {
		const baseBonus = Battle.UnsignedToSigned(spellBonus.CurrentValue);
		const maxBonus = Battle.UnsignedToSigned(spellBonus.MaxValue);
		let percBonus = Battle.UnsignedToSigned(spellBonus.StoredValue);

		if (percBonus <= -100) {
			minDamage = 1;
			maxDamage = 1;
			return [minDamage, maxDamage];
		}

		minDamage = Math.max(1, minDamage + baseBonus);
		maxDamage = Math.max(minDamage, maxDamage + baseBonus + maxBonus);

		if (percBonus !== 0) {
			percBonus += 100;
			minDamage = Math.max(1, Math.trunc((minDamage * percBonus) / 100));
			maxDamage = Math.max(minDamage, Math.trunc((maxDamage * percBonus) / 100));
		}

		return [minDamage, maxDamage];
	}

	/// <summary>
	/// The boolean argument of the finish action means: NeedsClickAfterwards
	/// </summary>
	ApplySpellEffect(caster, target, spell, ticks, finishAction, targetField = null) {
		const game = this.game;
		const layout = this.layout;

		const DealDamage = (baseDamage, variableDamage, useSpellBonusDamage = true) => {
			if (!hasFlag(game.Features, Features.SpellDamageBonus))
				useSpellBonusDamage = false;

			const EndHurt = () => {
				if (!target.Alive) {
					this.HandleCharacterDeath(caster, target, finishAction);
				} else {
					if (target instanceof PartyMember)
						layout.FillCharacterBars(target);
					finishAction?.();
				}
			};

			let damage = this.CalculateSpellDamage(caster, target, baseDamage, variableDamage);
			const trackDamage = spell === Spell.DissolveVictim ? target.HitPoints.TotalMaxValue : damage;

			if (caster instanceof Monster)
				this.TrackMonsterHit(caster, trackDamage);
			else if (caster instanceof PartyMember)
				this.TrackPlayerHit(caster, trackDamage);

			if (useSpellBonusDamage) {
				let factor = caster.Level + Math.trunc((caster.Attributes[Attribute.Intelligence].TotalCurrentValue - 50) / 5);

				if (target instanceof Monster) {
					const GetWorstBonus = elementRowIndex => {
						let worstBonus = 255;
						const element = target.Element;

						for (let i = 0; i < 8; ++i) {
							if ((element & (1 << i)) !== 0) { // has this element
								const bonus = Battle.SpellBonusTable[elementRowIndex + i];

								if (bonus < worstBonus)
									worstBonus = bonus;
							}
						}

						return worstBonus === 255 ? 100 : worstBonus;
					};

					factor += GetWorstBonus(Battle.GetElementIndex(spell) * 8);
				} else {
					factor += 100;
				}

				if (factor <= 0)
					damage = 1;
				else {
					const damageReduction = Battle.UnsignedToSigned(target.Attributes[Attribute.BonusSpellDamage].BonusValue);
					damage = Math.trunc((damage * factor) / 100);
					damage = Math.max(1, damage - Math.trunc((damage * damageReduction) / 100));
				}
			}

			if (target instanceof Monster && this.weakenedMonsters.includes(target)) {
				const monsterTarget = target;
				const bonus = hasFlag(monsterTarget.BattleFlags, BattleFlags.Boss) ? 15 : 30;
				damage = Math.min(Math.trunc((100 + bonus) * damage / 100), monsterTarget.HitPoints.CurrentValue);
			}

			const position = toUInt(this.GetSlotFromCharacter(target));

			this.PlayBattleEffectAnimation(target.Type === CharacterType.Monster ? BattleEffect.HurtMonster : BattleEffect.HurtPlayer,
				position, ticks, () => {
					if (target instanceof PartyMember)
						game.ShowPlayerDamage(game.SlotFromPartyMember(target), damage);

					if (hasFlag(target.Conditions, Condition.Sleep))
						this.RemoveCondition(Condition.Sleep, target);

					if (game.Godmode && target instanceof Monster)
						damage = target.HitPoints.CurrentValue;

					if (target instanceof Monster)
						target.Damage(damage);
					else if (!game.Godmode)
						target.Damage(damage, deathCondition => game.KillPartyMember(target instanceof PartyMember ? target : null, deathCondition));

					EndHurt();
				}
			);

			this.ShowBattleFieldDamage(this.GetSlotFromCharacter(target), damage);

			return damage;
		};

		switch (spell) {
			case Spell.GhostWeapon:
			case Spell.GhostInferno: {
				const ignoreDamageBonus = caster instanceof PartyMember && caster.Index < 16;
				const damage = Math.max(1, caster.BaseAttackDamage + caster.BonusAttackDamage);
				const bonusDamage = caster.Attributes[Attribute.BonusSpellDamage];
				let minDamage = damage;
				let maxDamage = damage;
				if (!ignoreDamageBonus)
					[minDamage, maxDamage] = this.AdjustDamage(minDamage, maxDamage, bonusDamage);
				DealDamage(minDamage, maxDamage - minDamage);
				return;
			}
			case Spell.Blink:
				game.SetBattleMessageWithClick(target.Name + game.DataNameProvider.BattleMessageHasBlinked, TextColor.BattlePlayer,
					() => { this.MoveCharacterTo(targetField, target); finishAction?.(); });
				return;
			case Spell.Escape:
				// Note: In Ambermoon it was marked as it only can be used outside of battles
				// but the spell code was only available in battle. This is a bug in the original.
				this.EndBattleCleanup();
				this.BattleEnded.invoke(createBattleEndInfo(game, {
					MonstersDefeated: false
				}));
				return;
			case Spell.DissolveVictim:
			case Spell.DispellUndead:
			case Spell.DestroyUndead:
			case Spell.HolyWord: {
				const slot = this.GetCharacterPosition(target);
				this.RemoveCharacterFromBattleField(target);
				if (caster instanceof PartyMember) {
					// Monsters dissolved by those spells are
					// handled like fled monsters so that their
					// belongings won't remain after battle.
					this.fledCharacters.push(target);
					this.KillMonster(caster, target, slot);
				} else {
					this.KillPlayer(target);
				}
				break;
			}
			case Spell.Lame:
				this.AddCondition(Condition.Lamed, target);
				break;
			case Spell.Poison:
				this.AddCondition(Condition.Poisoned, target);
				break;
			case Spell.Petrify:
				this.AddCondition(Condition.Petrified, target);
				break;
			case Spell.CauseDisease:
				this.AddCondition(Condition.Diseased, target);
				break;
			case Spell.CauseAging:
				this.AddCondition(Condition.Aging, target);
				break;
			case Spell.Irritate:
				this.AddCondition(Condition.Irritated, target);
				break;
			case Spell.CauseMadness:
				this.AddCondition(Condition.Crazy, target);
				break;
			case Spell.Sleep:
				this.AddCondition(Condition.Sleep, target);
				break;
			case Spell.Fear:
				this.AddCondition(Condition.Panic, target);
				break;
			case Spell.Blind:
				this.AddCondition(Condition.Blind, target);
				break;
			case Spell.Drug:
				this.AddCondition(Condition.Drugged, target);
				break;
			case Spell.Mudsling:
			case Spell.Rockfall:
			case Spell.Earthslide:
			case Spell.Earthquake:
			case Spell.Winddevil:
			case Spell.Windhowler:
			case Spell.Thunderbolt:
			case Spell.Whirlwind:
			case Spell.Firebeam:
			case Spell.Fireball:
			case Spell.Firestorm:
			case Spell.Firepillar:
			case Spell.Waterfall:
			case Spell.Iceball:
			case Spell.Icestorm:
			case Spell.Iceshower: {
				const damageValues = hasFlag(game.Features, Features.AdjustedSpellDamage)
					? Battle.AdjustedDestructionSpellDamageValues
					: Battle.DestructionSpellDamageValues;
				let index = spell - Spell.Mudsling;
				if (index < 4) {
					if (hasFlag(caster.BattleFlags, BattleFlags.EarthSpellDamageBonus))
						index += 12;
				} else if (index < 8) {
					if (hasFlag(caster.BattleFlags, BattleFlags.WindSpellDamageBonus))
						index += 8;
				} else if (index < 12) {
					if (hasFlag(caster.BattleFlags, BattleFlags.FireSpellDamageBonus))
						index += 4;
				}
				const ignoreDamageBonus = caster instanceof PartyMember && caster.Index < 16;
				const damageValue = damageValues[index];
				const bonusDamage = caster.Attributes[Attribute.BonusSpellDamage];
				let minDamage = damageValue.Key;
				let maxDamage = damageValue.Value;
				if (!ignoreDamageBonus)
					[minDamage, maxDamage] = this.AdjustDamage(minDamage, maxDamage, bonusDamage);
				DealDamage(minDamage, maxDamage - minDamage);
				return;
			}
			case Spell.MagicalProjectile:
			case Spell.MagicalArrows: {
				// Those deal half the caster level as damage.
				// Monsters deal full level as damage instead.
				const ignoreDamageBonus = caster instanceof PartyMember && caster.Index < 16;
				const damage = Math.max(1, caster instanceof Monster ? caster.Level : Math.trunc(caster.Level / 2));
				const bonusDamage = caster.Attributes[Attribute.BonusSpellDamage];
				let minDamage = damage;
				let maxDamage = damage;
				if (!ignoreDamageBonus)
					[minDamage, maxDamage] = this.AdjustDamage(minDamage, maxDamage, bonusDamage);
				DealDamage(minDamage, maxDamage - minDamage);
				return;
			}
			case Spell.LPStealer: {
				const stealAmount = Math.min(caster.Level, target.HitPoints.CurrentValue);
				DealDamage(stealAmount, 0, false);
				caster.HitPoints.CurrentValue += Math.min(stealAmount, toUInt(caster.HitPoints.TotalMaxValue - caster.HitPoints.CurrentValue));
				if (caster instanceof PartyMember)
					layout.FillCharacterBars(caster);
				return;
			}
			case Spell.SPStealer: {
				// Note: In original when you steal more SP as the monster would need for an already
				// locked-in spell, it still casts that spell.
				const stealAmount = Math.min(caster.Level, target.SpellPoints.CurrentValue);
				target.SpellPoints.CurrentValue = target.SpellPoints.CurrentValue - stealAmount;
				caster.SpellPoints.CurrentValue += Math.min(stealAmount, toUInt(caster.SpellPoints.TotalMaxValue - caster.SpellPoints.CurrentValue));
				if (target instanceof PartyMember)
					layout.FillCharacterBars(target);
				else if (caster instanceof PartyMember)
					layout.FillCharacterBars(caster);
				break;
			}
			case Spell.MysticImitation: {
				if (target instanceof Monster) {
					this.ImitateMonster(caster instanceof PartyMember ? caster : null, target, finishAction);
					return;
				}
				break;
			}
			case Spell.MonsterKnowledge: {
				if (target instanceof Monster) {
					this.ShowMonsterInfo(target, finishAction);
					return;
				}
				break;
			}
			case Spell.ShowMonsterLP: {
				if (!this.showMonsterLP) {
					for (const monster of this.Monsters) {
						this.SetMonsterTooltip(monster);
					}

					this.showMonsterLP = true;
				}
				break;
			}
			case Spell.ShowElements: {
				if (!this.showElements) {
					for (const monster of this.Monsters) {
						this.SetMonsterTooltip(monster);
					}

					this.showElements = true;
				}
				break;
			}
			case Spell.ForeseeMagic:
				this.foreseeMagic = true;
				break;
			case Spell.ForeseeAttack:
				this.foreseeAttack = true;
				break;
			case Spell.RecognizeWeakPoint:
			case Spell.SeeWeaknesses:
			case Spell.KnowledgeOfTheWeakness: {
				if (target instanceof Monster) {
					if (!this.weakenedMonsters.includes(target))
						this.weakenedMonsters.push(target);
				}
				break;
			}
			case Spell.MysticDecay: {
				// Base Damage = Caster Level * 3 / 2
				// Dmg Increase % = (1 + (MaxTargetHP - CurrTargetHP) * 10 / MaxTargetHP) ^ 2
				// MinDmg = 5
				// The max damage at level 50 would be 150 against a target with 10% LP or below.
				// But Level and INT bonus is applied as well which can also increase the damage
				// by 50% or more.
				//
				// The damage is random between half the value and full the value while the min
				// value can still not be below 5.
				//
				// Caster Level 25
				// Target has 10%, 25%, 50%, 75%, 100% LP
				// 10% -> 200% * 25 = 50
				// 25% -> 164% * 25 = 41
				// 50% -> 136% * 25 = 34
				// 75% -> 109% * 25 = 27
				// 100% -> 101% * 25 = 25
				const ignoreDamageBonus = caster instanceof PartyMember && caster.Index < 16;
				let bonus = 1 + Math.max(0, idiv((target.HitPoints.MaxValue - target.HitPoints.CurrentValue) * 10, target.HitPoints.MaxValue));
				bonus *= bonus;
				const damage = Math.max(5, Math.trunc(Math.trunc(caster.Level * 3 / 2) * (100 + bonus) / 100));
				const bonusDamage = caster.Attributes[Attribute.BonusSpellDamage];
				let minDamage = Math.max(5, Math.trunc(damage / 2));
				let maxDamage = damage;

				if (!ignoreDamageBonus)
					[minDamage, maxDamage] = this.AdjustDamage(minDamage, maxDamage, bonusDamage);

				DealDamage(minDamage, maxDamage - minDamage);

				return;
			}
			case Spell.ProtectionSphere: {
				this.protectedCharacters.push(caster);
				break;
			}
			case Spell.ElementToEarth:
			case Spell.ElementToWind:
			case Spell.ElementToFire:
			case Spell.ElementToWater:
				if (target instanceof Monster) {
					const monsterTarget = target;
					const elementIndex = 4 + spell - Spell.ElementToEarth;

					monsterTarget.Element = 1 << elementIndex;

					this.SetMonsterTooltip(monsterTarget);
				}
				break;
			case Spell.MagicSwordAttack: {
				// Deals 100% to 125% of the total attack damage to an enemy row in range.
				// The damage is increased by 10% per additional APR (1 APR is 100% damage, 2 APR is 110% damage, etc).
				// The caster is healed by 10% of the damage dealt.
				let damageAmount = Math.max(caster.BaseAttackDamage + caster.BonusAttackDamage, 1);
				const aprBonus = caster.AttacksPerRound > 1 ? (caster.AttacksPerRound - 1) * 10 : 0;
				damageAmount += Math.trunc(damageAmount * aprBonus / 100);
				const minDamage = Math.max(damageAmount, 1);
				const maxDamage = Math.max(Math.trunc((125 * damageAmount) / 100), 1);
				const dealtDamage = DealDamage(minDamage, maxDamage - minDamage);
				caster.HitPoints.CurrentValue += Math.min(Math.trunc(dealtDamage / 10), toUInt(caster.HitPoints.TotalMaxValue - caster.HitPoints.CurrentValue));
				if (caster instanceof PartyMember)
					layout.FillCharacterBars(caster);
				return;
			}
			default:
				game.ApplySpellEffect(spell, caster, target, finishAction, false);
				return;
		}

		finishAction?.();
	}

	static GetElementIndex(spell) {
		if (spell >= Spell.Mudsling && spell <= Spell.Earthquake)
			return 4;
		if (spell >= Spell.Winddevil && spell <= Spell.Whirlwind)
			return 5;
		if (spell >= Spell.Firebeam && spell <= Spell.Firepillar)
			return 6;
		if (spell >= Spell.Waterfall && spell <= Spell.Iceshower)
			return 7;
		return 1; // all other relevant spells are spirit spells
	}

	StartMonsterAnimation(monster, setupAction, finishAction) {
		if (setupAction == null)
			return;

		const animation = this.layout.GetMonsterBattleAnimation(monster);

		const AnimationFinished = () => {
			animation.AnimationFinished.remove(AnimationFinished);
			this.currentBattleAnimation = null;
			this.currentlyAnimatedMonster = null;
			finishAction?.(animation);
		};

		animation.AnimationFinished.add(AnimationFinished);
		setupAction(animation);
		this.currentBattleAnimation = animation;
		this.currentlyAnimatedMonster = monster;
	}

	RemoveCharacterFromBattleField(character) {
		const position = this.GetCharacterPosition(character);

		if (position < 0) // already removed
			return;

		this.HideBattleFieldDamage(position);

		if (this.currentBattleAnimation != null && character === this.currentlyAnimatedMonster) {
			this.currentBattleAnimation?.Destroy();
			this.currentBattleAnimation = null;
			this.currentlyAnimatedMonster = null;
		}

		this.battleField[position] = null;
		[...this.roundBattleActions].filter(b => b.Character === character).forEach(b => b.Skip = true);
		this.game.RemoveBattleActor(character);
	}

	/** MoveCharacterTo(tile, character) or MoveCharacterTo(column, row, character) */
	MoveCharacterTo(column, row, character) {
		if (arguments.length === 2) {
			const tile = column;
			character = row;
			this.MoveCharacterTo(tile % 6, Math.trunc(tile / 6), character);
			return;
		}

		this.battleField[this.GetCharacterPosition(character)] = null;
		this.battleField[column + row * 6] = character;
		this.game.MoveBattleActorTo(column, row, character);
	}

	GetCharacterPosition(character) { return this.battleField.indexOf(character); }

	PickPanicAction(partyMember, playerBattleAction, forbiddenMoveSpots) {
		const position = this.GetCharacterPosition(partyMember);

		if (position >= 24 && partyMember.CanFlee()) {
			playerBattleAction.BattleAction = BattleActionType.Flee;
		} else if (position < 24 && partyMember.CanMove() && this.MoveSpotAvailable(position, partyMember, true, forbiddenMoveSpots)) {
			playerBattleAction.BattleAction = BattleActionType.Move;
			const playerColumn = position % 6;
			const playerRow = Math.trunc(position / 6);
			const possibleSpots = [];
			let newSpot = -1;
			const moveRange = Battle.GetMoveRange(partyMember);

			for (let column = Math.max(0, playerColumn - moveRange); column <= Math.min(5, playerColumn + moveRange); ++column) {
				const newPosition = column + (playerRow + 1) * 6;

				if (this.battleField[newPosition] == null && !forbiddenMoveSpots.includes(newPosition)) {
					if (column === playerColumn) {
						newSpot = newPosition;
						break;
					} else {
						possibleSpots.push(newPosition);
					}
				}
			}

			if (newSpot === -1) {
				if (possibleSpots.length === 0) {
					// Should not happen but if so, just do nothing.
					playerBattleAction.BattleAction = BattleActionType.None;
					return;
				}

				newSpot = possibleSpots[this.game.RandomInt(0, possibleSpots.length - 1)];
			}

			playerBattleAction.Parameter = Battle.CreateMoveParameter(newSpot);
		} else {
			playerBattleAction.BattleAction = BattleActionType.None;
		}
	}

	PickMadAction(partyMember, playerBattleAction, forbiddenMoveSpots) {
		const game = this.game;
		// Mad players can only attack and move.
		const position = this.GetCharacterPosition(partyMember);

		const TryAttack = () => {
			if (ConditionExtensions.CanAttack(partyMember.Conditions) &&
				!CharacterBattleExtensions.HasLongRangedWeapon(partyMember, game.ItemManager) &&
				this.AttackSpotAvailable(position, partyMember, true)) {
				playerBattleAction.BattleAction = BattleActionType.Attack;
				playerBattleAction.Parameter = Battle.CreateAttackParameter(this.GetRandomAttackSpot(position, partyMember), partyMember, game.ItemManager);
				return true;
			}

			return false;
		};

		const TryMove = () => {
			if (partyMember.CanMove() && this.MoveSpotAvailable(position, partyMember, false, forbiddenMoveSpots)) {
				const moveSpot = this.GetRandomMoveSpot(position, partyMember, forbiddenMoveSpots);
				if (moveSpot === UIntMaxValue) // still no spot found?
					return false;
				playerBattleAction.BattleAction = BattleActionType.Move;
				playerBattleAction.Parameter = Battle.CreateMoveParameter(moveSpot);
				forbiddenMoveSpots.push(moveSpot);
				return true;
			}

			return false;
		};

		let done;

		// Try attack first?
		if (game.RandomInt(0, 0xffff) < 40000) {
			done = TryAttack();

			if (!done)
				done = TryMove();
		}
		// Otherwise try move first
		else {
			done = TryMove();

			if (!done)
				done = TryAttack();
		}

		if (!done) {
			playerBattleAction.BattleAction = BattleActionType.None;
			playerBattleAction.Parameter = 0;
		}

		this.layout.UpdateCharacterStatus(game.SlotFromPartyMember(partyMember),
			BattleActionExtensions.ToStatusGraphic(playerBattleAction.BattleAction, playerBattleAction.Parameter, game.ItemManager));
	}

	PickMonsterAction(monster, wantsToFlee, forbiddenMonsterMoveSpots, canCast) {
		const game = this.game;
		const position = this.GetCharacterPosition(monster);

		const AttackOrMove = (mad = false) => {
			if (mad) {
				const TryAttack = () =>
					ConditionExtensions.CanAttack(monster.Conditions) &&
					!CharacterBattleExtensions.HasLongRangedWeapon(monster, game.ItemManager) &&
					this.AttackSpotAvailable(position, monster, false);
				const TryMove = () =>
					monster.CanMove() && this.MoveSpotAvailable(position, monster, wantsToFlee, forbiddenMonsterMoveSpots);
				if (game.RandomInt(0, 0xffff) < 40000) {
					if (TryAttack())
						return BattleActionType.Attack;
					if (TryMove())
						return BattleActionType.Move;
				} else {
					if (TryMove())
						return BattleActionType.Move;
					if (TryAttack())
						return BattleActionType.Attack;
				}
				return BattleActionType.None;
			} else {
				if (ConditionExtensions.CanAttack(monster.Conditions) && this.AttackSpotAvailable(position, monster, false))
					return BattleActionType.Attack;
				else if (monster.CanMove() && this.MoveSpotAvailable(position, monster, wantsToFlee, forbiddenMonsterMoveSpots))
					return BattleActionType.Move;
				else
					return BattleActionType.None;
			}
		};

		if (position < 6 && wantsToFlee && monster.CanFlee()) {
			return BattleActionType.Flee;
		}

		if (wantsToFlee && monster.CanMove()) {
			// In this case always retreat if possible
			if (this.MoveSpotAvailable(position, monster, wantsToFlee, forbiddenMonsterMoveSpots))
				return BattleActionType.Move;
		}

		if (hasFlag(monster.Conditions, Condition.Crazy)) {
			return AttackOrMove(true);
		}

		const possibleActions = [];
		let canAttackRanged = true;
		let canAttackMelee = true;

		while (true) {
			const rand = game.RandomInt(0, 15);

			if (rand < 8) {
				if (canCast && monster.HasAnySpell() && ConditionExtensions.CanCastSpell(monster.Conditions, game.Features) && this.CanCastAnySpell(monster)) {
					if (this.HasRangeDependentSpell(monster)) {
						if (!CharacterBattleExtensions.HasLongRangedWeapon(monster, game.ItemManager)) {
							const monsterRow = Math.trunc(this.GetCharacterPosition(monster) / 6);
							const partyMemberRowDistances = distinct(this.partyMembers
								.filter(p => p instanceof PartyMember)
								.filter(p => p.Alive && !this.fledCharacters.includes(p))
								.map(p => this.GetCharacterPosition(p))
								.map(pos => Math.trunc(pos / 6)))
								.map(row => Math.abs(row - monsterRow));

							if (!partyMemberRowDistances.some(dist => dist <= 1)) {
								if (ConditionExtensions.CanMove(monster.Conditions))
									return BattleActionType.Move;

								canCast = false;
								continue;
							}
						}
					}

					return BattleActionType.CastSpell;
				}

				canCast = false;
			} else if (rand < 14) {
				if (canAttackRanged) {
					const [hasLongRangedAttack, hasAmmo] = CharacterBattleExtensions.HasLongRangedAttack(monster, game.ItemManager);
					if (!hasLongRangedAttack) {
						canAttackRanged = false;
						continue;
					} else if (!hasAmmo) {
						const IsMeleeWeapon = itemIndex => game.ItemManager.GetItem(itemIndex).Type === ItemType.CloseRangeWeapon;
						const weaponSlot = getValue(monster.Equipment.Slots, EquipmentSlot.RightHand);
						game.EquipmentRemoved(monster, weaponSlot.ItemIndex, 1, hasFlag(weaponSlot.Flags, ItemSlotFlags.Cursed));
						const meleeWeaponSlot = monster.Inventory.Slots.find(s => !s.Empty && IsMeleeWeapon(s.ItemIndex)) ?? null;
						if (meleeWeaponSlot != null) {
							// Switch weapons
							weaponSlot.Exchange(meleeWeaponSlot);
							game.EquipmentAdded(weaponSlot.ItemIndex, 1, monster);
						} else {
							// Just drop the ranged weapon
							const emptyInventorySlot = monster.Inventory.Slots.find(s => s.Empty) ?? null;
							if (emptyInventorySlot != null)
								emptyInventorySlot.Replace(weaponSlot);
							weaponSlot.Clear();

							if (monster.BaseAttackDamage + monster.BonusAttackDamage === 0) {
								const moraleIndex = this.initialMonsters.indexOf(monster);
								this.monsterMorale[moraleIndex] = Math.trunc(this.monsterMorale[moraleIndex] / 2);
							}
						}
					}
					return AttackOrMove();
				}
			} else {
				if (canAttackMelee) {
					if (CharacterBattleExtensions.HasLongRangedWeapon(monster, game.ItemManager)) {
						canAttackMelee = false;
						continue;
					}
					return AttackOrMove();
				}
			}
		}
	}

	GetAvailableSpells(caster, checker) {
		const sp = caster.SpellPoints.CurrentValue;

		if (sp === 0)
			return [];

		return caster.LearnedSpells.filter(spell => {
			const spellInfo = this.game.SpellInfos.get(spell);
			return sp >= SpellInfos.GetSPCost(this.game.SpellInfos, this.game.Features, spell, caster) &&
				hasFlag(spellInfo.ApplicationArea, SpellApplicationArea.Battle) &&
				checker(spell);
		});
	}

	GetAvailableMonsterSpells(monster) {
		return this.GetAvailableSpells(monster, spell => {
			return SpellExtensions.IsCastableByMonster(spell) &&
				SpellTargetExtensions.TargetsEnemy(this.game.SpellInfos.get(spell).Target);
		});
	}

	CanCastAnySpell(monster) {
		return this.GetAvailableMonsterSpells(monster).length !== 0;
	}

	HasRangeDependentSpell(monster) {
		return this.GetAvailableMonsterSpells(monster).some(spell => SpellInfos.Entries.get(spell).Target === SpellTarget.EnemyRowInWeaponRange);
	}

	static GetMoveRange(character) {
		return Util.Limit(1, Math.trunc(character.Attributes[Attribute.Speed].TotalCurrentValue / 40), 3);
	}

	MoveSpotAvailable(characterPosition, character, wantsToFlee, forbiddenMoveSpots = null) {
		const moveRange = Battle.GetMoveRange(character);

		const [inRange, minX, maxX, minY, maxY] = this.GetRangeMinMaxValues(characterPosition, character, moveRange, RangeType.Move, wantsToFlee);
		if (!inRange)
			return false;

		const currentRow = Math.trunc(characterPosition / 6);

		for (let y = minY; y <= maxY; ++y) {
			if (character.Type === CharacterType.Monster) {
				if ((!wantsToFlee && y < currentRow) ||
					(wantsToFlee && y >= currentRow))
					continue;
			} else {
				if (wantsToFlee && y <= currentRow)
					continue;
			}

			for (let x = minX; x <= maxX; ++x) {
				if (this.battleField[x + y * 6] == null && (forbiddenMoveSpots == null || !forbiddenMoveSpots.includes(x + y * 6))) {
					if (y === currentRow) { // we only allow moving left/right in rare cases
						// Note: This can only happen if the monster doesn't want to flee
						if (character.Type !== CharacterType.Monster || this.IsPlayerNearby(x + y * 6)) // only move left/right to reach a player
							return true;
						else if (currentRow === 3) { // monster in second lowest row
							const currentX = characterPosition % 6;
							const xDir = x - currentX; // >0 = right, <0 = left
							let leftEnemyCount = 0;
							let rightEnemyCount = 0;

							for (let py = 3; py <= 4; py++) {
								for (let px = 0; px < 6; px++) {
									if (this.battleField[px + py * 6]?.Type === CharacterType.PartyMember) {
										if (px < currentX)
											leftEnemyCount++;
										else if (px > currentX)
											rightEnemyCount++;
									}
								}
							}

							if (xDir < 0 && leftEnemyCount >= rightEnemyCount)
								return true;
							else if (xDir > 0 && rightEnemyCount >= leftEnemyCount)
								return true;
						}
					} else {
						return true;
					}
				}
			}
		}

		return false;
	}

	AttackSpotAvailable(characterPosition, character, mad) {
		const [hasLongRangedAttack, hasAmmo] = CharacterBattleExtensions.HasLongRangedAttack(character, this.game.ItemManager);
		const range = hasLongRangedAttack && hasAmmo ? 6 : 1;

		const [inRange, minX, maxX, minY, maxY] = this.GetRangeMinMaxValues(characterPosition, character, range, RangeType.Enemy);
		if (!inRange)
			return false;

		const targetCheck = mad
			? (c => c != null && c !== character)
			: (c => c != null && c.Type !== character.Type);

		for (let y = minY; y <= maxY; ++y) {
			for (let x = minX; x <= maxX; ++x) {
				const position = x + y * 6;
				if (targetCheck(this.battleField[position]))
					return true;
			}
		}

		return false;
	}

	/** Returns [result, minX, maxX, minY, maxY] */
	GetRangeMinMaxValues(characterPosition, character, range, rangeType, wantsToFlee = false) {
		const characterX = characterPosition % 6;
		const characterY = Math.trunc(characterPosition / 6);
		const minX = Math.max(0, characterX - range);
		const maxX = Math.min(5, characterX + range);
		let minY;
		let maxY;

		if (character.Type === CharacterType.Monster) {
			if (rangeType === RangeType.Enemy) {
				minY = Math.max(3, characterY - range);
				maxY = Math.min(4, characterY + range);
			} else {
				minY = Math.max(0, characterY - range);
				maxY = Math.min(3, characterY + range);
			}

			if (wantsToFlee) {
				if (characterY === 0) // We are in perfect flee position, so don't move
					return [false, minX, maxX, minY, maxY];

				// Don't move down or to the side when trying to flee
				maxY = characterY - 1;
			} else {
				// TODO: Allow up movement if other monsters block path to players
				//       and we need to move around them.
				// Don't move up (away from players)
				minY = characterY;
			}
		} else if (wantsToFlee) { // Fleeing party member (Fear)
			minY = maxY = 4; // always move to last row when fleeing
		} else { // Mad party member
			if (rangeType === RangeType.Enemy) {
				minY = Math.max(0, characterY - range);
				maxY = Math.min(3, characterY + range);
			} else {
				minY = Math.max(3, characterY - range);
				maxY = Math.min(4, characterY + range);
			}
		}

		return [true, minX, maxX, minY, maxY];
	}

	GetRandomMoveSpot(characterPosition, character, forbiddenPositions) {
		const [, minX, maxX, minY, maxY] = this.GetRangeMinMaxValues(characterPosition, character, 1, RangeType.Move);
		const possiblePositions = [];
		for (let y = minY; y <= maxY; ++y) {
			for (let x = minX; x <= maxX; ++x) {
				const position = x + y * 6;

				if (this.battleField[position] == null && !forbiddenPositions.includes(position))
					possiblePositions.push(position);
			}
		}
		if (possiblePositions.length === 0)
			return UIntMaxValue;
		return possiblePositions[this.game.RandomInt(0, possiblePositions.length - 1)];
	}

	GetRandomAttackSpot(characterPosition, character) {
		// Note: This is only used for mad players, so the target can be of any kind.
		const [, minX, maxX, minY, maxY] = this.GetRangeMinMaxValues(characterPosition, character, 1, RangeType.Enemy);
		const possiblePositions = [];
		for (let y = minY; y <= maxY; ++y) {
			for (let x = minX; x <= maxX; ++x) {
				const position = x + y * 6;

				if (this.battleField[position] != null)
					possiblePositions.push(position);
			}
		}
		return possiblePositions[this.game.RandomInt(0, possiblePositions.length - 1)];
	}

	GetBestMoveSpot(characterPosition, monster, wantsToFlee, forbiddenMonsterMoveSpots) {
		const game = this.game;
		const battleField = this.battleField;
		const moveRange = monster.Attributes[Attribute.Speed].TotalCurrentValue >= 80 ? 2 : 1;
		const [, minX, maxX, minY, maxY] = this.GetRangeMinMaxValues(characterPosition, monster,
			moveRange, RangeType.Move, wantsToFlee);
		const currentColumn = characterPosition % 6;
		const currentRow = Math.trunc(characterPosition / 6);
		const possiblePositions = [];

		if (wantsToFlee) {
			for (let row = minY; row < currentRow; ++row) {
				if (battleField[currentColumn + row * 6] == null)
					return currentColumn + row * 6;
			}
		}

		for (let y = minY; y <= maxY; ++y) {
			for (let x = minX; x <= maxX; ++x) {
				const position = x + y * 6;

				if (battleField[position] == null && !forbiddenMonsterMoveSpots.includes(position)) {
					if (y === currentRow) { // we only allow moving left/right in rare cases
						// Note: This can only happen if the monster doesn't want to flee
						if (this.IsPlayerNearby(position)) // only move left/right to reach a player
							possiblePositions.push(position);
						else if (currentRow === 3) { // monster in second lowest row
							const currentX = characterPosition % 6;
							const xDir = x - currentX; // >0 = right, <0 = left
							let leftEnemyCount = 0;
							let rightEnemyCount = 0;

							for (let py = 3; py <= 4; py++) {
								for (let px = 0; px < 6; px++) {
									if (battleField[px + py * 6]?.Type === CharacterType.PartyMember) {
										if (px < currentX)
											leftEnemyCount++;
										else if (px > currentX)
											rightEnemyCount++;
									}
								}
							}

							if (xDir < 0 && leftEnemyCount >= rightEnemyCount)
								possiblePositions.push(position);
							else if (xDir > 0 && rightEnemyCount >= leftEnemyCount)
								possiblePositions.push(position);
						}
					} else {
						possiblePositions.push(position);
					}
				}
			}
		}

		if (!wantsToFlee) {
			// Prefer moving to positions where a player is nearby.
			// Also prefer moving straight down.
			let nearPlayerPositions = possiblePositions.filter(p => this.IsPlayerNearby(p));

			if (nearPlayerPositions.length !== 0) {
				// Prefer spots with the most reachable players
				if (nearPlayerPositions.length > 1) {
					const nearPlayerPositionsWithAmount = nearPlayerPositions.map(p => ({ p, n: this.NearbyPlayerAmount(p) }));
					// Note: List.Sort in .NET is not stable, Array.sort is.
					nearPlayerPositionsWithAmount.sort((a, b) => b.n - a.n);
					const maxAmount = nearPlayerPositionsWithAmount[0].n;

					if (maxAmount > last(nearPlayerPositionsWithAmount).n) {
						const taken = [];
						for (const p of nearPlayerPositionsWithAmount) { // TakeWhile
							if (p.n !== maxAmount)
								break;
							taken.push(p.p);
						}
						nearPlayerPositions = taken;
					}

					// Prefer spots in the center
					if (nearPlayerPositions.some(p => p % 6 === 2 || p % 6 === 3))
						nearPlayerPositions = nearPlayerPositions.filter(p => p % 6 === 2 || p % 6 === 3);
					else if (nearPlayerPositions.some(p => p % 6 === 1 || p % 6 === 4))
						nearPlayerPositions = nearPlayerPositions.filter(p => p % 6 === 1 || p % 6 === 4);
				}

				return nearPlayerPositions[game.RandomInt(0, nearPlayerPositions.length - 1)];
			}

			// If down and left/right is no player, move to the other direction instead.
			if (battleField[currentColumn + 18]?.Type !== CharacterType.PartyMember &&
				battleField[currentColumn + 24]?.Type !== CharacterType.PartyMember) {
				const specificPositions = possiblePositions.slice();

				// No target down below.
				if (currentColumn === 0) {
					for (const exclude of possiblePositions.filter(p => p % 6 === 0))
						removeItem(specificPositions, exclude);
				} else if (currentColumn === 5) {
					if (currentColumn === 0) {
						for (const exclude of possiblePositions.filter(p => p % 6 === 5))
							removeItem(specificPositions, exclude);
					}
				} else {
					const hasTargetsInColumn = newArray(6, false);

					for (let i = 0; i < 6; ++i) {
						hasTargetsInColumn[i] = battleField[18 + i]?.Type === CharacterType.PartyMember ||
							battleField[24 + i]?.Type === CharacterType.PartyMember;
					}

					if (hasTargetsInColumn[currentColumn - 1] && !hasTargetsInColumn[currentColumn + 1]) {
						for (const exclude of possiblePositions.filter(p => currentColumn < p % 6))
							removeItem(specificPositions, exclude);
					} else if (hasTargetsInColumn[currentColumn + 1] && !hasTargetsInColumn[currentColumn - 1]) {
						for (const exclude of possiblePositions.filter(p => currentColumn > p % 6))
							removeItem(specificPositions, exclude);
					} else {
						const hasLeftTargets = hasTargetsInColumn[currentColumn - 1] ||
							(currentColumn > 1 && hasTargetsInColumn[currentColumn - 2]) ||
							(currentColumn > 2 && hasTargetsInColumn[currentColumn - 3]) ||
							(currentColumn > 3 && hasTargetsInColumn[currentColumn - 4]);
						const hasRightTargets = hasTargetsInColumn[currentColumn + 1] ||
							(currentColumn < 4 && hasTargetsInColumn[currentColumn + 2]) ||
							(currentColumn < 3 && hasTargetsInColumn[currentColumn + 3]) ||
							(currentColumn < 2 && hasTargetsInColumn[currentColumn + 4]);

						if (hasLeftTargets && !hasRightTargets) {
							for (const exclude of possiblePositions.filter(p => currentColumn <= p % 6))
								removeItem(specificPositions, exclude);
						} else if (hasRightTargets && !hasLeftTargets) {
							for (const exclude of possiblePositions.filter(p => currentColumn >= p % 6))
								removeItem(specificPositions, exclude);
						}
					}

					if (specificPositions.length !== 0)
						return specificPositions[game.RandomInt(0, specificPositions.length - 1)];
				}
			}
			// Prefer moving straight down if not on left or right column
			else if (currentColumn !== 0 && currentColumn !== 5) {
				for (let row = maxY; row > currentRow; --row) {
					if (battleField[currentColumn + row * 6] == null) {
						return currentColumn + row * 6;
					}
				}
			}

			// Prefer move positions that are not on left or right side because positions in the middle
			// will generally be better for reaching players sooner.
			const positionsWithoutOutsideColumns = possiblePositions.filter(p => p % 6 !== 0 && p % 6 !== 5);

			if (positionsWithoutOutsideColumns.length !== 0)
				return positionsWithoutOutsideColumns[game.RandomInt(0, positionsWithoutOutsideColumns.length - 1)];
		} else {
			// Prefer moving straight back when fleeing
			for (let row = minY; row <= maxX; ++row) {
				if (battleField[currentColumn + row * 6] == null) {
					return currentColumn + row * 6;
				}
			}
		}

		return possiblePositions[game.RandomInt(0, possiblePositions.length - 1)];
	}

	IsPlayerNearby(position) {
		const minX = Math.max(0, position % 6 - 1);
		const maxX = Math.min(5, position % 6 + 1);
		const minY = Math.max(0, Math.trunc(position / 6) - 1);
		const maxY = Math.min(4, Math.trunc(position / 6) + 1);

		for (let y = minY; y <= maxY; ++y) {
			for (let x = minX; x <= maxX; ++x) {
				if (this.battleField[x + y * 6]?.Type === CharacterType.PartyMember)
					return true;
			}
		}

		return false;
	}

	NearbyPlayerAmount(position) {
		const minX = Math.max(0, position % 6 - 1);
		const maxX = Math.min(5, position % 6 + 1);
		const minY = Math.max(0, Math.trunc(position / 6) - 1);
		const maxY = Math.min(4, Math.trunc(position / 6) + 1);
		let amount = 0;

		for (let y = minY; y <= maxY; ++y) {
			for (let x = minX; x <= maxX; ++x) {
				if (this.battleField[x + y * 6]?.Type === CharacterType.PartyMember)
					++amount;
			}
		}

		return amount;
	}

	MonsterWantsToFlee(monster) {
		if (hasFlag(monster.BattleFlags, BattleFlags.Boss))
			return false;

		if (hasFlag(monster.Conditions, Condition.Panic))
			return true;

		if (hasFlag(monster.Conditions, Condition.Crazy))
			return false;

		const lowLPEffect = Math.trunc((monster.HitPoints.TotalMaxValue - monster.HitPoints.CurrentValue) * 75 / monster.HitPoints.TotalMaxValue);
		const rdeEffect = Math.trunc((this.relativeDamageEfficiency - 50) / 4);
		let monsterAllyEffect = 0;

		if (this.initialMonsters.length > 1)
			monsterAllyEffect = Math.trunc((this.Monsters.length - 1) * 40 / (this.initialMonsters.length - 1)) - 25;

		const fear = Util.Limit(0, lowLPEffect + rdeEffect - monsterAllyEffect, 100);
		const morale = this.monsterMorale[this.initialMonsters.indexOf(monster)];

		if (fear > morale) {
			const fleeChance = Math.min(fear - morale, 100);
			return this.game.RollDice100() < fleeChance;
		}

		return false;
	}

	GetBestAttackSpot(characterPosition, monster) {
		const game = this.game;
		const [hasLongRangedAttack, hasAmmo] = CharacterBattleExtensions.HasLongRangedAttack(monster, game.ItemManager);
		const range = hasLongRangedAttack && hasAmmo ? 6 : 1;
		const [, minX, maxX, minY, maxY] = this.GetRangeMinMaxValues(characterPosition, monster, range, RangeType.Enemy);
		const possiblePositions = new Map();
		const mad = hasFlag(monster.Conditions, Condition.Crazy);
		const targetCheck = mad
			? (c => c != null && c !== monster)
			: (c => c != null && c.Type === CharacterType.PartyMember);

		for (let y = minY; y <= maxY; ++y) {
			for (let x = minX; x <= maxX; ++x) {
				const position = x + y * 6;

				if (targetCheck(this.battleField[position]))
					possiblePositions.set(position, mad ? 0 : this.averagePlayerDamage[this.partyMembers.indexOf(this.battleField[position] instanceof PartyMember ? this.battleField[position] : null)]);
			}
		}

		if (possiblePositions.size === 1)
			return [...possiblePositions.keys()][0];

		if (!mad) {
			const maxDamage = max(possiblePositions, ([, Value]) => Value);
			const maxDamagePositions = [...possiblePositions].filter(([, Value]) => Value === maxDamage).map(([Key]) => Key);

			if (maxDamagePositions.length === 1)
				return maxDamagePositions[0];

			return maxDamagePositions[game.RandomInt(0, maxDamagePositions.length - 1)];
		}

		// Note: This looks up a dictionary value by a random index key (like the original code).
		return getValue(possiblePositions, game.RandomInt(0, possiblePositions.size - 1));
	}

	PickActionParameter(battleAction, monster, wantsToFlee, forbiddenMonsterMoveSpots) {
		const game = this.game;

		switch (battleAction) {
			case BattleActionType.Move: {
				const moveSpot = this.GetBestMoveSpot(this.GetCharacterPosition(monster), monster, wantsToFlee, forbiddenMonsterMoveSpots);
				forbiddenMonsterMoveSpots.push(moveSpot);
				return Battle.CreateMoveParameter(moveSpot);
			}
			case BattleActionType.Attack: {
				const weaponIndex = getValue(monster.Equipment.Slots, EquipmentSlot.RightHand).ItemIndex;
				let ammoIndex = getValue(monster.Equipment.Slots, EquipmentSlot.LeftHand).ItemIndex;
				if (ammoIndex === weaponIndex) // two-handed weapon?
					ammoIndex = 0;
				return Battle.CreateAttackParameter(this.GetBestAttackSpot(this.GetCharacterPosition(monster), monster), weaponIndex, ammoIndex);
			}
			case BattleActionType.CastSpell: {
				const maxPlayerDamage = max(this.averagePlayerDamage.filter((d, i) => this.partyMembers[i]?.Alive === true && !this.fledCharacters.includes(this.partyMembers[i])));
				const getPrio = damage => maxPlayerDamage === 0 ? 100 : Math.trunc(damage * 100 / maxPlayerDamage);
				const maxDamagePlayers = this.averagePlayerDamage.map((d, i) => ({ Damage: d, Player: this.partyMembers[i] }))
					.filter(x => x.Damage === maxPlayerDamage && x.Player?.Alive === true && !this.fledCharacters.includes(x.Player))
					.map(x => ({ Player: x.Player, Prio: getPrio(x.Damage), Row: Math.trunc(this.GetCharacterPosition(x.Player) / 6) }));
				const averagePrio = average(maxDamagePlayers, x => x.Prio);
				let spells = this.GetAvailableMonsterSpells(monster);
				let targetTileOrRow = 0;

				const PickBestTargetTile = () => {
					const players = maxDamagePlayers.slice();
					targetTileOrRow = toUInt(this.GetCharacterPosition(players[game.RandomInt(0, players.length - 1)].Player));
				};

				const PickBestTargetRow = reachableOnly => {
					let rows = groupBy(maxDamagePlayers, x => x.Row).map(g => ({ Row: g.Key, Prio: average(g, x => x.Prio) }));
					const monsterRow = Math.trunc(this.GetCharacterPosition(monster) / 6);

					if (reachableOnly && !CharacterBattleExtensions.HasLongRangedWeapon(monster, game.ItemManager)) {
						rows = rows.filter(r => Math.abs(r.Row - monsterRow) <= 1);

						if (rows.length === 0) {
							rows = distinct(this.partyMembers
								.filter(p => p instanceof PartyMember)
								.map(p => Math.trunc(this.GetCharacterPosition(p) / 6)))
								.filter(row => Math.abs(row - monsterRow) <= 1)
								.sort((a, b) => a - b)
								.map(row => ({ Row: row, Prio: 1.0 }));
						}
					}

					const maxRowPrio = max(rows, r => r.Prio);
					targetTileOrRow = toUInt(firstOrDefault(rows, row => row.Prio === maxRowPrio)?.Row ?? Math.min(4, monsterRow + 1));
				};

				const targetOf = s => game.SpellInfos.get(s).Target;

				if (spells.length === 1) {
					const spellTargetType = SpellInfos.Entries.get(spells[0]).Target;

					switch (spellTargetType) {
						case SpellTarget.SingleEnemy:
							PickBestTargetTile();
							break;
						case SpellTarget.EnemyRow:
							PickBestTargetRow(false);
							break;
						case SpellTarget.EnemyRowInWeaponRange:
							PickBestTargetRow(true);
							break;
						case SpellTarget.AllEnemies:
							targetTileOrRow = 0;
							break;
					}
				} else {
					if (count(this.partyMembers, p => p != null && p.Alive && !this.fledCharacters.includes(p)) === 1) {
						// Only 1 player in battle
						// Prefer single target spells
						const singleTargetSpells = spells.filter(s => targetOf(s) === SpellTarget.SingleEnemy);

						if (singleTargetSpells.length !== 0) {
							PickBestTargetTile();
							spells = singleTargetSpells;
						} else {
							const rowTargetSpells = spells.filter(s => targetOf(s) === SpellTarget.EnemyRow || targetOf(s) === SpellTarget.EnemyRowInWeaponRange);

							if (rowTargetSpells.length !== 0) {
								if (rowTargetSpells.some(s => targetOf(s) === SpellTarget.EnemyRowInWeaponRange)) {
									PickBestTargetRow(true);
									spells = rowTargetSpells.filter(s => targetOf(s) === SpellTarget.EnemyRowInWeaponRange);
								} else {
									PickBestTargetRow(false);
									spells = rowTargetSpells;
								}
							}

							// Otherwise pick from all spells
						}
					} else if (averagePrio >= 75 && spells.some(s => targetOf(s) === SpellTarget.AllEnemies)) {
						spells = spells.filter(s => targetOf(s) === SpellTarget.AllEnemies);
					} else if (averagePrio >= 50 && spells.some(s => targetOf(s) === SpellTarget.EnemyRowInWeaponRange)) {
						PickBestTargetRow(true);
						spells = spells.filter(s => targetOf(s) === SpellTarget.EnemyRowInWeaponRange);
					} else if (averagePrio >= 50 && spells.some(s => targetOf(s) === SpellTarget.EnemyRow)) {
						PickBestTargetRow(false);
						spells = spells.filter(s => targetOf(s) === SpellTarget.EnemyRow);
					} else { // single target spell
						PickBestTargetTile();
						spells = spells.filter(s => targetOf(s) === SpellTarget.SingleEnemy);
					}
					// This might happen if the monster only has All or Row spells and the prio forces to use a Single or Row spell.
					if (spells.length === 0)
						return 0; // This will abort casting and disallow casting in this round.
				}
				const spell = spells[game.RandomInt(0, spells.length - 1)];
				return Battle.CreateCastSpellParameter(targetTileOrRow, spell);
			}
			default:
				return 0;
		}
	}

	/**
	 * Overloads:
	 * - (battleEffect, tile, ticks, finishedAction, scale = 1.0, battleField = null)
	 * - (battleEffect, sourceTile, targetTile, ticks, finishedAction, scale = 1.0, battleField = null)
	 * - (index, graphicIndex, frameSize, numFrames, ticks, finishedAction, ticksPerFrame, initialDisplayLayer,
	 *    startPosition, endPosition, initialScale = 1.0, endScale = 1.0, mirrorX = false, endDisplayLayer = null) (private)
	 */
	PlayBattleEffectAnimation(...args) {
		if (args.length >= 10 || args[2] instanceof Size) {
			playSingleBattleEffectAnimation(this, ...args);
			return;
		}

		if (typeof args[3] !== 'number') {
			// (battleEffect, tile, ticks, finishedAction, scale, battleField)
			const [battleEffect, tile, ticks, finishedAction, scale = 1.0, battleField = null] = args;
			this.PlayBattleEffectAnimation(battleEffect, tile, tile, ticks, finishedAction, scale, battleField);
			return;
		}

		let [battleEffect, sourceTile, targetTile, ticks, finishedAction, scale = 1.0, battleField = null] = args;
		battleField ??= this.battleField;
		const effects = BattleEffects.GetEffectInfo(this.layout.RenderView, battleEffect, sourceTile, targetTile, battleField, scale);
		let numFinishedEffects = 0;

		const FinishEffect = () => {
			if (++numFinishedEffects === effects.length)
				finishedAction?.();
		};

		this.effectAnimations = this.layout.CreateBattleEffectAnimations(effects.length);

		for (let i = 0; i < effects.length; ++i) {
			const effect = effects[i];

			playSingleBattleEffectAnimation(this, i, effect.StartTextureIndex, effect.FrameSize, effect.FrameCount, ticks, FinishEffect,
				Math.trunc(effect.Duration / effect.FrameCount), effect.InitialDisplayLayer, effect.StartPosition, effect.EndPosition,
				effect.StartScale, effect.EndScale, effect.MirrorX, effect.EndDisplayLayer);
		}
	}

	// Lowest 5 bits: Tile index (0-29) to move to
	static CreateMoveParameter(targetTile) { return (targetTile & 0x1f) >>> 0; }
	// Lowest 5 bits: Tile index (0-29) to attack
	// Next 11 bits: Weapon item index (can be 0 for monsters)
	// Next 11 bits: Optional ammunition item index
	/**
	 * Overloads:
	 * - CreateAttackParameter(targetTile, weaponIndex = 0, ammoIndex = 0)
	 * - CreateAttackParameter(targetTile, character, itemManager)
	 */
	static CreateAttackParameter(targetTile, weaponIndex = 0, ammoIndex = 0) {
		if (weaponIndex != null && typeof weaponIndex === 'object') {
			const character = weaponIndex;
			const itemManager = ammoIndex;
			let characterWeaponIndex = character.Equipment.Slots.get(EquipmentSlot.RightHand)?.ItemIndex ?? 0;
			let characterAmmoIndex = 0;

			if (characterWeaponIndex !== 0) {
				const weapon = itemManager.GetItem(characterWeaponIndex);

				if (weapon.Type === ItemType.LongRangeWeapon && weapon.UsedAmmunitionType !== AmmunitionType.None) {
					characterAmmoIndex = character.Equipment.Slots.get(EquipmentSlot.LeftHand)?.ItemIndex ?? 0;
				}
			}

			return Battle.CreateAttackParameter(targetTile, characterWeaponIndex, characterAmmoIndex);
		}

		return ((targetTile & 0x1f) | ((weaponIndex & 0x7ff) << 5) | ((ammoIndex & 0x7ff) << 16)) >>> 0;
	}
	// Lowest 5 bits: Tile index (0-29) or row (0-4) to cast spell on
	// Next 5 bits: Item slot index (when spell came from an item, otherwise 0x1f)
	// Next bit: 0 = inventory item, 1 = equipped item
	// Next 16 bits: Spell index
	// Next 5 bits: Blink character position (0-29)
	static CreateCastSpellParameter(targetTileOrRow, spell, itemSlotIndex = null, equippedItem = null, blinkCharacterPosition = 0) {
		return ((targetTileOrRow & 0x1f) | (((itemSlotIndex ?? 0x1f) & 0x1f) << 5) | ((equippedItem === true) ? 0x400 : 0) |
			((spell & 0xffff) << 11) | ((blinkCharacterPosition & 0x1f) << 27)) >>> 0;
	}
	// Tile index (T, 0-29): 5 bits
	// Attack result (R): 3 bits
	// Damage (D): 16 bits
	// Follow action flags (F): 8 bits
	// FFFFFFFF DDDDDDDD DDDDDDDD RRRTTTTT
	static CreateHurtParameter(targetTile) { return (targetTile & 0x1f) >>> 0; }
	static UpdateHurtParameter(hurtParameter, damage, attackResult) {
		return ((hurtParameter & 0xff00001f) | ((damage & 0x0000ffff) << 8) | (attackResult << 5)) >>> 0;
	}
	static UpdateAttackFollowActionParameter(parameter, additionalFlags) {
		return (parameter | additionalFlags) >>> 0;
	}
	static GetTargetTileOrRowFromParameter(actionParameter) { return (actionParameter & 0x1f) >>> 0; }
	/** Returns [targetTile, weaponIndex, ammoIndex] */
	static GetAttackInformation(actionParameter) {
		const ammoIndex = (actionParameter >>> 16) & 0x7ff;
		const weaponIndex = (actionParameter >>> 5) & 0x7ff;
		const targetTile = actionParameter & 0x1f;
		return [targetTile, weaponIndex, ammoIndex];
	}
	static IsLongRangedAttack(actionParameter, itemManager) {
		const weaponIndex = (actionParameter >>> 5) & 0x7ff;

		if (weaponIndex === 0)
			return false;

		return itemManager?.GetItem(weaponIndex)?.Type === ItemType.LongRangeWeapon;
	}
	static GetCastSpell(actionParameter) { return (actionParameter >>> 11) & 0xffff; }
	static GetBlinkCharacterPosition(actionParameter) { return (actionParameter >>> 27) & 0x1f; }
	/** Returns [targetRowOrTile, spell, itemSlotIndex, equippedItem] */
	static GetCastSpellInformation(actionParameter) {
		const spell = (actionParameter >>> 11) & 0xffff;
		let itemSlotIndex = (actionParameter >>> 5) & 0x1f;
		const equippedItem = ((actionParameter >>> 10) & 0x01) !== 0;
		const targetRowOrTile = actionParameter & 0x1f;

		if (itemSlotIndex === 0x1f)
			itemSlotIndex = null;

		return [targetRowOrTile, spell, itemSlotIndex, equippedItem];
	}
	IsSelfSpell(caster, actionParameter) {
		return this.game.SpellInfos.get(Battle.GetCastSpell(actionParameter)).Target === SpellTarget.SingleFriend &&
			Battle.GetTargetTileOrRowFromParameter(actionParameter) === this.GetSlotFromCharacter(caster);
	}
	static IsCastFromItem(actionParameter) { return Battle.GetCastItemSlot(actionParameter) !== 0x1f; }
	static GetCastItemSlot(actionParameter) { return (actionParameter >>> 5) & 0x1f; }
	/** Returns [targetTile, damage, attackResult, flags] */
	static GetAttackFollowUpInformation(actionParameter) {
		const damage = (actionParameter >>> 8) & 0x0000ffff;
		const targetTile = actionParameter & 0x1f;
		const attackResult = (actionParameter >>> 5) & 0x7;
		const flags = (actionParameter & 0xff000000) >>> 0;
		return [targetTile, damage, attackResult, flags];
	}

	ImmuneToAttack(target, attacker) {
		if (!hasFlag(this.game.Features, Features.AdvancedMonsterFlags))
			return false;

		if (target.AdvancedMonsterFlags === AdvancedMonsterFlags.None)
			return false;

		const element = ItemElementExtensions.GetCharacterWeaponElement(attacker, this.game.ItemManager);

		return (toByte(target.AdvancedMonsterFlags) & (1 << toByte(element))) !== 0;
	}

	/** Returns [attackResult, damage, abortAttacking] */
	ProcessAttack(attacker, attackedSlot) {
		const game = this.game;
		let damage = 0;
		let abortAttacking = false;

		if (this.battleField[attackedSlot] == null) {
			abortAttacking = true;
			return [AttackResult.Missed, damage, abortAttacking];
		}

		const target = this.GetCharacterAt(attackedSlot);

		if (hasFlag(target.Conditions, Condition.Petrified)) {
			abortAttacking = true;
			return [AttackResult.Petrified, damage, abortAttacking];
		}

		const godMode = attacker instanceof PartyMember && game.Godmode;

		if (!godMode && attacker.MagicAttack >= 0 && target.MagicDefense > attacker.MagicAttack) {
			abortAttacking = true;
			return [AttackResult.Protected, damage, abortAttacking];
		}

		if (target instanceof Monster && this.ImmuneToAttack(target, attacker instanceof PartyMember ? attacker : null)) {
			abortAttacking = true;
			return [AttackResult.Immune, damage, abortAttacking];
		}

		let hitChance = attacker.Skills[Skill.Attack].TotalCurrentValue;

		if (hasFlag(game.Features, Features.ExtendedCurseEffects)) {
			let hitMalus = 0;

			if (!hasFlag(attacker.BattleFlags, BattleFlags.Boss) && hasFlag(attacker.Conditions, Condition.Drugged)) {
				hitMalus = 25;
			}

			if (hasFlag(attacker.Conditions, Condition.Blind)) {
				hitMalus += 50;
			} else if (hasFlag(attacker.Conditions, Condition.Aging) && this.agingValues.has(attacker)) {
				hitMalus += this.agingValues.get(attacker);
			}

			if (hasFlag(attacker.BattleFlags, BattleFlags.Boss))
				hitMalus >>>= 1;

			hitChance -= hitMalus;
		}

		if (attacker instanceof Monster && this.foreseeAttack)
			hitChance -= 25;

		if (!godMode && game.RollDice100() > hitChance)
			return [AttackResult.Failed, damage, abortAttacking];

		if (this.protectedCharacters.includes(target))
			return [AttackResult.Blocked, damage, abortAttacking];

		if (game.RollDice100() < attacker.Skills[Skill.CriticalHit].TotalCurrentValue) {
			if (!(target instanceof Monster) || !hasFlag(target.BattleFlags, BattleFlags.Boss)) {
				damage = target.HitPoints.CurrentValue;
				return [AttackResult.CriticalHit, damage, abortAttacking];
			}
		}

		damage = this.CalculatePhysicalDamage(attacker, target);

		if (target instanceof Monster && this.weakenedMonsters.includes(target)) {
			const bonus = hasFlag(target.BattleFlags, BattleFlags.Boss) ? 15 : 30;
			damage = Math.min(Math.trunc((100 + bonus) * damage / 100), target.HitPoints.CurrentValue);
		}

		if (damage <= 0) {
			if (!godMode) {
				damage = 0;
				return [AttackResult.NoDamage, damage, abortAttacking];
			} else {
				damage = 1;
			}
		}

		// Note: Monsters can't parry.
		if (target instanceof PartyMember && this.IsParryingSuccessfully(target, attacker)) {
			return [AttackResult.Blocked, damage, abortAttacking];
		}

		return [AttackResult.Damage, damage, abortAttacking];
	}

	IsParryingSuccessfully(partyMember, attacker) {
		const game = this.game;

		if (this.parryingPlayers.includes(partyMember)) {
			let parryChance = partyMember.Skills[Skill.Parry].TotalCurrentValue;

			if (hasFlag(game.Features, Features.ExtendedCurseEffects)) {
				let parryMalus = 0;

				if (hasFlag(partyMember.Conditions, Condition.Blind))
					parryMalus = 50;
				else if (hasFlag(attacker.Conditions, Condition.Aging) && this.agingValues.has(attacker))
					parryMalus = this.agingValues.get(attacker);

				if (hasFlag(partyMember.BattleFlags, BattleFlags.Boss))
					parryMalus >>>= 1;

				parryChance -= parryMalus;
			}

			if (game.RollDice100() < parryChance)
				return true;
		}

		return false;
	}

	CalculatePhysicalDamage(attacker, target) {
		const game = this.game;
		let attackDamage = attacker.BaseAttackDamage + attacker.BonusAttackDamage;

		if (attacker instanceof PartyMember)
			attackDamage = game.AdjustAttackDamageForNotUsedAmmunition(attacker, attackDamage);

		attackDamage = game.AddAttributeDamageBonus(attacker, attackDamage);

		let defense = target.BaseDefense + target.BonusDefense + Math.trunc(target.Attributes[Attribute.Stamina].TotalCurrentValue / 25);

		if (attackDamage > 0 && attacker instanceof PartyMember)
			attackDamage = Math.trunc((attackDamage * (100 + game.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Attack))) / 100);
		if (defense > 0 && target instanceof PartyMember)
			defense = Math.trunc((defense * (100 + game.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Protection))) / 100);

		if (hasFlag(game.Features, Features.ExtendedCurseEffects)) {
			let attackDamageMalus = 0;

			if (hasFlag(attacker.Conditions, Condition.Diseased)) {
				attackDamageMalus = 50;
			} else if (hasFlag(attacker.Conditions, Condition.Aging) && this.agingValues.has(attacker)) {
				attackDamageMalus = this.agingValues.get(attacker);
			}

			if (hasFlag(attacker.BattleFlags, BattleFlags.Boss))
				attackDamageMalus >>= 1;

			attackDamage = Math.max(0, Math.trunc(attackDamage * (100 - attackDamageMalus) / 100));

			let defenseMalus = 0;

			if (hasFlag(target.Conditions, Condition.Diseased)) {
				defenseMalus = 50;
			} else if (hasFlag(target.Conditions, Condition.Aging) && this.agingValues.has(target)) {
				defenseMalus = this.agingValues.get(target);
			}

			if (hasFlag(target.BattleFlags, BattleFlags.Boss))
				defenseMalus >>= 1;

			defense = Math.max(0, Math.trunc(defense * (100 - defenseMalus) / 100));
		}

		return Math.trunc((game.RandomInt(50, 100) * attackDamage) / 100) - Math.trunc((game.RandomInt(50, 100) * defense) / 100);
	}

	CalculateSpellDamage(caster, target, baseDamage, variableDamage) {
		// Note: In contrast to physical attacks this should always deal at least 1 damage
		return Math.max(1, variableDamage === 0 ? baseDamage : baseDamage + this.game.RandomInt(0, variableDamage));
	}
}

/** The private PlayBattleEffectAnimation overload which plays a single effect animation. */
function playSingleBattleEffectAnimation(battle, index, graphicIndex, frameSize, numFrames, ticks,
	finishedAction, ticksPerFrame, initialDisplayLayer, startPosition, endPosition,
	initialScale = 1.0, endScale = 1.0, mirrorX = false, endDisplayLayer = null) {
	const effectAnimation = battle.effectAnimations[index];
	const textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.BattleEffects);

	const UpdateDisplayLayer = progress => {
		effectAnimation.SetDisplayLayer(toByte(Util.Limit(0, Util.Round(initialDisplayLayer +
			(endDisplayLayer - initialDisplayLayer) * progress), 255)));
	};

	const EffectAnimationFinished = () => {
		if (endDisplayLayer !== initialDisplayLayer)
			effectAnimation.AnimationUpdated.remove(UpdateDisplayLayer);
		effectAnimation.AnimationFinished.remove(EffectAnimationFinished);
		effectAnimation.Visible = false;
		finishedAction?.();
	};

	effectAnimation.SetDisplayLayer(initialDisplayLayer);
	effectAnimation.SetStartFrame(textureAtlas.GetOffset(graphicIndex), frameSize, startPosition, initialScale, mirrorX);
	effectAnimation.AnimationFinished.add(EffectAnimationFinished);
	effectAnimation.Play(range(0, numFrames), ticksPerFrame, ticks, endPosition, endScale);
	effectAnimation.Visible = true;

	if (endDisplayLayer !== initialDisplayLayer)
		effectAnimation.AnimationUpdated.add(UpdateDisplayLayer);
}

export class BattleActionExtensions {
	static ToAnimationType(battleAction) {
		switch (battleAction) {
			case BattleActionType.Move: return MonsterAnimationType.Move;
			case BattleActionType.Attack: return MonsterAnimationType.CloseRangedAttack;
			case BattleActionType.CastSpell: return MonsterAnimationType.Cast;
			default: return null;
		}
	}

	static ToStatusGraphic(battleAction, parameter = 0, itemManager = null) {
		switch (battleAction) {
			case BattleActionType.Move: return UIGraphic.StatusMove;
			case BattleActionType.Attack: return Battle.IsLongRangedAttack(parameter, itemManager) ? UIGraphic.StatusRangeAttack : UIGraphic.StatusAttack;
			case BattleActionType.CastSpell: return Battle.IsCastFromItem(parameter) ? UIGraphic.StatusUseItem : UIGraphic.StatusUseMagic;
			case BattleActionType.Flee: return UIGraphic.StatusFlee;
			case BattleActionType.Parry: return UIGraphic.StatusDefend;
			default: return null;
		}
	}
}

try {
	ensurePartials();
} catch (e) {
	// ReferenceError: Game/AutoBattle.js is still being evaluated (import cycle).
	// The partials are then applied in the Battle constructor.
	if (!(e instanceof ReferenceError))
		throw e;
}

export {
	BattleActionType as Battle_BattleActionType,
	PlayerBattleAction as Battle_PlayerBattleAction,
	BattleAction as Battle_BattleAction
};

