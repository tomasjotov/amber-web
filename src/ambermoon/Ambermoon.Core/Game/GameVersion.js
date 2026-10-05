// Port of Ambermoon.Core/Game/GameVersion.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Game version and language

export class GameVersion {
	constructor() {
		/** @type {string} (required) */
		this.Version = null;
		/** GameLanguage */
		this.Language = 0;
		/** @type {string} (required) */
		this.Info = null;
		/** Features (flags) */
		this.Features = 0;
		this.MergeWithPrevious = false;
		this.ExternalData = false;
		/** @type {() => IGameData} (required) */
		this.DataProvider = null;
	}

	static RemakeReleaseDate = '11-08-2026';
}
