// Port of Ambermoon.Data.Legacy/GameData.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import {
	ArgumentException, FileNotFoundException, KeyNotFoundException, NotSupportedException,
	first, getValue, lastOrDefault
} from '../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { Position } from '../Ambermoon.Common/Position.js';
import { GameDataSource, GameLanguage, GameLanguageExtensions } from '../Ambermoon.Data.Common/IGameData.js';
import { Graphic, GraphicInfo, GraphicFormat } from '../Ambermoon.Data.Common/Graphic.js';
import { TravelType } from '../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { TravelGraphicInfo } from '../Ambermoon.Data.Common/TravelGraphicInfo.js';
import { TextDictionary } from '../Ambermoon.Data.Common/TextDictionary.js';
import { Places } from '../Ambermoon.Data.Common/Places.js';
import { Character2DAnimationInfo } from '../Ambermoon.Data.Common/Render/Character2DAnimationInfo.js';
import { LobCompression } from './Compression/LobCompression.js';
import { ADFReader } from './Serialization/ADFReader.js';
import { AmigaExecutable } from './Serialization/AmigaExecutable.js';
import { DataReader } from './Serialization/DataReader.js';
import { DataWriter } from './Serialization/DataWriter.js';
import { FileReader } from './Serialization/FileReader.js';
import { FileWriter } from './Serialization/FileWriter.js';
import { FileType } from './Serialization/FileType.js';
import { FileDictionaryCompression } from './Serialization/FileDictionaryCompression.js';
import { GraphicReader } from './Serialization/GraphicReader.js';
import { IntroData } from './Serialization/IntroData.js';
import { FantasyIntroData } from './Serialization/FantasyIntroData.js';
import { OutroData } from './Serialization/OutroData.js';
import { MapReader } from './Serialization/MapReader.js';
import { TilesetReader } from './Serialization/TilesetReader.js';
import { LabdataReader } from './Serialization/LabdataReader.js';
import { PlacesReader } from './Serialization/PlacesReader.js';
import { TextDictionaryReader } from './Serialization/TextDictionaryReader.js';
import { TextReader } from './Serialization/TextReader.js';
import { SongManager } from './Audio/SongManager.js';
import { CharacterManager } from './Characters/CharacterManager.js';
import { ExecutableData } from './ExecutableData/ExecutableData.js';
import { Files } from './Files.js';
import { GraphicProvider } from './GraphicProvider.js';
import { FontProvider } from './FontProvider.js';
import { DataNameProvider } from './DataNameProvider.js';
import { LightEffectProvider } from './LightEffectProvider.js';
import { MapManager } from './MapManager.js';

// Dictionary.Add (throws on duplicate keys)
function add(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

/** Normalizes a file name for the case-insensitive lookup in LoadFromFiles. */
function normalizeFileName(name) {
	return name.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '').toLowerCase();
}

/** Creates a case-insensitive lookup function for a Map<string, Uint8Array> of files. */
function createFileLookup(files) {
	const index = new Map();
	for (const [name, data] of files)
		index.set(normalizeFileName(name), data);
	return name => index.get(normalizeFileName(name)) ?? null;
}

const LoadPreference = Object.freeze({
	PreferAdf: 0,
	PreferExtracted: 1,
	ForceAdf: 2,
	ForceExtracted: 3
});

const VersionPreference = Object.freeze({
	Any: 0,
	Pre114: 1,
	Post114: 2
});

// Note: GameData.ILogger is a pure interface (Append(text), AppendLine(text)) and not ported.

class FileContainerWriter {
	constructor() {
		this.Name = null;
		this.Header = 0;
		this.Files = null; // Map<number, IDataWriter>
		this.Changed = false;
	}

	static GetFileType(writer, noCompression) {
		let fileType = writer.Header >>> 0;

		if (noCompression) {
			if (fileType === (FileType.AMNP >>> 0) ||
				fileType === (FileType.AMPC >>> 0))
				fileType = FileType.AMBR;
			else if (fileType === (FileType.LOB >>> 0) ||
				fileType === (FileType.VOL1 >>> 0))
				fileType = FileType.None;
		}

		return fileType;
	}

	static AsContainer(writer, noCompression) {
		const files = new Map();
		for (const [key, value] of writer.Files)
			files.set(key, GameDataWriter.WriterToReader(value));
		return FileReader.Create(writer.Name, FileContainerWriter.GetFileType(writer, noCompression), files);
	}

	static FromContainer(container) {
		const writer = new FileContainerWriter();
		writer.Name = container.Name;
		writer.Header = container.Header;
		writer.Files = new Map();
		for (const [key, value] of container.Files)
			writer.Files.set(key, GameDataWriter.ReaderToWriter(value));
		return writer;
	}
}

class GameDataWriter {
	static FileContainerWriter = FileContainerWriter;

	static ReaderToWriter(reader) {
		const oldPosition = reader.Position;
		reader.Position = 0;

		const writer = new DataWriter(reader.ReadToEnd());

		reader.Position = oldPosition;

		return writer;
	}

	static WriterToReader(writer) {
		return DataReader.FromData(writer.ToArray());
	}

	constructor(gameData) {
		this.files = new Map();

		for (const [key, value] of gameData.Files)
			add(this.files, key, FileContainerWriter.FromContainer(value));
	}

	get Files() { return this.files; }

	AddFile(container, index, writer) {
		add(getValue(this.files, container).Files, index, writer);
		getValue(this.files, container).Changed = true;
	}

	RemoveFile(container, index) {
		getValue(this.files, container).Files.delete(index);
		getValue(this.files, container).Changed = true;
	}

	FileExists(container, index) {
		return getValue(this.files, container).Files.has(index);
	}

	ReplaceFile(container, index, writer) {
		getValue(this.files, container).Files.set(index, writer);
		getValue(this.files, container).Changed = true;
	}
}

class GameDataInfo {
	constructor() {
		this.Version = null;
		this.Language = null;
		this.Advanced = false;
	}
}

const VersionRegex = /[vV]?([0-9]+[.][0-9]+)/g;

export class GameData {
	static LoadPreference = LoadPreference;
	static VersionPreference = VersionPreference;
	static GameDataWriter = GameDataWriter;
	static GameDataInfo = GameDataInfo;

	constructor(loadPreference = LoadPreference.PreferExtracted, logger = null, stopAtFirstError = true,
		versionPreference = VersionPreference.Any) {
		this.Files = new Map();
		this.Dictionaries = new Map();
		this.StationaryImageInfos = new Map([
			[TravelType.Horse, GameData.createGraphicInfo(32, 22)],
			[TravelType.Raft, GameData.createGraphicInfo(32, 11)],
			[TravelType.Ship, GameData.createGraphicInfo(48, 34)],
			[TravelType.SandLizard, GameData.createGraphicInfo(48, 21)],
			[TravelType.SandShip, GameData.createGraphicInfo(48, 39)]
		]);
		this.loadedDisks = new Map();
		this.travelGraphicInfos = [];
		this.ExecutableData = null;
		this.Places = null;
		this.GraphicInfoProvider = null;
		this.CharacterManager = null;
		this.FontProvider = null;
		this.DataNameProvider = null;
		this.LightEffectProvider = null;
		this.MapManager = null;
		this.SongManager = null;
		this.IntroData = null;
		this.FantasyIntroData = null;
		this.OutroData = null;
		this.TravelGraphics = [];
		this.Loaded = false;
		this.GameDataSource = GameDataSource.Memory;
		this.Version = 'Unknown';
		this.Language = GameLanguage.English;
		this.Advanced = false;
		this.Dictionary = null;

		this.loadPreference = loadPreference;
		this.versionPreference = versionPreference;
		this.log = logger;
		this.stopAtFirstError = stopAtFirstError;
	}

	static createGraphicInfo(width, height) {
		const info = new GraphicInfo();
		info.Width = width;
		info.Height = height;
		info.GraphicFormat = GraphicFormat.Palette5Bit;
		info.Alpha = true;
		return info;
	}

	get CursorHotspots() {
		return this.ExecutableData?.Cursors.Entries.map(c => new Position(c.HotspotX - 1, c.HotspotY - 1)) ?? null;
	}

	get ItemManager() { return this.ExecutableData?.ItemManager ?? null; }

	/** Returns a KeyValuePair as { Key: GameLanguage, Value: IDataReader }. */
	GetDictionary() {
		if (this.Dictionaries.has(this.Language))
			return { Key: this.Language, Value: this.Dictionaries.get(this.Language) };

		const [firstKey, firstValue] = first(this.Dictionaries);

		return { Key: firstKey ?? GameLanguage.English, Value: firstValue };
	}

	/**
	 * In C# this searches the folder for ADF files. Here `folder` is the Map<string, Uint8Array>
	 * of all files (see LoadFromFiles). Returns the matching file name (key) or null.
	 */
	static FindDiskFile(folder, disk) {
		if (folder == null)
			return null;

		disk = disk.toLowerCase();

		for (const adfFile of folder.keys()) {
			if (!adfFile.toLowerCase().endsWith('.adf'))
				continue;

			const baseName = adfFile.replace(/\\/g, '/').split('/').pop();
			const filename = baseName.substring(0, baseName.length - 4).toLowerCase();

			if (filename.includes('amb') && (filename.endsWith(disk) || filename.endsWith(`(${disk})`) || filename.endsWith(`[${disk}]`)))
				return adfFile;
		}

		return null;
	}

	static IsDictionary(file) { return file.toLowerCase().startsWith('dictionary.') || file.toLowerCase() === 'dict.amb'; }

	LoadFromFileSystem(fileSystem) {
		this.GameDataSource = fileSystem.MemoryFileSystem ? GameDataSource.Memory : GameDataSource.Unknown;
		const fileReader = new FileReader();

		const LoadFile = name => {
			const file = fileSystem.GetFile(name);

			if (file == null || file.Stream == null)
				return null;

			const reader = file.Stream.GetReader();
			return fileReader.ReadFile(name, reader);
		};
		const CheckFileExists = name => {
			return fileSystem.GetFile(name) != null;
		};
		this.Load(LoadFile, null, CheckFileExists);
	}

	LoadFromMemoryZip(stream, fallbackGameDataProvider = null, optionalAdditionalFiles = null, progressTracker = null,
		ignoreMusic = false) {
		// TODO(port): Loading from a zip archive needs a (synchronous) zip/inflate implementation which is not available.
		// Extract the zip to a Map<string, Uint8Array> and use LoadFromFiles instead.
		throw new NotSupportedException('LoadFromMemoryZip is not supported in the browser port. Use LoadFromFiles.');
	}

	/**
	 * Saves all file containers.
	 * Note: There is no file system. `targetFolder` is any object with a `set(name, data)` method
	 * (e.g. a Map<string, Uint8Array> or the savegame storage object) which receives the file data.
	 */
	Save(targetFolder, preSaveAction = null, saveOnlyChangedContainers = false, finishAction = null,
		noCompression = false) {
		const gameDataWriter = new GameDataWriter(this);

		preSaveAction?.(gameDataWriter);

		for (const [key, value] of gameDataWriter.Files) {
			if (saveOnlyChangedContainers && !value.Changed)
				continue;

			const dataWriter = new DataWriter();
			const container = FileContainerWriter.AsContainer(value, noCompression);
			FileWriter.Write(dataWriter, container, LobCompression.LobType.Ambermoon, FileDictionaryCompression.None);

			targetFolder.set(key, dataWriter.ToArray());
		}

		finishAction?.();
	}

	/**
	 * GetInfo(exeProvider, textAmbProvider) (private): providers are functions returning an IDataReader.
	 * GetInfo(folder, loadPreference = PreferExtracted, versionPreference = Any) (public):
	 *   Note: `folder` is a Map<string, Uint8Array> of all files instead of a folder path (no file system).
	 */
	static GetInfo(exeProviderOrFolder, textAmbProviderOrLoadPreference, versionPreference = VersionPreference.Any) {
		if (typeof exeProviderOrFolder === 'function' || typeof textAmbProviderOrLoadPreference === 'function')
			return GameData.GetInfoFromProviders(exeProviderOrFolder, textAmbProviderOrLoadPreference);

		const folder = exeProviderOrFolder;
		const loadPreference = textAmbProviderOrLoadPreference ?? LoadPreference.PreferExtracted;
		const getData = createFileLookup(folder ?? new Map());
		const possibleSources = ['Text.amb', 'AM2_CPU', 'AM2_BLIT'];

		function GetFirstReader(readerProvider) {
			for (let i = 0; i < possibleSources.length; ++i) {
				const reader = readerProvider(possibleSources[i]);

				if (reader != null)
					return { Key: i, Value: reader };
			}

			return null;
		}

		function GetFirstFileReader() {
			return GetFirstReader(file => {
				const data = getData(file);
				if (data == null)
					return null;
				if (file === 'Text.amb')
					return new FileReader().ReadRawFile(file, data).Files.get(1);
				return DataReader.FromData(data);
			});
		}

		function GetFirstDiskFileReader() {
			const diskFile = GameData.FindDiskFile(folder, 'A');

			if (diskFile == null)
				return null;

			// Note: ADFReader.ReadADF takes a Stream in C#. Here the raw ADF bytes (Uint8Array) are passed.
			const adf = ADFReader.ReadADF(folder.get(diskFile), versionPreference);

			return GetFirstReader(file => {
				if (adf.has(file)) {
					const data = adf.get(file);
					if (file === 'Text.amb')
						return new FileReader().ReadRawFile(file, data).Files.get(1);
					return DataReader.FromData(data);
				}

				return null;
			});
		}

		function GetInfo(...providers) {
			for (const provider of providers) {
				const reader = provider?.();

				if (reader != null) {
					if (reader.Key === 0)
						return GameData.GetInfoFromProviders(null, () => reader.Value);
					else
						return GameData.GetInfoFromProviders(() => reader.Value, null);
				}
			}

			throw new AmbermoonException(ExceptionScope.Data, 'Incomplete game data.');
		}

		if (loadPreference === LoadPreference.ForceExtracted) {
			return GetInfo(GetFirstFileReader);
		}
		else if (loadPreference === LoadPreference.ForceAdf) {
			return GetInfo(GetFirstDiskFileReader);
		}
		else if (loadPreference === LoadPreference.PreferAdf) {
			return GetInfo(GetFirstDiskFileReader, GetFirstFileReader);
		}
		else {
			return GetInfo(GetFirstFileReader, GetFirstDiskFileReader);
		}
	}

	/** The private C# overload GetInfo(Func<IDataReader> exeProvider, Func<IDataReader> textAmbProvider). */
	static GetInfoFromProviders(exeProvider, textAmbProvider) {
		const info = new GameDataInfo();
		const textAmb = textAmbProvider?.() ?? null;

		if (textAmb != null) {
			const oldPosition = textAmb.Position;

			try {
				textAmb.Position = textAmb.Size - 1;

				while (textAmb.Position !== 0) {
					const b = textAmb.PeekByte();

					if (b === 0 || b >= 0x20) {
						--textAmb.Position;
					}
					else {
						--textAmb.Position;
						const versionStringLength = textAmb.ReadByte() * 4;
						const languageStringLength = textAmb.ReadByte() * 4;
						const versionString = textAmb.ReadString(versionStringLength).replace(/\0+$/, '');
						const versionMatch = lastOrDefault([...versionString.matchAll(VersionRegex)]);
						if (versionMatch == null)
							info.Version = '1.0';
						else
							info.Version = versionMatch[1];
						info.Advanced = versionString.toLowerCase().includes('adv');
						const languageString = textAmb.ReadString(languageStringLength).replace(/\0+$/, '');
						const parts = languageString.trim().split(' ');
						info.Language = parts[parts.length - 1];
						break;
					}
				}
			}
			finally {
				textAmb.Position = oldPosition;
			}
		}
		else {
			const exe = exeProvider();
			const oldPosition = exe.Position;

			try {
				const hunks = AmigaExecutable.Read(exe);
				const hunk = first(hunks, h => h.Type === AmigaExecutable.HunkType.Code);
				const reader = DataReader.FromData(hunk.Data);
				reader.Position = 6;
				const versionString = reader.ReadNullTerminatedString();
				const versionMatch = lastOrDefault([...versionString.matchAll(VersionRegex)]);
				if (versionString == null)
					info.Version = '1.0';
				else
					info.Version = versionMatch[1]; // Note: Like in C# this throws if there is no match.
				info.Advanced = versionString.toLowerCase().includes('adv');
				const languageString = reader.ReadNullTerminatedString();
				const parts = languageString.trim().split(' ');
				info.Language = parts[parts.length - 1];
			}
			finally {
				exe.Position = oldPosition;
			}
		}

		return info;
	}

	/**
	 * Loads the game data from memory (browser replacement for Load(folderPath)).
	 * @param {Map<string, Uint8Array>} files All files of an extracted 'Amberfiles' folder. Keys are the file names
	 *   (relative paths for sub folders like 'Save.00/Party_data.sav' or 'Initial/Party_char.amb'; '\' is accepted too).
	 *   The lookup is case-insensitive. ADF disk files (e.g. 'ambermoon_a.adf') in the map are used as fallback
	 *   like in C# (depends on the ADFReader port accepting a Uint8Array).
	 * @param {boolean} savesOnly
	 */
	LoadFromFiles(files, savesOnly = false) {
		this.Loaded = false;
		this.GameDataSource = GameDataSource.Unknown;

		if (files == null) {
			if (this.stopAtFirstError)
				throw new FileNotFoundException('Given data folder does not exist.');

			return;
		}

		const getData = createFileLookup(files);
		const fileReader = new FileReader();
		const fileLoader = name => {
			const data = getData(name);
			if (data == null)
				throw new FileNotFoundException(`Could not find file '${name}'.`);
			return fileReader.ReadRawFile(name, data);
		};
		const diskLoader = disk => {
			const diskFile = GameData.FindDiskFile(files, disk);

			if (diskFile == null)
				return null;

			// Note: ADFReader.ReadADF takes a Stream in C#. Here the raw ADF bytes (Uint8Array) are passed.
			return ADFReader.ReadADF(files.get(diskFile), this.versionPreference);
		};
		const fileExistChecker = name => getData(name) != null;
		this.Load(fileLoader, diskLoader, fileExistChecker, savesOnly);
	}

	/**
	 * Load(folderPath, savesOnly = false) (public) or
	 * Load(fileLoader, diskLoader, fileExistChecker, savesOnly, optionalAdditionalFiles, progressTracker, ignoreMusic) (private).
	 *
	 * Note: There is no file system in the browser. If the first argument is a Map<string, Uint8Array>
	 * this is the same as LoadFromFiles(files, savesOnly).
	 */
	Load(fileLoader, diskLoader, fileExistChecker, savesOnly = false, optionalAdditionalFiles = null,
		progressTracker = null, ignoreMusic = false) {
		if (typeof fileLoader !== 'function') {
			if (fileLoader instanceof Map) {
				this.LoadFromFiles(fileLoader, diskLoader ?? false);
				return;
			}
			// TODO(port): Loading from a folder path is not possible without a file system.
			throw new NotSupportedException('Load(folderPath) is not supported in the browser port. Use LoadFromFiles.');
		}

		const ambermoonFiles = new Map(savesOnly ? Files.AmigaSaveFiles : Files.AmigaFiles);

		if (optionalAdditionalFiles != null) {
			for (const [key, value] of optionalAdditionalFiles)
				add(ambermoonFiles, key, value);
		}

		const fileReader = new FileReader();
		let foundNoDictionary = true;

		if (this.versionPreference === VersionPreference.Post114) {
			for (const file of Files.Removed114Files)
				ambermoonFiles.delete(file);
		}

		if (this.versionPreference !== VersionPreference.Pre114) {
			for (const [key, value] of Files.New114Files)
				add(ambermoonFiles, key, value);
		}

		let dictAmbLoaded = false;
		let progress = 0.0;
		const progressPerFile = (savesOnly ? 1.0 : 0.45) / ambermoonFiles.size;
		// If not only saves are loaded a lot of the time is needed after the files are loaded for image loading etc.

		progressTracker?.(progress);

		const HandleFileLoaded = (file, fromFiles) => {
			if (fromFiles) {
				this.GameDataSource = this.GameDataSource === GameDataSource.ADF || this.GameDataSource === GameDataSource.ADFAndLegacyFiles
					? GameDataSource.ADFAndLegacyFiles
					: GameDataSource.LegacyFiles;
			}
			else {
				this.GameDataSource = this.GameDataSource === GameDataSource.LegacyFiles || this.GameDataSource === GameDataSource.ADFAndLegacyFiles
					? GameDataSource.ADFAndLegacyFiles
					: GameDataSource.ADF;
			}

			this.log?.AppendLine('succeeded');

			if (GameData.IsDictionary(file)) {
				if (file.toLowerCase() === 'dict.amb') {
					// Language is replaced later
					add(this.Dictionaries, GameLanguage.English, getValue(this.Files, file).Files.get(1));
					dictAmbLoaded = true;
				}
				else {
					const parts = file.toLowerCase().split('.');
					add(this.Dictionaries, GameLanguageExtensions.ToGameLanguage(parts[parts.length - 1]), getValue(this.Files, file).Files.get(1));
				}

				foundNoDictionary = false;
			}

			progress += progressPerFile;
			progressTracker?.(progress);
		};

		const HandleFileNotFound = (file, disk) => {
			progress += progressPerFile;
			progressTracker?.(progress);

			if (optionalAdditionalFiles?.has(file) === true)
				return; // Don't error on missing optional files

			if (this.log != null) {
				this.log.AppendLine('failed');
				this.log.AppendLine(` -> Unable to find file '${file}'.`);
			}

			// We only need 1 dictionary, no savegames and only AM2_CPU but not AM2_BLIT.
			if (GameData.IsDictionary(file) || disk === 'J' || file === 'AM2_BLIT' || file === 'Keymap' || file.startsWith('Initial/'))
				return;

			if (this.stopAtFirstError) {
				if (this.versionPreference !== VersionPreference.Post114 &&
					Files.New114Files.has(file))
					return;

				throw new FileNotFoundException(`Unable to find file '${file}'.`);
			}
		};

		for (const [name, ambermoonFileDisk] of ambermoonFiles) {
			if (this.log != null)
				this.log.Append(`Trying to load file '${name}' ... `);

			// prefer direct files but also allow loading ADF disks
			if (this.loadPreference === LoadPreference.PreferExtracted && fileExistChecker(name)) {
				add(this.Files, name, fileLoader(name));
				HandleFileLoaded(name, true);
			}
			else if (this.loadPreference === LoadPreference.ForceExtracted) {
				if (fileExistChecker(name)) {
					add(this.Files, name, fileLoader(name));
					HandleFileLoaded(name, true);
				}
				else {
					const newName = Files.Renamed114Files.get(name);
					if (this.versionPreference !== VersionPreference.Pre114 &&
						newName !== undefined &&
						fileExistChecker(newName)) {
						// Don't add it here, as it should be part of the file list anyway
						continue;
					}
					else {
						HandleFileNotFound(name, ambermoonFileDisk);
					}
				}
			}
			else {
				// load from disk
				const disk = ambermoonFileDisk;

				if (!this.loadedDisks.has(disk)) {
					const loadedDisk = diskLoader?.(disk) ?? null;

					if (loadedDisk != null)
						add(this.loadedDisks, disk, loadedDisk);
				}

				const value = this.loadedDisks.get(disk);

				if (value === undefined || !value.has(name)) {
					let newName = Files.Renamed114Files.get(name);
					if (this.versionPreference !== VersionPreference.Pre114 &&
						newName !== undefined &&
						this.loadedDisks.has(disk) &&
						this.loadedDisks.get(disk).has(newName)) {
						// Don't add it here, as it should be part of the file list anyway
						continue;
					}

					// file not found
					if (this.loadPreference === LoadPreference.ForceAdf) {
						if (this.log != null) {
							this.log.AppendLine('failed');
							this.log.AppendLine(` -> Unabled to find ADF disk file with letter '${disk}'. Try to rename your ADF file to 'ambermoon_${disk}.adf'.`);
						}

						if (this.stopAtFirstError)
							throw new FileNotFoundException(`Unabled to find ADF disk file with letter '${disk}'. Try to rename your ADF file to 'ambermoon_${disk}.adf'.`);
					}

					if (this.loadPreference === LoadPreference.PreferAdf) {
						if (!fileExistChecker(name)) {
							newName = Files.Renamed114Files.get(name);
							if (this.versionPreference !== VersionPreference.Pre114 &&
								newName !== undefined &&
								fileExistChecker(newName)) {
								// Don't add it here, as it should be part of the file list anyway
								continue;
							}
							else {
								HandleFileNotFound(name, disk);
							}
						}
						else {
							add(this.Files, name, fileLoader(name));
							HandleFileLoaded(name, true);
						}
					}
					else if (this.loadPreference === LoadPreference.PreferExtracted) {
						newName = Files.Renamed114Files.get(name);
						if (this.versionPreference !== VersionPreference.Pre114 &&
							newName !== undefined &&
							fileExistChecker(newName)) {
							// Don't add it here, as it should be part of the file list anyway
							continue;
						}
						else {
							HandleFileNotFound(name, disk);
						}
					}
				}
				else {
					this.GameDataSource = this.GameDataSource === GameDataSource.LegacyFiles ? GameDataSource.ADFAndLegacyFiles : GameDataSource.ADF;
					add(this.Files, name, fileReader.ReadRawFile(name, value.get(name)));
					HandleFileLoaded(name, false);
				}
			}
		}

		if (savesOnly) {
			progressTracker?.(1.0);
			this.Loaded = true;
			return;
		}

		if (foundNoDictionary && this.stopAtFirstError) {
			throw new FileNotFoundException('Unable to find any dictionary file.');
		}

		this.LoadTravelGraphics();
		// We assume 1% of time for this
		progress += 0.01;
		progressTracker?.(progress);

		try {
			const textAmb = this.Files.get('Text.amb');
			let exe;
			if (textAmb !== undefined) {
				const info = GameData.GetInfoFromProviders(null, () => textAmb.Files.get(1));
				this.Version = info.Version;
				this.Language = GameLanguageExtensions.ToGameLanguage(info.Language);
				this.Advanced = info.Advanced;
			}
			else if ((exe = this.Files.get('AM2_CPU')) !== undefined || (exe = this.Files.get('AM2_BLIT')) !== undefined) {
				const info = GameData.GetInfoFromProviders(() => exe.Files.get(1), null);
				this.Version = info.Version;
				this.Language = GameLanguageExtensions.ToGameLanguage(info.Language);
				this.Advanced = info.Advanced;
			}

			if (dictAmbLoaded && this.Language !== GameLanguage.English) {
				this.Dictionaries.set(this.Language, getValue(this.Dictionaries, GameLanguage.English));
				this.Dictionaries.delete(GameLanguage.English);
			}
		}
		catch {
			// ignore
		}
		finally {
			// We assume 1% of time for this
			progress += 0.01;
			progressTracker?.(progress);
		}

		const TryLoad = provider => {
			try {
				return provider();
			}
			catch (e) {
				if (this.stopAtFirstError)
					throw e;

				return null;
			}
		};

		this.ExecutableData = TryLoad(() => ExecutableData.FromGameData(this));
		// We assume 3% of time for this
		progress += 0.03;
		progressTracker?.(progress);

		if (this.ExecutableData?.FileList == null && this.stopAtFirstError)
			throw new AmbermoonException(ExceptionScope.Data, 'Incomplete game data. AM2_CPU is missing.');

		// Now we load 13 things. Each has usually a different load duration.
		// We have 0.5f (50%) or progress left.
		// These values express the progress per following step.
		// It is based on some example duration measurement.
		const progresses = [
			0.06679695, 0.02982927, 0.00666224, 0.04767520,
			0.13528821, 0.00020068, 0.00008975, 0.00004560,
			0.00008313, 0.26092917, 0.04355856, 0.00019003,
			0.00029546
		];
		let progressIndex = 0;
		const UpdateProgress = () => {
			progress += progresses[progressIndex++];
			progressTracker?.(progress);
		};

		this.IntroData = TryLoad(() => new IntroData(this));
		UpdateProgress();
		this.FantasyIntroData = TryLoad(() => new FantasyIntroData(this));
		UpdateProgress();
		this.OutroData = TryLoad(() => new OutroData(this));
		UpdateProgress();
		const additionalPalettes = [];
		if (this.IntroData?.IntroPalettes != null)
			additionalPalettes.push(...this.IntroData.IntroPalettes);
		if (this.OutroData?.OutroPalettes != null)
			additionalPalettes.push(...this.OutroData.OutroPalettes);
		if (this.FantasyIntroData?.FantasyIntroPalettes != null)
			additionalPalettes.push(...this.FantasyIntroData.FantasyIntroPalettes);
		this.GraphicInfoProvider = TryLoad(() => new GraphicProvider(this, this.ExecutableData, additionalPalettes));
		UpdateProgress();
		this.CharacterManager = TryLoad(() => new CharacterManager(this));
		UpdateProgress();
		const objTexts = this.Files.get('Object_texts.amb');
		if (this.ExecutableData?.ItemManager != null && objTexts !== undefined) {
			for (const [key, value] of objTexts.Files)
				this.ExecutableData.ItemManager.AddTexts(key, TextReader.ReadTexts(value));
		}
		UpdateProgress();
		this.FontProvider = TryLoad(() => new FontProvider(this.ExecutableData));
		UpdateProgress();
		this.DataNameProvider = TryLoad(() => new DataNameProvider(this.ExecutableData));
		UpdateProgress();
		this.LightEffectProvider = TryLoad(() => new LightEffectProvider(this.ExecutableData));
		UpdateProgress();
		this.MapManager = TryLoad(() => new MapManager(this, new MapReader(), new TilesetReader(), new LabdataReader(), this.stopAtFirstError));
		UpdateProgress();
		this.SongManager = ignoreMusic ? null : TryLoad(() => new SongManager(this));
		UpdateProgress();
		this.Dictionary = TryLoad(() => TextDictionary.Load(new TextDictionaryReader(), this.GetDictionary()));
		UpdateProgress();
		this.Places = TryLoad(() => Places.Load(new PlacesReader(), getValue(this.Files, 'Place_data').Files.get(1)));
		UpdateProgress();

		this.Loaded = true;
	}

	LoadTravelGraphics() {
		// Travel gfx stores graphics with a header:
		// uword NumberOfHorizontalSprites (a sprite has a width of 16 pixels)
		// uword Height (in pixels)
		// uword XOffset (in pixels relative to drawing position)
		// uword YOffset (in pixels relative to drawing position)
		let container;

		try {
			container = getValue(this.Files, 'Travel_gfx.amb');
		}
		catch (e) {
			if (!(e instanceof KeyNotFoundException))
				throw e;

			if (this.stopAtFirstError)
				throw new FileNotFoundException('Unable to find travel graphics.');
			else
				return;
		}

		const graphicReader = new GraphicReader();
		const graphicInfo = new GraphicInfo();
		graphicInfo.GraphicFormat = GraphicFormat.Palette5Bit;
		graphicInfo.Alpha = true;

		for (const [, reader] of container.Files) {
			reader.Position = 0;

			const LoadGraphic = () => {
				const graphic = new Graphic();
				graphicReader.ReadGraphic(graphic, reader, graphicInfo);
				return graphic;
			};

			for (let direction = 0; direction < 4; ++direction) {
				const numSprites = reader.ReadWord();
				graphicInfo.Height = reader.ReadWord();
				graphicInfo.Width = numSprites * 16;
				const xOffset = reader.ReadWord();
				const yOffset = reader.ReadWord();

				const travelGraphicInfo = new TravelGraphicInfo();
				travelGraphicInfo.Width = graphicInfo.Width >>> 0;
				travelGraphicInfo.Height = graphicInfo.Height >>> 0;
				travelGraphicInfo.OffsetX = xOffset;
				travelGraphicInfo.OffsetY = yOffset;
				this.travelGraphicInfos.push(travelGraphicInfo);
				this.TravelGraphics.push(LoadGraphic());
			}
		}
	}

	GetTravelGraphicInfo(type, direction) {
		return this.travelGraphicInfos[type * 4 + direction];
	}

	get PlayerAnimationInfo() {
		const info = new Character2DAnimationInfo();
		info.FrameWidth = 16;
		info.FrameHeight = 32;
		info.StandFrameIndex = 0;
		info.SitFrameIndex = 12;
		info.SleepFrameIndex = 16;
		info.NumStandFrames = 3;
		info.NumSitFrames = 1;
		info.NumSleepFrames = 1;
		info.TicksPerFrame = 0;
		info.NoDirections = false;
		info.IgnoreTileType = false;
		info.UseTopSprite = true;
		return info;
	}
}

export { LoadPreference as GameData_LoadPreference, VersionPreference as GameData_VersionPreference, GameDataWriter as GameData_GameDataWriter };
