// Music output in the browser (Web Audio). The browser only allows audio after a user
// gesture, so the output is created on the first key press or click; a song requested
// before that starts then.
import { MusicEngine } from './musicEngine.js';

export const MusicStorageKey = 'amberstar-web-music';

export class Music {
	constructor(songs, sampleData) {
		this.songs = songs; // index 1..19, raw COSO data
		this.sampleData = sampleData;
		this.context = null;
		this.port = null;
		this.currentSong = 0;
		this.starting = null;
		try {
			this.enabled = localStorage.getItem(MusicStorageKey) !== 'off' && localStorage.getItem('amber-web-mute') !== '1' && !new URLSearchParams(location.search).has('mute');
		} catch {
			this.enabled = true;
		}
	}

	get available() { return typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined'; }

	/** Call from user input handlers. */
	unlock() {
		if (!this.available || this.starting)
			return;
		this.starting = this.#init().catch(e => console.warn('Audio could not be started', e));
	}

	async #init() {
		const Context = window.AudioContext ?? window.webkitAudioContext;
		const context = new Context();
		this.context = context;
		const message = msg => this.port?.postMessage(msg);
		let node;
		if (context.audioWorklet) {
			await context.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));
			node = new AudioWorkletNode(context, 'amberstar-music', { numberOfInputs: 0, outputChannelCount: [2] });
			this.port = node.port;
		} else {
			// Fallback for browsers without audio worklets
			const engine = new MusicEngine(context.sampleRate);
			node = context.createScriptProcessor(4096, 0, 2);
			node.onaudioprocess = e => engine.render(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1));
			this.port = { postMessage: msg => engine.message(msg) };
		}
		node.connect(context.destination);
		this.node = node;
		message({ type: 'load', songs: this.songs, sampleData: this.sampleData });
		message({ type: 'volume', volume: 0.8 });
		if (context.state === 'suspended')
			await context.resume();
		if (this.enabled && this.currentSong)
			message({ type: 'play', index: this.currentSong });
	}

	play(index) {
		if (index === this.currentSong)
			return;
		this.currentSong = index;
		if (this.enabled)
			this.port?.postMessage({ type: 'play', index });
	}

	stop() {
		this.currentSong = 0;
		this.port?.postMessage({ type: 'stop' });
	}

	setEnabled(enabled) {
		this.enabled = enabled;
		try {
			localStorage.setItem(MusicStorageKey, enabled ? 'on' : 'off');
		} catch {
			// ignore
		}
		if (!enabled)
			this.port?.postMessage({ type: 'stop' });
		else if (this.currentSong)
			this.port?.postMessage({ type: 'play', index: this.currentSong });
		else
			this.unlock();
	}
}
