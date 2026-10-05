// Port of SonicArranger/NoteTable.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

import { Note } from './Note.js';
import { BinaryWriterExtensions } from './BinaryWriterExtensions.js';

export class NoteTable {
	/**
	 * Overloads: NoteTable(ICustomReader reader) and NoteTable(Note[] Notes)
	 */
	constructor(readerOrNotes) {
		if (Array.isArray(readerOrNotes)) {
			const notes = readerOrNotes;
			this.Count = notes.length;
			this.Notes = notes;
		} else {
			const reader = readerOrNotes;
			this.Count = reader.ReadBEInt32();
			this.Notes = new Array(Math.max(0, this.Count)).fill(null);
			for (let i = 0; i < this.Count; i++) {
				this.Notes[i] = new Note(reader);
			}
		}
	}

	Write(writer) {
		BinaryWriterExtensions.WriteBEInt32(writer, this.Count);

		for (const item of this.Notes) {
			item.Write(writer);
		}
	}
}
