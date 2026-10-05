// Runtime helpers for the C# -> JavaScript port of Ambermoon.net (see PORTING.md).
// Everything here mimics .NET behaviour that JavaScript lacks.

// ---------------- integers ----------------

export const toByte = v => v & 0xff;
export const toSByte = v => (v << 24) >> 24;
export const toUShort = v => v & 0xffff;
export const toShort = v => (v << 16) >> 16;
export const toInt = v => v | 0;
export const toUInt = v => v >>> 0;
/** C# integer division (truncates towards zero) */
export const idiv = (a, b) => {
	if (b === 0)
		throw new DivideByZeroException();
	return Math.trunc(a / b);
};
/** C# % on integers keeps the sign of the dividend like JS, so plain % is fine. */

// ---------------- exceptions ----------------

export class Exception extends Error {
	constructor(message = '', innerException = null) {
		super(message);
		this.name = this.constructor.name;
		this.Message = message;
		this.InnerException = innerException;
	}
}
export class ArgumentException extends Exception { }
export class ArgumentNullException extends ArgumentException { }
export class ArgumentOutOfRangeException extends ArgumentException { }
export class InvalidOperationException extends Exception { }
export class NotSupportedException extends Exception { }
export class NotImplementedException extends Exception { }
export class IndexOutOfRangeException extends Exception { }
export class KeyNotFoundException extends Exception { }
export class DivideByZeroException extends Exception { }
export class EndOfStreamException extends Exception { }
export class FileNotFoundException extends Exception { }

// ---------------- events / delegates ----------------

/** C# event: `Foo += h` -> `Foo.add(h)`, `Foo -= h` -> `Foo.remove(h)`, `Foo?.Invoke(a)` -> `Foo.invoke(a)` */
export class Event {
	constructor() {
		this.handlers = [];
	}

	add(handler) {
		if (handler)
			this.handlers.push(handler);
	}

	remove(handler) {
		const index = this.handlers.lastIndexOf(handler);
		if (index >= 0)
			this.handlers.splice(index, 1);
	}

	clear() {
		this.handlers = [];
	}

	get hasHandlers() { return this.handlers.length !== 0; }

	/** Returns the result of the last handler (like a multicast delegate). */
	invoke(...args) {
		let result;
		for (const handler of this.handlers.slice())
			result = handler(...args);
		return result;
	}
}

// ---------------- partial classes ----------------

/**
 * Copies all members (methods, getters/setters, static members) of the part classes into the target class.
 * Field initializers of a part go into a static method `initFields(instance)` of the part, which the
 * main constructor calls via `initPartFields(this, parts)`.
 */
export function applyPartials(target, parts) {
	for (const part of parts) {
		for (const name of Object.getOwnPropertyNames(part.prototype)) {
			if (name === 'constructor')
				continue;
			if (Object.prototype.hasOwnProperty.call(target.prototype, name))
				throw new Error(`Partial class member ${target.name}.${name} defined twice (${part.name})`);
			Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(part.prototype, name));
		}
		for (const name of Object.getOwnPropertyNames(part)) {
			if (['length', 'name', 'prototype', 'initFields'].includes(name))
				continue;
			Object.defineProperty(target, name, Object.getOwnPropertyDescriptor(part, name));
		}
	}
}

export function initPartFields(instance, parts) {
	for (const part of parts)
		part.initFields?.(instance);
}

// ---------------- enums ----------------

/** enumName(Color, 3) -> 'Red' (like Enum.ToString / Enum.GetName); flag combinations are joined with ', ' */
export function enumName(enumObject, value) {
	for (const [name, v] of Object.entries(enumObject))
		if (v === value)
			return name;
	if (typeof value === 'number' && value !== 0) {
		const names = [];
		let rest = value;
		for (const [name, v] of Object.entries(enumObject)) {
			if (v !== 0 && (value & v) === v && (rest & v) !== 0) {
				names.push(name);
				rest &= ~v;
			}
		}
		if (rest === 0 && names.length)
			return names.join(', ');
	}
	return String(value);
}

export const enumValues = enumObject => Object.values(enumObject);
export const enumNames = enumObject => Object.keys(enumObject);
export const enumIsDefined = (enumObject, value) => Object.values(enumObject).includes(value);
/** Enum.Parse */
export function enumParse(enumObject, name, ignoreCase = false) {
	for (const [n, v] of Object.entries(enumObject))
		if (ignoreCase ? n.toLowerCase() === name.toLowerCase() : n === name)
			return v;
	throw new ArgumentException(`Unknown enum value ${name}`);
}
export const hasFlag = (value, flag) => (value & flag) === flag;

// ---------------- collections ----------------

/** List.Remove */
export function removeItem(array, item) {
	const index = array.indexOf(item);
	if (index < 0)
		return false;
	array.splice(index, 1);
	return true;
}

/** List.RemoveAll */
export function removeAll(array, predicate) {
	let removed = 0;
	for (let i = array.length - 1; i >= 0; i--) {
		if (predicate(array[i])) {
			array.splice(i, 1);
			removed++;
		}
	}
	return removed;
}

/** List.Insert / InsertRange */
export const insertAt = (array, index, ...items) => array.splice(index, 0, ...items);
/** List.RemoveAt / RemoveRange */
export const removeAt = (array, index, count = 1) => array.splice(index, count);

/** Enumerable.First */
export function first(iterable, predicate = null) {
	for (const item of iterable)
		if (!predicate || predicate(item))
			return item;
	throw new InvalidOperationException('Sequence contains no matching element');
}

/** Enumerable.FirstOrDefault (default: null) */
export function firstOrDefault(iterable, predicate = null, defaultValue = null) {
	for (const item of iterable)
		if (!predicate || predicate(item))
			return item;
	return defaultValue;
}

export function last(array, predicate = null) {
	for (let i = array.length - 1; i >= 0; i--)
		if (!predicate || predicate(array[i]))
			return array[i];
	throw new InvalidOperationException('Sequence contains no matching element');
}

export function lastOrDefault(array, predicate = null, defaultValue = null) {
	for (let i = array.length - 1; i >= 0; i--)
		if (!predicate || predicate(array[i]))
			return array[i];
	return defaultValue;
}

export function single(iterable, predicate = null) {
	let found = false;
	let result;
	for (const item of iterable) {
		if (!predicate || predicate(item)) {
			if (found)
				throw new InvalidOperationException('Sequence contains more than one matching element');
			found = true;
			result = item;
		}
	}
	if (!found)
		throw new InvalidOperationException('Sequence contains no matching element');
	return result;
}

/** Enumerable.Count with predicate */
export function count(iterable, predicate = null) {
	let n = 0;
	for (const item of iterable)
		if (!predicate || predicate(item))
			n++;
	return n;
}

export function sum(iterable, selector = x => x) {
	let s = 0;
	for (const item of iterable)
		s += selector(item);
	return s;
}

/** Enumerable.Max (throws on empty like .NET) */
export function max(iterable, selector = x => x) {
	let result;
	let any = false;
	for (const item of iterable) {
		const v = selector(item);
		if (!any || v > result)
			result = v;
		any = true;
	}
	if (!any)
		throw new InvalidOperationException('Sequence contains no elements');
	return result;
}

export function min(iterable, selector = x => x) {
	let result;
	let any = false;
	for (const item of iterable) {
		const v = selector(item);
		if (!any || v < result)
			result = v;
		any = true;
	}
	if (!any)
		throw new InvalidOperationException('Sequence contains no elements');
	return result;
}

export function maxBy(iterable, selector) {
	let best = null;
	let bestValue;
	let any = false;
	for (const item of iterable) {
		const v = selector(item);
		if (!any || v > bestValue) {
			best = item;
			bestValue = v;
		}
		any = true;
	}
	return best;
}

export function minBy(iterable, selector) {
	let best = null;
	let bestValue;
	let any = false;
	for (const item of iterable) {
		const v = selector(item);
		if (!any || v < bestValue) {
			best = item;
			bestValue = v;
		}
		any = true;
	}
	return best;
}

export function average(iterable, selector = x => x) {
	let s = 0;
	let n = 0;
	for (const item of iterable) {
		s += selector(item);
		n++;
	}
	if (n === 0)
		throw new InvalidOperationException('Sequence contains no elements');
	return s / n;
}

const compareKeys = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Stable OrderBy / ThenBy: orderBy(array, [key1, desc?], ...) where each key is either a function
 * or [function, true] for descending. Returns a new array.
 */
export function orderBy(iterable, ...keys) {
	const items = [...iterable].map((item, index) => ({ item, index }));
	const selectors = keys.map(k => (Array.isArray(k) ? { fn: k[0], desc: !!k[1] } : { fn: k, desc: false }));
	items.sort((a, b) => {
		for (const { fn, desc } of selectors) {
			const c = compareKeys(fn(a.item), fn(b.item));
			if (c !== 0)
				return desc ? -c : c;
		}
		return a.index - b.index;
	});
	return items.map(i => i.item);
}

export const orderByDescending = (iterable, key) => orderBy(iterable, [key, true]);

/** Enumerable.Distinct (by value for primitives, by reference for objects; optional key selector = DistinctBy) */
export function distinct(iterable, keySelector = null) {
	const seen = new Set();
	const result = [];
	for (const item of iterable) {
		const key = keySelector ? keySelector(item) : item;
		if (!seen.has(key)) {
			seen.add(key);
			result.push(item);
		}
	}
	return result;
}

/** Enumerable.GroupBy -> array of { Key, items } (items is an array) */
export function groupBy(iterable, keySelector) {
	const groups = new Map();
	for (const item of iterable) {
		const key = keySelector(item);
		if (!groups.has(key))
			groups.set(key, []);
		groups.get(key).push(item);
	}
	return [...groups].map(([Key, items]) => Object.assign(items, { Key }));
}

/** Enumerable.ToDictionary -> Map */
export function toDictionary(iterable, keySelector, valueSelector = x => x) {
	const map = new Map();
	for (const item of iterable) {
		const key = keySelector(item);
		if (map.has(key))
			throw new ArgumentException('An item with the same key has already been added.');
		map.set(key, valueSelector(item));
	}
	return map;
}

/** Enumerable.Range */
export const range = (start, n) => Array.from({ length: Math.max(0, n) }, (_, i) => start + i);
/** Enumerable.Repeat / new T[n] filled */
export const repeat = (value, n) => Array.from({ length: Math.max(0, n) }, () => value);
/** new T[n] for reference types (nulls) or numbers (0) */
export const newArray = (n, fill = null) => new Array(Math.max(0, n)).fill(fill);
/** jagged/2D: new T[a][] etc. */
export const newArray2D = (a, b, fill = null) => Array.from({ length: a }, () => newArray(b, fill));

export function sequenceEqual(a, b) {
	if (a === b)
		return true;
	if (!a || !b || a.length !== b.length)
		return false;
	for (let i = 0; i < a.length; i++)
		if (a[i] !== b[i])
			return false;
	return true;
}

/** Dictionary.TryGetValue -> [found, value] */
export function tryGetValue(map, key) {
	return map.has(key) ? [true, map.get(key)] : [false, null];
}

/** Dictionary indexer get (throws KeyNotFoundException like .NET) */
export function getValue(map, key) {
	if (!map.has(key))
		throw new KeyNotFoundException(`The given key '${key}' was not present in the dictionary.`);
	return map.get(key);
}

/**
 * Dictionary/HashSet for keys with value equality (e.g. Position). Keys are converted by
 * keyFn (default: key.toString(), which Position/Size/Rect implement as "x,y" etc.).
 */
export class ValueMap {
	constructor(keyFn = k => String(k)) {
		this.keyFn = keyFn;
		this.map = new Map();
	}

	get size() { return this.map.size; }
	get Count() { return this.map.size; }
	has(key) { return this.map.has(this.keyFn(key)); }
	get(key) { return this.map.get(this.keyFn(key))?.[1]; }
	set(key, value) { this.map.set(this.keyFn(key), [key, value]); return this; }
	delete(key) { return this.map.delete(this.keyFn(key)); }
	clear() { this.map.clear(); }
	keys() { return [...this.map.values()].map(e => e[0]); }
	values() { return [...this.map.values()].map(e => e[1]); }
	entries() { return [...this.map.values()]; }
	[Symbol.iterator]() { return this.entries()[Symbol.iterator](); }
	forEach(fn) { for (const [k, v] of this.entries()) fn(v, k, this); }
}

export class ValueSet {
	constructor(items = null, keyFn = k => String(k)) {
		this.keyFn = keyFn;
		this.map = new Map();
		if (items)
			for (const item of items)
				this.add(item);
	}

	get size() { return this.map.size; }
	get Count() { return this.map.size; }
	has(item) { return this.map.has(this.keyFn(item)); }
	add(item) {
		const key = this.keyFn(item);
		if (this.map.has(key))
			return false;
		this.map.set(key, item);
		return true;
	}
	delete(item) { return this.map.delete(this.keyFn(item)); }
	clear() { this.map.clear(); }
	values() { return [...this.map.values()]; }
	[Symbol.iterator]() { return this.map.values(); }
}

/** Queue<T> */
export class Queue {
	constructor(items = []) {
		this.items = [...items];
	}
	get Count() { return this.items.length; }
	Enqueue(item) { this.items.push(item); }
	Dequeue() {
		if (!this.items.length)
			throw new InvalidOperationException('Queue empty');
		return this.items.shift();
	}
	Peek() {
		if (!this.items.length)
			throw new InvalidOperationException('Queue empty');
		return this.items[0];
	}
	TryDequeue() { return this.items.length ? [true, this.items.shift()] : [false, null]; }
	TryPeek() { return this.items.length ? [true, this.items[0]] : [false, null]; }
	Clear() { this.items = []; }
	Contains(item) { return this.items.includes(item); }
	ToArray() { return this.items.slice(); }
	[Symbol.iterator]() { return this.items[Symbol.iterator](); }
}

/** Stack<T> */
export class Stack {
	constructor(items = []) {
		this.items = [...items];
	}
	get Count() { return this.items.length; }
	Push(item) { this.items.push(item); }
	Pop() {
		if (!this.items.length)
			throw new InvalidOperationException('Stack empty');
		return this.items.pop();
	}
	Peek() {
		if (!this.items.length)
			throw new InvalidOperationException('Stack empty');
		return this.items[this.items.length - 1];
	}
	TryPop() { return this.items.length ? [true, this.items.pop()] : [false, null]; }
	TryPeek() { return this.items.length ? [true, this.items[this.items.length - 1]] : [false, null]; }
	Clear() { this.items = []; }
	Contains(item) { return this.items.includes(item); }
	ToArray() { return this.items.slice().reverse(); }
	/** iterates like .NET: top first */
	[Symbol.iterator]() { return this.items.slice().reverse()[Symbol.iterator](); }
}

// ---------------- strings / chars ----------------

export const charCode = ch => ch.charCodeAt(0);
export const fromCharCode = code => String.fromCharCode(code);
export const isNullOrEmpty = s => s == null || s.length === 0;
export const isNullOrWhiteSpace = s => s == null || s.trim().length === 0;
export const isDigit = ch => ch >= '0' && ch <= '9';
export const isLetter = ch => /\p{L}/u.test(ch);
export const isLetterOrDigit = ch => /[\p{L}\p{N}]/u.test(ch);
export const isWhiteSpace = ch => /\s/.test(ch);
export const isUpper = ch => ch !== ch.toLowerCase() && ch === ch.toUpperCase();
export const isLower = ch => ch !== ch.toUpperCase() && ch === ch.toLowerCase();

/** string.Format("{0} {1:00}", a, b) with simple format specifiers (0-padding, D, N0, X) */
export function format(template, ...args) {
	return template.replace(/\{(\d+)(?:,(-?\d+))?(?::([^}]+))?\}/g, (_, index, alignment, spec) => {
		let value = args[+index];
		let s = spec ? formatNumber(value, spec) : String(value ?? '');
		if (alignment) {
			const a = +alignment;
			s = a < 0 ? s.padEnd(-a, ' ') : s.padStart(a, ' ');
		}
		return s;
	});
}

/** value.ToString(spec): "00", "000", "D2", "X2", "x", "N0", "F1", "0.0" */
export function formatNumber(value, spec) {
	if (typeof value !== 'number')
		return String(value ?? '');
	let m;
	if ((m = /^[Dd](\d*)$/.exec(spec)))
		return (value < 0 ? '-' : '') + String(Math.abs(Math.trunc(value))).padStart(+(m[1] || 0), '0');
	if ((m = /^([Xx])(\d*)$/.exec(spec))) {
		const s = (value >>> 0).toString(16).padStart(+(m[2] || 0), '0');
		return m[1] === 'X' ? s.toUpperCase() : s;
	}
	if ((m = /^[Ff](\d*)$/.exec(spec)))
		return value.toFixed(+(m[1] || 2));
	if ((m = /^[Nn](\d*)$/.exec(spec)))
		return value.toLocaleString('en-US', { minimumFractionDigits: +(m[1] || 2), maximumFractionDigits: +(m[1] || 2) });
	if ((m = /^(0+)(?:\.(0+))?$/.exec(spec))) {
		const decimals = m[2]?.length ?? 0;
		const s = Math.abs(value).toFixed(decimals);
		const [intPart, frac] = s.split('.');
		return (value < 0 ? '-' : '') + intPart.padStart(m[1].length, '0') + (frac ? '.' + frac : '');
	}
	return String(value);
}

// ---------------- math ----------------

/** Math.Round with banker's rounding (MidpointRounding.ToEven, the .NET default) */
export function round(value, decimals = 0) {
	const f = 10 ** decimals;
	const x = value * f;
	const r = Math.round(x);
	const result = Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : r;
	return result / f;
}

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// ---------------- time ----------------

/** DateTime.Now in milliseconds and TimeSpan helpers: use plain numbers (ms) */
export const now = () => Date.now();

// ---------------- misc ----------------

/** Shallow clone for C# structs (value semantics). */
export function cloneStruct(obj) {
	if (obj == null)
		return obj;
	if (typeof obj.clone === 'function')
		return obj.clone();
	return Object.assign(Object.create(Object.getPrototypeOf(obj)), obj);
}

/** Array.Copy(src, srcIndex, dst, dstIndex, length) */
export function arrayCopy(src, srcIndex, dst, dstIndex, length) {
	if (arguments.length === 3) {
		// Array.Copy(src, dst, length)
		dst = arguments[1];
		length = arguments[2];
		srcIndex = 0;
		dstIndex = 0;
	}
	if (src === dst && srcIndex < dstIndex) {
		for (let i = length - 1; i >= 0; i--)
			dst[dstIndex + i] = src[srcIndex + i];
	} else {
		for (let i = 0; i < length; i++)
			dst[dstIndex + i] = src[srcIndex + i];
	}
}
