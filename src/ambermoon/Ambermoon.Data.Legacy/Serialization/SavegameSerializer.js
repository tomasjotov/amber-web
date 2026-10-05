// Port of Ambermoon.Data.Legacy/Serialization/SavegameSerializer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { EnumHelper } from '../../Ambermoon.Common/EnumHelper.js';
import { CollectionExtensions } from '../../Ambermoon.Common/CollectionExtensions.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { ActiveSpellType } from '../../Ambermoon.Data.Common/Enumerations/ActiveSpellType.js';
import { TransportLocation } from '../../Ambermoon.Data.Common/Savegame.js';
import { EventType, ChangeTileEvent } from '../../Ambermoon.Data.Common/Event.js';
import { PartyMember } from '../../Ambermoon.Data.Common/PartyMember.js';
import { Chest } from '../../Ambermoon.Data.Common/Chest.js';
import { Merchant } from '../../Ambermoon.Data.Common/Merchant.js';
import { Automap } from '../../Ambermoon.Data.Common/Automap.js';
import { SavegameOutputFiles } from '../../Ambermoon.Data.Common/Serialization/ISavegameSerializer.js';
import { PartyMemberReader } from '../Characters/PartyMemberReader.js';
import { PartyMemberWriter } from '../Characters/PartyMemberWriter.js';
import { AmbermoonEncoding } from '../AmbermoonEncoding.js';
import { ChestReader } from './ChestReader.js';
import { ChestWriter } from './ChestWriter.js';
import { MerchantReader } from './MerchantReader.js';
import { MerchantWriter } from './MerchantWriter.js';
import { AutomapReader } from './AutomapReader.js';
import { AutomapWriter } from './AutomapWriter.js';
import { DataReader } from './DataReader.js';
import { DataWriter } from './DataWriter.js';
import { FileReader } from './FileReader.js';
import { getValue, tryGetValue } from '../../../runtime.js';

export class SavegameSerializer {
	static ReadSaveData(savegame, dataReader) {
		savegame.Year = dataReader.ReadWord();
		savegame.Month = dataReader.ReadWord();
		savegame.DayOfMonth = dataReader.ReadWord();
		savegame.Hour = dataReader.ReadWord();
		savegame.Minute = dataReader.ReadWord();
		savegame.CurrentMapIndex = dataReader.ReadWord();
		savegame.CurrentMapX = dataReader.ReadWord();
		savegame.CurrentMapY = dataReader.ReadWord();
		savegame.CharacterDirection = dataReader.ReadWord();

		// Active spells (2 words each)
		// First word: duration in 5 minute chunks. So 120 means 120 * 5 minutes = 600 minutes = 10h
		// Second word: level (e.g. for light: 1 = magic torch, 2 = magic lantern, 3 = magic sun)
		// An active light spell replaces an existing one.
		// The active spells are in fixed spots:
		// - 0: Light (candle)
		// - 1: Magic barrier (shield)
		// - 2: Magic attack (sword)
		// - 3: Anti-magic barrier (star)
		// - 4: Clairvoyance (eye)
		// - 5: Magic map (map)
		for (const activeSpellType of EnumHelper.GetValues(ActiveSpellType)) {
			const duration = dataReader.ReadWord();

			if (duration === 0) {
				savegame.ActiveSpells[activeSpellType] = null;
				dataReader.Position += 2;
			} else {
				savegame.ActivateSpell(activeSpellType, duration, dataReader.ReadWord());
			}
		}

		dataReader.ReadWord(); // Number of party members. We don't really need it.
		savegame.ActivePartyMemberSlot = dataReader.ReadWord() - 1; // it is stored 1-based

		for (let i = 0; i < 6; ++i)
			savegame.CurrentPartyMemberIndices[i] = dataReader.ReadWord();

		savegame.YearsPassed = dataReader.ReadWord();
		savegame.TravelType = dataReader.ReadWord();
		savegame.SpecialItemsActive = dataReader.ReadWord();
		savegame.GameOptions = dataReader.ReadWord();
		savegame.HoursWithoutSleep = dataReader.ReadWord();

		// up to 32 transport positions
		for (let i = 0; i < 32; ++i) {
			const type = dataReader.ReadByte();

			if (type === 0) {
				savegame.TransportLocations[i] = null;
				dataReader.Position += 5;
			} else {
				const x = dataReader.ReadByte();
				const y = dataReader.ReadByte();
				dataReader.Position += 1; // unknown byte
				const mapIndex = dataReader.ReadWord();

				const transportLocation = new TransportLocation();
				transportLocation.TravelType = type;
				transportLocation.MapIndex = mapIndex;
				transportLocation.Position = new Position(x, y);
				savegame.TransportLocations[i] = transportLocation;
			}
		}


		// global variables (at offset 0x0104, 1024 bytes = 8192 bits = 8192 variables)
		// note that wind gate repair status is also handled by global variables (at offset 0x0112)
		{
			const globalVariables = dataReader.ReadBytes(1024);
			for (let i = 0; i < 1024; ++i)
				savegame.GlobalVariables[i] = globalVariables[i];
		}

		// map event bits. each bit stands for a event. order is 76543210 FECDBA98 ...
		// Note (port): ulong values are stored as BigInt to keep all 64 bits.
		for (let i = 0; i < 1024; ++i)
			savegame.MapEventBits[i] = dataReader.ReadQwordAsBigInt();

		// character event bits. each bit stands for a character. order is 76543210 FECDBA98 ...
		for (let i = 0; i < 1024; ++i)
			savegame.CharacterBits[i] = dataReader.ReadDword();

		savegame.DictionaryWords = dataReader.ReadBytes(128);
		savegame.GotoPointBits = dataReader.ReadBytes(32); // 32 bytes for goto points (256 bits). Each goto point stores the bit index (0-based).
		savegame.ChestUnlockStates = dataReader.ReadBytes(32); // 32 * 8 bits = 256 bits (1 for each chest, possible chest indices 0 to 255)
		savegame.DoorUnlockStates = dataReader.ReadBytes(16); // 16 * 8 bits = 128 bits (1 for each door, possible door indices 0 to 127)
		savegame.ExtendedChestUnlockStates = dataReader.ReadBytes(16); // 16 * 8 bits = 128 bits (1 for each chest, possible door indices 0 to 127)

		{
			const battlePositions = dataReader.ReadBytes(6);
			for (let i = 0; i < 6; ++i)
				savegame.BattlePositions[i] = battlePositions[i];
		}

		savegame.TileChangeEvents.clear();

		while (dataReader.Position < dataReader.Size) {
			const mapIndex = dataReader.ReadWord();

			if (mapIndex === 0) // end
				break;

			const x = dataReader.ReadByte();
			const y = dataReader.ReadByte();
			const tileIndex = dataReader.ReadWord();

			if (mapIndex !== 0 && mapIndex < 0x0300 && tileIndex <= 0xffff) { // should be a real map and a valid front tile index
				const changeTileEvent = new ChangeTileEvent();
				changeTileEvent.Type = EventType.ChangeTile;
				changeTileEvent.Index = 0xffffffff;
				changeTileEvent.MapIndex = mapIndex;
				changeTileEvent.X = x;
				changeTileEvent.Y = y;
				changeTileEvent.FrontTileIndex = tileIndex;
				CollectionExtensions.SafeAdd(savegame.TileChangeEvents, mapIndex, changeTileEvent);
			} else {
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid tile change event in savegame.');
			}
		}
	}

	static WriteSaveData(savegame, dataWriter) {
		const startOffset = dataWriter.Position;

		dataWriter.WriteWord(savegame.Year);
		dataWriter.WriteWord(savegame.Month);
		dataWriter.WriteWord(savegame.DayOfMonth);
		dataWriter.WriteWord(savegame.Hour);
		dataWriter.WriteWord(savegame.Minute);
		dataWriter.WriteWord(savegame.CurrentMapIndex);
		dataWriter.WriteWord(savegame.CurrentMapX);
		dataWriter.WriteWord(savegame.CurrentMapY);
		dataWriter.WriteWord(savegame.CharacterDirection);

		for (const activeSpellType of EnumHelper.GetValues(ActiveSpellType)) {
			const activeSpell = savegame.ActiveSpells[activeSpellType];
			dataWriter.WriteWord(activeSpell?.Duration ?? 0);
			dataWriter.WriteWord(activeSpell?.Level ?? 0);
		}

		const memberIndices = [...savegame.CurrentPartyMemberIndices].filter(i => i !== 0);
		dataWriter.WriteWord(memberIndices.length); // party member count
		dataWriter.WriteWord(1 + savegame.ActivePartyMemberSlot);

		for (let i = 0; i < 6; ++i)
			dataWriter.WriteWord(i < memberIndices.length ? memberIndices[i] : 0);

		dataWriter.WriteWord(savegame.YearsPassed);
		dataWriter.WriteWord(savegame.TravelType);
		dataWriter.WriteWord(savegame.SpecialItemsActive);
		dataWriter.WriteWord(savegame.GameOptions);
		dataWriter.WriteWord(savegame.HoursWithoutSleep);

		// up to 32 transport positions (6 bytes each)
		for (let i = 0; i < 32; ++i) {
			if (savegame.TransportLocations[i] == null) {
				// 6 zero bytes
				dataWriter.WriteDword(0);
				dataWriter.WriteWord(0);
			} else {
				dataWriter.WriteByte(savegame.TransportLocations[i].TravelType);
				dataWriter.WriteByte(savegame.TransportLocations[i].Position.X);
				dataWriter.WriteByte(savegame.TransportLocations[i].Position.Y);
				dataWriter.WriteByte(0); // unknown byte
				dataWriter.WriteWord(savegame.TransportLocations[i].MapIndex);
			}
		}

		// global variables (at offset 0x0104, 1024 bytes = 8192 bits = 8192 variables)
		dataWriter.Write(savegame.GlobalVariables);

		// map event bits. each bit stands for a event. order is 76543210 FECDBA98 ...
		for (let i = 0; i < 1024; ++i)
			dataWriter.WriteQword(savegame.MapEventBits[i]);

		// character event bits. each bit stands for a character. order is 76543210 FECDBA98 ...
		for (let i = 0; i < 1024; ++i)
			dataWriter.WriteDword(savegame.CharacterBits[i]);

		dataWriter.Write(savegame.DictionaryWords);

		let unknownBytes = 0x3584 - dataWriter.Position;
		dataWriter.Write(new Uint8Array(Math.max(0, unknownBytes)));

		dataWriter.Write(savegame.GotoPointBits);
		dataWriter.Write(savegame.ChestUnlockStates);
		dataWriter.Write(savegame.DoorUnlockStates);
		dataWriter.Write(savegame.ExtendedChestUnlockStates);

		unknownBytes = 0x35e4 - dataWriter.Position;
		dataWriter.Write(new Uint8Array(Math.max(0, unknownBytes)));

		dataWriter.Write(savegame.BattlePositions);

		for (const [, tileChangeEvents] of savegame.TileChangeEvents) {
			for (const tileChangeEvent of tileChangeEvents) {
				dataWriter.WriteWord(tileChangeEvent.MapIndex);
				dataWriter.WriteByte(tileChangeEvent.X);
				dataWriter.WriteByte(tileChangeEvent.Y);
				dataWriter.WriteWord(tileChangeEvent.FrontTileIndex);
			}
		}

		dataWriter.WriteWord(0); // end marker
	}

	Read(savegame, files, partyTextsContainer, fallbackPartyMemberContainer = null) {
		const partyMemberReader = new PartyMemberReader();
		const chestReader = new ChestReader();
		const merchantReader = new MerchantReader();
		const automapReader = new AutomapReader();

		savegame.PartyMembers.clear();
		savegame.Chests.clear();
		savegame.Merchants.clear();
		savegame.Automaps.clear();

		for (const [key, value] of [...files.PartyMemberDataReaders.Files].filter(([, v]) => v.Size !== 0)) {
			let partyTextFile = null;
			if (partyTextsContainer != null) {
				const [found, textFile] = tryGetValue(partyTextsContainer.Files, key);
				if (found && textFile.Size !== 0)
					partyTextFile = textFile;
			}
			value.Position = 0;
			savegame.PartyMembers.set(key, PartyMember.Load(key, partyMemberReader,
				value, partyTextFile,
				fallbackPartyMemberContainer == null ? null : getValue(fallbackPartyMemberContainer.Files, key)));
		}
		for (const [key, value] of [...files.ChestDataReaders.Files].filter(([, v]) => v.Size !== 0)) {
			value.Position = 0;
			savegame.Chests.set(key, Chest.Load(chestReader, value));
		}
		for (const [key, value] of [...files.MerchantDataReaders.Files].filter(([, v]) => v.Size !== 0)) {
			value.Position = 0;
			savegame.Merchants.set(key, Merchant.Load(merchantReader, value));
		}
		for (const [key, value] of [...files.AutomapDataReaders.Files].filter(([, v]) => v.Size !== 0)) {
			value.Position = 0;
			savegame.Automaps.set(key, Automap.Load(automapReader, value));
		}

		files.SaveDataReader.Position = 0;
		SavegameSerializer.ReadSaveData(savegame, files.SaveDataReader);
	}

	Write(savegame) {
		const files = new SavegameOutputFiles();
		const partyMemberWriter = new PartyMemberWriter();
		const chestWriter = new ChestWriter();
		const merchantWriter = new MerchantWriter();
		const automapWriter = new AutomapWriter();

		function WriteContainer(collection, writer) {
			const container = new Map();
			for (const [key, value] of collection) {
				const valueWriter = new DataWriter();
				writer(valueWriter, value);
				container.set(key, valueWriter);
			}
			return container;
		}

		files.PartyMemberDataWriters = WriteContainer(savegame.PartyMembers, (w, p) => partyMemberWriter.WritePartyMember(p, w));
		files.ChestDataWriters = WriteContainer(savegame.Chests, (w, c) => chestWriter.WriteChest(c, w));
		files.MerchantDataWriters = WriteContainer(savegame.Merchants, (w, m) => merchantWriter.WriteMerchant(m, w));
		files.AutomapDataWriters = WriteContainer(savegame.Automaps, (w, a) => automapWriter.WriteAutomap(a, w));
		files.SaveDataWriter = new DataWriter();
		SavegameSerializer.WriteSaveData(savegame, files.SaveDataWriter);

		return files;
	}

	/** ref int current -> returns [savegameNames, current] */
	static GetSavegameNames(savesReader, current) {
		savesReader.Position = 0;
		current = savesReader.ReadWord();
		const savegameNames = new Array(10).fill(null);
		let position = savesReader.Position;

		for (let i = 0; i < 10; ++i) {
			savegameNames[i] = savesReader.ReadNullTerminatedString();

			if (i < 9) { // This is a workaround as some older game versions have fewer bytes for last savegame
				position += 39;
				savesReader.Position = position;
			}
		}

		return [savegameNames, current];
	}

	/**
	 * ref string name -> returns [name]
	 * TODO(port): There is no file system in the browser. The externalSavesPath handling
	 * (File.Exists/File.ReadAllBytes/Directory.Exists) behaves as if the external file does not exist.
	 */
	static WriteSavegameName(gameData, slot, name, externalSavesPath) {
		if (slot === 0)
			throw new AmbermoonException(ExceptionScope.Application, 'Savegame slots must be 1-based');

		if (slot > 10)
			return [name];

		const legacyGameData = gameData;

		if (name.length > 38)
			name = name.substring(0, 38);

		function ConvertName(name) {
			const buffer = new Uint8Array(39);
			const bytes = new AmbermoonEncoding().GetBytes(name);
			for (let i = 0; i < bytes.length && i < 39; ++i)
				buffer[i] = bytes[i];
			return buffer;
		}

		function WriteCurrentSlot(data, slot) {
			data[0] = (slot >> 8) & 0xff;
			data[1] = slot & 0xff;
		}

		// TODO(port): no file system -> the external saves file never exists
		const externalSavesFileExists = path => false;

		const nameData = ConvertName(name);
		let currentSlot = slot--;
		const DataSize = 2 + 10 * 39;

		if (!legacyGameData.Files.has('Saves') && externalSavesPath != null && externalSavesFileExists(externalSavesPath)) {
			// TODO(port): legacyGameData.Files.Add("Saves", FileReader.CreateRawFile("Saves", File.ReadAllBytes(externalSavesPath)));
		}

		if (!legacyGameData.Files.has('Saves')) {
			const data = new Uint8Array(DataSize);
			WriteCurrentSlot(data, currentSlot);
			data.set(nameData, 2 + slot * 39);
			legacyGameData.Files.set('Saves', FileReader.CreateRawFile('Saves', data));
		} else {
			// Note: There is a bug in original where the file 'Saves' is
			// too small. If we detect it, we will fix it.
			let data = getValue(getValue(legacyGameData.Files, 'Saves').Files, 1).ToArray();
			if (data.length < DataSize) {
				const tempData = new Uint8Array(DataSize);
				tempData.set(data, 0);
				data = tempData;
			}
			WriteCurrentSlot(data, currentSlot);
			data.set(nameData, 2 + slot * 39);
			getValue(legacyGameData.Files, 'Saves').Files.set(1, DataReader.FromData(data));

			// If someone replaces the saves manually outside the game and also the Saves file,
			// it might be reflected in game but when saving, those changes will be lost.
			// So if slots are missing in game data but are present in external saves file and
			// there are folders for the slot, we will add it.
			if (externalSavesPath != null && externalSavesFileExists(externalSavesPath)) {
				// TODO(port): reading the external saves file (File.ReadAllBytes) and checking the Save.XX
				// directories (Directory.Exists) is not possible without a file system. The C# code copies
				// names of slots which are empty internally but set in the external saves file.
			}
		}

		return [name];
	}
}
