// Port of Ambermoon.Data.Legacy/Serialization/DataReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { AmbermoonEncoding } from '../AmbermoonEncoding.js';
import { ArgumentException, IndexOutOfRangeException } from '../../../runtime.js';

/** Encoding.ASCII replacement (byte <-> char, 7 bit) */
function asciiGetChars(bytes) {
	const chars = [];
	for (let i = 0; i < bytes.length; ++i)
		chars.push(bytes[i] < 0x80 ? String.fromCharCode(bytes[i]) : '?');
	return chars;
}

/** Calls encoding.GetString(bytes) on a byte array (Uint8Array or array). */
function encodingGetString(encoding, bytes) {
	return encoding.GetString(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes));
}

let defaultEncoding = null;

export class DataReader {
	/**
	 * Overloads:
	 * - (data: Uint8Array, offset = 0, length = data.length - offset) (copies the data)
	 * - (reader: IDataReader, offset, size) (copies the data)
	 * - (stream) / (stream, offset, size) of C# are mapped to the byte array variants.
	 */
	constructor(data, offset, length) {
		this.position = 0;
		if (data === undefined) {
			this.data = new Uint8Array(0);
			return;
		}
		if (!(data instanceof Uint8Array) && !Array.isArray(data) && typeof data.ToArray === 'function')
			data = data.ToArray();
		if (Array.isArray(data))
			data = Uint8Array.from(data);
		if (offset === undefined)
			offset = 0;
		if (length === undefined)
			length = data.length - offset;
		this.data = data.slice(offset, offset + length);
		if (this.data.length !== length)
			throw new ArgumentException('Offset and length were out of bounds for the array.');
	}

	static get Encoding() {
		if (defaultEncoding === null)
			defaultEncoding = new AmbermoonEncoding();
		return defaultEncoding;
	}

	get Position() {
		return this.position;
	}

	set Position(value) {
		if (value < 0 || value > this.Size)
			throw new IndexOutOfRangeException('Data index out of range.');

		this.position = value;
	}

	get Size() {
		return this.data.length;
	}

	/** Indexer this[int index] */
	get(index) {
		const value = this.data[index];
		if (value === undefined)
			throw new IndexOutOfRangeException('Index was outside the bounds of the array.');
		return value;
	}

	static FromData(data) {
		const reader = Object.create(DataReader.prototype);
		reader.data = data instanceof Uint8Array ? data : Uint8Array.from(data);
		reader.position = 0;
		return reader;
	}

	AlignToDword() {
		this.position = (this.position + 3) & ~3;
	}

	AlignToWord() {
		this.position = (this.position + 1) & ~1;
	}

	FindByteSequence(sequence, offset) {
		if (offset + sequence.length > this.data.length)
			return -1;

		const data = this.data;
		const n = sequence.length;

		if (n === 0)
			return offset;

		const end = data.length - n;

		for (let i = offset; i <= end; ++i) {
			let j = 0;
			for (; j < n; ++j) {
				if (data[i + j] !== sequence[j])
					break;
			}
			if (j === n)
				return i;
		}

		return -1;
	}

	FindString(str, offset) {
		return this.FindByteSequence(DataReader.Encoding.GetBytes(str), offset);
	}

	checkRead(amount) {
		if (this.position + amount > this.data.length)
			throw new IndexOutOfRangeException('Index was outside the bounds of the array.');
	}

	PeekByte() {
		this.checkRead(1);
		return this.data[this.position];
	}

	PeekWord() {
		this.checkRead(2);
		const d = this.data;
		const p = this.position;
		return (d[p] << 8) | d[p + 1];
	}

	PeekDword() {
		this.checkRead(4);
		const d = this.data;
		const p = this.position;
		return ((d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]) >>> 0;
	}

	ReadBool() {
		return this.ReadByte() !== 0;
	}

	ReadByte() {
		this.checkRead(1);
		return this.data[this.position++];
	}

	ReadBytes(amount) {
		if (amount < 0)
			throw new ArgumentException('Negative amount.');
		this.checkRead(amount);
		const bytes = this.data.slice(this.position, this.position + amount);
		this.position += amount;
		return bytes;
	}

	ReadChar() {
		return this.ReadString(1);
	}

	ReadDword() {
		const value = this.PeekDword();
		this.position += 4;
		return value;
	}

	ReadWord() {
		const value = this.PeekWord();
		this.position += 2;
		return value;
	}

	ReadQword() {
		this.checkRead(8);
		const d = this.data;
		const p = this.position;
		const high = ((d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]) >>> 0;
		const low = ((d[p + 4] << 24) | (d[p + 5] << 16) | (d[p + 6] << 8) | d[p + 7]) >>> 0;
		this.position += 8;
		return high * 0x100000000 + low;
	}

	/** Port addition: reads a qword as BigInt (exact for all 64 bits, e.g. bit masks). */
	ReadQwordAsBigInt() {
		const high = this.ReadDword();
		const low = this.ReadDword();
		return (BigInt(high) << 32n) | BigInt(low);
	}

	/** Overloads: () / (encoding) */
	ReadNullTerminatedString(encoding = DataReader.Encoding) {
		const buffer = [];
		let b;
		let needMoreBytes = false;

		while (this.Position < this.Size && ((b = this.ReadByte()) !== 0 || needMoreBytes)) {
			buffer.push(b);

			// When parsing multi-byte encodings there might be characters which
			// end with a 00-byte. As this is also used for termination we have
			// to check for character ending if the next byte is 00.
			if (!encoding.IsSingleByte && this.Position < this.Size && this.PeekByte() === 0) {
				try {
					encodingGetString(encoding, buffer);
				} catch (e) {
					if (!(e instanceof ArgumentException))
						throw e;
					needMoreBytes = true;
				}
			}
		}

		try {
			return encodingGetString(encoding, buffer);
		} catch (e) {
			if (!(e instanceof ArgumentException))
				throw e;
			return encodingGetString(encoding, buffer.slice(0, buffer.length - 1)) + '?';
		}
	}

	/** Overloads: () / (encoding) / (length) / (length, encoding) */
	ReadString(lengthOrEncoding, encoding) {
		if (lengthOrEncoding === undefined || typeof lengthOrEncoding !== 'number') {
			encoding = lengthOrEncoding ?? DataReader.Encoding;
			const length = this.ReadByte();
			return this.ReadString(length, encoding);
		}

		const length = lengthOrEncoding;
		encoding = encoding ?? DataReader.Encoding;

		if (length === 0)
			return '';

		this.checkRead(length);
		let str = encodingGetString(encoding, this.data.subarray(this.position, this.position + length));
		str = str.replaceAll(encodingGetString(encoding, new Uint8Array([0xb4])), '\'');
		this.position += length;
		return str;
	}

	ReadToEnd() {
		const result = this.data.slice(this.position);
		this.position = this.Size;
		return result;
	}

	ToArray() {
		return this.data;
	}

	// SonicArranger.ICustomReader implementation
	ReadChars(amount) {
		return asciiGetChars(this.ReadBytes(amount));
	}

	ReadBEInt16() {
		return (this.ReadWord() << 16) >> 16;
	}

	ReadBEUInt16() {
		return this.ReadWord();
	}

	ReadBEInt32() {
		return this.ReadDword() | 0;
	}

	ReadBEUInt32() {
		return this.ReadDword();
	}
}
