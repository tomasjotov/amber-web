// Port of Ambermoon.Data.Legacy/ExecutableData/AutomapNames.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { AutomapType } from '../../Ambermoon.Data.Common/Enumerations/AutomapType.js';
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
 * After the Messages there are the automap
 * names like "Riddlemouth", "Teleporter", etc.
 *
 * Some automap values have no display name and therefore
 * an empty text entry (just the terminating 0).
 */
export class AutomapNames {
	/**
	 * AutomapNames(names) or AutomapNames(dataReader)
	 */
	constructor(namesOrDataReader) {
		this.entries = new Map();

		if (Array.isArray(namesOrDataReader)) {
			const names = namesOrDataReader;

			if (names.length !== 17)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid number of automap type names.');

			add(this.entries, AutomapType.None, '');
			add(this.entries, AutomapType.Wall, '');

			for (let i = 0; i < names.length; ++i)
				add(this.entries, AutomapType.Riddlemouth + i, names[i]);
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the automap names just behind the
			 * messages.
			 *
			 * It will be behind the automap names after this.
			 */
			const dataReader = namesOrDataReader;

			add(this.entries, AutomapType.None, '');
			add(this.entries, AutomapType.Wall, '');

			for (const type of getValues(AutomapType).slice(2, 2 + 17)) {
				add(this.entries, type, dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding));
			}

			dataReader.AlignToWord();
		}
	}

	get Entries() { return this.entries; }
}
