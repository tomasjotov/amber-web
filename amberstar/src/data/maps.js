// Map loading (port of Map, Map2D, Map3D).
import { decodeString } from './reader.js';
import { readEvent } from './events.js';
import { MapCharacterType, MapCharacterWalkType } from './enums.js';

export const MAP_EVENT_COUNT = 254;
export const MAP_CHARACTER_COUNT = 24;

export function loadMap(index, reader) {
	const map = { index };

	if (reader.readByte() !== 0xff)
		throw new Error(`Invalid map ${index}`);
	reader.readByte();
	map.tileset = reader.readWord(); // 2D: tileset, 3D: lab data index
	map.type = reader.readByte(); // 0 = 2D, 1 = 3D
	map.is3D = map.type === 1;
	map.flags = reader.readByte();
	map.songIndex = reader.readByte();
	map.width = reader.readByte();
	map.height = reader.readByte();
	map.name = decodeString(reader.readBytes(31)).replace(/\0.*$/s, '').trimEnd();

	map.events = [];
	for (let i = 0; i < MAP_EVENT_COUNT; i++) {
		const ev = readEvent(reader);
		map.events.push(ev.type === 0 ? null : ev);
	}

	const charIndices = reader.readWords(MAP_CHARACTER_COUNT);
	const charIcons = reader.readBytes(MAP_CHARACTER_COUNT);
	const charMoves = reader.readBytes(MAP_CHARACTER_COUNT);
	const charFlags = reader.readBytes(MAP_CHARACTER_COUNT);
	const charDays = reader.readBytes(MAP_CHARACTER_COUNT);
	const charMonths = reader.readBytes(MAP_CHARACTER_COUNT);

	map.stepsPerDay = reader.readWord();
	map.monthsPerYear = reader.readByte();
	map.daysPerMonth = reader.readByte();
	map.hoursPerDay = reader.readByte();
	map.minutesPerHour = reader.readByte();
	map.minutesPerStep = reader.readByte();
	map.hoursPerDaytime = reader.readByte();
	map.hoursPerNighttime = reader.readByte();

	const size = map.width * map.height;

	if (!map.is3D) {
		const underlay = reader.readBytes(size);
		const overlay = reader.readBytes(size);
		const events = reader.readBytes(size);
		map.tiles = Array.from({ length: size }, (_, i) => ({ underlay: underlay[i], overlay: overlay[i], event: events[i] }));
	} else {
		const numLabTiles = reader.readByte();
		const flags = [];
		for (let i = 0; i < numLabTiles; i++)
			flags.push(reader.readDword());
		const primary = reader.readBytes(numLabTiles);
		const secondary = reader.readBytes(numLabTiles);
		const colors = reader.readBytes(numLabTiles);
		map.labTiles = Array.from({ length: numLabTiles }, (_, i) => ({
			flags: flags[i], primaryLabBlockIndex: primary[i], secondaryLabBlockIndex: secondary[i], minimapColorIndex: colors[i],
		}));
		const labTileIndices = reader.readBytes(size);
		const events = reader.readBytes(size);
		map.tiles = Array.from({ length: size }, (_, i) => ({ labTileIndex: labTileIndices[i], event: events[i] }));
	}

	map.characters = [];
	const positionCounts = [];

	for (let i = 0; i < MAP_CHARACTER_COUNT; i++) {
		const f = charFlags[i];
		const type = (f & 0x1) ? MapCharacterType.Monster : (f & 0x10) ? MapCharacterType.Popup : MapCharacterType.Person;
		const walkType = type === MapCharacterType.Monster
			? ((f & 0x04) ? MapCharacterWalkType.Chase : MapCharacterWalkType.Stationary)
			: ((f & 0x02) ? MapCharacterWalkType.Random : MapCharacterWalkType.Path);
		const hasSpawnDate = (f & 0x08) !== 0;
		map.characters.push({
			index: charIndices[i],
			icon: charIcons[i],
			travelType: charMoves[i],
			type,
			walkType,
			day: hasSpawnDate ? charDays[i] : 0xff,
			month: hasSpawnDate ? charMonths[i] : 0xff,
		});
		positionCounts.push(charIndices[i] === 0 ? 0 : walkType === MapCharacterWalkType.Path ? 288 : 1);
	}

	map.characterPositions = [];
	for (let i = 0; i < MAP_CHARACTER_COUNT; i++) {
		const count = positionCounts[i];
		const positions = [];
		if (count === 1) {
			positions.push({ x: reader.readByte(), y: reader.readByte() });
		} else if (count === 288) {
			const xs = reader.readBytes(288);
			const ys = reader.readBytes(288);
			for (let p = 0; p < 288; p++)
				positions.push({ x: xs[p], y: ys[p] });
		}
		map.characterPositions.push(positions);
	}

	return map;
}
