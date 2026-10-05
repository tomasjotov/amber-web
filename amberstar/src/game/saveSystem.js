// Save slots in the browser (localStorage). A save contains the original savegame data
// (PARTYDAT.SAV format) plus the state of all party members, which the original game stores in
// CHARDATA.AMB. The C# port did not save the characters yet.
import { writeSavegame, readSavegame } from '../data/savegame.js';
import { DataReader } from '../data/reader.js';
import { CharacterValue, ItemSlot } from '../data/characters.js';

export const SlotCount = 10;
const SLOT_KEY = slot => `amberstar-web-slot-${slot}`;
const LAST_SLOT_KEY = 'amberstar-web-last-slot';

function toBase64(bytes) {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000)
		s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(s);
}

function fromBase64(text) {
	return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}

/** Plain JSON copy of a party member (without the static conversation data like portraits and texts) */
function serializeCharacter(pm) {
	const value = v => ({ c: v.currentValue, m: v.maxValue, b: v.bonusValue });
	const slot = s => ({ count: s.count, item: s.item ? { ...s.item } : null });
	const result = {};
	for (const [key, v] of Object.entries(pm)) {
		if (key === 'conversationData' || key === 'equipment' || key === 'inventory' || key === 'attributes' ||
			key === 'skills' || key === 'hitPoints' || key === 'spellPoints')
			continue;
		result[key] = v;
	}
	result.equipment = pm.equipment.map(slot);
	result.inventory = pm.inventory.map(slot);
	result.attributes = Object.fromEntries(Object.entries(pm.attributes).map(([k, v]) => [k, value(v)]));
	result.skills = Object.fromEntries(Object.entries(pm.skills).map(([k, v]) => [k, value(v)]));
	result.hitPoints = value(pm.hitPoints);
	result.spellPoints = value(pm.spellPoints);
	result.age = value(pm.conversationData.age);
	result.learnedLanguages = pm.conversationData.learnedLanguages;
	return result;
}

/** Restores a party member, the conversation data is taken from the given template */
function deserializeCharacter(data, template) {
	const value = v => new CharacterValue(v.c, v.m, v.b);
	const pm = { ...data };
	delete pm.age;
	delete pm.learnedLanguages;
	pm.equipment = data.equipment.map(s => new ItemSlot(s.count, s.item));
	pm.inventory = data.inventory.map(s => new ItemSlot(s.count, s.item));
	pm.attributes = Object.fromEntries(Object.entries(data.attributes).map(([k, v]) => [k, value(v)]));
	pm.skills = Object.fromEntries(Object.entries(data.skills).map(([k, v]) => [k, value(v)]));
	pm.hitPoints = value(data.hitPoints);
	pm.spellPoints = value(data.spellPoints);
	pm.conversationData = { ...template.conversationData, age: value(data.age), learnedLanguages: data.learnedLanguages };
	return pm;
}

export function createSaveData(game, name) {
	const state = game.state;
	const savegame = state.toSavegame();
	const characters = {};
	for (const [index, pm] of state.partyMembers)
		characters[index] = serializeCharacter(pm);
	const mapIndex = state.getIndexOfMapWithPlayer();
	return {
		version: 1,
		name,
		date: new Date().toISOString(),
		location: game.assets.loadMap(mapIndex).name,
		time: `${state.hour}:${String(state.minute).padStart(2, '0')}`,
		savegame: toBase64(writeSavegame(savegame)),
		characters,
	};
}

/** Builds the save data for savegame bytes and the party members of a data set (used for "TOM") */
export function createSaveDataFromOriginal(assets, name, savegame, partyMembers) {
	const characters = {};
	for (const [index, pm] of partyMembers)
		characters[index] = serializeCharacter(pm);
	return {
		version: 1,
		name,
		date: new Date().toISOString(),
		location: assets.loadMap(savegame.mapIndex).name,
		time: `${savegame.hour}:${String(savegame.minute).padStart(2, '0')}`,
		savegame: toBase64(writeSavegame(savegame)),
		characters,
	};
}

export function readSaveData(data, assets) {
	const savegame = readSavegame(new DataReader(fromBase64(data.savegame)));
	const partyMembers = new Map();
	for (const [index, pmData] of Object.entries(data.characters)) {
		const key = Number(index);
		partyMembers.set(key, deserializeCharacter(pmData, assets.loadPerson(key)));
	}
	return { savegame, partyMembers };
}

export function getSlots() {
	const slots = [];
	for (let i = 1; i <= SlotCount; i++) {
		let data = null;
		try {
			const text = localStorage.getItem(SLOT_KEY(i));
			data = text ? JSON.parse(text) : null;
		} catch {
			data = null;
		}
		slots.push(data);
	}
	return slots;
}

export function getSlot(slot) {
	return getSlots()[slot - 1];
}

export function writeSlot(slot, data) {
	localStorage.setItem(SLOT_KEY(slot), JSON.stringify(data));
	setLastSlot(slot);
}

export function getLastSlot() {
	try {
		const slot = Number(localStorage.getItem(LAST_SLOT_KEY));
		return slot >= 1 && slot <= SlotCount ? slot : null;
	} catch {
		return null;
	}
}

export function setLastSlot(slot) {
	try {
		localStorage.setItem(LAST_SLOT_KEY, String(slot));
	} catch {
		// ignore
	}
}
