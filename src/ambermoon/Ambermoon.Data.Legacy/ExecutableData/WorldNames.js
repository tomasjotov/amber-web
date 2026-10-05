// Port of Ambermoon.Data.Legacy/ExecutableData/WorldNames.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { AmigaExecutable } from '../Serialization/AmigaExecutable.js';

// Dictionary.Add (throws on duplicate keys)
function add(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

/**
 * Directly after the FileList there
 * are the names of the 3 worlds.
 *
 * It starts with 3 longwords which give the absolute
 * offset inside the second data hunk. Each of the names
 * is null-terminated.
 */
export class WorldNames {
	/**
	 * WorldNames(names) or WorldNames(dataReader)
	 */
	constructor(namesOrDataReader) {
		this.entries = new Map();

		if (Array.isArray(namesOrDataReader)) {
			const names = namesOrDataReader;

			if (names.length !== 3)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid number of world names.');

			for (let i = 0; i < names.length; ++i)
				add(this.entries, i, names[i]);
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the world names just behind the
			 * file list.
			 *
			 * It will be behind the world names after this.
			 */
			const dataReader = namesOrDataReader;
			const offsets = new Array(3).fill(0);
			let endOffset = dataReader.Position;

			for (let i = 0; i < 3; ++i)
				offsets[i] = dataReader.ReadDword();

			for (let i = 0; i < 3; ++i) {
				dataReader.Position = offsets[i];
				add(this.entries, i, dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding));

				if (dataReader.Position > endOffset)
					endOffset = dataReader.Position;
			}

			dataReader.Position = endOffset;
			dataReader.AlignToWord();
		}
	}

	get Entries() { return this.entries; }
}
