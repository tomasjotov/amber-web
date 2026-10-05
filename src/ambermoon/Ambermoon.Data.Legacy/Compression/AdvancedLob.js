// Port of Ambermoon.Data.Legacy/Compression/AdvancedLob.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { DataReader } from '../Serialization/DataReader.js';
import { MatchTrie } from './MatchTrie.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';

const MinMatchLength = 3;
const MaxSmallMatchLength = 3 + 0xf;
const MaxLargeMatchLength = 3 + 0x7f;
const MaxSmallMatchOffset = 1 + 0x1ff;
const MaxLargeMatchOffset = 1 + 0x3ff;

// - Zero RLE: 00 CC where CC is the count interpreted as 35 to 290
// - Literals: CC .. where CC is the count (allowed are 1 to 127 only). The given amount of literals follow.
// - If the header byte is >= 128 the following 4 encodings are possible:
//   - Small match: 100LLLLO OOOOOOOO, Length = 0000 (3) to 1111 (18), Offset = 000000000 (1) to 111111111 (512)
//   - Large match: 101LLLLL LLOOOOOO OOOO, Length = 00000000 (3) to 11111111 (130), Offset = 0000000000 (1) to 1111111111 (1024)
//   - Literal RLE: 110CCCCC <literal> where C gives the count interpreted as 3 to 34. The following byte is the literal.
//   - Small literal: 111LLLLL where LLLLL directly gives the literal. Only literals 0 to 31 are possible here.
//
// First bytes:
// - Small matches: 80 to 9F
// - Large matches: A0 to BF
// - Literal RLE: C0 to DF
// - Small literal: E0 to FF

export class AdvancedLob {
	static CompressData(data) {
		const literals = [];
		let rleCount = 0;
		let rleLiteral = 0;
		let largeMatchReserveIndex = -1;
		const compressedData = [];
		const trie = new MatchTrie(MaxLargeMatchOffset);
		let i = 0;
		let justFoundRle = false;

		function CheckRle() {
			if (data.length - i >= 3 &&
				data[i] === data[i + 1] &&
				data[i] === data[i + 2]) {
				rleLiteral = data[i];
				rleCount = 3;
				return true;
			}

			return false;
		}

		function CheckRleLength(data, index) {
			let length = 1;
			const literal = data[index];

			for (let i = index + 1; i < data.length; ++i) {
				if (data[i] === literal) {
					if (++length === 290)
						break; // enough for our purposes
				} else {
					break;
				}
			}

			return length;
		}

		function WriteCurrentData(nextIsLiteral, noRle = false, useRleLiteral = null) {
			if (rleCount >= 3 && !noRle) {
				if (literals.length !== 0)
					throw new AmbermoonException(ExceptionScope.Application, 'There should be no stored literals when a RLE is compressed.');

				let index = i - rleCount;
				let addTrieCount = rleCount;

				if (index < 3) {
					const reduce = 3 - index;
					addTrieCount -= reduce;
					index += reduce;
				}

				for (let j = 0; j < addTrieCount; ++j)
					trie.Add(data, index + j, Math.min(MaxLargeMatchLength, data.length - index - j));

				const literal = useRleLiteral ?? rleLiteral;

				if (literal === 0) {
					while (rleCount >= 35) {
						const count = Math.min(rleCount, 290);
						compressedData.push(0);
						compressedData.push((count - 35) & 0xff);
						rleCount -= count;
					}

					if (rleCount >= 3) {
						const count = Math.min(rleCount, 34);
						compressedData.push((0xc0 | (count - 3)) & 0xff);
						compressedData.push(0);
						rleCount -= count;
					}
				} else {
					while (rleCount >= 3) {
						const count = Math.min(rleCount, 34);
						compressedData.push((0xc0 | (count - 3)) & 0xff);
						compressedData.push(literal);
						rleCount -= count;
					}
				}

				while (rleCount !== 0) {
					literals.push(rleLiteral);
					--rleCount;
				}
			}

			if (!nextIsLiteral && literals.length !== 0) {
				while (literals.length !== 0) {
					// Try to use small literal encoding for short sequences of bytes.
					if (literals.length < 10 && !literals.some(l => l > 31)) {
						literals.forEach(l => compressedData.push((l | 0xe0) & 0xff));
						literals.length = 0;
						break;
					} else {
						const count = Math.min(127, literals.length);
						const literalsToEncode = literals.slice(0, count);
						compressedData.push(count);
						literalsToEncode.forEach(l => compressedData.push(l));
						literals.splice(0, count);
					}
				}
			}
		}

		function AddMatch(offset, length) {
			if (length > MaxSmallMatchLength || offset > MaxSmallMatchOffset) {
				// large match
				--offset;
				length -= MinMatchLength;
				compressedData.push((0xa0 | (length >> 2)) & 0xff);
				compressedData.push((((length & 0x3) << 6) | (offset >> 4)) & 0xff);
				if (largeMatchReserveIndex === -1) {
					largeMatchReserveIndex = compressedData.length;
					compressedData.push(((offset & 0xf) << 4) & 0xff);
				} else {
					compressedData[largeMatchReserveIndex] |= (offset & 0xf);
					largeMatchReserveIndex = -1;
				}
			} else {
				// small match
				let b1 = 0x80 | ((length - MinMatchLength) << 1);
				if (--offset > 255)
					++b1;
				compressedData.push(b1 & 0xff);
				compressedData.push(offset & 0xff);
			}
		}

		if (CheckRle()) {
			trie.Add(data, 0, Math.min(MaxLargeMatchLength, data.length));
			trie.Add(data, 1, Math.min(MaxLargeMatchLength, data.length - 1));
			trie.Add(data, 2, Math.min(MaxLargeMatchLength, data.length - 2));
			i += 3;
		} else {
			trie.Add(data, 0, MaxLargeMatchLength);
			literals.push(data[i++]);
		}

		for (; i < data.length; ++i) {
			justFoundRle = false;

			if (rleCount !== 0 && data[i] === rleLiteral) {
				++rleCount;
				continue;
			} else if (rleCount === 0 && CheckRle()) {
				justFoundRle = true;
				WriteCurrentData(false, true);
			} else if (rleCount >= 3) {
				const rleCountBackup = rleCount;
				const rleLiteralBackup = rleLiteral;

				if (CheckRle()) {
					justFoundRle = true;
					rleCount = rleCountBackup;
					WriteCurrentData(false, false, rleLiteralBackup);
					rleCount = 3;
				}
			}

			const maxMatchLength = Math.min(data.length - i, MaxLargeMatchLength);
			const match = trie.GetLongestMatch(data, i, maxMatchLength);
			const rleLength = justFoundRle ? CheckRleLength(data, i) : 0;

			if (i - match.Key <= MaxLargeMatchOffset && match.Value >= MinMatchLength && match.Value > rleLength) {
				trie.Add(data, i, maxMatchLength);

				if (!justFoundRle)
					WriteCurrentData(false);
				else
					rleCount = 0;

				AddMatch(i - match.Key, match.Value);

				for (let j = 1; j < match.Value; ++j)
					trie.Add(data, i + j, Math.min(MaxLargeMatchLength, data.length - i - j));

				i += match.Value - 1; // -1 cause of for's ++i
			} else if (justFoundRle) {
				i += 2;
			} else {
				if (rleCount < 3)
					trie.Add(data, i, maxMatchLength);
				WriteCurrentData(true);
				literals.push(data[i]);
			}
		}

		WriteCurrentData(false);

		if (compressedData.length % 2 !== 0)
			compressedData.push(0);

		return Uint8Array.from(compressedData);
	}

	static Decompress(reader, decodedSize) {
		const decodedData = new Uint8Array(decodedSize);
		let decodeIndex = 0;
		let useLargeMatchReserve = false;
		let largeMatchReserve = 0;

		function ProcessMatch(offset, length) {
			let sourceIndex = decodeIndex - offset;

			for (let i = 0; i < length; ++i)
				decodedData[decodeIndex++] = decodedData[sourceIndex++];
		}

		while (decodeIndex < decodedSize) {
			const header = reader.ReadByte();

			if (header === 0) {
				const amount = reader.ReadByte() + 35;

				for (let i = 0; i < amount; ++i)
					decodedData[decodeIndex++] = 0;
			} else if (header < 128) {
				for (let i = 0; i < header; ++i)
					decodedData[decodeIndex++] = reader.ReadByte();
			} else {
				const mode = (header >> 5) & 3;

				if (mode === 0) { // small match
					const length = ((header >> 1) & 0xf) + 3;
					let offset = header & 0x1;
					offset <<= 8;
					offset |= reader.ReadByte();
					ProcessMatch(++offset, length);
				} else if (mode === 1) { // large match
					let length = (header & 0x1f) << 2;
					let offset = reader.ReadByte();
					length |= (offset >> 6);
					length += 3;
					offset &= 0x3f;
					offset <<= 4;
					if (useLargeMatchReserve) {
						offset |= largeMatchReserve;
					} else {
						largeMatchReserve = reader.ReadByte();
						offset |= (largeMatchReserve >> 4);
						largeMatchReserve &= 0xf;
					}
					useLargeMatchReserve = !useLargeMatchReserve;
					ProcessMatch(++offset, length);
				} else if (mode === 2) { // literal rle
					const length = (header & 0x1f) + 3;
					const literal = reader.ReadByte();

					for (let i = 0; i < length; ++i)
						decodedData[decodeIndex++] = literal;
				} else { // mode == 3, small literal
					decodedData[decodeIndex++] = header & 0x1f;
				}
			}
		}

		if (reader.Position % 2 !== 0 && reader.Position < reader.Size)
			++reader.Position;

		return DataReader.FromData(decodedData);
	}
}
