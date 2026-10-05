// Port of Ambermoon.Data.Legacy/Serialization/AmigaExecutable.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { DataReader } from './DataReader.js';
import { Deploder } from './Deploder.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import {
	ArgumentException, ArgumentOutOfRangeException, Exception, InvalidOperationException, NotSupportedException, enumName, last
} from '../../../runtime.js';

/** NullReferenceException replacement */
class NullReferenceException extends Exception { }

/** Encoding.GetEncoding("iso-8859-1") replacement (simple byte <-> char mapping). */
class Latin1Encoding {
	get IsSingleByte() {
		return true;
	}

	/** Overloads: (bytes) / (bytes, index, count) */
	GetString(bytes, index = 0, count = bytes.length - index) {
		let s = '';
		for (let i = 0; i < count; ++i)
			s += String.fromCharCode(bytes[index + i]);
		return s;
	}

	GetBytes(str) {
		const bytes = new Uint8Array(str.length);
		for (let i = 0; i < str.length; ++i) {
			const code = str.charCodeAt(i);
			bytes[i] = code < 256 ? code : 0x3f; // '?'
		}
		return bytes;
	}
}

const HunkType = Object.freeze({
	Code: 0x3E9,
	Data: 0x3EA,
	BSS: 0x3EB,
	RELOC32: 0x3EC,
	END: 0x3F2
});

class Hunk {
	/** Without arguments this is the default struct value (used for object initializers). */
	constructor(hunkType, memoryFlags = 0, data = null, numEntries = null) {
		this.Type = 0;
		this.Size = 0;
		this.MemoryFlags = 0;
		this.NumEntries = 0;
		this.Data = null;

		if (hunkType === undefined)
			return;

		this.Type = hunkType;
		this.MemoryFlags = memoryFlags;

		if (this.Type === HunkType.Code || this.Type === HunkType.Data) {
			if (data == null)
				throw new InvalidOperationException('Code/data hunks need non-null data value.');

			this.Data = data;

			if (numEntries != null) {
				const size = numEntries * 4;

				if (size > this.Data.length)
					throw new ArgumentOutOfRangeException('numEntries * 4 exceeds data size.');

				if (size < this.Data.length)
					this.Data = this.Data.slice(0, size);
			} else if (this.Data.length % 4 !== 0) {
				throw new InvalidOperationException('Hunk data size must be a multiple of 4.');
			}

			this.Size = this.NumEntries = Math.trunc(this.Data.length / 4);
		} else if (this.Type === HunkType.BSS) {
			if (numEntries == null)
				throw new NullReferenceException('BSS hunks need a non-null value for numEntries.');
			this.Size = this.NumEntries = numEntries;
			this.Data = null;
		} else if (this.Type === HunkType.RELOC32) {
			throw new NotSupportedException('Creating RELOC32 hunks via constructor is not supported.');
		} else if (this.Type === HunkType.END) {
			this.NumEntries = 0;
			this.Size = 0;
			this.Data = null;
		} else {
			throw new NotSupportedException('Not supported or invalid hunk type.');
		}
	}

	clone() {
		return Object.assign(new Hunk(), this);
	}
}

class Reloc32Hunk {
	constructor() {
		this.Type = 0;
		this.Size = 0;
		this.MemoryFlags = 0;
		/** Map<uint, uint[]> */
		this.Entries = null;
	}

	clone() {
		return Object.assign(new Reloc32Hunk(), this);
	}
}

function createHunk(init) {
	return Object.assign(new Hunk(), init);
}

const ImplodeHunkHeader = new Uint8Array([
	0x48, 0xe7, 0xff, 0xff, 0x49, 0xfa, 0x00, 0x5e, 0x3c, 0x3c
]);

function addEntry(entries, key, value) {
	if (entries.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	entries.set(key, value);
}

/**
 * The imploder creates
 * - 1 first code hunk (startup code)
 * - n BSS hunks (one for each in the deploded file except for RELOC32 hunks) which allocate empty memory
 * - then another code hunk (actual decompression logic)
 * - then a data hunk (compressed data of all destination hunks)
 * - and finally another BSS hunk (decompression buffer)
 *
 * The hunk sizes of the deploded hunks match the sizes of the BSS allocations.
 *
 * AM2_CPU has 8 hunks:
 * - Code
 * - Reloc32
 * - 2x BSS
 * - 2x Data (this is what we want!)
 * - Another Reloc32
 * - Another BSS
 *
 * The Reloc32 hunks are not reflected in the imploder BSS hunks.
 *
 * If we are only interested in the data (and maybe code) hunks of AM2_CPU
 * we can just get the file sizes from the first, fourth and fifth BSS hunk
 * which are the deploded sizes (without the header -> number of dwords).
 */
export class AmigaExecutable {
	// Note: Amiga executables store strings in encoding "Amiga Commodore".
	// It is very similar to iso-8859-1 except for 4 modifications which
	// shouldn't matter for language texts. So we just use iso-8859-1.
	static Encoding = new Latin1Encoding();

	static Write(dataWriter, hunks) {
		const realHunks = hunks.filter(h => h.Type !== HunkType.END && h.Type !== HunkType.RELOC32);

		dataWriter.WriteDword(0x000003F3);
		dataWriter.WriteDword(0);
		dataWriter.WriteDword(realHunks.length);
		dataWriter.WriteDword(0);
		dataWriter.WriteDword((realHunks.length - 1) >>> 0);

		for (const hunk of realHunks) {
			if ((hunk.MemoryFlags & 0x3fffffff) !== 0 ||
				(hunk.MemoryFlags >>> 0) === 0xc0000000)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid hunk memory flags');

			if (hunk.Size > 0x3fffffff)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid hunk size');

			const header = (hunk.Size | hunk.MemoryFlags) >>> 0;
			dataWriter.WriteDword(header);
		}

		for (const hunk of hunks) {
			dataWriter.WriteDword(hunk.Type);

			switch (hunk.Type) {
				case HunkType.Code:
				case HunkType.Data: {
					const dataHunk = hunk;

					if (dataHunk.Data.length !== dataHunk.NumEntries * 4)
						throw new AmbermoonException(ExceptionScope.Data, 'Mismatching NumEntries value and Data length for code/data hunk.');

					if (dataHunk.NumEntries !== hunk.Size)
						throw new AmbermoonException(ExceptionScope.Data, 'Mismatching NumEntries value and hunk size for code/data hunk.');

					dataWriter.WriteDword(dataHunk.NumEntries);
					dataWriter.Write(dataHunk.Data);
					break;
				}
				case HunkType.BSS: {
					const bssHunk = hunk;

					if (bssHunk.NumEntries !== hunk.Size)
						throw new AmbermoonException(ExceptionScope.Data, 'Mismatching NumEntries value and hunk size for BSS hunk.');

					dataWriter.WriteDword(bssHunk.NumEntries);

					break;
				}
				case HunkType.RELOC32: {
					const relocHunk = hunk;
					const start = dataWriter.Position;

					for (const [key, value] of relocHunk.Entries) {
						dataWriter.WriteDword(value.length);
						dataWriter.WriteDword(key);

						for (const offset of value)
							dataWriter.WriteDword(offset);
					}

					dataWriter.WriteDword(0); // end marker
					if (dataWriter.Position - start !== hunk.Size)
						throw new AmbermoonException(ExceptionScope.Application, 'Error writing RELOC32 hunk data');
					break;
				}
			}
		}

		if (hunks[hunks.length - 1].Type !== HunkType.END)
			dataWriter.WriteDword(HunkType.END);
	}

	static Read(dataReader, deplodeIfNecessary = true) {
		dataReader.Position = 0;

		function Throw() {
			throw new AmbermoonException(ExceptionScope.Data, 'Invalid executable file.');
		}

		if (dataReader.ReadDword() !== 0x000003F3)
			Throw();

		if (dataReader.ReadDword() !== 0) // number of library strings (should be 0)
			Throw();

		let numHunks = dataReader.ReadDword();
		const firstHunk = dataReader.ReadDword();
		const lastHunk = dataReader.ReadDword();

		if (((lastHunk - firstHunk + 1) >>> 0) !== numHunks)
			Throw();

		const hunkSizes = new Array(numHunks).fill(0);
		const hunkMemoryFlags = new Array(numHunks).fill(0);

		for (let i = 0; i < numHunks; ++i) {
			const hunkSize = dataReader.ReadDword();
			let hunkMemFlags = (hunkSize & 0xc0000000) >>> 0;

			if (hunkMemFlags === 0xc0000000) // extended mem flags
				hunkMemFlags = (dataReader.ReadDword() & 0x80000000) >>> 0;

			hunkSizes[i] = hunkSize & 0x3FFFFFFF;
			hunkMemoryFlags[i] = hunkMemFlags;
		}

		const hunks = [];
		let realHunkIndex = 0;

		for (let i = 0; i < numHunks; ++i) {
			const type = dataReader.ReadDword() & 0x1fffffff;
			let hunk;

			switch (type) {
				case HunkType.Code:
				case HunkType.Data: {
					const numEntries = dataReader.ReadDword();
					hunk = createHunk({
						Type: type,
						Size: hunkSizes[realHunkIndex],
						MemoryFlags: hunkMemoryFlags[realHunkIndex],
						NumEntries: numEntries,
						Data: dataReader.ReadBytes(numEntries * 4)
					});
					++realHunkIndex;
					break;
				}
				case HunkType.BSS: {
					const allocSize = dataReader.ReadDword();
					hunk = createHunk({
						Type: type,
						Size: hunkSizes[realHunkIndex],
						MemoryFlags: hunkMemoryFlags[realHunkIndex],
						NumEntries: allocSize,
						Data: null
					});
					++realHunkIndex;
					break;
				}
				case HunkType.RELOC32: {
					const entries = new Map();
					let numOffsets;
					const start = dataReader.Position;

					while ((numOffsets = dataReader.ReadDword()) !== 0) {
						const hunkNumber = dataReader.ReadDword();
						addEntry(entries, hunkNumber, []);
						const list = entries.get(hunkNumber);

						for (let o = 0; o < numOffsets; ++o)
							list.push(dataReader.ReadDword());
					}

					hunk = new Reloc32Hunk();
					hunk.Type = type;
					hunk.Size = dataReader.Position - start;
					hunk.MemoryFlags = 0;
					hunk.Entries = entries;

					++numHunks;
					break;
				}
				case HunkType.END: {
					hunk = createHunk({
						Type: type,
						Size: 0,
						MemoryFlags: 0,
						NumEntries: 0,
						Data: null
					});
					++numHunks;
					break;
				}
				default:
					throw new AmbermoonException(ExceptionScope.Data, `Unsupported hunk type: ${enumName(HunkType, type)}.`);
			}

			hunks.push(hunk);
		}

		// There might be an END hunk at the end
		if (dataReader.Position <= dataReader.Size - 4) {
			if ((dataReader.PeekDword() & 0x1fffffff) === HunkType.END) {
				dataReader.Position += 4;
				hunks.push(createHunk({
					Type: HunkType.END,
					Size: 0,
					MemoryFlags: 0,
					NumEntries: 0,
					Data: null
				}));
			}
		}

		if (deplodeIfNecessary) {
			let imploded = false;

			if (hunks.length !== 0) {
				imploded = true;
				const firstHunkData = hunks[0].Data;

				for (let i = 0; i < ImplodeHunkHeader.length; ++i) {
					if (firstHunkData[i] !== ImplodeHunkHeader[i]) {
						imploded = false;
						break;
					}
				}

				if (!imploded) {
					// Check if it is library imploded.
					const start = AmigaExecutable.Encoding.GetString(firstHunkData.slice(0, 200));

					if (start.includes('I need explode.library'))
						throw new NotSupportedException('Library imploded files are not supported!');
				}
			}

			return imploded ? AmigaExecutable.ReadImploded(hunks) : hunks;
		}

		return hunks;
	}

	static ReadImploded(imploderHunks) {
		// TODO: There is one known bug where the second code hunk of AM2_BLIT is read as a data hunk instead.

		const [deplodedData, hunkSizes, hunkMemFlags] = AmigaExecutable.Deplode(imploderHunks);
		const hunks = [];
		const reader = DataReader.FromData(deplodedData);
		let hunkSizeIndex = 0;

		while (true) {
			const header = reader.ReadDword();
			const flags = header >>> 30;
			let hunkSize = header & 0x3FFFFFFF;

			// Note: The following is just guessing from analyzing the data but it works quite good.
			// Code hunks seem to have flags = 0.
			// BSS and DATA have flags = 2 or 3 (BSS has size 0).
			// 3 is used if no END hunk follows. This is the case for DATA hunks with RELOC32 following or hunks at the end.
			// RELOC32 seems to have flags = 1.
			// END hunks are inserted after each hunk expect for flags = 3 or if a RELOC32 follows.
			// An END hunk should also not be added at the very end.

			if (flags === 2 || flags === 3) { // BSS or DATA
				if (reader.Position < reader.Size && (reader.PeekDword() & 0x3fffffff) !== 0) { // a size follows -> no BSS but DATA
					hunkSize = reader.ReadDword() & 0x3fffffff;

					if (hunkSize * 4 !== hunkSizes[hunkSizeIndex])
						throw new AmbermoonException(ExceptionScope.Data, 'Invalid hunk data size.');

					hunks.push(createHunk({
						Type: HunkType.Data,
						Size: hunkSize,
						MemoryFlags: hunkMemFlags[hunkSizeIndex],
						NumEntries: hunkSize,
						Data: reader.ReadBytes(hunkSize * 4)
					}));
				} else { // BSS
					if (hunkSizeIndex === hunkSizes.length && reader.Position === reader.Size)
						break;

					if (hunkSizeIndex >= hunkSizes.length)
						throw new ArgumentOutOfRangeException('Index was out of range.');

					hunks.push(createHunk({
						Type: HunkType.BSS,
						Size: Math.trunc(hunkSizes[hunkSizeIndex] / 4),
						MemoryFlags: hunkMemFlags[hunkSizeIndex],
						NumEntries: Math.trunc(hunkSizes[hunkSizeIndex] / 4)
					}));
				}

				++hunkSizeIndex;
			} else if (flags === 0) { // CODE
				if (hunkSize * 4 !== hunkSizes[hunkSizeIndex])
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid hunk data size.');

				hunks.push(createHunk({
					Type: HunkType.Code,
					Size: hunkSize,
					MemoryFlags: hunkMemFlags[hunkSizeIndex],
					NumEntries: hunkSize,
					Data: reader.ReadBytes(hunkSize * 4)
				}));

				++hunkSizeIndex;
			} else if (flags === 1) { // RELOC32
				const entries = new Map();
				let numOffsets;
				const start = reader.Position;

				// Note: The imploder stores the reloc offsets as deltas!

				while ((numOffsets = reader.ReadDword()) !== 0) {
					let currentOffset = 0;
					const hunkNumber = reader.ReadDword();
					addEntry(entries, hunkNumber, []);
					const list = entries.get(hunkNumber);

					for (let o = 0; o < numOffsets; ++o) {
						currentOffset = (currentOffset + reader.ReadDword()) >>> 0;
						list.push(currentOffset);
					}
				}

				const relocHunk = new Reloc32Hunk();
				relocHunk.Type = HunkType.RELOC32;
				relocHunk.Size = reader.Position - start;
				relocHunk.MemoryFlags = hunkSizeIndex === 0 ? 0 : hunkMemFlags[hunkSizeIndex - 1];
				relocHunk.Entries = entries;
				hunks.push(relocHunk);
			}

			if (reader.Position <= reader.Size - 4) {
				const nextHeader = reader.PeekDword();
				const nextFlags = nextHeader >>> 30;

				if (nextFlags === 1) // RELOC32 follows, do not add END
					continue;
			}

			if (reader.Position === reader.Size)
				break;

			// add END hunk if necessary
			if (flags !== 3)
				hunks.push(createHunk({ Type: HunkType.END }));
		}

		if (hunks[hunks.length - 1].Type === HunkType.END)
			hunks.splice(hunks.length - 1, 1);

		return hunks;
	}

	/**
	 * Overloads:
	 * - Deplode(dataReader: IDataReader) (public)
	 * - Deplode(imploderHunks: IHunk[]) (private in C#)
	 * out params -> returns [deplodedData, deplodedHunkSizes, deplodedMemFlags]
	 */
	static Deplode(dataReaderOrHunks) {
		if (!Array.isArray(dataReaderOrHunks))
			return AmigaExecutable.Deplode(AmigaExecutable.Read(dataReaderOrHunks, false));

		const imploderHunks = dataReaderOrHunks;
		let deplodedHunkSizes = [];
		let deplodedMemFlags = [];

		const lastCodeHunk = last(imploderHunks, h => h.Type === HunkType.Code);
		const dataHunk = last(imploderHunks, h => h.Type === HunkType.Data);

		// Values are located at offset 0x188 in last code hunk.
		// The bit length (last 12 bytes) can have a special encoding.
		// If smaller than 8 the normal value is stored (e.g. 0x07).
		// But if 8 or more the length is encoded by subtracting 8 and setting the most significant bit to 1.
		// Examples:
		// - bitlength = 8 -> stored as 0x80
		// - bitlength = 9 -> stored as 0x81
		// In those cases first a full byte from the input stream is read and then continued with the remaining
		// bits from the bit buffer.
		// Example with bitlength 9 (0x81):
		//  result = (read_byte() << 1) | read_bit_from_bit_buffer();
		const table = lastCodeHunk.Data.slice(0x188, 0x188 + 8 * 2 + 12 * 1);
		const bssHunks = imploderHunks.filter(h => h.Type === HunkType.BSS);
		deplodedHunkSizes = bssHunks.slice(0, Math.max(0, bssHunks.length - 1)).map(h => h.NumEntries * 4);
		deplodedMemFlags = bssHunks.slice(0, Math.max(0, bssHunks.length - 1)).map(h => h.MemoryFlags);
		const data = dataHunk.Data;
		const firstLiteralLength = ((lastCodeHunk.Data[0x1E6] << 8) | lastCodeHunk.Data[0x1E7]) >>> 0;
		const initialBitBuffer = lastCodeHunk.Data[0x1E8];
		const dataSize = ((lastCodeHunk.Data[0x08] << 24) | (lastCodeHunk.Data[0x09] << 16) | (lastCodeHunk.Data[0x0A] << 8) | lastCodeHunk.Data[0x00B]) >>> 0;

		const buffer = new Deploder.IncreaseBuffer(data.length); // deploded data is at least the size of the imploded data

		if (!Deploder.Deplode(data, buffer, table, dataSize, firstLiteralLength, initialBitBuffer))
			throw new AmbermoonException(ExceptionScope.Data, 'Invalid imploded data.');

		return [buffer.ToArray(), deplodedHunkSizes, deplodedMemFlags];
	}
}

AmigaExecutable.HunkType = HunkType;
AmigaExecutable.Hunk = Hunk;
AmigaExecutable.Reloc32Hunk = Reloc32Hunk;

export { HunkType as AmigaExecutable_HunkType, Hunk as AmigaExecutable_Hunk, Reloc32Hunk as AmigaExecutable_Reloc32Hunk };
