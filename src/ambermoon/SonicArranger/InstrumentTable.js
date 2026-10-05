// Port of SonicArranger/InstrumentTable.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

import { Instrument } from './Instrument.js';
import { BinaryWriterExtensions } from './BinaryWriterExtensions.js';

export class InstrumentTable {
	/**
	 * Overloads: InstrumentTable(ICustomReader reader) and InstrumentTable(Instrument[] Instruments)
	 */
	constructor(readerOrInstruments) {
		if (Array.isArray(readerOrInstruments)) {
			const instruments = readerOrInstruments;
			this.Count = instruments.length;
			this.Instruments = instruments;
		} else {
			const reader = readerOrInstruments;
			this.Count = reader.ReadBEInt32();
			this.Instruments = new Array(Math.max(0, this.Count)).fill(null);
			for (let i = 0; i < this.Count; i++) {
				this.Instruments[i] = new Instrument(reader);
			}
		}
	}

	Write(writer) {
		BinaryWriterExtensions.WriteBEInt32(writer, this.Count);

		for (const item of this.Instruments) {
			item.Write(writer);
		}
	}
}
