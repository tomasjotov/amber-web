// Port of Ambermoon.Data.Legacy/Audio/SongManager.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException, getValue, tryGetValue } from '../../../runtime.js';
import { Song as Enumerations_Song } from '../../Ambermoon.Data.Common/Enumerations/Song.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { DataReader } from '../Serialization/DataReader.js';
import { Stream as SonicArranger_Stream } from '../../SonicArranger/Stream.js';
import { Song } from './Song.js';
import { SongPlayer } from './SongPlayer.js';

/** Dictionary.Add (throws on duplicate keys like .NET) */
function addToMap(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

const asDataReader = reader => (reader instanceof DataReader ? reader : null);

/**
 * Implements ISongManager.
 */
export class SongManager {
	/**
	 * Overloads:
	 * - SongManager(Map<Enumerations.Song, DataReader> songDataReaders)
	 * - SongManager(ILegacyGameData gameData)
	 */
	constructor(songDataReadersOrGameData) {
		/** Map<Enumerations.Song, Song> */
		this.songs = new Map();
		this.songPlayer = new SongPlayer();

		if (songDataReadersOrGameData instanceof Map) {
			const songDataReaders = songDataReadersOrGameData;

			const AddSong = (song, reader) => {
				const songIndex = song === Enumerations_Song.Menu ? 1 : 0;

				addToMap(this.songs, song, this.CreateSong(song, songIndex, reader));
			};

			for (const [Key, Value] of songDataReaders) {
				AddSong(Key, Value);
			}
		} else {
			const gameData = songDataReadersOrGameData;

			if (gameData == null)
				throw new AmbermoonException(ExceptionScope.Application, 'gameData must not be null.');

			const introContainer = getValue(gameData.Files, 'Intro_music');
			const outroContainer = getValue(gameData.Files, 'Extro_music');
			const musicContainer = getValue(gameData.Files, 'Music.amb');

			const AddSong = (song, readerProvider) => {
				const songIndex = song === Enumerations_Song.Menu ? 1 : 0;
				addToMap(this.songs, song, this.CreateSong(song, songIndex, readerProvider()));
			};

			AddSong(Enumerations_Song.Intro, () => asDataReader(getValue(introContainer.Files, 1)));
			AddSong(Enumerations_Song.Menu, () => asDataReader(getValue(introContainer.Files, 1)));

			for (const [Key, Value] of musicContainer.Files) {
				const song = Key;
				AddSong(song, () => asDataReader(Value));
			}

			AddSong(Enumerations_Song.Outro, () => asDataReader(getValue(outroContainer.Files, 1)));
		}
	}

	CreateSong(song, songIndex, dataReader) {
		return new Song(song, songIndex, this.songPlayer, asDataReader(dataReader),
			SonicArranger_Stream.ChannelMode.Mono, true, true);
	}

	GetSongInternal(index) {
		const [found, song] = tryGetValue(this.songs, index);
		return found ? song : null;
	}

	GetSong(index) { return this.GetSongInternal(index); }

	GetSongInfo(index) { return this.GetSongInternal(index); }

	LoadSong(dataReader, songIndex, lpf, pal) {
		return new Song(Enumerations_Song.Default, songIndex, this.songPlayer, asDataReader(dataReader),
			SonicArranger_Stream.ChannelMode.Mono, lpf, pal);
	}

	static LoadCustomSong(dataReader, songIndex, lpf, pal) {
		return new Song(Enumerations_Song.Default, songIndex, new SongPlayer(), asDataReader(dataReader),
			SonicArranger_Stream.ChannelMode.Mono, lpf, pal);
	}
}
