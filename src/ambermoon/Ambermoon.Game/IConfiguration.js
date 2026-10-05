// Port of Ambermoon.Game/IConfiguration.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { arrayCopy, newArray } from '../runtime.js';
import { Game } from './Game.js';

// IAdditionalSaveSlotProvider and IConfiguration are pure interfaces (not ported).

export class AdditionalSavegameSlots {
	constructor() {
		this.GameVersionName = '';
		this.BaseNames = newArray(Game.NumBaseSavegameSlots);
		this.Names = newArray(Game.NumAdditionalSavegameSlots);
		this.ContinueSavegameSlot = 0;
		/** DateTime? (ms number or null) */
		this.LastSavesSync = null;
	}

	/**
	 * Note: There is no file system in the browser. The JSON is read from localStorage with the path as key
	 * (C# reads the file with File.ReadAllText and Newtonsoft.Json).
	 */
	static Load(path) {
		let json = null;

		try {
			json = globalThis.localStorage?.getItem(path) ?? null;
		} catch {
			json = null;
		}

		const data = json == null ? null : JSON.parse(json);

		if (data == null)
			return null;

		const result = Object.assign(new AdditionalSavegameSlots(), data);

		result.BaseNames = AdditionalSavegameSlots.EnsureArraySize(data.BaseNames ?? null, Game.NumBaseSavegameSlots);
		result.Names = AdditionalSavegameSlots.EnsureArraySize(data.Names ?? null, Game.NumAdditionalSavegameSlots);

		return result;
	}

	static EnsureArraySize(array, requiredSize) {
		if (array == null || array.length === 0)
			return newArray(requiredSize);

		if (array.length >= requiredSize)
			return array;

		const resized = newArray(requiredSize);
		arrayCopy(array, resized, array.length);
		return resized;
	}

	/** Note: Writes the JSON (indented like Formatting.Indented) to localStorage with the path as key. */
	Save(path) {
		const json = JSON.stringify({
			GameVersionName: this.GameVersionName,
			BaseNames: this.BaseNames,
			Names: this.Names,
			ContinueSavegameSlot: this.ContinueSavegameSlot,
			LastSavesSync: this.LastSavesSync,
		}, null, 2);

		globalThis.localStorage?.setItem(path, json);
	}
}
