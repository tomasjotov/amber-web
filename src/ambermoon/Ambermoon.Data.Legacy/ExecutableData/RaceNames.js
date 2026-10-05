// Port of Ambermoon.Data.Legacy/ExecutableData/RaceNames.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Race } from '../../Ambermoon.Data.Common/Enumerations/Race.js';
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
 * After the ClassNames there are the
 * race names like "Human", "Dwarf", etc.
 */
export class RaceNames {
	/**
	 * RaceNames(names) or RaceNames(dataReader)
	 */
	constructor(namesOrDataReader) {
		this.entries = new Map();

		if (Array.isArray(namesOrDataReader)) {
			const names = namesOrDataReader;

			if (names.length !== 15)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid number of race names.');

			for (let i = 0; i < names.length; ++i)
				add(this.entries, i, names[i]);

			add(this.entries, Race.Unknown15, '');
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the race names just behind the
			 * class names.
			 *
			 * It will be behind the race names after this.
			 */
			const dataReader = namesOrDataReader;

			for (const type of getValues(Race)) {
				add(this.entries, type, dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding));
			}
		}
	}

	get Entries() { return this.entries; }
}
