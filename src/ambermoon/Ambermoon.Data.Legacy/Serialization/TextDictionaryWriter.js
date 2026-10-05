// Port of Ambermoon.Data.Legacy/Serialization/TextDictionaryWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class TextDictionaryWriter {
	static WriteTextDictionary(textDictionary, dataWriter) {
		dataWriter.WriteWord(textDictionary.Entries.length);

		for (const entry of textDictionary.Entries)
			dataWriter.Write(entry);
	}
}
