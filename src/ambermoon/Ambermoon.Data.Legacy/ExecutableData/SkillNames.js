// Port of Ambermoon.Data.Legacy/ExecutableData/SkillNames.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Skill } from '../../Ambermoon.Data.Common/Enumerations/Skill.js';
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
 * After the RaceNames there are the
 * skill names like "Attack", "Parry", etc.
 */
export class SkillNames {
	/**
	 * SkillNames(names, shortNames) or SkillNames(dataReader)
	 */
	constructor(namesOrDataReader, shortNames) {
		this.entries = new Map();
		this.shortNames = new Map();

		if (Array.isArray(namesOrDataReader)) {
			const names = namesOrDataReader;

			if (names.length !== 10 || shortNames.length !== 10)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid number of skill names.');

			for (let i = 0; i < names.length; ++i) {
				add(this.entries, i, names[i]);
				add(this.shortNames, i, shortNames[i]);
			}
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the skill names just behind the
			 * race names.
			 *
			 * It will be behind the skill names after this.
			 */
			const dataReader = namesOrDataReader;

			for (const type of getValues(Skill)) {
				add(this.entries, type, dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding));
			}
		}
	}

	get Entries() { return this.entries; }
	get ShortNames() { return this.shortNames; }

	AddShortNames(dataReader) {
		for (const type of getValues(Skill)) {
			add(this.shortNames, type, dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding));
		}
	}
}
