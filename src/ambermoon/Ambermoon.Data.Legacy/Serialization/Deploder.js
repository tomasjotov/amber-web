// Port of Ambermoon.Data.Legacy/Serialization/Deploder.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { DataReader } from './DataReader.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { IndexOutOfRangeException } from '../../../runtime.js';

class BufferIterator {
	constructor(buffer, offset) {
		this.buffer = buffer;
		this.offset = offset;
	}

	static op_Addition(iter, amount) {
		return new BufferIterator(iter.buffer, iter.offset + amount);
	}

	static op_Subtraction(iter, amount) {
		return new BufferIterator(iter.buffer, iter.offset - amount);
	}

	/** implicit operator byte */
	valueOf() {
		return this.buffer.GetByte(this.offset);
	}

	Assign(value) {
		this.buffer.SetByte(this.offset, value);
	}

	AssignAndIncrease(value) {
		this.buffer.SetByte(this.offset++, value);
	}

	GetAndIncrease() {
		return this.buffer.GetByte(this.offset++);
	}
}

class IncreaseBuffer {
	constructor(size) {
		this.data = [];

		if (size !== 0)
			this.data = new Array(size).fill(0);
	}

	/** Indexer this[int index] */
	get(index) {
		return new BufferIterator(this, index);
	}

	GetByte(index) {
		if (index < 0 || index >= this.data.length)
			throw new IndexOutOfRangeException('Index was out of range.');
		return this.data[index];
	}

	SetByte(index, value) {
		if (index === this.data.length)
			this.data.push(value & 0xff);
		else if (index > this.data.length || index < 0)
			throw new IndexOutOfRangeException('Index was out of range.');
		else
			this.data[index] = value & 0xff;
	}

	get Size() {
		return this.data.length;
	}

	ToArray() {
		return Uint8Array.from(this.data);
	}
}

const DeplodeLiteralBase = [6, 10, 10, 18];
const DeplodeLiteralExtraBits = [1, 1, 1, 1, 2, 3, 3, 4, 4, 5, 7, 14];

export class Deploder {
	/** Overloads: (dataReader: DataReader) / (sourceBuffer: Uint8Array, offset) */
	static DeplodeFimp(dataReader, offset) {
		if (dataReader instanceof Uint8Array || Array.isArray(dataReader))
			dataReader = new DataReader(dataReader, offset);

		if (dataReader.PeekDword() !== 0x494d5021) // "IMP!"
			throw new AmbermoonException(ExceptionScope.Data, 'No valid IMP data');

		const position = dataReader.Position;
		dataReader.Position += 4; // skip header
		const explodedSize = dataReader.ReadDword() & 0x7fffffff;
		let implodedSize = dataReader.ReadDword() & 0x7fffffff;
		const destBuffer = new IncreaseBuffer(explodedSize);
		dataReader.Position = dataReader.Position - 12 + implodedSize;
		const initialData = dataReader.ReadBytes(12);
		const firstLiteralLength = dataReader.ReadDword();
		const evenData = (dataReader.ReadByte() & 0x80) !== 0; // bit 0x80 means even data
		const initialBitBuffer = dataReader.ReadByte();
		const table = dataReader.ReadBytes(8 * 2 + 12 * 1);
		let footerSize = 12 + 4 + 2 + 8 * 2 + 12 * 1 + 4; // the last 4 bytes are a checksum but we don't care about it

		if (!evenData) {
			++footerSize;
			--implodedSize;
		}

		const preparedData = new Uint8Array(implodedSize);
		for (let i = 0; i < 3; ++i)
			preparedData.set(initialData.subarray(i * 4, i * 4 + 4), (2 - i) * 4);
		dataReader.Position = position + 12;
		preparedData.set(dataReader.ReadBytes(implodedSize - 12), 12);
		dataReader.Position += footerSize;

		if (!Deploder.Deplode(preparedData, destBuffer, table, implodedSize >>> 0, firstLiteralLength, initialBitBuffer))
			throw new AmbermoonException(ExceptionScope.Data, 'Error exploding data');

		if (destBuffer.Size !== explodedSize)
			throw new AmbermoonException(ExceptionScope.Data, 'Exploded size does not match the value in the header');

		return destBuffer.ToArray();
	}

	/** sourceBuffer is a Uint8Array (the C# byte pointer is index 0 of it). */
	static Deplode(sourceBuffer, destBuffer, table,
		implodedSize, firstLiteralLength, initialBitBuffer) {
		let input = implodedSize; /* input pointer (index into sourceBuffer) */
		const output = destBuffer.get(0); /* output pointer */
		let match; /* match pointer  */
		let bitBuffer;
		let literalLength;
		let matchLength;
		let selector, x, y;
		const matchBase = new Array(8).fill(0);

		function ReadBits(count) {
			let result = 0;

			if ((count & 0x80) !== 0) {
				result = sourceBuffer[--input];
				count &= 0x7f;
			}

			for (let i = 0; i < count; i++) {
				let bit = bitBuffer >> 7;
				bitBuffer = (bitBuffer << 1) & 0xff;

				if (bitBuffer === 0) {
					const temp = bit;
					bitBuffer = sourceBuffer[--input];
					bit = bitBuffer >> 7;
					bitBuffer = (bitBuffer << 1) & 0xff;
					if (temp !== 0)
						bitBuffer = (bitBuffer + 1) & 0xff;
				}

				result = ((result << 1) | bit) >>> 0;
			}

			return result;
		}

		/* read the 'base' part of the explosion table into native byte order,
		 * for speed */
		for (x = 0; x < 8; x++) {
			matchBase[x] = ((table[x * 2] << 8) | table[x * 2 + 1]);
		}

		literalLength = firstLiteralLength; // word at offset 0x1E6 in the last code hunk
		bitBuffer = initialBitBuffer; // byte at offset 0x1E8 in the last code hunk
		let i;

		while (true) {
			/* copy literal run */
			for (i = 0; i < literalLength; ++i)
				output.AssignAndIncrease(sourceBuffer[--input]);

			/* main exit point - after the literal copy */
			if (input <= 0)
				break;

			/* static Huffman encoding of the match length and selector:
			 *
			 * 0     -> selector = 0, match_len = 1
			 * 10    -> selector = 1, match_len = 2
			 * 110   -> selector = 2, match_len = 3
			 * 1110  -> selector = 3, match_len = 4
			 * 11110 -> selector = 3, match_len = 5 + next three bits (5-12)
			 * 11111 -> selector = 3, match_len = (next input byte)-1 (0-254)
			 *
			 */
			if (ReadBits(1) !== 0) {
				if (ReadBits(1) !== 0) {
					if (ReadBits(1) !== 0) {
						selector = 3;

						if (ReadBits(1) !== 0) {
							if (ReadBits(1) !== 0) { // 11111
								matchLength = sourceBuffer[--input];

								if (matchLength === 0)
									return false; /* bad input */

								matchLength--;
							} else { // 11110
								matchLength = 5 + ReadBits(3);
							}
						} else { // 1110
							matchLength = 4;
						}
					} else { // 110
						selector = 2;
						matchLength = 3;
					}
				} else { // 10
					selector = 1;
					matchLength = 2;
				}
			} else { // 0
				selector = 0;
				matchLength = 1;
			}

			/* another Huffman tuple, for deciding the base value (y) and number
			 * of extra bits required from the input stream (x) to create the
			 * length of the next literal run. Selector is 0-3, as previously
			 * obtained.
			 *
			 * 0  -> base = 0,                      extra = {1,1,1,1}[selector]
			 * 10 -> base = 2,                      extra = {2,3,3,4}[selector]
			 * 11 -> base = {6,10,10,18}[selector]  extra = {4,5,7,14}[selector]
			 */
			y = 0;
			x = selector;
			if (ReadBits(1) !== 0) {
				if (ReadBits(1) !== 0) { // 11
					y = DeplodeLiteralBase[x];
					x += 8;
				} else { // 10
					y = 2;
					x += 4;
				}
			}
			x = DeplodeLiteralExtraBits[x];

			/* next literal run length: read [x] bits and add [y] */
			literalLength = y + ReadBits(x);

			/* another Huffman tuple, for deciding the match distance: _base and
			 * _extra are from the explosion table, as passed into the deplode
			 * function.
			 *
			 * 0  -> base = 1                        extra = _extra[selector + 0]
			 * 10 -> base = 1 + _base[selector + 0]  extra = _extra[selector + 4]
			 * 11 -> base = 1 + _base[selector + 4]  extra = _extra[selector + 8]
			 */
			match = BufferIterator.op_Subtraction(output, 1);
			x = selector;
			if (ReadBits(1) !== 0) {
				if (ReadBits(1) !== 0) {
					match = BufferIterator.op_Subtraction(match, matchBase[selector + 4]);
					x += 8;
				} else {
					match = BufferIterator.op_Subtraction(match, matchBase[selector]);
					x += 4;
				}
			}
			x = table[x + 16];

			/* obtain the value of the next [x] extra bits and
			 * add it to the match offset */
			match = BufferIterator.op_Subtraction(match, ReadBits(x) | 0);

			/* copy match */
			for (i = 0; i < matchLength + 1; ++i)
				output.AssignAndIncrease(match.GetAndIncrease());
		}

		/* return true if we used up all input bytes (as we should) */
		return input === 0 || (implodedSize % 2 === 1 && 0 - input === 1);
	}
}

Deploder.BufferIterator = BufferIterator;
Deploder.IncreaseBuffer = IncreaseBuffer;
