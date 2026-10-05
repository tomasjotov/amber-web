// Compressed text (port of Amberstar.GameData.Legacy.Text).
import { DataReader } from './reader.js';

export const TextFragment = {
	OpenBracket: 1580,
	ClosingBracket: 1581,
	ExclamationMark: 631,
	CarriageReturn: 1576,
	ParagraphMarker: 1577,
	SingleQuote: 1300,
	Comma: 166,
	DoubleColon: 155,
	SemiColon: 1302,
	FullStop: 170,
	QuestionMark: 743,
};

// The fragment indices of special characters differ between game versions (the C# constants
// are from the German version), so they are detected by their content.
const specialCache = new WeakMap();

function getSpecialIndices(fragments) {
	let info = specialCache.get(fragments);
	if (!info) {
		info = { openBracket: -1, carriageReturn: -1, paragraphMarker: -1, endPunctuation: new Set() };
		fragments.forEach((f, i) => {
			if (i === 0)
				return;
			if (f === '(')
				info.openBracket = i;
			else if (f === '#')
				info.carriageReturn = i;
			else if (f === '##' || f === '@')
				info.paragraphMarker = i;
			else if (/^[.,!?:;)'"]+$/.test(f))
				info.endPunctuation.add(i);
		});
		specialCache.set(fragments, info);
	}
	return info;
}

export class Text {
	constructor(fragments, indices = [], blockOffsets = []) {
		this.fragments = fragments;
		this.indices = indices;
		this.blockOffsets = blockOffsets;
	}

	get textBlockCount() { return this.blockOffsets.length; }

	static read(reader, fragments) {
		const text = new Text(fragments);
		const count = reader.readByte();
		reader.position++;
		if (count === 0)
			return text;
		const lengths = [];
		let offset = reader.readWord();
		for (let i = 0; i < count; i++) {
			const next = reader.readWord();
			lengths.push(next - offset);
			offset = next;
		}
		for (let i = 0; i < count; i++) {
			text.blockOffsets.push(text.indices.length);
			for (let n = 0; n < lengths[i]; n++)
				text.indices.push(reader.readWord());
		}
		return text;
	}

	static fromBytes(bytes, fragments) {
		return Text.read(new DataReader(bytes), fragments);
	}

	/** A text which consists of a single literal string (not from the fragment table) */
	static fromString(str) {
		return new Text(['', str], [1], [0]);
	}

	static fromFragmentIndex(index, fragments) {
		return new Text(fragments, [index], [0]);
	}

	getTextBlock(index) {
		if (index < 0 || index >= this.blockOffsets.length)
			throw new Error(`Text block index ${index} out of range`);
		const start = this.blockOffsets[index];
		const end = index === this.blockOffsets.length - 1 ? this.indices.length : this.blockOffsets[index + 1];
		return new Text(this.fragments, this.indices.slice(start, end), [0]);
	}

	getString() {
		return this.indices.length === 0 || this.indices[0] === 0 ? '' : this.fragments[this.indices[0]];
	}

	getParagraphs(maxWidth) {
		return this.#getLines(maxWidth).paragraphs;
	}

	getLines(maxWidth) {
		return this.#getLines(maxWidth).lines;
	}

	#getLines(maxWidth) {
		const paragraphs = [];
		const lines = [];

		if (this.indices.length === 0)
			return { lines, paragraphs };

		let paragraphOffset = 0;
		let currentLine = '';
		const visibleLength = s => { let n = 0; for (const c of s) if (c >= ' ') n++; return n; };

		const addText = (text, last) => {
			currentLine += text;

			while (visibleLength(currentLine) > maxWidth) {
				if (last && visibleLength(currentLine) - 1 === maxWidth) {
					lines.push(currentLine.slice(0, -1));
					currentLine = '';
					return;
				}

				let lastSpace = -1;
				for (let i = maxWidth - 1; i >= 0; i--) {
					if (currentLine[i] === ' ') {
						lastSpace = i;
						break;
					}
				}

				if (lastSpace === -1) {
					// Should not happen with original data, just hard break.
					lines.push(currentLine.slice(0, maxWidth));
					currentLine = currentLine.slice(maxWidth);
					continue;
				}

				lines.push(currentLine.slice(0, lastSpace));
				currentLine = currentLine.slice(lastSpace + 1);
			}
		};

		const special = getSpecialIndices(this.fragments);

		for (let i = 0; i < this.indices.length; i++) {
			const index = this.indices[i];

			switch (index) {
				case special.openBracket:
					currentLine += '(';
					break;
				case special.carriageReturn:
					lines.push(currentLine.endsWith(' ') ? currentLine.slice(0, -1) : currentLine);
					currentLine = '';
					break;
				case special.paragraphMarker:
					lines.push(currentLine);
					paragraphs.push(lines.slice(paragraphs.length === 0 ? 0 : paragraphOffset));
					paragraphOffset = lines.length;
					currentLine = '';
					break;
				default:
					if (special.endPunctuation.has(index) && currentLine.length > 0 && currentLine.endsWith(' '))
						currentLine = currentLine.slice(0, -1);
					addText((this.fragments[index] ?? '') + ' ', i === this.indices.length - 1);
					break;
			}
		}

		if (currentLine.length !== 0)
			lines.push(currentLine.endsWith(' ') ? currentLine.slice(0, -1) : currentLine);

		paragraphs.push(lines.slice(paragraphOffset));

		return { lines, paragraphs };
	}
}
