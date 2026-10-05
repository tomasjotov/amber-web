// Port of Ambermoon.Data.Legacy/Compression/ExtendedLob.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { DataReader } from '../Serialization/DataReader.js';
import { MatchTrie } from './MatchTrie.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { IndexOutOfRangeException } from '../../../runtime.js';

const MinMatchLength = 3;
const MaxMatchLength = 32;
const MinMatchOffset = 1;
const MaxMatchOffset = 1024;
const MinRLELength = 4;

/** list[^1] */
function lastOf(list) {
	if (list.length === 0)
		throw new IndexOutOfRangeException('Index was out of range.');
	return list[list.length - 1];
}

export class ExtendedLob {
	static CompressData(data) {
		let literals = [];
		let rleCount = 0;
		let rleLiteral = 0;
		let lastMatchHeaderIndex = -1;
		const compressedData = [];
		const trie = new MatchTrie(MaxMatchOffset);
		let i = 0;
		let justFoundRle = false;
		let lastLiteral = -1;

		function WriteAdditionalCount(additionalCount) {
			let count;

			do {
				count = Math.min(additionalCount, 255);
				compressedData.push(count & 0xff);
				additionalCount -= count;
			} while (count === 255);
		}

		function WriteMoreLiterals() {
			const consumedCount = Math.min(255, literals.length);
			compressedData.push(consumedCount);
			for (let i = 0; i < consumedCount; ++i)
				compressedData.push(literals[i]);
			if (consumedCount === literals.length)
				literals.length = 0;
			else
				literals = literals.slice(consumedCount);
			return consumedCount === 255;
		}

		function CheckRle() {
			if (data.length - i >= MinRLELength &&
				data[i] === data[i + 1] &&
				data[i] === data[i + 2] &&
				data[i] === data[i + 3]) {
				rleLiteral = data[i];
				rleCount = MinRLELength;
				return true;
			}

			return false;
		}

		function CheckRleLength(data, index) {
			let length = 1;
			const literal = data[index];

			for (let i = index + 1; i < data.length; ++i) {
				if (data[i] === literal) {
					if (++length === MaxMatchLength)
						break; // enough for our purposes
				} else {
					break;
				}
			}

			return length;
		}

		function WriteCurrentData(nextIsLiteral, noRle = false, useRleLiteral = null) {
			function ProcessLiterals() {
				let remainingLiteralCount = literals.length;

				if (remainingLiteralCount === 0)
					return;

				let firstLiteralCount;

				// Add literal amount of 0 to 3 in the last match encoding.
				if (lastMatchHeaderIndex !== -1) {
					firstLiteralCount = Math.min(3, remainingLiteralCount);

					compressedData[lastMatchHeaderIndex] = (compressedData[lastMatchHeaderIndex] | (firstLiteralCount << 2)) & 0xff;

					if (remainingLiteralCount <= 3) {
						// Fits into the last match encoding
						if (literals.length !== 0) {
							literals.forEach(l => compressedData.push(l));
							lastLiteral = lastOf(literals);
							literals.length = 0;
						}
						return;
					} else {
						for (const literal of literals.slice(0, firstLiteralCount))
							compressedData.push(literal);

						literals = literals.slice(firstLiteralCount);
					}

					remainingLiteralCount -= firstLiteralCount;
				} else {
					// This is the first sequence of literals in the data. It has a special encoding.
					if (literals.length === 0)
						throw new AmbermoonException(ExceptionScope.Data, 'Invalid extended lob data.');

					if (literals.length < 256) {
						compressedData.push(literals.length);
						literals.forEach(l => compressedData.push(l));
						lastLiteral = lastOf(literals);
						literals.length = 0;
						return;
					} else {
						compressedData.push(0);
						remainingLiteralCount -= 256;
						for (let i = 0; i < 256; ++i)
							compressedData.push(literals[i]);
						literals = literals.slice(256);
					}

					lastLiteral = lastOf(literals);
					let moreLiterals = WriteMoreLiterals();

					while (moreLiterals)
						moreLiterals = WriteMoreLiterals();

					return;
				}

				// Only now we have to add a new literal encoding.
				firstLiteralCount = Math.min(remainingLiteralCount, 32);
				compressedData.push((0xe0 | (firstLiteralCount - 1)) & 0xff); // Write literal header
				remainingLiteralCount -= firstLiteralCount;
				lastLiteral = lastOf(literals);
				for (let i = 0; i < firstLiteralCount; ++i)
					compressedData.push(literals[i]);
				literals = literals.slice(firstLiteralCount);

				if (firstLiteralCount === 32) {
					let moreLiterals = WriteMoreLiterals();

					while (moreLiterals)
						moreLiterals = WriteMoreLiterals();
				}
			}

			if (rleCount >= MinRLELength && !noRle) {
				let index = i - rleCount;
				let addTrieCount = rleCount;

				if (index < MinRLELength) {
					const reduce = MinRLELength - index;
					addTrieCount -= reduce;
					index += reduce;
				}

				for (let j = 0; j < addTrieCount; ++j)
					trie.Add(data, index + j, Math.min(MaxMatchLength, data.length - index - j));

				const literal = useRleLiteral ?? rleLiteral;
				const rleLiteralAlreadyThere = (literals.length !== 0 && lastOf(literals) === literal) ||
					(literals.length === 0 && lastLiteral === literal);

				if (!rleLiteralAlreadyThere) {
					--rleCount; // match count does not include the first literal
					literals.push(literal); // it is part of the preceeding literals instead
				}

				ProcessLiterals();
				lastLiteral = literal;
				lastMatchHeaderIndex = compressedData.length;

				const firstCount = Math.min(rleCount, 16);
				compressedData.push(((firstCount - 3) << 4) & 0xff);
				compressedData.push(0); // offset 1
				rleCount -= firstCount;

				if (firstCount === 16) {
					WriteAdditionalCount(rleCount);
					rleCount = 0;
				}

				return;
			}

			if (!nextIsLiteral && literals.length !== 0) {
				ProcessLiterals();
			}
		}

		function AddMatch(offset, length) {
			const firstMatchLength = Math.min(16, length);
			length -= firstMatchLength;
			--offset;
			const header = (((firstMatchLength - 3) << 4) | (offset >> 8)) & 0xff;
			lastMatchHeaderIndex = compressedData.length;
			compressedData.push(header);
			compressedData.push(offset & 0xff);

			if (firstMatchLength === 16)
				WriteAdditionalCount(length);
		}

		trie.Add(data, 0, MaxMatchLength);
		literals.push(data[i++]);

		for (; i < data.length; ++i) {
			justFoundRle = false;

			if (rleCount !== 0 && data[i] === rleLiteral) {
				++rleCount;
				continue;
			} else if (rleCount === 0 && CheckRle()) {
				justFoundRle = true;
				i += MinRLELength - 1;
				continue;
			} else if (rleCount >= MinRLELength) {
				const rleCountBackup = rleCount;
				const rleLiteralBackup = rleLiteral;

				if (CheckRle()) {
					justFoundRle = true;
					rleCount = rleCountBackup;
					WriteCurrentData(false, false, rleLiteralBackup);
					rleCount = MinRLELength;
				}
			}

			const maxMatchLength = Math.min(data.length - i, MaxMatchLength);
			const match = trie.GetLongestMatch(data, i, maxMatchLength);
			const rleLength = justFoundRle ? CheckRleLength(data, i) : 0;
			const matchOffset = i - match.Key;

			if (matchOffset >= MinMatchOffset && matchOffset <= MaxMatchOffset && match.Value >= MinMatchLength && match.Value > rleLength) {
				trie.Add(data, i, maxMatchLength);

				if (!justFoundRle)
					WriteCurrentData(false);
				else
					rleCount = 0;

				lastLiteral = data[match.Key + match.Value - 1];

				AddMatch(i - match.Key, match.Value);

				for (let j = 1; j < match.Value; ++j)
					trie.Add(data, i + j, Math.min(MaxMatchLength, data.length - i - j));

				i += match.Value - 1; // -1 cause of for's ++i
			} else if (justFoundRle) {
				i += MinRLELength - 1;
			} else {
				if (rleCount < MinRLELength)
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

		function ReadAdditionalCount(initialCount) {
			let count;

			do {
				count = reader.ReadByte();
				initialCount += count;
			} while (count === 255);

			return initialCount;
		}

		let literalCount = reader.ReadByte();
		let moreCountBytes = false;

		if (literalCount === 0) {
			literalCount = 256;
			moreCountBytes = true;
		}

		function ReadNextCount() {
			if (!moreCountBytes)
				return false;

			literalCount = reader.ReadByte();
			moreCountBytes = literalCount === 255;

			return true;
		}

		do {
			for (let i = 0; i < literalCount; ++i)
				decodedData[decodeIndex++] = reader.ReadByte();
		} while (ReadNextCount());

		while (decodeIndex < decodedSize) {
			const header = reader.ReadWord();

			if ((header & 0xe000) !== 0xe000) { // match
				const offset = (header & 0x3ff) + 1;
				let length = (header >> 12) + 3;
				literalCount = (header >> 10) & 0x3;

				if (length === 16)
					length = ReadAdditionalCount(16);

				let sourceIndex = decodeIndex - offset;

				for (let i = 0; i < length; ++i)
					decodedData[decodeIndex++] = decodedData[sourceIndex++];

				for (let i = 0; i < literalCount; ++i)
					decodedData[decodeIndex++] = reader.ReadByte();
			} else {
				literalCount = (header >> 8) & 0x1f;
				moreCountBytes = literalCount === 31;
				decodedData[decodeIndex++] = header & 0xff;

				do {
					for (let i = 0; i < literalCount; ++i)
						decodedData[decodeIndex++] = reader.ReadByte();
				} while (ReadNextCount());
			}
		}

		if (reader.Position % 2 !== 0 && reader.Position < reader.Size)
			++reader.Position;

		return DataReader.FromData(decodedData);
	}
}
