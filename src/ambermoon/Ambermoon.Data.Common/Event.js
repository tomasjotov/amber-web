// Port of Ambermoon.Data.Common/Event.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { enumName, formatNumber, ArgumentException } from '../../runtime.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { EnumHelper } from '../Ambermoon.Common/EnumHelper.js';
import { CharacterDirection } from '../Ambermoon.Common/Direction.js';
import { TravelType } from './Enumerations/TravelType.js';
import { ActiveSpellType } from './Enumerations/ActiveSpellType.js';
import { Condition } from './Enumerations/Condition.js';
import { GenderFlag } from './Enumerations/Gender.js';
import { Attribute } from './Enumerations/Attribute.js';
import { Skill } from './Enumerations/Skill.js';
import { Language, ExtendedLanguage } from './Enumerations/Language.js';
import { SpellTypeMastery } from './Enumerations/SpellSchool.js';
import { PlaceType } from './Enumerations/PlaceType.js';
import { Option } from './Enumerations/Option.js';
import { Class } from './Enumerations/Class.js';
import { CharacterElement } from './Enumerations/CharacterElement.js';

export const EventType = Object.freeze({
	Invalid: 0,
	Teleport: 1,
	Door: 2,
	Chest: 3,
	MapText: 4,
	Spinner: 5,
	Trap: 6,
	ChangeBuffs: 7,
	Riddlemouth: 8,
	Reward: 9,
	ChangeTile: 10,
	StartBattle: 11,
	EnterPlace: 12,
	Condition: 13,
	Action: 14,
	Dice100Roll: 15,
	Conversation: 16,
	PrintText: 17,
	Create: 18,
	Decision: 19,
	ChangeMusic: 20,
	Exit: 21,
	Spawn: 22,
	Interact: 23,
	RemovePartyMember: 24,
	Delay: 25,
	PartyMemberCondition: 26,
	Shake: 27,
	ShowMap: 28,
	ToggleSwitch: 29,
	DynamicChangeTile: 30,
	RectangularExploration: 31,
	VerticalLineReveal: 32
});

const TransitionType = Object.freeze({
	MapChange: 0, // with black fading
	Teleporter: 1, // without black fading
	WindGate: 2, // you need the wind chain to use it
	Climbing: 3, // moving up (levitating or climbing up)
	Outro: 4, // teleport to outro sequence
	Falling: 5 // moving down (falling or climbing down)
});

const ChestFlags = Object.freeze({
	None: 0,
	Treasure: 1,
	NoSave: 2,
	ExtendedChest: 4
});

/**
 * This is used for text popups and traps.
 */
export const EventTrigger = Object.freeze({
	None: 0,
	Move: 1,
	EyeCursor: 2,
	Always: 3
});

const Response = Object.freeze({
	Close: 0,
	Yes: 1,
	No: 2
});

const TrapAilment = Object.freeze({
	None: 0,
	Crazy: 1,
	Blind: 2,
	Stoned: 3,
	Paralyzed: 4,
	Poisoned: 5,
	Petrified: 6,
	Diseased: 7,
	Aging: 8,
	Dead: 9
});

const TrapTarget = Object.freeze({
	ActivePlayer: 0,
	All: 1
});

const RewardType = Object.freeze({
	Attribute: 0,
	Skill: 1,
	HitPoints: 2,
	SpellPoints: 3,
	SpellLearningPoints: 4,
	Conditions: 5,
	UsableSpellTypes: 6,
	Languages: 7,
	Experience: 8,
	MaxAttribute: 9,
	AttacksPerRound: 10,
	TrainingPoints: 11,
	Level: 12,
	Damage: 13,
	Defense: 14,
	MaxHitPoints: 15,
	MaxSpellPoints: 16,
	EmpowerSpells: 17,
	ChangePortrait: 18,
	MaxSkill: 19,
	MagicArmorLevel: 20,
	MagicWeaponLevel: 21,
	Spells: 22
});

const RewardOperation = Object.freeze({
	Increase: 0,
	Decrease: 1,
	IncreasePercentage: 2,
	DecreasePercentage: 3,
	Fill: 4,
	Remove: 5, // Clear bit
	Add: 6, // Set bit
	Toggle: 7 // Toggle bit
});

const RewardTarget = Object.freeze({
	ActivePlayer: 0,
	All: 1,
	// Ambermoon Advanced only
	RandomPlayer: 2,
	FirstAnimal: 3,
	FirstPartyMember: 100,
	AllButFirstPartyMember: 200
});

const ConditionType = Object.freeze({
	GlobalVariable: 0,
	EventBit: 1,
	DoorOpen: 2,
	ChestOpen: 3,
	CharacterBit: 4,
	PartyMember: 5,
	ItemOwned: 6,
	UseItem: 7,
	KnowsKeyword: 8,
	LastEventResult: 9, // treasure fully looted, battle won, etc
	GameOptionSet: 10,
	CanSee: 11,
	Direction: 12,
	HasCondition: 13,
	Hand: 14,
	SayWord: 15, // it also pops up the dictionary to say something
	EnterNumber: 16, // enter number popup with correct number
	Levitating: 17,
	HasGold: 18,
	HasFood: 19,
	Eye: 20,
	Mouth: 21,
	TransportAtLocation: 22,
	MultiCursor: 23,
	TravelType: 24,
	LeadClass: 25,
	SpellEmpowered: 26,
	IsNight: 27,
	Attribute: 28,
	Skill: 29,
	HourTime: 30 // minute in an hour (ObjectValue = 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50 or 55)
});

const PartyMemberConditionType = Object.freeze({
	Level: 0,
	Attribute: 1,
	Skill: 2,
	TrainingPoints: 3,
	Language: 4
});

const PartyMemberConditionTarget = Object.freeze({
	ActivePlayer: 0,
	All: 1,
	Any: 2,
	Min: 3,
	Max: 4,
	Average: 5,
	Random: 6,
	FirstCharacter: 7, // Thalion, and then all others
	ActiveInventory: 255
});

const ActionType = Object.freeze({
	SetGlobalVariable: 0,
	SetEventBit: 1,
	LockDoor: 2,
	LockChest: 3,
	SetCharacterBit: 4,
	AddItem: 6,
	AddKeyword: 8,
	SetGameOption: 10,
	SetDirection: 12,
	AddCondition: 13,
	AddGold: 18,
	AddFood: 19
});

const InteractionType = Object.freeze({
	Keyword: 0,
	ShowItem: 1,
	GiveItem: 2,
	GiveGold: 3,
	GiveFood: 4,
	JoinParty: 5,
	LeaveParty: 6,
	Talk: 7,
	Leave: 8
});

const CreateType = Object.freeze({
	Item: 0,
	Gold: 1,
	Food: 2
});

const MapOptions = Object.freeze({
	None: 0,
	ShowSecretDoors: 1,
	ShowMonsters: 2,
	ShowPersons: 4,
	ShowTraps: 8
});

const ExplorationType = Object.freeze({
	Hide: 0,
	Reveal: 1,
	Invert: 2
});

/** C# string interpolation of an enum value (null -> '') */
function en(enumObject, value) {
	return value == null ? '' : enumName(enumObject, value);
}

/** string.Join(" ", bytes.Select(u => u.ToString("x2"))) */
function hexBytes(bytes, spec = 'x2') {
	return Array.from(bytes, u => formatNumber(u, spec)).join(' ');
}

const hasFlag = (value, flag) => (value & flag) === flag;

// IBranchEvent is a pure interface: event classes implementing it have the
// property AlternativeBranchEventIndex (check with `'AlternativeBranchEventIndex' in ev`).

export class Event {
	constructor() {
		this.Index = 0;
		this.Type = EventType.Invalid;
		this.Next = null;
	}

	CloneProperties(event, keepNext) {
		event.Index = this.Index;
		event.Type = this.Type;
		event.Next = keepNext ? this.Next : null;
	}

	static CloneBytes(bytes) {
		const newBytes = new Uint8Array(bytes.length);
		newBytes.set(bytes);
		return newBytes;
	}

	Clone(keepNext) {
		const clone = new Event();
		clone.Index = this.Index;
		clone.Type = this.Type;
		clone.Next = keepNext ? this.Next : null;
		return clone;
	}

	ToString() {
		return this.toString();
	}
}

export class TeleportEvent extends Event {
	static TransitionType = TransitionType;

	constructor() {
		super();
		this.MapIndex = 0;
		this.X = 0;
		this.Y = 0;
		this.Direction = CharacterDirection.Up;
		/** TravelType or null */
		this.NewTravelType = null;
		this.Transition = TransitionType.MapChange;
		this.Unknown2 = null;
	}

	Clone(keepNext) {
		const clone = new TeleportEvent();
		clone.MapIndex = this.MapIndex;
		clone.X = this.X;
		clone.Y = this.Y;
		clone.Direction = this.Direction;
		clone.NewTravelType = this.NewTravelType;
		clone.Transition = this.Transition;
		clone.Unknown2 = Event.CloneBytes(this.Unknown2);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		const position = this.X === 0 || this.Y === 0 ? 'same' : `${this.X},${this.Y}`;
		return `${en(EventType, this.Type)}: Map ${this.MapIndex} / Position ${position} / Direction ${en(CharacterDirection, this.Direction)}, Transition ${en(TransitionType, this.Transition)}, New Travel Type ${this.NewTravelType != null ? enumName(TravelType, this.NewTravelType) : 'None'}, Unknown3 ${hexBytes(this.Unknown2)}`;
	}
}

export class DoorEvent extends Event {
	constructor() {
		super();
		this.LockpickingChanceReduction = 0;
		this.DoorIndex = 0;
		this.TextIndex = 0;
		this.UnlockTextIndex = 0;
		this.Unused = 0;
		this.KeyIndex = 0;
		this.UnlockFailedEventIndex = 0;
	}

	get AlternativeBranchEventIndex() { return this.UnlockFailedEventIndex; }
	set AlternativeBranchEventIndex(value) { this.UnlockFailedEventIndex = value; }

	Clone(keepNext) {
		const clone = new DoorEvent();
		clone.LockpickingChanceReduction = this.LockpickingChanceReduction;
		clone.DoorIndex = this.DoorIndex;
		clone.TextIndex = this.TextIndex;
		clone.UnlockTextIndex = this.UnlockTextIndex;
		clone.Unused = this.Unused;
		clone.KeyIndex = this.KeyIndex;
		clone.UnlockFailedEventIndex = this.UnlockFailedEventIndex;
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		const lockType = this.LockpickingChanceReduction === 0 ? 'Open' : this.LockpickingChanceReduction >= 100 ? 'No Lockpicking' : `-${this.LockpickingChanceReduction}% Chance`;
		return `${en(EventType, this.Type)}: Key=${(this.KeyIndex === 0 ? 'None' : String(this.KeyIndex))}, Lock=[${lockType}], Event index if unlock failed ${formatNumber(this.UnlockFailedEventIndex, 'x4')}, Text ${(this.TextIndex === 0xff ? 'none' : String(this.TextIndex))}, UnlockText ${(this.UnlockTextIndex === 0xff ? 'none' : String(this.UnlockTextIndex))}, Door Index ${this.DoorIndex}`;
	}
}

export class ChestEvent extends Event {
	static ChestFlags = ChestFlags;

	constructor() {
		super();
		this.LockpickingChanceReduction = 0;
		this.TextIndex = 0; // 255 = none
		/**
		 * Note: This is 0-based but the files might by 1-based.
		 */
		this.ChestIndex = 0;
		this.Flags = ChestFlags.None;
		this.KeyIndex = 0;
		this.UnlockFailedEventIndex = 0;
		/**
		 * This gives the value to reduce the chance to find the chest.
		 * A value of 0 means that the chest is always available.
		 * Normally a value above 0 would be subtracted from the
		 * active player's search skill and then a dice roll is
		 * performed to check if the chest is found.
		 *
		 * However, the original implementation just checks if the
		 * value is non-zero and just dice rolls against the search
		 * skill, so this value is not used at all. Only as a switch
		 * for the search check between off (0) and on (not 0).
		 */
		this.FindChanceReduction = 0;
	}

	/**
	 * This is a 1-based index and also respects extended
	 * chests of Ambermoon Advanced.
	 */
	get RealChestIndex() {
		return hasFlag(this.Flags, ChestFlags.ExtendedChest)
			? 257 + this.ChestIndex
			: 1 + this.ChestIndex;
	}

	get CloseWhenEmpty() { return hasFlag(this.Flags, ChestFlags.Treasure); }
	get NoSave() { return hasFlag(this.Flags, ChestFlags.NoSave); }

	get AlternativeBranchEventIndex() { return this.UnlockFailedEventIndex; }
	set AlternativeBranchEventIndex(value) { this.UnlockFailedEventIndex = value; }

	get SearchSkillCheck() { return this.FindChanceReduction !== 0; }
	set SearchSkillCheck(value) { this.FindChanceReduction = value ? 50 : 0; }

	Clone(keepNext) {
		const clone = new ChestEvent();
		clone.LockpickingChanceReduction = this.LockpickingChanceReduction;
		clone.TextIndex = this.TextIndex;
		clone.ChestIndex = this.ChestIndex;
		clone.Flags = this.Flags;
		clone.KeyIndex = this.KeyIndex;
		clone.UnlockFailedEventIndex = this.UnlockFailedEventIndex;
		clone.FindChanceReduction = this.FindChanceReduction;
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		const lockType = this.LockpickingChanceReduction === 0 ? 'Open' : this.LockpickingChanceReduction >= 100 ? 'No Lockpicking' : `-${this.LockpickingChanceReduction}% Chance`;
		const chestType = hasFlag(this.Flags, ChestFlags.Treasure) ? 'Treasure' : 'Chest';
		const flags = [];
		if (hasFlag(this.Flags, ChestFlags.NoSave))
			flags.push('NoSave');
		if (this.SearchSkillCheck)
			flags.push('SearchCheck');
		const flagString = flags.length === 0 ? '' : 'Flags=' + flags.join(',') + ', ';
		return `${en(EventType, this.Type)}: ${chestType} ${this.RealChestIndex}, Lock=[${lockType}], ${flagString}Key=${(this.KeyIndex === 0 ? 'None' : String(this.KeyIndex))}, Event index if unlock failed ${formatNumber(this.UnlockFailedEventIndex, 'x4')}, Text ${(this.TextIndex === 0xff ? 'none' : String(this.TextIndex))}`;
	}
}

export class PopupTextEvent extends Event {
	static Response = Response;

	constructor() {
		super();
		this.TextIndex = 0;
		/**
		 * From event_pix (0-based). 0xff -> no image.
		 */
		this.EventImageIndex = 0;
		this.PopupTrigger = EventTrigger.None;
		this.TriggerIfBlind = false;
		this.Unknown = null;
	}

	get HasImage() { return this.EventImageIndex !== 0xff; }
	get CanTriggerByMoving() { return hasFlag(this.PopupTrigger, EventTrigger.Move); }
	get CanTriggerByCursor() { return hasFlag(this.PopupTrigger, EventTrigger.EyeCursor); }

	Clone(keepNext) {
		const clone = new PopupTextEvent();
		clone.TextIndex = this.TextIndex;
		clone.EventImageIndex = this.EventImageIndex;
		clone.PopupTrigger = this.PopupTrigger;
		clone.TriggerIfBlind = this.TriggerIfBlind;
		clone.Unknown = Event.CloneBytes(this.Unknown);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)}: Text ${this.TextIndex}, Image ${(this.EventImageIndex === 0xff ? 'None' : String(this.EventImageIndex))}, Trigger ${en(EventTrigger, this.PopupTrigger)}, ${(this.TriggerIfBlind ? '' : 'Not ')}Trigger If Blind, Unknown ${hexBytes(this.Unknown)}`;
	}
}

export class SpinnerEvent extends Event {
	constructor() {
		super();
		this.Direction = CharacterDirection.Up;
		this.Unused = null;
	}

	Clone(keepNext) {
		const clone = new SpinnerEvent();
		clone.Direction = this.Direction;
		clone.Unused = Event.CloneBytes(this.Unused);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)}: Direction ${en(CharacterDirection, this.Direction)}`;
	}
}

export class TrapEvent extends Event {
	static TrapAilment = TrapAilment;
	static TrapTarget = TrapTarget;

	constructor() {
		super();
		this.Ailment = TrapAilment.None;
		this.Target = TrapTarget.ActivePlayer;
		/**
		 * Base damage. Sometimes direct value but maybe in percentage of max health for other TrapType than 0?
		 */
		this.BaseDamage = 0;
		this.AffectedGenders = GenderFlag.None;
		this.Unused = null; // 5 bytes
	}

	GetAilment() {
		switch (this.Ailment) {
			case TrapAilment.Crazy: return Condition.Crazy;
			case TrapAilment.Blind: return Condition.Blind;
			case TrapAilment.Stoned: return Condition.Drugged;
			case TrapAilment.Paralyzed: return Condition.Lamed;
			case TrapAilment.Poisoned: return Condition.Poisoned;
			case TrapAilment.Petrified: return Condition.Petrified;
			case TrapAilment.Diseased: return Condition.Diseased;
			case TrapAilment.Aging: return Condition.Aging;
			case TrapAilment.Dead: return Condition.DeadCorpse;
			default: return Condition.None;
		}
	}

	Clone(keepNext) {
		const clone = new TrapEvent();
		clone.Ailment = this.Ailment;
		clone.Target = this.Target;
		clone.BaseDamage = this.BaseDamage;
		clone.AffectedGenders = this.AffectedGenders;
		clone.Unused = Event.CloneBytes(this.Unused);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)}: ${this.BaseDamage} damage with ailment ${en(TrapAilment, this.Ailment)} on ${en(TrapTarget, this.Target)}, Affected genders ${en(GenderFlag, this.AffectedGenders)}`;
	}
}

export class ChangeBuffsEvent extends Event {
	constructor() {
		super();
		/**
		 * 0 means all. (ActiveSpellType or null)
		 */
		this.AffectedBuff = null;
		this.Add = false;
		this.Unused1 = 0;
		/**
		 * Only used when adding buffs. Gives the level/value of the buff.
		 */
		this.Value = 0;
		/**
		 * Only used when adding buffs. Gives the duration in 5 min chunks.
		 * Should be in the range 5 to 180 (5 minutes to 15 hours).
		 */
		this.Duration = 0;
		this.Unused2 = null;
	}

	Clone(keepNext) {
		const clone = new ChangeBuffsEvent();
		clone.AffectedBuff = this.AffectedBuff;
		clone.Add = this.Add;
		clone.Unused1 = this.Unused1;
		clone.Value = this.Value;
		clone.Duration = this.Duration;
		clone.Unused2 = Event.CloneBytes(this.Unused2);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		const operation = this.Add ? 'AddBuff' : 'RemoveBuff';
		const values = this.Add ? ` , Value ${this.Value}, Duration ${this.Duration * 5} minutes` : '';

		return `${operation}: Affected buff ${(this.AffectedBuff == null ? 'all' : enumName(ActiveSpellType, this.AffectedBuff))}${values}`;
	}
}

export class RiddlemouthEvent extends Event {
	constructor() {
		super();
		this.RiddleTextIndex = 0;
		this.SolutionTextIndex = 0;
		this.CorrectAnswerDictionaryIndex1 = 0;
		this.CorrectAnswerDictionaryIndex2 = 0;
		this.Unused = null;
	}

	Clone(keepNext) {
		const clone = new RiddlemouthEvent();
		clone.RiddleTextIndex = this.RiddleTextIndex;
		clone.SolutionTextIndex = this.SolutionTextIndex;
		clone.CorrectAnswerDictionaryIndex1 = this.CorrectAnswerDictionaryIndex1;
		clone.CorrectAnswerDictionaryIndex2 = this.CorrectAnswerDictionaryIndex2;
		clone.Unused = Event.CloneBytes(this.Unused);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		const answerIndices = this.CorrectAnswerDictionaryIndex1 === this.CorrectAnswerDictionaryIndex2
			? `AnswerIndex ${this.CorrectAnswerDictionaryIndex1}`
			: `AnswerIndices ${this.CorrectAnswerDictionaryIndex1} or ${this.CorrectAnswerDictionaryIndex2}`;
		return `${en(EventType, this.Type)}: RiddleText ${this.RiddleTextIndex}, SolvedText ${this.SolutionTextIndex}, ${answerIndices}`;
	}
}

export class RewardEvent extends Event {
	static RewardType = RewardType;
	static RewardOperation = RewardOperation;
	static RewardTarget = RewardTarget;

	constructor() {
		super();
		this.TypeOfReward = RewardType.Attribute;
		this.Target = RewardTarget.ActivePlayer;
		this.Operation = RewardOperation.Increase;
		/**
		 * If set the real value is random in the range 0 to Value.
		 */
		this.Random = false;
		this.RewardTypeValue = 0;
		this.Value = 0;
		this.Unused = 0;
	}

	/** Attribute or null */
	get Attribute() { return this.TypeOfReward === RewardType.Attribute || this.TypeOfReward === RewardType.MaxAttribute ? this.RewardTypeValue : null; }
	/** Skill or null */
	get Skill() { return this.TypeOfReward === RewardType.Skill || this.TypeOfReward === RewardType.MaxSkill ? this.RewardTypeValue : null; }
	/** Language or null */
	get Languages() { const anyLanguages = this.AnyLanguages; return anyLanguages != null && anyLanguages < 0x100 ? anyLanguages : null; }
	/** ExtendedLanguage or null */
	get ExtendedLanguages() { const anyLanguages = this.AnyLanguages; return anyLanguages != null && anyLanguages >= 0x100 ? (anyLanguages >>> 8) : null; }
	get AnyLanguages() { return this.TypeOfReward === RewardType.Languages ? ((1 << this.RewardTypeValue) >>> 0) : null; }
	/** Condition or null */
	get Conditions() { return this.TypeOfReward === RewardType.Conditions ? (1 << this.RewardTypeValue) : null; }
	/** SpellTypeMastery or null */
	get UsableSpellTypes() { return this.TypeOfReward === RewardType.UsableSpellTypes ? (1 << this.RewardTypeValue) : null; }
	get Spells() { return this.TypeOfReward === RewardType.Spells ? ((1 << this.RewardTypeValue) >>> 0) : null; }

	Clone(keepNext) {
		const clone = new RewardEvent();
		clone.TypeOfReward = this.TypeOfReward;
		clone.Target = this.Target;
		clone.Operation = this.Operation;
		clone.Random = this.Random;
		clone.RewardTypeValue = this.RewardTypeValue;
		clone.Value = this.Value;
		clone.Unused = this.Unused;
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		const Value = this.Value;
		const Type = en(EventType, this.Type);
		let operationString;

		switch (this.Operation) {
			case RewardOperation.Increase: operationString = this.Random ? `+rand(0~${Value})` : `+${Value}`; break;
			case RewardOperation.Fill: operationString = 'max'; break;
			case RewardOperation.IncreasePercentage: operationString = this.Random ? `+rand(0%~${Value}%)` : `+${Value}%`; break;
			case RewardOperation.DecreasePercentage: operationString = this.Random ? `-rand(0%~${Value}%)` : `-${Value}%`; break;
			case RewardOperation.Remove: operationString = 'Remove'; break;
			case RewardOperation.Add: operationString = 'Add'; break;
			case RewardOperation.Toggle: operationString = 'Toggle'; break;
			default: operationString = `?op=${this.Operation}?`; break;
		}

		const target = this.Target >= RewardTarget.AllButFirstPartyMember
			? `All but PartyMember with index ${1 + this.Target - RewardTarget.AllButFirstPartyMember}` : this.Target >= RewardTarget.FirstPartyMember
			? `PartyMember with index ${1 + this.Target - RewardTarget.FirstPartyMember}` : enumName(RewardTarget, this.Target);

		const EmpowerString = () => {
			let element;

			switch (Value) {
				case 0: element = 'earth'; break;
				case 1: element = 'wind'; break;
				case 2: element = 'fire'; break;
				default: element = null; break;
			}

			return element == null ? 'Invalid' :
				`Grants empowered ${element} spells for ${target}`;
		};

		switch (this.TypeOfReward) {
			case RewardType.Attribute: return `${Type}: ${en(Attribute, this.Attribute)} on ${target} ${operationString}`;
			case RewardType.Skill: return `${Type}: ${en(Skill, this.Skill)} on ${target} ${operationString}`;
			case RewardType.HitPoints: return `${Type}: HP on ${target} ${operationString}`;
			case RewardType.SpellPoints: return `${Type}: SP on ${target} ${operationString}`;
			case RewardType.SpellLearningPoints: return `${Type}: SLP on ${target} ${operationString}`;
			case RewardType.Conditions: return `${Type}: ${operationString} ${en(Condition, this.Conditions)} on ${target}`;
			case RewardType.UsableSpellTypes: return `${Type}: ${operationString} ${en(SpellTypeMastery, this.UsableSpellTypes)} on ${target}`;
			case RewardType.Languages: return `${Type}: ${operationString} ${(this.Languages != null ? enumName(Language, this.Languages) : null) ?? (this.ExtendedLanguages != null ? enumName(ExtendedLanguage, this.ExtendedLanguages) : '')} on ${target}`;
			case RewardType.Experience: return `${Type}: Exp on ${target} ${operationString}`;
			case RewardType.MaxAttribute: return `${Type}: Max ${en(Attribute, this.Attribute)} on ${target} ${operationString}`;
			case RewardType.AttacksPerRound: return `${Type}: APR on ${enumName(RewardTarget, this.Target)} ${operationString}`;
			case RewardType.TrainingPoints: return `${Type}: TP on ${target} ${operationString}`;
			case RewardType.Level: return `${Type}: Level on ${target} ${operationString}`;
			case RewardType.Damage: return `${Type}: Damage on ${target} ${operationString}`;
			case RewardType.Defense: return `${Type}: Defense on ${target} ${operationString}`;
			case RewardType.MaxHitPoints: return `${Type}: Max HP on ${target} ${operationString}`;
			case RewardType.MaxSpellPoints: return `${Type}: Max SP on ${target} ${operationString}`;
			case RewardType.EmpowerSpells: return `${Type}: ${EmpowerString()}`;
			case RewardType.ChangePortrait: return `${Type}: Change portrait to ${Value} for ${target}`;
			case RewardType.MaxSkill: return `${Type}: Max ${en(Skill, this.Skill)} on ${target} ${operationString}`;
			case RewardType.MagicArmorLevel: return `${Type}: M-B-A on ${target} ${operationString}`;
			case RewardType.MagicWeaponLevel: return `${Type}: M-B-W on ${target} ${operationString}`;
			case RewardType.Spells: return `${Type}: ${operationString} spell ${this.RewardTypeValue} on ${target}`;
			default: return `${Type}: Unknown (${this.TypeOfReward}:${this.RewardTypeValue}) on ${target} ${operationString}`;
		}
	}
}

export class ChangeTileEvent extends Event {
	constructor() {
		super();
		this.X = 0;
		this.Y = 0;
		this.Unknown = null;
		this.FrontTileIndex = 0;
		/**
		 * 0 means same map
		 */
		this.MapIndex = 0;
	}

	get WallIndex() { return this.FrontTileIndex > 100 && this.FrontTileIndex < 255 ? this.FrontTileIndex - 100 : 0; }
	get ObjectIndex() { return this.FrontTileIndex <= 100 ? this.FrontTileIndex : 0; }

	Clone(keepNext) {
		const clone = new ChangeTileEvent();
		clone.X = this.X;
		clone.Y = this.Y;
		clone.FrontTileIndex = this.FrontTileIndex;
		clone.MapIndex = this.MapIndex;
		clone.Unknown = Event.CloneBytes(this.Unknown);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)}: Map ${(this.MapIndex === 0 ? 'Self' : String(this.MapIndex))}, X ${this.X}, Y ${this.Y}, Front tile / Wall / Object ${this.FrontTileIndex}, Unknown ${(this.Unknown == null ? 'null' : hexBytes(this.Unknown))}`;
	}
}

export class StartBattleEvent extends Event {
	constructor() {
		super();
		this.MonsterGroupIndex = 0;
		this.Unknown1 = null;
		this.Unknown2 = null;
	}

	Clone(keepNext) {
		const clone = new StartBattleEvent();
		clone.MonsterGroupIndex = this.MonsterGroupIndex;
		clone.Unknown1 = Event.CloneBytes(this.Unknown1);
		clone.Unknown2 = Event.CloneBytes(this.Unknown2);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)}: Monster group ${this.MonsterGroupIndex}, Unknown1 ${hexBytes(this.Unknown1)}, Unknown2 ${hexBytes(this.Unknown2)}`;
	}
}

export class EnterPlaceEvent extends Event {
	constructor() {
		super();
		this.OpeningHour = 0;
		this.ClosingHour = 0;
		this.PlaceIndex = 0;
		this.ClosedTextIndex = 0;
		this.PlaceType = PlaceType.Trainer;
		/**
		 * Displayed when you bought a horse, ship, etc.
		 * The text is taken from the map texts.
		 * 0xff means to use some default text.
		 */
		this.UsePlaceTextIndex = 0;
		this.MerchantDataIndex = 0;
	}

	Clone(keepNext) {
		const clone = new EnterPlaceEvent();
		clone.OpeningHour = this.OpeningHour;
		clone.ClosingHour = this.ClosingHour;
		clone.PlaceIndex = this.PlaceIndex;
		clone.ClosedTextIndex = this.ClosedTextIndex;
		clone.PlaceType = this.PlaceType;
		clone.UsePlaceTextIndex = this.UsePlaceTextIndex;
		clone.MerchantDataIndex = this.MerchantDataIndex;
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		const index = this.PlaceType === PlaceType.Merchant
			? `Merchant index ${this.MerchantDataIndex}` : this.PlaceType === PlaceType.Library
			? `Libary merchant index ${this.MerchantDataIndex}` : `Place index ${this.PlaceIndex}`;

		return `${en(PlaceType, this.PlaceType)}: ${index}, Open ${formatNumber(this.OpeningHour, '00')}-${formatNumber(this.ClosingHour, '00')}, TextIndexWhenClosed ${this.ClosedTextIndex}, UseTextIndex ${this.UsePlaceTextIndex}`;
	}
}

export class ConditionEvent extends Event {
	static ConditionType = ConditionType;

	constructor() {
		super();
		this.TypeOfCondition = ConditionType.GlobalVariable;
		this.DisallowedAilments = Condition.None;
		/**
		 * This depends on condition type.
		 * It can be the item or variable index for example.
		 */
		this.ObjectIndex = 0; // 0 = no variable needed
		this.Value = 0;
		this.Count = 0;
		/**
		 * Next map event to continue with if the condition was met.
		 * 0xffff means continue with next map event from the list.
		 */
		this.ContinueIfFalseWithMapEventIndex = 0;
	}

	get AlternativeBranchEventIndex() { return this.ContinueIfFalseWithMapEventIndex; }
	set AlternativeBranchEventIndex(value) { this.ContinueIfFalseWithMapEventIndex = value; }

	Clone(keepNext) {
		const clone = new ConditionEvent();
		clone.TypeOfCondition = this.TypeOfCondition;
		clone.ObjectIndex = this.ObjectIndex;
		clone.Value = this.Value;
		clone.Count = this.Count;
		clone.ContinueIfFalseWithMapEventIndex = this.ContinueIfFalseWithMapEventIndex;
		clone.DisallowedAilments = this.DisallowedAilments;
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		const Type = en(EventType, this.Type);
		const ObjectIndex = this.ObjectIndex;
		const Value = this.Value;
		const Count = this.Count;
		const falseHandling = this.ContinueIfFalseWithMapEventIndex === 0xffff
			? 'Stop here if false'
			: `Jump to event ${formatNumber(this.ContinueIfFalseWithMapEventIndex, 'x2')} if false`;

		const GetMultiCursorString = () => {
			let cursors = '';

			if ((ObjectIndex & 0x1) !== 0)
				cursors += 'Hand';
			if ((ObjectIndex & 0x2) !== 0)
				cursors += 'Eye';
			if ((ObjectIndex & 0x4) !== 0)
				cursors += 'Mouth';

			if (cursors.length === 0)
				return 'None';

			return cursors;
		};

		switch (this.TypeOfCondition) {
			case ConditionType.GlobalVariable: return `${Type}: Global variable ${ObjectIndex} = ${Value}, ${falseHandling}`;
			case ConditionType.EventBit: return `${Type}: Event bit ${Math.trunc(ObjectIndex / 64) + 1}:${1 + ObjectIndex % 64} = ${Value}, ${falseHandling}`;
			case ConditionType.DoorOpen: return `${Type}: Door ${ObjectIndex} ${(Value === 0 ? 'closed' : 'open')}, ${falseHandling}`;
			case ConditionType.ChestOpen: return `${Type}: Chest ${ObjectIndex} ${(Value === 0 ? 'closed' : 'open')}, ${falseHandling}`;
			case ConditionType.CharacterBit: return `${Type}: Character bit ${Math.trunc(ObjectIndex / 32) + 1}:${1 + ObjectIndex % 32} = ${Value}, ${falseHandling}`;
			case ConditionType.PartyMember: return `${Type}: Has party member ${ObjectIndex} without ailments ${EnumHelper.GetFlagNames(Condition, this.DisallowedAilments, 2)}, ${falseHandling}`;
			case ConditionType.ItemOwned: return `${Type}: ${(Value === 0 ? 'Not own item' : `Own item ${Math.max(1, Count)}x`)} ${ObjectIndex}, ${falseHandling}`;
			case ConditionType.UseItem: return `${Type}: Use item ${ObjectIndex}, ${falseHandling}`;
			case ConditionType.KnowsKeyword: return `${Type}: ${(Value === 0 ? 'Not know' : 'Know')} keyword ${ObjectIndex}, ${falseHandling}`;
			case ConditionType.LastEventResult: return `${Type}: Success of last event, ${falseHandling}`;
			case ConditionType.GameOptionSet: return `${Type}: Game option ${enumName(Option, 1 << ObjectIndex)} is ${(Value === 0 ? 'not set' : 'set')}, ${falseHandling}`;
			case ConditionType.CanSee: return `${Type}: ${(Value === 0 ? "Can't see" : 'Can see')}, ${falseHandling}`;
			case ConditionType.HasCondition: return `${Type}: ${(Value === 0 ? 'Has not' : 'Has')} condition ${enumName(Condition, 1 << ObjectIndex)}, ${falseHandling}`;
			case ConditionType.Hand: return `${Type}: Hand cursor ${(Value === 0 ? 'not ' : '')}used, ${falseHandling}`;
			case ConditionType.SayWord: return `${Type}: Say keyword ${ObjectIndex}, ${falseHandling}`;
			case ConditionType.EnterNumber: return `${Type}: Enter number ${ObjectIndex}, ${falseHandling}`;
			case ConditionType.Levitating: return `${Type}: Levitating, ${falseHandling}`;
			case ConditionType.HasGold: return `${Type}: Gold ${(Value === 0 ? '<' : '>=')} ${ObjectIndex}, ${falseHandling}`;
			case ConditionType.HasFood: return `${Type}: Food ${(Value === 0 ? '<' : '>=')} ${ObjectIndex}, ${falseHandling}`;
			case ConditionType.Eye: return `${Type}: Eye cursor ${(Value === 0 ? ' not ' : '')}used, ${falseHandling}`;
			case ConditionType.Mouth: return `${Type}: Mouth cursor ${(Value === 0 ? ' not ' : '')}used, ${falseHandling}`;
			case ConditionType.TransportAtLocation: return `${Type}: Transport ${(Value === 0 ? 'not ' : '')}at event location , ${falseHandling}`;
			case ConditionType.MultiCursor: return `${Type}: Any cursor of ${GetMultiCursorString()} ${(Value === 0 ? 'not ' : '')}used, ${falseHandling}`;
			case ConditionType.TravelType: return `${Type}: Travel type ${(Value === 0 ? 'not ' : '')}${EnumHelper.GetName(TravelType, ObjectIndex) ?? ''}, ${falseHandling}`;
			case ConditionType.LeadClass: return `${Type}: Active party member has ${(Value === 0 ? 'not ' : '')}class ${EnumHelper.GetName(Class, ObjectIndex) ?? ''}, ${falseHandling}`;
			case ConditionType.SpellEmpowered: return `${Type}: Active party member has ${(Value === 0 ? 'not ' : '')}${enumName(CharacterElement, 1 << (4 + Util.Limit(0, ObjectIndex, 2))).toLowerCase()} spells empowered, ${falseHandling}`;
			case ConditionType.IsNight: return `${Type}: Is ${(Value === 0 ? 'not ' : '')}night, ${falseHandling}`;
			case ConditionType.Attribute: return `${Type}: Active player ${enumName(Attribute, ObjectIndex)} ${(Value === 0 ? '<' : '>=')} ${Count}, ${falseHandling}`;
			case ConditionType.Skill: return `${Type}: Active player ${enumName(Skill, ObjectIndex)} ${(Value === 0 ? '<' : '>=')} ${Count}, ${falseHandling}`;
			case ConditionType.HourTime: return `${Type}: Minute of hour ${(Value === 0 ? '<>' : '==')} ${ObjectIndex}, ${falseHandling}`;
			default: return `${Type}: Unknown (${enumName(ConditionType, this.TypeOfCondition)}), Index ${ObjectIndex}, Value ${Value}, ${falseHandling}`;
		}
	}
}

export class PartyMemberConditionEvent extends Event {
	static PartyMemberConditionType = PartyMemberConditionType;
	static PartyMemberConditionTarget = PartyMemberConditionTarget;

	constructor() {
		super();
		this.TypeOfCondition = PartyMemberConditionType.Level;
		this.DisallowedAilments = Condition.None;
		this.Value = 0;
		this.ConditionValueIndex = 0; // Which attribute, skill, etc
		this.Target = PartyMemberConditionTarget.ActivePlayer;
		/**
		 * Next map event to continue with if the condition was met.
		 * 0xffff means continue with next map event from the list.
		 */
		this.ContinueIfFalseWithMapEventIndex = 0;
	}

	get AlternativeBranchEventIndex() { return this.ContinueIfFalseWithMapEventIndex; }
	set AlternativeBranchEventIndex(value) { this.ContinueIfFalseWithMapEventIndex = value; }

	Clone(keepNext) {
		const clone = new PartyMemberConditionEvent();
		clone.TypeOfCondition = this.TypeOfCondition;
		clone.Target = this.Target;
		clone.Value = this.Value;
		clone.ConditionValueIndex = this.ConditionValueIndex;
		clone.ContinueIfFalseWithMapEventIndex = this.ContinueIfFalseWithMapEventIndex;
		clone.DisallowedAilments = this.DisallowedAilments;
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		const Type = en(EventType, this.Type);
		const Value = this.Value;
		let target;

		switch (this.Target) {
			case PartyMemberConditionTarget.ActivePlayer: target = 'Active player'; break;
			case PartyMemberConditionTarget.All: target = 'All players'; break;
			case PartyMemberConditionTarget.Any: target = 'Any player'; break;
			case PartyMemberConditionTarget.Min: target = 'Min'; break;
			case PartyMemberConditionTarget.Max: target = 'Max'; break;
			case PartyMemberConditionTarget.Average: target = 'Average'; break;
			case PartyMemberConditionTarget.Random: target = 'Random player'; break;
			case PartyMemberConditionTarget.ActiveInventory: target = 'Active inventory'; break;
			default:
				// >= PartyMemberConditionTarget.FirstCharacter
				target = `Char ${1 + this.Target - PartyMemberConditionTarget.FirstCharacter}`;
				break;
		}

		const falseHandling = this.ContinueIfFalseWithMapEventIndex === 0xffff
			? 'Stop here if false'
			: `Jump to event ${formatNumber(this.ContinueIfFalseWithMapEventIndex, 'x2')} if false`;
		const disallowedAilments = this.DisallowedAilments === Condition.None
			? ''
			: ` (not ${EnumHelper.GetFlagNames(Condition, this.DisallowedAilments, 2)})`;

		switch (this.TypeOfCondition) {
			case PartyMemberConditionType.Level: return `${Type}: ${target} Level >= ${Value}${disallowedAilments}, ${falseHandling}`;
			case PartyMemberConditionType.Attribute: return `${Type}: ${target} ${enumName(Attribute, this.ConditionValueIndex)} >= ${Value}${disallowedAilments}, ${falseHandling}`;
			case PartyMemberConditionType.Skill: return `${Type}: ${target} ${enumName(Skill, this.ConditionValueIndex)} >= ${Value}${disallowedAilments}, ${falseHandling}`;
			case PartyMemberConditionType.TrainingPoints: return `${Type}: ${target} TP >= ${Value}${disallowedAilments}, ${falseHandling}`;
			case PartyMemberConditionType.Language: return `${Type}: ${target} has language ${(this.ConditionValueIndex < 8 ? enumName(Language, this.ConditionValueIndex) : enumName(ExtendedLanguage, this.ConditionValueIndex))} ${disallowedAilments}, ${falseHandling}`;
			default: return `${Type}: Unknown (${enumName(PartyMemberConditionType, this.TypeOfCondition)}), Target ${target}, Value ${Value}, ${falseHandling}`;
		}
	}
}

export class ActionEvent extends Event {
	static ActionType = ActionType;

	constructor() {
		super();
		this.TypeOfAction = ActionType.SetGlobalVariable;
		this.Unknown1 = null;
		/**
		 * This depends on condition type.
		 * It can be the item or variable index for example.
		 */
		this.ObjectIndex = 0; // 0 = no variable needed
		this.Value = 0;
		this.Count = 0;
		this.Unknown2 = null;
	}

	Clone(keepNext) {
		const clone = new ActionEvent();
		clone.TypeOfAction = this.TypeOfAction;
		clone.ObjectIndex = this.ObjectIndex;
		clone.Value = this.Value;
		clone.Count = this.Count;
		clone.Unknown1 = Event.CloneBytes(this.Unknown1);
		clone.Unknown2 = Event.CloneBytes(this.Unknown2);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		const Type = en(EventType, this.Type);
		const ObjectIndex = this.ObjectIndex;
		const Value = this.Value;
		const unknowns = `Unknown1 ${hexBytes(this.Unknown1)}, Unknown2 ${hexBytes(this.Unknown2)}`;

		switch (this.TypeOfAction) {
			case ActionType.SetGlobalVariable: return `${Type}: Set global variable ${ObjectIndex} to ${Value}, ${unknowns}`;
			case ActionType.SetEventBit: return `${Type}: Set event bit ${Math.trunc(ObjectIndex / 64) + 1}:${1 + ObjectIndex % 64} to ${(Value !== 0 ? 'inactive' : 'active')}, ${unknowns}`;
			case ActionType.LockDoor: return `${Type}: ${(Value === 0 ? 'Lock' : 'Unlock')} door ${ObjectIndex}, ${unknowns}`;
			case ActionType.LockChest: return `${Type}: ${(Value === 0 ? 'Lock' : 'Unlock')} chest ${ObjectIndex}, ${unknowns}`;
			case ActionType.SetCharacterBit: return `${Type}: Set character bit ${Math.trunc(ObjectIndex / 32) + 1}:${1 + ObjectIndex % 32} to ${(Value !== 0 ? 'hidden' : 'show')}, ${unknowns}`;
			case ActionType.AddItem: return `${Type}: ${(Value === 0 ? 'Remove' : 'Add')} ${Math.max(1, this.Count)}x item ${ObjectIndex}, ${unknowns}`;
			case ActionType.AddKeyword: return `${Type}: ${(Value === 0 ? 'Remove' : 'Add')} keyword ${ObjectIndex}, ${unknowns}`;
			case ActionType.SetGameOption: return `${Type}: ${(Value === 0 ? 'Deactivate' : 'Activate')} game option ${enumName(Option, 1 << ObjectIndex)}, ${unknowns}`;
			case ActionType.AddCondition: return `${Type}: ${(Value === 0 ? 'Remove' : 'Add')} condition ${enumName(Condition, 1 << ObjectIndex)}, ${unknowns}`;
			case ActionType.AddGold: return `${Type}: ${(Value === 0 ? 'Remove' : 'Add')} ${Math.max(1, ObjectIndex)} gold, ${unknowns}`;
			case ActionType.AddFood: return `${Type}: ${(Value === 0 ? 'Remove' : 'Add')} ${Math.max(1, ObjectIndex)} food, ${unknowns}`;
			default: return `${Type}: Unknown (${enumName(ActionType, this.TypeOfAction)}), Index ${ObjectIndex}, Value ${Value}, ${unknowns}`;
		}
	}
}

export class Dice100RollEvent extends Event {
	constructor() {
		super();
		/**
		 * Chance in percent: 0 ~ 100
		 */
		this.Chance = 0;
		/**
		 * Next map event to continue with if the condition was met.
		 * 0xffff means continue with next map event from the list.
		 */
		this.ContinueIfFalseWithMapEventIndex = 0;
		this.Unused = null;
	}

	get AlternativeBranchEventIndex() { return this.ContinueIfFalseWithMapEventIndex; }
	set AlternativeBranchEventIndex(value) { this.ContinueIfFalseWithMapEventIndex = value; }

	Clone(keepNext) {
		const clone = new Dice100RollEvent();
		clone.Chance = this.Chance;
		clone.ContinueIfFalseWithMapEventIndex = this.ContinueIfFalseWithMapEventIndex;
		clone.Unused = Event.CloneBytes(this.Unused);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		const falseHandling = this.ContinueIfFalseWithMapEventIndex === 0xffff
			? 'Stop here if false'
			: `Jump to event ${formatNumber(this.ContinueIfFalseWithMapEventIndex, 'x2')} if false`;

		return `${en(EventType, this.Type)}: Chance ${this.Chance}%, ${falseHandling}, Unused ${hexBytes(this.Unused)}`;
	}
}

export class ConversationEvent extends Event {
	static InteractionType = InteractionType;

	constructor() {
		super();
		this.Interaction = InteractionType.Keyword;
		this.Value = 0;
		this.Unused1 = null; // 4
		this.Unused2 = null; // 2
	}

	get KeywordIndex() { return this.Value; }
	get ItemIndex() { return this.Value; }

	Clone(keepNext) {
		const clone = new ConversationEvent();
		clone.Interaction = this.Interaction;
		clone.Value = this.Value;
		clone.Unused1 = Event.CloneBytes(this.Unused1);
		clone.Unused2 = Event.CloneBytes(this.Unused2);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		let argument;

		switch (this.Interaction) {
			case InteractionType.Keyword: argument = `, KeywordIndex ${this.KeywordIndex}`; break;
			case InteractionType.ShowItem: argument = `, Item ${this.ItemIndex}`; break;
			case InteractionType.GiveItem: argument = `, Item ${this.ItemIndex}`; break;
			default: argument = ''; break;
		}

		return `${en(EventType, this.Type)}: On interaction ${en(InteractionType, this.Interaction)}` + argument;
	}
}

export class PrintTextEvent extends Event {
	constructor() {
		super();
		this.NPCTextIndex = 0;
		this.Unused = null; // 8
	}

	Clone(keepNext) {
		const clone = new PrintTextEvent();
		clone.NPCTextIndex = this.NPCTextIndex;
		clone.Unused = Event.CloneBytes(this.Unused);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)}: NPCTextIndex ${this.NPCTextIndex}`;
	}
}

export class CreateEvent extends Event {
	// TODO: maybe the other 5 bytes are also used? flags, charges, etc?
	static CreateType = CreateType;

	constructor() {
		super();
		this.TypeOfCreation = CreateType.Item;
		this.Amount = 0;
		this.ItemIndex = 0;
		this.Unused = null;
	}

	Clone(keepNext) {
		const clone = new CreateEvent();
		clone.TypeOfCreation = this.TypeOfCreation;
		clone.Amount = this.Amount;
		clone.ItemIndex = this.ItemIndex;
		clone.Unused = Event.CloneBytes(this.Unused);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		switch (this.TypeOfCreation) {
			case CreateType.Item:
				return `${en(EventType, this.Type)}: ${this.Amount}x Item ${this.ItemIndex}`;
			case CreateType.Gold:
				return `${en(EventType, this.Type)}: ${this.Amount} Gold`;
			default:
				return `${en(EventType, this.Type)}: ${this.Amount} Food`;
		}
	}
}

export class DecisionEvent extends Event {
	constructor() {
		super();
		this.TextIndex = 0;
		this.Unknown1 = null;
		/**
		 * Event index to continue with if "No" is selected.
		 * 0xffff means just stop the event list when selecting "No".
		 */
		this.NoEventIndex = 0;
	}

	get AlternativeBranchEventIndex() { return this.NoEventIndex; }
	set AlternativeBranchEventIndex(value) { this.NoEventIndex = value; }

	Clone(keepNext) {
		const clone = new DecisionEvent();
		clone.TextIndex = this.TextIndex;
		clone.NoEventIndex = this.NoEventIndex;
		clone.Unknown1 = Event.CloneBytes(this.Unknown1);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)}: Text ${this.TextIndex}, Event index when selecting 'No' ${(this.NoEventIndex === 0xffff ? 'None' : formatNumber(this.NoEventIndex + 1, 'x4'))}, Unknown1 ${hexBytes(this.Unknown1)}`;
	}
}

export class ChangeMusicEvent extends Event {
	constructor() {
		super();
		this.MusicIndex = 0;
		this.Volume = 0;
		this.Unknown1 = null;
	}

	Clone(keepNext) {
		const clone = new ChangeMusicEvent();
		clone.MusicIndex = this.MusicIndex;
		clone.Volume = this.Volume;
		clone.Unknown1 = Event.CloneBytes(this.Unknown1);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)}: Music ${(this.MusicIndex === 255 ? '<Map music>' : String(this.MusicIndex))}, Volume ${formatNumber(Math.fround(this.Volume / 255.0), '0.0')}, Unknown1 ${hexBytes(this.Unknown1)}`;
	}
}

export class ExitEvent extends Event {
	constructor() {
		super();
		this.Unused = null;
	}

	Clone(keepNext) {
		const clone = new ExitEvent();
		clone.Unused = Event.CloneBytes(this.Unused);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)}`;
	}
}

export class SpawnEvent extends Event {
	constructor() {
		super();
		this.X = 0;
		this.Y = 0;
		this.TravelType = TravelType.Walk;
		this.Unknown1 = null;
		this.MapIndex = 0;
		this.Unknown2 = null;
	}

	Clone(keepNext) {
		const clone = new SpawnEvent();
		clone.X = this.X;
		clone.Y = this.Y;
		clone.TravelType = this.TravelType;
		clone.MapIndex = this.MapIndex;
		clone.Unknown1 = Event.CloneBytes(this.Unknown1);
		clone.Unknown2 = Event.CloneBytes(this.Unknown2);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)} ${en(TravelType, this.TravelType)} on map ${this.MapIndex} at ${this.X}, ${this.Y}`;
	}
}

export class InteractEvent extends Event {
	constructor() {
		super();
		this.Unused = null;
	}

	Clone(keepNext) {
		const clone = new InteractEvent();
		clone.Unused = Event.CloneBytes(this.Unused);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)}`;
	}
}

export class RemovePartyMemberEvent extends Event {
	constructor() {
		super();
		this.CharacterIndex = 0;
		this.ChestIndexEquipment = 0;
		this.ChestIndexInventory = 0;
		this.Unused = null;
	}

	Clone(keepNext) {
		const clone = new RemovePartyMemberEvent();
		clone.CharacterIndex = this.CharacterIndex;
		clone.ChestIndexEquipment = this.ChestIndexEquipment;
		clone.ChestIndexInventory = this.ChestIndexInventory;
		clone.Unused = Event.CloneBytes(this.Unused);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)} ${this.CharacterIndex} (Equip -> Chest ${this.ChestIndexEquipment}, Items -> Chest ${this.ChestIndexInventory})`;
	}
}

export class DelayEvent extends Event {
	constructor() {
		super();
		this.Milliseconds = 0;
		this.Unused1 = null;
		this.Unused2 = 0;
	}

	Clone(keepNext) {
		const clone = new DelayEvent();
		clone.Milliseconds = this.Milliseconds;
		clone.Unused1 = Event.CloneBytes(this.Unused1);
		clone.Unused2 = this.Unused2;
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)} ${this.Milliseconds} ms`;
	}
}

export class ShakeEvent extends Event {
	constructor() {
		super();
		this.Shakes = 0;
		this.Unused1 = null;
		this.Unused2 = 0;
	}

	Clone(keepNext) {
		const clone = new ShakeEvent();
		clone.Shakes = this.Shakes;
		clone.Unused1 = Event.CloneBytes(this.Unused1);
		clone.Unused2 = this.Unused2;
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)} ${this.Shakes} shakes`;
	}
}

export class ShowMapEvent extends Event {
	static MapOptions = MapOptions;

	constructor() {
		super();
		this.Options = MapOptions.None;
		this.Unused = null;
	}

	Clone(keepNext) {
		const clone = new ShowMapEvent();
		clone.Options = this.Options;
		clone.Unused = Event.CloneBytes(this.Unused);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)} Option=${en(MapOptions, this.Options)}`;
	}
}

export class ToggleSwitchEvent extends Event {
	constructor() {
		super();
		this.FrontTileIndexOff = 0;
		this.FrontTileIndexOn = 0;
		this.GlobalVariableBytes = new Uint8Array([0, 0, 0, 0, 0]); // 5 bytes = 40 bits = 4 global vars with 10 bits each
	}

	/** up to 4 (array of numbers; assign an array of exactly 4 numbers) */
	get GlobalVariables() {
		if (this.GlobalVariableBytes == null || this.GlobalVariableBytes.length < 5)
			this.GlobalVariableBytes = new Uint8Array([0, 0, 0, 0, 0]);
		else if (this.GlobalVariableBytes.length > 5)
			this.GlobalVariableBytes = this.GlobalVariableBytes.slice(0, this.GlobalVariableBytes.length - 5);

		const GlobalVariableBytes = this.GlobalVariableBytes;
		let globalVar1 = GlobalVariableBytes[0];
		let globalVar2 = GlobalVariableBytes[1];
		let globalVar3 = GlobalVariableBytes[2];
		let globalVar4 = GlobalVariableBytes[3];

		globalVar1 <<= 2;
		globalVar1 |= (globalVar2 >> 6);
		globalVar2 &= 0x3f;
		globalVar2 <<= 4;
		globalVar2 |= (globalVar3 >> 4);
		globalVar3 &= 0xf;
		globalVar3 <<= 6;
		globalVar3 |= (globalVar4 >> 2);
		globalVar4 &= 0x3;
		globalVar4 <<= 8;
		globalVar4 |= GlobalVariableBytes[4];

		return Object.freeze([globalVar1, globalVar2, globalVar3, globalVar4]);
	}

	set GlobalVariables(value) {
		if (value == null || value.length !== 4)
			throw new ArgumentException('Exactly 4 global variables required.');

		const var1 = value[0] & 0x3ff;
		const var2 = value[1] & 0x3ff;
		const var3 = value[2] & 0x3ff;
		const var4 = value[3] & 0x3ff;

		if (this.GlobalVariableBytes == null || this.GlobalVariableBytes.length < 5)
			this.GlobalVariableBytes = new Uint8Array([0, 0, 0, 0, 0]);

		this.GlobalVariableBytes[0] = (var1 >> 2) & 0xff;
		this.GlobalVariableBytes[1] = ((var1 & 0x3) << 6 | (var2 >> 4)) & 0xff;
		this.GlobalVariableBytes[2] = ((var2 & 0xf) << 4 | (var3 >> 6)) & 0xff;
		this.GlobalVariableBytes[3] = ((var3 & 0x3f) << 2 | (var4 >> 8)) & 0xff;
		this.GlobalVariableBytes[4] = (var4 & 0xff);
	}

	Clone(keepNext) {
		const clone = new ToggleSwitchEvent();
		clone.FrontTileIndexOff = this.FrontTileIndexOff;
		clone.FrontTileIndexOn = this.FrontTileIndexOn;
		clone.GlobalVariableBytes = Event.CloneBytes(this.GlobalVariableBytes);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)} OffTile=${this.FrontTileIndexOff}, OnTile=${this.FrontTileIndexOn}, GlobVars=${this.GlobalVariables.filter(v => v !== 0).join(',')}`;
	}
}

export class DynamicChangeTileEvent extends Event {
	constructor() {
		super();
		this.X = 0;
		this.Y = 0;
		this.GlobalVariable = 0;
		this.FrontTileIndexOff = 0;
		this.FrontTileIndexOn = 0;
		/**
		 * 0 means same map
		 */
		this.MapIndex = 0;
	}

	get WallIndexOff() { return this.FrontTileIndexOff > 100 && this.FrontTileIndexOff < 255 ? this.FrontTileIndexOff - 100 : 0; }
	get WallIndexOn() { return this.FrontTileIndexOn > 100 && this.FrontTileIndexOn < 255 ? this.FrontTileIndexOn - 100 : 0; }
	get ObjectIndexOff() { return this.FrontTileIndexOff <= 100 ? this.FrontTileIndexOff : 0; }
	get ObjectIndexOn() { return this.FrontTileIndexOn <= 100 ? this.FrontTileIndexOn : 0; }

	Clone(keepNext) {
		const clone = new DynamicChangeTileEvent();
		clone.X = this.X;
		clone.Y = this.Y;
		clone.GlobalVariable = this.GlobalVariable;
		clone.FrontTileIndexOff = this.FrontTileIndexOff;
		clone.FrontTileIndexOn = this.FrontTileIndexOn;
		clone.MapIndex = this.MapIndex;
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)}: Map ${(this.MapIndex === 0 ? 'Self' : String(this.MapIndex))}, X ${this.X}, Y ${this.Y}, Front tile / Wall / Object ${this.FrontTileIndexOff}/${this.FrontTileIndexOn}`;
	}
}

/**
 * Changes the exploration of a rectangular area of a map.
 *
 * It is possible to reveal or hide areas but also to invert
 * the current exploration (e.g. hidden -> revealed and vice versa).
 */
export class RectangularExplorationEvent extends Event {
	static ExplorationType = ExplorationType;

	constructor() {
		super();
		this.X = 0;
		this.Y = 0;
		this.Width = 0;
		this.Height = 0;
		this.Exploration = ExplorationType.Hide;
		/**
		 * 0 means same map
		 */
		this.MapIndex = 0;
		this.Unused = 0;
	}

	Clone(keepNext) {
		const clone = new RectangularExplorationEvent();
		clone.X = this.X;
		clone.Y = this.Y;
		clone.Width = this.Width;
		clone.Height = this.Height;
		clone.Exploration = this.Exploration;
		clone.MapIndex = this.MapIndex;
		clone.Unused = this.Unused;
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)}: Map ${(this.MapIndex === 0 ? 'Self' : String(this.MapIndex))}, ${en(ExplorationType, this.Exploration)} (${this.X},${this.Y}):(${this.Width}x${this.Height})`;
	}
}

/**
 * This event always targets the current map.
 * It can reveal up to 3 vertical lines on the dungeon map.
 * So it explores those tiles.
 * Each vertial line is given by the X and Y of the first tile
 * and a height value which specifies the number of tiles to
 * go down.
 *
 * The benefit of this event is that you can reveal 3 areas
 * at once. For bigger rectangular areas the RectangularExplorationEvent
 * is more suitable. This is also true if you need to hide/toggle
 * exploration instead of revealing or need to specify a different
 * target map.
 *
 * This event is mainly useful for non-rectangular shapes like circles
 * on the map which should be revealed.
 */
export class VerticalLineRevealEvent extends Event {
	constructor() {
		super();
		this.X1 = 0;
		this.Y1 = 0;
		this.Height1 = 0;
		this.X2 = 0;
		this.Y2 = 0;
		this.Height2 = 0;
		this.X3 = 0;
		this.Y3 = 0;
		this.Height3 = 0;
	}

	Clone(keepNext) {
		const clone = new VerticalLineRevealEvent();
		clone.X1 = this.X1;
		clone.Y1 = this.Y1;
		clone.Height1 = this.Height1;
		clone.X2 = this.X2;
		clone.Y2 = this.Y2;
		clone.Height2 = this.Height2;
		clone.X3 = this.X3;
		clone.Y3 = this.Y3;
		clone.Height3 = this.Height3;
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return `${en(EventType, this.Type)}: (${this.X1},${this.Y1}:${this.Height1}), (${this.X2},${this.Y2}:${this.Height2}), (${this.X3},${this.Y3}:${this.Height3})`;
	}
}

export class DebugEvent extends Event {
	constructor() {
		super();
		this.Data = null;
	}

	Clone(keepNext) {
		const clone = new DebugEvent();
		clone.Data = Event.CloneBytes(this.Data);
		this.CloneProperties(clone, keepNext);
		return clone;
	}

	toString() {
		return en(EventType, this.Type) + ': ' + hexBytes(this.Data, 'X2');
	}
}

export {
	TransitionType as TeleportEvent_TransitionType,
	ChestFlags as ChestEvent_ChestFlags,
	Response as PopupTextEvent_Response,
	TrapAilment as TrapEvent_TrapAilment,
	TrapTarget as TrapEvent_TrapTarget,
	RewardType as RewardEvent_RewardType,
	RewardOperation as RewardEvent_RewardOperation,
	RewardTarget as RewardEvent_RewardTarget,
	ConditionType as ConditionEvent_ConditionType,
	PartyMemberConditionType as PartyMemberConditionEvent_PartyMemberConditionType,
	PartyMemberConditionTarget as PartyMemberConditionEvent_PartyMemberConditionTarget,
	ActionType as ActionEvent_ActionType,
	InteractionType as ConversationEvent_InteractionType,
	CreateType as CreateEvent_CreateType,
	MapOptions as ShowMapEvent_MapOptions,
	ExplorationType as RectangularExplorationEvent_ExplorationType
};
