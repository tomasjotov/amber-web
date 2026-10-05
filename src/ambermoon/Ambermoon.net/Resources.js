// Port of Ambermoon.net/Resources.Designer.cs (+ Resources.resx) from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// The embedded resources of the C# assembly are plain files in amber-web/assets/ (same file names as in Ambermoon.net/Resources).
// Call `await Resources.load(baseUrl)` once before anything uses them. In Node tests the properties can be assigned manually.

/** Property name -> file name (see Resources.resx) */
const ResourceFiles = Object.freeze({
	IngameFont: 'IngameFont.dat',
	WindowIcon: 'windowIcon.raw',
	Logo: 'logo.pyr',
	Song: 'song.pyr',
	Advanced: 'advanced.pyr',
	Borders256: 'borders256.pyr',
	Flags: 'flags.pyr',
	LoadingBarLeft: 'lbar_left',
	LoadingBarRight: 'lbar_right',
	LoadingBarMid: 'lbar_mid',
	LoadingBarRed: 'lbar_red',
	LoadingBarYellow: 'lbar_yellow',
	LoadingBarGreen: 'lbar_green'
});

export class Resources {
	/** @type {Uint8Array|null} */ static IngameFont = null;
	/** @type {Uint8Array|null} */ static WindowIcon = null;
	/** @type {Uint8Array|null} */ static Logo = null;
	/** @type {Uint8Array|null} */ static Song = null;
	/** @type {Uint8Array|null} */ static Advanced = null;
	/** @type {Uint8Array|null} */ static Borders256 = null;
	/** @type {Uint8Array|null} */ static Flags = null;
	/** @type {Uint8Array|null} */ static LoadingBarLeft = null;
	/** @type {Uint8Array|null} */ static LoadingBarRight = null;
	/** @type {Uint8Array|null} */ static LoadingBarMid = null;
	/** @type {Uint8Array|null} */ static LoadingBarRed = null;
	/** @type {Uint8Array|null} */ static LoadingBarYellow = null;
	/** @type {Uint8Array|null} */ static LoadingBarGreen = null;

	static Files = ResourceFiles;

	/**
	 * Loads all resources via fetch.
	 * @param {string} baseUrl URL of the assets folder (e.g. 'assets/' or new URL('../assets/', import.meta.url).href)
	 * @param {string[]|null} names Optional subset of property names to load (default: all)
	 */
	static async load(baseUrl = 'assets/', names = null) {
		if (baseUrl && !baseUrl.endsWith('/'))
			baseUrl += '/';
		const entries = Object.entries(ResourceFiles).filter(([name]) => !names || names.includes(name));
		await Promise.all(entries.map(async ([name, file]) => {
			const response = await fetch(baseUrl + file);
			if (!response.ok)
				throw new Error(`Unable to load resource ${file} (${response.status})`);
			Resources[name] = new Uint8Array(await response.arrayBuffer());
		}));
	}

	/** Assigns resources manually (e.g. in Node tests): Resources.set({ IngameFont: data, ... }) */
	static set(values) {
		for (const [name, data] of Object.entries(values)) {
			if (!(name in ResourceFiles))
				throw new Error(`Unknown resource ${name}`);
			Resources[name] = data instanceof Uint8Array ? data : new Uint8Array(data);
		}
	}
}
