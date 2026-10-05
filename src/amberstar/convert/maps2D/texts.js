// Amberstar text -> Ambermoon text conversion (see AMBERSTAR.md, converter 2).
//
// Amberstar texts are lists of indices into the global text fragment table (words and punctuation).
// The loader of the Amberstar web port (amberstar/src/data/text.js) already knows how to assemble
// them: fragments are joined by spaces, punctuation is attached to the previous word, '#' is a
// carriage return and '##'/'@' is a paragraph marker.
//
// Ambermoon texts are plain strings processed by TextProcessor.ProcessText (Ambermoon.Data.Legacy/Text.js):
//   '^'  new line          '$'  hard space          ' '  soft space (line wrap)
//   '~TAG~'  formatting tags (~INK n~, ~RUN1~, ~LEAD~, ...)
//   '>word<' dictionary references (the word is learned when the text is shown)
// So an Amberstar carriage return becomes '^' and a paragraph break becomes an empty line ('^^').
// Characters with a special meaning in Ambermoon texts are replaced by harmless ones.

/** Replaces characters which have a special meaning for the Ambermoon text processor. */
export function sanitizeAmbermoonText(text) {
	let result = '';
	for (const ch of text) {
		switch (ch) {
			case '^': result += ' '; break;
			case '~': result += '-'; break;
			case '$': result += 'S'; break;
			case '<': result += '('; break;
			case '>': result += ')'; break;
			case '\t': result += ' '; break;
			default:
				// control characters are dropped, everything else is kept (the Ambermoon text processor
				// maps unknown characters with diacritics to the base glyph)
				if (ch >= ' ')
					result += ch;
				break;
		}
	}
	return result;
}

/**
 * Converts an Amberstar Text (amberstar/src/data/text.js) to an Ambermoon text string.
 * Explicit line breaks are kept ('^'), paragraphs are separated by an empty line ('^^').
 * The Ambermoon engine wraps the lines itself.
 */
export function convertAmberstarText(text) {
	if (text == null)
		return '';
	// A huge width disables the word wrapping of the Amberstar loader, only explicit breaks remain.
	const paragraphs = text.getParagraphs(1 << 20);
	const result = paragraphs
		.map(lines => lines.map(line => sanitizeAmbermoonText(line).trimEnd()).join('^'))
		.join('^^');
	// remove leading/trailing empty lines
	return result.replace(/^(\^)+/, '').replace(/(\^)+$/, '');
}

/** All texts of Amberstar map `mapIndex` (MAPTEXT.AMB) as Ambermoon strings in their original order. */
export function convertMapTexts(ctx, mapIndex) {
	let container;
	try {
		container = ctx.source.text('map', mapIndex);
	} catch {
		return [];
	}
	const texts = [];
	for (let i = 0; i < container.textBlockCount; i++)
		texts.push(convertAmberstarText(container.getTextBlock(i)));
	return texts;
}

/** Amberstar program message (AMBERDEV.UDO message table, e.g. 201 = altar message) as Ambermoon text. */
export function convertMessage(ctx, index) {
	try {
		return convertAmberstarText(ctx.source.message(index));
	} catch {
		return null;
	}
}
