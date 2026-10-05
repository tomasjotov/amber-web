// Port of SonicArranger/Stream.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

import {
	ArgumentNullException, ArgumentOutOfRangeException, EndOfStreamException, NotSupportedException, round
} from '../../runtime.js';
import { PaulaState } from './PaulaState.js';
import { TrackState } from './TrackState.js';

const ChannelMode = Object.freeze({
	Mono: 1,
	Stereo: 2,
	Quad: 4
});

/** unchecked((byte)(sbyte)Math.Max(-128, Math.Min(127, Math.Round(value)))) */
const toOutputByte = value => Math.max(-128, Math.min(127, round(value))) & 0xff;

/**
 * Minimal System.IO.MemoryStream replacement (Write + ToArray).
 */
class MemoryStream {
	constructor() {
		this.chunks = [];
		this.length = 0;
	}

	Write(data, offset, count) {
		this.chunks.push(data.slice(offset, offset + count));
		this.length += count;
	}

	ToArray() {
		const result = new Uint8Array(this.length);
		let position = 0;
		for (const chunk of this.chunks) {
			result.set(chunk, position);
			position += chunk.length;
		}
		return result;
	}
}

export class Stream {
	static ChannelMode = ChannelMode;

	/**
	 * Create a readable sound data stream from a sonic arranger song.
	 * @param sonicArrangerFile Loaded sonic arranger file
	 * @param song Song index (0-based)
	 * @param sampleRate Output sample rate in Hz
	 * @param channelMode Mono, Stereo (LRRL channel pattern) or Quad
	 * @param allowAmigaLowPassFilter Allows the Amiga hardware LPF emulation
	 * @param pal If active the PAL frequency is used, otherwise the NTSC frequency is used.
	 */
	constructor(sonicArrangerFile, song, sampleRate, channelMode, allowAmigaLowPassFilter = true, pal = true) {
		this.bufferSampleIndex = 0;
		this.paulaState = new PaulaState();
		this.tracks = new Array(PaulaState.NumTracks).fill(null);
		this.playTime = 0.0; // in seconds
		this.nextInterruptTime = 0.0;
		this.interruptDelay = 0.020; // 20 ms by default
		this.songSpeed = 6;
		this.patternIndex = 0;
		this.noteIndex = 0;
		this.divisionTick = 0;
		this.endOfStreamIndex = null;
		this.processedAmount = 0;
		this.LoopCounter = 0;
		this.allowLowPassFilter = true;
		this.pal = true;
		this.initialized = false;

		if (sonicArrangerFile == null)
			throw new ArgumentNullException('sonicArrangerFile');

		if (song < 0 || song >= sonicArrangerFile.Songs.length)
			throw new ArgumentOutOfRangeException('song');

		sampleRate = sampleRate >>> 0;

		if (sampleRate < 2000 || sampleRate > 200000)
			throw new NotSupportedException('Only sample rates in the range from 2kHz to 200kHz are supported.');

		this.sonicArrangerFile = sonicArrangerFile;
		this.sampleRate = sampleRate;
		this.channelMode = channelMode;
		this.song = sonicArrangerFile.Songs[song];
		this.pal = pal;
		this.allowLowPassFilter = allowAmigaLowPassFilter;

		if (this.song.NBIrqps < 1 || this.song.NBIrqps > 200)
			throw new NotSupportedException('Number of interrupts must be in the range 1 to 200.');

		// We store 2 seconds of data
		this.buffer = new Uint8Array(2 * sampleRate * channelMode);

		this.interruptDelay = 1.0 / this.song.NBIrqps;

		for (let i = 0; i < PaulaState.NumTracks; ++i)
			this.tracks[i] = new TrackState(i, this.paulaState, sonicArrangerFile);

		this.Reset();
	}

	get EndOfStream() { return this.endOfStreamIndex === this.processedAmount; }

	/**
	 * Resets the stream. Reading will start from the beginning afterwards.
	 */
	Reset() {
		if (this.initialized)
			return;

		const song = this.song;

		if (song.SongSpeed < 1 || song.SongSpeed > 16)
			throw new ArgumentOutOfRangeException('Song speed was outside the valid range of 1 to 16.');

		this.paulaState.Reset(this.allowLowPassFilter, this.pal);
		this.playTime = 0.0;
		this.nextInterruptTime = 0.0;
		this.songSpeed = song.SongSpeed;
		this.patternIndex = song.StartPos;
		this.noteIndex = 0;
		this.divisionTick = 0;
		this.endOfStreamIndex = null;
		this.processedAmount = 0;
		this.bufferSampleIndex = 0;
		this.LoopCounter = 0;

		// Load initial data
		this.Load(0, this.sampleRate * 2, false);

		this.initialized = true;
	}

	/**
	 * Reads the next n milliseconds of sound data.
	 *
	 * Note: If loop is set to false the returned data might have a lower size
	 * when reaching the end or even can be empty when already at the end.
	 *
	 * In case the end is reached without the loop option it is not possible
	 * to read further even if loop is then set to true.
	 *
	 * Best use the same loop option for the whole stream reading.
	 *
	 * The data is signed so a value of 0 is an output level of 0 and the rest is interpreted as a two-complement
	 * signed value. This is how WAV stores 8-bit PCM data.
	 * @param milliSeconds Time in milliseconds to read.
	 * @param loop If set the track is looped when reaching the end.
	 * @returns {Uint8Array}
	 */
	ReadSigned(milliSeconds, loop) {
		this.initialized = false;

		if (this.endOfStreamIndex === this.processedAmount)
			throw new EndOfStreamException('End of stream reached.');

		if (milliSeconds < 0)
			throw new ArgumentOutOfRangeException('milliSeconds');

		if (milliSeconds > 1000)
			throw new NotSupportedException('Only 1 second of data can be read at once.');

		if (milliSeconds === 0)
			return new Uint8Array(0);

		let numSamples = Math.trunc((this.sampleRate * milliSeconds + 999) / 1000);
		const sizePerSample = this.channelMode;
		let bufferIndex = this.bufferSampleIndex * sizePerSample;
		let size = numSamples * sizePerSample;
		let endOfStream = false;
		if (this.endOfStreamIndex != null && size > this.endOfStreamIndex - this.processedAmount) {
			size = this.endOfStreamIndex - this.processedAmount;
			numSamples = Math.trunc(size / sizePerSample);
			endOfStream = true;
		}
		const data = new Uint8Array(size);
		if (bufferIndex + data.length > this.buffer.length)
			throw new ArgumentOutOfRangeException('Offset and length were out of bounds for the array.');
		data.set(this.buffer.subarray(bufferIndex, bufferIndex + data.length));
		this.bufferSampleIndex += numSamples;
		this.processedAmount += data.length;

		if (!endOfStream && this.bufferSampleIndex > this.sampleRate) {
			// When we have read more than 1 second of data we will
			// load more data to the end of the buffer.
			bufferIndex += data.length;
			const loadedSize = this.buffer.length - bufferIndex;
			if (loadedSize !== 0)
				this.buffer.copyWithin(0, bufferIndex, bufferIndex + loadedSize);
			if (this.endOfStreamIndex != null) {
				const remainingSize = (this.endOfStreamIndex - this.processedAmount) - loadedSize;
				this.Load(loadedSize, Math.min(remainingSize, Math.trunc((this.buffer.length - loadedSize) / sizePerSample)), loop);
			} else {
				this.Load(loadedSize, Math.trunc((this.buffer.length - loadedSize) / sizePerSample), loop);
			}
			this.bufferSampleIndex = 0;
		}

		return data;
	}

	/**
	 * Reads the next n milliseconds of sound data.
	 *
	 * Note: If loop is set to false the returned data might have a lower size
	 * when reaching the end or even can be empty when already at the end.
	 *
	 * In case the end is reached without the loop option it is not possible
	 * to read further even if loop is then set to true.
	 *
	 * Best use the same loop option for the whole stream reading.
	 *
	 * The data is unsigned so a value of 128 is an output level of 0. This is how libraries like OpenAL
	 * treat 8-bit PCM data.
	 * @param milliSeconds Time in milliseconds to read.
	 * @param loop If set the track is looped when reaching the end.
	 * @returns {Uint8Array}
	 */
	ReadUnsigned(milliSeconds, loop) {
		const signed = this.ReadSigned(milliSeconds, loop);
		const data = new Uint8Array(signed.length);

		for (let i = 0; i < data.length; ++i)
			data[i] = (signed[i] + 128) & 0xff;

		return data;
	}

	/**
	 * Writes the stream data to the given output stream.
	 *
	 * The data is signed so a value of 0 is an output level of 0 and the rest is interpreted as a two-complement
	 * signed value. This is how WAV stores 8-bit PCM data.
	 * @param stream Output stream to write to (any object with Write(data, offset, count)).
	 * @param maxLoops Max number of loops (0 means no looping). Is limited to 100 for safety reasons.
	 * @param reset If set the stream is reset to the beginning first.
	 */
	WriteSignedTo(stream, maxLoops = 0, reset = true) {
		if (maxLoops > 100)
			throw new ArgumentOutOfRangeException('Max loop count is limited to 100 to avoid unintended harddrive floating.');

		if (reset)
			this.Reset();

		while (!this.EndOfStream) {
			const data = this.ReadSigned(1000, maxLoops > this.LoopCounter);
			stream.Write(data, 0, data.length);
		}
	}

	/**
	 * Writes the stream data to the given output stream.
	 *
	 * The data is unsigned so a value of 128 is an output level of 0. This is how libraries like OpenAL
	 * treat 8-bit PCM data.
	 * @param stream Output stream to write to (any object with Write(data, offset, count)).
	 * @param maxLoops Max number of loops (0 means no looping). Is limited to 100 for safety reasons.
	 * @param reset If set the stream is reset to the beginning first.
	 */
	WriteUnsignedTo(stream, maxLoops = 0, reset = true) {
		if (maxLoops > 100)
			throw new ArgumentOutOfRangeException('Max loop count is limited to 100 to avoid unintended harddrive floating.');

		if (reset)
			this.Reset();

		while (!this.EndOfStream) {
			const data = this.ReadUnsigned(1000, maxLoops > this.LoopCounter);
			stream.Write(data, 0, data.length);
		}
	}

	/**
	 * Provides the stream data as a byte array.
	 *
	 * The data is signed so a value of 0 is an output level of 0 and the rest is interpreted as a two-complement
	 * signed value. This is how WAV stores 8-bit PCM data.
	 * @param maxLoops Max number of loops (0 means no looping). Is limited to 100 for safety reasons.
	 * @param reset If set the stream is reset to the beginning first.
	 * @returns {Uint8Array}
	 */
	ToSignedArray(maxLoops = 0, reset = true) {
		const memoryStream = new MemoryStream();
		this.WriteSignedTo(memoryStream, maxLoops, reset);
		return memoryStream.ToArray();
	}

	/**
	 * Provides the stream data as a byte array.
	 *
	 * The data is unsigned so a value of 128 is an output level of 0. This is how libraries like OpenAL
	 * treat 8-bit PCM data.
	 * @param maxLoops Max number of loops (0 means no looping). Is limited to 100 for safety reasons.
	 * @param reset If set the stream is reset to the beginning first.
	 * @returns {Uint8Array}
	 */
	ToUnsignedArray(maxLoops = 0, reset = true) {
		const memoryStream = new MemoryStream();
		this.WriteUnsignedTo(memoryStream, maxLoops, reset);
		return memoryStream.ToArray();
	}

	Load(bufferIndex, numSamples, loop) {
		const sampleRate = this.sampleRate;
		const paulaState = this.paulaState;
		const tracks = this.tracks;
		const buffer = this.buffer;
		const channelMode = this.channelMode;
		const song = this.song;
		const sonicArrangerFile = this.sonicArrangerFile;
		const NumTracks = PaulaState.NumTracks;

		const ProcessNotes = () => {
			let noteChangeIndex = null;
			let patternChangeIndex = null;

			for (let i = 0; i < NumTracks; ++i) {
				const voice = sonicArrangerFile.Voices[this.patternIndex * 4 + i];
				const note = sonicArrangerFile.Notes[voice.NoteAddress + this.noteIndex];
				tracks[i].Play(note, voice.NoteTranspose, voice.SoundTranspose, this.playTime);
				const [newSongSpeed, trackNoteChangeIndex, trackPatternChangeIndex] = tracks[i].ProcessNoteCommand(
					note.Command, note.CommandInfo, this.songSpeed, this.patternIndex);
				this.songSpeed = newSongSpeed;

				if (trackNoteChangeIndex != null)
					noteChangeIndex = trackNoteChangeIndex;
				if (trackPatternChangeIndex != null)
					patternChangeIndex = trackPatternChangeIndex;
			}

			if (noteChangeIndex != null) {
				this.noteIndex = noteChangeIndex;

				if (patternChangeIndex != null)
					this.patternIndex = patternChangeIndex;
			} else {
				++this.noteIndex;
			}
			if (this.noteIndex >= song.PatternLength) {
				this.noteIndex = 0;

				if (patternChangeIndex != null)
					this.patternIndex = patternChangeIndex;
				else
					++this.patternIndex;
			}
			if (this.patternIndex > song.StopPos) {
				if (loop) {
					++this.LoopCounter;
					this.patternIndex = Math.min(song.RepeatPos, song.StopPos);
				} else {
					// one full note till the end which lasts for noteDuration
					const remainingSamples = Math.trunc(song.GetNoteDuration(this.songSpeed) * sampleRate);
					this.endOfStreamIndex = this.processedAmount + bufferIndex + remainingSamples * channelMode - 1;
				}
			}
		};

		const tick = 1.0 / sampleRate;
		const deltaTime = numSamples / sampleRate - 0.1 * tick; // - 0.1 tick avoids rounding errors in loop condition

		for (let d = 0.0; d < deltaTime; d += tick) {
			if (this.endOfStreamIndex != null && this.endOfStreamIndex === this.processedAmount + bufferIndex)
				return;

			const processTick = this.nextInterruptTime <= this.playTime;

			if (processTick) {
				if (this.divisionTick++ % this.songSpeed === 0)
					ProcessNotes();
			}

			for (let i = 0; i < NumTracks; ++i) {
				paulaState.UpdateCurrentSample(i, this.playTime);
			}

			if (processTick) {
				for (let i = 0; i < NumTracks; ++i)
					tracks[i].Tick(this.songSpeed);

				this.nextInterruptTime += this.interruptDelay;
			}

			if (channelMode === ChannelMode.Quad) {
				for (let i = 0; i < 4; i++) {
					const channelData = paulaState.ProcessTrackOutput(i, this.playTime) * 128.0;
					buffer[bufferIndex++] = toOutputByte(channelData);
				}
			} else if (channelMode === ChannelMode.Stereo) {
				const left = paulaState.ProcessLeftOutput(this.playTime) * 128.0;
				const right = paulaState.ProcessRightOutput(this.playTime) * 128.0;
				buffer[bufferIndex++] = toOutputByte(left);
				buffer[bufferIndex++] = toOutputByte(right);
			} else if (channelMode === ChannelMode.Mono) {
				const data = paulaState.Process(this.playTime) * 128.0;
				buffer[bufferIndex++] = toOutputByte(data);
			}

			this.playTime += tick;
		}
	}
}

export { ChannelMode as Stream_ChannelMode };
