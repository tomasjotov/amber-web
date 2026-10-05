// Port of Ambermoon.Core/Render/MapAnimation.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

// This is similar to the original code.
class AnimationInfo {
	constructor() {
		this.CurrentFrame = 0;
		this.Randomization = 0;
		this.RandomFlagBits = 0;
	}

	Randomize(random) {
		let flags = 0;

		for (let i = 0; i < 6; i++) {
			const randomValue = (random(0, 0xffff) >> 1) & 0xf;
			flags |= (1 << randomValue);
		}

		this.RandomFlagBits = flags;
		this.Randomization = (random(0, 0xffff) >> 1) & 0xff;
	}
}

export class MapAnimation {
	constructor(game) {
		this.game = game;
		// Key: Number of frames
		this.forwardAnimationInfos = new Map();
		this.waveAnimationInfos = new Map();
		this.waveAnimationsRunningBackwards = new Map();

		const random = (min, max) => game.RandomInt(min, max);

		// In original only frame counts 2 to 8 are handled. We support more on the fly
		// but will init those already.
		for (let n = 2; n <= 8; n++) {
			const forward = new AnimationInfo();
			const wave = new AnimationInfo();

			forward.Randomize(random);
			wave.Randomize(random);

			this.forwardAnimationInfos.set(n, forward);
			this.waveAnimationInfos.set(n, wave);
			this.waveAnimationsRunningBackwards.set(n, false);
		}
	}

	CreateAnimationInfos(n) {
		const forward = new AnimationInfo();
		const wave = new AnimationInfo();

		forward.Randomize((min, max) => this.game.RandomInt(min, max));
		wave.Randomize((min, max) => this.game.RandomInt(min, max));

		this.forwardAnimationInfos.set(n, forward);
		this.waveAnimationInfos.set(n, wave);
		this.waveAnimationsRunningBackwards.set(n, false);
	}

	Tick() {
		for (const [Key, Value] of this.forwardAnimationInfos) {
			if (Value.CurrentFrame === Key - 1) {
				Value.CurrentFrame = 0;
				Value.Randomize((min, max) => this.game.RandomInt(min, max));
			} else {
				Value.CurrentFrame++;
			}
		}

		for (const [Key, Value] of this.waveAnimationInfos) {
			const backwards = this.waveAnimationsRunningBackwards.get(Key);

			if (!backwards && Value.CurrentFrame === Key - 1) {
				this.waveAnimationsRunningBackwards.set(Key, true);
				Value.CurrentFrame = Key - 2;
			} else if (backwards && Value.CurrentFrame === 1) {
				this.waveAnimationsRunningBackwards.set(Key, false);
				Value.CurrentFrame = 0;
				Value.Randomize((min, max) => this.game.RandomInt(min, max));
			} else if (backwards) {
				Value.CurrentFrame--;
			} else {
				Value.CurrentFrame++;
			}
		}
	}

	UpdateFrameIndex(currentIndex, frameCount, tileIndex, wave, randomAnimationStart) {
		if (frameCount < 2)
			return 0;

		if (frameCount > 8 && !this.forwardAnimationInfos.has(frameCount))
			this.CreateAnimationInfos(frameCount);

		const infos = wave ? this.waveAnimationInfos : this.forwardAnimationInfos;
		const info = infos.get(frameCount);
		const frame = info.CurrentFrame;

		if (frame !== 0 && randomAnimationStart) {
			const index = (tileIndex + info.Randomization) & 0xf;

			if ((info.RandomFlagBits & (1 << index)) === 0)
				return currentIndex; // no change in this case
		}

		return frame;
	}
}

MapAnimation.AnimationInfo = AnimationInfo;
