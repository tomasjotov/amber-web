// Port of Ambermoon.Data.Legacy/Serialization/ADFReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Files } from '../Files.js';
import { GameData } from '../GameData.js';
import { Exception, ArgumentException } from '../../../runtime.js';

/** System.IO.IOException replacement */
class IOException extends Exception { }

/** Encoding.GetEncoding("iso-8859-1").GetString */
function latin1GetString(bytes) {
	let s = '';
	for (let i = 0; i < bytes.length; ++i)
		s += String.fromCharCode(bytes[i]);
	return s;
}

/** char.ToUpper for a single char */
function charToUpper(ch) {
	const upper = ch.toUpperCase();
	return upper.length === 1 ? upper : ch;
}

/**
 * Minimal System.IO.BinaryReader replacement over a Uint8Array.
 * BaseStream.Position is mapped to the reader itself.
 */
class BinaryReader {
	constructor(data) {
		this.data = data;
		this.Position = 0;
	}

	get BaseStream() {
		return this;
	}

	ReadByte() {
		if (this.Position >= this.data.length)
			throw new IOException('Unable to read beyond the end of the stream.');
		return this.data[this.Position++];
	}

	ReadBytes(count) {
		const end = Math.min(this.data.length, this.Position + count);
		const bytes = this.data.slice(this.Position, end);
		this.Position = Math.max(this.Position, end);
		return bytes;
	}

	/** little endian like .NET */
	ReadUInt32() {
		const b0 = this.ReadByte();
		const b1 = this.ReadByte();
		const b2 = this.ReadByte();
		const b3 = this.ReadByte();
		return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
	}
}

export class EndianExtensions {
	static ReadUInt16BigEndian(reader) {
		return ((reader.ReadByte() << 8) | reader.ReadByte()) & 0xffff;
	}

	static ReadUInt32BigEndian(reader) {
		return ((reader.ReadByte() << 24) | (reader.ReadByte() << 16) | (reader.ReadByte() << 8) | reader.ReadByte()) >>> 0;
	}
}

const SectorType = Object.freeze({
	Unknown: 0,
	File: 1,
	Directory: 2
});

class Sector {
	constructor() {
		this.Type = SectorType.Unknown;
		this.Name = '';
		this.NextHashBlock = 0;
		this.ParentBlock = 0;
		this.FirstExtensionBlock = 0;
		this.Offset = 0xffffffff;
		this.Length = 0;
	}

	GetHashTable(reader) {
		if (this.Type !== SectorType.Directory)
			return null;

		const hashTable = new Array(72).fill(0);
		reader.BaseStream.Position = this.Offset + 24;

		for (let i = 0; i < 72; ++i) {
			hashTable[i] = EndianExtensions.ReadUInt32BigEndian(reader);
		}

		return hashTable;
	}

	GetData(reader, ffs, fileSize = 0) {
		if (this.Type !== SectorType.File)
			return null;

		if (fileSize === 0) {
			reader.BaseStream.Position = this.Offset + 512 - 188; // offset to file size

			fileSize = EndianExtensions.ReadUInt32BigEndian(reader);
		}

		reader.BaseStream.Position = this.Offset + 24;

		const fileData = new Uint8Array(fileSize);
		const dataOffsets = new Array(72).fill(0);

		for (let i = 0; i < 72; ++i)
			dataOffsets[71 - i] = EndianExtensions.ReadUInt32BigEndian(reader);

		let offset = 0;

		for (let i = 0; i < 72; ++i) {
			if (dataOffsets[i] === 0)
				break;

			[offset] = this.AppendData(reader, fileData, offset, dataOffsets[i], ffs, Math.min(512, fileData.length - offset));
		}

		if (this.FirstExtensionBlock !== 0) {
			const extensionSector = ReadSector(reader, this.FirstExtensionBlock, true);

			if (extensionSector == null)
				throw new IOException(`Invalid ADF file data for file "${this.Name}".`);

			const extensionData = extensionSector.GetData(reader, ffs, (fileSize - offset) >>> 0);

			if (offset + extensionData.length !== fileSize)
				throw new IOException(`Invalid ADF file data for file "${this.Name}".`);

			fileData.set(extensionData, offset);

			offset = fileSize;
		}

		if (offset !== fileSize)
			throw new IOException(`Invalid ADF file data for file "${this.Name}".`);

		return fileData;
	}

	/** ref int offset -> returns [offset] */
	AppendData(reader, buffer, offset, block, ffs, maxSize) {
		reader.BaseStream.Position = block * 512;

		if (ffs) {
			const data = reader.ReadBytes(maxSize);

			buffer.set(data, offset);

			offset += data.length;
		} else { // OFS
			if (EndianExtensions.ReadUInt32BigEndian(reader) !== 8)
				throw new IOException('Invalid file data sector header.');

			reader.ReadBytes(8); // skip some bytes

			const size = EndianExtensions.ReadUInt32BigEndian(reader);

			if (size > 512 - 24 || size > maxSize)
				throw new IOException('Invalid file data sector size.');

			reader.ReadBytes(8); // skip some bytes

			const data = reader.ReadBytes(size);

			buffer.set(data, offset);

			offset += data.length;
		}

		return [offset];
	}
}

function GetHash(name, internationalMode) {
	let hash, l;

	l = hash = name.length;
	const toUpper = internationalMode
		? ch => {
			const code = ch.charCodeAt(0);
			return (ch >= 'a' && ch <= 'z') || (code >= 224 && code <= 254 && code !== 247) ? String.fromCharCode(code - (0x61 - 0x41)) : ch;
		}
		: charToUpper;

	for (let i = 0; i < l; ++i) {
		hash = (hash * 13) >>> 0;
		hash = (hash + toUpper(name[i]).charCodeAt(0)) >>> 0;
		hash &= 0x7ff;
	}

	return hash % 72;
}

function GetSector(reader, hashTable, name, internationalMode) {
	const hash = GetHash(name, internationalMode);

	if (hash === 0)
		return null;

	name = name.toUpperCase();

	let sector = ReadSector(reader, hashTable[hash]);

	if (sector == null)
		return null;

	while (sector.Name.toUpperCase() !== name && sector.NextHashBlock !== 0) {
		sector = ReadSector(reader, sector.NextHashBlock);
	}

	if (sector.Name.toUpperCase() !== name)
		return null;

	return sector;
}

function ReadSector(reader, block, expectExtension = false) {
	if (block === 0)
		return null;

	reader.BaseStream.Position = block * 512;
	const type = EndianExtensions.ReadUInt32BigEndian(reader);

	if ((type !== 2 && !expectExtension) || (type !== 16 && expectExtension)) // primary type (T_HEADER or T_LIST)
		throw new IOException('Unexpected ADF sector type.');

	if (EndianExtensions.ReadUInt32BigEndian(reader) !== block)
		throw new IOException('Invalid ADF sector.');

	// move pointer to file size
	reader.BaseStream.Position = block * 512 + 512 - 188;

	const sector = new Sector();
	sector.Offset = block * 512;
	sector.Length = EndianExtensions.ReadUInt32BigEndian(reader);

	// move pointer to name length
	reader.BaseStream.Position = block * 512 + 512 - 80;

	const nameLength = Math.min(30, reader.ReadByte());

	sector.Name = latin1GetString(reader.ReadBytes(nameLength));

	// move pointer to next hash ptr
	reader.BaseStream.Position = block * 512 + 512 - 16;

	sector.NextHashBlock = EndianExtensions.ReadUInt32BigEndian(reader);
	sector.ParentBlock = EndianExtensions.ReadUInt32BigEndian(reader);
	sector.FirstExtensionBlock = EndianExtensions.ReadUInt32BigEndian(reader);

	const secondaryType = EndianExtensions.ReadUInt32BigEndian(reader) | 0; // secondary type

	if (secondaryType === -3)
		sector.Type = SectorType.File;
	else if (secondaryType === 2)
		sector.Type = SectorType.Directory;
	else
		sector.Type = SectorType.Unknown;

	if (sector.Type === SectorType.Directory) {

	}

	return sector;
}

export class ADFReader {
	/**
	 * @param stream ADF data as Uint8Array (or an object with ReadToEnd()/ToArray())
	 * @returns Map<string, Uint8Array>
	 */
	static ReadADF(stream, versionPreference) {
		const ambermoonFiles = new Map(Files.AmigaFiles);

		if (versionPreference === GameData.VersionPreference.Post114) {
			for (const file of Files.Removed114Files)
				ambermoonFiles.delete(file);
		}

		if (versionPreference !== GameData.VersionPreference.Pre114) {
			for (const [key, value] of Files.New114Files) {
				if (ambermoonFiles.has(key))
					throw new ArgumentException('An item with the same key has already been added.');
				ambermoonFiles.set(key, value);
			}
		}

		const directoryHashTables = new Map();

		let data = stream;
		if (!(data instanceof Uint8Array))
			data = typeof data.ReadToEnd === 'function' ? data.ReadToEnd() : data.ToArray();

		const reader = new BinaryReader(data);

		// Reading bootblock (sectors 1 and 2 -> byte 0 - 1023)
		const header = reader.ReadBytes(4);

		if (header[0] !== 0x44 || header[1] !== 0x4f || // 'D', 'O'
			header[2] !== 0x53) // 'S'
			throw new IOException('Invalid ADF file header.');

		const flags = header[3] & 0x07;
		let ffs;
		let internationalMode;

		switch (flags) {
			case 0: // OFS
				ffs = false;
				internationalMode = false;
				break;
			case 1: // FFS
				ffs = true;
				internationalMode = false;
				break;
			case 2: // OFS/INTL
			case 4: // OFS/DIRC/INTL
				ffs = false;
				internationalMode = true;
				break;
			case 3: // FFS/INTL
			case 5: // FFS/DIRC/INTL
				ffs = true;
				internationalMode = true;
				break;
			default:
				throw new IOException('Invalid ADF file format.');
		}

		// Reading rootblock (sector 880 -> offset 0x6e000)
		reader.BaseStream.Position = 0x6e000;

		if (EndianExtensions.ReadUInt32BigEndian(reader) !== 2 || // type = T_HEADER
			EndianExtensions.ReadUInt32BigEndian(reader) !== 0 || // header_key = unused
			EndianExtensions.ReadUInt32BigEndian(reader) !== 0 || // high_seq = unused
			EndianExtensions.ReadUInt32BigEndian(reader) !== 0x48 || // ht_size = 0x48
			EndianExtensions.ReadUInt32BigEndian(reader) !== 0) // first_data = unused
			throw new IOException('Invalid ADF file format.');

		reader.ReadUInt32(); // skip checksum

		const hashTable = new Array(72).fill(0);

		for (let i = 0; i < 72; ++i)
			hashTable[i] = EndianExtensions.ReadUInt32BigEndian(reader);

		const bmFlagsValid = reader.ReadUInt32() === 0xFFFFFFFF;

		const bitmapBlockPointers = new Array(25).fill(0);

		for (let i = 0; i < 25; ++i)
			bitmapBlockPointers[i] = EndianExtensions.ReadUInt32BigEndian(reader);

		reader.ReadUInt32(); // skip first bitmap extension block (only used for hard disks)
		reader.ReadBytes(12); // skip last root alteration date values
		reader.ReadBytes(32); // skip volume name
		reader.ReadBytes(8); // skip unused bytes
		reader.ReadBytes(12); // skip last disk alteration date values
		reader.ReadBytes(12); // skip filesystem creation date values
		reader.ReadUInt32(); // skip next hash
		reader.ReadUInt32(); // skip parent directory

		if (EndianExtensions.ReadUInt32BigEndian(reader) !== 0 || // extension must be 0
			EndianExtensions.ReadUInt32BigEndian(reader) !== 1) // block secondary type = ST_ROOT (1)
			throw new IOException('Invalid ADF file format.');

		const loadedFiles = new Map();

		for (const file of ambermoonFiles.keys()) {
			if (file.includes('/')) {
				let directoryPath = '';
				const parts = file.split('/');
				let currentHashTable = hashTable;

				for (let i = 0; i < parts.length - 1; ++i) {
					if (i !== 0)
						directoryPath += '/';
					directoryPath += parts[i];

					if (directoryHashTables.has(directoryPath)) {
						currentHashTable = directoryHashTables.get(directoryPath);
					} else {
						const sector = GetSector(reader, currentHashTable, parts[i], internationalMode);

						if (sector == null)
							continue;

						currentHashTable = sector.GetHashTable(reader);
						directoryHashTables.set(directoryPath, currentHashTable);
					}
				}

				const fileSector = GetSector(reader, currentHashTable, parts[parts.length - 1], internationalMode);

				if (fileSector != null) {
					if (loadedFiles.has(file))
						throw new ArgumentException('An item with the same key has already been added.');
					loadedFiles.set(file, fileSector.GetData(reader, ffs));
				}
			} else {
				const fileSector = GetSector(reader, hashTable, file, internationalMode);

				if (fileSector != null) {
					if (loadedFiles.has(file))
						throw new ArgumentException('An item with the same key has already been added.');
					loadedFiles.set(file, fileSector.GetData(reader, ffs));
				}
			}
		}

		return loadedFiles;
	}
}
