// Port of Ambermoon.Data.Legacy/AmbermoonEncoding.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

// Note: System.Text.Encoding does not exist in JS. This class provides the
// relevant Encoding API (GetBytes, GetString, GetChars, ...) itself.
// The base encoding is iso-8859-1 (char codes 0..255 map 1:1, others become '?').

function baseEncodingGetBytes(chars, charIndex, charCount) {
	const result = new Uint8Array(charCount);
	for (let i = 0; i < charCount; ++i) {
		const code = chars[charIndex + i].charCodeAt(0);
		result[i] = code > 0xff ? 0x3f : code;
	}
	return result;
}

function baseEncodingGetChars(bytes, byteIndex, byteCount) {
	const result = new Array(byteCount);
	for (let i = 0; i < byteCount; ++i)
		result[i] = String.fromCharCode(bytes[byteIndex + i]);
	return result;
}

export class AmbermoonEncoding {
	// See https://gitlab.com/ambermoon/research/-/wikis/font
	static CharsToBytes = new Map([
		['ü', 0x81], // ü
		['é', 0x82], // é
		['â', 0x83], // â
		['ä', 0x84], // ä
		['à', 0x85], // à
		['ç', 0x87], // ç
		['ê', 0x88], // ê
		['è', 0x8a], // è
		['Ä', 0x8e], // Ä
		['É', 0x90], // É
		['ö', 0x94], // ö
		['û', 0x96], // û
		['Ö', 0x99], // Ö
		['Ü', 0x9a], // Ü
		['¢', 0x9b], // ¢
		['ß', 0x9e], // ß
		['á', 0xa0], // á
		['À', 0xb6], // À
	]);
	static BytesToChars = new Map([
		[0x81, 'ü'], // ü
		[0x82, 'é'], // é
		[0x83, 'â'], // â
		[0x84, 'ä'], // ä
		[0x85, 'à'], // à
		[0x87, 'ç'], // ç
		[0x88, 'ê'], // ê
		[0x8a, 'è'], // è
		[0x8e, 'Ä'], // Ä
		[0x90, 'É'], // É
		[0x94, 'ö'], // ö
		[0x96, 'û'], // û
		[0x99, 'Ö'], // Ö
		[0x9a, 'Ü'], // Ü
		[0x9b, '¢'], // ¢
		[0x9e, 'ß'], // ß
		[0xa0, 'á'], // á
		[0xb6, 'À'], // À
		[0xb4, '\''], // ´ -> '
	]);

	/** GetByteCount(chars, index, count) or GetByteCount(string|chars) */
	GetByteCount(chars, index = 0, count = chars.length) {
		return Math.min(chars.length, count);
	}

	/**
	 * GetBytes(chars, charIndex, charCount, bytes, byteIndex) -> number of written bytes
	 * GetBytes(string|chars) -> Uint8Array
	 * GetBytes(string|chars, index, count) -> Uint8Array
	 * chars can be a string or an array of one-character strings.
	 */
	GetBytes(chars, charIndex, charCount, bytes, byteIndex) {
		if (arguments.length < 5) {
			charIndex = charIndex ?? 0;
			charCount = charCount ?? (chars.length - charIndex);
			const result = new Uint8Array(charCount);
			this.GetBytes(chars, charIndex, charCount, result, 0);
			return result;
		}

		var baseEncodingBytes = baseEncodingGetBytes(chars, charIndex, charCount);

		for (let i = 0; i < charCount; ++i) {
			const ch = chars[charIndex + i];

			if (AmbermoonEncoding.CharsToBytes.has(ch))
				bytes[byteIndex + i] = AmbermoonEncoding.CharsToBytes.get(ch);
			else
				bytes[byteIndex + i] = baseEncodingBytes[i];
		}

		return charCount;
	}

	GetCharCount(bytes, index = 0, count = bytes.length) {
		return Math.min(bytes.length, count);
	}

	/**
	 * GetChars(bytes, byteIndex, byteCount, chars, charIndex) -> number of written chars
	 * GetChars(bytes) / GetChars(bytes, index, count) -> array of one-character strings
	 */
	GetChars(bytes, byteIndex, byteCount, chars, charIndex) {
		if (arguments.length < 5) {
			byteIndex = byteIndex ?? 0;
			byteCount = byteCount ?? (bytes.length - byteIndex);
			const result = new Array(byteCount);
			this.GetChars(bytes, byteIndex, byteCount, result, 0);
			return result;
		}

		var baseEncodingChars = baseEncodingGetChars(bytes, byteIndex, byteCount);

		for (let i = 0; i < byteCount; ++i) {
			const by = bytes[byteIndex + i];

			if (AmbermoonEncoding.BytesToChars.has(by))
				chars[charIndex + i] = AmbermoonEncoding.BytesToChars.get(by);
			else
				chars[charIndex + i] = baseEncodingChars[i];
		}

		return byteCount;
	}

	/** Encoding.GetString(bytes) / GetString(bytes, index, count) */
	GetString(bytes, index = 0, count = bytes.length - index) {
		return this.GetChars(bytes, index, count).join('');
	}

	GetMaxByteCount(charCount) {
		return charCount;
	}

	GetMaxCharCount(byteCount) {
		return byteCount;
	}
}
