// Port of SonicArranger/OverTable.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

import { Voice } from './Voice.js';
import { BinaryWriterExtensions } from './BinaryWriterExtensions.js';

export class OverTable {
	/**
	 * Overloads: OverTable(ICustomReader reader) and OverTable(Voice[] voices)
	 */
	constructor(readerOrVoices) {
		if (Array.isArray(readerOrVoices)) {
			const voices = readerOrVoices;
			this.Count = Math.trunc(voices.length / 4);
			this.Voices = voices;
		} else {
			const reader = readerOrVoices;
			this.Count = reader.ReadBEInt32();
			this.Voices = new Array(Math.max(0, this.Count * 4)).fill(null);
			for (let i = 0; i < this.Count * 4; i++) {
				this.Voices[i] = new Voice(reader);
			}
		}
	}

	Write(writer) {
		BinaryWriterExtensions.WriteBEInt32(writer, this.Count);

		for (const voice of this.Voices)
			voice.Write(writer);
	}
}
