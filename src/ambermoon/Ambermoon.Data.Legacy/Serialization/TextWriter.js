// Port of Ambermoon.Data.Legacy/Serialization/TextWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { DataWriter } from './DataWriter.js';

/** string.Trim(params char[] trimChars) */
function trimChars(s, chars) {
	let start = 0;
	let end = s.length;
	while (start < end && chars.includes(s[start]))
		++start;
	while (end > start && chars.includes(s[end - 1]))
		--end;
	return s.substring(start, end);
}

export class TextWriter {
	/** Overloads: (texts) / (texts, trimChars, amigaData) */
	static ToBytes(texts, trimCharList, amigaData) {
		const writer = new DataWriter();
		if (arguments.length < 2)
			TextWriter.WriteTexts(writer, texts);
		else
			TextWriter.WriteTexts(writer, texts, trimCharList, amigaData);
		return writer.ToArray();
	}

	/** Overloads: (textDataWriter, texts) / (textDataWriter, texts, trimChars, amigaData) */
	static WriteTexts(textDataWriter, texts, trimCharList, amigaData) {
		if (arguments.length < 3) {
			TextWriter.WriteTexts(textDataWriter, texts, [' ', '\0'], true);
			return;
		}

		if (texts == null) {
			textDataWriter.WriteWord(0);
			return;
		}

		textDataWriter.WriteWord(texts.length);

		const processedTexts = texts.map(text => {
			if (trimCharList?.length > 0)
				text = trimChars(text, trimCharList);

			if (amigaData && !text.startsWith(' '))
				text = ' ' + text;

			if (amigaData && !text.endsWith(' \0 '))
				text += ' \0 ';
			else if (!text.includes('\0'))
				text += '\0';

			return text;
		});

		for (const text of processedTexts)
			textDataWriter.WriteWord(text.length);

		for (const text of processedTexts)
			textDataWriter.WriteWithoutLength(text);
	}
}
