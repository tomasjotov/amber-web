// Savegame (port of Amberstar.GameData.Legacy.Savegame).
import { DataReader } from './reader.js';

export const MaxTransportCount = 30;
export const ActiveSpellCount = 6;
export const MaxPartyMembers = 6;
export const MaxSavedEventsPerMap = 65;
export const MaxChests = 1000;

export function readSavegame(r) {
	if (r.peekDword() === 0x59415921) {
		r.position += 4;
		r = new DataReader(yayDecrypt(r.readToEnd()));
	}

	const s = {};
	s.month = r.readByte();
	s.day = r.readByte();
	s.hour = r.readByte();
	s.minute = r.readByte();
	s.partyX = r.readByte();
	s.partyY = r.readByte();
	s.partyDirection = r.readByte();
	const durations = Array.from(r.readBytes(ActiveSpellCount));
	s.partySize = r.readByte();
	s.activePartyMember = r.readByte();
	s.travelType = r.readByte();
	s.specialItems = r.readByte();
	s.musicBlock = r.readByte() !== 0;
	s.activeSpells = durations.map(d => ({ duration: d, value: r.readByte() }));
	s.year = r.readWord();
	s.mapIndex = r.readWord();
	s.partyCharacterIndices = r.readWords(MaxPartyMembers);
	s.travelledDays = r.readWord();
	s.relativeYear = r.readWord();
	const types = r.readBytes(MaxTransportCount);
	const xs = r.readBytes(MaxTransportCount);
	const ys = r.readBytes(MaxTransportCount);
	const maps = r.readWords(MaxTransportCount);
	s.transports = Array.from({ length: MaxTransportCount }, (_, i) => ({ type: types[i], x: xs[i], y: ys[i], mapIndex: maps[i] }));
	s.questBits = r.readBytes(32);
	s.eventBits = r.readBytes(4064);
	s.characterBits = r.readBytes(1502);
	s.knownWordsBits = r.readBytes(626);
	s.chestSlotBits = r.readBytes(1500);
	s.chestGold = r.readWords(MaxChests);
	s.wareCounts = Array.from(r.readBytes(1200));
	s.combatPositions = Array.from(r.readBytes(MaxPartyMembers));
	const numTileChanges = r.readWord();
	s.tileChanges = [];
	for (let i = 0; i < numTileChanges; i++) {
		const mapIndex = r.readWord();
		const x = r.readByte();
		const y = r.readByte();
		const tileIndex = r.readWord();
		s.tileChanges.push({ mapIndex, x, y, tileIndex });
	}
	return s;
}

export function writeSavegame(s) {
	const out = [];
	const byte = v => out.push(v & 0xff);
	const word = v => { out.push((v >> 8) & 0xff, v & 0xff); };
	byte(s.month); byte(s.day); byte(s.hour); byte(s.minute);
	byte(s.partyX); byte(s.partyY); byte(s.partyDirection);
	s.activeSpells.forEach(a => byte(a.duration));
	byte(s.partySize); byte(s.activePartyMember); byte(s.travelType); byte(s.specialItems);
	byte(s.musicBlock ? 1 : 0);
	s.activeSpells.forEach(a => byte(a.value));
	word(s.year); word(s.mapIndex);
	s.partyCharacterIndices.forEach(word);
	word(s.travelledDays); word(s.relativeYear);
	s.transports.forEach(t => byte(t.type));
	s.transports.forEach(t => byte(t.x));
	s.transports.forEach(t => byte(t.y));
	s.transports.forEach(t => word(t.mapIndex));
	for (const arr of [s.questBits, s.eventBits, s.characterBits, s.knownWordsBits, s.chestSlotBits])
		arr.forEach(byte);
	s.chestGold.forEach(word);
	s.wareCounts.forEach(byte);
	s.combatPositions.forEach(byte);
	word(s.tileChanges.length);
	for (const t of s.tileChanges) {
		word(t.mapIndex); byte(t.x); byte(t.y); word(t.tileIndex);
	}
	return Uint8Array.from(out);
}

function yayXor(data, key) {
	const add = 0x57;
	for (let i = 0; i + 1 < data.length; i += 2) {
		const mask = key;
		const w = ((data[i] << 8) | data[i + 1]) ^ mask;
		data[i] = w >> 8;
		data[i + 1] = w & 0xff;
		key = ((key << 4) + mask + add) & 0xffff;
	}
}

export function yayDecrypt(data) {
	data = data.slice();
	const key = (((data[0] << 8) | data[1]) ^ 0x4a48) & 0xffff;
	yayXor(data, key);
	return data.subarray(2);
}

export function yayEncrypt(data, key = 0xd2f9) {
	const result = new Uint8Array(data.length + 2);
	result[0] = 0x4a; result[1] = 0x48;
	result.set(data, 2);
	yayXor(result, key);
	return result;
}
