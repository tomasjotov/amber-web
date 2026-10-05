// Port of Ambermoon.Data.Legacy/ExecutableData/LanguageNames.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Language } from '../../Ambermoon.Data.Common/Enumerations/Language.js';
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
 * After the SpellNames there are the
 * language names like "Elfish", "Felinic", etc.
 */
export class LanguageNames {
	/**
	 * LanguageNames(names) or LanguageNames(dataReader)
	 */
	constructor(namesOrDataReader) {
		this.entries = new Map();

		if (Array.isArray(namesOrDataReader)) {
			const names = namesOrDataReader;

			if (names.length !== 8)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid number of language names.');

			for (let i = 0; i < names.length; ++i)
				add(this.entries, (1 << i) & 0xff, names[i]);
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the language names just behind the
			 * spell names.
			 *
			 * It will be behind the language names after this.
			 */
			const dataReader = namesOrDataReader;

			add(this.entries, Language.None, '');

			for (const type of getValues(Language)) {
				if (type !== Language.None)
					add(this.entries, type, dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding));
			}
		}
	}

	get Entries() { return this.entries; }
}
