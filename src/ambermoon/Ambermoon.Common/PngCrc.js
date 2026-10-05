// Port of Ambermoon.Common/PngCrc.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class PngCrc {
	constructor() {
		this.table = null;
		this.lastCrc = 0;
	}

	EnsureTable() {
		if (this.table != null)
			return;

		this.table = new Uint32Array(256);
		let c;
		let k;

		for (let n = 0; n < 256; ++n) {
			c = n;

			for (k = 0; k < 8; ++k) {
				if ((c & 1) !== 0)
					c = (0xedb88320 ^ (c >>> 1)) >>> 0;
				else
					c >>>= 1;
			}

			this.table[n] = c;
		}
	}

	Update(crc, buffer, length) {
		this.EnsureTable();
		let c = crc >>> 0;

		for (let n = 0; n < length; ++n) {
			c = (this.table[(c ^ buffer[n]) & 0xff] ^ (c >>> 8)) >>> 0;
		}

		return c;
	}

	/**
	 * Calculate(buffer), Calculate(buffer, length), Calculate(crc, buffer), Calculate(crc, buffer, length)
	 */
	Calculate(a, b, c) {
		if (typeof a === 'number') {
			// (crc, buffer[, length])
			const crc = a;
			const buffer = b;
			const length = arguments.length >= 3 ? c : buffer.length;
			this.lastCrc = crc >>> 0;
			return this.Calculate(buffer, length);
		}

		const buffer = a;
		const length = arguments.length >= 2 ? b : buffer.length;
		return this.lastCrc = (this.Update((this.lastCrc ^ 0xffffffff) >>> 0, buffer, length) ^ 0xffffffff) >>> 0;
	}
}
