// Port of Ambermoon.Data.Legacy/ExecutableData/ItemTypeNames.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { ItemType } from '../../Ambermoon.Data.Common/Enumerations/ItemType.js';
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
 * After the attribute short names there are the item
 * type names like "Potion", "Shield", etc.
 *
 * The condition item type has an empty string entry.
 */
export class ItemTypeNames {
	/**
	 * ItemTypeNames(names) or ItemTypeNames(dataReader)
	 */
	constructor(namesOrDataReader) {
		this.entries = new Map();

		if (Array.isArray(namesOrDataReader)) {
			const names = namesOrDataReader;

			if (names.length !== 20)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid number of item type names.');

			for (let i = 0; i < names.length; ++i)
				add(this.entries, i + 1, names[i]);
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the item type names just behind the
			 * attribute short names.
			 *
			 * It will be behind the item type names after this.
			 */
			const dataReader = namesOrDataReader;

			add(this.entries, ItemType.None, '');

			for (const type of getValues(ItemType)) {
				if (type !== ItemType.None)
					add(this.entries, type, dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding));
			}
		}
	}

	get Entries() { return this.entries; }
}
