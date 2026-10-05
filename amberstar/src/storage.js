// Stores the selected original data files in IndexedDB so they only need to be selected once.
const DB_NAME = 'amberstar-web';
const STORE = 'files';

function openDb() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function storeFiles(files) {
	try {
		const db = await openDb();
		await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			const store = tx.objectStore(STORE);
			store.clear();
			for (const [name, data] of files)
				store.put(data, name);
			tx.oncomplete = resolve;
			tx.onerror = () => reject(tx.error);
		});
	} catch (e) {
		console.warn('Could not store data files', e);
	}
}

export async function loadStoredFiles() {
	try {
		const db = await openDb();
		return await new Promise((resolve, reject) => {
			const files = new Map();
			const tx = db.transaction(STORE, 'readonly');
			const req = tx.objectStore(STORE).openCursor();
			req.onsuccess = () => {
				const cursor = req.result;
				if (cursor) {
					files.set(cursor.key, new Uint8Array(cursor.value));
					cursor.continue();
				} else {
					resolve(files.size ? files : null);
				}
			};
			req.onerror = () => reject(req.error);
		});
	} catch {
		return null;
	}
}

export async function clearStoredFiles() {
	try {
		const db = await openDb();
		await new Promise(resolve => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).clear();
			tx.oncomplete = resolve;
			tx.onerror = resolve;
		});
	} catch {
		// ignore
	}
}
