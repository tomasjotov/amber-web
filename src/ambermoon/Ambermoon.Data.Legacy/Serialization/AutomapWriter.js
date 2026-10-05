// Port of Ambermoon.Data.Legacy/Serialization/AutomapWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class AutomapWriter {
	WriteAutomap(automap, dataWriter) {
		dataWriter.Write(automap.ExplorationBits);
	}
}
