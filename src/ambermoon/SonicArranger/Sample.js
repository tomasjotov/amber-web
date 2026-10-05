// Port of SonicArranger/Sample.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

export class Sample {
	constructor(reader = null, size = 0) {
		/** Raw 8-bit signed data. */
		this.Data = null;

		if (reader != null)
			this.Data = reader.ReadBytes(size);
	}
}
