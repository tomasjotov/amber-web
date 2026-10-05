// Port of Ambermoon.Data.Legacy/ExecutableData/AttributeNames.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Attribute } from '../../Ambermoon.Data.Common/Enumerations/Attribute.js';
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
 * After the SkillNames there are the
 * attribute names like "Strength", "Dexterity", etc.
 */
export class AttributeNames {
	/**
	 * AttributeNames(names, shortNames) or AttributeNames(dataReader)
	 */
	constructor(namesOrDataReader, shortNames) {
		this.entries = new Map();
		this.shortNames = new Map();

		if (Array.isArray(namesOrDataReader)) {
			const names = namesOrDataReader;

			if (names.length !== 9 || shortNames.length !== 8)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid number of attribute names.');

			for (let i = 0; i < names.length; ++i) {
				add(this.entries, i, names[i]);
				if (i !== 8)
					add(this.shortNames, i, shortNames[i]);
			}

			add(this.entries, Attribute.BonusSpellDamage, '');
			add(this.shortNames, Attribute.Age, '');
			add(this.shortNames, Attribute.BonusSpellDamage, '');
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the attribute names just behind the
			 * skill names.
			 *
			 * It will be behind the attribute names after this.
			 */
			const dataReader = namesOrDataReader;

			for (const type of getValues(Attribute)) {
				if (type !== Attribute.BonusSpellDamage)
					add(this.entries, type, dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding));
			}

			add(this.entries, Attribute.BonusSpellDamage, '');
		}
	}

	get Entries() { return this.entries; }
	get ShortNames() { return this.shortNames; }

	AddShortNames(dataReader) {
		for (const type of getValues(Attribute)) {
			if (type !== Attribute.Age && type !== Attribute.BonusSpellDamage)
				add(this.shortNames, type, dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding));
		}

		add(this.shortNames, Attribute.Age, '');
		add(this.shortNames, Attribute.BonusSpellDamage, '');
	}
}
