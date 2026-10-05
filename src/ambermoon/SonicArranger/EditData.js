// Port of SonicArranger/EditData.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

import { BinaryWriterExtensions } from './BinaryWriterExtensions.js';

/** new string(char[]) - ReadChars may return a char array or a string */
const charsToString = chars => (Array.isArray(chars) ? chars.join('') : String(chars ?? ''));
/** Encoding.ASCII.GetBytes */
const asciiBytes = str => Uint8Array.from(str, ch => { const c = ch.charCodeAt(0); return c < 0x80 ? c : 0x3f; });

/**
 * Editor data.
 *
 * There seems to be a bug with the voice states.
 * There are two 16-bit words. The first stores
 * the enable state of Voice 1, the second that
 * of Voice 2. But the states for Voice 3 and 4
 * are missing. I guess it was planned to use
 * the 4 bytes for the 4 voices but then used
 * words. Neither saving nor loading will consider
 * voices 3 or 4.
 */
export class EditData {
	/**
	 * Overloads: EditData(string version = null) and EditData(ICustomReader reader)
	 */
	constructor(versionOrReader = null) {
		if (versionOrReader != null && typeof versionOrReader === 'object') {
			const reader = versionOrReader;
			this.Version = charsToString(reader.ReadChars(4));
			/** Voice 1 state (on/off). */
			this.EnableVoice1 = reader.ReadByte() !== 0;
			/** Voice 2 state (on/off). */
			this.EnableVoice2 = reader.ReadByte() !== 0;
			/** Voice 3 state (on/off). */
			this.EnableVoice3 = reader.ReadByte() !== 0;
			/** Voice 4 state (on/off). */
			this.EnableVoice4 = reader.ReadByte() !== 0;
			/** Currently selected play position (pattern editor). */
			this.PlayPosition = reader.ReadBEInt16();
			/**
			 * Currently selected song position (row index).
			 * This is also the edit position in the pattern editor.
			 */
			this.SelectedPosition = reader.ReadBEInt16();
			/**
			 * Currently selected song. In contrast to
			 * the UI this is 0-based so the first song
			 * is 0, the second is 1, etc.
			 */
			this.SelectedSong = reader.ReadBEInt16();
			this.Unknown = reader.ReadBEInt16();
			/** Current column (voice) in pattern editor. */
			this.PatternEditorVoice = reader.ReadBEInt16();
			/** Current row in pattern editor. */
			this.PatternEditorRow = reader.ReadBEInt16();
		} else {
			const version = versionOrReader;
			this.Version = version?.padEnd(4, '\0') ?? 'V1.1';
			this.EnableVoice1 = true;
			this.EnableVoice2 = true;
			this.EnableVoice3 = true;
			this.EnableVoice4 = true;
			this.PlayPosition = 0;
			this.SelectedPosition = 0;
			this.SelectedSong = 0;
			this.Unknown = 0;
			this.PatternEditorVoice = 0;
			this.PatternEditorRow = 0;
		}
	}

	Write(writer) {
		writer.Write(asciiBytes((this.Version ?? '').padEnd(4, '\0').substring(0, 4)));
		writer.Write(this.EnableVoice1 ? 1 : 0);
		writer.Write(this.EnableVoice2 ? 1 : 0);
		writer.Write(this.EnableVoice3 ? 1 : 0);
		writer.Write(this.EnableVoice4 ? 1 : 0);
		BinaryWriterExtensions.WriteBEInt16(writer, this.PlayPosition);
		BinaryWriterExtensions.WriteBEInt16(writer, this.SelectedPosition);
		BinaryWriterExtensions.WriteBEInt16(writer, this.SelectedSong);
		BinaryWriterExtensions.WriteBEInt16(writer, this.Unknown);
		BinaryWriterExtensions.WriteBEInt16(writer, this.PatternEditorVoice);
		BinaryWriterExtensions.WriteBEInt16(writer, this.PatternEditorRow);
	}
}
