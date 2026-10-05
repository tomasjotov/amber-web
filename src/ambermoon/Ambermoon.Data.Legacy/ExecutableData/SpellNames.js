// Port of Ambermoon.Data.Legacy/ExecutableData/SpellNames.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException, getValue } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { SpellSchool } from '../../Ambermoon.Data.Common/Enumerations/SpellSchool.js';
import { Spell } from '../../Ambermoon.Data.Common/Enumerations/Spells.js';
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
 * After the SpellTypeNames there are the
 * spell names like "Magic Projectile", etc.
 *
 * Unused spells are represented by empty entries.
 * Note that there are 7 spell types with 30 spells
 * each. The 5th and 6th spell types are unused and
 * contain 30 empty entries.
 */
export class SpellNames {
	/**
	 * SpellNames(names) or SpellNames(dataReader)
	 */
	constructor(namesOrDataReader) {
		this.entries = new Map();
		this.entriesPerType = new Map();

		if (Array.isArray(namesOrDataReader)) {
			const names = namesOrDataReader;

			if (names.length !== 210)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid number of spell names.');

			for (let i = 0; i < 7; ++i)
				add(this.entriesPerType, i, []);

			for (let i = 0; i < names.length; ++i) {
				add(this.entries, i + 1, names[i]);
				getValue(this.entriesPerType, Math.trunc(i / 30)).push(names[i]);
			}
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the spell names just behind the
			 * spell type names.
			 *
			 * It will be behind the spell names after this.
			 */
			const dataReader = namesOrDataReader;

			add(this.entries, Spell.None, '');
			let spellIndex = 1; // we skip Spell.None as it has no text entry

			for (const type of getValues(SpellSchool)) {
				add(this.entriesPerType, type, []);

				for (let i = 0; i < 30; ++i) {
					const name = dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding);
					add(this.entries, spellIndex++, name);
					getValue(this.entriesPerType, type).push(name);
				}
			}
		}
	}

	get Entries() { return this.entries; }
	get EntriesPerType() { return this.entriesPerType; }
}
