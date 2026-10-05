// Audio worklet processor for the music.
import { MusicEngine } from './musicEngine.js';

class MusicProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.engine = new MusicEngine(sampleRate);
		this.port.onmessage = e => this.engine.message(e.data);
	}

	process(inputs, outputs) {
		const out = outputs[0];
		if (out.length >= 2)
			this.engine.render(out[0], out[1]);
		else if (out.length === 1)
			this.engine.render(out[0], new Float32Array(out[0].length));
		return true;
	}
}

registerProcessor('amberstar-music', MusicProcessor);
