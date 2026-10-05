// Port of Ambermoon.Data.Legacy/Compression/JH.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

function ReadWord(data, offset) {
	return ((data[offset] << 8) | data[offset + 1]) & 0xffff;
}

function WriteWord(data, offset, word) {
	data[offset] = (word >> 8) & 0xff;

	if (offset < data.length - 1)
		data[offset + 1] = word & 0xff;
}

export class JH {
	/**
	 * This will de- or encrypt data with the JH encryption.
	 * Overloads:
	 * - Crypt(data: Uint8Array, key, offset = 0) -> modifies and returns data
	 * - Crypt(reader: IDataReader, key, offset = 0) -> returns new data
	 * @param data Data to de-/encrypt
	 * @param key Encryption key
	 * @param offset Offset inside the data where de-/encryption should start
	 */
	static Crypt(data, key, offset = 0) {
		if (!(data instanceof Uint8Array) && !Array.isArray(data))
			return JH.CryptReader(data, key, offset);

		const numWords = (data.length - offset + 1) >> 1;
		let d0 = key & 0xffff, d1;

		for (let i = 0; i < numWords; ++i) {
			const index = offset + i * 2;
			let value = (index === data.length - 1) ? ((data[index] << 8) & 0xffff) : ReadWord(data, index);
			value ^= d0;
			WriteWord(data, index, value);
			d1 = d0;
			d0 = (d0 << 4) & 0xffff;
			d0 = (d0 + d1 + 87) & 0xffff;
		}

		return data;
	}

	/** C# overload Crypt(IDataReader reader, ushort key, int offset = 0) */
	static CryptReader(reader, key, offset = 0) {
		const data = new Uint8Array(reader.Size - reader.Position);
		const numWords = (data.length - offset + 1) >> 1;
		let d0 = key & 0xffff, d1;

		for (let i = 0; i < offset; ++i)
			data[i] = reader.ReadByte();

		for (let i = 0; i < numWords; ++i) {
			let value = (reader.Position === reader.Size - 1) ? ((reader.ReadByte() << 8) & 0xffff) : reader.ReadWord();
			value ^= d0;
			WriteWord(data, offset + i * 2, value);
			d1 = d0;
			d0 = (d0 << 4) & 0xffff;
			d0 = (d0 + d1 + 87) & 0xffff;
		}

		return data;
	}
}
