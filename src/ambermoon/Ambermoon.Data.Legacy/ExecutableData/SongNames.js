// Port of Ambermoon.Data.Legacy/ExecutableData/SongNames.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException, isNullOrWhiteSpace } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Song } from '../../Ambermoon.Data.Common/Enumerations/Song.js';
import { AmigaExecutable } from '../Serialization/AmigaExecutable.js';

// Dictionary.Add (throws on duplicate keys)
function add(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

const NumSongs = 32;

/**
 * After the OptionNames there are the
 * song names.
 */
export class SongNames {
	/**
	 * SongNames(names) or SongNames(dataReader)
	 */
	constructor(namesOrDataReader) {
		this.entries = new Map();

		if (Array.isArray(namesOrDataReader)) {
			const names = namesOrDataReader;

			if (names.length !== NumSongs)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid number of songs.');

			for (let i = 0; i < names.length; ++i)
				add(this.entries, (Song.WhoSaidHiHo + i) & 0xff, names[i]);
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the song names just behind the
			 * option names.
			 *
			 * It will be behind the song names after this.
			 */
			const dataReader = namesOrDataReader;

			const ReadName = () => {
				let name = dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding);

				if (isNullOrWhiteSpace(name))
					name = 'No name';

				return name;
			};

			for (let i = 1; i <= NumSongs; ++i) {
				add(this.entries, i, ReadName());
			}

			dataReader.AlignToWord();
		}
	}

	get Entries() { return this.entries; }
}
