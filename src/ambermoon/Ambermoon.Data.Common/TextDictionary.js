// Port of Ambermoon.Data.Common/TextDictionary.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class TextDictionary {
	constructor() {
		this.Language = 0;
		this.Entries = [];
	}

	/**
	 * Overloads:
	 *  - Load(textDictionaryReader, dictionary) where dictionary is a KeyValuePair<GameLanguage, IDataReader>,
	 *    given as [language, dataReader] (Map entry) or { Key, Value }
	 *  - Load(language, entries) where language is a GameLanguage (number) and entries an iterable of strings
	 */
	static Load(...args) {
		const textDictionary = new TextDictionary();

		if (typeof args[0] === 'number') {
			const [language, entries] = args;

			textDictionary.Language = language;
			textDictionary.Entries.push(...entries);
		} else {
			const [textDictionaryReader, dictionary] = args;
			const [key, value] = Array.isArray(dictionary) ? dictionary : [dictionary.Key, dictionary.Value];

			textDictionaryReader.ReadTextDictionary(textDictionary, value, key);
		}

		return textDictionary;
	}
}
