// Converter 5 (see ../../../AMBERSTAR.md): the Amberstar music on the Ambermoon engine.
//
// Amberstar has 19 songs in Jochen Hippel's COSO format (song descriptions in AMBERDEV.UDO, the samples shared by all
// songs in SAMPLEDA.IMG). They are played with the COSO player and Paula emulation of the Amberstar web port
// (amberstar/src/audio/hippelCoso.js + paula.js) and streamed as PCM through the Ambermoon IAudioOutput
// (src/ambermoon/Ambermoon.net/AudioOutput.js), just like the Ambermoon Song (Ambermoon.Data.Legacy/Audio/Song.js)
// streams its SonicArranger data.
//
// Output: ctx.result.songManager implementing ISongManager: GetSong(index) -> ISong
// (Song, SongDuration, Play(audioOutput), Stop() + IAudioStream: EndOfStream, Stream(durationMs), Reset()).
//
// Song keys
// ---------
// The engine calls GetSong with two kinds of values (see Ambermoon.Core/Game/Audio.js PlayMusic):
//  - Map.MusicIndex (map music, ChangeMusicEvent.MusicIndex) and
//  - fixed values of the Ambermoon Song enum (battle, camp, level up, game over, travel music, menu, ...).
// Both use 1..35, so Amberstar song numbers 1..19 in Map.MusicIndex would collide with the enum values the engine
// requests itself (e.g. Song.SapphireFireballsOfPureLove = 11 is the battle music, Song.Ship = 6 the ship travel music).
// Therefore this converter (it runs last) moves the Amberstar song numbers of all converted maps (and change music
// events) into their own key range: Amberstar song s -> key AmberstarSongKeyOffset + s (101..119). All other keys are
// Ambermoon enum values which are mapped to the closest Amberstar song (SongMapping below).
//
// There is exactly one ISong object per Amberstar song and its `Song` member is the Amberstar key. So two requests
// that map to the same Amberstar song (e.g. the main menu and the intro, or walking on the world map and a map
// playing Travellers Tune) continue the song instead of restarting it (like Amberstar's playSong), and the engine's
// "remember the last song and play it again" logic (battle, camp, level up) gets back the same object.
import { Song } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/Song.js';
import { ChangeMusicEvent } from '../../ambermoon/Ambermoon.Data.Common/Event.js';
import { CosoModule, CosoPlayer } from '../../../amberstar/src/audio/hippelCoso.js';
import { Paula, PaulaChannel } from '../../../amberstar/src/audio/paula.js';

/** Map.MusicIndex / GetSong key of Amberstar song s is AmberstarSongKeyOffset + s. */
export const AmberstarSongKeyOffset = 100;
export const AmberstarSongCount = 19;

/** The Amberstar songs (names from AMBERDEV.UDO, see amberstar/src/game/game.js). */
export const AmberstarSong = Object.freeze({
	CityWalk: 1, HighSeas: 2, HorseSong: 3, FlyingHigh: 4, TravellersTune: 5, IrishSpring: 6, GwensLament: 7,
	EriksRevenge: 8, Fanfares: 9, OdeToSchnism: 10, MistyOrcHop: 11, Dreamcave: 12, MysticMoments: 13,
	LurkingHorror: 14, BardDance: 15, MinorQuarrels: 16, Lullaby: 17, FunkyDungeon: 18, HastaLaVista: 19,
});

export const AmberstarSongNames = [null, 'City Walk', 'High Seas', 'Horse Song', 'Flying High', 'Travellers Tune',
	'Irish Spring', 'Gwen\'s Lament', 'Erik\'s Revenge', 'Fanfares', 'Ode to Schnism', 'Misty Orc Hop', 'Dreamcave',
	'Mystic Moments', 'Lurking Horror', 'Bard Dance', 'Minor Quarrels', 'Lullaby', 'Funky Dungeon', 'Hasta la Vista'];

/** Ambermoon Song key of an Amberstar song number (1..19). */
export function amberstarSongKey(songNumber) {
	return AmberstarSongKeyOffset + songNumber;
}

const S = AmberstarSong;

/**
 * Ambermoon Song enum value -> Amberstar song number.
 * The values the engine requests itself (grep "Song\." in Ambermoon.Core / Ambermoon.Game / Ambermoon.net):
 *  - battle start (BattleHandling): SapphireFireballsOfPureLove -> Minor Quarrels (Amberstar battle music)
 *  - camp / inn rest (Party.OpenCamp): BarBrawlin -> Lullaby
 *  - level up (Party.ShowLevelUpWindow): StairwayToLevel50 -> Fanfares (Amberstar has no own level up song; the
 *    engine plays the previous song again afterwards)
 *  - game over (Game.GameOver): GameOver -> Hasta la Vista
 *  - new game (Lifecycle): HisMastersVoice -> Fanfares (Amberstar keeps the main menu song until the first map
 *    starts its music; with the shared song object it simply continues)
 *  - intro / main menu (ambermoonHost, MainMenu): Intro, Menu -> Fanfares; outro: Outro -> Fanfares
 *  - travel music (TravelTypeExtensions.TravelSong, used on maps with Map.UseTravelMusic, i.e. the world map):
 *    walk/swim -> Song.Default -> PloddingAlong -> Travellers Tune, horse -> Horse Song, raft and ship -> High Seas,
 *    magical disc, eagle and flying -> Flying High (Amberstar: WorldMapSongs = [5, 3, 2, 2, 4, 4, 4] for
 *    walk, horse, raft, ship, magic disc, eagle, super chicken). The Ambermoon-only transports get the nearest match.
 *  - custom outro (CustomOutro): TheUhOhSong, Ship, VoiceOfTheBagpipe
 * The remaining values are Ambermoon map songs (only reachable through the elf harp song list): thematic matches.
 */
export const SongMapping = new Map([
	[Song.WhoSaidHiHo, S.Dreamcave], // dwarven mines
	[Song.MellowCamelFunk, S.HorseSong], // sand lizard (riding)
	[Song.CloseToTheHedge, S.IrishSpring],
	[Song.VoiceOfTheBagpipe, S.IrishSpring],
	[Song.Downtown, S.CityWalk],
	[Song.Ship, S.HighSeas],
	[Song.WholeLottaDove, S.FlyingHigh], // eagle, wasp
	[Song.HorseIsNoDisgrace, S.HorseSong],
	[Song.DontLookBach, S.MysticMoments], // temples
	[Song.RoughWaterfrontTavern, S.BardDance],
	[Song.SapphireFireballsOfPureLove, S.MinorQuarrels], // battle
	[Song.TheAumRemainsTheSame, S.MysticMoments],
	[Song.Capital, S.CityWalk],
	[Song.PloddingAlong, S.TravellersTune], // walking on the world map, default fallback
	[Song.CompactDisc, S.FlyingHigh], // magical disc
	[Song.RiversideTravellingBlues, S.HighSeas], // raft
	[Song.NobodysVaultButMine, S.LurkingHorror],
	[Song.LaCryptaStrangiato, S.LurkingHorror],
	[Song.MistyDungeonHop, S.MistyOrcHop],
	[Song.BurnBabyBurn, S.FlyingHigh], // witch broom
	[Song.BarBrawlin, S.Lullaby], // camp / sleeping
	[Song.PsychedelicDuneGroove, S.HighSeas], // sand ship
	[Song.StairwayToLevel50, S.Fanfares], // level up
	[Song.ThatHunchIsBack, S.GwensLament],
	[Song.ChickenSoup, S.FlyingHigh], // flying
	[Song.DragonChaseInCreepyDungeon, S.FunkyDungeon],
	[Song.HisMastersVoice, S.Fanfares], // new game
	[Song.NoName, S.OdeToSchnism],
	[Song.OhNoNotAnotherMagicalEvent, S.MysticMoments],
	[Song.TheUhOhSong, S.EriksRevenge],
	[Song.OwnerOfALonelySword, S.GwensLament],
	[Song.GameOver, S.HastaLaVista],
	[Song.Intro, S.Fanfares],
	[Song.Outro, S.Fanfares],
	[Song.Menu, S.Fanfares],
]);

/** Output gain (the Amberstar web port uses 0.8 as well). */
const Volume = 0.8;
/** Fade in after a (re)start to avoid clicks (ms). */
const FadeInDuration = 15;
/** The COSO player is driven at 50 Hz (PAL vertical blank). */
const TicksPerSecond = 50;
/** Limit for the song duration detection (10 minutes). */
const MaxDurationTicks = 10 * 60 * TicksPerSecond;

/**
 * Like Ambermoon.Data.Legacy/Audio/SongPlayer: makes the song the current stream of the audio output.
 * The stream is 16 bit signed stereo (little endian) at the output's sample rate (no resampling needed).
 */
class AmberstarSongPlayer {
	constructor() {
		this.currentStream = null;
		this.audioOutput = null;
	}

	Start(audioOutput, audioStream) {
		if (audioOutput == null)
			throw new Error('audioOutput must not be null.');
		this.audioOutput = audioOutput;

		if (this.currentStream !== audioStream) {
			this.Stop();
			this.currentStream = audioStream;
			audioOutput.StreamData(audioStream, 2, audioOutput.SampleRate, false);
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

/**
 * One Amberstar song. Implements ISong and IAudioStream (endless: COSO songs loop forever).
 */
export class AmberstarSongStream {
	/**
	 * @param number Amberstar song number (1..19)
	 * @param data COSO data of the song (AMBERDEV.UDO)
	 * @param sampleData SAMPLEDA.IMG
	 * @param songPlayer shared AmberstarSongPlayer
	 */
	constructor(number, data, sampleData, songPlayer) {
		this.number = number;
		this.Name = AmberstarSongNames[number] ?? `Song ${number}`;
		this.data = data;
		this.sampleData = sampleData;
		this.songPlayer = songPlayer;
		this.module = null; // parsed lazily (CosoModule)
		this.sampleRate = 0;
		this.paula = null;
		this.player = null;
		this.tickRest = 0;
		this.fadeIn = 0;
		this.left = new Float32Array(0);
		this.right = new Float32Array(0);
		this.songDuration = undefined;
	}

	/** ISong.Song: the key under which GetSong returns this song. */
	get Song() { return amberstarSongKey(this.number); }

	/** ISong.SongDuration: length of one pass through the song in milliseconds (null if it could not be detected). */
	get SongDuration() {
		if (this.songDuration === undefined)
			this.songDuration = this.detectDuration();
		return this.songDuration;
	}

	/** IAudioStream.EndOfStream: the songs loop endlessly. */
	get EndOfStream() { return false; }

	getModule() {
		this.module ??= new CosoModule(this.data, this.sampleData);
		return this.module;
	}

	/** Runs the player without rendering until the song restarts. */
	detectDuration() {
		try {
			const channels = [0, 1, 2, 3].map(() => new PaulaChannel());
			const player = new CosoPlayer(this.getModule(), channels);
			for (let tick = 1; tick <= MaxDurationTicks; tick++) {
				player.play();
				if (player.loops > 0)
					return tick * 1000 / TicksPerSecond;
			}
		} catch (error) {
			console.warn(`Amberstar song ${this.number}: duration could not be detected.`, error);
		}
		return null;
	}

	/** Prepares the stream for the given sample rate (must be called before Stream). */
	Prepare(sampleRate) {
		if (this.sampleRate !== sampleRate || this.player == null) {
			this.sampleRate = sampleRate;
			this.Reset();
		}
	}

	/** ISong.Play */
	Play(audioOutput) {
		this.Prepare(audioOutput.SampleRate);
		this.songPlayer.Start(audioOutput, this);
	}

	/** ISong.Stop */
	Stop() {
		this.songPlayer.Stop();
	}

	/** IAudioStream.Reset: restarts the song. */
	Reset() {
		if (!this.sampleRate)
			return;
		this.paula = new Paula(this.sampleRate);
		this.player = new CosoPlayer(this.getModule(), this.paula.channels);
		this.tickRest = 0;
		this.fadeIn = 0;
	}

	/**
	 * IAudioStream.Stream(duration): renders the next `duration` milliseconds.
	 * @returns {Uint8Array} 16 bit signed little endian stereo PCM
	 */
	Stream(duration) {
		if (this.player == null)
			this.Prepare(this.sampleRate || 44100);
		const frames = Math.max(0, Math.round(duration * this.sampleRate / 1000));
		if (this.left.length < frames) {
			this.left = new Float32Array(frames);
			this.right = new Float32Array(frames);
		}
		const left = this.left;
		const right = this.right;
		const samplesPerTick = this.sampleRate / TicksPerSecond;
		let position = 0;
		while (position < frames) {
			if (this.tickRest <= 0) {
				this.player.play();
				this.tickRest += samplesPerTick;
			}
			const count = Math.min(frames - position, Math.ceil(this.tickRest));
			this.paula.render(left, right, position, count);
			position += count;
			this.tickRest -= count;
		}

		const buffer = new Uint8Array(frames * 4);
		const view = new DataView(buffer.buffer);
		const fadeInFrames = FadeInDuration * this.sampleRate / 1000;
		for (let i = 0; i < frames; i++) {
			let gain = Volume;
			if (this.fadeIn < fadeInFrames)
				gain *= this.fadeIn++ / fadeInFrames;
			const l = Math.max(-32768, Math.min(32767, Math.round(left[i] * gain * 32767)));
			const r = Math.max(-32768, Math.min(32767, Math.round(right[i] * gain * 32767)));
			view.setInt16(i * 4, l, true);
			view.setInt16(i * 4 + 2, r, true);
		}
		return buffer;
	}
}

/** Implements ISongManager for the Amberstar songs. */
export class AmberstarSongManager {
	/**
	 * @param songs COSO data per song number (index 1..19, index 0 unused)
	 * @param sampleData SAMPLEDA.IMG
	 */
	constructor(songs, sampleData) {
		this.songPlayer = new AmberstarSongPlayer();
		/** Amberstar song number -> AmberstarSongStream */
		this.songs = new Map();
		for (let number = 1; number < songs.length; number++) {
			if (songs[number]?.length)
				this.songs.set(number, new AmberstarSongStream(number, songs[number], sampleData, this.songPlayer));
		}
	}

	/** Amberstar song number for a GetSong key (see the comment at the top) or 0. */
	static ToAmberstarSong(index) {
		if (index > AmberstarSongKeyOffset && index <= AmberstarSongKeyOffset + AmberstarSongCount)
			return index - AmberstarSongKeyOffset;
		return SongMapping.get(index) ?? 0;
	}

	/** Song of an Amberstar song number (1..19) or null. */
	GetAmberstarSong(number) {
		return this.songs.get(number) ?? null;
	}

	/** ISongManager.GetSong(Song index) */
	GetSong(index) {
		return this.GetAmberstarSong(AmberstarSongManager.ToAmberstarSong(index));
	}

	GetSongInfo(index) {
		return this.GetSong(index);
	}
}

/** Moves Amberstar song numbers (1..19) of a map and its change music events into the Amberstar key range. */
function remapMapMusic(map) {
	const remap = index => (index >= 1 && index <= AmberstarSongCount) ? amberstarSongKey(index) : index;
	map.MusicIndex = remap(map.MusicIndex);
	for (const event of map.Events ?? []) {
		if (event instanceof ChangeMusicEvent)
			event.MusicIndex = remap(event.MusicIndex);
	}
}

export function convert(ctx) {
	const songs = ctx.source.program?.songs;
	const sampleData = ctx.source.files?.get?.('SAMPLEDA.IMG') ?? null;
	if (!songs || songs.length <= 1 || !sampleData) {
		console.warn('Amberstar music data missing (AMBERDEV.UDO songs or SAMPLEDA.IMG): no music.');
		return;
	}
	ctx.result.songManager = new AmberstarSongManager(songs, sampleData);

	// The maps converter stores the Amberstar song number in Map.MusicIndex (AMBERSTAR.md); see the top comment.
	for (const map of ctx.result.maps.values())
		remapMapMusic(map);
}
