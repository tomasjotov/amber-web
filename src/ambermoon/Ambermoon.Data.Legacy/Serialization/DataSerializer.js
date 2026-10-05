// Port of Ambermoon.Data.Legacy/Serialization/DataSerializer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { DataReader as DataReaderClass } from './DataReader.js';
import { DataWriter as DataWriterClass } from './DataWriter.js';
import { WriteOperation } from '../../Ambermoon.Data.Common/Serialization/IDataSerializer.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import {
	ArgumentException, ArgumentNullException, ArgumentOutOfRangeException, IndexOutOfRangeException
} from '../../../runtime.js';

function qwordToBytes(value) {
	if (typeof value === 'bigint') {
		value = BigInt.asUintN(64, value);
		const high = Number(value >> 32n);
		const low = Number(value & 0xffffffffn);
		return [(high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff,
			(low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff];
	}
	const high = Math.floor(value / 0x100000000) >>> 0;
	const low = (value % 0x100000000) >>> 0;
	return [(high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff,
		(low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff];
}

/**
 * NOTE (port): Like DataWriter, numeric Write/Append/Replace overloads are split into
 * WriteByte/WriteWord/WriteDword/WriteQword, AppendByte/AppendWord/AppendDword/AppendQword and
 * ReplaceByte/ReplaceWord/ReplaceDword/ReplaceQword. The other overloads keep their C# names.
 * Note: The C# implementation is not used anywhere and has issues (e.g. the appender lambdas of
 * Write(...) call themselves recursively). The logic is ported as is.
 */
export class DataSerializer {
	/**
	 * Overloads:
	 * - (data, writeOperation = Insert)
	 * - (data, offset, writeOperation = Insert)
	 * - (data, offset, length, writeOperation = Insert)
	 */
	constructor(data, ...args) {
		let offset = 0;
		let length;
		let writeOperation = WriteOperation.Insert;

		if (args.length === 1) {
			writeOperation = args[0];
		} else if (args.length === 2) {
			offset = args[0];
			writeOperation = args[1];
		} else if (args.length >= 3) {
			offset = args[0];
			length = args[1];
			writeOperation = args[2];
		}

		if (writeOperation === undefined)
			writeOperation = WriteOperation.Insert;

		if (data == null)
			throw new ArgumentNullException('data');
		if (length === undefined)
			length = data.length - offset;
		if (offset < 0 || offset >= data.length)
			throw new ArgumentOutOfRangeException('offset');
		if (length < 0 || offset + length > data.length)
			throw new ArgumentOutOfRangeException('length');

		this.WriteOperation = WriteOperation.Insert;
		this.Position = 0;

		this.data = Uint8Array.from(data.slice(offset, offset + length));
		this.Size = length;
		this.WriteOperation = writeOperation;
	}

	get DataReader() {
		return new DataReaderClass(this.data, this.Position);
	}

	get DataWriter() {
		return new DataWriterClass(this.data, this.Position);
	}

	/** C# UseReader(Action<IDataReader>) / UseReader<T>(Func<IDataReader, T>) */
	UseReader(reader) {
		const dataReader = this.DataReader;
		const result = reader(dataReader);
		this.Position = dataReader.Position;
		return result;
	}

	/** C# UseWriter(Action<IDataWriter>) / UseWriter<T>(Func<IDataWriter, T>) */
	UseWriter(writer) {
		const dataWriter = this.DataWriter;
		const result = writer(dataWriter);
		this.Position = dataWriter.Position;
		return result;
	}

	AlignToDword() {
		this.UseReader(reader => reader.AlignToDword());
	}

	AlignToWord() {
		this.UseReader(reader => reader.AlignToWord());
	}

	FindByteSequence(sequence, offset) {
		return this.UseReader(reader => reader.FindByteSequence(sequence, offset));
	}

	FindString(str, offset) {
		return this.UseReader(reader => reader.FindString(str, offset));
	}

	PeekByte() {
		return this.UseReader(reader => reader.PeekByte());
	}

	PeekDword() {
		return this.UseReader(reader => reader.PeekDword());
	}

	PeekWord() {
		return this.UseReader(reader => reader.PeekWord());
	}

	ReadBool() {
		return this.UseReader(reader => reader.ReadBool());
	}

	ReadByte() {
		return this.UseReader(reader => reader.ReadByte());
	}

	ReadBytes(amount) {
		return this.UseReader(reader => reader.ReadBytes(amount));
	}

	ReadChar() {
		return this.UseReader(reader => reader.ReadChar());
	}

	ReadDword() {
		return this.UseReader(reader => reader.ReadDword());
	}

	/** Overloads: () / (encoding) */
	ReadNullTerminatedString(encoding) {
		if (encoding === undefined)
			return this.UseReader(reader => reader.ReadNullTerminatedString());
		return this.UseReader(reader => reader.ReadNullTerminatedString(encoding));
	}

	ReadQword() {
		return this.UseReader(reader => reader.ReadQword());
	}

	/** Overloads: () / (encoding) / (length) / (length, encoding) */
	ReadString(...args) {
		return this.UseReader(reader => reader.ReadString(...args));
	}

	ReadToEnd() {
		return this.UseReader(reader => reader.ReadToEnd());
	}

	ReadWord() {
		return this.UseReader(reader => reader.ReadWord());
	}

	ToArray() {
		return this.data;
	}

	GetBytes(offset, length) {
		return this.data.slice(offset, offset + length);
	}

	/**
	 * Overloads: Append(bool) / Append(char|string) / Append(string, length, fillChar) / Append(string, encoding) /
	 * Append(string, encoding, length, fillChar) / Append(byte[]). Numbers: AppendByte/AppendWord/AppendDword/AppendQword.
	 */
	Append(...args) {
		this.UseWriter(writer => writer.Write(...args));
	}

	AppendByte(value) {
		this.UseWriter(writer => writer.WriteByte(value));
	}

	AppendWord(value) {
		this.UseWriter(writer => writer.WriteWord(value));
	}

	AppendDword(value) {
		this.UseWriter(writer => writer.WriteDword(value));
	}

	AppendQword(value) {
		this.UseWriter(writer => writer.WriteQword(value));
	}

	/**
	 * Overloads: Replace(offset, bool) / Replace(offset, byte[] data, dataOffset?, length?).
	 * Numbers: ReplaceByte/ReplaceWord/ReplaceDword/ReplaceQword.
	 */
	Replace(offset, ...args) {
		this.UseWriter(writer => writer.Replace(offset, ...args));
	}

	ReplaceByte(offset, value) {
		this.UseWriter(writer => writer.ReplaceByte(offset, value));
	}

	ReplaceWord(offset, value) {
		this.UseWriter(writer => writer.ReplaceWord(offset, value));
	}

	ReplaceDword(offset, value) {
		this.UseWriter(writer => writer.ReplaceDword(offset, value));
	}

	ReplaceQword(offset, value) {
		this.UseWriter(writer => writer.ReplaceQword(offset, value));
	}

	CopyTo(stream) {
		this.UseWriter(writer => writer.CopyTo(stream));
	}

	AppendEnumAsByte(value) {
		this.UseWriter(writer => writer.WriteEnumAsByte(value));
	}

	AppendEnumAsWord(value) {
		this.UseWriter(writer => writer.WriteEnumAsWord(value));
	}

	/** Overloads: (value) / (value, encoding) */
	AppendNullTerminated(value, encoding) {
		if (encoding === undefined)
			this.UseWriter(writer => writer.WriteNullTerminated(value));
		else
			this.UseWriter(writer => writer.WriteNullTerminated(value, encoding));
	}

	/** Overloads: (value) / (value, encoding) */
	AppendWithoutLength(value, encoding) {
		if (encoding === undefined)
			this.UseWriter(writer => writer.WriteWithoutLength(value));
		else
			this.UseWriter(writer => writer.WriteWithoutLength(value, encoding));
	}

	/**
	 * C# private overloads:
	 * - Write(Action overrider, Action appender)
	 * - Write(Action<IDataWriter> overrider, Action<IDataWriter> appender, Action<IDataWriter, byte[]> byteAppender)
	 */
	WriteWithOperation(overrider, appender, byteAppender) {
		if (byteAppender === undefined) {
			this.WriteWithOperation(_ => overrider(), _ => appender(), (_, bytes) => this.Append(bytes));
			return;
		}

		let writeOperation = this.WriteOperation;

		if (writeOperation === WriteOperation.Insert && this.Position === this.Size)
			writeOperation = WriteOperation.Append;

		switch (writeOperation) {
			case WriteOperation.Insert: {
				const temp = new DataWriterClass();
				const reader = this.DataReader;
				byteAppender(temp, reader.ReadBytes(this.Position));
				appender(temp);
				const position = temp.Size;
				byteAppender(temp, reader.ReadToEnd());
				this.data = temp.ToArray();
				this.Position = position;
				break;
			}
			case WriteOperation.Override:
				overrider(this);
				break;
			case WriteOperation.Append:
				appender(this);
				break;
		}
	}

	/** C# private void Override(int offset, params byte[] data) */
	OverrideAt(offset, data) {
		if (data == null)
			throw new ArgumentNullException('data');
		if (offset < 0 || offset >= this.data.length)
			throw new ArgumentOutOfRangeException('offset');
		if (offset + data.length > this.data.length)
			throw new IndexOutOfRangeException('Data size is out of range.');
		for (let i = 0; i < data.length; ++i)
			this.data[offset + i] = data[i];
	}

	/** C# private void Override(params byte[] data) */
	Override(...data) {
		if (data.length === 1 && (data[0] instanceof Uint8Array || Array.isArray(data[0])))
			data = data[0];
		this.OverrideAt(this.Position, data);
	}

	/**
	 * Overloads: Write(bool) / Write(char|string) / Write(string, length, fillChar = ' ') / Write(string, encoding) /
	 * Write(string, encoding, length, fillChar = ' ') / Write(byte[]).
	 * Numbers: WriteByte/WriteWord/WriteDword/WriteQword.
	 */
	Write(value, arg1, arg2, arg3) {
		if (typeof value === 'boolean') {
			this.WriteWithOperation(() => this.Override(value ? 1 : 0), () => this.Write(value));
		} else if (typeof value === 'string') {
			if (arg1 === undefined) {
				this.Write(value, DataWriterClass.Encoding);
			} else if (typeof arg1 === 'number') {
				this.Write(value, DataWriterClass.Encoding, arg1, arg2 ?? ' ');
			} else if (arg2 === undefined) {
				const encoding = arg1;
				const bytes = encoding.GetBytes(value);

				if (bytes.length > 255)
					throw new AmbermoonException(ExceptionScope.Data, 'Strings must not exceed 255 characters.');

				this.WriteByte(bytes.length);

				if (bytes.length !== 0)
					this.Write(bytes);
			} else {
				const encoding = arg1;
				const length = arg2;
				const fillChar = arg3 ?? ' ';

				if (length > 255)
					throw new AmbermoonException(ExceptionScope.Data, 'Strings must not exceed 255 characters.');

				if (length > value.length)
					value += fillChar.repeat(length - value.length);
				else
					value = value.substring(0, length);

				this.Write(value, encoding);
			}
		} else if (value instanceof Uint8Array || Array.isArray(value)) {
			const bytes = value;
			this.WriteWithOperation(() => this.Override(bytes), () => this.Write(bytes));
		} else if (typeof value === 'bigint') {
			this.WriteQword(value);
		} else {
			throw new ArgumentException('DataSerializer.Write(number) is ambiguous in JavaScript. Use WriteByte, WriteWord, WriteDword or WriteQword.');
		}
	}

	WriteByte(value) {
		this.WriteWithOperation(() => this.Override(value & 0xff), () => this.WriteByte(value));
	}

	WriteWord(value) {
		this.WriteWithOperation(() => this.Override((value >> 8) & 0xff, value & 0xff), () => this.WriteWord(value));
	}

	WriteDword(value) {
		this.WriteWithOperation(() => this.Override((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff), () => this.WriteDword(value));
	}

	WriteQword(value) {
		this.WriteWithOperation(() => this.Override(...qwordToBytes(value)), () => this.WriteQword(value));
	}

	WriteEnumAsByte(value) {
		this.WriteByte(value);
	}

	WriteEnumAsWord(value) {
		this.WriteWord(value);
	}

	/** Overloads: (value) / (value, encoding) */
	WriteNullTerminated(value, encoding = DataWriterClass.Encoding) {
		this.Write(encoding.GetBytes(value + '\0'));
	}

	/** Overloads: (value) / (value, encoding) */
	WriteWithoutLength(value, encoding = DataWriterClass.Encoding) {
		this.Write(encoding.GetBytes(value));
	}
}
