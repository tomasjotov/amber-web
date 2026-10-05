// Port of Ambermoon.Data.Legacy/Compression/Lob.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { DataReader } from '../Serialization/DataReader.js';
import { MatchTrie } from './MatchTrie.js';

const MinMatchLength = 3;
const MaxMatchLength = 18;

export class Lob {
	static CompressData(data) {
		const compressedData = [];
		const trie = new MatchTrie();
		let currentHeaderPosition = 0;
		let currentHeaderBitMask = 0x80 >> 1; // skip first bit
		let currentHeader = 0x80; // first entry/byte is no match
		compressedData.push(0); // add header dummy
		let i = 1;

		function AddByte(b, last = false) {
			currentHeader |= currentHeaderBitMask;
			compressedData.push(b);
			PostAdd(last);
		}

		function AddMatch(offset, length, last = false) {
			const b1 = (((offset >> 4) & 0xf0) | ((length - 3) & 0x0f)) & 0xff;
			compressedData.push(b1);
			compressedData.push(offset & 0xff);
			PostAdd(last);
		}

		function PostAdd(last) {
			currentHeaderBitMask >>= 1;

			if (currentHeaderBitMask === 0) {
				compressedData[currentHeaderPosition] = currentHeader & 0xff;
				currentHeaderBitMask = 0x80;
				currentHeader = 0;

				if (!last) {
					currentHeaderPosition = compressedData.length;
					compressedData.push(0); // new header
				} else if (compressedData.length % 2 === 1) {
					compressedData.push(0xc0); // new header
					compressedData.push(0); // padding byte
					compressedData.push(0); // padding byte
				}
			} else if (last && compressedData.length % 2 === 1) {
				compressedData.push(0); // padding byte
			}
		}

		// first byte can not contain a match
		trie.Add(data, 0, MaxMatchLength);
		compressedData.push(data[0]);

		for (; i <= data.length - MaxMatchLength; ++i) {
			const match = trie.GetLongestMatch(data, i, MaxMatchLength);

			trie.Add(data, i, MaxMatchLength);

			if (match.Value > 2) {
				AddMatch(i - match.Key, match.Value, i + match.Value === data.length);

				for (let j = 1; j < match.Value; ++j)
					trie.Add(data, i + j, Math.min(MaxMatchLength, data.length - i - j));

				i += match.Value - 1; // -1 cause of for's ++i
			} else {
				AddByte(data[i]);
			}
		}

		for (; i <= data.length - MinMatchLength; ++i) {
			const length = data.length - i;
			const match = trie.GetLongestMatch(data, i, length);

			trie.Add(data, i, length);

			if (match.Value > 2) {
				AddMatch(i - match.Key, match.Value, i + match.Value === data.length);

				for (let j = 1; j < match.Value; ++j)
					trie.Add(data, i + j, length - j);

				i += match.Value - 1; // -1 cause of for's ++i
			} else {
				AddByte(data[i]);
			}
		}

		for (; i < data.length; ++i) {
			AddByte(data[i], i === data.length - 1);
		}

		if (currentHeaderBitMask !== 0x80)
			compressedData[currentHeaderPosition] = currentHeader & 0xff;

		return Uint8Array.from(compressedData);
	}

	static Decompress(reader, decodedSize) {
		const decodedData = new Uint8Array(decodedSize);
		let decodeIndex = 0;
		let matchOffset;
		let matchLength;
		let matchIndex;

		while (decodeIndex < decodedSize) {
			let header = reader.ReadByte();

			for (let i = 0; i < 8; ++i) {
				if ((header & 0x80) === 0) { // match
					matchOffset = reader.ReadByte();
					matchLength = (matchOffset & 0x000f) + 3;
					matchOffset <<= 4;
					matchOffset &= 0xff00;
					matchOffset |= reader.ReadByte();
					matchIndex = decodeIndex - matchOffset;

					while (matchLength-- !== 0) {
						decodedData[decodeIndex++] = decodedData[matchIndex++];
					}
				} else { // normal byte
					decodedData[decodeIndex++] = reader.ReadByte();
				}

				if (decodeIndex === decodedSize)
					break;

				header = (header << 1) & 0xff;
			}
		}

		return DataReader.FromData(decodedData);
	}
}
