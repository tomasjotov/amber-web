// Port of Ambermoon.Data.Legacy/Audio/Song.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Song as Enumerations_Song } from '../../Ambermoon.Data.Common/Enumerations/Song.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { SonicArrangerFile } from '../../SonicArranger/SonicArrangerFile.js';
import { Stream as SonicArranger_Stream } from '../../SonicArranger/Stream.js';

// Note: ISonicArrangerSongInfo and ISongDataProvider are pure interfaces (not ported).
// ISonicArrangerSongInfo: SongLength, PatternLength, InterruptsPerSecond, InitialSongSpeed, InitialBeatsPerMinute
// ISongDataProvider: GetData(sampleRate)

/**
 * Implements ISong, ISonicArrangerSongInfo, ISongDataProvider and IAudioStream.
 * TimeSpans are milliseconds (numbers).
 */
export class Song {
	/**
	 * @param song Enumerations.Song value
	 * @param songIndex Song index inside the SonicArranger file
	 * @param songPlayer SongPlayer
	 * @param reader DataReader (Ambermoon.Data.Legacy.Serialization) with the SonicArranger data
	 * @param channelMode SonicArranger Stream.ChannelMode
	 * @param hardwareLPF Use the Amiga hardware low-pass filter emulation
	 * @param pal PAL (true) or NTSC (false) clock
	 */
	constructor(song, songIndex, songPlayer, reader, channelMode, hardwareLPF, pal) {
		this.stream = null;
		this.bytesPerSecond = 0;
		this.songDuration = null;
		this.loop = false;

		this.song = song;
		this.songPlayer = songPlayer;
		this.loop = song === Enumerations_Song.Intro; // this loops to provide the start of the main menu song
		reader.Position = 0;
		this.sonicArrangerFile = new SonicArrangerFile(reader);
		this.sonicArrangerSong = this.sonicArrangerFile.Songs[songIndex];

		const sonicArrangerFile = this.sonicArrangerFile;
		this.streamLoader = sampleRate => new SonicArranger_Stream(sonicArrangerFile, songIndex, sampleRate >>> 0, channelMode, hardwareLPF, pal);
		this.bytesPerSecondProvider = sampleRate => sampleRate * channelMode;
	}

	get SongLength() { return this.sonicArrangerSong.StopPos - this.sonicArrangerSong.StartPos; }
	get PatternLength() { return this.sonicArrangerSong.PatternLength; }
	get InterruptsPerSecond() { return this.sonicArrangerSong.NBIrqps; }
	get InitialSongSpeed() { return this.sonicArrangerSong.SongSpeed; }
	get InitialBeatsPerMinute() { return this.sonicArrangerSong.InitialBPM; }

	/** TimeSpan? -> milliseconds or null */
	get SongDuration() {
		if (this.songDuration == null && this.stream != null && this.stream.EndOfStream && this.bytesPerSecond !== 0)
			this.songDuration = 1000.0 * this.stream.ToUnsignedArray().length / this.bytesPerSecond;

		return this.songDuration;
	}

	/** ISong.Song */
	get Song() { return this.song; }

	get EndOfStream() { return this.stream != null && this.stream.EndOfStream; }

	Play(audioOutput) {
		this.stream ??= this.streamLoader(audioOutput.SampleRate);
		this.bytesPerSecond = this.bytesPerSecondProvider(audioOutput.SampleRate);
		this.songPlayer.Start(audioOutput, this);
	}

	Stop() {
		this.songPlayer.Stop();
	}

	GetData(sampleRate) {
		return this.streamLoader(sampleRate).ToUnsignedArray();
	}

	/**
	 * IAudioStream.Stream(TimeSpan duration)
	 * @param duration Duration in milliseconds
	 * @returns {Uint8Array} unsigned 8-bit PCM data
	 */
	Stream(duration) {
		let remainingDuration = duration;
		const chunks = [];
		let totalLength = 0;

		do {
			const readDuration = Math.min(remainingDuration, 1000.0);
			const chunk = this.stream.ReadUnsigned(Util.Round(readDuration), this.loop);
			chunks.push(chunk);
			totalLength += chunk.length;
			remainingDuration -= readDuration;
		} while (remainingDuration > 0 && !this.stream.EndOfStream);

		const buffer = new Uint8Array(totalLength);
		let position = 0;
		for (const chunk of chunks) {
			buffer.set(chunk, position);
			position += chunk.length;
		}
		return buffer;
	}

	Reset() {
		this.stream?.Reset();
	}
}
