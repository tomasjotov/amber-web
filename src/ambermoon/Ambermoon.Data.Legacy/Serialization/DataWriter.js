// Port of Ambermoon.Data.Legacy/Serialization/DataWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { DataReader } from './DataReader.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { ArgumentException, IndexOutOfRangeException } from '../../../runtime.js';

/**
 * NOTE (port): C# overloads Write(byte)/Write(word)/Write(dword)/Write(qword) can not be
 * distinguished in JavaScript. Use the explicit methods WriteByte, WriteWord, WriteDword,
 * WriteQword (and ReplaceByte, ReplaceWord, ReplaceDword, ReplaceQword) for numbers.
 * Write(number) / Replace(offset, number) throw to make wrong usage visible.
 * Write(bool), Write(string ...), Write(char as 1-char string) and Write(bytes) work as in C#.
 */
export class DataWriter {
	/**
	 * Overloads:
	 * - ()
	 * - (data: Uint8Array, offset = 0, length = data.length - offset)
	 * - (writer: IDataWriter, offset, size)
	 */
	constructor(data, offset, length) {
		this.data = [];
		this.Position = 0;

		if (data === undefined)
			return;

		if (!(data instanceof Uint8Array) && !Array.isArray(data) && typeof data.ToArray === 'function')
			data = data.ToArray();

		if (offset === undefined)
			offset = 0;
		if (length === undefined)
			length = data.length - offset;

		if (offset < 0 || length < 0 || offset + length > data.length)
			throw new ArgumentException('Offset and length were out of bounds for the array.');

		for (let i = 0; i < length; ++i)
			this.data.push(data[offset + i]);
	}

	static get Encoding() {
		return DataReader.Encoding;
	}

	get Size() {
		return this.data.length;
	}

	/** Indexer get */
	get(index) {
		if (index < 0 || index >= this.data.length)
			throw new IndexOutOfRangeException('Index was out of range.');
		return this.data[index];
	}

	/** Indexer set */
	set(index, value) {
		if (index === this.data.length)
			this.data.push(value & 0xff);
		else if (index < 0 || index > this.data.length)
			throw new IndexOutOfRangeException('Index was out of range.');
		else
			this.data[index] = value & 0xff;
	}

	/**
	 * Overloads:
	 * - Write(bool)
	 * - Write(char) / Write(string)
	 * - Write(string, length, fillChar = ' ')
	 * - Write(string, encoding)
	 * - Write(string, encoding, length, fillChar = ' ')
	 * - Write(byte[]) / Write(ReadOnlySpan<byte>)
	 * Numbers: use WriteByte / WriteWord / WriteDword / WriteQword.
	 */
	Write(value, arg1, arg2, arg3) {
		if (typeof value === 'boolean') {
			this.WriteBool(value);
		} else if (typeof value === 'string') {
			if (arg1 === undefined)
				this.WriteString(value, DataWriter.Encoding);
			else if (typeof arg1 === 'number')
				this.WriteFixedString(value, DataWriter.Encoding, arg1, arg2 ?? ' ');
			else if (arg2 === undefined)
				this.WriteString(value, arg1);
			else
				this.WriteFixedString(value, arg1, arg2, arg3 ?? ' ');
		} else if (value instanceof Uint8Array || Array.isArray(value)) {
			this.WriteBytes(value);
		} else if (typeof value === 'bigint') {
			this.WriteQword(value);
		} else if (typeof value === 'number') {
			throw new ArgumentException('DataWriter.Write(number) is ambiguous in JavaScript. Use WriteByte, WriteWord, WriteDword or WriteQword.');
		} else {
			throw new ArgumentException('Unsupported value type for DataWriter.Write.');
		}
	}

	WriteBool(value) {
		this.data.push(value ? 1 : 0);
		this.Position++;
	}

	WriteByte(value) {
		this.data.push(value & 0xff);
		this.Position++;
	}

	WriteWord(value) {
		this.data.push((value >>> 8) & 0xff, value & 0xff);
		this.Position += 2;
	}

	WriteDword(value) {
		value = value >>> 0;
		this.data.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
		this.Position += 4;
	}

	/** value may be a number or a BigInt (for full 64 bit values like bit masks) */
	WriteQword(value) {
		if (typeof value === 'bigint') {
			value = BigInt.asUintN(64, value);
			this.WriteDword(Number(value >> 32n));
			this.WriteDword(Number(value & 0xffffffffn));
			return;
		}
		const high = Math.floor(value / 0x100000000) >>> 0;
		const low = (value % 0x100000000) >>> 0;
		this.WriteDword(high);
		this.WriteDword(low);
	}

	/** C# Write(string value, Encoding encoding) */
	WriteString(value, encoding = DataWriter.Encoding) {
		const bytes = encoding.GetBytes(value);

		if (bytes.length > 255)
			throw new AmbermoonException(ExceptionScope.Data, 'Strings must not exceed 255 characters.');

		this.WriteByte(bytes.length);

		if (bytes.length !== 0)
			this.WriteBytes(bytes);
	}

	/** C# Write(string value, Encoding encoding, int length, char fillChar = ' ') */
	WriteFixedString(value, encoding, length, fillChar = ' ') {
		if (length > 255)
			throw new AmbermoonException(ExceptionScope.Data, 'Strings must not exceed 255 characters.');

		if (length > value.length)
			value += fillChar.repeat(length - value.length);
		else
			value = value.substring(0, length);

		this.WriteString(value, encoding);
	}

	/** Overloads: (value) / (value, encoding) */
	WriteNullTerminated(value, encoding = DataWriter.Encoding) {
		this.WriteBytes(encoding.GetBytes(value));
		this.WriteByte(0);
	}

	/** Overloads: (value) / (value, encoding) */
	WriteWithoutLength(value, encoding = DataWriter.Encoding) {
		this.WriteBytes(encoding.GetBytes(value));
	}

	/** C# Write(byte[] bytes) */
	WriteBytes(bytes) {
		for (let i = 0; i < bytes.length; ++i)
			this.data.push(bytes[i] & 0xff);
		this.Position += bytes.length;
	}

	/**
	 * Overloads:
	 * - Replace(offset, bool)
	 * - Replace(offset, byte[] data, dataOffset = 0, length = data.length - dataOffset)
	 * Numbers: use ReplaceByte / ReplaceWord / ReplaceDword / ReplaceQword.
	 */
	Replace(offset, value, dataOffset, length) {
		if (typeof value === 'boolean') {
			this.ReplaceByte(offset, value ? 1 : 0);
		} else if (value instanceof Uint8Array || Array.isArray(value)) {
			if (dataOffset === undefined)
				dataOffset = 0;
			if (length === undefined)
				length = value.length - dataOffset;
			this.ReplaceBytes(offset, value, dataOffset, length);
		} else if (typeof value === 'number') {
			throw new ArgumentException('DataWriter.Replace(offset, number) is ambiguous in JavaScript. Use ReplaceByte, ReplaceWord, ReplaceDword or ReplaceQword.');
		} else {
			throw new ArgumentException('Unsupported value type for DataWriter.Replace.');
		}
	}

	ReplaceBool(offset, value) {
		this.ReplaceByte(offset, value ? 1 : 0);
	}

	ReplaceByte(offset, value) {
		if (offset < 0 || offset + 1 > this.Size)
			throw new IndexOutOfRangeException('Index was outside the data writer size.');

		this.data[offset] = value & 0xff;
	}

	ReplaceWord(offset, value) {
		this.ReplaceBytes(offset, [(value >>> 8) & 0xff, value & 0xff], 0, 2);
	}

	ReplaceDword(offset, value) {
		value = value >>> 0;
		this.ReplaceBytes(offset, [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff], 0, 4);
	}

	ReplaceQword(offset, value) {
		if (typeof value === 'bigint') {
			value = BigInt.asUintN(64, value);
			this.ReplaceDword(offset, Number(value >> 32n));
			this.ReplaceDword(offset + 4, Number(value & 0xffffffffn));
			return;
		}
		const high = Math.floor(value / 0x100000000) >>> 0;
		const low = (value % 0x100000000) >>> 0;
		this.ReplaceDword(offset, high);
		this.ReplaceDword(offset + 4, low);
	}

	ReplaceBytes(offset, data, dataOffset = 0, length = data.length - dataOffset) {
		if (dataOffset < 0 || dataOffset + length > data.length)
			throw new IndexOutOfRangeException('Index was outside the given data array.');

		if (offset < 0 || offset + length > this.Size)
			throw new IndexOutOfRangeException('Index was outside the data writer size.');

		for (let i = 0; i < length; i++)
			this.data[offset + i] = data[dataOffset + i] & 0xff;
	}

	/** C# CopyTo(Stream): the target must provide Write(bytes, offset, count) (or be an array to push to). */
	CopyTo(stream) {
		if (Array.isArray(stream))
			stream.push(...this.data);
		else
			stream.Write(this.ToArray(), 0, this.data.length);
	}

	ToArray() {
		return Uint8Array.from(this.data);
	}

	GetBytes(offset, length) {
		if (offset < 0 || length < 0 || offset + length > this.data.length)
			throw new ArgumentException('Offset and length were out of bounds.');
		return Uint8Array.from(this.data.slice(offset, offset + length));
	}

	WriteEnumAsByte(value) {
		this.WriteByte(value);
	}

	WriteEnumAsWord(value) {
		this.WriteWord(value);
	}

	Remove(index, count) {
		if (index >= this.Size)
			return;

		if (index < 0 || count < 0 || index + count > this.data.length)
			throw new ArgumentException('Offset and length were out of bounds.');

		this.data.splice(index, count);
	}

	Clear() {
		this.data.length = 0;
		this.Position = 0;
	}
}
