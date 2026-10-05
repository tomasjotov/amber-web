// Port of Ambermoon.net/RemakeSavegameManager.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
//
// Browser version: there is no file system. All files are kept in an injected storage object
//   { get(name) -> Uint8Array|null, set(name, Uint8Array), remove(name), list() -> string[] }
// and optionally lastModified(name) -> number|null (ms since epoch) which replaces FileInfo.LastWriteTimeUtc.
// File names are virtual paths: '<path>/Saves', '<path>/Saves.cfg' etc.
import { isNullOrWhiteSpace } from '../../runtime.js';
import { SavegameManager } from '../Ambermoon.Data.Legacy/SavegameManager.js';
import { AdditionalSavegameSlots } from '../Ambermoon.Game/IConfiguration.js';
import { GameCore } from '../Ambermoon.Core/GameCore.js';
import { Game } from '../Ambermoon.Game/Game.js';

/** Path.Combine */
function combinePath(path, name) {
	if (!path)
		return name;
	return path.endsWith('/') || path.endsWith('\\') ? path + name : path + '/' + name;
}

/** Path.GetFileName */
function getFileName(path) {
	const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
	return index < 0 ? path : path.substring(index + 1);
}

/** AdditionalSavegameSlots.Load(path) via the storage (JSON as UTF-8 bytes). Returns null if the content is null. */
function loadSavegameSlots(storage, name) {
	const data = storage.get(name);
	if (data == null)
		throw new Error(`File not found: ${name}`);
	const json = new TextDecoder().decode(data);
	const parsed = JSON.parse(json);

	if (parsed == null)
		return null;

	const result = new AdditionalSavegameSlots();
	result.GameVersionName = parsed.GameVersionName ?? null;
	if (parsed.ContinueSavegameSlot != null)
		result.ContinueSavegameSlot = parsed.ContinueSavegameSlot;
	result.LastSavesSync = parsed.LastSavesSync == null
		? null
		: (typeof parsed.LastSavesSync === 'number' ? parsed.LastSavesSync : Date.parse(parsed.LastSavesSync));
	result.BaseNames = AdditionalSavegameSlots.EnsureArraySize(parsed.BaseNames ?? null, GameCore.NumBaseSavegameSlots);
	result.Names = AdditionalSavegameSlots.EnsureArraySize(parsed.Names ?? null, Game.NumAdditionalSavegameSlots);

	return result;
}

/** additionalSavegameSlots.Save(path) via the storage (indented JSON as UTF-8 bytes) */
function saveSavegameSlots(storage, name, slots) {
	const json = JSON.stringify({
		GameVersionName: slots.GameVersionName,
		BaseNames: slots.BaseNames,
		Names: slots.Names,
		ContinueSavegameSlot: slots.ContinueSavegameSlot,
		LastSavesSync: slots.LastSavesSync
	}, null, 2);
	storage.set(name, new TextEncoder().encode(json));
}

export class RemakeSavegameManager extends SavegameManager {
	/**
	 * @param {string} path Virtual save path (prefix of the storage names), e.g. Configuration.GetSavePath(...)
	 * @param {Configuration} configuration
	 * @param {{ get(name: string): Uint8Array|null, set(name: string, data: Uint8Array): void, remove(name: string): void, list(): string[], lastModified?(name: string): number|null }} storage
	 */
	constructor(path, configuration, storage) {
		// Note: the storage is also passed to the base class (the browser SavegameManager needs one as well).
		super(storage, path);
		this.storage = storage;
		this.configuration = configuration;
		this.gameVersionName = getFileName(path);
		this.savesPath = combinePath(path, 'Saves');
		this.savegameNamesPath = combinePath(path, 'Saves.cfg');
		this.additionalSavegameSlots = null;
	}

	get AdditionalSavegameSlots() {
		this.additionalSavegameSlots ??= this.GetOrCreateAdditionalSavegameNames(this.gameVersionName);

		return this.additionalSavegameSlots;
	}

	get ContinueSavegameSlot() {
		return this.AdditionalSavegameSlots.ContinueSavegameSlot;
	}

	GetOrCreateAdditionalSavegameNames(gameVersionName) {
		// Note: It is no longer necessary to provide the gameVersionName here, but for
		// compatibility reasons, we keep it this way.

		try {
			if (this.storage.get(this.savegameNamesPath) == null) {
				this.additionalSavegameSlots = this.configuration.GetOrCreateCurrentAdditionalSavegameSlots(gameVersionName);
				saveSavegameSlots(this.storage, this.savegameNamesPath, this.additionalSavegameSlots);
			} else {
				this.additionalSavegameSlots = loadSavegameSlots(this.storage, this.savegameNamesPath)
					?? this.configuration.GetOrCreateCurrentAdditionalSavegameSlots(gameVersionName);
			}
		} catch {
			this.additionalSavegameSlots = this.configuration.GetOrCreateCurrentAdditionalSavegameSlots(gameVersionName);
		}

		return this.additionalSavegameSlots;
	}

	/** C#: string[] GetSavegameNames(IGameData gameData, out int current, int totalSavegames) -> [names, current] */
	GetSavegameNames(gameData, totalSavegames) {
		const additionalSavegameSlots = this.AdditionalSavegameSlots;
		// TODO(port): FileInfo.LastWriteTimeUtc -> optional storage.lastModified(name). Without it the
		// legacy Saves file is treated as not newer than the stored names.
		const lastLegacyFileUpdate = this.storage.get(this.savesPath) != null
			? (this.storage.lastModified?.(this.savesPath) ?? null)
			: null;
		const lastSavesSync = additionalSavegameSlots.LastSavesSync;
		const savegameNames = new Array(GameCore.NumBaseSavegameSlots).fill(null);
		let current;

		if (lastLegacyFileUpdate != null && (lastSavesSync == null || lastSavesSync < lastLegacyFileUpdate)) {
			// Legacy savegame names are newer, use them.
			let legacyNames;
			[legacyNames, current] = super.GetSavegameNames(gameData, totalSavegames);

			for (let i = 0; i < GameCore.NumBaseSavegameSlots; i++) {
				if (isNullOrWhiteSpace(legacyNames[i])) {
					savegameNames[i] = additionalSavegameSlots.BaseNames[i] ?? '';
				} else {
					savegameNames[i] = legacyNames[i];
				}
			}

			if (current === 0)
				current = additionalSavegameSlots.ContinueSavegameSlot;
		} else {
			current = additionalSavegameSlots.ContinueSavegameSlot;

			let legacyNames;
			[legacyNames, current] = super.GetSavegameNames(gameData, totalSavegames);

			for (let i = 0; i < GameCore.NumBaseSavegameSlots; i++) {
				savegameNames[i] = additionalSavegameSlots.BaseNames[i] ?? legacyNames[i];
			}
		}

		if (current < 0)
			current = 0;
		else if (current > 10)
			current = 10;

		if (current !== 0 && isNullOrWhiteSpace(savegameNames[current - 1]))
			current = 0;

		return [savegameNames, current];
	}

	RequestSave(savegameManager, gameData) {
		try {
			try {
				if (this.additionalSavegameSlots.BaseNames.every(name => isNullOrWhiteSpace(name))) {
					// Never saved a base savegame?
					const [baseNames] = savegameManager.GetSavegameNames(gameData, GameCore.NumBaseSavegameSlots);

					for (let i = 0; i < GameCore.NumBaseSavegameSlots; i++) {
						this.additionalSavegameSlots.BaseNames[i] = baseNames[i];
					}
				}
			} catch {
				// ignore
			}

			if (this.additionalSavegameSlots != null)
				saveSavegameSlots(this.storage, this.savegameNamesPath, this.additionalSavegameSlots);
		} catch {
			// Fallback to old system where savenames are stored in config

			const configAdditionalSavegameSlots = this.configuration.GetOrCreateCurrentAdditionalSavegameSlots(this.additionalSavegameSlots.GameVersionName);

			configAdditionalSavegameSlots.ContinueSavegameSlot = this.additionalSavegameSlots.ContinueSavegameSlot;
			configAdditionalSavegameSlots.Names = this.additionalSavegameSlots.Names;

			this.configuration.RequestSave();
		}
	}

	/** C#: void WriteSavegameName(IGameData gameData, int slot, ref string name, string externalSavesPath) -> [name] */
	WriteSavegameName(gameData, slot, name, externalSavesPath) {
		[name] = super.WriteSavegameName(gameData, slot, name, externalSavesPath);

		const additionalSavegameSlots = this.AdditionalSavegameSlots;

		if (slot >= 1 && slot <= 10) {
			const lastSavesSyncBackup = additionalSavegameSlots.LastSavesSync;

			if (additionalSavegameSlots.BaseNames.length === 0 || !additionalSavegameSlots.BaseNames.some(n => !isNullOrWhiteSpace(n))) {
				[additionalSavegameSlots.BaseNames] = super.GetSavegameNames(gameData, GameCore.NumBaseSavegameSlots);
			}

			additionalSavegameSlots.BaseNames[slot - 1] = name;
			additionalSavegameSlots.LastSavesSync = Date.now();

			try {
				if (additionalSavegameSlots != null)
					saveSavegameSlots(this.storage, this.savegameNamesPath, additionalSavegameSlots);
			} catch {
				additionalSavegameSlots.LastSavesSync = lastSavesSyncBackup;
			}
		}

		return [name];
	}
}
