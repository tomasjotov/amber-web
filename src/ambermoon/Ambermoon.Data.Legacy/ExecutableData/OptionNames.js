// Port of Ambermoon.Data.Legacy/ExecutableData/OptionNames.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException } from '../../../runtime.js';
import { Option } from '../../Ambermoon.Data.Common/Enumerations/Option.js';
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
 * After the AutomapNames there are the
 * original option names like "Music", "Fast battle mode", etc.
 */
export class OptionNames {
	/**
	 * OptionNames(names) or OptionNames(dataReader)
	 */
	constructor(namesOrDataReader) {
		this.entries = new Map();

		if (Array.isArray(namesOrDataReader)) {
			const names = namesOrDataReader;

			for (let i = 0; i < names.length; ++i)
				add(this.entries, (1 << i) & 0xffff, names[i]);
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the option names just behind the
			 * automap names.
			 *
			 * It will be behind the option names after this.
			 */
			const dataReader = namesOrDataReader;

			for (const type of getValues(Option)) {
				add(this.entries, type, dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding));

				if (type === Option.CeilingTexture3D)
					break; // stop here
			}

			dataReader.AlignToWord();
		}
	}

	get Entries() { return this.entries; }
}
