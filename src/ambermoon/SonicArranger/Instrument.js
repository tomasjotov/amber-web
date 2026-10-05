// Port of SonicArranger/Instrument.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

import { Arpeggiato } from './Arpeggiato.js';
import { BinaryWriterExtensions } from './BinaryWriterExtensions.js';

/** new string(char[]) - ReadChars may return a char array or a string */
const charsToString = chars => (Array.isArray(chars) ? chars.join('') : String(chars ?? ''));
/** Encoding.ASCII.GetBytes */
const asciiBytes = str => Uint8Array.from(str, ch => { const c = ch.charCodeAt(0); return c < 0x80 ? c : 0x3f; });

const Effect = Object.freeze({
	NoEffect: 0,
	/**
	 * Effect1: -
	 * Effect2: StartPnt
	 * Effect3: StopPnt
	 */
	WaveNegator: 1,
	/**
	 * Effect1: EffWave
	 * Effect2: WaveLen
	 * Effect3: WaveRept
	 */
	FreeNegator: 2,
	/**
	 * Effect1: DeltaVal
	 * Effect2: StartPnt
	 * Effect3: StopPnt
	 */
	RotateVertical: 3,
	/**
	 * Effect1: -
	 * Effect2: StartPnt
	 * Effect3: StopPnt
	 */
	RotateHorizontal: 4,
	/**
	 * Effect1: EffWave
	 * Effect2: StartPnt
	 * Effect3: StopPnt
	 */
	AlienVoice: 5,
	/**
	 * Effect1: -
	 * Effect2: StartPnt
	 * Effect3: StopPnt
	 */
	PolyNegator: 6,
	/**
	 * Effect1: EffWave
	 * Effect2: StartPnt
	 * Effect3: StopPnt
	 */
	ShackWave1: 7,
	/**
	 * Effect1: EffWave
	 * Effect2: StartPnt
	 * Effect3: StopPnt
	 */
	ShackWave2: 8,
	/**
	 * Effect1: DestWave
	 * Effect2: StartPnt
	 * Effect3: StopPnt
	 */
	Metawdrpk: 9,
	/**
	 * Effect1: -
	 * Effect2: Detune
	 * Effect3: Repeats
	 */
	LaserAmf: 10,
	/**
	 * Effect1: DeltaVal
	 * Effect2: StartPnt
	 * Effect3: StopPnt
	 */
	WaveAlias: 11,
	/**
	 * Effect1: -
	 * Effect2: StartPnt
	 * Effect3: StopPnt
	 */
	NoiseGenerator: 12,
	/**
	 * Effect1: DeltaVal
	 * Effect2: StartPnt
	 * Effect3: StopPnt
	 */
	LowPassFilter1: 13,
	/**
	 * Effect1: EffWave
	 * Effect2: StartPnt
	 * Effect3: StopPnt
	 */
	LowPassFilter2: 14,
	/**
	 * Effect1: DestWave
	 * Effect2: StartPnt
	 * Effect3: StopPnt
	 */
	Oscillator1: 15,
	/**
	 * Effect1: -
	 * Effect2: StartPnt
	 * Effect3: StopPnt
	 */
	NoiseGenerator2: 16,
	/**
	 * Effect1: Level
	 * Effect2: Factor
	 * Effect3: Repeats
	 */
	FMDrum: 17
});

export class Instrument {
	static Effect = Effect;

	constructor(reader = null) {
		/** Synthetic mode (off/on). */
		this.SynthMode = false;
		/** 0-based sample or wave index (dependent on SynthMode). */
		this.SampleWaveNo = 0;
		/** Length in words (max 64 for synthetic instruments). */
		this.Length = 0;
		/**
		 * Repeat size in words.
		 *
		 * Always 0 for synthetic instruments.
		 *
		 * Note: The total size in bytes for sampled instruments is
		 * Length * 2 + Repeat * 2.
		 *
		 * The special case Repeat=1 seems to be used to disable
		 * repeating and looping. So if it is set, the playback
		 * will stop after the first cycle and then will only
		 * output zeros (no sound).
		 *
		 * If repeat is 0, the whole sound is looped from offset
		 * 0 to Length*2. This is the reason why synth waves always
		 * have this set to 0.
		 */
		this.Repeat = 0;
		/** Unknown 8 bytes */
		this.Unknown8Bytes = null;
		/** Volume level (0 to 64). */
		this.Volume = 0;
		/** 0 to 255. */
		this.FineTuning = 0;
		this.Portamento = 0;
		/**
		 * 255 (or -1) means no vibrato (default).
		 *
		 * Range can thus be 0 to 254.
		 */
		this.VibDelay = 0;
		/** Default value is 18 (0x12). Range is 0 to 255. */
		this.VibSpeed = 0;
		/** Default value is 160 (0xA0). Range is 0 to 255. */
		this.VibLevel = 0;
		/** 0-based AMF wave index. */
		this.AmfWave = 0;
		/** Default value is 1. Range is 1 to 255. */
		this.AmfDelay = 0;
		/**
		 * Size of AMF wave data in bytes.
		 *
		 * Note: The total size is AmfLength + AmfRepeat.
		 */
		this.AmfLength = 0;
		/**
		 * Size of the repeat portion of the AMF wave data in bytes.
		 *
		 * Note: The total size is AmfLength + AmfRepeat.
		 */
		this.AmfRepeat = 0;
		/** 0-based ADSR wave index. */
		this.AdsrWave = 0;
		/** Default value is 1. Range is 1 to 255. */
		this.AdsrDelay = 0;
		/**
		 * Size of ADSR wave data in bytes.
		 *
		 * Note: The total size is AdsrLength + AdsrRepeat.
		 */
		this.AdsrLength = 0;
		/**
		 * Size of the repeat portion of the ADSR wave data in bytes.
		 *
		 * Note: The total size is AdsrLength + AdsrRepeat.
		 */
		this.AdsrRepeat = 0;
		/**
		 * The 0-based index of the ADSR wave data byte
		 * to use as the sustain.
		 */
		this.SustainPt = 0;
		this.SustainVal = 0;
		/** Unknown 16 bytes */
		this.Unknown16Bytes = null;
		this.EffectNumber = Effect.NoEffect;
		this.Effect1 = 0;
		this.Effect2 = 0;
		this.Effect3 = 0;
		this.EffectDelay = 0;
		this.ArpegData = null;
		this.Name = null;

		if (reader == null)
			return;

		this.SynthMode = reader.ReadBEInt16() !== 0;
		this.SampleWaveNo = reader.ReadBEInt16();
		this.Length = reader.ReadBEInt16();
		this.Repeat = reader.ReadBEInt16();
		this.Unknown8Bytes = reader.ReadBytes(8); // TODO
		this.Volume = reader.ReadBEInt16();
		this.FineTuning = reader.ReadBEInt16();
		this.Portamento = reader.ReadBEInt16();
		this.VibDelay = reader.ReadBEInt16();
		if (this.VibDelay >= 255)
			this.VibDelay = -1;
		this.VibSpeed = reader.ReadBEInt16();
		this.VibLevel = reader.ReadBEInt16();
		this.AmfWave = reader.ReadBEInt16();
		this.AmfDelay = reader.ReadBEInt16();
		this.AmfLength = reader.ReadBEInt16();
		this.AmfRepeat = reader.ReadBEInt16();
		this.AdsrWave = reader.ReadBEInt16();
		this.AdsrDelay = reader.ReadBEInt16();
		this.AdsrLength = reader.ReadBEInt16();
		this.AdsrRepeat = reader.ReadBEInt16();
		this.SustainPt = reader.ReadBEInt16();
		this.SustainVal = reader.ReadBEInt16();
		this.Unknown16Bytes = reader.ReadBytes(16); // TODO
		this.Effect1 = reader.ReadBEInt16();
		this.EffectNumber = reader.ReadBEInt16();
		this.Effect2 = reader.ReadBEInt16();
		this.Effect3 = reader.ReadBEInt16();
		this.EffectDelay = reader.ReadBEInt16();

		this.ArpegData = new Array(3).fill(null);
		for (let i = 0; i < this.ArpegData.length; i++) {
			this.ArpegData[i] = new Arpeggiato(reader);
		}
		this.Name = charsToString(reader.ReadChars(30)).split('\0')[0];
	}

	Write(writer) {
		BinaryWriterExtensions.WriteBEUInt16(writer, this.SynthMode ? 1 : 0);
		BinaryWriterExtensions.WriteBEInt16(writer, this.SampleWaveNo);
		BinaryWriterExtensions.WriteBEInt16(writer, this.Length);
		BinaryWriterExtensions.WriteBEInt16(writer, this.Repeat);
		writer.Write(this.Unknown8Bytes);
		BinaryWriterExtensions.WriteBEInt16(writer, this.Volume);
		BinaryWriterExtensions.WriteBEInt16(writer, this.FineTuning);
		BinaryWriterExtensions.WriteBEInt16(writer, this.Portamento);
		BinaryWriterExtensions.WriteBEInt16(writer, this.VibDelay === -1 ? 255 : this.VibDelay);
		BinaryWriterExtensions.WriteBEInt16(writer, this.VibSpeed);
		BinaryWriterExtensions.WriteBEInt16(writer, this.VibLevel);
		BinaryWriterExtensions.WriteBEInt16(writer, this.AmfWave);
		BinaryWriterExtensions.WriteBEInt16(writer, this.AmfDelay);
		BinaryWriterExtensions.WriteBEInt16(writer, this.AmfLength);
		BinaryWriterExtensions.WriteBEInt16(writer, this.AmfRepeat);
		BinaryWriterExtensions.WriteBEInt16(writer, this.AdsrWave);
		BinaryWriterExtensions.WriteBEInt16(writer, this.AdsrDelay);
		BinaryWriterExtensions.WriteBEInt16(writer, this.AdsrLength);
		BinaryWriterExtensions.WriteBEInt16(writer, this.AdsrRepeat);
		BinaryWriterExtensions.WriteBEInt16(writer, this.SustainPt);
		BinaryWriterExtensions.WriteBEInt16(writer, this.SustainVal);
		writer.Write(this.Unknown16Bytes);
		BinaryWriterExtensions.WriteBEInt16(writer, this.Effect1);
		BinaryWriterExtensions.WriteBEInt16(writer, this.EffectNumber);
		BinaryWriterExtensions.WriteBEInt16(writer, this.Effect2);
		BinaryWriterExtensions.WriteBEInt16(writer, this.Effect3);
		BinaryWriterExtensions.WriteBEInt16(writer, this.EffectDelay);

		for (const arp of this.ArpegData)
			arp.Write(writer);

		writer.Write(asciiBytes((this.Name ?? '<unknown>').padEnd(30, '\0').substring(0, 30)));
	}

	toString() {
		return this.Name;
	}

	ToString() {
		return this.toString();
	}
}

export { Effect as Instrument_Effect };
