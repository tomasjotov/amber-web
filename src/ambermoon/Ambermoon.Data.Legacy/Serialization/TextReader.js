// Port of Ambermoon.Data.Legacy/Serialization/TextReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

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

export class TextReader {
	/** Overloads: (textDataReader) / (textDataReader, trimChars: string[]) */
	static ReadTexts(textDataReader, trimCharList) {
		if (arguments.length < 2) {
			return TextReader.ReadTexts(textDataReader, [' ', '\0'])
				.map(t => {
					// There are some texts with \0 chars inside them.
					// This is a bug but we should be able to handle
					// such input data.
					if (t.includes('\0'))
						return t.substring(0, t.indexOf('\0'));
					else
						return t;
				});
		}

		const texts = [];

		if (textDataReader != null && textDataReader.Size !== 0) {
			textDataReader.Position = 0;
			const numTexts = textDataReader.ReadWord();
			const textLengths = new Array(numTexts).fill(0);

			for (let i = 0; i < numTexts; ++i)
				textLengths[i] = textDataReader.ReadWord();

			for (let i = 0; i < numTexts; ++i) {
				if (trimCharList?.length > 0)
					texts.push(trimChars(textDataReader.ReadString(textLengths[i]), trimCharList));
				else
					texts.push(textDataReader.ReadString(textLengths[i]));
			}
		}

		return texts;
	}
}
