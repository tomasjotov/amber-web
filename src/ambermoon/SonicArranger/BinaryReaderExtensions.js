// Port of SonicArranger/BinaryReaderExtensions.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)
// A "BinaryReader" in this port is any object with ReadByte() and ReadBytes(count) (see BuiltinReader.js).

export class BinaryReaderExtensions {
	static ReadBEUInt32(reader) {
		const bytes = reader.ReadBytes(4);
		return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
	}

	static ReadBEInt32(reader) {
		return BinaryReaderExtensions.ReadBEUInt32(reader) | 0;
	}

	static ReadBEUInt16(reader) {
		return ((reader.ReadByte() << 8) | reader.ReadByte()) & 0xffff;
	}

	static ReadBEInt16(reader) {
		return (BinaryReaderExtensions.ReadBEUInt16(reader) << 16) >> 16;
	}
}
