// Port of SonicArranger/Note.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

const NoteCommand = Object.freeze({
	Arpeggio: 0x0,
	SlideUp: 0x1,
	SetADSRIndex: 0x2,
	Unused: 0x3,
	ResetVibrato: 0x4,
	SetVibrato: 0x5,
	SetMasterVolume: 0x6,
	SetPortamento: 0x7,
	ClearPortamento: 0x8,
	SetPatternLength: 0x9,
	VolumeSlide: 0xa,
	PositionJump: 0xb,
	SetVolume: 0xc,
	PatternBreak: 0xd,
	DisableHardwareLPF: 0xe,
	SetSpeed: 0xf
});

export class Note {
	static NoteCommand = NoteCommand;

	constructor(reader = null) {
		this.Value = 0;
		this.Instrument = 0;
		this.Command = NoteCommand.Arpeggio;
		this.ArpeggioIndex = 0;
		this.CommandInfo = 0;
		/**
		 * If set the note's instrument can't be changed
		 * by a voice's sound transpose.
		 */
		this.DisableSoundTranspose = false;
		/**
		 * If set the note's value can't be changed
		 * by a voice's note transpose.
		 */
		this.DisableNoteTranspose = false;

		if (reader != null) {
			this.Value = reader.ReadByte();
			this.Instrument = reader.ReadByte();
			const flagsAndCommand = reader.ReadByte();
			this.DisableSoundTranspose = (flagsAndCommand & 0x80) !== 0;
			this.DisableNoteTranspose = (flagsAndCommand & 0x40) !== 0;
			this.ArpeggioIndex = (flagsAndCommand >> 4) & 0x3;
			this.Command = flagsAndCommand & 0xf;
			this.CommandInfo = reader.ReadByte();
		}
	}

	Write(writer) {
		writer.Write(this.Value);
		writer.Write(this.Instrument);
		let flagsAndCommand = ((this.ArpeggioIndex & 0x3) << 4) & 0xff;
		flagsAndCommand |= this.Command & 0xf;
		if (this.DisableSoundTranspose)
			flagsAndCommand |= 0x80;
		if (this.DisableNoteTranspose)
			flagsAndCommand |= 0x40;
		writer.Write(flagsAndCommand);
		writer.Write(this.CommandInfo);
	}
}

export { NoteCommand as Note_NoteCommand };
