// Runs the COSO player and the Paula emulation: used by the audio worklet and by the
// ScriptProcessor fallback.
import { CosoModule, CosoPlayer } from './hippelCoso.js';
import { Paula } from './paula.js';

export class MusicEngine {
	constructor(sampleRate) {
		this.sampleRate = sampleRate;
		this.paula = new Paula(sampleRate);
		this.songs = [];
		this.sampleData = null;
		this.player = null;
		this.samplesPerTick = sampleRate / 50;
		this.tickRest = 0;
		this.volume = 1;
		this.fade = 1;
		this.fadeTarget = 1;
		this.fadeStep = 0;
		this.next = null;
	}

	message(msg) {
		switch (msg.type) {
			case 'load':
				this.songs = msg.songs;
				this.sampleData = msg.sampleData;
				break;
			case 'play':
				if (this.player) {
					// fade out the current song first
					this.next = msg.index;
					this.#fadeTo(0, 0.4);
				} else {
					this.#start(msg.index);
				}
				break;
			case 'stop':
				this.next = null;
				this.#fadeTo(0, 0.4);
				this.stopAfterFade = true;
				break;
			case 'volume':
				this.volume = msg.volume;
				break;
		}
	}

	#fadeTo(target, seconds) {
		this.fadeTarget = target;
		this.fadeStep = (target - this.fade) / Math.max(1, seconds * this.sampleRate);
	}

	#start(index) {
		this.stopAfterFade = false;
		this.paula.reset();
		this.player = null;
		const data = this.songs[index];
		if (!data)
			return;
		const module = new CosoModule(data, this.sampleData);
		this.player = new CosoPlayer(module, this.paula.channels);
		this.tickRest = 0;
		this.fade = 1;
		this.fadeTarget = 1;
		this.fadeStep = 0;
	}

	render(left, right) {
		const count = left.length;
		if (!this.player) {
			left.fill(0);
			right.fill(0);
			return;
		}
		let pos = 0;
		while (pos < count) {
			if (this.tickRest <= 0) {
				this.player.play();
				this.tickRest += this.samplesPerTick;
			}
			const n = Math.min(count - pos, Math.ceil(this.tickRest));
			this.paula.render(left, right, pos, n);
			pos += n;
			this.tickRest -= n;
		}
		for (let i = 0; i < count; i++) {
			if (this.fadeStep !== 0) {
				this.fade += this.fadeStep;
				if ((this.fadeStep < 0 && this.fade <= this.fadeTarget) || (this.fadeStep > 0 && this.fade >= this.fadeTarget)) {
					this.fade = this.fadeTarget;
					this.fadeStep = 0;
				}
			}
			const g = this.fade * this.volume;
			left[i] *= g;
			right[i] *= g;
		}
		if (this.fade === 0 && this.fadeStep === 0) {
			if (this.next != null) {
				const next = this.next;
				this.next = null;
				this.#start(next);
			} else if (this.stopAfterFade) {
				this.stopAfterFade = false;
				this.paula.reset();
				this.player = null;
			}
		}
	}
}
