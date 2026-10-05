// Port of Ambermoon.Data.Legacy/ExecutableData/SpellTypeNames.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { SpellSchool } from '../../Ambermoon.Data.Common/Enumerations/SpellSchool.js';
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
 * After the SongNames there are the spell
 * type names like "Destruction", "Mystic", etc.
 *
 * There are 2 spell types which are not used and which
 * have an empty text entry.
 */
export class SpellTypeNames {
	/**
	 * SpellTypeNames(names) or SpellTypeNames(dataReader)
	 */
	constructor(namesOrDataReader) {
		this.entries = new Map();

		if (Array.isArray(namesOrDataReader)) {
			const names = namesOrDataReader;

			if (names.length !== 7)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid number of spell school names.');

			for (let i = 0; i < names.length; ++i)
				add(this.entries, i, names[i]);
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the spell type names just behind the
			 * song names.
			 *
			 * It will be behind the spell type names after this.
			 */
			const dataReader = namesOrDataReader;

			for (const type of getValues(SpellSchool)) {
				add(this.entries, type, dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding));
			}
		}
	}

	get Entries() { return this.entries; }
}
