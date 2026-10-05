// Web Audio implementation of IAudioOutput (Ambermoon.Data.Common/Audio/IAudioOutput.cs).
// Modeled after Ambermoon.Audio.OpenAL/AudioOutput.cs + AudioBuffers.cs from Ambermoon.net
// (GPL-3.0, Copyright (C) Robert Schneckenhaus): the IAudioStream is pulled in buffers of 250 ms
// and up to 6 buffers (1.5 s) are queued. Instead of OpenAL buffers the data is converted to
// float samples and fed to an AudioWorkletNode (fallback: ScriptProcessorNode).
//
// Browsers only allow audio after a user gesture. The host must call `audioOutput.unlock()` from an
// input handler (keydown, pointerdown, touchend, ...) or use `installUnlockHandlers(target)`.
// Streaming can be started before that; the queued data then plays as soon as the context runs.

import { InvalidOperationException, NotSupportedException } from '../../runtime.js';
import { Util } from '../Ambermoon.Common/Util.js';

/** Duration of one buffer in milliseconds (OpenAL: TimeSpan.FromSeconds(0.25)) */
const BufferDuration = 250;
/** Number of queued buffers (OpenAL: 6 -> up to 1.5 seconds) */
const BufferCount = 6;

const ProcessorName = 'ambermoon-stream-processor';

// Runs on the audio thread. Plays queued chunks of float samples (interleaved by channel count)
// and reports each fully played chunk (like OpenAL's BuffersProcessed).
const workletSource = `
class AmbermoonStreamProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.queue = [];
		this.chunk = null;
		this.position = 0;
		this.port.onmessage = event => {
			const message = event.data;
			if (message.type === 'data') {
				this.queue.push(message);
			} else if (message.type === 'clear') {
				this.queue = [];
				this.chunk = null;
				this.position = 0;
			}
		};
	}

	process(inputs, outputs) {
		const output = outputs[0];
		const left = output[0];
		const right = output.length > 1 ? output[1] : null;
		const count = left.length;

		for (let i = 0; i < count; ++i) {
			if (this.chunk === null) {
				this.chunk = this.queue.length !== 0 ? this.queue.shift() : null;
				this.position = 0;
				if (this.chunk === null) {
					left[i] = 0;
					if (right !== null)
						right[i] = 0;
					continue;
				}
			}
			const chunk = this.chunk;
			const index = this.position * chunk.channels;
			const l = chunk.samples[index];
			left[i] = l;
			if (right !== null)
				right[i] = chunk.channels > 1 ? chunk.samples[index + 1] : l;
			if (++this.position >= chunk.frames) {
				this.port.postMessage({ type: 'processed', id: chunk.id });
				this.chunk = null;
			}
		}

		return true;
	}
}
registerProcessor('${ProcessorName}', AmbermoonStreamProcessor);
`;

/**
 * Converts the raw PCM data of an IAudioStream to float samples (interleaved).
 * 8-bit data is unsigned (128 = silence) like OpenAL expects, 16-bit data is signed little endian.
 * If the stream sample rate differs from the context sample rate, linear resampling is applied.
 */
function convertToFloat(data, channels, sampleRate, sample8Bit, targetSampleRate) {
	const bytesPerSample = sample8Bit ? 1 : 2;
	const frames = Math.floor(data.length / (bytesPerSample * channels));
	let samples = new Float32Array(frames * channels);

	if (sample8Bit) {
		for (let i = 0; i < samples.length; ++i)
			samples[i] = (data[i] - 128) / 128.0;
	} else {
		for (let i = 0; i < samples.length; ++i) {
			const value = (data[i * 2] | (data[i * 2 + 1] << 8)) << 16 >> 16;
			samples[i] = value / 32768.0;
		}
	}

	if (sampleRate !== targetSampleRate && frames > 0) {
		const ratio = sampleRate / targetSampleRate;
		const targetFrames = Math.max(1, Math.round(frames / ratio));
		const resampled = new Float32Array(targetFrames * channels);
		for (let f = 0; f < targetFrames; ++f) {
			const position = f * ratio;
			const index = Math.min(frames - 1, Math.floor(position));
			const next = Math.min(frames - 1, index + 1);
			const gamma = position - index;
			for (let c = 0; c < channels; ++c) {
				const a = samples[index * channels + c];
				const b = samples[next * channels + c];
				resampled[f * channels + c] = a + gamma * (b - a);
			}
		}
		samples = resampled;
		return { samples, frames: targetFrames };
	}

	return { samples, frames };
}

/**
 * The audio sink: one source node (worklet or script processor) connected to a gain node.
 * Chunks are posted to it; for every completely played chunk `onProcessed` is called.
 */
class StreamSink {
	constructor(context, destination) {
		this.context = context;
		this.destination = destination;
		this.node = null;
		this.ready = false;
		this.pendingMessages = [];
		this.onProcessed = null;
		this.nextChunkId = 1;
		// ScriptProcessor fallback state
		this.queue = [];
		this.chunk = null;
		this.position = 0;
		this.readyPromise = this.init();
	}

	async init() {
		const context = this.context;

		if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
			try {
				const url = URL.createObjectURL(new Blob([workletSource], { type: 'application/javascript' }));
				try {
					await context.audioWorklet.addModule(url);
				} finally {
					URL.revokeObjectURL(url);
				}
				const node = new AudioWorkletNode(context, ProcessorName, {
					numberOfInputs: 0,
					numberOfOutputs: 1,
					outputChannelCount: [2]
				});
				node.port.onmessage = event => {
					if (event.data?.type === 'processed')
						this.onProcessed?.();
				};
				node.connect(this.destination);
				this.node = node;
				this.ready = true;
				for (const message of this.pendingMessages)
					this.postToWorklet(message);
				this.pendingMessages = [];
				return;
			} catch (error) {
				console.warn('AudioWorklet not usable, falling back to ScriptProcessorNode.', error);
			}
		}

		if (typeof context.createScriptProcessor !== 'function')
			throw new NotSupportedException('Neither AudioWorklet nor ScriptProcessorNode is supported.');

		const node = context.createScriptProcessor(4096, 0, 2);
		node.onaudioprocess = event => this.processScript(event.outputBuffer);
		node.connect(this.destination);
		this.node = node;
		this.ready = true;
		for (const message of this.pendingMessages)
			this.queue.push(message);
		this.pendingMessages = [];
	}

	get isWorklet() {
		return typeof AudioWorkletNode !== 'undefined' && this.node instanceof AudioWorkletNode;
	}

	postToWorklet(message) {
		this.node.port.postMessage(message, [message.samples.buffer]);
	}

	post(samples, frames, channels) {
		const message = { type: 'data', id: this.nextChunkId++, samples, frames, channels };

		if (!this.ready)
			this.pendingMessages.push(message);
		else if (this.isWorklet)
			this.postToWorklet(message);
		else
			this.queue.push(message);
	}

	clear() {
		this.pendingMessages = [];
		this.queue = [];
		this.chunk = null;
		this.position = 0;
		if (this.ready && this.isWorklet)
			this.node.port.postMessage({ type: 'clear' });
	}

	processScript(outputBuffer) {
		const left = outputBuffer.getChannelData(0);
		const right = outputBuffer.numberOfChannels > 1 ? outputBuffer.getChannelData(1) : null;
		let processed = 0;

		for (let i = 0; i < left.length; ++i) {
			if (this.chunk === null) {
				this.chunk = this.queue.length !== 0 ? this.queue.shift() : null;
				this.position = 0;
				if (this.chunk === null) {
					left[i] = 0;
					if (right !== null)
						right[i] = 0;
					continue;
				}
			}
			const chunk = this.chunk;
			const index = this.position * chunk.channels;
			const l = chunk.samples[index];
			left[i] = l;
			if (right !== null)
				right[i] = chunk.channels > 1 ? chunk.samples[index + 1] : l;
			if (++this.position >= chunk.frames) {
				++processed;
				this.chunk = null;
			}
		}

		for (let i = 0; i < processed; ++i)
			this.onProcessed?.();
	}

	dispose() {
		this.clear();
		this.onProcessed = null;
		try {
			this.node?.disconnect();
		} catch {
			// ignore
		}
		if (this.node && !this.isWorklet)
			this.node.onaudioprocess = null;
		this.node = null;
	}
}

/**
 * Port of Ambermoon.Audio.OpenAL/AudioBuffers.cs: pulls 250 ms buffers from the audio stream
 * and keeps up to 6 of them queued in the sink.
 */
class AudioBuffers {
	static CurrentBuffers = null;

	constructor(output, channels, sampleRate, sample8Bit, audioStream) {
		this.output = output;
		this.channels = channels;
		this.sampleRate = sampleRate;
		this.sample8Bit = sample8Bit;
		this.audioStream = audioStream;
		this.bufferPosition = 0;
		this.queuedBuffers = 0;
		this.playing = false;
		this.cancelled = false;
	}

	Dispose() {
		this.Stop();
	}

	Play() {
		AudioBuffers.CurrentBuffers?.Stop();

		if (AudioBuffers.CurrentBuffers !== this) {
			AudioBuffers.CurrentBuffers = this;

			this.audioStream.Reset();
			this.bufferPosition = 0;
		}

		this.PlaybackLoop();
	}

	Stop() {
		this.cancelled = true;
		if (this.playing) {
			this.playing = false;
			const sink = this.output.sink;
			if (sink != null && sink.onProcessed === this.processedHandler)
				sink.onProcessed = null;
		}
		this.output.sink?.clear();
		this.queuedBuffers = 0;
		AudioBuffers.CurrentBuffers = null;
	}

	SetupNextBuffers(count = 1) {
		const sink = this.output.sink;

		for (let i = 0; i < count && !this.cancelled; ++i) {
			const data = this.audioStream.Stream(BufferDuration);
			if (this.audioStream.EndOfStream) {
				this.audioStream.Reset();
				this.bufferPosition = 0;
			} else {
				this.bufferPosition += data.length;
			}
			if (data.length === 0)
				continue;
			const { samples, frames } = convertToFloat(data, this.channels, this.sampleRate, this.sample8Bit, this.output.SampleRate);
			if (frames === 0)
				continue;
			sink.post(samples, frames, this.channels);
			++this.queuedBuffers;
		}
	}

	PlaybackLoop() {
		const sink = this.output.sink;

		if (sink == null)
			throw new InvalidOperationException('No audio sink available.');

		this.cancelled = false;
		this.playing = true;
		this.queuedBuffers = 0;

		// A buffer finished playing -> queue the next one (like checking BuffersProcessed)
		this.processedHandler = () => {
			if (this.cancelled)
				return;
			this.queuedBuffers = Math.max(0, this.queuedBuffers - 1);
			try {
				this.SetupNextBuffers(BufferCount - this.queuedBuffers);
			} catch (error) {
				console.error('Error while streaming audio data.', error);
				this.output.Stop();
			}
		};
		sink.onProcessed = this.processedHandler;

		// Start with 6 buffers (up to 1.5 seconds)
		this.SetupNextBuffers(BufferCount);
	}
}

/**
 * Implements IAudioOutput with the Web Audio API.
 */
export class AudioOutput {
	/**
	 * @param {object} [options]
	 * @param {AudioContext} [options.audioContext] Existing context to use.
	 * @param {number} [options.sampleRate] Preferred sample rate for a new context (default: device rate).
	 */
	constructor(options = {}) {
		this.disposed = false;
		this.volume = 1.0;
		this.enabled = true;
		this.streaming = false;
		/** Map<IAudioStream, AudioBuffers> */
		this.audioBuffers = new Map();
		this.currentBuffer = null;
		this.context = null;
		this.gainNode = null;
		this.sink = null;
		this.unlockHandlers = null;
		this.Available = false;
		this.SampleRate = 44100;

		const AudioContextClass = typeof globalThis !== 'undefined'
			? (globalThis.AudioContext ?? globalThis.webkitAudioContext)
			: undefined;

		if (options.audioContext == null && AudioContextClass === undefined)
			return; // no Web Audio (e.g. Node)

		try {
			this.context = options.audioContext ?? (options.sampleRate
				? new AudioContextClass({ sampleRate: options.sampleRate, latencyHint: 'playback' })
				: new AudioContextClass({ latencyHint: 'playback' }));
			this.gainNode = this.context.createGain();
			this.gainNode.gain.value = this.volume;
			this.gainNode.connect(this.context.destination);
			this.sink = new StreamSink(this.context, this.gainNode);
			this.sink.readyPromise.catch(error => {
				console.error('Audio output could not be initialized.', error);
				this.Available = false;
			});
			this.SampleRate = this.context.sampleRate;
			this.Available = true;
		} catch (error) {
			console.error('Audio output could not be created.', error);
			this.Available = false;
		}
	}

	/** True when the browser allows audio playback (the context is running). */
	get Unlocked() {
		return this.context != null && this.context.state === 'running';
	}

	/**
	 * Resumes the audio context. Must be called from a user gesture handler
	 * (browsers block audio until then). Safe to call often.
	 * @returns {Promise<void>}
	 */
	unlock() {
		if (this.context == null || this.disposed)
			return Promise.resolve();
		if (this.context.state === 'running')
			return Promise.resolve();
		return this.context.resume().catch(error => {
			console.warn('Audio context could not be resumed.', error);
		});
	}

	/**
	 * Convenience: registers one-time gesture listeners on the target (default: window)
	 * which call unlock() and remove themselves when the context runs.
	 */
	installUnlockHandlers(target = globalThis.window) {
		if (target == null || this.unlockHandlers != null)
			return;
		const events = ['pointerdown', 'mousedown', 'keydown', 'touchend', 'click'];
		const handler = () => {
			this.unlock().then(() => {
				if (this.Unlocked)
					this.removeUnlockHandlers();
			});
		};
		this.unlockHandlers = { target, events, handler };
		for (const event of events)
			target.addEventListener(event, handler, { capture: true, passive: true });
	}

	removeUnlockHandlers() {
		if (this.unlockHandlers == null)
			return;
		const { target, events, handler } = this.unlockHandlers;
		for (const event of events)
			target.removeEventListener(event, handler, { capture: true });
		this.unlockHandlers = null;
	}

	get Enabled() { return this.enabled; }
	set Enabled(value) {
		if (this.enabled === value)
			return;

		if (!value && this.Available && this.Streaming) {
			this.Stop();
			this.Reset();
		}

		this.enabled = value;
	}

	get Streaming() { return this.streaming; }

	/** Output volume (0.0 to 1.0) */
	get Volume() { return this.volume; }
	set Volume(value) {
		value = Math.max(0.0, Math.min(value, 1.0));

		if (Util.FloatEqual(this.volume, value))
			return;

		this.volume = value;

		if (this.Available && this.gainNode != null)
			this.gainNode.gain.value = this.volume;
	}

	Dispose() {
		if (this.disposed)
			return;

		if (this.Streaming)
			this.Stop();

		this.removeUnlockHandlers();

		if (this.Available) {
			for (const [, audioBuffer] of this.audioBuffers)
				audioBuffer?.Dispose();
			this.sink?.dispose();
			try {
				this.gainNode?.disconnect();
			} catch {
				// ignore
			}
			this.context?.close?.().catch(() => { });
		}

		this.audioBuffers.clear();
		this.sink = null;
		this.gainNode = null;
		this.context = null;
		this.streaming = false;
		this.Enabled = false;
		this.Available = false;
		this.disposed = true;
	}

	/**
	 * Starts streaming audio data.
	 */
	Start() {
		if (!this.Available || !this.Enabled)
			return;

		if (this.Streaming)
			return;

		if (this.sink == null)
			throw new NotSupportedException('Start was called without a valid source.');

		if (this.currentBuffer == null)
			return;

		this.streaming = true;

		this.currentBuffer.Play();
	}

	/**
	 * Stops streaming audio data.
	 */
	Stop() {
		if (!this.Available || !this.Enabled)
			return;

		if (!this.Streaming)
			return;

		if (this.sink == null)
			throw new NotSupportedException('Stop was called without a valid source.');

		this.streaming = false;

		if (this.currentBuffer != null)
			this.currentBuffer.Stop();
		else
			this.sink.clear();
	}

	/**
	 * Streams new data.
	 * @param audioStream IAudioStream (EndOfStream, Stream(durationMs) -> Uint8Array, Reset())
	 */
	StreamData(audioStream, channels = 1, sampleRate = 44100, sample8Bit = true) {
		if (!this.Available)
			return;

		const buffer = this.audioBuffers.get(audioStream);

		if (buffer === undefined) {
			this.currentBuffer = new AudioBuffers(this, channels, sampleRate, sample8Bit, audioStream);
			this.audioBuffers.set(audioStream, this.currentBuffer);
		} else {
			this.currentBuffer = buffer;
		}
	}

	/**
	 * Resets the audio data.
	 */
	Reset() {
		if (!this.Available)
			return;

		this.sink?.clear();
	}
}
