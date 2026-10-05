// Port of Ambermoon.Data.Legacy/Compression/LobCompression.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { DataReader } from '../Serialization/DataReader.js';
import { Lob } from './Lob.js';
import { ExtendedLob } from './ExtendedLob.js';
import { AdvancedLob } from './AdvancedLob.js';
import { TextLob } from './TextLob.js';

const LobType = Object.freeze({
	TakeBest: 0x00, // Use original or extended or advanced LOB based on compression size
	TakeBestForText: 0x01, // Use original or text LOB based on compression size
	Ambermoon: 0x06,
	LZRS: 0x10,
	Extended: 0x11,
	Text: 0x12
});

export class LobCompression {
	static Compress(data, lobType = LobType.Ambermoon) {
		switch (lobType) {
			case LobType.LZRS: return ExtendedLob.CompressData(data);
			case LobType.Extended: return AdvancedLob.CompressData(data);
			case LobType.Text: return TextLob.CompressData(data);
			default: return Lob.CompressData(data);
		}
	}

	/** Overloads: (data: Uint8Array, decodedSize, lobType) / (reader: IDataReader, decodedSize, lobType) */
	static Decompress(reader, decodedSize, lobType = LobType.Ambermoon) {
		if (reader instanceof Uint8Array || Array.isArray(reader))
			reader = DataReader.FromData(reader);

		switch (lobType) {
			case LobType.LZRS: return ExtendedLob.Decompress(reader, decodedSize);
			case LobType.Extended: return AdvancedLob.Decompress(reader, decodedSize);
			case LobType.Text: return TextLob.Decompress(reader, decodedSize);
			default: return Lob.Decompress(reader, decodedSize);
		}
	}
}

LobCompression.LobType = LobType;

export { LobType as LobCompression_LobType };
