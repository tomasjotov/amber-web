// Amberstar text -> Ambermoon text conversion and the keyword dictionary.
//
// Amberstar texts are lists of word indices into the global text fragment table (AMBERDEV.UDO).
// Special fragments: '#' starts a new line, '##' / '@' a new paragraph, punctuation is attached to the
// previous word and '(' to the next one.
// Ambermoon texts are plain strings where '^' is a new line, '$' a hard space and '~' starts a tag,
// so these characters must not appear as normal characters.
import { TextDictionary } from '../../../ambermoon/Ambermoon.Data.Common/TextDictionary.js';

const endPunctuation = /^[.,!?:;)'"]+$/;

/** Escapes characters which have a special meaning in Ambermoon texts. */
export function sanitize(text) {
	return text.replace(/[~^$<>{}]/g, c => c === '~' ? '-' : c === '$' ? 'S' : '');
}

/** Converts an Amberstar Text (amberstar/src/data/text.js) with one text block to an Ambermoon string. */
export function textToString(text) {
	if (!text)
		return '';
	const fragments = text.fragments;
	let result = '';
	let attachNext = true;
	for (const index of text.indices) {
		const fragment = fragments[index] ?? '';
		if (index === 0 || fragment.length === 0)
			continue;
		if (fragment === '#') {
			result = result.trimEnd() + '^';
			attachNext = true;
			continue;
		}
		if (fragment === '##' || fragment === '@') {
			result = result.trimEnd() + '^^';
			attachNext = true;
			continue;
		}
		if (fragment === '(') {
			result += (attachNext ? '' : ' ') + '(';
			attachNext = true;
			continue;
		}
		if (endPunctuation.test(fragment) || attachNext)
			result += sanitize(fragment);
		else
			result += ' ' + sanitize(fragment);
		attachNext = false;
	}
	return result.trim();
}

/** All text blocks of a multi block Amberstar Text as strings. */
export function textBlocksToStrings(text) {
	if (!text)
		return [];
	const result = [];
	for (let i = 0; i < text.textBlockCount; i++)
		result.push(textToString(text.getTextBlock(i)));
	return result;
}

/** Amberstar message (embedded in the program) as Ambermoon string. */
export function messageToString(source, messageIndex) {
	try {
		return textToString(source.message(messageIndex));
	} catch {
		return '';
	}
}

/** "LEATHER SHOES" -> "Leather Shoes" (Ambermoon uses mixed case names). */
export function titleCase(name) {
	return (name ?? '').toLowerCase().replace(/(^|[\s\-/(])([a-zß])/g, (m, p, c) => p + c.toUpperCase());
}

// ---------------------------------------------------------------------------------------------
// Keyword dictionary
//
// Contract with the map event converter: the Ambermoon dictionary index of a keyword is the Amberstar
// text fragment index (Amberstar stores one "known word" bit per fragment too). So the dictionary holds
// all text fragments (about 4000, empty/punctuation fragments become empty entries) and
// Savegame.DictionaryWords is enlarged to 626 bytes (Amberstar knownWordsBits). The Ambermoon savegame
// format only stores 128 bytes; the savegame manager stores the full bits separately.
// ---------------------------------------------------------------------------------------------
export function getDictionary(ctx) {
	if (!ctx.result.dictionary || !ctx.amberstarDictionary) {
		const dictionary = new TextDictionary();
		dictionary.Language = ctx.base.Dictionary?.Language ?? 0;
		for (const fragment of ctx.source.textFragments) {
			const word = sanitize(fragment ?? '').trim();
			dictionary.Entries.push(/^[A-Z0-9À-ſ'-]+$/i.test(word) ? word : '');
		}
		ctx.result.dictionary = dictionary;
		ctx.amberstarDictionary = dictionary;
	}
	return ctx.result.dictionary;
}

/** Ambermoon dictionary index of an Amberstar keyword (text fragment index) = the fragment index. */
export function getKeywordIndex(ctx, fragmentIndex) {
	getDictionary(ctx);
	return fragmentIndex;
}

/** Size of Savegame.DictionaryWords in bytes (Amberstar knownWordsBits). */
export function dictionaryBytes(ctx) {
	return Math.max(626, Math.ceil(ctx.source.textFragments.length / 8));
}
