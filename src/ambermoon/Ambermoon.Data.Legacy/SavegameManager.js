// Port of Ambermoon.Data.Legacy/SavegameManager.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import {
	FileNotFoundException, KeyNotFoundException, formatNumber, getValue, isNullOrWhiteSpace, repeat
} from '../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { Savegame } from '../Ambermoon.Data.Common/Savegame.js';
import { SavegameInputFiles } from '../Ambermoon.Data.Common/Serialization/ISavegameSerializer.js';
import { LobCompression } from './Compression/LobCompression.js';
import { DataReader } from './Serialization/DataReader.js';
import { DataWriter } from './Serialization/DataWriter.js';
import { FileReader } from './Serialization/FileReader.js';
import { FileWriter } from './Serialization/FileWriter.js';
import { FileType } from './Serialization/FileType.js';
import { FileDictionaryCompression } from './Serialization/FileDictionaryCompression.js';
import { SavegameSerializer } from './Serialization/SavegameSerializer.js';
import { AmbermoonEncoding } from './AmbermoonEncoding.js';
import { Files } from './Files.js';
import { GameData } from './GameData.js';

/*
 * Browser port: There is no file system. All file accesses of the C# version (relative to the
 * savegame folder `path`) go through an injectable storage object:
 *
 *   storage = {
 *     get(name: string): Uint8Array | null,   // read a file, null if it does not exist
 *     set(name: string, data: Uint8Array): void, // write (create or replace) a file
 *     remove?(name: string): void              // optional: delete a file (fallback: set(name, null))
 *   }
 *
 * File names are relative paths with '/' as separator, exactly like the C# relative paths:
 *   'Saves', 'Save.01/Party_data.sav', 'Save.01/Party_char.amb', 'Save.01/Chest_data.amb',
 *   'Save.01/Merchant_data.amb', 'Save.01/Automap.amb', crash save 'Save.99/...',
 *   backups 'backups/Save.01/...'.
 * If a `path` (prefix) is given to the constructor, it is prepended ('<path>/Saves', ...).
 * Folders do not exist on their own: a folder "exists" if any of the 5 savegame files exists in it.
 */

function combine(basePath, name) {
	return basePath ? `${basePath}/${name}` : name;
}

function getDirectoryName(path) {
	const index = path.lastIndexOf('/');
	return index < 0 ? '' : path.substring(0, index);
}

const saveFolder = slot => `Save.${formatNumber(slot, '00')}`;

export class SavegameManager {
	/**
	 * @param storage The storage object (see above).
	 * @param path Optional prefix for all storage file names (the savegame folder in C#).
	 */
	constructor(storage, path = '') {
		this.transferredFolderSaves = false;
		this.storage = storage;
		this.path = path ?? '';
		this.savesPath = combine(this.path, 'Saves');
	}

	static SaveFileNames = [
		'Party_data.sav',
		'Party_char.amb',
		'Chest_data.amb',
		'Merchant_data.amb',
		'Automap.amb'
	];

	// ---- storage helpers (replacements for File/Directory) ----

	fileExists(name) {
		return this.storage.get(name) != null;
	}

	readFile(name) {
		const data = this.storage.get(name);

		if (data == null)
			throw new FileNotFoundException(`Could not find file '${name}'.`);

		return data;
	}

	directoryExists(directory) {
		return SavegameManager.SaveFileNames.some(name => this.fileExists(combine(directory, name)));
	}

	removeFile(name) {
		if (typeof this.storage.remove === 'function')
			this.storage.remove(name);
		else
			this.storage.set(name, null);
	}

	/**
	 * C#: string[] GetSavegameNames(IGameData gameData, out int current, int totalSavegames)
	 * Returns [names, current].
	 */
	GetSavegameNames(gameData, totalSavegames) {
		let current = 0;

		if (this.fileExists(this.savesPath)) {
			return SavegameSerializer.GetSavegameNames(DataReader.FromData(this.readFile(this.savesPath)), current);
		}
		else if (!gameData.Files.has('Saves')) {
			return [repeat('', totalSavegames), current];
		}
		else {
			return SavegameSerializer.GetSavegameNames(gameData.Files.get('Saves').Files.get(1), current);
		}
	}

	/**
	 * C#: void WriteSavegameName(IGameData gameData, int slot, ref string name, string externalSavesPath)
	 * Returns [name].
	 *
	 * Note: The C# serializer reads the external 'Saves' file (externalSavesPath) from the file system.
	 * Here this part is done with the storage before/after calling the serializer (which gets null as path).
	 */
	WriteSavegameName(gameData, slot, name, externalSavesPath) {
		const externalSavesData = externalSavesPath != null ? this.storage.get(externalSavesPath) : null;

		if (slot !== 0 && slot <= 10 && !gameData.Files.has('Saves') && externalSavesData != null)
			gameData.Files.set('Saves', FileReader.CreateRawFile('Saves', externalSavesData));

		const savesExisted = gameData.Files.has('Saves');

		[name] = SavegameSerializer.WriteSavegameName(gameData, slot, name, null);

		if (slot <= 10 && savesExisted && externalSavesData != null) {
			// If someone replaces the saves manually outside the game and also the Saves file,
			// it might be reflected in game but when saving, those changes will be lost.
			// So if slots are missing in game data but are present in external saves file and
			// there are folders for the slot, we will add it.
			const data = gameData.Files.get('Saves').Files.get(1).ToArray();
			const [externalSaveNames] = SavegameSerializer.GetSavegameNames(DataReader.FromData(externalSavesData), 0);
			const [internalSaveNames] = SavegameSerializer.GetSavegameNames(DataReader.FromData(data), 0);
			const basePath = getDirectoryName(externalSavesPath);
			const ConvertName = name => {
				const buffer = new Uint8Array(39);
				buffer.set(new AmbermoonEncoding().GetBytes(name).subarray(0, 39));
				return buffer;
			};

			for (let i = 0; i < 10; i++) {
				if (isNullOrWhiteSpace(internalSaveNames[i]) && !isNullOrWhiteSpace(externalSaveNames[i]) &&
					this.directoryExists(combine(basePath, saveFolder(i + 1)))) {
					internalSaveNames[i] = externalSaveNames[i];
					const internalSaveData = ConvertName(internalSaveNames[i]);
					data.set(internalSaveData, 2 + i * 39);
				}
			}

			gameData.Files.get('Saves').Files.set(1, DataReader.FromData(data));
		}

		return [name];
	}

	Load(gameData, savegameSerializer, saveSlot, totalSavegames) {
		const legacyGameData = gameData;

		if (!this.transferredFolderSaves && this.fileExists(this.savesPath)) {
			this.transferredFolderSaves = true;
			const folderSaveData = new GameData(GameData.LoadPreference.ForceExtracted, null, false);

			try {
				// Collect the savegame files from the storage (replacement for the folder).
				const folderFiles = new Map();
				for (const name of Files.AmigaSaveFiles.keys()) {
					const data = this.storage.get(combine(this.path, name));
					if (data != null)
						folderFiles.set(name, data);
				}

				folderSaveData.LoadFromFiles(folderFiles, true);

				const TransferFile = name => {
					if (folderSaveData.Files.has(name))
						return { Key: name, Value: folderSaveData.Files.get(name) };
					return null;
				};

				for (let i = 1; i <= totalSavegames; ++i) {
					const saveFiles = [];
					for (const saveFileName of SavegameManager.SaveFileNames) {
						const file = TransferFile(`${saveFolder(i)}/${saveFileName}`);
						if (file == null)
							break;
						saveFiles.push(file);
					}
					if (saveFiles.length === 5) {
						for (const saveFile of saveFiles)
							legacyGameData.Files.set(saveFile.Key, saveFile.Value);
					}
				}

				const saves = TransferFile('Saves');

				if (saves != null)
					legacyGameData.Files.set(saves.Key, saves.Value);
			}
			catch {
				// ignore
			}
		}

		const savegame = new Savegame();
		let savegameFiles;
		try {
			const ReadFromStorage = folder => {
				const fileReader = new FileReader();
				const ReadContainer = name => {
					const fullName = combine(folder, name);
					return fileReader.ReadRawFile(name, this.readFile(fullName));
				};
				const ReadFile = name => {
					return ReadContainer(name).Files.get(1);
				};
				const files = new SavegameInputFiles();
				files.SaveDataReader = ReadFile('Party_data.sav');
				files.PartyMemberDataReaders = ReadContainer('Party_char.amb');
				files.ChestDataReaders = ReadContainer('Chest_data.amb');
				files.MerchantDataReaders = ReadContainer('Merchant_data.amb');
				files.AutomapDataReaders = ReadContainer('Automap.amb');
				return files;
			};

			if (saveSlot === 99 && this.directoryExists(combine(this.path, 'Save.99'))) {
				const backupPath = combine(this.path, 'Save.99');
				savegameFiles = ReadFromStorage(backupPath);
			}
			else if (saveSlot > 10 && saveSlot <= totalSavegames) {
				if (this.directoryExists(combine(this.path, saveFolder(saveSlot)))) {
					const path = combine(this.path, saveFolder(saveSlot));
					savegameFiles = ReadFromStorage(path);
				}
				else {
					return null;
				}
			}
			else {
				savegameFiles = new SavegameInputFiles();
				savegameFiles.SaveDataReader = getValue(legacyGameData.Files, `${saveFolder(saveSlot)}/Party_data.sav`).Files.get(1);
				savegameFiles.PartyMemberDataReaders = getValue(legacyGameData.Files, `${saveFolder(saveSlot)}/Party_char.amb`);
				savegameFiles.ChestDataReaders = getValue(legacyGameData.Files, `${saveFolder(saveSlot)}/Chest_data.amb`);
				savegameFiles.MerchantDataReaders = getValue(legacyGameData.Files, `${saveFolder(saveSlot)}/Merchant_data.amb`);
				savegameFiles.AutomapDataReaders = getValue(legacyGameData.Files, `${saveFolder(saveSlot)}/Automap.amb`);
			}
		}
		catch (e) {
			if (!(e instanceof KeyNotFoundException))
				throw e;
			return null;
		}

		const initialPartyMemberReaders = legacyGameData.Files.get('Initial/Party_char.amb')
			?? legacyGameData.Files.get('Save.00/Party_char.amb') ?? null;

		savegameSerializer.Read(savegame, savegameFiles, getValue(legacyGameData.Files, 'Party_texts.amb'), initialPartyMemberReaders);

		return savegame;
	}

	/** Returns a Map<string, IFileContainer> (file name -> container) read from the storage. */
	GetSavegameFileContainers(saveSlot) {
		const path = combine(this.path, saveFolder(saveSlot));
		const fileReader = new FileReader();
		const ReadContainer = name => {
			return fileReader.ReadRawFile(name, this.readFile(combine(path, name)));
		};

		const result = new Map();
		for (const fileName of SavegameManager.SaveFileNames)
			result.set(fileName, ReadContainer(fileName));
		return result;
	}

	LoadInitial(gameData, savegameSerializer) {
		const legacyGameData = gameData;
		const savegame = new Savegame();
		let savegameFiles;

		const FromGameData = folder => {
			const prefix = folder == null ? '' : folder + '/';
			const files = new SavegameInputFiles();
			files.SaveDataReader = getValue(legacyGameData.Files, `${prefix}Party_data.sav`).Files.get(1);
			files.PartyMemberDataReaders = getValue(legacyGameData.Files, `${prefix}Party_char.amb`);
			files.ChestDataReaders = getValue(legacyGameData.Files, `${prefix}Chest_data.amb`);
			files.MerchantDataReaders = getValue(legacyGameData.Files, `${prefix}Merchant_data.amb`);
			files.AutomapDataReaders = getValue(legacyGameData.Files, `${prefix}Automap.amb`);
			return files;
		};

		try {
			savegameFiles = FromGameData('Initial');
		}
		catch {
			try {
				savegameFiles = FromGameData('Save.00');
			}
			catch {
				savegameFiles = FromGameData(null);
			}
		}

		const partyTextContainer = getValue(legacyGameData.Files, 'Party_texts.amb');
		savegameSerializer.Read(savegame, savegameFiles, partyTextContainer);
		return savegame;
	}

	HasCrashSavegame() { return this.directoryExists(combine(this.path, 'Save.99')); }

	SaveBackup(gameData, savegameSerializer, saveSlot) {
		if (gameData?.Files == null) // gameData is not ILegacyGameData
			return;

		const legacyGameData = gameData;

		try {
			const savegameFiles = new SavegameInputFiles();
			savegameFiles.SaveDataReader = getValue(legacyGameData.Files, `${saveFolder(saveSlot)}/Party_data.sav`).Files.get(1);
			savegameFiles.PartyMemberDataReaders = getValue(legacyGameData.Files, `${saveFolder(saveSlot)}/Party_char.amb`);
			savegameFiles.ChestDataReaders = getValue(legacyGameData.Files, `${saveFolder(saveSlot)}/Chest_data.amb`);
			savegameFiles.MerchantDataReaders = getValue(legacyGameData.Files, `${saveFolder(saveSlot)}/Merchant_data.amb`);
			savegameFiles.AutomapDataReaders = getValue(legacyGameData.Files, `${saveFolder(saveSlot)}/Automap.amb`);
			const oldSavegame = Savegame.Load(savegameSerializer, savegameFiles, null);
			const savegameOutFiles = savegameSerializer.Write(oldSavegame);
			this.SaveToPath(combine(this.path, 'backups'), savegameOutFiles, saveSlot, null);
		}
		catch {
			// ignore
		}
	}

	Save(gameData, savegameSerializer, saveSlot, name, savegame) {
		this.SaveBackup(gameData, savegameSerializer, saveSlot);
		const savegameFiles = savegameSerializer.Write(savegame);
		if (saveSlot <= 10) {
			[name] = this.WriteSavegameName(gameData, saveSlot, name, this.savesPath);
			this.SaveToGameData(gameData, savegameFiles, saveSlot);
		}
		this.SaveToPath(this.path, savegameFiles, saveSlot, saveSlot > 10 ? null : getValue(gameData.Files, 'Saves'));
	}

	SetActiveSavegame(gameData, slot) {
		if (slot < 1)
			throw new AmbermoonException(ExceptionScope.Application, 'Savegame slots must be 1-based.');

		if (slot <= 10) {
			let name = this.GetSavegameNames(gameData, 10)[0][slot - 1];
			[name] = this.WriteSavegameName(gameData, slot, name, this.savesPath);
			const savesWriter = new DataWriter();
			FileWriter.Write(savesWriter, getValue(gameData.Files, 'Saves'),
				LobCompression.LobType.Ambermoon, FileDictionaryCompression.None);
			this.storage.set(this.savesPath, savesWriter.ToArray());
		}
	}

	SaveCrashedGame(savegameSerializer, savegame) {
		const savegameFiles = savegameSerializer.Write(savegame);
		this.SaveToPath(this.path, savegameFiles, 99, null);
	}

	RemoveCrashedSavegame() {
		try {
			const directory = combine(this.path, 'Save.99');

			if (!this.directoryExists(directory))
				return false; // C#: DirectoryInfo.GetFiles throws for a missing directory

			for (const fileName of SavegameManager.SaveFileNames) {
				if (this.fileExists(combine(directory, fileName)))
					this.removeFile(combine(directory, fileName));
			}
			return true;
		}
		catch {
			return false;
		}
	}

	SaveToGameData(gameData, savegameFiles, saveSlot) {
		const legacyGameData = gameData;

		const WriteSingleFile = (name, writer) => {
			if (!legacyGameData.Files.has(name)) {
				legacyGameData.Files.set(name, FileReader.CreateRawFile(name, writer.ToArray()));
			}
			else {
				legacyGameData.Files.get(name).Files.set(1, DataReader.FromData(writer.ToArray()));
			}
		};

		const WriteFile = (name, writer, fileIndex) => {
			if (!legacyGameData.Files.has(name)) {
				legacyGameData.Files.set(name, FileReader.CreateRawContainer(name, new Map([[fileIndex, writer.ToArray()]])));
			}
			else {
				legacyGameData.Files.get(name).Files.set(fileIndex, DataReader.FromData(writer.ToArray()));
			}
		};

		const WriteFiles = (name, writers) => {
			for (const [key, value] of writers)
				WriteFile(name, value, key);
		};

		WriteSingleFile(`${saveFolder(saveSlot)}/Party_data.sav`, savegameFiles.SaveDataWriter);
		WriteFiles(`${saveFolder(saveSlot)}/Party_char.amb`, savegameFiles.PartyMemberDataWriters);
		WriteFiles(`${saveFolder(saveSlot)}/Chest_data.amb`, savegameFiles.ChestDataWriters);
		WriteFiles(`${saveFolder(saveSlot)}/Merchant_data.amb`, savegameFiles.MerchantDataWriters);
		WriteFiles(`${saveFolder(saveSlot)}/Automap.amb`, savegameFiles.AutomapDataWriters);
	}

	/**
	 * SaveToFileSystem(fileSystem, saveSlot, savegameSerializer, savegame) (public) or
	 * SaveToFileSystem(fileSystem, savegameFiles, saveSlot, savesContainer) (private).
	 */
	SaveToFileSystem(fileSystem, saveSlotOrSavegameFiles, savegameSerializerOrSaveSlot, savegameOrSavesContainer) {
		if (typeof saveSlotOrSavegameFiles === 'number') {
			const savegameFiles = savegameSerializerOrSaveSlot.Write(savegameOrSavesContainer);

			this.SaveToFileSystem(fileSystem, savegameFiles, saveSlotOrSavegameFiles, null);
			return;
		}

		this.SaveTo(dirName => fileSystem.CreateFolder(dirName), (name, data) => fileSystem.CreateFile(name, data),
			null, saveSlotOrSavegameFiles, savegameSerializerOrSaveSlot, savegameOrSavesContainer);
	}

	static LoadFromFileSystem(legacyGameData, fileSystem, saveSlot, savegameSerializer) {
		const fileReader = new FileReader();
		const ReadContainer = name => {
			const file = fileSystem.GetFile(name);
			const stream = file.Stream.GetReader();
			return fileReader.ReadFile(name, stream);
		};
		const ReadFile = name => {
			return ReadContainer(name).Files.get(1);
		};
		const savegameFiles = new SavegameInputFiles();
		savegameFiles.SaveDataReader = ReadFile(`${saveFolder(saveSlot)}/Party_data.sav`);
		savegameFiles.PartyMemberDataReaders = ReadContainer(`${saveFolder(saveSlot)}/Party_char.amb`);
		savegameFiles.ChestDataReaders = ReadContainer(`${saveFolder(saveSlot)}/Chest_data.amb`);
		savegameFiles.MerchantDataReaders = ReadContainer(`${saveFolder(saveSlot)}/Merchant_data.amb`);
		savegameFiles.AutomapDataReaders = ReadContainer(`${saveFolder(saveSlot)}/Automap.amb`);

		const savegame = new Savegame();
		const initialPartyMemberReaders = legacyGameData.Files.get('Initial/Party_char.amb')
			?? legacyGameData.Files.get('Save.00/Party_char.amb') ?? null;

		savegameSerializer.Read(savegame, savegameFiles, getValue(legacyGameData.Files, 'Party_texts.amb'), initialPartyMemberReaders);

		return savegame;
	}

	SaveTo(directoryCreator, fileWriter, basePath, savegameFiles, saveSlot, savesContainer) {
		const WriteFile = (name, writer) => {
			const fullPath = basePath == null ? name : combine(basePath, name);

			if (basePath != null)
				directoryCreator(getDirectoryName(fullPath));

			fileWriter(fullPath, writer.ToArray());
		};

		const WriteFiles = (name, writers) => {
			const output = new DataWriter();
			const filesData = new Map();
			for (const [key, value] of writers)
				filesData.set(key >>> 0, value.ToArray());
			FileWriter.WriteContainer(output, filesData, FileType.AMBR);
			fileWriter(basePath == null ? name : combine(basePath, name), output.ToArray());
		};

		WriteFile(`${saveFolder(saveSlot)}/Party_data.sav`, savegameFiles.SaveDataWriter);
		WriteFiles(`${saveFolder(saveSlot)}/Party_char.amb`, savegameFiles.PartyMemberDataWriters);
		WriteFiles(`${saveFolder(saveSlot)}/Chest_data.amb`, savegameFiles.ChestDataWriters);
		WriteFiles(`${saveFolder(saveSlot)}/Merchant_data.amb`, savegameFiles.MerchantDataWriters);
		WriteFiles(`${saveFolder(saveSlot)}/Automap.amb`, savegameFiles.AutomapDataWriters);

		if (savesContainer != null) {
			const savesWriter = new DataWriter();
			FileWriter.Write(savesWriter, savesContainer, LobCompression.LobType.Ambermoon, FileDictionaryCompression.None);
			fileWriter(basePath == null ? 'Saves' : this.savesPath, savesWriter.ToArray());
		}
	}

	SaveToPath(path, savegameFiles, saveSlot, savesContainer) {
		// Directory.CreateDirectory is not needed (no folders in the storage), File.WriteAllBytes -> storage.set
		this.SaveTo(dirName => { }, (name, data) => this.storage.set(name, data), path, savegameFiles, saveSlot, savesContainer);
	}
}
