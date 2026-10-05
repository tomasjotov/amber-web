// Port of Ambermoon.Data.Legacy/Serialization/TextDictionaryReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class TextDictionaryReader {
	ReadTextDictionary(textDictionary, dataReader, language) {
		textDictionary.Language = language;

		const numEntries = dataReader.ReadWord();

		for (let i = 0; i < numEntries; ++i)
			textDictionary.Entries.push(dataReader.ReadString());
	}
}
