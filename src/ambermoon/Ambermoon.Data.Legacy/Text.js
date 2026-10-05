// Port of Ambermoon.Data.Legacy/Text.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentOutOfRangeException, max, lastOrDefault, repeat } from '../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { Size } from '../Ambermoon.Common/Size.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { SpecialGlyph } from '../Ambermoon.Data.Common/IText.js';

// Note: KeyValuePair<byte[], int> is represented as { Key: Uint8Array, Value: number }.
const kvp = (key, value) => ({ Key: key, Value: value });

const charCode = ch => ch.charCodeAt(0);

export class Text {
	// Key = glyphs, Value = visible length (so without color or newline glyphs)

	/**
	 * Text(glyphLines) (public) or Text(glyphIndices, lineCount, maxLineSize) (private).
	 */
	constructor(glyphLinesOrGlyphIndices, lineCount, maxLineSize) {
		this.lines = [];
		this.WrappedSize = null;
		this.WrappedGlyphSize = null;

		if (arguments.length === 1) {
			const glyphLines = glyphLinesOrGlyphIndices;
			const glyphs = [];
			for (const line of glyphLines)
				glyphs.push(...line.Key);
			this.GlyphIndices = Uint8Array.from(glyphs);
			this.LineCount = glyphLines.length;
			this.MaxLineSize = glyphLines.length === 0 ? 0 : max(glyphLines, line => line.Value);
			this.lines = glyphLines;
		} else {
			this.GlyphIndices = glyphLinesOrGlyphIndices;
			this.LineCount = lineCount;
			this.MaxLineSize = maxLineSize;
		}
	}

	get InternalLines() { return this.lines; }
	get Lines() { return this.lines.map(line => line.Key); }
}

export class TextProcessor {
	constructor(glyphCount) {
		// The original version has 94 glyphs.
		// Characters like á, à and â share the same glyph
		// as it wasn't possible to distinguish them in such
		// small resolution. But with modern fonts there might
		// by distinct glyphs for all of them. So when this
		// count is > 94, we have more character glyphs available.
		this.glyphCount = glyphCount;
	}

	static RemoveDiacritics(text) {
		const normalizedText = text.normalize('NFD');
		let result = '';

		for (const c of normalizedText) {
			if (!/\p{Mn}/u.test(c))
				result += c;
		}

		return result.normalize('NFC');
	}

	*CharToGlyph(ch, rune, fallbackChar = null) {
		const extended = this.glyphCount > 94;

		if (ch >= 'a' && ch <= 'z')
			yield (charCode(ch) - charCode('a') + (rune ? 64 : 0)) & 0xff;
		else if (ch >= 'A' && ch <= 'Z')
			yield (charCode(ch) - charCode('A') + (rune ? 64 : 0)) & 0xff;
		else if (ch === 'ä' || ch === 'Ä')
			yield (rune ? 92 : 26);
		else if (ch === 'ü' || ch === 'Ü')
			yield (rune ? 91 : 27);
		else if (ch === 'ö' || ch === 'Ö')
			yield (rune ? 90 : 28);
		else if (ch === 'ß')
			yield (rune ? 93 : 29);
		else if (ch === ';')
			yield 30;
		else if (ch === ':')
			yield 31;
		else if (ch === ',')
			yield 32;
		else if (ch === '.')
			yield 33;
		else if (ch === '\'' || ch === '´' || ch === '`')
			yield 34;
		else if (ch === '"')
			yield 35;
		else if (ch === '!')
			yield 36;
		else if (ch === '?')
			yield 37;
		else if (ch === '*')
			yield 38;
		else if (ch === '_')
			yield 39;
		else if (ch === '(')
			yield 40;
		else if (ch === ')')
			yield 41;
		else if (ch === '%')
			yield 42;
		else if (ch === '/')
			yield 43;
		else if (ch === '#')
			yield 44;
		else if (ch === '-')
			yield 45;
		else if (ch === '+')
			yield 46;
		else if (ch === '=')
			yield 47;
		else if (ch >= '0' && ch <= '9')
			yield (charCode(ch) - charCode('0') + 48) & 0xff;
		else if (ch === '&')
			yield 58;
		else if (ch === 'á' || ch === 'Á')
			yield (rune ? 64 : extended ? 94 : 59);
		else if (ch === 'à' || ch === 'À')
			yield (rune ? 64 : 59);
		else if (ch === 'â' || ch === 'Â')
			yield (rune ? 64 : extended ? 95 : 59);
		else if (ch === 'ê' || ch === 'Ê')
			yield (rune ? 68 : 60);
		else if (ch === 'è' || ch === 'È')
			yield (rune ? 68 : extended ? 96 : 60);
		else if (ch === 'é' || ch === 'É')
			yield (rune ? 68 : extended ? 97 : 60);
		else if (ch === 'ç' || ch === 'c')
			yield (rune ? 66 : 61);
		else if (ch === '¢')
			yield (rune ? 66 : extended ? 98 : 61);
		else if (ch === 'û' || ch === 'Û')
			yield (rune ? 84 : 62);
		else if (ch === 'ô' || ch === 'Ô')
			yield (rune ? 78 : 63);
		else if (ch === 'æ' || ch === 'Æ') {
			if (extended)
				yield 101;
			else {
				yield (rune ? 64 : 0); // A
				yield (rune ? 68 : 4); // E
			}
		}
		else if (ch === 'œ' || ch === 'ɶ' || ch === 'Œ') {
			if (extended)
				yield 102;
			else {
				yield (rune ? 78 : 14); // O
				yield (rune ? 68 : 4); // E
			}
		}
		else if (ch === 'î' || ch === 'Î')
			yield (rune ? 72 : extended ? 99 : 8);
		else if (ch === 'ë' || ch === 'Ë')
			yield (rune ? 68 : extended ? 100 : 60);
		else if (ch === 'ą' || ch === 'Ą')
			yield (rune ? 64 : extended ? 103 : 0);
		else if (ch === 'ć' || ch === 'Ć')
			yield (rune ? 66 : extended ? 104 : 2);
		else if (ch === 'ę' || ch === 'Ę')
			yield (rune ? 68 : extended ? 105 : 4);
		else if (ch === 'ł' || ch === 'Ł')
			yield (rune ? 75 : extended ? 106 : 11);
		else if (ch === 'ń' || ch === 'Ń')
			yield (rune ? 77 : extended ? 107 : 13);
		else if (ch === 'ó' || ch === 'Ó')
			yield (rune ? 78 : extended ? 108 : 63);
		else if (ch === 'ś' || ch === 'Ś')
			yield (rune ? 82 : extended ? 109 : 18);
		else if (ch === 'ź' || ch === 'Ź')
			yield (rune ? 89 : extended ? 110 : 25);
		else if (ch === 'ż' || ch === 'Ż')
			yield (rune ? 89 : extended ? 111 : 25);
		else if (ch === 'í' || ch === 'Í')
			yield (rune ? 72 : extended ? 112 : 8);
		else if (ch === 'ů' || ch === 'Ů')
			yield (rune ? 84 : extended ? 113 : 62);
		else if (ch === 'č' || ch === 'Č')
			yield (rune ? 66 : extended ? 114 : 2);
		else if (ch === 'ď' || ch === 'Ď')
			yield (rune ? 67 : extended ? 115 : 3);
		else if (ch === 'ě' || ch === 'Ě')
			yield (rune ? 68 : extended ? 116 : 4);
		else if (ch === 'ň' || ch === 'Ň')
			yield (rune ? 77 : extended ? 117 : 13);
		else if (ch === 'ř' || ch === 'Ř')
			yield (rune ? 81 : extended ? 118 : 17);
		else if (ch === 'š' || ch === 'Š')
			yield (rune ? 82 : extended ? 119 : 18);
		else if (ch === 'ť' || ch === 'Ť')
			yield (rune ? 83 : extended ? 120 : 19);
		else if (ch === 'ý' || ch === 'Ý')
			yield (rune ? 88 : extended ? 121 : 24);
		else if (ch === 'ž' || ch === 'Ž')
			yield (rune ? 89 : extended ? 122 : 25);
		else if (ch === 'ú' || ch === 'Ú')
			yield (rune ? 84 : extended ? 123 : 62);
		else if (ch === ' ')
			yield SpecialGlyph.SoftSpace;
		else if (ch === '$')
			yield SpecialGlyph.HardSpace;
		else if (ch === '^')
			yield SpecialGlyph.NewLine;
		else if (fallbackChar != null) {
			for (const glyph of this.CharToGlyph(fallbackChar, rune))
				yield glyph;
		}
		else if ([...TextProcessor.RemoveDiacritics(ch)].some(c => charCode(c) > 32 && charCode(c) < 128)) {
			const c = [...TextProcessor.RemoveDiacritics(ch)].find(c => charCode(c) > 32 && charCode(c) < 128);
			const first = this.CharToGlyph(c, rune, ' ').next();
			if (first.done)
				throw new AmbermoonException(ExceptionScope.Data, `Unsupported text character '${ch}'.`);
			const glyph = first.value;

			if (glyph === SpecialGlyph.SoftSpace)
				throw new AmbermoonException(ExceptionScope.Data, `Unsupported text character '${ch}'.`);

			yield glyph;
		}
		else
			throw new AmbermoonException(ExceptionScope.Data, `Unsupported text character '${ch}'.`);
	}

	IsValidCharacter(ch) {
		try {
			this.CharToGlyph(ch, false).next(); // Any is needed to evaluate the IEnumerable immediately
			return true;
		} catch (e) {
			if (!(e instanceof AmbermoonException))
				throw e;
			return false;
		}
	}

	CreateText(text, fallbackChar = null) {
		const self = this;
		function* glyphs() {
			for (let i = 0; i < text.length; ++i)
				yield* self.CharToGlyph(text[i], false, fallbackChar);
		}
		return TextProcessor.FinalizeText(glyphs());
	}

	static FinalizeText(glyphs) {
		const glyphLines = [];
		let currentLineSize = 0;
		let numLines = 0;
		let line = [];

		function NewLine() {
			let index = line.length - 1;

			while (line.length !== 0 && index >= 0) {
				const last = line[index];

				// Trim end
				if (last === SpecialGlyph.SoftSpace) {
					line.splice(index, 1);
					--currentLineSize;
					--index;
				}
				// Remove trailing no trim markers
				else if (last === SpecialGlyph.NoTrim) {
					line.splice(index, 1);
					--index;
				}
				else if (last >= SpecialGlyph.FirstColor) {
					--index;
				}
				else {
					break;
				}
			}

			glyphLines.push(kvp(Uint8Array.from(line), currentLineSize));
			currentLineSize = 0;
			line.length = 0;
			++numLines;
		}

		for (const glyph of glyphs) {
			if (currentLineSize === 0 && line.length !== 0 && glyph === SpecialGlyph.SoftSpace && line[line.length - 1] !== SpecialGlyph.NoTrim)
				continue; // Trim start

			line.push(glyph);

			if (glyph === SpecialGlyph.NewLine)
				NewLine();
			else if (glyph < SpecialGlyph.NoTrim)
				++currentLineSize;
		}

		if (lastOrDefault(line, null, 0) !== SpecialGlyph.NewLine)
			NewLine();

		return new Text(glyphLines);
	}

	GetLines(text, lineOffset, numLines) {
		if (lineOffset >= 0) {
			let lines = text.InternalLines.slice(lineOffset);
			lines = lines.slice(0, Math.max(0, Util.Min(numLines, lines.length)));
			return new Text(lines);
		}
		else if (lineOffset === -numLines) {
			return new Text(repeat(kvp(Uint8Array.of(SpecialGlyph.NewLine), 1), numLines));
		}
		else {
			// Note: Enumerable.Repeat repeats the same KeyValuePair (struct) instance.
			const emptyLine = kvp(Uint8Array.of(SpecialGlyph.NewLine), -lineOffset);
			const emptyLines = repeat(emptyLine, -lineOffset);
			const remainingLines = numLines + lineOffset;
			const lines = text.InternalLines;
			emptyLines.push(...lines.slice(0, Math.max(0, Util.Min(remainingLines, lines.length))));
			return new Text(emptyLines);
		}
	}

	WrapText(text, bounds, glyphSize) {
		if (text.WrappedSize?.Width === bounds.Width && text.WrappedSize?.Height >= bounds.Height &&
			Size.op_Equality(text.WrappedGlyphSize, glyphSize))
			return text;

		let x = bounds.Left;
		let y = bounds.Top;
		let lastSpaceIndex = -1;
		let currentLineSize = 0;
		let maxLineWidth = 0;
		let height = 0;
		const wrappedGlyphLines = [];
		let line = [];
		let addedSoftspaceNewline = false;

		function NewLine() {
			// Trim end
			let index = line.length - 2;

			while (index >= 0) {
				const last = line[index];

				if (last === SpecialGlyph.SoftSpace) {
					line.splice(index, 1);
					--currentLineSize;
					--index;
					x -= glyphSize.Width;
				}
				else if (last === SpecialGlyph.NoTrim) {
					line.splice(index, 1);
					--index;
				}
				else if (last >= SpecialGlyph.FirstColor) {
					--index;
				}
				else {
					break;
				}
			}

			if (x > bounds.Left + maxLineWidth)
				maxLineWidth = x - bounds.Left;

			lastSpaceIndex = -1;
			x = bounds.Left;
			y += glyphSize.Height;
			height = y;
			wrappedGlyphLines.push(kvp(Uint8Array.from(line), currentLineSize));
			line.length = 0;
			currentLineSize = 0;
		}

		const LastGlyph = () => line.length !== 0 ? lastOrDefault(line, null, 0) :
			(wrappedGlyphLines.length === 0 ? null : lastOrDefault(wrappedGlyphLines[wrappedGlyphLines.length - 1].Key, null, 0));

		let index = -1; // 362

		for (const glyph of text.GlyphIndices) {
			++index;

			if (glyph !== SpecialGlyph.NewLine)
				addedSoftspaceNewline = false;

			switch (glyph) {
				case SpecialGlyph.SoftSpace:
					if (LastGlyph() === SpecialGlyph.NewLine)
						continue;
					x += glyphSize.Width;
					if (x > bounds.Right) {
						x -= glyphSize.Width;
						line.push(SpecialGlyph.NewLine);
						NewLine();
						addedSoftspaceNewline = true;
					}
					else {
						lastSpaceIndex = line.length;
						line.push(glyph);
						++currentLineSize;
					}
					break;
				case SpecialGlyph.NewLine:
					if (addedSoftspaceNewline) {
						addedSoftspaceNewline = false;
						continue;
					}
					line.push(glyph);
					NewLine();
					break;
				default:
				{
					if (glyph >= SpecialGlyph.NoTrim) {
						line.push(glyph);
					}
					else {
						x += glyphSize.Width;

						if (x > bounds.Right) {
							if (lastSpaceIndex !== -1) {
								line.push(glyph);
								++currentLineSize;
								line[lastSpaceIndex] = SpecialGlyph.NewLine;
								const newLine = line.slice(lastSpaceIndex + 1);
								line = line.slice(0, lastSpaceIndex + 1);
								currentLineSize = line.filter(c => c < SpecialGlyph.NewLine).length;
								x = bounds.Left + currentLineSize * glyphSize.Width;
								NewLine();
								currentLineSize = newLine.filter(c => c < SpecialGlyph.NewLine).length;
								x = bounds.Left + currentLineSize * glyphSize.Width;
								line = newLine.slice();
							}
							else {
								line.push(SpecialGlyph.NewLine);
								NewLine();
								line.push(glyph);
								currentLineSize = 1;
							}
						}
						else {
							line.push(glyph);
							++currentLineSize;
						}
					}
					break;
				}
			}
		}

		if (LastGlyph() === SpecialGlyph.NewLine) {
			const lastKey = wrappedGlyphLines[wrappedGlyphLines.length - 1].Key;
			lastKey[lastKey.length - 1] = SpecialGlyph.SoftSpace;
		}

		if (line.length > 0)
			wrappedGlyphLines.push(kvp(Uint8Array.from(line), currentLineSize));

		const result = new Text(wrappedGlyphLines);
		result.WrappedSize = new Size(bounds.Size);
		result.WrappedGlyphSize = new Size(glyphSize);
		return result;
	}

	ProcessText(text, nameProvider, dictionary, fallbackChar = null) {
		const glyphIndices = [];

		if (nameProvider != null) {
			text = text.replaceAll('~LEAD~', () => nameProvider.LeadName ?? '');
			text = text.replaceAll('~SELF~', () => nameProvider.SelfName ?? '');
			text = text.replaceAll('~CAST~', () => nameProvider.CastName ?? '');
			text = text.replaceAll('~INVN~', () => nameProvider.InvnName ?? '');
			text = text.replaceAll('~SUBJ~', () => nameProvider.SubjName ?? '');
			text = text.replaceAll('~SEX1~', () => nameProvider.Sex1Name ?? '');
			text = text.replaceAll('~SEX2~', () => nameProvider.Sex2Name ?? '');
		}

		let rune = false;
		let tagStart = -1;
		let dictRefStart = -1;

		function ProcessTag(name) {
			if (name === 'RUN1')
				rune = true;
			else if (name === 'NORM')
				rune = false;
			else if (name.startsWith('INK ')) {
				const numberText = name.substring(4);
				const valid = /^\s*[+-]?\d+\s*$/.test(numberText);
				const colorIndex = valid ? parseInt(numberText.trim(), 10) : 0;

				if (!valid || colorIndex < 0 || colorIndex > 32)
					throw new AmbermoonException(ExceptionScope.Data, `Invalid ink tag: ~${name}~`);

				glyphIndices.push((SpecialGlyph.FirstColor + colorIndex) & 0xff);
			}
			else {
				throw new AmbermoonException(ExceptionScope.Data, `Unknown tag: ~${name}~`);
			}
		}

		for (let i = 0; i < text.length; ++i) {
			if (text[i] === '~') {
				if (dictRefStart !== -1)
					throw new AmbermoonException(ExceptionScope.Data, 'Tag inside a dictionary reference.');

				if (tagStart === -1)
					tagStart = i + 1;
				else {
					if (tagStart > 1 && text[tagStart - 2] === ' ') {
						if (glyphIndices.length - 1 < 0)
							throw new ArgumentOutOfRangeException('index');
						glyphIndices.splice(glyphIndices.length - 1, 0, SpecialGlyph.NoTrim);
					}

					ProcessTag(text.substring(tagStart, i));
					tagStart = -1;
				}
			}
			else if (tagStart !== -1) {
				continue;
			}
			else if (text[i] === '>') {
				if (dictRefStart !== -1)
					throw new AmbermoonException(ExceptionScope.Data, 'A second dictionary reference started before the last was closed.');

				dictRefStart = i + 1;
			}
			else if (text[i] === '<') {
				if (dictRefStart === -1)
					throw new AmbermoonException(ExceptionScope.Data, 'Closing dictionary reference without starting one.');

				dictionary.push(text.substring(dictRefStart, i).trim());
				dictRefStart = -1;
			}
			else {
				if (glyphIndices.length !== 0 && glyphIndices[glyphIndices.length - 1] >= SpecialGlyph.FirstColor)
					glyphIndices.push(SpecialGlyph.NoTrim);

				glyphIndices.push(...this.CharToGlyph(text[i], rune, fallbackChar));
			}
		}

		if (tagStart !== -1)
			throw new AmbermoonException(ExceptionScope.Data, `Not closed tag at position ${tagStart - 1}.`);
		if (dictRefStart !== -1)
			throw new AmbermoonException(ExceptionScope.Data, `Not closed dictionary reference at position ${dictRefStart - 1}.`);

		return TextProcessor.FinalizeText(glyphIndices);
	}
}
