// Amberstar items -> Ambermoon ItemManager, item slots and item graphics.
//
// Amberstar stores the complete item data (40 bytes) in every item slot of characters, chests and
// merchants, there is no global item list. Every item has a unique item index (ItemID) though, so all
// item records of CHARDATA.AMB (also _NEW/CHARDATA.AMB), CHESTDAT.AMB and WARESDAT.AMB are collected
// and the item index is kept as Ambermoon item index (ItemManager.GetItem(amberstarItemIndex)).
// Per slot data (identified flag, remaining charges) goes into the Ambermoon ItemSlot.
import { Item } from '../../../ambermoon/Ambermoon.Data.Common/Item.js';
import { ItemSlot } from '../../../ambermoon/Ambermoon.Data.Common/ItemSlot.js';
import { ItemType } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/ItemType.js';
import { ItemFlags } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/ItemFlags.js';
import { ItemSlotFlags } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/ItemSlotFlags.js';
import { Transportation } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Transportation.js';
import { ItemManager } from '../../../ambermoon/Ambermoon.Data.Legacy/ItemManager.js';
import { ItemPalette } from '../../../../amberstar/src/data/assets.js';
import { readItem, loadPerson, loadMonster } from '../../../../amberstar/src/data/characters.js';
import { readContainer } from '../../../../amberstar/src/data/container.js';
import { DataReader } from '../../../../amberstar/src/data/reader.js';
import { buildColorMapping, remapGraphic } from '../../common.js';
import {
	mapItemType, mapGenders, mapClassFlags, mapAttribute, mapSkill, mapSpell, spellToSchoolAndIndex,
} from './mappings.js';
import { textBlocksToStrings, titleCase } from './texts.js';

export const ItemGraphicCount = 128;

/** Reads all records of a character data container (CHARDATA.AMB layout) and calls `visit(item)` for every item. */
function visitCharacterItems(source, container, visit) {
	for (const [key, entry] of container) {
		const data = entry.data;
		if (data.length < 0x47a)
			continue;
		const isMonster = data[2] === 1;
		try {
			const character = isMonster ? loadMonster(new DataReader(data)) : loadPerson(key, new DataReader(data), source.textFragments);
			for (const slot of [...character.equipment, ...character.inventory]) {
				if (slot.item)
					visit(slot.item);
			}
		} catch {
			// ignore broken records
		}
	}
}

/** Collects all Amberstar item records: Map<itemIndex, amberstarItem> */
export function collectAmberstarItems(ctx) {
	const source = ctx.source;
	const items = new Map();
	const add = item => {
		if (item && item.index !== 0 && !items.has(item.index))
			items.set(item.index, item);
	};
	// Merchants first (they hold the "clean" shop versions of the items)
	for (const key of source.keys('WARESDAT.AMB')) {
		const reader = source.reader('WARESDAT.AMB', key);
		while (reader.remaining >= 40)
			add(readItem(reader));
	}
	visitCharacterItems(source, source.container('CHARDATA.AMB'), add);
	if (source.hasFile('_NEW/CHARDATA.AMB'))
		visitCharacterItems(source, readContainer(source.files.get('_NEW/CHARDATA.AMB')), add);
	for (const key of source.keys('CHESTDAT.AMB')) {
		for (const item of source.loadChest(key).items)
			add(item);
	}
	if (source.hasFile('_NEW/CHESTDAT.AMB')) {
		for (const [, entry] of readContainer(source.files.get('_NEW/CHESTDAT.AMB'))) {
			const reader = new DataReader(entry.data);
			while (reader.remaining >= 40)
				add(readItem(reader));
		}
	}
	return items;
}

/** Item indices which are used by Amberstar "UseItem" map events (they must be usable in Ambermoon). */
function collectUsedItemIndices(ctx) {
	const result = new Set();
	const source = ctx.source;
	for (const key of source.keys('MAP_DATA.AMB')) {
		let map;
		try {
			map = source.loadMap(key);
		} catch {
			continue;
		}
		for (const event of map.events ?? []) {
			if (event?.type === 19 && event.itemIndex)
				result.add(event.itemIndex);
		}
	}
	return result;
}

/** Amberstar item record -> Ambermoon Item */
export function convertItem(ctx, a, usedItems) {
	const item = new Item();
	item.Index = a.index;
	item.GraphicIndex = a.graphicIndex;
	item.Type = mapItemType(a.type);
	// Keys and normal items which are used on the map (pickaxe, shovel, gems, ...) must be usable.
	if (usedItems.has(a.index) && (item.Type === ItemType.NormalItem || item.Type === ItemType.Key))
		item.Type = ItemType.Tool;
	// The lockpick is a key with the lock picking spell in Amberstar, a tool in Ambermoon.
	if (a.type === 15 && a.spellIndex !== 0)
		item.Type = ItemType.Tool;
	item.EquipmentSlot = a.equipmentSlot == null ? 0 : a.equipmentSlot + 1; // Amberstar: 0-based (Neck = 0)
	item.BreakChance = 0; // Amberstar items do not break
	item.Genders = mapGenders(a.genders);
	item.NumberOfHands = a.hands;
	item.NumberOfFingers = a.fingers;
	item.HitPoints = a.hitPoints;
	item.SpellPoints = a.spellPoints;
	item.Attribute = a.attribute === 0 ? null : mapAttribute(a.attribute - 1);
	item.AttributeValue = item.Attribute == null ? 0 : a.attributeValue;
	item.Skill = a.skill === 0 ? null : mapSkill(a.skill - 1);
	item.SkillValue = item.Skill == null ? 0 : a.skillValue;
	item.Defense = a.defense;
	item.Damage = a.damage;
	item.AmmunitionType = a.ammoType; // 1 stone, 2 arrow, 3 bolt in both games
	item.UsedAmmunitionType = a.usedAmmoType;
	const penalty1 = mapSkill(a.malusSkill1);
	const penalty2 = mapSkill(a.malusSkill2);
	item.SkillPenalty1 = penalty1 ?? 0;
	item.SkillPenalty1Value = penalty1 == null ? 0 : a.malus1;
	item.SkillPenalty2 = penalty2 ?? 0;
	item.SkillPenalty2Value = penalty2 == null ? 0 : a.malus2;
	item.MagicAttackLevel = a.magicWeaponBonus;
	item.MagicArmorLevel = a.magicArmorBonus;
	item.Classes = mapClassFlags(a.usableClasses);
	item.Price = a.buyPrice;
	item.Weight = a.weight;
	item.Name = titleCase(ctx.source.fragment(a.nameIndex));

	// Special value
	switch (a.type) {
		case 7: // text scroll: specialIndex = CODETXT.AMB entry (1 or 2), textIndex = text block
			item.SpecialValue = a.specialIndex;
			item.TextSubIndex = a.textIndex;
			break;
		case 13: // special item: 1 compass, 2 (Amberstar), 3 magic picture, 4 wind chain, 5 map locator, 6 clock
			// The Ambermoon SpecialItemPurpose values are 1 lower and the savegame bits are the same.
			item.SpecialValue = Math.max(0, a.specialIndex - 1);
			break;
		case 18: // magic disc
			item.SpecialValue = Transportation.FlyingDisc;
			break;
		default:
			item.SpecialValue = 0;
			break;
	}

	// Spell and charges
	const spell = a.spellSchool !== 0 ? mapSpell(a.spellSchool, a.spellIndex) : 0;
	const [school, index] = spellToSchoolAndIndex(spell);
	item.SpellSchool = school;
	item.SpellIndex = index;
	let flags = 0;
	if (a.flags & 0x01)
		flags |= ItemFlags.Accursed;
	if (a.flags & 0x02)
		flags |= ItemFlags.NotImportant;
	if (a.flags & 0x08)
		flags |= ItemFlags.DestroyAfterUsage;
	if (a.flags & 0x10)
		flags |= ItemFlags.RemovableDuringFight;
	// Ambermoon equipment (except ammunition) is never stacked.
	if ((a.flags & 0x04) && (item.EquipmentSlot === 0 || item.Type === ItemType.Ammunition))
		flags |= ItemFlags.Stackable;
	if (spell) {
		const charges = a.spellCharges;
		if (charges === 255) {
			// unlimited
			item.InitialCharges = 255;
			item.MaxCharges = 0;
		} else if (charges <= 1 && a.maxCharges <= 1) {
			// Single use items (potions, scrolls, torches, lockpicks): Amberstar consumes them. In Ambermoon
			// this is DestroyAfterUsage with MaxCharges = 0 (see Layout.CanConsumeItem).
			item.InitialCharges = 1;
			item.MaxCharges = 0;
			flags |= ItemFlags.DestroyAfterUsage;
		} else {
			item.InitialCharges = charges;
			item.MaxCharges = Math.max(charges, a.maxCharges);
		}
	}
	if (item.Type === ItemType.Potion)
		flags |= ItemFlags.DestroyAfterUsage;
	item.Flags = flags;
	item.DefaultSlotFlags = 0;
	item.InitialRecharges = 0;
	item.MaxRecharges = item.MaxCharges !== 0 ? 255 : 0; // rechargeable by spells/enchanters without limit
	item.RechargePrice = 0;
	return item;
}

/**
 * Creates an Ambermoon ItemSlot of an Amberstar item slot (count + item record).
 * The item index must be known by the item manager (collectAmberstarItems).
 */
export function convertItemSlot(count, a) {
	const slot = new ItemSlot();
	if (!a || count === 0 || a.index === 0)
		return slot;
	slot.ItemIndex = a.index;
	slot.Amount = Math.min(255, count);
	slot.Flags = (a.slotFlags & 0x80) ? ItemSlotFlags.Identified : 0;
	if (a.spellSchool !== 0 && a.spellIndex !== 0)
		slot.NumRemainingCharges = a.spellCharges === 0 ? 0 : Math.min(255, a.spellCharges);
	if ((a.flags & 0x01) && a.equipmentSlot != null)
		slot.Flags |= ItemSlotFlags.Cursed;
	return slot;
}

/** ItemManager with all Amberstar items, item texts (text scrolls) and item graphics. */
export function convertItems(ctx) {
	const amberstarItems = collectAmberstarItems(ctx);
	const usedItems = collectUsedItemIndices(ctx);
	const items = new Map();
	for (const index of [...amberstarItems.keys()].sort((a, b) => a - b))
		items.set(index, convertItem(ctx, amberstarItems.get(index), usedItems));

	const itemManager = new ItemManager(items);
	// Missing items (only referenced by events) do not throw.
	itemManager.GetItem = index => items.get(index) ?? null;

	// Text scrolls: CODETXT.AMB entry n = text list n, the item TextSubIndex selects the block.
	for (const key of ctx.source.keys('CODETXT.AMB')) {
		try {
			itemManager.AddTexts(key, textBlocksToStrings(ctx.source.text('item', key)));
		} catch {
			// ignore
		}
	}

	// Item graphics (same layout as in Ambermoon: 96 = gold, 109 = food). The engine draws items with the
	// primary UI palette, so the Amberstar item palette is remapped to it.
	const mapping = buildColorMapping(ItemPalette, ctx.uiPalette);
	const graphics = [];
	for (let i = 0; i < ItemGraphicCount; i++)
		graphics.push(remapGraphic(ctx.source.loadItemGraphic(i), mapping));

	return { itemManager, amberstarItems, itemGraphics: graphics };
}
