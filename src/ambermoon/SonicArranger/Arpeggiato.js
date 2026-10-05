// Port of SonicArranger/Arpeggiato.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

export class Arpeggiato {
	constructor(reader = null) {
		this.Length = 0;
		this.Repeat = 0;
		this.Data = null;

		if (reader != null) {
			this.Length = reader.ReadByte();
			this.Repeat = reader.ReadByte();
			this.Data = reader.ReadBytes(14);
		}
	}

	Write(writer) {
		writer.Write(this.Length);
		writer.Write(this.Repeat);
		writer.Write(this.Data);
	}
}
