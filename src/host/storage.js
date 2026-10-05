// Persistent key/value storage for the browser. All entries are loaded into memory at startup, so
// the game code can read and write synchronously (like files in the original); writes are mirrored
// to IndexedDB in the background.

const DB_VERSION = 1;

function openDb(name) {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(name, DB_VERSION);
		request.onupgradeneeded = () => request.result.createObjectStore('files');
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export class PersistentStorage {
	constructor(name) {
		this.name = name;
		this.entries = new Map();
		this.modified = new Map();
		this.db = null;
	}

	static async open(name) {
		const storage = new PersistentStorage(name);
		try {
			storage.db = await openDb(name);
			await new Promise((resolve, reject) => {
				const tx = storage.db.transaction('files', 'readonly');
				const store = tx.objectStore('files');
				const request = store.openCursor();
				request.onsuccess = () => {
					const cursor = request.result;
					if (!cursor)
						return resolve();
					const { data, time } = cursor.value;
					storage.entries.set(cursor.key, data);
					storage.modified.set(cursor.key, time);
					cursor.continue();
				};
				request.onerror = () => reject(request.error);
			});
		} catch (e) {
			console.warn(`IndexedDB storage '${name}' is not available, data is kept in memory only.`, e);
			storage.db = null;
		}
		return storage;
	}

	#write(key, value) {
		if (!this.db)
			return;
		try {
			const tx = this.db.transaction('files', 'readwrite');
			const store = tx.objectStore('files');
			if (value == null)
				store.delete(key);
			else
				store.put({ data: value, time: this.modified.get(key) }, key);
		} catch (e) {
			console.error('Storage write failed', e);
		}
	}

	get(name) {
		return this.entries.get(name) ?? null;
	}

	set(name, data) {
		if (data == null)
			return this.remove(name);
		const copy = data instanceof Uint8Array ? data.slice() : data;
		this.entries.set(name, copy);
		this.modified.set(name, Date.now());
		this.#write(name, copy);
	}

	remove(name) {
		this.entries.delete(name);
		this.modified.delete(name);
		this.#write(name, null);
	}

	list(prefix = '') {
		return [...this.entries.keys()].filter(k => k.startsWith(prefix));
	}

	lastModified(name) {
		return this.modified.get(name) ?? null;
	}

	/** Object storage for JSON settings ({ load(), save(object) } shape) */
	jsonView(name) {
		return {
			load: () => {
				const data = this.get(name);
				if (!data)
					return null;
				try {
					return JSON.parse(new TextDecoder().decode(data));
				} catch {
					return null;
				}
			},
			save: object => this.set(name, new TextEncoder().encode(JSON.stringify(object))),
		};
	}
}
