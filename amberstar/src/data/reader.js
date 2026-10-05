// Big-endian binary reader (port of Amber.IO.FileFormats DataReader).

export class DataReader {
	constructor(bytes, offset = 0, length = undefined) {
		if (bytes instanceof ArrayBuffer)
			bytes = new Uint8Array(bytes);
		if (length === undefined)
			length = bytes.length - offset;
		this.data = bytes.subarray(offset, offset + length);
		this.position = 0;
	}

	get size() { return this.data.length; }
	get remaining() { return this.data.length - this.position; }

	readByte() {
		if (this.position >= this.data.length)
			throw new Error('Read beyond end of data');
		return this.data[this.position++];
	}

	peekByte() { return this.data[this.position]; }

	readWord() {
		const d = this.data, p = this.position;
		this.position += 2;
		return (d[p] << 8) | d[p + 1];
	}

	peekWord() {
		const d = this.data, p = this.position;
		return (d[p] << 8) | d[p + 1];
	}

	readSignedWord() {
		const w = this.readWord();
		return w >= 0x8000 ? w - 0x10000 : w;
	}

	readDword() {
		const d = this.data, p = this.position;
		this.position += 4;
		return ((d[p] << 24) >>> 0) + ((d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]);
	}

	peekDword() {
		const d = this.data, p = this.position;
		return ((d[p] << 24) >>> 0) + ((d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]);
	}

	readBytes(count) {
		if (this.position + count > this.data.length)
			throw new Error(`Read beyond end of data (${this.position}+${count}>${this.data.length})`);
		const result = this.data.slice(this.position, this.position + count);
		this.position += count;
		return result;
	}

	readWords(count) {
		const result = new Array(count);
		for (let i = 0; i < count; i++)
			result[i] = this.readWord();
		return result;
	}

	readToEnd() {
		return this.readBytes(this.remaining);
	}

	alignToWord() {
		if (this.position & 1)
			this.position++;
	}

	readString(length) {
		return decodeString(this.readBytes(length));
	}

	toArray() { return this.data.slice(); }
}

// Amber character encoding (iso-8859-1 with some Atari ST code points)
const SPECIAL_CHARS = {
	0x81: 'ü', 0x82: 'é', 0x83: 'â', 0x84: 'ä', 0x85: 'à', 0x87: 'ç',
	0x88: 'ê', 0x8a: 'è', 0x8e: 'Ä', 0x90: 'É', 0x94: 'ö', 0x96: 'û',
	0x99: 'Ö', 0x9a: 'Ü', 0x9b: '¢', 0x9e: 'ß', 0xa0: 'á', 0xb6: 'À',
	0xb4: '\'',
};

const CHAR_TO_BYTE = {};
for (const [b, c] of Object.entries(SPECIAL_CHARS))
	if (c !== '\'') CHAR_TO_BYTE[c] = Number(b);

export function decodeString(bytes) {
	let s = '';
	for (const b of bytes)
		s += SPECIAL_CHARS[b] ?? String.fromCharCode(b);
	return s;
}

export function encodeChar(ch) {
	return CHAR_TO_BYTE[ch] ?? ch.charCodeAt(0);
}

export function findSequence(data, offset, sequence) {
	outer:
	for (let i = offset; i <= data.length - sequence.length; i++) {
		for (let j = 0; j < sequence.length; j++)
			if (data[i + j] !== sequence[j])
				continue outer;
		return i;
	}
	return -1;
}
