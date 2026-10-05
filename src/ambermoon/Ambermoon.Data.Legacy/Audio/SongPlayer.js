// Port of Ambermoon.Data.Legacy/Audio/SongPlayer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentNullException } from '../../../runtime.js';

export class SongPlayer {
	constructor() {
		this.currentStream = null;
		this.audioOutput = null;
	}

	Start(audioOutput, audioStream) {
		if (audioOutput == null)
			throw new ArgumentNullException('audioOutput');
		this.audioOutput = audioOutput;

		if (this.currentStream !== audioStream) {
			this.Stop();
			this.currentStream = audioStream;
			audioOutput.StreamData(audioStream, 1, audioOutput.SampleRate, true);
		}
		if (!audioOutput.Streaming)
			audioOutput.Start();
	}

	Stop() {
		this.audioOutput?.Stop();
		this.audioOutput?.Reset();
		this.currentStream = null;
	}
}
