// Port of SonicArranger/SonicArrangerFile.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

import { Exception, EndOfStreamException, NotImplementedException, NotSupportedException } from '../../runtime.js';
import { BuiltinReader } from './BuiltinReader.js';
import { BinaryWriterExtensions } from './BinaryWriterExtensions.js';
import { EditData } from './EditData.js';
import { Song } from './Song.js';
import { SongTable } from './SongTable.js';
import { Voice } from './Voice.js';
import { OverTable } from './OverTable.js';
import { Note } from './Note.js';
import { NoteTable } from './NoteTable.js';
import { Instrument } from './Instrument.js';
import { InstrumentTable } from './InstrumentTable.js';
import { WaveTable } from './WaveTable.js';
import { SampleTable } from './SampleTable.js';

/** System.IO.InvalidDataException */
class InvalidDataException extends Exception { }
/** System.FormatException */
class FormatException extends Exception { }

/** new string(char[]) - ReadChars may return a char array or a string */
const charsToString = chars => (Array.isArray(chars) ? chars.join('') : String(chars ?? ''));
/** Encoding.ASCII.GetBytes */
const asciiBytes = str => Uint8Array.from(str, ch => { const c = ch.charCodeAt(0); return c < 0x80 ? c : 0x3f; });

const isCustomReader = obj => obj != null && typeof obj.ReadBEInt16 === 'function' && typeof obj.ReadChars === 'function';

/**
 * Minimal BinaryWriter replacement which collects bytes into an array
 * (used by Save when an array is given as target).
 */
class ArrayBinaryWriter {
	constructor(target) {
		this.target = target;
	}

	Write(value) {
		if (typeof value === 'number')
			this.target.push(value & 0xff);
		else if (value != null)
			for (const b of value)
				this.target.push(b & 0xff);
	}
}

/**
 * Timing: There is the primary timing which is
 * mostly used for effects and settings. It is
 * controlled by the IrqsPerSecond setting which
 * is stored as Song.NBIrqps. This
 * is the number of interrupt calls per second.
 * Each interrupt applies effects like ADSR, AMF
 * or volume fading.
 *
 * Table entries used in patterns normally won't
 * use the primary ticks as it is much too short
 * for a sample to play. Therefore the secondary
 * timing can be used. It is controlled by the
 * song speed which is 6 by default but can be
 * changed during playback or globally.
 *
 * The BPM for song speed 6 is calculated as
 * 60 * NBIrqps / 24 which is 125 by default
 * as NBIrqps is 50 by default. For other speeds
 * this BPM value is just multiplied by speed/6.
 *
 * For example if song speed is 4 and NBIrqps is 50
 * the BPM will be 125 * 6 / 4 which is 187.5.
 *
 * To get the number of notes per second the
 * simple formula NBIrqps/speed can be used.
 * For example with default settings (speed=6,
 * NBIrqps=50) there are 50/6 notes per second
 * which equals 8.333 notes per second.
 *
 * So the note duration in seconds is:
 * 1/(NBIrqps/speed) = speed/NBIrqps.
 * Default a note lasts for 0.12 seconds.
 *
 * The volume (amplitude) is always in the range
 * 0x00 (0) to 0x40 (64) which means 0% to 100%.
 *
 * Sonic Arranger supports samples and synthetic
 * mode (waves). If synthetic mode is off (0) a
 * sample is used, otherwise (1) a wave from the
 * synth wave tables.
 *
 * Each instrument sets this option in Instrument.SynthMode.
 * Then the sample or synth wave index is given in Instrument.SampleWaveNo.
 *
 * Synth waves are given as a wave table and are always 128 bytes long.
 * But the length can be lower than that and parts can be repeated.
 * You can access the wave table data by the property Waves.
 * Synth waves are often used together with ADSR waves to create effects.
 * Note that the total data length of the wave data is Length plus Repeat
 * and the sum can only be 128 at max. Also note that both values are in words
 * so you have multiply each of them by 2 to get the size in bytes. This is
 * not true for ADSR and AMF waves though but the Length + Repeat thing is.
 *
 * Samples are at the end of the SA file and are stored in Samples.
 *
 * There are also two additional wave tables. The first one (right after the
 * synth wave tables) are the ADSR waves (also up to 128 bytes each).
 * An instrument can use them by specify the index in Instrument.AdsrWave.
 * Then with Instrument.AdsrLength and Instrument.AdsrRepeat
 * the used part can be specified. A length and repeat of 0 means that no ADSR is used.
 * You can access the ADSR waves with AdsrWaves.
 * ADSR wave tables contain volume amplitudes in the range 0 to 64 (100%).
 *
 * The second of those wave tables is stored as "SYAF" and I guess it is related
 * to the AMF values of the instrument. It is rarely used and I don't know the exact
 * usage but data-wise it is handled in the same fashion as the ADSR waves.
 * You can access the AMF waves with AmfWaves.
 */
export class SonicArrangerFile {
	/**
	 * Overloads:
	 * - SonicArrangerFile(ICustomReader reader) (e.g. Ambermoon's DataReader)
	 * - SonicArrangerFile(BinaryReader reader) / SonicArrangerFile(Stream stream, bool leaveOpen = false):
	 *   in this port any BinaryReader-like object or raw data (Uint8Array / ArrayBuffer / byte array).
	 */
	constructor(reader, leaveOpen = false) {
		if (!isCustomReader(reader))
			reader = new BuiltinReader(reader);

		this.Owner = null;
		this.Version = null;
		this.EditData = null;

		this.Songs = null;
		this.Voices = null;
		this.Notes = null;
		this.Instruments = null;
		this.Waves = null;
		this.AmfWaves = null;
		this.AdsrWaves = null;
		this.Samples = null;

		this.songTable = null;
		this.overTable = null;
		this.noteTable = null;
		this.instrumentTable = null;
		this.sampleTable = null;

		const ThrowInvalidData = () => { throw new InvalidDataException('No valid SonicArranger data stream'); };

		if (reader.Size < 4)
			ThrowInvalidData();

		const soar = charsToString(reader.ReadChars(4));

		if (soar !== 'SOAR') {
			reader.Position -= 4;
			const start = SonicArrangerFile.FindStart(reader);

			if (start === -1)
				ThrowInvalidData();

			// Songtable
			const songOffset = 0x28;
			// Overtable (Voices)
			const overTableOffset = reader.ReadBEInt32();
			// Notetable
			const noteTableOffset = reader.ReadBEInt32();
			// Instruments
			const instrumentsOffset = reader.ReadBEInt32();
			// Synth waveforms
			const sywtptr = reader.ReadBEInt32();
			// Synth ASDR waves
			const syarOffset = reader.ReadBEInt32();
			// Synth AMF waves
			const syafOffset = reader.ReadBEInt32();
			// Sample data
			const samplesOffset = reader.ReadBEInt32();

			const magic = reader.ReadBEUInt16(); // always 0x2144 or 0x2154
			// TODO: is this some sample rate?

			/*if (magic != 0x2144 && magic != 0x2154)
				ThrowInvalidData();*/

			if (reader.ReadBEUInt16() !== 0xffff) // always 0xffff
				ThrowInvalidData();

			const unknownDword = reader.ReadBEUInt32(); // always 0? end of header marker?

			// Read songs
			reader.Position = start + songOffset;
			const numSongs = Math.trunc((overTableOffset - songOffset) / 12);
			this.Songs = new Array(Math.max(0, numSongs)).fill(null);
			for (let i = 0; i < numSongs; ++i) {
				this.Songs[i] = new Song(reader);
			}
			this.songTable = new SongTable(this.Songs);

			// Read voices
			reader.Position = start + overTableOffset;
			const numVoices = Math.trunc((noteTableOffset - overTableOffset) / 4);
			this.Voices = new Array(Math.max(0, numVoices)).fill(null);
			for (let i = 0; i < numVoices; ++i) {
				this.Voices[i] = new Voice(reader);
			}
			this.overTable = new OverTable(this.Voices);

			// Read notes
			reader.Position = start + noteTableOffset;
			const numNotes = Math.trunc((instrumentsOffset - noteTableOffset) / 4);
			this.Notes = new Array(Math.max(0, numNotes)).fill(null);
			for (let i = 0; i < numNotes; ++i) {
				this.Notes[i] = new Note(reader);
			}
			this.noteTable = new NoteTable(this.Notes);

			// Read instruments
			reader.Position = start + instrumentsOffset;
			const numInstruments = Math.trunc((sywtptr - instrumentsOffset) / 152);
			this.Instruments = new Array(Math.max(0, numInstruments)).fill(null);
			for (let i = 0; i < numInstruments; ++i) {
				this.Instruments[i] = new Instrument(reader);
			}
			this.instrumentTable = new InstrumentTable(this.Instruments);

			// Read synth wave forms
			reader.Position = start + sywtptr;
			const numWaveForms = Math.trunc((syarOffset - sywtptr) / 128);
			this.Waves = new Array(Math.max(0, numWaveForms)).fill(null);
			for (let i = 0; i < numWaveForms; ++i) {
				this.Waves[i] = new WaveTable(reader);
			}

			// Read ADSR wave forms
			reader.Position = start + syarOffset;
			const numSynthArrangements = Math.trunc((syafOffset - syarOffset) / 128);
			this.AdsrWaves = new Array(Math.max(0, numSynthArrangements)).fill(null);
			for (let i = 0; i < numSynthArrangements; ++i) {
				this.AdsrWaves[i] = new WaveTable(reader);
			}

			// Read AMF wave forms
			reader.Position = start + syafOffset;
			const numSynthAmfWaves = Math.trunc((samplesOffset - syafOffset) / 128);
			this.AmfWaves = new Array(Math.max(0, numSynthAmfWaves)).fill(null);
			for (let i = 0; i < numSynthAmfWaves; ++i) {
				this.AmfWaves[i] = new WaveTable(reader);
			}

			// Read samples
			reader.Position = start + samplesOffset;
			this.Samples = (this.sampleTable = new SampleTable(reader, false)).Samples;

			if (charsToString(reader.ReadChars(8)) !== 'deadbeef' ||
				reader.ReadBEUInt32() !== 0)
				ThrowInvalidData();

			const authorBytes = [];
			let readAuthor = true;

			while (true) {
				let b = reader.ReadByte();

				if (b === 0)
					break;

				if (!readAuthor)
					continue;

				// As characters are "NOT" encoded and ASCII is used
				// where the msb is 0, the msb for printable characters
				// should be 1 in the author data. So we stop if this
				// is no longer the case. But we will still wait for
				// the end-marker (0 byte).
				if ((b & 0x80) === 0) {
					readAuthor = false;
				} else {
					// Characters are "NOT" encoded
					b = (~b) & 0xff;
					authorBytes.push(b);
				}
			}

			this.Owner = String.fromCharCode(...authorBytes.map(b => (b < 0x80 ? b : 0x3f)));
			this.Version = 'V1.0';
		} else {
			this.Version = charsToString(reader.ReadChars(4));
			let tag;
			while (true) {
				if (reader.Position === reader.Size)
					break;

				tag = charsToString(reader.ReadChars(4));
				switch (tag) {
					case 'STBL':
						this.Songs = (this.songTable = new SongTable(reader)).Songs;
						break;
					case 'OVTB':
						this.Voices = (this.overTable = new OverTable(reader)).Voices;
						break;
					case 'NTBL':
						this.Notes = (this.noteTable = new NoteTable(reader)).Notes;
						break;
					case 'INST':
						this.Instruments = (this.instrumentTable = new InstrumentTable(reader)).Instruments;
						break;
					case 'SD8B':
						this.Samples = (this.sampleTable = new SampleTable(reader, true)).Samples;
						break;
					case 'SYWT': {
						const numTables = reader.ReadBEInt32();
						if (numTables > 0) {
							this.Waves = new Array(numTables).fill(null);
							for (let i = 0; i < numTables; ++i)
								this.Waves[i] = new WaveTable(reader);
						}
						break;
					}
					case 'SYAR': {
						const numTables = reader.ReadBEInt32();
						if (numTables > 0) {
							this.AdsrWaves = new Array(numTables).fill(null);
							for (let i = 0; i < numTables; ++i)
								this.AdsrWaves[i] = new WaveTable(reader);
						}
						break;
					}
					case 'SYAF': {
						const numTables = reader.ReadBEInt32();
						if (numTables > 0) {
							this.AmfWaves = new Array(numTables).fill(null);
							for (let i = 0; i < numTables; ++i)
								this.AmfWaves[i] = new WaveTable(reader);
						}
						break;
					}
					case 'EDAT': {
						this.EditData = new EditData(reader);
						break;
					}
					default:
						throw new FormatException('Invalid SonicArranger module format.');
				}
			}

			if (this.Samples == null) {
				this.Samples = [];
				this.sampleTable = new SampleTable(this.Samples);
			}
			if (this.Waves == null)
				this.Waves = [];
			if (this.AdsrWaves == null)
				this.AdsrWaves = [];
			if (this.AmfWaves == null)
				this.AmfWaves = [];
		}
	}

	static FindStart(reader) {
		const start = 0x00000028;

		try {
			let check = reader.ReadBEUInt32();

			if (check === start)
				return reader.Position - 4;

			while (reader.Position < reader.Size) {
				check = (check << 8) >>> 0;
				check = (check | reader.ReadByte()) >>> 0;

				if (check === start)
					return reader.Position - 4;
			}

			return -1;
		} catch (e) {
			if (!(e instanceof EndOfStreamException))
				throw e;
			return -1;
		}
	}

	/**
	 * There is no file system in the browser. This accepts the file data
	 * (Uint8Array / ArrayBuffer) instead of a file name.
	 */
	static Open(file) {
		if (typeof file === 'string')
			throw new NotSupportedException('Opening files by name is not supported. Pass the file data instead.');
		return new SonicArrangerFile(file);
	}

	/**
	 * Overloads:
	 * - Save(BinaryWriter writer, bool editable): writer is any object with Write(byteOrUint8Array)
	 * - Save(Stream stream, bool editable, bool leaveOpen = false): in this port an array which receives the bytes
	 * - Save(string file, bool editable): not supported (no file system)
	 */
	Save(writer, editable, leaveOpen = false) {
		if (typeof writer === 'string')
			throw new NotSupportedException('Saving to files by name is not supported.');

		if (Array.isArray(writer))
			writer = new ArrayBinaryWriter(writer);

		if (editable) {
			const WriteHeader = header => {
				writer.Write(asciiBytes(header));
			};

			WriteHeader('SOAR');

			WriteHeader((this.Version ?? '').padEnd(4, '\0').substring(0, 4));

			// Songs
			WriteHeader('STBL');
			this.songTable.Write(writer);

			// Voices
			WriteHeader('OVTB');
			this.overTable.Write(writer);

			// Notes
			WriteHeader('NTBL');
			this.noteTable.Write(writer);

			// Instruments
			WriteHeader('INST');
			this.instrumentTable.Write(writer);

			// Samples
			WriteHeader('SD8B');
			this.sampleTable.Write(writer, this.instrumentTable?.Instruments);

			// Synth waves
			WriteHeader('SYWT');
			BinaryWriterExtensions.WriteBEInt32(writer, this.Waves.length);
			for (const waveTable of this.Waves)
				waveTable.Write(writer);

			// ADSR waves
			WriteHeader('SYAR');
			BinaryWriterExtensions.WriteBEInt32(writer, this.AdsrWaves.length);
			for (const waveTable of this.AdsrWaves)
				waveTable.Write(writer);

			// AMF waves
			WriteHeader('SYAF');
			BinaryWriterExtensions.WriteBEInt32(writer, this.AmfWaves.length);
			for (const waveTable of this.AmfWaves)
				waveTable.Write(writer);

			// Edit data
			WriteHeader('EDAT');
			(this.EditData ?? new EditData()).Write(writer);
		} else {
			// TODO
			throw new NotImplementedException();
		}
	}
}
