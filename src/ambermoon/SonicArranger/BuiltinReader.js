// Port of SonicArranger/BuiltinReader.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

import { EndOfStreamException } from '../../runtime.js';
import { BinaryReaderExtensions } from './BinaryReaderExtensions.js';

/**
 * Replacement for System.IO.BinaryReader over an in-memory byte array
 * (there are no .NET streams in the browser). Encoding is ASCII.
 */
class MemoryBinaryReader {
	constructor(data) {
		this.data = data instanceof Uint8Array ? data : new Uint8Array(data);
		this.position = 0;
		const self = this;
		this.BaseStream = {
			get Position() { return self.position; },
			set Position(value) { self.position = value; },
			get Length() { return self.data.length; }
		};
	}

	ReadByte() {
		if (this.position >= this.data.length)
			throw new EndOfStreamException('Unable to read beyond the end of the stream.');
		return this.data[this.position++];
	}

	ReadBytes(count) {
		const end = Math.min(this.data.length, this.position + count);
		const bytes = this.data.slice(this.position, end);
		this.position = end;
		return bytes;
	}

	ReadChars(count) {
		// Like BinaryReader.ReadChars this returns less chars at the end of the stream.
		const bytes = this.ReadBytes(count);
		return Array.from(bytes, b => (b < 0x80 ? String.fromCharCode(b) : '?'));
	}

	Dispose() {
		this.data = null;
	}
}

/**
 * The C# class wraps a BinaryReader. In this port the constructor accepts
 * a BinaryReader-like object (ReadByte, ReadBytes, ReadChars, BaseStream.Position/Length)
 * or raw data (Uint8Array / ArrayBuffer / byte array).
 */
export class BuiltinReader {
	constructor(reader) {
		this.reader = null;
		if (reader instanceof Uint8Array || reader instanceof ArrayBuffer || Array.isArray(reader))
			reader = new MemoryBinaryReader(reader);
		this.reader = reader;
	}

	get Position() { return this.reader.BaseStream.Position | 0; }
	set Position(value) { this.reader.BaseStream.Position = value; }

	get Size() { return this.reader.BaseStream.Length | 0; }

	ReadBEInt16() { return BinaryReaderExtensions.ReadBEInt16(this.reader); }

	ReadBEInt32() { return BinaryReaderExtensions.ReadBEInt32(this.reader); }

	ReadBEUInt16() { return BinaryReaderExtensions.ReadBEUInt16(this.reader); }

	ReadBEUInt32() { return BinaryReaderExtensions.ReadBEUInt32(this.reader); }

	ReadByte() { return this.reader.ReadByte(); }

	ReadBytes(amount) { return this.reader.ReadBytes(amount); }

	ReadChars(amount) { return this.reader.ReadChars(amount); }

	Dispose() {
		this.reader?.Dispose?.();
		this.reader = null;
	}
}
