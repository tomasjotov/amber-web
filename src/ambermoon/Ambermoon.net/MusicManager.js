// Port of Ambermoon.net/MusicManager.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
import { ArgumentNullException, tryGetValue, distinct } from '../../runtime.js';
import { Song } from '../Ambermoon.Data.Common/Enumerations/Song.js';
import { EnumHelper } from '../Ambermoon.Common/EnumHelper.js';
import { FileNameComparer } from '../Ambermoon.Common/FileNameComparer.js';

/** Path.GetFileName */
function getFileName(path) {
	const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
	return index < 0 ? path : path.substring(index + 1);
}

export class MusicManager {
	/**
	 * Browser hook (no file system): function(musicPath) returning the list of available external music
	 * files (names or URLs) or null if there are none. Default: null (no external music).
	 * TODO(port): Directory.GetFiles of the external music folder has no browser equivalent.
	 */
	static ExternalMusicFileLister = null;

	/**
	 * Browser hook for the mp3 loader: function(musicManager, song, filename) returning an ExternalSong
	 * (object with Song, SongDuration (ms), Play(audioOutput), Stop() and the IAudioStream members) or null.
	 * TODO(port): Mp3Song (NLayer based, Ambermoon.net/AudioFormats/Mp3Song.cs) is not ported.
	 */
	static Mp3SongFactory = null;

	/** delegate ExternalSong MusicLoader(MusicManager musicManager, Song song, string filename) */
	static SupportedExtensions = new Map([
		['mp3', (musicManager, song, filename) => MusicManager.LoadMp3(musicManager, song, filename)]
	]);

	static get Songs() {
		return EnumHelper.GetValues(Song).slice(1);
	}

	constructor(configuration, gameData) {
		this.externalSongs = new Map();
		this.audioOutput = null;
		this.currentStream = null;
		this.songManager = null;

		this.songManager = gameData.SongManager;

		this.configuration = configuration;

		this.LoadExternalSongs();
	}

	Dispose() {
		for (const song of this.externalSongs.values()) {
			if (song != null && typeof song.Dispose === 'function')
				song.Dispose();
		}

		this.externalSongs.clear();
	}

	static LoadMp3(musicManager, song, filename) {
		const mp3Song = MusicManager.Mp3SongFactory?.(musicManager, song, filename) ?? null;

		if (mp3Song == null)
			return null;

		if (!mp3Song.SongDuration) // TimeSpan.Zero
			return null;

		return mp3Song;
	}

	/**
	 * LoadExternalSongs()
	 * LoadExternalSongs(string[] files, KeyValuePair<string, MusicLoader> extension)
	 */
	LoadExternalSongs(files, extension) {
		if (arguments.length === 2) {
			this.LoadExternalSongsFromFiles(files, extension);
			return;
		}

		const songCount = 35;

		try {
			// TODO(port): The C# code combines relative paths with the bundle directory
			// (Configuration.ReadonlyBundleDirectory / ExecutableDirectoryPath) and checks Directory.Exists.
			const musicPath = this.configuration.ExternalMusicPath;

			files = MusicManager.ExternalMusicFileLister?.(musicPath) ?? null;

			if (files == null)
				return;
		} catch {
			return;
		}

		for (const extension of MusicManager.SupportedExtensions) {
			this.LoadExternalSongsFromFiles(files, { Key: extension[0], Value: extension[1] });

			if (this.externalSongs.size >= songCount)
				return; // all done
		}
	}

	LoadExternalSongsFromFiles(files, extension) {
		const fileNameComparer = new FileNameComparer();
		const musicFileRegex = new RegExp(`^([0-9]+)([ _-][^.]+)?[.]${extension.Key}$`, 'i');
		const sortedFiles = files.slice().sort((a, b) => fileNameComparer.Compare(a, b));
		const mapped = sortedFiles.map(f => {
			const match = musicFileRegex.exec(getFileName(f));

			if (match)
				return [parseInt(match[1], 10), f, true];

			return [0, null, false];
		}).filter(f => f[2]);
		const musicFiles = new Map(distinct(mapped, t => t[0]).map(f => [f[0], f[1]]));

		for (const song of EnumHelper.GetValues(Song)) {
			if (this.externalSongs.has(song))
				continue; // already loaded

			if (musicFiles.has(song)) {
				const music = extension.Value?.(this, song, musicFiles.get(song)) ?? null;

				if (music != null)
					this.externalSongs.set(song, music);
			}
		}
	}

	GetSong(index) {
		if (this.configuration.ExternalMusic) {
			const [found, song] = tryGetValue(this.externalSongs, index);

			if (found)
				return song;
		}

		return this.songManager.GetSong(index);
	}

	Start(audioOutput, audioStream, channels, sampleRate, sample8Bit) {
		// lock (startMutex)
		if (audioOutput == null)
			throw new ArgumentNullException('audioOutput');

		this.audioOutput = audioOutput;

		if (this.currentStream !== audioStream) {
			this.Stop();
			this.currentStream = audioStream;
			audioOutput.StreamData(audioStream, channels, sampleRate, sample8Bit);
		}
		if (!audioOutput.Streaming)
			audioOutput.Start();
	}

	Stop() {
		this.audioOutput?.Stop();
		this.audioOutput?.Reset();
		this.currentStream = null;
	}
}
