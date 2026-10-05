// Amberstar persons and monsters (CHARDATA.AMB) -> Ambermoon PartyMember, NPC, Monster, MonsterGroup and
// conversations.
//
// Amberstar has one character file for everything: persons (type 0) are party members if they can join
// (join chance != 0, or the hero 1), other persons are NPCs, type 1 records are monsters. The CHARDATA
// index is kept as Ambermoon character index (GetInitialPartyMember(i), GetNPC(i), GetMonster(i)).
import { PartyMember } from '../../../ambermoon/Ambermoon.Data.Common/PartyMember.js';
import { NPC } from '../../../ambermoon/Ambermoon.Data.Common/NPC.js';
import { Monster } from '../../../ambermoon/Ambermoon.Data.Common/Monster.js';
import { MonsterGroup } from '../../../ambermoon/Ambermoon.Data.Common/MonsterGroup.js';
import { EquipmentSlot } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/EquipmentSlot.js';
import { Attribute } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Attribute.js';
import { Skill } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Skill.js';
import { ItemFlags } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/ItemFlags.js';
import {
	ConversationEvent, PrintTextEvent, CreateEvent, ActionEvent, RewardEvent, ConditionEvent, Dice100RollEvent,
	InteractEvent, EventType,
} from '../../../ambermoon/Ambermoon.Data.Common/Event.js';
import { MonsterWriter } from '../../../ambermoon/Ambermoon.Data.Legacy/Characters/MonsterWriter.js';
import { MonsterReader } from '../../../ambermoon/Ambermoon.Data.Legacy/Characters/MonsterReader.js';
import { DataWriter } from '../../../ambermoon/Ambermoon.Data.Legacy/Serialization/DataWriter.js';
import { DataReader } from '../../../ambermoon/Ambermoon.Data.Legacy/Serialization/DataReader.js';
import { loadPerson, loadMonster } from '../../../../amberstar/src/data/characters.js';
import { DataReader as AmberstarDataReader } from '../../../../amberstar/src/data/reader.js';
import {
	mapClass, mapRace, mapLanguages, mapLanguageBit, mapConditions, mapConditionBit, classSpellMastery,
	learnedSpellBitsToSpells, addLearnedSpell, spellMasteryOfSpells, mapSpell, mapBattleFlags, mapElement,
	AmberstarSkillListen,
} from './mappings.js';
import { convertItemSlot } from './items.js';
import { textBlocksToStrings, messageToString, getKeywordIndex } from './texts.js';
import { AmberstarQuestBitGlobalVariableOffset } from '../maps2D/events.js';

// Amberstar messages (amberstar/src/game/messages.js) used as conversation fallback texts
const MessageNothingToSayAboutThat = 133;
const MessageNotInterestedInJoining = 139;

const NoBranch = 0xffff;

// ---------------------------------------------------------------------------------------------
// Character values
// ---------------------------------------------------------------------------------------------
function setValue(characterValue, current, max, bonus = 0) {
	characterValue.CurrentValue = current;
	characterValue.MaxValue = max;
	characterValue.BonusValue = bonus;
}

function fillCharacter(ctx, character, index, a, isMonster) {
	character.Index = index;
	character.Name = a.name;
	character.Gender = a.gender & 1;
	character.Race = mapRace(a.race);
	character.Class = mapClass(a.class);
	character.Level = a.level;
	character.Gold = a.gold;
	character.Food = a.food;
	character.CharacterBitIndex = 0xffff;
	character.Conditions = mapConditions(a.physicalConditions ?? 0, a.mentalConditions ?? 0);
	character.SpokenLanguages = mapLanguages(a.conversationData?.learnedLanguages ?? 0xff);
	character.JoinPercentage = a.conversationData?.joinChance ?? 0;
	if (a.attributes) {
		for (let i = 0; i < 8; i++) {
			const v = a.attributes[i + 1];
			setValue(character.Attributes[i], v.currentValue, v.maxValue);
		}
		for (let i = 0; i < 10; i++) {
			const v = a.skills[i + 1];
			if (i === AmberstarSkillListen) // listening -> critical hit, see mappings.js
				setValue(character.Skills[Skill.CriticalHit], 0, isMonster ? 0 : Math.min(v.maxValue, 50));
			else
				setValue(character.Skills[i], v.currentValue, v.maxValue);
		}
		setValue(character.HitPoints, a.hitPoints.currentValue, a.hitPoints.maxValue);
		setValue(character.SpellPoints, a.spellPoints.currentValue, a.spellPoints.maxValue);
		character.BaseDefense = a.defense ?? 0;
		character.BaseAttackDamage = a.damage ?? 0;
		character.AttacksPerRound = Math.max(1, a.attacksPerRound ?? 1);
	}
	const age = a.conversationData?.age;
	if (age)
		setValue(character.Attributes[Attribute.Age], age.currentValue, age.maxValue);
}

/** Puts the Amberstar equipment and inventory into the Ambermoon slots and recomputes the item bonuses. */
function fillItems(character, a, itemManager, applyBonuses) {
	a.equipment.forEach((slot, i) => {
		character.Equipment.Slots.set(EquipmentSlot.Neck + i, convertItemSlot(slot.count, slot.item));
	});
	// Ambermoon has 24 inventory slots, Amberstar 12
	a.inventory.forEach((slot, i) => {
		character.Inventory.Slots[i] = convertItemSlot(slot.count, slot.item);
	});
	let weight = character.Gold * 5 + character.Food * 250;
	let hands = 0, fingers = 0;
	for (const slot of [...character.Equipment.Slots.values(), ...character.Inventory.Slots]) {
		if (slot.Empty)
			continue;
		const item = itemManager.GetItem(slot.ItemIndex);
		if (item)
			weight += slot.Amount * item.Weight;
	}
	character.TotalWeight = weight;
	if (!applyBonuses)
		return;
	for (const slot of character.Equipment.Slots.values()) {
		if (slot.Empty)
			continue;
		const item = itemManager.GetItem(slot.ItemIndex);
		if (!item)
			continue;
		const sign = (item.Flags & ItemFlags.Accursed) ? -1 : 1;
		character.BonusAttackDamage += sign * item.Damage;
		character.BonusDefense += sign * item.Defense;
		character.MagicAttack += item.MagicAttackLevel;
		character.MagicDefense += item.MagicArmorLevel;
		character.HitPoints.BonusValue += sign * item.HitPoints;
		character.SpellPoints.BonusValue += sign * item.SpellPoints;
		if (item.Attribute != null)
			character.Attributes[item.Attribute].BonusValue += sign * item.AttributeValue;
		if (item.Skill != null)
			character.Skills[item.Skill].BonusValue += sign * item.SkillValue;
		if (item.SkillPenalty1Value !== 0)
			character.Skills[item.SkillPenalty1].BonusValue -= item.SkillPenalty1Value;
		if (item.SkillPenalty2Value !== 0)
			character.Skills[item.SkillPenalty2].BonusValue -= item.SkillPenalty2Value;
		hands += item.NumberOfHands;
		fingers += item.NumberOfFingers;
	}
	character.NumberOfOccupiedHands = hands;
	character.NumberOfOccupiedFingers = fingers;
}

// ---------------------------------------------------------------------------------------------
// Conversations
//
// Amberstar: up to 10 interactions (trigger + 5 reactions) for "quest not completed" and 10 for
// "quest completed" (quest completion flag = savegame quest bit = Ambermoon global variable).
// Ambermoon: ConversationEvent (interaction) followed by an event chain (PrintText, Create, Action,
// Reward, Interact, Condition, ...). The texts are the character Texts (PrintTextEvent.NPCTextIndex).
//
// Texts: 0 = look-at text (eye on the map character), 1..n = Amberstar dialogue text blocks,
// then fallback messages.
// Each distinct trigger gets one ConversationEvent. If the person has a quest flag and the trigger
// exists in both blocks, a ConditionEvent (global variable == 0) selects the block, the other block is
// the alternative branch. Triggers which only exist in one block are guarded by the condition as well
// and show "nothing to say about that" otherwise.
// Reactions:
//   Say -> PrintText, TeachWord -> Action AddKeyword (dictionary index = fragment index),
//   GiveItem -> Create item (copy of the person's item slot), GiveGold/GiveFood -> Create gold/food,
//   CompleteQuest -> Action SetGlobalVariable, ChangeStat -> Reward (active party member) or Action.
// Give item/gold/food triggers start with an Interact event (removes the given item/gold/food) and the
// join trigger with an optional dice roll (join chance) and an Interact event (adds the member).
// ---------------------------------------------------------------------------------------------
class EventListBuilder {
	constructor() {
		this.Events = [];
		this.EventList = [];
	}

	add(event, type) {
		event.Type = type;
		event.Index = this.Events.length + 1;
		this.Events.push(event);
		return event;
	}

	chain(events) {
		for (let i = 0; i + 1 < events.length; i++)
			events[i].Next = events[i + 1];
		return events[0] ?? null;
	}
}

function printText(builder, textIndex) {
	const e = new PrintTextEvent();
	e.NPCTextIndex = textIndex;
	e.Unused = new Uint8Array(8);
	return builder.add(e, EventType.PrintText);
}

function interact(builder) {
	const e = new InteractEvent();
	e.Unused = new Uint8Array(9);
	return builder.add(e, EventType.Interact);
}

function action(builder, type, objectIndex, value, count = 0) {
	const e = new ActionEvent();
	e.TypeOfAction = type;
	e.ObjectIndex = objectIndex;
	e.Value = value;
	e.Count = count;
	e.Unknown1 = new Uint8Array(2);
	e.Unknown2 = new Uint8Array(2);
	return builder.add(e, EventType.Action);
}

function create(builder, type, amount, itemIndex = 0) {
	const e = new CreateEvent();
	e.TypeOfCreation = type;
	e.Amount = amount;
	e.ItemIndex = itemIndex;
	e.Unused = new Uint8Array(4);
	return builder.add(e, EventType.Create);
}

function reward(builder, type, operation, rewardTypeValue, value) {
	const e = new RewardEvent();
	e.TypeOfReward = type;
	e.Target = RewardEvent.RewardTarget.ActivePlayer;
	e.Operation = operation;
	e.Random = false;
	e.RewardTypeValue = rewardTypeValue;
	e.Value = value;
	e.Unused = 0;
	return builder.add(e, EventType.Reward);
}

function condition(builder, type, objectIndex, value, falseIndex) {
	const e = new ConditionEvent();
	e.TypeOfCondition = type;
	e.ObjectIndex = objectIndex;
	e.Value = value;
	e.Count = 0;
	e.DisallowedAilments = 0;
	e.ContinueIfFalseWithMapEventIndex = falseIndex;
	return builder.add(e, EventType.Condition);
}

function dice(builder, chance, falseIndex) {
	const e = new Dice100RollEvent();
	e.Chance = chance;
	e.ContinueIfFalseWithMapEventIndex = falseIndex;
	e.Unused = new Uint8Array(6);
	return builder.add(e, EventType.Dice100Roll);
}

/** Amberstar ChangeStat reaction (offset into the character data, operation 1-5, value) -> events. */
function statChangeEvents(builder, offset, operation, value) {
	const R = RewardEvent.RewardType, O = RewardEvent.RewardOperation;
	const op = operation === 1 ? O.Increase : operation === 2 ? O.Decrease : operation === 3 ? O.Remove : operation === 4 ? O.Add : O.Toggle;
	const numeric = operation === 1 || operation === 2;
	const r = (type, typeValue = 0) => reward(builder, type, op, typeValue, value);
	if (offset >= 0x06 && offset <= 0x19 && numeric) {
		const skill = (offset - 6) % 10;
		if (skill === AmberstarSkillListen)
			return [];
		return [r(offset >= 0x10 ? R.MaxSkill : R.Skill, skill)];
	}
	if (offset === 0x1b && numeric) return [r(R.Level)];
	if (offset === 0x1e && numeric) return [r(R.Defense)];
	if (offset === 0x1f && numeric) return [r(R.Damage)];
	if (offset === 0x20 && numeric) return [r(R.MagicWeaponLevel)];
	if (offset === 0x21 && numeric) return [r(R.MagicArmorLevel)];
	if (offset === 0x37 && !numeric) // languages: value = bit number
		return [reward(builder, R.Languages, op, mapLanguageBit(value), 0)];
	if ((offset === 0x3a || offset === 0x3b) && !numeric) {
		const bit = mapConditionBit((offset === 0x3a ? 8 : 0) + value);
		return bit == null ? [] : [reward(builder, R.Conditions, op, bit, 0)];
	}
	if (offset === 0x43 && numeric) return [r(R.AttacksPerRound)];
	if (offset >= 0x48 && offset <= 0x6c && numeric) {
		const attribute = Math.floor((offset - 0x48) / 2) % 10;
		if (attribute > Attribute.Age)
			return [];
		return [r(offset >= 0x5c ? R.MaxAttribute : R.Attribute, attribute)];
	}
	if (offset === 0x86 && numeric) return [r(R.HitPoints)];
	if (offset === 0x88 && numeric) return [r(R.MaxHitPoints)];
	if (offset === 0x8a && numeric) return [r(R.SpellPoints)];
	if (offset === 0x8c && numeric) return [r(R.MaxSpellPoints)];
	if (offset === 0x8e && numeric) return [r(R.SpellLearningPoints)];
	if (offset === 0x90 && numeric)
		return [action(builder, ActionEvent.ActionType.AddGold, value, operation === 1 ? 1 : 0)];
	if (offset === 0x92 && numeric)
		return [action(builder, ActionEvent.ActionType.AddFood, value, operation === 1 ? 1 : 0)];
	if (offset === 0xcc && numeric) return [r(R.Experience)];
	if (offset >= 0xd0 && offset <= 0xe8 && !numeric && (offset === 0xd0 || offset === 0xd4 || offset === 0xd8 || offset === 0xe8)) {
		const school = offset === 0xd0 ? 1 : offset === 0xd4 ? 2 : offset === 0xd8 ? 3 : 7;
		const spell = mapSpell(school, value);
		return spell ? [reward(builder, R.Spells, op, spell, 0)] : [];
	}
	return [];
}

function reactionEvents(ctx, builder, person, reactions) {
	const events = [];
	for (const reaction of reactions) {
		switch (reaction.type) {
			case 1: // say
				events.push(printText(builder, 1 + reaction.arg2));
				break;
			case 2: { // teach word
				const keyword = getKeywordIndex(ctx, reaction.arg2);
				if (keyword != null)
					events.push(action(builder, ActionEvent.ActionType.AddKeyword, keyword, 1));
				break;
			}
			case 3: { // give item: 1..9 equipment slot, 10..21 inventory slot
				const n = reaction.arg2;
				const slot = n >= 1 && n <= 9 ? person.equipment[n - 1] : person.inventory[n - 10];
				if (slot?.item)
					events.push(create(builder, CreateEvent.CreateType.Item, Math.max(1, slot.count), slot.item.index));
				break;
			}
			case 4:
				events.push(create(builder, CreateEvent.CreateType.Gold, reaction.arg2));
				break;
			case 5:
				events.push(create(builder, CreateEvent.CreateType.Food, reaction.arg2));
				break;
			case 6: // complete quest
				events.push(action(builder, ActionEvent.ActionType.SetGlobalVariable,
					AmberstarQuestBitGlobalVariableOffset + (reaction.arg2 & 0xff), 1));
				break;
			case 7:
				events.push(...statChangeEvents(builder, reaction.arg0, reaction.arg1, reaction.arg2));
				break;
		}
	}
	return events;
}

/**
 * Builds Texts, Events and EventList of a person (party member or NPC).
 * @returns { texts, events, eventList }
 */
function convertConversation(ctx, person, isPartyMember) {
	const cd = person.conversationData;
	const texts = [`${person.name}.`]; // look-at text
	texts.push(...textBlocksToStrings(cd.texts));
	const nothingToSay = texts.length;
	texts.push(messageToString(ctx.source, MessageNothingToSayAboutThat) || 'I have nothing to say about that.');
	const notJoining = texts.length;
	texts.push(messageToString(ctx.source, MessageNotInterestedInJoining) || 'I am not interested in joining you.');

	const builder = new EventListBuilder();
	const I = ConversationEvent.InteractionType;
	const interactionOf = { 1: I.Keyword, 2: I.ShowItem, 3: I.GiveItem, 4: I.GiveGold, 5: I.GiveFood, 6: I.JoinParty };
	const groups = new Map(); // key -> { trigger, primary, secondary }
	for (const [block, list] of [['primary', cd.primaryInteractions], ['secondary', cd.secondaryInteractions]]) {
		for (const interaction of list) {
			const t = interaction.trigger;
			if (!(t.type in interactionOf) || (t.type === 6 && !isPartyMember))
				continue;
			const key = `${t.type}:${t.type === 6 ? 0 : t.argument}`;
			if (!groups.has(key))
				groups.set(key, { trigger: t, primary: null, secondary: null });
			const group = groups.get(key);
			group[block] ??= interaction;
		}
	}
	// Party members can always be asked to join (Amberstar uses the join chance without a join interaction).
	if (isPartyMember && cd.joinChance !== 0 && !groups.has('6:0'))
		groups.set('6:0', { trigger: { type: 6, argument: 0 }, primary: { reactions: [] }, secondary: null });

	const hasQuestFlag = cd.secondaryInteractions.length !== 0;
	const questVariable = AmberstarQuestBitGlobalVariableOffset + cd.questCompletionIndex;

	for (const group of groups.values()) {
		const t = group.trigger;
		const head = new ConversationEvent();
		head.Interaction = interactionOf[t.type];
		head.Value = t.type === 1 ? (getKeywordIndex(ctx, t.argument) ?? 0) : t.type === 6 ? 0 : t.argument;
		head.Unused1 = new Uint8Array(4);
		head.Unused2 = new Uint8Array(2);
		builder.add(head, EventType.Conversation);
		builder.EventList.push(head);

		const prefix = [];
		let failIndex = NoBranch;
		if (t.type === 6 && cd.joinChance < 100) {
			const refuse = printText(builder, notJoining);
			prefix.push(dice(builder, cd.joinChance, refuse.Index - 1));
		}
		if (t.type >= 3 && t.type <= 6)
			prefix.push(interact(builder));

		const blockChain = interaction => interaction ? reactionEvents(ctx, builder, person, interaction.reactions) : null;
		let chain;
		if (!hasQuestFlag || (group.primary && !group.secondary && cd.questCompletionIndex === 0)) {
			chain = blockChain(group.primary ?? group.secondary) ?? [];
		} else {
			const primary = blockChain(group.primary);
			const secondary = blockChain(group.secondary);
			const fallback = () => printText(builder, nothingToSay);
			const primaryStart = primary?.length ? primary : [fallback()];
			const secondaryStart = secondary?.length ? secondary : [fallback()];
			builder.chain(secondaryStart);
			failIndex = secondaryStart[0].Index - 1;
			chain = [condition(builder, ConditionEvent.ConditionType.GlobalVariable, questVariable, 0, failIndex), ...primaryStart];
		}
		builder.chain([head, ...prefix, ...chain]);
	}
	return { texts, events: builder.Events, eventList: builder.EventList };
}

// ---------------------------------------------------------------------------------------------
// Party members, NPCs, monsters
// ---------------------------------------------------------------------------------------------
export function convertPartyMember(ctx, index, a, itemManager, portraitIndex) {
	const pm = new PartyMember();
	fillCharacter(ctx, pm, index, a, false);
	pm.Level = Math.max(1, a.level);
	pm.PortraitIndex = portraitIndex ?? 1;
	pm.SpellLearningPoints = a.spellLearningPoints;
	pm.TrainingPoints = 0;
	pm.ExperiencePoints = a.experiencePoints;
	pm.AttacksPerRoundIncreaseLevels = a.attackPerRoundLevel;
	pm.HitPointsPerLevel = a.hitPointsPerLevel;
	pm.SpellPointsPerLevel = a.spellPointsPerLevel;
	pm.SpellLearningPointsPerLevel = a.spellLearningPointsPerLevel;
	// Amberstar has no training points (level ups were bought at the guilds). Guilds are Ambermoon
	// trainers (see places.js), so party members get training points on level up.
	pm.TrainingPointsPerLevel = 8;
	pm.MaxReachedLevel = pm.Level;
	const spells = [
		...learnedSpellBitsToSpells(1, a.learnedWhiteSpells),
		...learnedSpellBitsToSpells(2, a.learnedGraySpells),
		...learnedSpellBitsToSpells(3, a.learnedBlackSpells),
		...learnedSpellBitsToSpells(7, a.learnedSpecialSpells),
	];
	for (const spell of spells)
		addLearnedSpell(pm, spell);
	pm.LearnedSpellsType7 = 0; // only monsters use these
	pm.SpellMastery = classSpellMastery(pm.Class) | spellMasteryOfSpells(spells);
	fillItems(pm, a, itemManager, true);
	const conversation = convertConversation(ctx, a, true);
	pm.Texts = conversation.texts;
	pm.Events = conversation.events;
	pm.EventList = conversation.eventList;
	pm.LookAtCharTextIndex = 0;
	return pm;
}

export function convertNPC(ctx, index, a, portraitIndex) {
	const npc = new NPC();
	fillCharacter(ctx, npc, index, a, false);
	npc.PortraitIndex = portraitIndex ?? 1;
	const conversation = convertConversation(ctx, a, false);
	npc.Texts = conversation.texts;
	npc.Events = conversation.events;
	npc.EventList = conversation.eventList;
	npc.LookAtCharTextIndex = 0;
	return npc;
}

export function convertMonster(ctx, index, m, itemManager, monsterGraphic) {
	const monster = new Monster();
	fillCharacter(ctx, monster, index, m, true);
	// The max values of Amberstar monsters are placeholders (999). Ambermoon monsters use the current
	// value as base value as well (BattleHandling.InitializeMonster sets Max = Current).
	setValue(monster.HitPoints, m.hitPoints.currentValue, m.hitPoints.currentValue);
	setValue(monster.SpellPoints, m.spellPoints.currentValue, m.spellPoints.currentValue);
	for (const value of [...monster.Attributes, ...monster.Skills])
		value.MaxValue = value.CurrentValue;
	monster.Level = Math.max(1, m.level);
	monster.SpokenLanguages = 0;
	monster.CombatGraphicIndex = m.battleGraphicIndex;
	monster.Morale = m.morale;
	monster.DefeatExperience = m.defeatExperience;
	monster.SpellChancePercentage = m.spellCastChance;
	monster.MagicHitBonus = m.magicHitBonus;
	monster.MagicAttack = m.magicBonusWeapon ?? 0;
	monster.MagicDefense = m.magicBonusArmor ?? 0;
	monster.BattleFlags = mapBattleFlags(m.monsterFlags, m.race);
	monster.Element = mapElement(m.elementalFlags, m.monsterFlags);
	const spells = m.spells.map(s => mapSpell(s.school, s.spellIndex)).filter(Boolean);
	for (const spell of spells)
		addLearnedSpell(monster, spell);
	monster.SpellMastery = spellMasteryOfSpells(spells);
	// Equipment and inventory are the loot.
	fillItems(monster, m, itemManager, false);

	monster.AtariPalette = new Uint8Array(16);
	monster.MonsterPalette = Uint8Array.from({ length: 32 }, (_, i) => i);
	monster.PaddingByte = 0;
	for (let i = 0; i < 8; i++) {
		const animation = new Monster.Animation();
		animation.FrameIndices = new Uint8Array(32);
		const frames = monsterGraphic?.animations[i] ?? (i === 0 ? [0] : []);
		animation.FrameIndices.set(frames.slice(0, 32));
		animation.UsedAmount = Math.min(32, frames.length);
		monster.Animations[i] = animation;
	}
	monster.AlternateAnimationBits = monsterGraphic?.alternateBits ?? 0;
	monster.FrameWidth = monsterGraphic?.frameWidth ?? 16;
	monster.FrameHeight = monsterGraphic?.frameHeight ?? 16;
	monster.MappedFrameWidth = monsterGraphic?.mappedWidth ?? 16;
	monster.MappedFrameHeight = monsterGraphic?.mappedHeight ?? 16;
	monster.CombatGraphic = monsterGraphic?.graphic ?? null;
	return monster;
}

/**
 * Amberstar monster group (MON_DATA.AMB): 3 rows (nearest first) with a monster index and a column
 * mask (bit 5 = leftmost column). Ambermoon: Monsters[column][row] with row 0 = farthest, row 2 = nearest.
 */
export function convertMonsterGroup(rows, getMonster) {
	const group = new MonsterGroup();
	rows.forEach((row, i) => {
		if (!row.monsterIndex || !row.mask)
			return;
		const monster = getMonster(row.monsterIndex);
		if (!monster)
			return;
		const ambermoonRow = 2 - i;
		for (let column = 0; column < 6; column++) {
			if (row.mask & (1 << (5 - column)))
				group.Monsters[column][ambermoonRow] = monster;
		}
	});
	return group;
}

/** Loads an Amberstar person (or monster) from a CHARDATA container entry. */
export function loadAmberstarCharacter(ctx, index, data) {
	if (data[2] === 1)
		return loadMonster(new AmberstarDataReader(data));
	return loadPerson(index, new AmberstarDataReader(data), ctx.source.textFragments);
}

// ---------------------------------------------------------------------------------------------
// Character manager (same interface as Ambermoon.Data.Legacy/Characters/CharacterManager.js)
// ---------------------------------------------------------------------------------------------
export class AmberstarCharacterManager {
	constructor(partyMembers, npcs, monsters, monsterGroups) {
		this.initialPartyMembers = partyMembers;
		this.npcs = npcs;
		this.monsters = monsters;
		this.monsterGroups = monsterGroups;
	}

	GetMonster(index) { return index === 0 ? null : this.monsters.get(index) ?? null; }

	CloneMonster(monster) {
		const writer = new DataWriter();
		new MonsterWriter().WriteMonster(monster, writer);
		const clone = Monster.Load(monster.Index, new MonsterReader(), DataReader.FromData(writer.ToArray()));
		clone.CombatGraphic = monster.CombatGraphic;
		return clone;
	}

	GetInitialPartyMember(index) { return index === 0 ? null : this.initialPartyMembers.get(index) ?? null; }
	GetNPC(index) { return index === 0 ? null : this.npcs.get(index) ?? null; }
	GetMonsterGroup(index) { return index === 0 ? null : this.monsterGroups.get(index) ?? null; }

	get InitialPartyMembers() { return [...this.initialPartyMembers.values()]; }
	get NPCs() { return [...this.npcs.values()]; }
	get Monsters() { return [...this.monsters.values()]; }
	get MonsterGroups() { return this.monsterGroups; }
	get MonsterGraphicAtlasProvider() { return null; }
}
