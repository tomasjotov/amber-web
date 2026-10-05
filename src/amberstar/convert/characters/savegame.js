// Initial savegame (Amberstar new game: _NEW/PARTYDAT.SAV, _NEW/CHARDATA.AMB, _NEW/CHESTDAT.AMB) and the
// savegame manager (ISavegameManager of the engine, see Ambermoon.Data.Legacy/SavegameManager.js).
import { Savegame, TransportLocation, ActiveSpell } from '../../../ambermoon/Ambermoon.Data.Common/Savegame.js';
import { SavegameInputFiles } from '../../../ambermoon/Ambermoon.Data.Common/Serialization/ISavegameSerializer.js';
import { ChangeTileEvent, EventType } from '../../../ambermoon/Ambermoon.Data.Common/Event.js';
import { Position } from '../../../ambermoon/Ambermoon.Common/Position.js';
import { DataReader } from '../../../ambermoon/Ambermoon.Data.Legacy/Serialization/DataReader.js';
import { SavegameSerializer } from '../../../ambermoon/Ambermoon.Data.Legacy/Serialization/SavegameSerializer.js';
import { readSavegame } from '../../../../amberstar/src/data/savegame.js';
import { readContainer } from '../../../../amberstar/src/data/container.js';
import { DataReader as AmberstarDataReader } from '../../../../amberstar/src/data/reader.js';
import { AmberstarQuestBitGlobalVariableOffset } from '../maps2D/events.js';
import { convertPartyMember, loadAmberstarCharacter } from './persons.js';
import { convertChests, convertMerchants } from './places.js';
import { dictionaryBytes } from './texts.js';

function isBitSet(bits, bit) {
	return (bits[bit >> 3] & (1 << (bit & 7))) !== 0;
}

/**
 * Builds the Ambermoon savegame of a new Amberstar game.
 * @param partyMemberData Map<characterIndex, Amberstar party member> (from _NEW/CHARDATA.AMB)
 */
export function buildInitialSavegame(ctx, itemManager, portraitIndices) {
	const source = ctx.source;
	const hasNew = source.hasNewGameData;
	const s = hasNew ? readSavegame(new AmberstarDataReader(source.files.get('_NEW/PARTYDAT.SAV'))) : source.loadInitialSavegame();
	const characterContainer = hasNew ? readContainer(source.files.get('_NEW/CHARDATA.AMB')) : source.container('CHARDATA.AMB');

	const savegame = new Savegame();
	// Date and time (Amberstar month/day are 1-based like in Ambermoon)
	savegame.Year = s.year;
	savegame.Month = Math.max(1, s.month);
	savegame.DayOfMonth = Math.max(1, s.day);
	savegame.Hour = s.hour;
	savegame.Minute = s.minute - s.minute % 5;
	savegame.YearsPassed = s.relativeYear;
	savegame.HoursWithoutSleep = 0;
	// Map and party position (1-based in both games), direction (0 up, 1 right, 2 down, 3 left in both)
	savegame.CurrentMapIndex = s.mapIndex;
	savegame.CurrentMapX = s.partyX;
	savegame.CurrentMapY = s.partyY;
	savegame.CharacterDirection = s.partyDirection & 3;
	savegame.TravelType = s.travelType; // walk, horse, raft, ship, magic disc, eagle: same values
	let t = 0;
	for (const transport of s.transports) {
		if (transport.type === 0 || t >= 32)
			continue;
		const location = new TransportLocation();
		location.TravelType = transport.type;
		location.MapIndex = transport.mapIndex;
		location.Position = new Position(transport.x, transport.y);
		savegame.TransportLocations[t++] = location;
	}
	// Active spells: Amberstar light, armor protection, weapon power, anti-magic, clairvoyance, invisibility
	// -> Ambermoon light, protection, attack, anti-magic, clairvoyance (no invisibility).
	s.activeSpells.slice(0, 5).forEach((spell, type) => {
		if (spell.duration !== 0) {
			const active = new ActiveSpell();
			active.Type = type;
			active.Duration = spell.duration;
			active.Level = Math.max(1, spell.value);
			savegame.ActiveSpells[type] = active;
		}
	});
	savegame.SpecialItemsActive = s.specialItems; // same bit layout (see items.js)
	savegame.GameOptions = 0;

	// Party
	for (let i = 0; i < 6; i++)
		savegame.CurrentPartyMemberIndices[i] = s.partyCharacterIndices[i] ?? 0;
	savegame.ActivePartyMemberSlot = Math.max(0, s.activePartyMember - 1);
	for (let i = 0; i < 6; i++)
		savegame.BattlePositions[i] = s.combatPositions[i] ?? i;

	// Quest bits = global variables, known words = dictionary bits (dictionary index = fragment index)
	s.questBits.forEach((value, i) => {
		for (let b = 0; b < 8; b++) {
			if (value & (1 << b))
				savegame.SetGlobalVariable(AmberstarQuestBitGlobalVariableOffset + i * 8 + b, true);
		}
	});
	savegame.DictionaryWords = new Uint8Array(dictionaryBytes(ctx));
	savegame.DictionaryWords.set(s.knownWordsBits.subarray(0, savegame.DictionaryWords.length));
	savegame.GotoPointBits = new Uint8Array(32);
	savegame.ChestUnlockStates = new Uint8Array(32); // all locked chests start locked
	savegame.DoorUnlockStates = new Uint8Array(16);
	savegame.ExtendedChestUnlockStates = new Uint8Array(16);

	// Event bits: Amberstar stores 65 bits per map (save index), the map converter provides the
	// Ambermoon EventList slot of every save index (map.AmberstarSaveIndexSlots).
	for (const [mapIndex, map] of ctx.result.maps) {
		const slots = map.AmberstarSaveIndexSlots;
		if (slots && mapIndex >= 1 && mapIndex <= 1024) {
			for (const [saveIndex, slot] of slots) {
				if (slot < 64 && isBitSet(s.eventBits, (mapIndex - 1) * 65 + saveIndex))
					savegame.SetEventBit(mapIndex, slot, true);
			}
		}
		// Character bits: 24 per map (1-based map character index)
		for (let c = 1; c <= 24 && mapIndex <= 1024; c++) {
			if (isBitSet(s.characterBits, (mapIndex - 1) * 24 + c) && c - 1 < 32)
				savegame.SetCharacterBit(mapIndex, c - 1, true);
		}
	}
	// Tile changes
	for (const change of s.tileChanges) {
		const event = new ChangeTileEvent();
		event.Type = EventType.ChangeTile;
		event.Index = 0xffffffff;
		event.MapIndex = change.mapIndex;
		event.X = change.x;
		event.Y = change.y;
		event.FrontTileIndex = change.tileIndex;
		event.Unknown = new Uint8Array(1);
		if (!savegame.TileChangeEvents.has(change.mapIndex))
			savegame.TileChangeEvents.set(change.mapIndex, []);
		savegame.TileChangeEvents.get(change.mapIndex).push(event);
	}

	// All party members (also the ones which have not joined yet), keyed by the CHARDATA index
	for (const [key, entry] of characterContainer) {
		const data = entry.data;
		if (data.length < 0x47a || data[2] !== 0)
			continue;
		const person = loadAmberstarCharacter(ctx, key, data);
		if (!person.isPartyMember)
			continue;
		const pm = convertPartyMember(ctx, key, person, itemManager, portraitIndices.get(key));
		savegame.PartyMembers.set(key, pm);
	}

	savegame.Chests = convertChests(ctx, s);
	savegame.Merchants = convertMerchants(ctx, s.wareCounts);
	return savegame;
}

// ---------------------------------------------------------------------------------------------
// Savegame manager
//
// Storage: `{ get(name) -> Uint8Array|null, set(name, Uint8Array), remove(name) }` (host storage).
// Every savegame is one entry 'Amberstar/Save.NN' in a small container format holding the files of
// the Ambermoon SavegameSerializer (Party_data.sav, Party_char.amb, Chest_data.amb, Merchant_data.amb,
// Automap.amb) plus the full dictionary bits (the Ambermoon format only stores 128 bytes but Amberstar
// needs one bit per text fragment). Slot 99 is the crash save. 'Amberstar/Saves' stores the names
// and the current slot as JSON.
// ---------------------------------------------------------------------------------------------
const Prefix = 'Amberstar/';
const FileIds = { SaveData: 0, PartyMembers: 1, Chests: 2, Merchants: 3, Automaps: 4, Dictionary: 5 };
const Magic = [0x41, 0x53, 0x53, 0x31]; // 'ASS1'

function encodeSavegame(serializer, savegame) {
	const fullWords = savegame.DictionaryWords;
	const short = new Uint8Array(128);
	short.set(fullWords.subarray(0, 128));
	savegame.DictionaryWords = short;
	let files;
	try {
		files = serializer.Write(savegame);
	} finally {
		savegame.DictionaryWords = fullWords;
	}
	const entries = [[FileIds.SaveData, 1, files.SaveDataWriter.ToArray()], [FileIds.Dictionary, 1, fullWords]];
	for (const [id, writers] of [[FileIds.PartyMembers, files.PartyMemberDataWriters], [FileIds.Chests, files.ChestDataWriters],
		[FileIds.Merchants, files.MerchantDataWriters], [FileIds.Automaps, files.AutomapDataWriters]]) {
		for (const [key, writer] of writers)
			entries.push([id, key, writer.ToArray()]);
	}
	const size = 8 + entries.reduce((n, e) => n + 9 + e[2].length, 0);
	const data = new Uint8Array(size);
	const view = new DataView(data.buffer);
	data.set(Magic, 0);
	view.setUint32(4, entries.length);
	let offset = 8;
	for (const [id, key, bytes] of entries) {
		data[offset] = id;
		view.setUint32(offset + 1, key);
		view.setUint32(offset + 5, bytes.length);
		data.set(bytes, offset + 9);
		offset += 9 + bytes.length;
	}
	return data;
}

function decodeSavegameFiles(data) {
	if (!data || data.length < 8 || Magic.some((m, i) => data[i] !== m))
		return null;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const count = view.getUint32(4);
	const containers = Object.values(FileIds).map(() => ({ Files: new Map() }));
	let offset = 8;
	for (let i = 0; i < count; i++) {
		const id = data[offset];
		const key = view.getUint32(offset + 1);
		const length = view.getUint32(offset + 5);
		const bytes = data.slice(offset + 9, offset + 9 + length);
		containers[id]?.Files.set(key, DataReader.FromData(bytes));
		offset += 9 + length;
	}
	const files = new SavegameInputFiles();
	files.SaveDataReader = containers[FileIds.SaveData].Files.get(1);
	files.PartyMemberDataReaders = containers[FileIds.PartyMembers];
	files.ChestDataReaders = containers[FileIds.Chests];
	files.MerchantDataReaders = containers[FileIds.Merchants];
	files.AutomapDataReaders = containers[FileIds.Automaps];
	const dictionary = containers[FileIds.Dictionary].Files.get(1);
	return { files, dictionary: dictionary ? dictionary.ReadToEnd() : null };
}

/**
 * Reads a savegame from the encoded data. Party member texts are not part of the Ambermoon savegame
 * format (they come from Party_texts.amb), so they are taken from the converted party members.
 */
function readSavegameData(ctx, serializer, data) {
	const decoded = decodeSavegameFiles(data);
	if (!decoded || !decoded.files.SaveDataReader)
		return null;
	const savegame = new Savegame();
	(serializer ?? new SavegameSerializer()).Read(savegame, decoded.files, null);
	const fullWords = new Uint8Array(dictionaryBytes(ctx));
	fullWords.set(savegame.DictionaryWords.subarray(0, Math.min(128, fullWords.length)));
	if (decoded.dictionary)
		fullWords.set(decoded.dictionary.subarray(0, fullWords.length));
	savegame.DictionaryWords = fullWords;
	const texts = ctx.amberstarPartyMemberTexts;
	for (const [key, partyMember] of savegame.PartyMembers)
		partyMember.Texts = texts?.get(key) ?? [];
	return savegame;
}

const pad = n => String(n).padStart(2, '0');

export function createSavegameManager(ctx, storage) {
	const read = name => {
		try {
			return storage?.get(Prefix + name) ?? null;
		} catch {
			return null;
		}
	};
	const write = (name, data) => storage?.set(Prefix + name, data);
	const remove = name => {
		if (typeof storage?.remove === 'function')
			storage.remove(Prefix + name);
		else
			storage?.set(Prefix + name, null);
	};
	const loadNames = () => {
		const data = read('Saves');
		if (data) {
			try {
				const json = JSON.parse(new TextDecoder().decode(data));
				return { current: json.current ?? 0, names: json.names ?? [] };
			} catch {
				// ignore
			}
		}
		return { current: 0, names: [] };
	};
	const saveNames = info => write('Saves', new TextEncoder().encode(JSON.stringify(info)));
	const slotName = slot => `Save.${pad(slot)}`;
	let initialData = null;

	const manager = {
		get ContinueSavegameSlot() { return loadNames().current; },

		LoadInitial(gameData, savegameSerializer) {
			initialData ??= encodeSavegame(savegameSerializer ?? new SavegameSerializer(), ctx.amberstarInitialSavegame);
			return readSavegameData(ctx, savegameSerializer, initialData);
		},

		Load(gameData, savegameSerializer, saveSlot, totalSavegames) {
			if (saveSlot === 0)
				return manager.LoadInitial(gameData, savegameSerializer);
			try {
				return readSavegameData(ctx, savegameSerializer, read(slotName(saveSlot)));
			} catch (e) {
				console.error(`Failed to load Amberstar savegame ${saveSlot}`, e);
				return null;
			}
		},

		Save(gameData, savegameSerializer, saveSlot, name, savegame) {
			write(slotName(saveSlot), encodeSavegame(savegameSerializer ?? new SavegameSerializer(), savegame));
			if (saveSlot >= 1 && saveSlot < 99) {
				const info = loadNames();
				info.names[saveSlot - 1] = name;
				info.current = saveSlot;
				saveNames(info);
			}
		},

		GetSavegameNames(gameData, totalSavegames) {
			const info = loadNames();
			const names = Array.from({ length: totalSavegames }, (_, i) => info.names[i] ?? '');
			return [names, info.current];
		},

		WriteSavegameName(gameData, slot, name, externalSavesPath) {
			if (slot >= 1) {
				const info = loadNames();
				info.names[slot - 1] = name;
				saveNames(info);
			}
			return [name];
		},

		SetActiveSavegame(gameData, slot) {
			const info = loadNames();
			info.current = slot;
			saveNames(info);
		},

		// The game (Ambermoon.Game/Game.js) uses the savegame manager also as the provider of the additional
		// savegame slots 11-30 (Configuration.ExtendedSavegameSlots). All Amberstar slot names are kept in 'Saves',
		// so the additional slot object is a view of these names (BaseNames = slots 1-10, Names = slots 11-30).
		GetOrCreateAdditionalSavegameNames(gameVersionName) {
			const info = loadNames();
			return {
				GameVersionName: gameVersionName,
				BaseNames: Array.from({ length: 10 }, (_, i) => info.names[i] ?? ''),
				Names: Array.from({ length: 20 }, (_, i) => info.names[10 + i] ?? ''),
				get ContinueSavegameSlot() { return loadNames().current; },
				set ContinueSavegameSlot(slot) {
					const current = loadNames();
					current.current = slot;
					saveNames(current);
				},
				LastSavesSync: null,
			};
		},

		RequestSave(savegameManager, gameData) {
			// The names are written by Save/WriteSavegameName already.
		},

		HasCrashSavegame() { return read(slotName(99)) != null; },

		RemoveCrashedSavegame() {
			try {
				remove(slotName(99));
				return true;
			} catch {
				return false;
			}
		},

		SaveCrashedGame(savegameSerializer, savegame) {
			write(slotName(99), encodeSavegame(savegameSerializer ?? new SavegameSerializer(), savegame));
		},
	};
	return manager;
}
