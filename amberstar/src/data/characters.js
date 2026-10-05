// Characters, items, chests, monsters and places (port of the Legacy loaders).
import { decodeString } from './reader.js';
import { loadGraphicWithHeader } from './graphic.js';
import { Text } from './text.js';

export const InventorySlotCount = 12;
export const ItemDataSize = 40;

export const EquipmentSlot = { Neck: 0, Head: 1, Chest: 2, RightHand: 3, Body: 4, LeftHand: 5, RightFinger: 6, Foot: 7, LeftFinger: 8 };
export const Attribute = { None: 0, Strength: 1, Intelligence: 2, Dexterity: 3, Speed: 4, Stamina: 5, Charisma: 6, Luck: 7, AntiMagic: 8 };
export const Skill = { None: 0, Attack: 1, Parry: 2, Swim: 3, Listen: 4, FindTraps: 5, DisarmTraps: 6, PickLocks: 7, Search: 8, ReadMagic: 9, UseMagic: 10 };
export const Gender = { Male: 0, Female: 1 };
export const GenderFlags = { Both: 0, Male: 1, Female: 2 };
export const Race = { Human: 0, Elf: 1, Dwarf: 2, Gnome: 3, Halfling: 4, HalfElf: 5, HalfOrc: 6, Animal: 13, Monster: 14 };
export const ItemFlags = { None: 0, Cursed: 0x01, NotImportant: 0x02, Stackable: 0x04, DestroyAfterUsage: 0x08, NotEquipDuringFight: 0x10 };
export const ItemSlotFlags = { Identified: 0x80 };
export const ItemType = {
	Armor: 0, Headgear: 1, Footgear: 2, Shield: 3, CloseRangedWeapon: 4, LongRangedWeapon: 5, Ammunition: 6,
	TextScroll: 7, SpellScroll: 8, Potion: 9, Amulet: 10, Brooch: 11, Ring: 12, SpecialItem: 13, MagicItem: 14,
	Key: 15, NormalItem: 16, MonsterItem: 17, Transportation: 18,
};
export const SpecialItems = { None: 0, Compass: 1, Amberstar: 2, MagicalPicture: 4, WindChain: 8, MapLocator: 16, Clock: 32 };

export const Condition = {
	None: 0, Irritated: 0x0001, Mad: 0x0002, Sleeping: 0x0004, Panicked: 0x0008, Blind: 0x0010, Overloaded: 0x0020,
	Stunned: 0x0100, Poisoned: 0x0200, Petrified: 0x0400, Diseased: 0x0800, Aging: 0x1000, Dead: 0x2000, Ashes: 0x4000, Dust: 0x8000,
};
Condition.DeadAshesDust = Condition.Dead | Condition.Ashes | Condition.Dust;

export class CharacterValue {
	constructor(current, max, bonus) {
		this.currentValue = current;
		this.maxValue = max;
		this.bonusValue = bonus;
	}
	get totalCurrent() { return (this.currentValue + this.bonusValue) & 0xffff; }
	get totalMax() { return (this.maxValue + this.bonusValue) & 0xffff; }
	copy() { return new CharacterValue(this.currentValue, this.maxValue, this.bonusValue); }
}

export class ItemSlot {
	constructor(count = 0, item = null) {
		this.count = count;
		this.item = item;
	}
	setItem(item, count = 1) {
		const old = { item: this.item, count: this.count };
		this.item = item;
		this.count = count;
		return old;
	}
	clearItem() {
		const old = { item: this.item, count: this.count };
		this.item = null;
		this.count = 0;
		return old;
	}
}

export function readItem(r) {
	const item = {};
	item.graphicIndex = r.readByte();
	item.type = r.readByte();
	item.usedAmmoType = r.readByte();
	item.genders = r.readByte();
	item.hands = r.readByte();
	item.fingers = r.readByte();
	item.hitPoints = r.readByte();
	item.spellPoints = r.readByte();
	item.attribute = r.readByte();
	item.attributeValue = r.readByte();
	item.skill = r.readByte();
	item.skillValue = r.readByte();
	item.spellSchool = r.readByte();
	item.spellIndex = r.readByte();
	item.spellCharges = r.readByte();
	item.ammoType = r.readByte();
	item.defense = r.readByte();
	item.damage = r.readByte();
	const equipmentSlot = r.readByte();
	item.equipmentSlot = equipmentSlot === 0 ? null : equipmentSlot - 1;
	item.magicWeaponBonus = r.readByte();
	item.magicArmorBonus = r.readByte();
	item.specialIndex = r.readByte();
	item.initialCharges = r.readByte();
	item.maxCharges = r.readByte();
	const flags = r.readByte();
	item.flags = flags & 0x7f;
	item.slotFlags = flags & 0x80;
	const malus1 = r.readByte(), malus2 = r.readByte();
	item.malusSkill1 = malus1 === 0 ? null : malus1 - 1;
	item.malusSkill2 = malus2 === 0 ? null : malus2 - 1;
	item.malus1 = r.readByte();
	item.malus2 = r.readByte();
	item.textIndex = r.readByte();
	item.usableClasses = r.readWord();
	item.buyPrice = r.readWord();
	item.weight = r.readWord();
	item.index = r.readWord();
	item.nameIndex = r.readWord();
	return item;
}

export function cloneItem(item) {
	return item ? { ...item } : null;
}

function loadCharacterBase(c, r) {
	r.position = 0;
	if (r.readWord() !== 0xff)
		throw new Error('Invalid character data.');
	c.type = r.readByte();
	c.gender = r.readByte();
	c.race = r.readByte();
	c.class = r.readByte();
	r.position = 0x1b;
	c.level = r.readByte();
	r.position = 0x90;
	c.gold = r.readWord();
	c.food = r.readWord();
	r.position = 0x22;
	const counts = r.readBytes(9 + InventorySlotCount);
	r.position = 0xf0;
	c.name = decodeString(r.readBytes(16)).split('\0')[0].trimEnd();
	r.position = 0x132;
	const items = [];
	for (let i = 0; i < counts.length; i++) {
		if (counts[i] === 0) {
			r.position += ItemDataSize;
			items.push(null);
		} else {
			items.push(readItem(r));
		}
	}
	c.equipment = [];
	for (let i = 0; i < 9; i++)
		c.equipment.push(new ItemSlot(counts[i], items[i]));
	c.inventory = [];
	for (let i = 0; i < InventorySlotCount; i++)
		c.inventory.push(new ItemSlot(counts[9 + i], items[9 + i]));
}

function loadBattleCharacter(c, r) {
	loadCharacterBase(c, r);
	r.position = 0x06;
	const curSkills = r.readBytes(10);
	const maxSkills = r.readBytes(10);
	r.position = 0x1c;
	c.usedHands = r.readByte();
	c.usedFingers = r.readByte();
	c.defense = r.readByte();
	c.damage = r.readByte();
	c.magicBonusWeapon = r.readByte();
	c.magicBonusArmor = r.readByte();
	r.position = 0x3a;
	c.physicalConditions = r.readByte();
	c.mentalConditions = r.readByte();
	r.position = 0x43;
	c.attacksPerRound = r.readByte();
	r.position = 0x48;
	const curAttrs = r.readWords(10);
	const maxAttrs = r.readWords(10);
	r.position = 0x86;
	const curHP = r.readWord(), maxHP = r.readWord(), curSP = r.readWord(), maxSP = r.readWord();
	r.position = 0x94;
	c.bonusDefense = r.readWord();
	c.bonusDamage = r.readWord();
	const bonusHP = r.readWord(), bonusSP = r.readWord();
	const bonusAttrs = r.readWords(10);
	const bonusSkills = r.readBytes(10);

	c.attributes = {};
	for (let i = 0; i < 8; i++)
		c.attributes[i + 1] = new CharacterValue(curAttrs[i], maxAttrs[i], bonusAttrs[i]);
	c.skills = {};
	for (let i = 0; i < 10; i++)
		c.skills[i + 1] = new CharacterValue(curSkills[i], maxSkills[i], bonusSkills[i]);
	c.hitPoints = new CharacterValue(curHP, maxHP, bonusHP);
	c.spellPoints = new CharacterValue(curSP, maxSP, bonusSP);
}

export const InteractionTriggerType = { Say: 1, Show: 2, Give: 3, Pay: 4, Feed: 5, Join: 6 };
export const ReactionType = { Say: 1, TeachWord: 2, GiveItem: 3, GiveGold: 4, GiveFood: 5, CompleteQuest: 6, ChangeStat: 7 };

function loadConversationData(r, fragments) {
	r.position = 0x37;
	const learnedLanguages = r.readByte();
	r.position = 0x3c;
	const joinChance = r.readByte();
	const questCompletionIndex = r.readByte();
	r.position = 0x58;
	const currentAge = r.readWord();
	r.position = 0x6c;
	const maxAge = r.readWord();

	r.position = 0x47a;
	const triggers = r.readBytes(20);
	const triggerValues = r.readWords(20);
	const types = r.readBytes(100);
	const args0 = r.readBytes(100);
	const args1 = r.readBytes(100);
	const args2 = r.readWords(100);

	const load = start => {
		const list = [];
		for (let i = 0; i < 10; i++) {
			const trigger = triggers[start + i];
			if (trigger === 0)
				continue;
			const reactions = [];
			const offset = (start + i) * 5;
			for (let n = 0; n < 5; n++) {
				const type = types[offset + n];
				if (type === 0)
					continue;
				reactions.push({ type, arg0: args0[offset + n], arg1: args1[offset + n], arg2: args2[offset + n] });
			}
			list.push({ trigger: { type: trigger, argument: triggerValues[start + i] }, reactions });
		}
		return list;
	};

	const primaryInteractions = load(0);
	const secondaryInteractions = load(10);

	r.position = 0x6aa;
	let portrait = null;
	if (r.position <= r.size - 2 && r.peekWord() !== 0)
		portrait = loadGraphicWithHeader(r);
	else if (r.position <= r.size - 2)
		r.position += 2;

	let texts = null;
	if (r.position <= r.size - 2 && r.peekWord() !== 0)
		texts = Text.read(r, fragments);

	return {
		age: new CharacterValue(currentAge, maxAge, 0),
		learnedLanguages, joinChance, questCompletionIndex, portrait, texts,
		primaryInteractions, secondaryInteractions,
	};
}

export function loadPerson(index, r, fragments) {
	r.position = 0x3c;
	const joinChance = r.readByte();
	r.position = 0;

	if (index === 1 || joinChance !== 0)
		return loadPartyMember(r, fragments);

	const person = { isPartyMember: false };
	loadCharacterBase(person, r);
	person.conversationData = loadConversationData(r, fragments);
	return person;
}

function loadPartyMember(r, fragments) {
	const p = { isPartyMember: true };
	loadBattleCharacter(p, r);
	p.conversationData = loadConversationData(r, fragments);
	r.position = 0x1a;
	p.learnedSpellSchools = r.readByte();
	r.position = 0x42;
	p.defaultBattlePosition = r.readByte();
	r.position = 0x46;
	p.possibleClasses = r.readWord();
	r.position = 0x70;
	p.attackPerRoundLevel = r.readWord();
	p.hitPointsPerLevel = r.readWord();
	p.spellPointsPerLevel = r.readWord();
	p.spellLearningPointsPerLevel = r.readWord();
	r.position = 0x8e;
	p.spellLearningPoints = r.readWord();
	r.position = 0xcc;
	p.experiencePoints = r.readDword();
	p.learnedWhiteSpells = r.readDword();
	p.learnedGraySpells = r.readDword();
	p.learnedBlackSpells = r.readDword();
	r.position += 12;
	p.learnedSpecialSpells = r.readDword();
	p.totalWeight = 0;
	p.saveBit = 0;
	return p;
}

export function clonePartyMember(p) {
	const c = { ...p };
	c.equipment = p.equipment.map(s => new ItemSlot(s.count, cloneItem(s.item)));
	c.inventory = p.inventory.map(s => new ItemSlot(s.count, cloneItem(s.item)));
	c.attributes = Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, v.copy()]));
	c.skills = Object.fromEntries(Object.entries(p.skills).map(([k, v]) => [k, v.copy()]));
	c.hitPoints = p.hitPoints.copy();
	c.spellPoints = p.spellPoints.copy();
	c.conversationData = { ...p.conversationData, age: p.conversationData.age.copy() };
	return c;
}

export function loadMonster(r) {
	const m = { isMonster: true };
	loadBattleCharacter(m, r);
	r.position = 0x3e;
	m.battleGraphicIndex = r.readByte();
	m.spellCastChance = r.readByte();
	m.magicHitBonus = r.readByte();
	m.morale = r.readByte();
	r.position = 0x44;
	m.monsterFlags = r.readByte();
	m.elementalFlags = r.readByte();
	r.position = 0xc6;
	m.defeatExperience = r.readWord();
	r.position = 0x100;
	const schools = r.readBytes(25);
	const indices = r.readBytes(25);
	m.spells = [];
	for (let i = 0; i < 25; i++)
		if (schools[i] !== 0)
			m.spells.push({ school: schools[i], spellIndex: indices[i] });
	return m;
}

export function loadChest(index, r) {
	const items = new Array(12).fill(null);
	for (let i = 0; i < 12; i++) {
		if (r.position + ItemDataSize > r.size)
			break;
		const item = readItem(r);
		if (item.index !== 0)
			items[i] = item;
	}
	return { index, items };
}

// ---- character helpers (ports of the extension methods) ----

export function isDead(c) {
	return (c.physicalConditions & 0xe0) !== 0;
}

export function getConditions(c) {
	return ((c.physicalConditions << 8) | c.mentalConditions) & 0xffff;
}

export function hasAnyConditionOf(c, conditions) {
	return (c.physicalConditions & (conditions >> 8)) !== 0 || (c.mentalConditions & (conditions & 0xff)) !== 0;
}

export function addCondition(c, condition) {
	c.physicalConditions |= (condition >> 8) & 0xff;
	c.mentalConditions |= condition & 0xff;
}

export function removeCondition(c, condition) {
	c.physicalConditions &= ~(condition >> 8) & 0xff;
	c.mentalConditions &= ~condition & 0xff;
}

export function canMove(c, inBattle) {
	if (inBattle)
		return !hasAnyConditionOf(c, Condition.Stunned | Condition.Sleeping | Condition.Petrified | Condition.Mad | Condition.Overloaded | Condition.Panicked);
	return !hasAnyConditionOf(c, Condition.Overloaded);
}

export function damage(c, amount, finishHandler) {
	c.hitPoints.currentValue = Math.max(c.hitPoints.currentValue - amount, 0);
	if (c.hitPoints.currentValue === 0)
		addCondition(c, Condition.Dead);
	finishHandler?.();
}

export function healHitPoints(c, amount) {
	c.hitPoints.currentValue = Math.min(c.hitPoints.currentValue + amount, c.hitPoints.totalMax);
}

export function healSpellPoints(c, amount) {
	c.spellPoints.currentValue = Math.min(c.spellPoints.currentValue + amount, c.spellPoints.totalMax);
}

export function fillHitPoints(c) { c.hitPoints.currentValue = c.hitPoints.totalMax; }
export function fillSpellPoints(c) { c.spellPoints.currentValue = c.spellPoints.totalMax; }

export function maxWeight(c) {
	return c.attributes[Attribute.Strength].totalCurrent * 1000;
}

const CONDITION_ORDER = [
	Condition.Irritated, Condition.Mad, Condition.Sleeping, Condition.Panicked, Condition.Blind, Condition.Overloaded,
	Condition.Stunned, Condition.Poisoned, Condition.Petrified, Condition.Diseased, Condition.Aging,
	Condition.Dead, Condition.Ashes, Condition.Dust,
];

/** Maps conditions to status icon indices (see StatusIcon enum) */
export function conditionsToStatusIcons(conditions) {
	const map = {
		[Condition.Stunned]: 9, [Condition.Poisoned]: 10, [Condition.Petrified]: 11, [Condition.Diseased]: 12,
		[Condition.Aging]: 13, [Condition.Dead]: 0, [Condition.Ashes]: 0, [Condition.Dust]: 0,
		[Condition.Irritated]: 14, [Condition.Mad]: 15, [Condition.Sleeping]: 16, [Condition.Panicked]: 17,
		[Condition.Blind]: 18, [Condition.Overloaded]: 19,
	};
	return CONDITION_ORDER.filter(c => conditions & c).map(c => map[c]);
}
