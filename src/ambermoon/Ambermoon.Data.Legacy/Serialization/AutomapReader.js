// Port of Ambermoon.Data.Legacy/Serialization/AutomapReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class AutomapReader {
	ReadAutomap(automap, dataReader) {
		automap.ExplorationBits = dataReader.ReadToEnd();
	}
}
