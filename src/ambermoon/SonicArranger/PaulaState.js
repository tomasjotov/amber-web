// Port of SonicArranger/PaulaState.cs from SonicArranger by Pyrdacor (MIT License, Copyright (c) 2021 Pyrdacor)

import { ArgumentOutOfRangeException, Event, IndexOutOfRangeException, toSByte } from '../../runtime.js';

const NumTracks = 4;

class TrackState {
	constructor() {
		this.data = null;
		this.dataIndex = 0;
		this.DataChanged = false;
		/**
		 * Length of the data to use.
		 *
		 * This mimicks the audio channel length at AUDxLEN.
		 */
		this.Length = 0;
		/**
		 * Current period value (note frequency).
		 *
		 * This mimicks the audio channel period at AUDxPER
		 */
		this.Period = 0;
		/**
		 * Current output volume.
		 *
		 * This mimicks the audio channel volume at AUDxVOL
		 */
		this.Volume = 0;
	}

	/**
	 * Source data for playback.
	 *
	 * This mimicks the audio channel location bits at
	 * AUDxLCH and AUDxLCL.
	 */
	get Data() { return this.data; }
	set Data(value) {
		if (this.data !== value) {
			this.data = value;
			this.DataChanged = true;
		}
	}

	/**
	 * The current data index into the source data.
	 *
	 * This together with Data is used
	 * for playback by replacing the DMA audio controller
	 * which fills AUDxDAT automatically.
	 */
	get DataIndex() { return this.dataIndex; }
	set DataIndex(value) {
		if (this.dataIndex !== value) {
			this.dataIndex = value;
			this.DataChanged = true;
		}
	}
}

class CurrentTrackState {
	constructor() {
		this.Data = null;
		this.StartPlayTime = 0.0;
	}
}

/**
 * Implements ICurrentSample. The C# indexer this[int] is get(index) / set(index, value).
 */
class CurrentSample {
	constructor(currentTrackState) {
		this.currentTrackState = currentTrackState;
		this.Index = 0;
		this.Gamma = 0.0;
	}

	get NextIndex() { return this.Index === this.Length - 1 ? 0 : this.Index + 1; }
	get Length() { return this.currentTrackState.Data?.length ?? 0; }
	get CopyTarget() { return this.currentTrackState.Data; }

	get Sample() { return this.get(this.Index); }
	set Sample(value) { this.set(this.Index, value); }

	get(index) {
		const data = this.currentTrackState.Data;
		return data == null || index >= data.length
			? 0 : toSByte(data[index]);
	}

	set(index, value) {
		const data = this.currentTrackState.Data;
		if (data != null && index < data.length)
			data[index] = value & 0xff;
	}
}

class LowPassFilter {
	// According to Amiga hardware manual the hardward audio low-pass filter
	// starts decreasing frequencies starting at 4kHz and won't let any
	// frequencies above 7kHz through. But more precisely it's a -12dB/oct
	// (second order) Butterworth low-pass filter with a cutoff frequency of
	// around 3.3kHz.
	//
	// Amiga 1200       | 6 dB/oct    | 28867 Hz , As is
	// Amiga 1200 (LED) | 2x12 dB/oct | 3275 Hz , Butterworth
	//
	// | 2nd-order Butterworth s-domain coefficients are: |
	// |                                                  |
	// | b0 = 1.0  b1 = 0        b2 = 0                   |
	// | a0 = 1    a1 = sqrt(2)  a2 = 1                   |
	// |                                                  |
	static CutOffFrequency = 3275.0; // 3.275kHz
	static b0 = 1.0;
	static a0 = 1.0;
	static a1 = 1.41421;
	static a2 = 1.0;
	static omega0 = 2.0 * Math.PI * LowPassFilter.CutOffFrequency / 44100.0;

	constructor() {
		this.lastInputs = [0, 0];
		this.lastOutputs = [0, 0];

		const { b0, a0, a1, a2, omega0 } = LowPassFilter;
		const k = omega0 / Math.tan(0.5 * omega0 * 44100.0);
		const k2 = k * k;
		const d = a0 * k2 + a1 * k + a2;

		this.q = (b0 * k2) / d;
		this.r = (-2.0 * b0 * k2) / d;
		this.s = this.q;
		this.t = (2.0 * a2 - 2.0 * a0 * k2) / d;
		this.u = (a0 * k2 - a1 * k + a2) / d;
	}

	Reset() {
		this.lastInputs[0] = 0;
		this.lastInputs[1] = 0;
		this.lastOutputs[0] = 0;
		this.lastOutputs[1] = 0;
	}

	Filter(value) {
		const output = this.q * value + this.r * this.lastInputs[1] + this.s * this.lastInputs[0] - this.t * this.lastOutputs[1] - this.u * this.lastOutputs[0];

		this.lastInputs[0] = this.lastInputs[1];
		this.lastInputs[1] = value;
		this.lastOutputs[0] = this.lastOutputs[1];
		this.lastOutputs[1] = output;

		return output;
	}
}

const palClockFrequency = 7093789.2;
const ntscClockFrequency = 7159090.5;

/**
 * This mimicks the audio channel data of the Amiga
 * which can be found at 0xdff0a0, 0xdff0b0, 0xdff0c0
 * and 0xdff0d0 for the 4 audio channels.
 *
 * It is documented at http://amiga-dev.wikidot.com/information:hardware.
 */
export class PaulaState {
	static NumTracks = NumTracks;
	static TrackState = TrackState;

	constructor() {
		// event TrackFinishedHandler track1Finished ... track4Finished
		this.track1Finished = new Event();
		this.track2Finished = new Event();
		this.track3Finished = new Event();
		this.track4Finished = new Event();
		this.Tracks = new Array(NumTracks).fill(null);
		this.currentTrackStates = new Array(NumTracks).fill(null);
		this.currentSamples = new Array(4).fill(null);
		this.clockFrequency = palClockFrequency;
		this.masterVolume = 64;
		this.UseLowPassFilter = true;
		this.allowLowPassFilter = true;
		this.lowPassFilters = new Array(4).fill(null);

		for (let i = 0; i < NumTracks; ++i) {
			this.Tracks[i] = new TrackState();
			this.currentTrackStates[i] = new CurrentTrackState();
			this.currentSamples[i] = new CurrentSample(this.currentTrackStates[i]);
		}
		for (let i = 0; i < this.lowPassFilters.length; ++i) {
			this.lowPassFilters[i] = new LowPassFilter();
		}
	}

	get CurrentSamples() { return this.currentSamples; }

	get MasterVolume() { return this.masterVolume; }
	set MasterVolume(value) { this.masterVolume = Math.max(0, Math.min(value, 64)); }

	Reset(allowLowPassFilter, pal) {
		this.allowLowPassFilter = allowLowPassFilter;
		this.clockFrequency = pal ? palClockFrequency : ntscClockFrequency;

		for (let i = 0; i < this.lowPassFilters.length; ++i) {
			this.lowPassFilters[i].Reset();
		}

		for (let i = 0; i < NumTracks; ++i) {
			const track = this.Tracks[i];
			track.Data = null;
			track.Length = 0;
			track.Period = 0;
			track.Volume = 0;
			track.DataIndex = 0;

			const trackState = this.currentTrackStates[i];
			trackState.Data = null;
			trackState.StartPlayTime = 0.0;

			this.currentSamples[i].Index = 0;
			this.currentSamples[i].Gamma = 0.0;
		}
	}

	StopTrack(trackIndex) {
		if (trackIndex < 0 || trackIndex > NumTracks)
			throw new IndexOutOfRangeException('Invalid track index.');

		const track = this.Tracks[trackIndex];
		const trackState = this.currentTrackStates[trackIndex];

		track.Data = null;
		trackState.Data = null;
		this.currentSamples[trackIndex].Index = 0;
		this.currentSamples[trackIndex].Gamma = 0;
	}

	StartTrackData(trackIndex, currentPlayTime) {
		if (trackIndex < 0 || trackIndex > NumTracks)
			throw new IndexOutOfRangeException('Invalid track index.');

		const track = this.Tracks[trackIndex];
		const trackState = this.currentTrackStates[trackIndex];

		if (track.DataChanged) {
			const size = track.Data.length - track.DataIndex;

			if (size <= 0)
				throw new ArgumentOutOfRangeException('Track data index must be less than the data size.');

			trackState.Data = track.Data.slice(track.DataIndex, track.DataIndex + size);
			track.DataChanged = false;
		}

		trackState.StartPlayTime = currentPlayTime;
		this.currentSamples[trackIndex].Index = 0;
		this.currentSamples[trackIndex].Gamma = 0;
	}

	ProcessTrack(trackIndex, currentPlaybackTime) {
		if (trackIndex < 0 || trackIndex > NumTracks)
			throw new IndexOutOfRangeException('Invalid track index.');

		const data = this.currentTrackStates[trackIndex].Data;

		if (data == null || this.Tracks[trackIndex].Period < 1)
			return 0.0;

		const currentSample = this.currentSamples[trackIndex];
		const leftValue = toSByte(data[currentSample.Index]) / 128.0;
		const rightValue = toSByte(data[currentSample.NextIndex]) / 128.0;

		return this.Tracks[trackIndex].Volume * (leftValue + currentSample.Gamma * (rightValue - leftValue)) / 64.0;
	}

	UpdateCurrentSample(trackIndex, currentPlaybackTime) {
		if (trackIndex < 0 || trackIndex > NumTracks)
			throw new IndexOutOfRangeException('Invalid track index.');

		const trackState = this.currentTrackStates[trackIndex];
		const currentSample = this.currentSamples[trackIndex];

		if (trackState.Data == null || trackState.StartPlayTime > currentPlaybackTime) {
			currentSample.Index = 0;
			currentSample.Gamma = 0.0;
			return;
		}

		const period = this.Tracks[trackIndex].Period;

		if (period < 0.01) {
			currentSample.Index = 0;
			currentSample.Gamma = 0.0;
			return;
		}

		const samplesPerSecond = this.clockFrequency / (2.0 * period);
		const trackTime = currentPlaybackTime - trackState.StartPlayTime;
		let index = samplesPerSecond * trackTime;

		const data = trackState.Data;
		let leftIndex = Math.trunc(index);

		if (leftIndex >= data.length) {
			this.InvokeTrackFinishHandler(trackIndex, currentPlaybackTime);

			if (trackState.Data == null) {
				currentSample.Index = 0;
				currentSample.Gamma = 0.0;
				return;
			}

			index -= data.length;
			leftIndex = 0;
			trackState.StartPlayTime = currentPlaybackTime;
		}

		currentSample.Index = leftIndex;
		currentSample.Gamma = index - leftIndex;
	}

	InvokeTrackFinishHandler(trackIndex, currentPlaybackTime) {
		switch (trackIndex) {
			case 0:
				this.track1Finished.invoke(trackIndex, currentPlaybackTime);
				break;
			case 1:
				this.track2Finished.invoke(trackIndex, currentPlaybackTime);
				break;
			case 2:
				this.track3Finished.invoke(trackIndex, currentPlaybackTime);
				break;
			case 3:
				this.track4Finished.invoke(trackIndex, currentPlaybackTime);
				break;
		}
	}

	AttachTrackFinishHandler(trackIndex, handler) {
		switch (trackIndex) {
			case 0:
				this.track1Finished.clear();
				this.track1Finished.add(handler);
				break;
			case 1:
				this.track2Finished.clear();
				this.track2Finished.add(handler);
				break;
			case 2:
				this.track3Finished.clear();
				this.track3Finished.add(handler);
				break;
			case 3:
				this.track4Finished.clear();
				this.track4Finished.add(handler);
				break;
		}
	}

	Process(currentPlaybackTime) {
		let output = 0.0;

		for (let i = 0; i < NumTracks; ++i)
			output += 0.25 * this.ProcessTrack(i, currentPlaybackTime);

		if (this.allowLowPassFilter && this.UseLowPassFilter)
			output = this.lowPassFilters[0].Filter(output);

		return Math.max(-1.0, Math.min(1.0, output));
	}

	ProcessLeftOutput(currentPlaybackTime) {
		let output = 0.0;

		// LRRL
		output += 0.5 * this.ProcessTrack(0, currentPlaybackTime);
		output += 0.5 * this.ProcessTrack(3, currentPlaybackTime);

		if (this.allowLowPassFilter && this.UseLowPassFilter)
			output = this.lowPassFilters[0].Filter(output);

		return Math.max(-1.0, Math.min(1.0, output));
	}

	ProcessRightOutput(currentPlaybackTime) {
		let output = 0.0;

		// LRRL
		output += 0.5 * this.ProcessTrack(1, currentPlaybackTime);
		output += 0.5 * this.ProcessTrack(2, currentPlaybackTime);

		if (this.allowLowPassFilter && this.UseLowPassFilter)
			output = this.lowPassFilters[1].Filter(output);

		return Math.max(-1.0, Math.min(1.0, output));
	}

	ProcessTrackOutput(trackIndex, currentPlaybackTime) {
		let output = this.ProcessTrack(trackIndex, currentPlaybackTime);

		if (this.allowLowPassFilter && this.UseLowPassFilter)
			output = this.lowPassFilters[trackIndex].Filter(output);

		return Math.max(-1.0, Math.min(1.0, output));
	}
}

export { TrackState as PaulaState_TrackState };
