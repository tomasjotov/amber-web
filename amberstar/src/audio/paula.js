// A small emulation of the Amiga sound chip (Paula): 4 DMA channels playing 8 bit samples
// with a period (pitch) and a volume of 0..64. Channels 0 and 3 are left, 1 and 2 right.
// Improvements over the hardware: linear interpolation, softer stereo separation and a
// gentle low pass filter (similar to the Amiga 500 output filter).

const PalClock = 3546895;

export class PaulaChannel {
	constructor() {
		this.data = null;
		this.pos = 0;
		this.end = 0;
		this.loopData = null;
		this.loopStart = 0;
		this.loopEnd = 0;
		this.pending = null;
		this.period = 428;
		this.volume = 0;
		this.active = false;
	}

	/** Starts a sample immediately. */
	playSample(data, start, length) {
		this.data = data;
		this.pos = start;
		this.end = Math.min(data.length, start + length);
		this.loopData = null;
		this.pending = null;
		this.active = this.end > this.pos;
	}

	/** Sets the sample which is played when the current one has ended (like writing the Amiga DMA registers). */
	setSample(data, start, length) {
		if (!this.active) {
			// a stopped channel starts with the new sample right away
			this.playSample(data, start, length);
			return;
		}
		this.pending = { data, start, end: Math.min(data.length, start + length) };
		this.loopData = null;
	}

	/** Loop inside the current (or pending) sample after it has been played once. */
	setLoop(start, length) {
		const data = this.pending?.data ?? this.data;
		if (!data)
			return;
		this.loopData = data;
		this.loopStart = start;
		this.loopEnd = Math.min(data.length, start + length);
	}

	mute() {
		this.active = false;
		this.pending = null;
		this.loopData = null;
	}

	setPeriod(period) {
		this.period = period;
	}

	setVolume(volume) {
		this.volume = Math.max(0, Math.min(64, volume));
	}

	#sampleEnded() {
		if (this.pending) {
			const p = this.pending;
			this.pending = null;
			this.data = p.data;
			this.pos += p.start - this.end;
			this.end = p.end;
			return this.end > p.start;
		}
		if (this.loopData && this.loopEnd - this.loopStart > 2) {
			this.data = this.loopData;
			this.pos += this.loopStart - this.end;
			this.end = this.loopEnd;
			return true;
		}
		return false;
	}

	/** Adds `count` samples to `out` (starting at `offset`) with the given gain. */
	mix(out, offset, count, sampleRate, gain) {
		if (!this.active || !this.data || this.period < 64)
			return;
		const step = PalClock / this.period / sampleRate;
		const vol = gain * this.volume / 64 / 128;
		for (let i = 0; i < count; i++) {
			while (this.pos >= this.end) {
				if (!this.#sampleEnded()) {
					this.active = false;
					return;
				}
				if (this.pos < 0)
					this.pos = 0;
			}
			const data = this.data;
			const index = this.pos | 0;
			const frac = this.pos - index;
			const a = data[index];
			const b = index + 1 < this.end ? data[index + 1] : a;
			out[offset + i] += (a + (b - a) * frac) * vol;
			this.pos += step;
		}
	}
}

export class Paula {
	constructor(sampleRate) {
		this.sampleRate = sampleRate;
		this.channels = [new PaulaChannel(), new PaulaChannel(), new PaulaChannel(), new PaulaChannel()];
		this.left = new Float32Array(0);
		this.right = new Float32Array(0);
		this.separation = 0.7; // 1 = hard Amiga stereo
		this.filterLeft = 0;
		this.filterRight = 0;
		this.filterCoefficient = 1 - Math.exp(-2 * Math.PI * 7000 / sampleRate);
	}

	reset() {
		this.channels.forEach(c => c.mute());
	}

	/** Renders `count` stereo samples into outLeft/outRight (from `offset`). */
	render(outLeft, outRight, offset, count) {
		if (this.left.length < count) {
			this.left = new Float32Array(count);
			this.right = new Float32Array(count);
		}
		const left = this.left;
		const right = this.right;
		left.fill(0, 0, count);
		right.fill(0, 0, count);
		const gain = 0.5;
		this.channels[0].mix(left, 0, count, this.sampleRate, gain);
		this.channels[3].mix(left, 0, count, this.sampleRate, gain);
		this.channels[1].mix(right, 0, count, this.sampleRate, gain);
		this.channels[2].mix(right, 0, count, this.sampleRate, gain);
		const s = 0.5 + this.separation / 2;
		const k = this.filterCoefficient;
		let fl = this.filterLeft;
		let fr = this.filterRight;
		for (let i = 0; i < count; i++) {
			const l = left[i] * s + right[i] * (1 - s);
			const r = right[i] * s + left[i] * (1 - s);
			fl += (l - fl) * k;
			fr += (r - fr) * k;
			outLeft[offset + i] = fl;
			outRight[offset + i] = fr;
		}
		this.filterLeft = fl;
		this.filterRight = fr;
	}
}
