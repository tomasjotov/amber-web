// Port of Ambermoon.Data.Legacy/ExecutableData/FileList.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { AmigaExecutable } from '../Serialization/AmigaExecutable.js';

// German 1.05: 0x7d42
/**
 * There is the list of files like Palettes.amb inside the second data
 * hunk in the executables.
 *
 * It starts with the offset of the file entries. These are absolute offsets
 * in relation to the hunk data. An offset of 0 means, there is no entry.
 * Maybe it was used to build an index list with empty entries.
 *
 * At each offset you can find a file entry.
 * It starts with a byte which represent the disk number the file
 * is part of (0x01 to 0x0A for disk A to J).
 *
 * There are two types of files. Normal ones and split archives.
 * Normal files are only located on 1 disk. There is only a single
 * byte with the disk number and then immediately the file name.
 *
 * A split archive consists of 2 or 3 files (like 1/2/3Map_data.amb).
 * It starts with a 4 byte header where the 4 bytes contain
 * the disk numbers (0 means not used). The file name can contain
 * the ASCII character '0'. It is replaced by '1', '2', '3' or '4'
 * if the associated byte number is not 0.
 *
 * Example: 0x00 0x00 0x03 0x06 file0name ...
 * Means:
 *   - file3name
 *   - file4name
 * Cause 3rd and 4th byte are not 0.
 *
 * In Ambermoon there are these combinations only:
 *
 * Something Something Something 0x00 0filename
 * -> 1/2/3filename
 * 0x00 Something Something 0x00 0filename
 * -> 2/3filename
 *
 * Files may be listed twice so this has to be allowed.
 */
export class FileList {
	/**
	 * FileList() or FileList(dataReader)
	 *
	 * With a data reader:
	 * The position of the data reader should be at
	 * the start of the file list.
	 *
	 * It will be behind the file list after this.
	 */
	constructor(dataReader) {
		this.entries = new Map();
		this.indexedEntries = [];

		if (arguments.length === 0 || dataReader == null)
			return;

		const numEntries = 44;
		const offsets = new Array(numEntries).fill(0);
		let endOffset = dataReader.Position;

		for (let i = 0; i < numEntries; ++i)
			offsets[i] = dataReader.ReadDword();

		for (let i = 0; i < numEntries; ++i) {
			if (offsets[i] === 0) {
				this.indexedEntries.push([]);
				continue;
			}

			dataReader.Position = offsets[i];

			this.ReadFileEntry(dataReader);

			if (dataReader.Position > endOffset)
				endOffset = dataReader.Position;
		}

		dataReader.Position = endOffset;
		dataReader.AlignToWord();
	}

	/**
	 * Key: Filename
	 * Value: Disk letter (A to J)
	 */
	get Entries() { return this.entries; }
	/**
	 * This contains the file list entries in the order it
	 * was stored inside the file. There might be empty entries.
	 * Each entry can contain 0 - 4 filenames.
	 */
	get IndexedEntries() { return this.indexedEntries; }

	ReadFileEntry(dataReader) {
		const diskNumber = dataReader.ReadByte();

		if (dataReader.PeekByte() >= 0x20) {
			if (diskNumber === 0)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid disk number 0.');

			const filename = dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding);
			this.entries.set(filename, String.fromCharCode(('A'.charCodeAt(0) + diskNumber - 1) & 0xffff));
			this.indexedEntries.push([filename]);
		}
		else {
			--dataReader.Position;
			const diskNumbers = dataReader.ReadBytes(4);
			const baseFileName = dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding);
			const filenames = new Array(4).fill(null);

			for (let d = 0; d < 4; ++d) {
				if (diskNumbers[d] !== 0) {
					const filename = baseFileName.replaceAll('0', String.fromCharCode('1'.charCodeAt(0) + d));
					this.entries.set(filename, String.fromCharCode(('A'.charCodeAt(0) + diskNumbers[d] - 1) & 0xffff));
					filenames[d] = filename;
				}
			}

			this.indexedEntries.push(filenames);
		}
	}
}
