// Port of Ambermoon.net/Configuration.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
//
// Browser version: persistence uses an injected storage object { load(): object|null, save(object) }
// instead of JSON files (Newtonsoft.Json). The object passed to save() is a plain JSON compatible object
// with the same property names as the C# JSON file. File system / path logic is not ported (see TODO(port)).
import { Event, enumName, newArray } from '../../runtime.js';
import { EnumHelper } from '../Ambermoon.Common/EnumHelper.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { GameLanguage } from '../Ambermoon.Data.Common/IGameData.js';
import { WindowMode } from '../Ambermoon.Core/Render/IRenderView.js';
import { SaveOption, GraphicFilter, GraphicFilterOverlay, Effects, Movement3D } from '../Ambermoon.Core/ICoreConfiguration.js';
import { AdditionalSavegameSlots } from '../Ambermoon.Game/IConfiguration.js';
import { Game } from '../Ambermoon.Game/Game.js';

/** Current culture name (CultureInfo.CurrentCulture.Name) */
function getCultureName() {
	try {
		if (typeof navigator !== 'undefined' && navigator.language)
			return navigator.language;
		return Intl.DateTimeFormat().resolvedOptions().locale ?? null;
	} catch {
		return null;
	}
}

function getDefaultLanguage() {
	const l = getCultureName()?.toLowerCase();

	if (l == null)
		return GameLanguage.English;
	if (l.startsWith('de'))
		return GameLanguage.German;
	if (l.startsWith('fr'))
		return GameLanguage.French;
	if (l.startsWith('pl'))
		return GameLanguage.Polish;
	if (l.startsWith('cz'))
		return GameLanguage.Czech;
	return GameLanguage.English;
}

/** Properties which are serialized (in C# declaration order). Obsolete ones use NullValueHandling.Ignore. */
const SerializedProperties = Object.freeze([
	'UsePatcher', 'PatcherTimeout', 'UseProxyForPatcher', 'PatcherProxy', 'WindowX', 'WindowY', 'MonitorIndex',
	'Width', 'Height', 'FullscreenWidth', 'FullscreenHeight', 'Fullscreen', 'WindowMode', 'UseDataPath', 'DataPath',
	'ModPath', 'SaveOption', 'GameVersionIndex', 'LegacyMode', 'Music', 'Volume', 'ExternalMusic', 'ExternalMusicPath',
	'FastBattleMode', 'BattleSpeed', 'AutoBattleRounds', 'CacheMusic', 'AutoDerune', 'EnableCheats', 'ShowButtonTooltips',
	'ShowFantasyIntro', 'ShowIntro', 'UseGraphicFilter', 'GraphicFilter', 'GraphicFilterOverlay', 'Effects',
	'ShowPlayerStatsTooltips', 'ShowPyrdacorLogo', 'ShowAdvancedLogo', 'ShowThalionLogo', 'ShowFloor', 'ShowCeiling',
	'ShowFog', 'ExtendedSavegameSlots', 'AdditionalSavegameNames', 'ContinueSavegameSlot', 'AdditionalSavegameSlots',
	'ShowSaveLoadMessage', 'Movement3D', 'TurnWithArrowKeys', 'Language',
	// web port additions
	'Enhanced3D'
]);

const IgnoreWhenNull = new Set([
	'Fullscreen', 'FastBattleMode', 'CacheMusic', 'UseGraphicFilter', 'ShowThalionLogo', 'AdditionalSavegameNames', 'ContinueSavegameSlot'
]);

function slotsToObject(slots) {
	return {
		GameVersionName: slots.GameVersionName,
		BaseNames: slots.BaseNames == null ? null : [...slots.BaseNames],
		Names: slots.Names == null ? null : [...slots.Names],
		ContinueSavegameSlot: slots.ContinueSavegameSlot,
		LastSavesSync: slots.LastSavesSync
	};
}

function slotsFromObject(data) {
	if (data == null)
		return null;
	const slots = new AdditionalSavegameSlots();
	if ('GameVersionName' in data)
		slots.GameVersionName = data.GameVersionName;
	if ('BaseNames' in data)
		slots.BaseNames = data.BaseNames == null ? null : [...data.BaseNames];
	if ('Names' in data)
		slots.Names = data.Names == null ? null : [...data.Names];
	if (data.ContinueSavegameSlot != null)
		slots.ContinueSavegameSlot = data.ContinueSavegameSlot;
	if ('LastSavesSync' in data)
		slots.LastSavesSync = data.LastSavesSync == null ? null
			: (typeof data.LastSavesSync === 'number' ? data.LastSavesSync : Date.parse(data.LastSavesSync));
	return slots;
}

export class Configuration {
	static ConfigurationFileName = 'ambermoon.cfg';
	static ExternalSavegameFolder = 'external';

	static GetVersionSavegameFolder(gameVersion) {
		if (gameVersion.ExternalData)
			return Configuration.ExternalSavegameFolder;

		if (gameVersion.Info.toLowerCase().includes('advanced'))
			return `advanced_${enumName(GameLanguage, gameVersion.Language).toLowerCase()}`;

		return enumName(GameLanguage, gameVersion.Language).toLowerCase();
	}

	static GetAllPossibleSavegameFolders() {
		const folders = [Configuration.ExternalSavegameFolder];
		folders.push(...EnumHelper.GetValues(GameLanguage).map(l => enumName(GameLanguage, l).toLowerCase()));
		folders.push(...EnumHelper.GetValues(GameLanguage).map(l => `advanced_${enumName(GameLanguage, l).toLowerCase()}`));
		return folders;
	}

	constructor() {
		this.SaveRequested = new Event();
		this.FirstStart = false; // [JsonIgnore]
		this.IsMobile = false; // [JsonIgnore]

		this.UsePatcher = null;
		this.PatcherTimeout = null;
		this.UseProxyForPatcher = null;
		this.PatcherProxy = null;
		this.WindowX = null;
		this.WindowY = null;
		this.MonitorIndex = null;
		this.Width = null;
		this.Height = null;
		this.FullscreenWidth = null;
		this.FullscreenHeight = null;
		/** [Obsolete("Use BattleSpeed instead.")] */
		this.Fullscreen = null;
		this.WindowMode = WindowMode.Normal;
		this.UseDataPath = false;
		this.DataPath = Configuration.ExecutableDirectoryPath;
		this.ModPath = 'Mods';
		this.SaveOption = SaveOption.ProgramFolder;
		this.GameVersionIndex = -1;
		this.LegacyMode = false;
		this.Music = true;
		this.Volume = 100;
		this.ExternalMusic = false;
		this.ExternalMusicPath = 'music';
		/** [Obsolete("Use BattleSpeed instead.")] */
		this.FastBattleMode = null;
		this.BattleSpeed = 0;
		this.AutoBattleRounds = 10;
		/** [Obsolete("Music is no longer cached but streamed.")] */
		this.CacheMusic = null;
		this.AutoDerune = true;
		this.EnableCheats = false;
		this.ShowButtonTooltips = true;
		this.ShowFantasyIntro = true;
		this.ShowIntro = true;
		/** [Obsolete("Use GraphicFilter instead.")] */
		this.UseGraphicFilter = null;
		// Web port: the edge-directed pixel art scaler is the default for new configurations
		this.GraphicFilter = GraphicFilter.PixelArt;
		this.GraphicFilterOverlay = GraphicFilterOverlay.None;
		this.Effects = Effects.None;
		this.ShowPlayerStatsTooltips = true;
		this.ShowPyrdacorLogo = true;
		this.ShowAdvancedLogo = true;
		/** [Obsolete("Now the fantasy intro is shown instead.")] */
		this.ShowThalionLogo = null;
		this.ShowFloor = true;
		this.ShowCeiling = true;
		this.ShowFog = true;
		this.ExtendedSavegameSlots = true;
		/** [Obsolete("Use AdditionalSavegameSlots instead.")] */
		this.AdditionalSavegameNames = null;
		/** [Obsolete("Use AdditionalSavegameSlots instead.")] */
		this.ContinueSavegameSlot = null;
		/** AdditionalSavegameSlots[] */
		this.AdditionalSavegameSlots = null;
		this.ShowSaveLoadMessage = false;
		this.Movement3D = Movement3D.WASD;
		this.TurnWithArrowKeys = true;
		this.Language = getDefaultLanguage();
		// Web port: enhanced 3D rendering (smooth palette texture filtering, wall shading, smooth fog)
		this.Enhanced3D = true;
	}

	RequestSave() {
		this.SaveRequested.invoke();
	}

	/**
	 * TODO(port): No file system in the browser. Returns a virtual save path which is used as
	 * the name prefix for the savegame storage (see RemakeSavegameManager). createIfMissing is ignored.
	 */
	static GetSavePath(version, createIfMissing = true) {
		return `Saves/${version.replaceAll(' ', '_')}`;
	}

	/** TODO(port): macOS path migration is not needed in the browser (no-op). */
	static FixMacOSPaths() {
		// ignore
	}

	UpgradeAdditionalSavegameSlots() {
		if (this.AdditionalSavegameSlots != null)
			return;

		this.AdditionalSavegameSlots = Configuration.GetAllPossibleSavegameFolders().map(f => {
			const slots = new AdditionalSavegameSlots();
			slots.GameVersionName = f;
			slots.ContinueSavegameSlot = 0;
			slots.Names = newArray(Game.NumAdditionalSavegameSlots);
			return slots;
		});

		// Copy old savegame names to new format
		// Note: The amount of version slots is now dynamic but this upgrade is for older configs where it was fixed. So this is ok.
		if (this.AdditionalSavegameNames != null && this.GameVersionIndex >= 0 && this.GameVersionIndex < 3) {
			// "external" moved from slot 2 to 4
			const additionalSavegameSlot = this.AdditionalSavegameSlots[this.GameVersionIndex === 2 ? 4 : this.GameVersionIndex];

			additionalSavegameSlot.ContinueSavegameSlot = this.ContinueSavegameSlot ?? 0;

			for (let i = 0; i < Math.min(Game.NumAdditionalSavegameSlots, this.AdditionalSavegameNames.length); ++i)
				additionalSavegameSlot.Names[i] = this.AdditionalSavegameNames[i];
		}

		this.AdditionalSavegameNames = null;
		this.ContinueSavegameSlot = null;
	}

	GetOrCreateCurrentAdditionalSavegameSlots(gameVersionName) {
		if (this.AdditionalSavegameSlots == null)
			this.UpgradeAdditionalSavegameSlots();

		gameVersionName = gameVersionName.toLowerCase();

		let savegameSlots = this.AdditionalSavegameSlots.find(s => s.GameVersionName?.toLowerCase() === gameVersionName) ?? null;

		if (savegameSlots == null) {
			savegameSlots = new AdditionalSavegameSlots();
			savegameSlots.GameVersionName = gameVersionName;
			savegameSlots.ContinueSavegameSlot = 0;
			savegameSlots.Names = newArray(Game.NumAdditionalSavegameSlots);

			this.AdditionalSavegameSlots = [...this.AdditionalSavegameSlots, savegameSlots];
		}

		return savegameSlots;
	}

	/** TODO(port): No file system in the browser. */
	static FallbackConfigDirectory = '';

	/**
	 * The folder path where the bundle is located.
	 * TODO(port): No file system in the browser (always '').
	 */
	static get BundleDirectory() {
		return '';
	}

	// Some weird Mac OS behavior stored stuff in this folder...
	static BrokenMacBundleDirectory = '/Applications/Ambermoon.net.app/Contents/Resources/~/Library/Application Support/Ambermoon.net';

	/**
	 * The folder path where the bundle is located.
	 * TODO(port): No file system in the browser (always '').
	 */
	static get ReadonlyBundleDirectory() {
		return '';
	}

	/**
	 * Directory path where the executable is located.
	 * TODO(port): No file system in the browser (always '').
	 */
	static get ExecutableDirectoryPath() {
		return '';
	}

	/** Creates the JSON compatible object which C# would serialize (Newtonsoft.Json, enums as numbers). */
	ToObject() {
		const result = {};

		for (const name of SerializedProperties) {
			const value = this[name];

			if (value == null && IgnoreWhenNull.has(name))
				continue;

			if (name === 'AdditionalSavegameSlots')
				result[name] = value == null ? null : value.map(s => (s == null ? null : slotsToObject(s)));
			else if (Array.isArray(value))
				result[name] = [...value];
			else
				result[name] = value;
		}

		return result;
	}

	/** JsonConvert.DeserializeObject<Configuration>: returns null for null/invalid data. */
	static FromObject(data) {
		if (data == null || typeof data !== 'object' || Array.isArray(data))
			return null;

		const configuration = new Configuration();

		for (const name of SerializedProperties) {
			if (!(name in data))
				continue;

			const value = data[name];

			if (name === 'AdditionalSavegameSlots')
				configuration[name] = value == null ? null : value.map(s => slotsFromObject(s));
			else if (Array.isArray(value))
				configuration[name] = [...value];
			else
				configuration[name] = value;
		}

		return configuration;
	}

	/**
	 * C#: Configuration Load(string filename, Configuration defaultValue = null)
	 * @param {{ load(): object|null }} storage
	 */
	static Load(storage, defaultValue = null) {
		const data = storage?.load() ?? null;

		if (data == null) // File.Exists
			return defaultValue;

		let configuration = Configuration.FromObject(data);

		if (configuration == null) { // corrupt config
			console.log('Corrupted configuration detected. Creating a clean one.');

			configuration = defaultValue ?? new Configuration();
			configuration.FirstStart = false;

			try {
				const versionSavegameFolders = Configuration.GetAllPossibleSavegameFolders();
				const savegameSlots = configuration.AdditionalSavegameSlots = newArray(versionSavegameFolders.length);
				let versionIndex = 0;

				for (const savegameFolder of versionSavegameFolders) {
					// Ticks of last saving, slot index (1 .. 30)
					const mostRecentSavegameSlotOfVersion = [0, -1];
					const slots = savegameSlots[versionIndex] = new AdditionalSavegameSlots();
					slots.GameVersionName = savegameFolder;

					for (let i = 0; i < Game.NumAdditionalSavegameSlots; ++i)
						slots.Names[i] = '';

					// TODO(port): The C# code scans the save directories (GetSavePath(savegameFolder, false))
					// for "Save.XX" folders to restore savegame names and the most recent slot.
					// There is no file system in the browser, so this is skipped.

					slots.ContinueSavegameSlot = Math.max(0, mostRecentSavegameSlotOfVersion[1]);

					++versionIndex;
				}
			} catch {
				// ignore
			}
		}

		// Web port: configurations from before the graphics improvements get the new default filter once
		if (configuration != null && typeof data === 'object' && !('Enhanced3D' in data) && configuration.GraphicFilter === GraphicFilter.None && configuration.UseGraphicFilter !== true)
			configuration.GraphicFilter = GraphicFilter.PixelArt;

		if (configuration?.UseGraphicFilter === true && configuration.GraphicFilter === GraphicFilter.None)
			configuration.GraphicFilter = GraphicFilter.Blur; // matches the old filter

		configuration.UseGraphicFilter = null;

		if (configuration?.FastBattleMode === true && configuration.BattleSpeed === 0)
			configuration.BattleSpeed = 100;
		else {
			if (configuration.BattleSpeed % 10 !== 0)
				configuration.BattleSpeed += 10 - configuration.BattleSpeed % 10;
			configuration.BattleSpeed = Util.Limit(0, configuration.BattleSpeed, 100);
		}

		configuration.FastBattleMode = null;

		if (configuration.ShowThalionLogo === true && !configuration.ShowFantasyIntro)
			configuration.ShowFantasyIntro = true;

		configuration.ShowThalionLogo = null;

		if (configuration.Fullscreen === true && configuration.WindowMode === WindowMode.Normal)
			configuration.WindowMode = WindowMode.Fullscreen;

		configuration.ShowThalionLogo = null;

		if (configuration.ShowFog && (!configuration.ShowFloor || !configuration.ShowCeiling))
			configuration.ShowFog = false;

		return configuration;
	}

	/**
	 * C#: void Save(string filename)
	 * @param {{ save(data: object): void }} storage
	 */
	Save(storage) {
		// not used anymore
		this.UseGraphicFilter = null;
		this.FastBattleMode = null;
		this.CacheMusic = null;
		this.ShowThalionLogo = null;
		this.AdditionalSavegameNames = null;
		this.ContinueSavegameSlot = null;

		storage.save(this.ToObject());
	}
}
