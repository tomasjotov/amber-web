// Port of SonicArranger/Voice.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

import { toSByte } from '../../runtime.js';
import { BinaryWriterExtensions } from './BinaryWriterExtensions.js';

export class Voice {
	constructor(reader = null) {
		this.NoteAddress = 0;
		this.SoundTranspose = 0;
		this.NoteTranspose = 0;

		if (reader != null) {
			this.NoteAddress = reader.ReadBEInt16();
			this.SoundTranspose = toSByte(reader.ReadByte());
			this.NoteTranspose = toSByte(reader.ReadByte());
		}
	}

	Write(writer) {
		BinaryWriterExtensions.WriteBEInt16(writer, this.NoteAddress);
		writer.Write(this.SoundTranspose & 0xff);
		writer.Write(this.NoteTranspose & 0xff);
	}
}
