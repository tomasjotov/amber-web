// Container file reading (port of Amber.Serialization.FileReader and Lob).
import { DataReader } from './reader.js';

export const FileType = {
	None: 0,
	JH: 0x4a480000,
	LOB: 0x014c4f42,
	VOL1: 0x564f4c31,
	AMNC: 0x414d4e43,
	AMNP: 0x414d4e50,
	AMBR: 0x414d4252,
	AMPC: 0x414d5043,
	AMTX: 0x414d5458,
};

export function lobDecompress(reader, decodedSize) {
	const out = new Uint8Array(decodedSize);
	let pos = 0;

	while (pos < decodedSize) {
		let header = reader.readByte();

		for (let i = 0; i < 8; i++) {
			if ((header & 0x80) === 0) {
				let offset = reader.readByte();
				let length = (offset & 0x0f) + 3;
				offset = ((offset << 4) & 0xff00) | reader.readByte();
				let matchIndex = pos - offset;
				while (length-- !== 0)
					out[pos++] = out[matchIndex++];
			} else {
				out[pos++] = reader.readByte();
			}

			if (pos >= decodedSize)
				break;

			header <<= 1;
		}
	}

	return new DataReader(out.subarray(0, decodedSize));
}

function decodeFile(reader) {
	const header = reader.size < 4 ? 0 : reader.peekDword();

	if ((header & 0xffff0000) >>> 0 === FileType.JH)
		throw new Error('JH encoded files are not supported');

	if (header === FileType.LOB || header === FileType.VOL1) {
		reader.position += 4;
		const decodedSize = reader.peekDword() & 0x00ffffff;
		reader.position += 8; // decoded and encoded size
		return lobDecompress(reader, decodedSize);
	}

	return reader;
}

/**
 * Reads a container file and returns a Map of 1-based file index -> DataReader.
 */
export function readContainer(bytes) {
	const reader = new DataReader(bytes);
	const files = new Map();

	if (reader.size === 0)
		return files;

	const header = reader.readDword();

	switch (header) {
		case FileType.LOB:
		case FileType.VOL1:
			reader.position = 0;
			files.set(1, decodeFile(reader));
			return files;
		case FileType.AMBR:
		case FileType.AMPC:
		case FileType.AMNC:
		case FileType.AMNP:
		case FileType.AMTX: {
			if (header === FileType.AMNC || header === FileType.AMNP)
				throw new Error('Encrypted containers are not supported');
			let fileCount = reader.readWord();
			const type = fileCount >> 14;
			fileCount &= 0x3ff;

			if (type !== 0 && type !== 2)
				throw new Error('Sectioned containers are not supported');

			const entrySize = type === 2 ? 2 : 4;
			let offset = 6 + fileCount * entrySize;

			for (let i = 1; i <= fileCount; i++) {
				const fileSize = type === 2 ? reader.readWord() : reader.readDword();
				files.set(i, fileSize === 0
					? new DataReader(new Uint8Array(0))
					: decodeFile(new DataReader(reader.data, offset, fileSize)));
				offset += fileSize;
			}
			return files;
		}
		default:
			files.set(1, new DataReader(reader.data));
			return files;
	}
}

/** Port of PrgReader: reads a GEMDOS PRG file */
export function readPrg(reader) {
	if (reader.peekWord() !== 0x601a)
		throw new Error('Invalid PRG file');

	reader.position += 2;
	const textLength = reader.readDword();
	const dataLength = reader.readDword();
	const bssLength = reader.readDword();
	const symbolTableSize = reader.readDword();
	reader.position += 4; // reserved
	reader.readDword(); // flags
	const relocInfo = reader.readWord();
	const text = reader.readBytes(textLength);
	const data = reader.readBytes(dataLength);
	reader.position += symbolTableSize;

	const relocTable = [];

	if (relocInfo === 0) {
		let offset = reader.readDword();

		const getAddress = o => ((text[o] << 24) >>> 0) + ((text[o + 1] << 16) | (text[o + 2] << 8) | text[o + 3]);

		if (offset !== 0) {
			relocTable.push(getAddress(offset));

			while (true) {
				const next = reader.readByte();
				if (next === 0)
					break;
				if (next === 1)
					offset += 254;
				else {
					offset += next;
					relocTable.push(getAddress(offset));
				}
			}
		}
	}

	return { text, data, bssLength, relocTable };
}
