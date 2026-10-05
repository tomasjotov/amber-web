// Port of Ambermoon.Data.Legacy/ExecutableData/ConditionNames.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException, getValue, isNullOrWhiteSpace } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Condition } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';
import { AmigaExecutable } from '../Serialization/AmigaExecutable.js';

// Enum.GetValues: all values ordered by their unsigned value
const getValues = enumObject => Object.values(enumObject).sort((a, b) => (a >>> 0) - (b >>> 0));
// Dictionary.Add (throws on duplicate keys)
function add(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

/**
 * After the ItemTypeNames there are the
 * condition names like "Sleep", "Panic", etc.
 *
 * Only the first of the 3 dead conditions has a text.
 * The other two are empty strings and use the other one.
 *
 * The unused condition has an empty text as well. Maybe a
 * relict from Amberstar data.
 */
export class ConditionNames {
	/**
	 * ConditionNames(names) or ConditionNames(dataReader)
	 */
	constructor(namesOrDataReader) {
		this.entries = new Map();

		if (Array.isArray(namesOrDataReader)) {
			const names = namesOrDataReader;

			if (names.length !== 16)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid number of condition names.');

			add(this.entries, Condition.None, '');

			for (let i = 0; i < names.length; ++i)
				add(this.entries, 1 << i, names[i]);
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the condition names just behind the
			 * item type names.
			 *
			 * It will be behind the condition names after this.
			 */
			const dataReader = namesOrDataReader;

			add(this.entries, Condition.None, '');

			for (const type of getValues(Condition)) {
				if (type !== Condition.None)
					add(this.entries, type, dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding));
			}
		}

		if (isNullOrWhiteSpace(getValue(this.entries, Condition.DeadAshes)))
			this.entries.set(Condition.DeadAshes, getValue(this.entries, Condition.DeadCorpse));
		if (isNullOrWhiteSpace(getValue(this.entries, Condition.DeadDust)))
			this.entries.set(Condition.DeadDust, getValue(this.entries, Condition.DeadCorpse));
	}

	get Entries() { return this.entries; }
}
