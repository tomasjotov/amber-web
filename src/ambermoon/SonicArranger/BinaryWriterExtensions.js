// Port of SonicArranger/BinaryWriterExtensions.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)
// A "BinaryWriter" in this port is any object with Write(value) where value is a byte (number) or a Uint8Array.

export class BinaryWriterExtensions {
	static WriteBEUInt32(writer, value) {
		value = value >>> 0;
		writer.Write((value >>> 24) & 0xff);
		writer.Write((value >>> 16) & 0xff);
		writer.Write((value >>> 8) & 0xff);
		writer.Write(value & 0xff);
	}

	static WriteBEInt32(writer, value) {
		BinaryWriterExtensions.WriteBEUInt32(writer, value >>> 0);
	}

	static WriteBEUInt16(writer, value) {
		writer.Write((value >> 8) & 0xff);
		writer.Write(value & 0xff);
	}

	static WriteBEInt16(writer, value) {
		BinaryWriterExtensions.WriteBEUInt16(writer, value & 0xffff);
	}
}
