// Port of SonicArranger/TrackState.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

import {
	ArgumentNullException, ArgumentOutOfRangeException, IndexOutOfRangeException, NotSupportedException, toSByte
} from '../../runtime.js';
import { Note } from './Note.js';
import { Instrument } from './Instrument.js';
import { Tables } from './Tables.js';

/** Array access which throws like .NET on an invalid index (instead of returning undefined). */
function at(array, index) {
	if (index < 0 || index >= array.length)
		throw new IndexOutOfRangeException('Index was outside the bounds of the array.');
	return array[index];
}

/** new Random(DateTime.Now.Millisecond).Next(min, max) */
const randomNext = (min, max) => min + Math.floor(Math.random() * (max - min));

class PlayState {
	constructor() {
		this.Instrument = null;
		this.EffectDelayCounter = 0;
		this.AmfDelayCounter = 0;
		this.AdsrDelayCounter = 0;
		this.SustainCounter = 0;
		this.AdsrIndex = 0;
		/** A4+0xa4 */
		this.AmfIndex = 0;
		/**
		 * This is used if the ADSR repeat portion is
		 * 0 and the full ADSR wave was processed.
		 *
		 * It is also used for sampled instruments
		 * if the specified sample is not present.
		 *
		 * A4+0xb4 bit 0
		 */
		this.InstrumentFinished = false;
		/**
		 * This is used for effects that can theoretically be
		 * applied repeated but has a repeat portion of 0.
		 *
		 * A4+0xb4 bit 2
		 */
		this.EffectFinished = false;
		this.NoteOff = false;
		this.NoteVolume = 0;
		/** A4+0xb2 */
		this.FadeOutVolume = 0;
		this.VibratoDelayCounter = 0;
		this.VibratoIndex = 0;
		this.VibratoSpeed = 0;
		this.VibratoLevel = 0;
		/** A4+0x84 */
		this.Finetuning = 0;
		/** A4+0x86 */
		this.PeriodReductionPerTick = 0;
		/** A4+0x90 */
		this.VolumeChangePerTick = 0;
		/** A4+0xaa */
		this.CurrentEffectRuns = 0;
		this.CurrentEffectIndex = 0;
		this.LastNoteIndex = 0;
		this.CurrentNoteIndex = 0;
		this.DivisionTick = 0;
		this.CurrentNote = null;
		/** A4+0xae */
		this.CurrentArpeggioIndex = 0;
		/** A4+0xb0 */
		this.CurrentArpeggioCommandIteration = 0;
		/** A4+0x9a */
		this.CurrentNotePortamentoPeriod = 0;
		/** A4+0x9c */
		this.LastNotePortamentoPeriod = 0;
	}
}

export class TrackState {
	constructor(index, paulaState, sonicArrangerFile) {
		this.playState = new PlayState();

		if (index < 0 || index > 3)
			throw new ArgumentOutOfRangeException('index');

		if (paulaState == null)
			throw new ArgumentNullException('paulaState');
		this.paulaState = paulaState;
		this.trackIndex = index;
		this.state = paulaState.Tracks[index];
		this.sonicArrangerFile = sonicArrangerFile;

		paulaState.AttachTrackFinishHandler(index, (trackIndex, currentPlayTime) => this.TrackFinished(trackIndex, currentPlayTime));
	}

	/**
	 * C#: ProcessNoteCommand(NoteCommand command, byte param, ref int songSpeed,
	 *     int currentPatternIndex, out int? noteChangeIndex, out int? patternChangeIndex)
	 * @returns {[number, number|null, number|null]} [songSpeed, noteChangeIndex, patternChangeIndex]
	 */
	ProcessNoteCommand(command, param, songSpeed, currentPatternIndex) {
		const playState = this.playState;
		const paulaState = this.paulaState;
		playState.PeriodReductionPerTick = 0;
		playState.VolumeChangePerTick = 0;

		let noteChangeIndex = null;
		let patternChangeIndex = null;

		switch (command) {
			case Note.NoteCommand.Arpeggio:
			case Note.NoteCommand.Unused:
				break;
			case Note.NoteCommand.SlideUp: // smoothly reduce note period, increases pitch
				playState.PeriodReductionPerTick = toSByte(param);
				break;
			case Note.NoteCommand.SetADSRIndex: {
				let maxIndex = 0;
				if (playState.Instrument != null) {
					const instr = playState.Instrument;
					maxIndex = Math.max(0, instr.AdsrLength + instr.AdsrRepeat - 1);
				}
				playState.AdsrIndex = Math.min(param, maxIndex);
				break;
			}
			case Note.NoteCommand.ResetVibrato:
				playState.VibratoDelayCounter = 0;
				break;
			case Note.NoteCommand.SetVibrato:
				playState.VibratoSpeed = 2 * (param >> 4);
				playState.VibratoLevel = toSByte(160 - (param & 0xf) * 16);
				break;
			case Note.NoteCommand.SetMasterVolume: // in contrast to SetVolume this will affect all channels
				paulaState.MasterVolume = Math.min(64, param);
				break;
			case Note.NoteCommand.SetPortamento:
				playState.CurrentNotePortamentoPeriod = param;
				break;
			case Note.NoteCommand.ClearPortamento:
				playState.CurrentNotePortamentoPeriod = 0;
				break;
			case Note.NoteCommand.SetPatternLength:
				// TODO
				break;
			case Note.NoteCommand.VolumeSlide:
				if ((param & 0xf0) !== 0)
					playState.VolumeChangePerTick = param >> 4;
				else
					playState.VolumeChangePerTick = -(param & 0xf);
				break;
			case Note.NoteCommand.PositionJump: // stop after the current note and then continue with given pattern
				// Note: In contrast to ProTracker the division is reset to 0.
				noteChangeIndex = 0;
				patternChangeIndex = Math.max(0, (param - 1) & 0x7f);
				break;
			case Note.NoteCommand.SetVolume:
				playState.NoteVolume = Math.min(64, param);
				playState.FadeOutVolume = ((paulaState.MasterVolume * playState.NoteVolume) >> 6) * 4;
				break;
			case Note.NoteCommand.PatternBreak: // continue with next pattern after current note
				noteChangeIndex = 0;
				patternChangeIndex = currentPatternIndex + 1;
				break;
			case Note.NoteCommand.DisableHardwareLPF: // Disable LED (and therefore the LPF)
				paulaState.UseLowPassFilter = param === 0;
				break;
			case Note.NoteCommand.SetSpeed:
				songSpeed = Math.max(1, Math.min(param, 16));
				break;
			default:
				throw new ArgumentOutOfRangeException('Invalid note command.');
		}

		return [songSpeed, noteChangeIndex, patternChangeIndex];
	}

	InitState(instrumentIndex) {
		const playState = this.playState;

		if (instrumentIndex <= 0)
			throw new ArgumentOutOfRangeException('Expected instrument index to be > 0.');

		const instrument = at(this.sonicArrangerFile.Instruments, instrumentIndex - 1);
		playState.Instrument = instrument;

		this.ResetEffectState();

		playState.NoteOff = false;
		playState.NoteVolume = instrument.Volume;
		playState.VibratoDelayCounter = instrument.VibDelay;
		playState.VibratoIndex = 0;
		playState.VibratoLevel = instrument.VibLevel;
		playState.VibratoSpeed = instrument.VibSpeed;
		playState.PeriodReductionPerTick = 0;
		playState.VolumeChangePerTick = 0;
		playState.CurrentArpeggioIndex = 0;
		playState.CurrentNotePortamentoPeriod = instrument.Portamento;
		playState.LastNotePortamentoPeriod = 0;
	}

	ResetEffectState() {
		const playState = this.playState;
		const instrument = playState.Instrument;
		playState.Finetuning = instrument?.FineTuning ?? 0;
		playState.EffectDelayCounter = instrument?.EffectDelay ?? 1;
		playState.AmfDelayCounter = instrument?.AmfDelay ?? 1;
		playState.AdsrDelayCounter = instrument?.AdsrDelay ?? 1;
		playState.SustainCounter = instrument?.SustainVal ?? 1;
		playState.CurrentEffectIndex = instrument?.Effect2 ?? 0;
		playState.CurrentEffectRuns = 0;
		playState.AdsrIndex = 0;
		playState.AmfIndex = 0;
		playState.InstrumentFinished = false;
		playState.EffectFinished = false;
		playState.FadeOutVolume = ((playState.NoteVolume * this.paulaState.MasterVolume) >> 6) * 4;
	}

	Mute() {
		const playState = this.playState;
		playState.NoteOff = true;
		playState.InstrumentFinished = true;
		playState.EffectFinished = true;
		playState.NoteVolume = 0;
		playState.FadeOutVolume = 0;
		this.paulaState.StopTrack(this.trackIndex);
	}

	/**
	 * This should be called whenever a new note or instrument is played.
	 */
	Play(note, noteTranspose, soundTranspose, currentPlayTime) {
		const playState = this.playState;
		const state = this.state;
		const sonicArrangerFile = this.sonicArrangerFile;
		let noteId = note.Value;
		let noteInstrument = note.Instrument;
		playState.CurrentNote = note;
		playState.DivisionTick = 0;

		if (noteId === 0) {
			if (noteInstrument !== 0) {
				this.InitState(noteInstrument);
			}
		} else {
			if (noteId !== 0x80) {
				if (noteId === 0x7f) {
					this.Mute();
				} else {
					if (!note.DisableNoteTranspose)
						noteId += noteTranspose;
					if (noteId > 9 * 12)
						throw new ArgumentOutOfRangeException('noteId');
					if (noteInstrument !== 0 && !note.DisableSoundTranspose)
						noteInstrument += soundTranspose;
					playState.LastNoteIndex = playState.CurrentNoteIndex;
					playState.CurrentNoteIndex = noteId;
					if (playState.LastNoteIndex === 0)
						playState.LastNoteIndex = noteId;
					if (noteInstrument <= 0) {
						if (playState.Instrument == null) {
							this.Mute();
							return;
						}
						this.ResetEffectState();
					} else {
						this.InitState(noteInstrument);
					}
					const instrument = playState.Instrument;
					if (instrument.SynthMode) {
						if (instrument.SampleWaveNo >= sonicArrangerFile.Waves.length ||
							sonicArrangerFile.Waves[instrument.SampleWaveNo].Data == null ||
							sonicArrangerFile.Waves[instrument.SampleWaveNo].Data.length === 0) {
							playState.InstrumentFinished = true;
							this.Mute();
							return;
						}
						const data = sonicArrangerFile.Waves[instrument.SampleWaveNo].Data;
						state.Data = data.slice();
					} else {
						if (instrument.SampleWaveNo >= sonicArrangerFile.Samples.length ||
							sonicArrangerFile.Samples[instrument.SampleWaveNo].Data == null ||
							sonicArrangerFile.Samples[instrument.SampleWaveNo].Data.length === 0) {
							playState.InstrumentFinished = true;
							this.Mute();
							return;
						}
						const data = sonicArrangerFile.Samples[instrument.SampleWaveNo].Data;
						state.Data = data.slice();
					}
					let length = instrument.Length * 2;
					if (!instrument.SynthMode && instrument.Repeat > 1)
						length += instrument.Repeat * 2;
					if (length > state.Data.length)
						throw new ArgumentOutOfRangeException('Length + repeat is greater than the sample/wave data size.');
					else if (length < state.Data.length)
						state.Data = state.Data.slice(0, Math.max(0, length));
					state.DataIndex = 0;
					state.Period = at(Tables.NotePeriodTable, playState.CurrentNoteIndex);
					state.Volume = (playState.NoteVolume * this.paulaState.MasterVolume) >> 6;
					this.paulaState.StartTrackData(this.trackIndex, currentPlayTime);
				}
			}
		}
	}

	TrackFinished(trackIndex, currentPlayTime) {
		if (this.trackIndex !== trackIndex)
			return;

		const playState = this.playState;

		if (playState.Instrument == null || playState.Instrument.Repeat === 1) {
			// Repeat=1 is a "no loop" marker.
			this.paulaState.StopTrack(trackIndex);
		} else if (playState.Instrument.Repeat > 0) {
			this.state.DataIndex = playState.Instrument.Length * 2;
			this.paulaState.StartTrackData(trackIndex, currentPlayTime);
		}

		// Note: instrument.Template.Repeat == 0 does nothing so the data is just looped.
	}

	/**
	 * In original this is an interrupt called
	 * every 20ms by default. Use Song.NBIrqps
	 * to get a value how often this is called per second.
	 */
	Tick(speed) {
		const playState = this.playState;
		const paulaState = this.paulaState;
		const sonicArrangerFile = this.sonicArrangerFile;

		if (playState == null)
			return;

		playState.DivisionTick = (playState.DivisionTick + 1) % speed;

		// Note fade out
		if (playState.CurrentNote == null || playState.NoteOff || playState.InstrumentFinished || playState.Instrument == null) {
			if (playState.FadeOutVolume > 0) {
				playState.FadeOutVolume -= 4;
			}
			return;
		}

		const note = playState.CurrentNote;
		const instrument = playState.Instrument;
		let noteId = playState.CurrentNoteIndex;
		let lastNoteId = playState.LastNoteIndex;

		if (note.ArpeggioIndex === 0) {
			if (note.Command === 0 && // This is also used to influence arpeggio play if the param is != 0
				note.CommandInfo !== 0) {
				// In this case a sequence of "normal note", "note + x semitones", "note + y semitones"
				// is played. This is also documented for ProTracker.
				if (playState.CurrentArpeggioCommandIteration === 0) {
					// Normal note. Just increase the iteration.
					++playState.CurrentArpeggioCommandIteration;
				} else {
					// Here the notes are adjusted.
					if (playState.CurrentArpeggioCommandIteration === 1) {
						noteId += (note.CommandInfo >> 4);
						++playState.CurrentArpeggioCommandIteration;
					} else { // 2
						noteId += note.CommandInfo & 0xf;
						playState.CurrentArpeggioCommandIteration = 0;
					}
				}
			}
		} else {
			// Arpeggio
			const arpeggio = instrument.ArpegData[note.ArpeggioIndex - 1];
			const arpeggioTotalLength = Math.min(14, arpeggio.Length + arpeggio.Repeat);
			let index = playState.CurrentArpeggioIndex;
			const noteOffset = index >= arpeggio.Data.length ? 0 : arpeggio.Data[index];
			noteId += noteOffset;
			lastNoteId += noteOffset;
			if (++index >= arpeggioTotalLength)
				index = arpeggio.Length;
			playState.CurrentArpeggioIndex = index;
		}

		let period = at(Tables.NotePeriodTable, noteId);

		// Portamento
		if (playState.CurrentNotePortamentoPeriod !== 0) {
			if (playState.LastNotePortamentoPeriod === 0)
				playState.LastNotePortamentoPeriod = at(Tables.NotePeriodTable, lastNoteId);
			const diff = Math.abs(period - playState.LastNotePortamentoPeriod);
			if (playState.CurrentNotePortamentoPeriod > diff)
				playState.CurrentNotePortamentoPeriod = 0;
			else {
				const add = playState.LastNotePortamentoPeriod < period
					? playState.CurrentNotePortamentoPeriod
					: -playState.CurrentNotePortamentoPeriod;
				playState.LastNotePortamentoPeriod += add;
				period = playState.LastNotePortamentoPeriod;
			}
		}

		// Vibrato effect
		if (playState.VibratoDelayCounter !== -1) {
			if (playState.VibratoDelayCounter === 0) {
				playState.VibratoDelayCounter = instrument.VibDelay;

				if (playState.VibratoLevel !== 0) {
					period += Math.trunc(toSByte(Tables.VibratoTable[playState.VibratoIndex]) * 4 / playState.VibratoLevel);
				}

				playState.VibratoIndex = (playState.VibratoIndex + playState.VibratoSpeed) & 0xff;
			} else {
				--playState.VibratoDelayCounter;
			}
		}

		// AMF (pitch amplifier)
		const amfTotalLength = Math.min(128, instrument.AmfLength + instrument.AmfRepeat);
		if (amfTotalLength !== 0 && instrument.AmfWave < sonicArrangerFile.AmfWaves.length) {
			const amfData = at(sonicArrangerFile.AmfWaves[instrument.AmfWave].Data, playState.AmfIndex);
			period -= toSByte(amfData);

			if (--playState.AmfDelayCounter === 0) {
				playState.AmfDelayCounter = instrument.AmfDelay;
				++playState.AmfIndex;

				if (playState.AmfIndex >= amfTotalLength) {
					if (instrument.AmfRepeat === 0)
						playState.AmfIndex = instrument.AmfLength - 1;
					else
						playState.AmfIndex = instrument.AmfLength;
				}
			}
		}

		period -= playState.Finetuning;
		if (playState.DivisionTick !== 0)
			playState.Finetuning += playState.PeriodReductionPerTick;

		// Instrument effects
		if (instrument.SynthMode && !playState.EffectFinished) {
			// Note: Changes to pitch/period through effects is only
			// applied in next tick so only playState.Finetuning will
			// be changed and used above in the next tick.
			this.ApplyInstrumentEffects();
		}

		let volume = playState.NoteVolume;

		// ADSR envelop
		const adsrTotalLength = Math.min(128, instrument.AdsrLength + instrument.AdsrRepeat);
		if (adsrTotalLength !== 0 && instrument.AdsrWave < sonicArrangerFile.AdsrWaves.length) {
			const adsrData = at(sonicArrangerFile.AdsrWaves[instrument.AdsrWave].Data, playState.AdsrIndex);
			const adsrVolume = (adsrData * paulaState.MasterVolume) >> 6;
			volume = Math.max(0, Math.min(64, (volume * adsrVolume) >> 6));
			playState.FadeOutVolume = volume * 4;

			const ProcessAdsrTick = () => {
				if (--playState.AdsrDelayCounter === 0) {
					playState.AdsrDelayCounter = instrument.AdsrDelay;
					++playState.AdsrIndex;

					if (playState.AdsrIndex >= adsrTotalLength) {
						if (instrument.AdsrRepeat === 0)
							playState.AdsrIndex = instrument.AdsrLength - 1;
						else
							playState.AdsrIndex = instrument.AdsrLength;

						if (instrument.AdsrRepeat === 0 && adsrData === 0)
							playState.InstrumentFinished = true;
					}
				}
			};

			if (noteId === 0x80 && playState.AdsrIndex >= instrument.SustainPt) {
				// Sustain mode
				if (instrument.SustainVal !== 0) { // If 0, keep adsr index until noteId is no longer 0x80
					if (playState.SustainCounter !== 0)
						--playState.SustainCounter;
					else {
						playState.SustainCounter = instrument.SustainVal;
						ProcessAdsrTick();
					}
				}
			} else {
				ProcessAdsrTick();
			}
		} else {
			// Normal volume without envelop
			volume = Math.max(0, Math.min(64, (volume * paulaState.MasterVolume) >> 6));

			if (playState.FadeOutVolume > 0) {
				playState.FadeOutVolume -= 4;
			}
		}

		playState.NoteVolume -= playState.VolumeChangePerTick;

		// Safety checks
		if (period < 1)
			period = 1;
		if (playState.NoteVolume < 0)
			playState.NoteVolume = 0;
		if (playState.NoteVolume > 64)
			playState.NoteVolume = 64;

		// Update Paula track state
		this.state.Period = period;
		this.state.Volume = volume;
	}

	ApplyInstrumentEffects() {
		const playState = this.playState;
		const sonicArrangerFile = this.sonicArrangerFile;
		const instr = playState.Instrument;
		const currentSample = this.paulaState.CurrentSamples[this.trackIndex];

		if (--playState.EffectDelayCounter === 0) {
			playState.EffectDelayCounter = Math.max(1, instr.EffectDelay);

			const ProcessShackWave = () => {
				const effectWave = instr.Effect1;
				const startPos = instr.Effect2;
				const stopPos = instr.Effect3;
				const waveData = at(sonicArrangerFile.Waves, effectWave).Data;
				const offset = playState.CurrentEffectIndex;

				for (let i = startPos; i <= stopPos; ++i) {
					const waveIndex = offset + i;
					const wave = waveIndex >= currentSample.Length || waveIndex >= waveData.length ? 0 : waveData[waveIndex];
					currentSample.set(i, toSByte(currentSample.get(i) + wave));
				}
			};

			switch (instr.EffectNumber) {
				case Instrument.Effect.NoEffect:
					return;
				case Instrument.Effect.WaveNegator: {
					if (currentSample.get(playState.CurrentEffectIndex) === -128)
						currentSample.set(playState.CurrentEffectIndex, 127);
					else
						currentSample.set(playState.CurrentEffectIndex, toSByte(-currentSample.get(playState.CurrentEffectIndex)));
					break;
				}
				case Instrument.Effect.FreeNegator: {
					if (playState.InstrumentFinished || playState.EffectFinished || currentSample.CopyTarget == null)
						return;
					const effectWave = instr.Effect1;
					const waveLen = instr.Effect2;
					const waveRep = instr.Effect3;
					const offset = at(at(sonicArrangerFile.Waves, effectWave).Data, playState.CurrentEffectRuns) & 0x7f;
					const length = Math.min(currentSample.Length, instr.Length * 2);
					// Array.Copy(source, offset, CopyTarget, offset, length - offset)
					const source = at(sonicArrangerFile.Waves, instr.SampleWaveNo).Data;
					const copyLength = length - offset;
					if (copyLength < 0 || offset + copyLength > source.length || offset + copyLength > currentSample.CopyTarget.length)
						throw new ArgumentOutOfRangeException('length');
					currentSample.CopyTarget.set(source.subarray(offset, offset + copyLength), offset);
					for (let i = 0; i < offset; ++i) {
						const input = toSByte(source[i]);
						if (input === -128)
							currentSample.set(i, 127);
						else
							currentSample.set(i, toSByte(-input));
					}
					if (++playState.CurrentEffectRuns < waveLen + waveRep)
						return;
					playState.CurrentEffectRuns = waveLen;
					if (waveRep !== 0)
						return;
					if (offset !== 0) {
						--playState.CurrentEffectRuns;
						return;
					}
					playState.EffectFinished = true;
					break;
				}
				case Instrument.Effect.RotateVertical: {
					const deltaVal = toSByte(instr.Effect1);
					const startPos = instr.Effect2;
					const stopPos = instr.Effect3;
					for (let i = startPos; i <= stopPos; ++i) {
						currentSample.set(i, toSByte(currentSample.get(i) + deltaVal));
					}
					break;
				}
				case Instrument.Effect.RotateHorizontal: {
					const startPos = instr.Effect2;
					const stopPos = instr.Effect3;
					const first = currentSample.get(startPos);
					for (let i = startPos; i < stopPos; ++i) {
						currentSample.set(i, currentSample.get(i + 1));
					}
					currentSample.set(stopPos, first);
					break;
				}
				case Instrument.Effect.AlienVoice: {
					// This just adds two waves together
					const effectWave = instr.Effect1;
					const startPos = instr.Effect2;
					const stopPos = instr.Effect3;
					const data = effectWave >= sonicArrangerFile.Waves.length ? null : sonicArrangerFile.Waves[effectWave].Data;
					for (let i = startPos; i <= stopPos; ++i) {
						currentSample.set(i, toSByte(currentSample.get(i) + (data == null ? 0 : at(data, i))));
					}
					break;
				}
				case Instrument.Effect.PolyNegator: {
					const startPos = instr.Effect2;
					const stopPos = instr.Effect3;
					let index = playState.CurrentEffectIndex;
					currentSample.set(index, toSByte(at(at(sonicArrangerFile.Waves, instr.SampleWaveNo).Data, index)));
					index = index >= stopPos ? startPos : index + 1;
					currentSample.set(index, toSByte(-currentSample.get(index)));
					break;
				}
				case Instrument.Effect.ShackWave1:
					ProcessShackWave();
					break;
				case Instrument.Effect.ShackWave2: {
					ProcessShackWave();
					const startPos = instr.Effect2;
					const stopPos = instr.Effect3;
					const index = startPos + playState.CurrentEffectRuns;
					if (currentSample.get(index) === -128)
						currentSample.set(index, 127);
					else
						currentSample.set(index, toSByte(-currentSample.get(index)));
					if (++playState.CurrentEffectRuns === stopPos - startPos)
						playState.CurrentEffectRuns = 0;
					break;
				}
				case Instrument.Effect.Metawdrpk:
					// TODO
					break;
				case Instrument.Effect.LaserAmf: {
					const detune = instr.Effect2;
					const repeats = instr.Effect3;
					if (playState.CurrentEffectRuns < repeats) {
						playState.Finetuning += detune;
						++playState.CurrentEffectRuns;
					}
					break;
				}
				case Instrument.Effect.WaveAlias: {
					const deltaVal = instr.Effect1;
					const startPos = instr.Effect2;
					const stopPos = instr.Effect3;

					for (let i = startPos; i <= stopPos; ++i) {
						const next = i === stopPos ? currentSample.get(startPos) : currentSample.get(i + 1);

						if (currentSample.get(i) <= next)
							currentSample.set(i, toSByte(currentSample.get(i) + deltaVal));
						else
							currentSample.set(i, toSByte(currentSample.get(i) - deltaVal));
					}
					break;
				}
				case Instrument.Effect.NoiseGenerator: {
					// Note: Original uses the lower byte of VHPOSR
					// which is the horizontal screen position of the beam
					// and then uses: currentSample = hBeamPos ^ currentSample
					currentSample.set(playState.CurrentEffectIndex, toSByte(randomNext(-128, 128)));
					break;
				}
				case Instrument.Effect.LowPassFilter1: {
					const deltaVal = instr.Effect1;
					const startPos = instr.Effect2;
					const stopPos = instr.Effect3;
					for (let i = startPos; i <= stopPos; ++i) {
						const next = i === stopPos ? currentSample.get(startPos) : currentSample.get(i + 1);
						const diff = Math.abs(currentSample.get(i) - next);

						if (deltaVal < diff) {
							if (next >= currentSample.get(i))
								currentSample.set(i, toSByte(Math.min(127, currentSample.get(i) + 2)));
							else
								currentSample.set(i, toSByte(Math.max(-128, currentSample.get(i) - 2)));
						}
					}
					break;
				}
				case Instrument.Effect.LowPassFilter2: {
					const effectWave = instr.Effect1;
					const startPos = instr.Effect2;
					const stopPos = instr.Effect3;
					const data = effectWave >= sonicArrangerFile.Waves.length ? null : sonicArrangerFile.Waves[effectWave].Data;
					if (data != null) {
						for (let i = startPos; i <= stopPos; ++i) {
							const next = i === stopPos ? currentSample.get(startPos) : currentSample.get(i + 1);
							const diff = Math.abs(currentSample.get(i) - next);

							if (at(data, i) < diff) {
								if (next >= currentSample.get(i))
									currentSample.set(i, toSByte(Math.min(127, currentSample.get(i) + 2)));
								else
									currentSample.set(i, toSByte(Math.max(-128, currentSample.get(i) - 2)));
							}
						}
					}
					break;
				}
				case Instrument.Effect.Oscillator1:
					// TODO: this is quiet a monster to implement :D
					break;
				case Instrument.Effect.NoiseGenerator2: {
					const startPos = instr.Effect2;
					const stopPos = instr.Effect3;
					for (let i = startPos; i <= stopPos; ++i) {
						const value = currentSample.get(i);
						currentSample.set(i, toSByte((value ^ 5) << 2 | (value >> 6) + randomNext(-128, 128)));
					}
					break;
				}
				case Instrument.Effect.FMDrum: {
					const level = instr.Effect1;
					const factor = instr.Effect2;
					const repeats = instr.Effect3;
					if (playState.CurrentEffectRuns > repeats) {
						playState.Finetuning = instr.FineTuning;
						playState.CurrentEffectRuns = 0;
					}
					playState.Finetuning -= level * factor;
					++playState.CurrentEffectRuns;
					break;
				}
				default:
					throw new NotSupportedException(`Unknown instrument effect: 0x${(instr.EffectNumber >>> 0).toString(16).padStart(2, '0')}.`);
			}

			// Note: Those effects which use the index have StartPos and StopPos
			// in Effect2 and Effect3. Other effects are not care anyways.
			if (++playState.CurrentEffectIndex > instr.Effect3)
				playState.CurrentEffectIndex = instr.Effect2;
		}
	}
}
