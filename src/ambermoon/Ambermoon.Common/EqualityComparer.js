// Port of Ambermoon.Common/EqualityComparer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

function valueEquals(a, b) {
	if (a != null && typeof a.Equals === 'function')
		return a.Equals(b);
	return a === b;
}

function valueHash(v) {
	if (v != null && typeof v.GetHashCode === 'function')
		return v.GetHashCode();
	const s = String(v);
	let hash = 0;
	for (let i = 0; i < s.length; i++)
		hash = (Math.imul(hash, 31) + s.charCodeAt(i)) | 0;
	return hash;
}

/**
 * EqualityComparer<T, U>: compares objects by a mapped value.
 * For use with ValueMap/ValueSet: `new ValueMap(k => String(comparer.mapper(k)))`.
 */
export class EqualityComparer {
	constructor(mapper) {
		this.mapper = mapper;
	}

	Equals(x, y) {
		return valueEquals(this.mapper(x), this.mapper(y));
	}

	GetHashCode(obj) {
		return valueHash(this.mapper(obj));
	}
}
