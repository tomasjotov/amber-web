// Amberstar places (AMBERDEV.UDO place data + names), merchants (WARESDAT.AMB) and chests (CHESTDAT.AMB).
//
// Place index p keeps its number: Places.Entries[p - 1] (EnterPlaceEvent.PlaceIndex = p).
// The place type is taken from the Amberstar place events (maps2D/events.js ambermoonPlaceType) and the
// 12 data words are converted to the data layout of the Ambermoon place class of that type:
//   guilds 1-8 -> Trainer: Skill, Cost. Amberstar guilds sell membership (class change) and level ups,
//                 the engine has neither, so the guild trains the main skill of the class for the level
//                 up price (party members get training points on level up, see persons.js).
//   healer     -> Healer: the Amberstar prices (stun, poison, petrify, disease, aging, madness, blindness,
//                 death, ashes, dust, curse) in the Ambermoon order, 1 gold per LP like Amberstar.
//   sage       -> Sage: identification cost.  food -> FoodDealer: price per ration.
//   inn        -> Inn: cost per person, bedroom = the Amberstar words 1/2 (x, y) on the map of the inn,
//                 100% healing.
//   horse/raft/ship -> Salesman: cost, x, y, map, travel type (same layout as Amberstar).
//   merchant/library -> only the name is used (wares are the savegame merchants).
import { Place, Places } from '../../../ambermoon/Ambermoon.Data.Common/Places.js';
import { PlaceType } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/PlaceType.js';
import { Skill } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Skill.js';
import { Merchant } from '../../../ambermoon/Ambermoon.Data.Common/Merchant.js';
import { Chest, ChestType } from '../../../ambermoon/Ambermoon.Data.Common/Chest.js';
import { ItemSlot } from '../../../ambermoon/Ambermoon.Data.Common/ItemSlot.js';
import { readItem } from '../../../../amberstar/src/data/characters.js';
import { readContainer } from '../../../../amberstar/src/data/container.js';
import { DataReader } from '../../../../amberstar/src/data/reader.js';
import { ambermoonPlaceType } from '../maps2D/events.js';
import { convertItemSlot } from './items.js';
import { titleCase } from './texts.js';

// Amberstar guild type (1..8) -> trained skill
const GuildSkills = [null, Skill.Attack, Skill.Parry, Skill.Searching, Skill.LockPicking, Skill.Attack,
	Skill.UseMagic, Skill.ReadMagic, Skill.UseMagic];

/** Map<placeIndex, { type (Amberstar), mapIndex }> from the place events of all maps */
function collectPlaceEvents(ctx) {
	const result = new Map();
	const keys = ctx.source.keys('MAP_DATA.AMB').slice().sort((a, b) => a - b);
	for (const key of keys) {
		let map;
		try {
			map = ctx.source.loadMap(key);
		} catch {
			continue;
		}
		for (const event of map.events ?? []) {
			if (event?.type === 18 && event.placeIndex && !result.has(event.placeIndex))
				result.set(event.placeIndex, { type: event.placeType, mapIndex: key });
		}
	}
	return result;
}

export function convertPlaces(ctx) {
	const places = new Places();
	const placeEvents = collectPlaceEvents(ctx);
	const count = ctx.source.program.placesData.length - 1;
	for (let p = 1; p <= count; p++) {
		const { words, name } = ctx.source.loadPlaceData(p);
		const info = placeEvents.get(p);
		const amberstarType = info?.type ?? 9;
		const type = ambermoonPlaceType(amberstarType);
		const data = new Array(16).fill(0);
		switch (type) {
			case PlaceType.Trainer:
				data[0] = GuildSkills[amberstarType] ?? Skill.Attack;
				data[1] = Math.max(1, words[1] || words[0]);
				// Amberstar guild membership (see src/amberstar/extensions/guild.js): join price, guild class
				data[2] = words[0];
				data[3] = amberstarType;
				break;
			case PlaceType.Healer:
				data[0] = words[0]; // lamed (stunned)
				data[1] = words[1]; // poisoned
				data[2] = words[2]; // petrified
				data[3] = words[3]; // diseased
				data[4] = words[4]; // aging
				data[5] = words[7]; // dead
				data[6] = words[8]; // ashes
				data[7] = words[9]; // dust
				data[8] = words[5]; // crazy (mad)
				data[9] = words[6]; // blind
				data[10] = words[5]; // drugged (not in Amberstar)
				data[11] = 1; // LP
				data[12] = words[10]; // remove curse
				break;
			case PlaceType.Sage:
				data[0] = words[0];
				data[1] = 0;
				break;
			case PlaceType.FoodDealer:
				data[0] = Math.max(1, words[0]);
				break;
			case PlaceType.Inn:
				data[0] = words[0];
				data[1] = words[1];
				data[2] = words[2];
				data[3] = info?.mapIndex ?? 0;
				data[4] = 100;
				break;
			case PlaceType.HorseDealer:
			case PlaceType.RaftDealer:
			case PlaceType.ShipDealer:
				for (let i = 0; i < 5; i++)
					data[i] = words[i];
				break;
			default:
				break;
		}
		const place = new Place();
		place.Name = titleCase(name?.trim() ?? '');
		place.Data = new Uint8Array(32);
		data.forEach((w, i) => {
			place.Data[i * 2] = (w >> 8) & 0xff;
			place.Data[i * 2 + 1] = w & 0xff;
		});
		places.Entries.push(place);
	}
	return places;
}

/** Ambermoon merchants (savegame) keyed by the Amberstar wares index (EnterPlaceEvent.MerchantDataIndex = wares - 1). */
export function convertMerchants(ctx, wareCounts) {
	const merchants = new Map();
	for (const key of ctx.source.keys('WARESDAT.AMB')) {
		const merchant = new Merchant();
		for (let x = 0; x < Merchant.SlotsPerRow; x++)
			for (let y = 0; y < Merchant.SlotRows; y++)
				merchant.Slots[x][y] = new ItemSlot();
		const reader = ctx.source.reader('WARESDAT.AMB', key);
		for (let i = 0; i < 12 && reader.remaining >= 40; i++) {
			const item = readItem(reader);
			const count = wareCounts[(key - 1) * 12 + i] ?? 0; // 255 = unlimited in both games
			if (item.index === 0 || count === 0)
				continue;
			const slot = convertItemSlot(count, item);
			slot.Flags = 0;
			merchant.Slots[i % 6][Math.floor(i / 6)] = slot;
		}
		merchant.Name = '';
		merchants.set(key, merchant);
	}
	return merchants;
}

/** Amberstar chest slot bits (12 bits per chest, packed into 3 bytes per 2 chests) -> bit mask */
function getChestSlotBits(bits, chestIndex) {
	const index = chestIndex - 1;
	const offset = 3 * Math.floor(index / 2);
	let value;
	if ((index & 1) === 0) {
		value = ((bits[offset + 1] << 8) | bits[offset]) >> 1;
	} else {
		value = ((bits[offset + 2] << 8) | bits[offset + 1]) >> 5;
		if ((bits[offset + 3] & 1) === 1)
			value |= 0x800;
	}
	return value & 0xfff;
}

/**
 * Ambermoon chests (savegame) keyed by the Amberstar chest index (ChestEvent.ChestIndex = chest - 1).
 * Items come from the new game CHESTDAT.AMB, the slot "has item" bits and the gold from the savegame.
 */
export function convertChests(ctx, savegame) {
	const chests = new Map();
	const newChests = ctx.source.hasFile('_NEW/CHESTDAT.AMB') ? readContainer(ctx.source.files.get('_NEW/CHESTDAT.AMB')) : null;
	const keys = newChests ? [...newChests.keys()] : ctx.source.keys('CHESTDAT.AMB');
	for (const key of keys) {
		const reader = newChests ? new DataReader(newChests.get(key).data) : ctx.source.reader('CHESTDAT.AMB', key);
		const chest = new Chest();
		chest.Type = ChestType.Chest;
		for (let x = 0; x < Chest.SlotsPerRow; x++)
			for (let y = 0; y < Chest.SlotRows; y++)
				chest.Slots[x][y] = new ItemSlot();
		const slotBits = getChestSlotBits(savegame.chestSlotBits, key);
		for (let i = 0; i < 12 && reader.remaining >= 40; i++) {
			const item = readItem(reader);
			if (item.index === 0 || !(slotBits & (1 << i)))
				continue;
			chest.Slots[i % 6][Math.floor(i / 6)] = convertItemSlot(1, item);
		}
		chest.Gold = savegame.chestGold[key] ?? 0;
		chest.Food = 0;
		chests.set(key, chest);
	}
	return chests;
}
