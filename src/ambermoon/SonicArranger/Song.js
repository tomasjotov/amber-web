// Port of SonicArranger/Song.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

import { BinaryWriterExtensions } from './BinaryWriterExtensions.js';

export class Song {
	constructor(reader = null) {
		this.SongSpeed = 0;
		this.PatternLength = 0;
		this.StartPos = 0;
		this.StopPos = 0;
		this.RepeatPos = 0;
		this.NBIrqps = 0;

		if (reader != null) {
			this.SongSpeed = reader.ReadBEInt16();
			this.PatternLength = reader.ReadBEInt16();
			this.StartPos = reader.ReadBEInt16();
			this.StopPos = reader.ReadBEInt16();
			this.RepeatPos = reader.ReadBEInt16();
			this.NBIrqps = reader.ReadBEInt16();
		}
	}

	/**
	 * This is the BPM when song speed is set to 6 (default).
	 */
	get baseBPM() { return Math.trunc(60 * this.NBIrqps / 24); }

	/**
	 * Initial beats per minute.
	 */
	get InitialBPM() { return this.GetBPM(this.SongSpeed); }

	GetBPM(songSpeed) { return songSpeed === 0 ? 0 : Math.trunc(this.baseBPM * 6 / songSpeed); }

	GetNotesPerSecond(songSpeed) { return songSpeed === 0 ? 0.0 : this.NBIrqps / songSpeed; }

	GetNoteDuration(songSpeed) { return this.NBIrqps === 0 ? 0.0 : songSpeed / this.NBIrqps; }

	Write(writer) {
		BinaryWriterExtensions.WriteBEInt16(writer, this.SongSpeed);
		BinaryWriterExtensions.WriteBEInt16(writer, this.PatternLength);
		BinaryWriterExtensions.WriteBEInt16(writer, this.StartPos);
		BinaryWriterExtensions.WriteBEInt16(writer, this.StopPos);
		BinaryWriterExtensions.WriteBEInt16(writer, this.RepeatPos);
		BinaryWriterExtensions.WriteBEInt16(writer, this.NBIrqps);
	}
}
