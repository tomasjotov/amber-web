// Port of Ambermoon.Core/Game/GameTime.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Partial class GameCore (GameTime part).

import { hasFlag, toUInt } from '../../runtime.js';
import { Condition } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';
import { TravelType } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { MobileAction } from './Input.js';

export class GameCore_GameTime {
	static initFields(self) {
		/** SavegameTime? (internal, private set) */
		self.GameTime = null;
	}

	PauseGame() {
		if (this.gamePaused)
			return;

		this.gamePaused = true;
		this.audioWasEnabled = this.AudioOutput?.Available === true && this.AudioOutput?.Enabled === true;
		this.musicWasPlaying = this.currentSong != null;
		this.gameWasPaused = this.paused;

		if (this.AudioOutput != null)
			this.AudioOutput.Enabled = false;

		this.Pause();
	}

	ResumeGame() {
		if (!this.gamePaused)
			return;

		this.gamePaused = false;

		if (!this.gameWasPaused)
			this.Resume();

		if (this.audioWasEnabled) {
			this.AudioOutput.Enabled = true;

			if (this.musicWasPlaying)
				this.ContinueMusic();
		}
	}

	Pause() {
		if (this.paused)
			return;

		this.paused = true;

		this.GameTime?.Pause();

		if (this.is3D)
			this.renderMap3D?.Pause();
		else
			this.renderMap2D?.Pause();

		this.Hook_Paused();
	}

	Resume() {
		if (!this.paused || this.WindowActive)
			return;

		this.paused = false;

		this.GameTime?.Resume();

		if (this.is3D)
			this.renderMap3D?.Resume();
		else
			this.renderMap2D?.Resume();

		this.Hook_Resumed();
	}

	Wait(hours) {
		if (hours !== 0)
			this.GameTime?.Wait(hours);
	}

	EnableTimeEvents(enable) {
		this.disableTimeEvents = !enable;
	}

	GameTime_GotExhausted(hoursExhausted, hoursPassed) {
		if (this.disableTimeEvents)
			return;

		this.swimDamageHandled = true;
		let alreadyExhausted = false;
		const damageValues = new Array(this.constructor.MaxPartyMembers).fill(0);

		for (let i = 0; i < this.constructor.MaxPartyMembers; ++i) {
			const partyMember = this.GetPartyMember(i);

			if (partyMember != null && partyMember.Alive) {
				const exhausted = hasFlag(partyMember.Conditions, Condition.Exhausted);
				if (exhausted)
					alreadyExhausted = true;
				partyMember.Conditions |= Condition.Exhausted;
				damageValues[i] = this.AddExhaustion(partyMember, hoursExhausted, !exhausted);
				if (damageValues[i] < partyMember.HitPoints.CurrentValue)
					this.layout.UpdateCharacterStatus(partyMember);
			}
		}

		const DealDamage = () => {
			this.DamageAllPartyMembers(p => damageValues[this.SlotFromPartyMember(p)],
				null, null, someoneDied => {
					this.GameTime_HoursPassed(hoursPassed);

					if (someoneDied) {
						this.CurrentMobileAction = MobileAction.None;
						this.clickMoveActive = false;
						this.ResetMoveKeys(true);
					}
				});
		};

		if (!alreadyExhausted)
			this.ShowMessagePopup(this.DataNameProvider.ExhaustedMessage, DealDamage);
		else
			DealDamage();
	}

	GameTime_GotTired(hoursPassed) {
		if (this.disableTimeEvents)
			return;

		this.swimDamageHandled = true;
		this.ShowMessagePopup(this.DataNameProvider.TiredMessage, () => this.GameTime_HoursPassed(hoursPassed));
	}

	GameTime_HoursPassed(hours, notTiredNorExhausted = false) {
		if (this.disableTimeEvents)
			return;

		this.ProcessPoisonDamage(hours, someoneDied => {
			if (!notTiredNorExhausted && !this.swamLastTick && this.Map.UseTravelTypes && this.TravelType === TravelType.Swim) {
				const hours = (24 + this.GameTime.Hour - this.lastSwimDamageHour) % 24;
				const minutes = this.GameTime.Minute - this.lastSwimDamageMinute;
				this.DoSwimDamage(toUInt(hours * 12 + Math.trunc(minutes / 5)), someoneDrown => {
					if (someoneDied || someoneDrown) {
						this.CurrentMobileAction = MobileAction.None;
						this.clickMoveActive = false;
						this.ResetMoveKeys(true);
					}
				});
			}
		});
	}

	GameTime_NewDay(exhaustedHours, passedHours) {
		if (this.disableTimeEvents)
			return;

		const Age = (partyMember, finishAction) =>
			this.AgePlayer(partyMember, finishAction, 1);

		this.ForeachPartyMember(Age, partyMember =>
			partyMember.Alive && hasFlag(partyMember.Conditions, Condition.Aging) &&
				!hasFlag(partyMember.Conditions, Condition.Petrified), () => {
			if (exhaustedHours > 0)
				this.GameTime_GotExhausted(exhaustedHours, passedHours);
			else if (this.CurrentSavegame.HoursWithoutSleep >= 24)
				this.GameTime_GotTired(passedHours);
			else
				this.GameTime_HoursPassed(passedHours, true);
		});
	}

	GameTime_NewYear(exhaustedHours, passedHours) {
		if (this.disableTimeEvents)
			return;

		const Age = (partyMember, finishAction) => {
			const ageIncrease = hasFlag(partyMember.Conditions, Condition.Aging) ? 2 : 1;
			this.AgePlayer(partyMember, finishAction, ageIncrease);
		};

		this.ForeachPartyMember(Age, partyMember =>
			partyMember.Alive && !hasFlag(partyMember.Conditions, Condition.Petrified), () => {
			if (exhaustedHours > 0)
				this.GameTime_GotExhausted(exhaustedHours, passedHours);
			else if (this.CurrentSavegame.HoursWithoutSleep >= 24)
				this.GameTime_GotTired(passedHours);
			else
				this.GameTime_HoursPassed(passedHours, true);
		});
	}
}
