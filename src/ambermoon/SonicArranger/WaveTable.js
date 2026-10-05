// Port of SonicArranger/WaveTable.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

export class WaveTable {
	constructor(reader = null) {
		this.Data = null;

		if (reader != null)
			this.Data = reader.ReadBytes(128);
	}

	Write(writer) {
		writer.Write(this.Data);
	}
}
