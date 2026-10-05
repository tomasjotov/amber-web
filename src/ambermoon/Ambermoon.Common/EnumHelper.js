// Port of Ambermoon.Common/EnumHelper.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Generic type arguments are passed as the first parameter (the frozen enum object).

import { ArgumentException } from '../../runtime.js';

/** Enum.GetName: name of the first member with that value, or null */
function getEnumName(enumObject, value) {
	for (const [name, v] of Object.entries(enumObject))
		if (v === value)
			return name;
	return null;
}

export class EnumHelper {
	/** Enum.Parse with '|' or ',' separated flag names (numbers are accepted too) */
	static ParseFlagsEnum(enumObject, value, ignoreCase = false) {
		const parts = value.replaceAll('|', ',').split(',').map(s => s.trim());
		let result = 0;

		for (const part of parts) {
			if (part.length === 0)
				throw new ArgumentException(`Unknown enum value ${value}`);

			if (/^[+-]?\d+$/.test(part)) {
				result |= parseInt(part, 10);
				continue;
			}

			let found = false;

			for (const [n, v] of Object.entries(enumObject)) {
				if (ignoreCase ? n.toLowerCase() === part.toLowerCase() : n === part) {
					result |= v;
					found = true;
					break;
				}
			}

			if (!found)
				throw new ArgumentException(`Unknown enum value ${part}`);
		}

		return result;
	}

	/** Enum.GetValues (sorted by unsigned magnitude like .NET) */
	static GetValues(enumObject) {
		return Object.values(enumObject)
			.map((v, i) => ({ v, i }))
			.sort((a, b) => ((a.v >>> 0) - (b.v >>> 0)) || (a.i - b.i))
			.map(e => e.v);
	}

	static GetName(enumObject, value) {
		return getEnumName(enumObject, value);
	}

	static NameCount(enumObject) {
		return Object.keys(enumObject).length;
	}

	/**
	 * GetFlagNames(enumObject, value, bytes) and GetFlagNames(enumType, value) (bytes defaults to 4).
	 */
	static GetFlagNames(enumObject, value, bytes = 4) {
		const toUint = v => {
			switch (bytes) {
				case 1: return v & 0xff;
				case 2: return v & 0xffff;
				default: return v >>> 0;
			}
		};

		const values = [...new Set(EnumHelper.GetValues(enumObject).map(v => toUint(v)).filter(v => v !== 0))];
		const flags = toUint(value);

		if (values.length === 0 || flags === 0)
			return getEnumName(enumObject, 0) ?? 'None';

		let result = '';
		values.sort((a, b) => a - b);

		for (const v of values) {
			if (((flags & v) >>> 0) === 0)
				continue;

			if (result.length !== 0)
				result += ' | ';
			result += getEnumName(enumObject, v) ?? getEnumName(enumObject, v | 0) ?? '';
		}

		return result;
	}
}
