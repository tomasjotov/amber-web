// Port of SonicArranger/SampleTable.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

import { firstOrDefault } from '../../runtime.js';
import { Sample } from './Sample.js';
import { Instrument } from './Instrument.js';
import { BinaryWriterExtensions } from './BinaryWriterExtensions.js';

/** new string(char[]) - ReadChars may return a char array or a string */
const charsToString = chars => (Array.isArray(chars) ? chars.join('') : String(chars ?? ''));
/** Encoding.ASCII.GetBytes */
const asciiBytes = str => Uint8Array.from(str, ch => { const c = ch.charCodeAt(0); return c < 0x80 ? c : 0x3f; });

export class SampleTable {
	/**
	 * Overloads: SampleTable(ICustomReader reader, bool editable) and SampleTable(Sample[] samples)
	 */
	constructor(readerOrSamples, editable = false) {
		this.Count = 0;
		this.Samples = null;
		this.sampleLengths = null;
		this.sampleRepeats = null;
		this.sampleNames = null;

		if (Array.isArray(readerOrSamples)) {
			const samples = readerOrSamples;
			this.Count = samples.length;
			this.Samples = samples;
			return;
		}

		const reader = readerOrSamples;
		this.Count = reader.ReadBEInt32();
		if (this.Count > 0) {
			const Count = this.Count;
			this.Samples = new Array(Count).fill(null);

			if (editable) {
				this.sampleLengths = new Array(Count).fill(0);
				for (let i = 0; i < Count; ++i)
					this.sampleLengths[i] = reader.ReadBEInt32();
				this.sampleRepeats = new Array(Count).fill(0);
				for (let i = 0; i < Count; ++i)
					this.sampleRepeats[i] = reader.ReadBEInt32();
				this.sampleNames = new Array(Count).fill(null);
				for (let i = 0; i < Count; ++i)
					this.sampleNames[i] = charsToString(reader.ReadChars(30));
				const sampleSizes = new Array(Count).fill(0);
				for (let i = 0; i < Count; ++i)
					sampleSizes[i] = reader.ReadBEInt32();
				for (let i = 0; i < Count; i++)
					this.Samples[i] = new Sample(reader, sampleSizes[i]);
			} else {
				const sampleSizes = new Array(Count).fill(0);
				for (let i = 0; i < Count; ++i)
					sampleSizes[i] = reader.ReadBEInt32();
				for (let i = 0; i < Count; i++)
					this.Samples[i] = new Sample(reader, sampleSizes[i]);
			}
		}
	}

	Write(writer, instruments = null) {
		BinaryWriterExtensions.WriteBEInt32(writer, this.Count);

		if (this.Count === 0)
			return;

		if (this.sampleLengths != null) {
			for (const sampleLength of this.sampleLengths)
				BinaryWriterExtensions.WriteBEInt32(writer, sampleLength);
		} else {
			for (const sample of this.Samples)
				BinaryWriterExtensions.WriteBEInt32(writer, Math.trunc((sample.Data?.length ?? 0) / 2));
		}

		if (this.sampleRepeats != null) {
			for (const sampleRepeat of this.sampleRepeats)
				BinaryWriterExtensions.WriteBEInt32(writer, sampleRepeat);
		} else {
			for (let s = 0; s < this.Samples.length; ++s)
				BinaryWriterExtensions.WriteBEInt32(writer, 1);
		}

		if (this.sampleNames != null) {
			for (const sampleName of this.sampleNames)
				writer.Write(asciiBytes(sampleName.padEnd(30, '\0').substring(0, 30)));
		} else {
			const defaultNameBytes = asciiBytes('--blank--'.padEnd(30, '\0'));

			for (let s = 0; s < this.Samples.length; ++s) {
				// Note: Like in C#, FirstOrDefault on the struct array returns a default
				// instrument (not null) if instruments is given but no instrument matches.
				const instrumentWithSample = instruments == null ? null
					: firstOrDefault(instruments, i => !i.SynthMode && i.SampleWaveNo === s, new Instrument());

				if (instrumentWithSample != null)
					writer.Write(asciiBytes(instrumentWithSample.Name.padEnd(30, '\0').substring(0, 30)));
				else
					writer.Write(defaultNameBytes);
			}
		}

		for (const sample of this.Samples)
			BinaryWriterExtensions.WriteBEInt32(writer, sample.Data?.length ?? 0);

		for (const sample of this.Samples) {
			if (sample.Data != null && sample.Data.length !== 0)
				writer.Write(sample.Data);
		}
	}
}
