// Player for Jochen Hippel's COSO songs (TFMX, compressed), the format of the Amberstar music.
//
// This is a JavaScript port of the COSO mode of the Hippel player from NostalgicPlayer
// (https://github.com/neumatho/NostalgicPlayer, Agent.Player.Hippel/HippelWorker.cs).
// NostalgicPlayer: MIT License, Copyright (c) 2023 Thomas Neumann.
// Only the code paths used by 4 voice COSO modules are ported.
//
// The song descriptions are stored in AMBERDEV.UDO, the samples (shared by all songs) in SAMPLEDA.IMG.
// The player is driven at 50 Hz (play()) and controls 4 Paula-like channels (see paula.js).

const DefaultCommandTable = Uint8Array.of(0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe1);

const Periods = [
	1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 906,
	856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
	428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
	214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
	113, 113, 113, 113, 113, 113, 113, 113, 113, 113, 113, 113,
	3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1812,
];

const sbyte = v => (v & 0x80) ? (v & 0xff) - 256 : v & 0xff;

/**
 * Parsed COSO module. `data` is the COSO blob, `sampleData` the content of SAMPLEDA.IMG
 * (only needed when the module has no samples of its own).
 */
export class CosoModule {
	constructor(data, sampleData) {
		const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
		const u16 = o => dv.getUint16(o);
		const u32 = o => dv.getUint32(o);
		if (String.fromCharCode(...data.subarray(0, 4)) !== 'COSO')
			throw new Error('Not a COSO module');
		const h = {
			frequencies: u32(4), envelopes: u32(8), tracks: u32(12), positionList: u32(16),
			subSongs: u32(20), sampleInfo: u32(24), sampleData: u32(28),
		};
		const numFrequencies = u16(36) + 1;
		const numEnvelopes = u16(38) + 1;
		const numTracks = u16(40) + 1;
		const numPositions = u16(42) + 1;
		const numSubSongs = u16(48);
		const numSamples = u16(50);

		const readIndexed = (offset, count, endOffset) => {
			const offsets = [];
			for (let i = 0; i < count; i++)
				offsets.push(u16(offset + i * 2));
			offsets.push(endOffset);
			return offsets;
		};
		// Frequency (instrument) tables
		let offsets = readIndexed(h.frequencies, numFrequencies, h.envelopes);
		this.frequencies = [];
		for (let i = 0; i < numFrequencies; i++) {
			let length = offsets[i + 1] - offsets[i];
			for (let j = 2; length === 0 && i + j < numFrequencies; j++)
				length = offsets[i + j] - offsets[i];
			this.frequencies.push(length <= 0 ? new Uint8Array(0) : data.slice(offsets[i], offsets[i] + length));
		}
		// Envelopes (timbres)
		offsets = readIndexed(h.envelopes, numEnvelopes, h.tracks);
		this.envelopes = [];
		for (let i = 0; i < numEnvelopes; i++) {
			let length = offsets[i + 1] - offsets[i];
			for (let j = 2; length === 0 && i + j < numEnvelopes; j++)
				length = offsets[i + j] - offsets[i];
			if (length <= 0) {
				this.envelopes.push({ envelopeSpeed: 0, frequencyNumber: 0, vibratoSpeed: 0, vibratoDepth: 0, vibratoDelay: 0, table: new Uint8Array(0) });
				continue;
			}
			const o = offsets[i];
			this.envelopes.push({
				envelopeSpeed: data[o], frequencyNumber: data[o + 1], vibratoSpeed: data[o + 2], vibratoDepth: data[o + 3], vibratoDelay: data[o + 4],
				table: data.slice(o + 5, o + Math.max(5, length)),
			});
		}
		// Tracks (monopatterns)
		offsets = readIndexed(h.tracks, numTracks, h.positionList);
		this.tracks = [];
		for (let i = 0; i < numTracks; i++)
			this.tracks.push(data.slice(offsets[i], offsets[i + 1]));
		// Position list (divisions)
		this.positionList = [];
		let p = h.positionList;
		for (let i = 0; i < numPositions; i++) {
			const channels = [];
			for (let c = 0; c < 4; c++, p += 3)
				channels.push({ track: data[p], noteTranspose: sbyte(data[p + 1]), envelopeTranspose: sbyte(data[p + 2]) });
			this.positionList.push(channels);
		}
		// Sub songs
		this.songs = [];
		for (let i = 0; i < numSubSongs; i++) {
			const o = h.subSongs + i * 6;
			const song = { startPosition: u16(o), lastPosition: u16(o + 2) + 1, startSpeed: u16(o + 4) };
			if (song.startSpeed !== 0 && song.startPosition <= song.lastPosition)
				this.songs.push(song);
		}
		// Samples
		const external = h.sampleData >= data.length;
		const sampleSource = external ? sampleData : data.subarray(h.sampleData);
		this.samples = [];
		for (let i = 0; i < numSamples; i++) {
			const o = h.sampleInfo + i * 10;
			const offset = u32(o);
			const length = u16(o + 4) * 2;
			const loopStart = u16(o + 6) & ~1;
			let loopLength = u16(o + 8) * 2;
			if (loopStart + loopLength > length)
				loopLength = Math.max(0, length - loopStart);
			const sample = new Int8Array(length);
			if (sampleSource) {
				const src = sampleSource.subarray(offset, offset + length);
				sample.set(new Int8Array(src.buffer, src.byteOffset, src.length));
			}
			this.samples.push({ data: sample, length, loopStart, loopLength });
		}
		// Checksum to detect the player version (taken from Flod by Christian Corti).
		// All Amberstar songs use the default (newest) feature set.
		this.checksum = h.frequencies + h.envelopes + h.tracks + h.positionList + h.subSongs + h.sampleInfo + (external ? -1 : h.sampleData) + data[47];
	}
}

function createVoice(module, song, channelIndex) {
	const position = module.positionList[song.startPosition][channelIndex];
	return {
		envelopeTable: DefaultCommandTable, envelopePosition: 0, originalEnvelopeNumber: 0, currentEnvelopeNumber: 0,
		frequencyTable: DefaultCommandTable, frequencyPosition: 0, originalFrequencyNumber: 0, currentFrequencyNumber: 0,
		nextPosition: song.startPosition + 1,
		track: module.tracks[position.track], trackPosition: 0,
		trackTranspose: position.noteTranspose, envelopeTranspose: position.envelopeTranspose,
		transpose: 0, currentNote: 0, currentInfo: 0, previousInfo: 0,
		sample: 0xff, tick: 0, cosoCounter: 0, cosoSpeed: 0,
		volume: 0, envelopeCounter: 1, envelopeSpeed: 1, envelopeSustain: 0,
		vibratoFlag: 0, vibratoSpeed: 0, vibratoDelay: 0, vibratoDepth: 0, vibratoDelta: 0,
		portaDelta: 0,
		slide: false, slideSample: 0, slideEndPosition: 0, slideLoopPosition: 0, slideLength: 0, slideDelta: 0,
		slideCounter: 0, slideSpeed: 0, slideActive: false, slideDone: false,
		volumeFade: 100, volumeVariationDepth: 0, volumeVariation: 0,
	};
}

/**
 * Plays one sub song of a COSO module on 4 channels (objects with the interface of PaulaChannel).
 */
export class CosoPlayer {
	constructor(module, channels, subSong = 0) {
		this.module = module;
		this.channels = channels;
		this.song = module.songs[subSong] ?? module.songs[0];
		this.speed = this.song.startSpeed;
		this.speedCounter = 1;
		this.random = 0;
		this.voices = [0, 1, 2, 3].map(i => createVoice(module, this.song, i));
		this.loops = 0; // how often the song has been restarted
		// Effects of the default (newest) COSO player version
		this.effectsEnabled = [0, 0, 1, 1, 1, 2, 1, 2, 1, 1, 1, 0, 0, 0, 0, 0];
	}

	/** Called 50 times per second. */
	play() {
		if (--this.speedCounter <= 0) {
			this.speedCounter = this.speed;
			for (let i = 0; i < 4; i++)
				this.#readNextRow(i);
		}
		for (let i = 0; i < 4; i++) {
			this.#parseEffects(this.voices[i], this.channels[i]);
			this.#runEffects(this.voices[i], this.channels[i]);
		}
	}

	#readNextRow(voiceIndex) {
		const v = this.voices[voiceIndex];
		const m = this.module;
		v.cosoCounter--;
		if (v.cosoCounter >= 0)
			return;
		v.cosoCounter = v.cosoSpeed;
		for (let guard = 0; guard < 256; guard++) {
			let val = v.track[v.trackPosition] ?? 0xff;
			if (val === 0xff) {
				if (v.nextPosition >= this.song.lastPosition) {
					v.nextPosition = this.song.startPosition;
					if (voiceIndex === 0)
						this.loops++;
				}
				let position = m.positionList[v.nextPosition][voiceIndex];
				v.trackTranspose = position.noteTranspose;
				val = position.envelopeTranspose & 0xff;
				if (val > 127) {
					const command = (val >> 4) & 15;
					val &= 15;
					if (command === 15) {
						v.volumeFade = val !== 0 ? (15 - val + 1) * 6 : 100;
					} else if (command === 8) {
						// song stopped -> restart
						v.nextPosition = this.song.startPosition;
						position = m.positionList[v.nextPosition][voiceIndex];
						v.trackTranspose = position.noteTranspose;
						v.envelopeTranspose = position.envelopeTranspose;
						if (voiceIndex === 0)
							this.loops++;
					} else if (command === 14) {
						this.speed = val & 15;
					}
				} else {
					v.envelopeTranspose = sbyte(val);
				}
				v.track = m.tracks[position.track] ?? m.tracks[0];
				v.trackPosition = 0;
				v.nextPosition++;
				continue;
			}
			if (val === 0xfe) {
				v.cosoSpeed = sbyte(v.track[v.trackPosition + 1]);
				v.cosoCounter = v.cosoSpeed;
				v.trackPosition += 2;
				continue;
			}
			if (val === 0xfd) {
				v.cosoSpeed = sbyte(v.track[v.trackPosition + 1]);
				v.cosoCounter = v.cosoSpeed;
				v.trackPosition += 2;
				return;
			}
			// note
			v.currentNote = val;
			v.currentInfo = v.track[v.trackPosition + 1] ?? 0;
			if ((v.currentInfo & 0xe0) !== 0) {
				v.previousInfo = v.track[v.trackPosition + 2] ?? 0;
				v.trackPosition += 3;
			} else {
				v.trackPosition += 2;
			}
			v.portaDelta = 0;
			if (val < 128) {
				let envelopeNumber = ((v.currentInfo & 0x1f) + v.envelopeTranspose) & 0xff;
				if (envelopeNumber >= m.envelopes.length)
					envelopeNumber = 0;
				const envelope = m.envelopes[envelopeNumber];
				v.envelopeCounter = envelope.envelopeSpeed;
				v.envelopeSpeed = envelope.envelopeSpeed;
				v.envelopeSustain = 0;
				v.vibratoFlag = 0x40;
				v.vibratoSpeed = envelope.vibratoSpeed;
				v.vibratoDepth = envelope.vibratoDepth;
				v.vibratoDelta = envelope.vibratoDepth;
				v.vibratoDelay = envelope.vibratoDelay;
				v.envelopeTable = envelope.table;
				v.envelopePosition = 0;
				v.originalEnvelopeNumber = envelopeNumber;
				v.currentEnvelopeNumber = envelopeNumber;
				let frequencyNumber = envelope.frequencyNumber;
				if (frequencyNumber !== 0x80) {
					if ((v.currentInfo & 0x40) !== 0)
						frequencyNumber = v.previousInfo;
					v.frequencyTable = m.frequencies[frequencyNumber] ?? DefaultCommandTable;
					v.frequencyPosition = 0;
					v.originalFrequencyNumber = frequencyNumber;
					v.currentFrequencyNumber = frequencyNumber;
					v.tick = 0;
				}
			}
			return;
		}
	}

	#sample(index) {
		return this.module.samples[index] ?? null;
	}

	#playSample(channel, sample, start = 0, length = sample.length) {
		channel.playSample(sample.data, start, length);
		if (sample.loopLength > 2)
			channel.setLoop(sample.loopStart, sample.loopLength);
	}

	#parseEffects(v, channel) {
		const m = this.module;
		const fx = this.effectsEnabled;
		let bigLoop;
		let guard = 0;
		do {
			bigLoop = false;
			if (v.tick !== 0) {
				v.tick--;
				break;
			}
			let more;
			do {
				more = false;
				if (++guard > 64)
					return;
				if (v.frequencyPosition >= v.frequencyTable.length) {
					v.currentFrequencyNumber++;
					v.frequencyTable = m.frequencies[v.currentFrequencyNumber] ?? DefaultCommandTable;
					v.frequencyPosition = 0;
				}
				const table = () => v.frequencyTable;
				let val = table()[v.frequencyPosition];
				if (val === 0xe1)
					break;
				if (val === 0xe0) {
					v.frequencyPosition = table()[v.frequencyPosition + 1] & 0x3f;
					v.frequencyTable = m.frequencies[v.originalFrequencyNumber] ?? DefaultCommandTable;
					v.currentFrequencyNumber = v.originalFrequencyNumber;
					val = table()[v.frequencyPosition];
				}
				const arg = k => table()[v.frequencyPosition + k] ?? 0;
				switch (val) {
					case 0xe2: { // play sample
						if (fx[2]) {
							v.volumeVariationDepth = 0;
							v.sample = 0xff;
							const sample = this.#sample(arg(1));
							if (sample)
								this.#playSample(channel, sample);
							v.envelopePosition = 0;
							v.envelopeCounter = 1;
							v.slide = false;
							v.frequencyPosition += 2;
							more = true;
						}
						break;
					}
					case 0xe3: { // vibrato
						if (fx[3]) {
							v.vibratoSpeed = arg(1);
							v.vibratoDepth = arg(2);
							v.frequencyPosition += 3;
							more = true;
						}
						break;
					}
					case 0xe4: { // set sample (after the current one)
						if (fx[4]) {
							const sample = this.#sample(arg(1));
							if (sample) {
								channel.setSample(sample.data, 0, sample.length);
								if (sample.loopLength > 2)
									channel.setLoop(sample.loopStart, sample.loopLength);
							}
							v.slide = false;
							v.frequencyPosition += 2;
							more = true;
						}
						break;
					}
					case 0xe5: { // sample slide
						const sampleNumber = arg(1);
						const sample = this.#sample(sampleNumber);
						if (fx[5] === 2 && sample) {
							channel.mute();
							v.volumeVariationDepth = 0;
							v.slideSample = sampleNumber;
							v.slideEndPosition = sample.length;
							let loopPosition = (arg(2) << 8) | arg(3);
							if (loopPosition === 0xffff)
								loopPosition = sample.length >> 1;
							v.slideLoopPosition = loopPosition;
							v.slideLength = (arg(4) << 8) | arg(5);
							v.slideDelta = ((arg(6) << 8) | arg(7)) << 16 >> 16;
							v.slideSpeed = arg(8);
							v.slideCounter = 0;
							v.slideActive = false;
							v.slideDone = false;
							v.slide = true;
							v.frequencyPosition += 9;
							more = true;
						} else {
							v.frequencyPosition += 9;
						}
						v.envelopePosition = 0;
						v.envelopeCounter = 1;
						break;
					}
					case 0xe6: { // slide parameters
						if (fx[6]) {
							v.slideLength = (arg(1) << 8) | arg(2);
							v.slideDelta = ((arg(3) << 8) | arg(4)) << 16 >> 16;
							v.slideSpeed = arg(5);
							v.slideCounter = 0;
							v.slideActive = false;
							v.slideDone = false;
							v.frequencyPosition += 6;
							more = true;
						}
						break;
					}
					case 0xe7: { // set sample if changed
						const sampleNumber = arg(1);
						if (v.sample !== sampleNumber) {
							v.sample = sampleNumber;
							const sample = this.#sample(sampleNumber);
							if (sample)
								this.#playSample(channel, sample);
						}
						v.envelopePosition = 0;
						v.envelopeCounter = 1;
						v.slide = false;
						v.frequencyPosition += 2;
						more = true;
						break;
					}
					case 0xe8: { // delay
						if (fx[8]) {
							v.tick = arg(1);
							v.frequencyPosition += 2;
							bigLoop = true;
						}
						break;
					}
					case 0xe9: { // sub sample (SSMP)
						if (fx[9]) {
							v.volumeVariationDepth = 0;
							v.sample = 0xff;
							const sample = this.#sample(arg(1));
							if (sample && sample.data.length > 8) {
								const d = sample.data;
								const b = k => d[k] & 0xff;
								const numberOfSubSamples = (d[4] << 8) | b(5);
								const val2 = (d[6] << 8) | b(7);
								const subSampleStartOffset = 8 + numberOfSubSamples * 24 + val2 * 4;
								const hi = 8 + arg(2) * 24;
								let start = ((b(hi) << 24) | (b(hi + 1) << 16) | (b(hi + 2) << 8) | b(hi + 3)) & -2;
								let end = ((b(hi + 4) << 24) | (b(hi + 5) << 16) | (b(hi + 6) << 8) | b(hi + 7)) & -2;
								const sampleStart = subSampleStartOffset + start;
								if (sampleStart + 1 < d.length) {
									d[sampleStart + 1] = d[sampleStart];
									let length = end - start;
									if (sampleStart + length >= d.length)
										length = d.length - sampleStart;
									channel.playSample(d, sampleStart, Math.max(0, length));
								}
								v.envelopePosition = 0;
								v.envelopeCounter = 1;
								v.slide = false;
							}
							v.frequencyPosition += 3;
							more = true;
						}
						break;
					}
					case 0xea: { // volume variation
						if (fx[10]) {
							v.volumeVariationDepth = arg(1);
							v.volumeVariation = 0;
							v.frequencyPosition += 2;
							more = true;
						}
						break;
					}
				}
				if (!more && !bigLoop)
					v.transpose = table()[v.frequencyPosition++] ?? 0;
			} while (more);
		} while (bigLoop);
	}

	#runEffects(v, channel) {
		const m = this.module;
		// Sample slide
		if (v.slide && !v.slideDone) {
			v.slideCounter--;
			if (v.slideCounter < 0) {
				v.slideCounter = sbyte(v.slideSpeed);
				if (v.slideActive) {
					let slideValue = v.slideLoopPosition + v.slideDelta;
					if (slideValue < 0 || slideValue * 2 + v.slideLength * 2 > v.slideEndPosition) {
						v.slideDone = true;
						slideValue = v.slideLoopPosition;
					}
					v.slideLoopPosition = slideValue & 0xffff;
				} else {
					v.slideActive = true;
				}
				const sample = m.samples[v.slideSample];
				if (sample) {
					const start = v.slideLoopPosition * 2;
					let length = Math.min(v.slideLength * 2, sample.length - start);
					if (length === 0)
						length = sample.length - start;
					if (length > 0) {
						channel.setSample(sample.data, start, length);
						channel.setLoop(start, length);
					}
				}
			}
		}

		// Volume envelope
		let bigLoop;
		let guard = 0;
		do {
			bigLoop = false;
			if (v.envelopeSustain !== 0) {
				v.envelopeSustain--;
				break;
			}
			v.envelopeCounter = (v.envelopeCounter - 1) & 0xff;
			if (v.envelopeCounter !== 0)
				break;
			v.envelopeCounter = v.envelopeSpeed;
			let more;
			do {
				more = false;
				if (++guard > 64)
					return;
				if (v.envelopePosition >= v.envelopeTable.length) {
					// Continue into the next envelope (including its parameter bytes)
					const next = m.envelopes[++v.currentEnvelopeNumber];
					if (!next) {
						v.envelopeTable = DefaultCommandTable.subarray(7);
						v.envelopePosition = 0;
					} else {
						const table = new Uint8Array(5 + next.table.length);
						table.set([next.envelopeSpeed, next.frequencyNumber, next.vibratoSpeed, next.vibratoDepth, next.vibratoDelay]);
						table.set(next.table, 5);
						v.envelopeTable = table;
						v.envelopePosition = 0;
					}
				}
				const val = v.envelopeTable[v.envelopePosition];
				if (val === 0xe0) {
					v.envelopePosition = Math.max(0, (v.envelopeTable[v.envelopePosition + 1] & 0x3f) - 5);
					v.envelopeTable = m.envelopes[v.originalEnvelopeNumber]?.table ?? DefaultCommandTable;
					v.currentEnvelopeNumber = v.originalEnvelopeNumber;
					more = true;
				} else if (val === 0xe1) {
					// hold
				} else if (val === 0xe8) {
					v.envelopeSustain = v.envelopeTable[v.envelopePosition + 1] ?? 0;
					v.envelopePosition += 2;
					bigLoop = true;
				} else {
					v.volume = val;
					v.envelopePosition++;
				}
			} while (more);
		} while (bigLoop);

		let note = v.transpose;
		if (note < 128)
			note = (note + v.currentNote + v.trackTranspose) & 0xff;
		note &= 0x7f;
		let period = Periods[Math.min(note, Periods.length - 1)];

		// Vibrato (version 3)
		if (v.vibratoDelay === 0) {
			let flag = v.vibratoFlag;
			let delta = v.vibratoDelta;
			if ((flag & 0x20) === 0) {
				delta -= v.vibratoSpeed;
				if (delta < 0) {
					flag |= 0x20;
					delta = 0;
				}
			} else {
				delta += v.vibratoSpeed;
				if (delta > v.vibratoDepth) {
					flag &= ~0x20;
					delta = v.vibratoDepth;
				}
			}
			v.vibratoDelta = delta & 0xff;
			v.vibratoFlag = flag;
			period = (period + (((v.vibratoDelta - (v.vibratoDepth >> 1)) * period) >> 10)) & 0xffff;
		} else {
			v.vibratoDelay--;
		}

		// Portamento (version 2)
		if ((v.currentInfo & 0x20) !== 0) {
			const val = sbyte(v.previousInfo);
			if (val >= 0) {
				v.portaDelta = (v.portaDelta + val) >>> 0;
				period = (period - ((Math.imul(v.portaDelta, period) >> 10) & 0xffff)) & 0xffff;
			} else {
				v.portaDelta = (v.portaDelta - val) >>> 0;
				period = (period + ((Math.imul(v.portaDelta, period) >> 10) & 0xffff)) & 0xffff;
			}
		}

		channel.setPeriod(period);

		// Volume with fading and random variation
		let fade = v.volumeFade;
		if (v.volumeVariationDepth !== 0) {
			if (v.volumeVariation === 0) {
				const depth = v.volumeVariationDepth;
				v.volumeVariationDepth = 0;
				v.volumeVariation = Math.floor(depth * (this.#random() & 0xff) / 255) & 0xff;
			}
			fade = (fade - v.volumeVariation) & 0xff;
		}
		if (fade > 127)
			fade = 0;
		channel.setVolume(Math.floor(fade * v.volume / 100));
	}

	#random() {
		const val = (this.random + 0x4793) & 0xffff;
		const rotated = ((val >> 6) | (val << 10)) & 0xffff;
		this.random = (rotated ^ val) & 0xffff;
		return this.random;
	}
}
