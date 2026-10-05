// Small helpers (ports of Amber.Common Rect/MathUtil and SortedStack).

export function limit(min, value, max) {
	return value < min ? min : value > max ? max : value;
}

export function rect(x, y, w, h) {
	return { x, y, w, h };
}

export function rectContains(r, p) {
	return p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
}

/** Random integer in [min, max) like System.Random.Next(min, max) */
export function random(min, max) {
	if (max === undefined) {
		max = min;
		min = 0;
	}
	if (max <= min)
		return min;
	return min + Math.floor(Math.random() * (max - min));
}

export class SortedStack {
	constructor() {
		this.entries = []; // sorted by key, stable
	}

	clear() { this.entries = []; }

	push(key, value) {
		let i = this.entries.length;
		while (i > 0 && this.entries[i - 1].key > key)
			i--;
		this.entries.splice(i, 0, { key, value });
	}

	pop(maxKey) {
		if (this.entries.length !== 0 && this.entries[0].key <= maxKey)
			return this.entries.shift().value;
		return null;
	}

	remove(filter) {
		const removed = [];
		this.entries = this.entries.filter(e => {
			if (filter(e.value)) {
				removed.push(e.value);
				return false;
			}
			return true;
		});
		return removed;
	}
}

export function pad(n, length, ch = '0') {
	return String(n).padStart(length, ch);
}

export class EventEmitter {
	constructor() { this.handlers = []; }
	add(h) { this.handlers.push(h); }
	remove(h) { const i = this.handlers.indexOf(h); if (i >= 0) this.handlers.splice(i, 1); }
	invoke(...args) { for (const h of [...this.handlers]) h(...args); }
	get count() { return this.handlers.length; }
}
