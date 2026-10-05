// Port of SonicArranger/SongTable.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

import { Song } from './Song.js';
import { BinaryWriterExtensions } from './BinaryWriterExtensions.js';

export class SongTable {
	/**
	 * Overloads: SongTable(ICustomReader reader) and SongTable(Song[] Songs)
	 */
	constructor(readerOrSongs) {
		if (Array.isArray(readerOrSongs)) {
			const songs = readerOrSongs;
			this.Count = songs.length;
			this.Songs = songs;
		} else {
			const reader = readerOrSongs;
			this.Count = reader.ReadBEInt32();
			this.Songs = new Array(Math.max(0, this.Count)).fill(null);
			for (let i = 0; i < this.Count; i++) {
				this.Songs[i] = new Song(reader);
			}
		}
	}

	Write(writer) {
		BinaryWriterExtensions.WriteBEInt32(writer, this.Count);

		for (const item of this.Songs) {
			item.Write(writer);
		}
	}
}
