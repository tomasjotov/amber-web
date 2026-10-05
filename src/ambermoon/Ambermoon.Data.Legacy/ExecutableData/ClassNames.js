// Port of Ambermoon.Data.Legacy/ExecutableData/ClassNames.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Class } from '../../Ambermoon.Data.Common/Enumerations/Class.js';
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
 * After the LanguageNames there are the
 * class names like "Adventurer", "Warrior", etc.
 */
export class ClassNames {
	/**
	 * ClassNames(names) or ClassNames(dataReader)
	 */
	constructor(namesOrDataReader) {
		this.entries = new Map();

		if (Array.isArray(namesOrDataReader)) {
			const names = namesOrDataReader;

			if (names.length < 9 || names.length > 11)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid number of class names.');

			for (let i = 0; i < names.length; ++i)
				add(this.entries, i, names[i]);

			if (names.length < 10)
				add(this.entries, Class.Animal, '');
			if (names.length < 11)
				add(this.entries, Class.Monster, '');
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the class names just behind the
			 * language names.
			 *
			 * It will be behind the class names after this.
			 */
			const dataReader = namesOrDataReader;

			for (const type of getValues(Class)) {
				add(this.entries, type, dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding));
			}
		}
	}

	get Entries() { return this.entries; }
}
