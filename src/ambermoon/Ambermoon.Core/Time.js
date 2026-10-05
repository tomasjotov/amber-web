// Port of Ambermoon.Core/Time.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Time.cs - Ingame time implementations

import { Event, toUInt } from '../runtime.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { EnumHelper } from '../Ambermoon.Common/EnumHelper.js';
import { ActiveSpellType } from '../Ambermoon.Data.Common/Enumerations/ActiveSpellType.js';
import { MapType } from '../Ambermoon.Data.Common/Enumerations/MapType.js';
import { MapFlags } from '../Ambermoon.Data.Common/Map.js';
import { TravelType } from '../Ambermoon.Data.Common/Enumerations/TravelType.js';

export const DayTime = Object.freeze({
	Night: 0,
	Dusk: 1,
	Day: 2,
	Dawn: 3
});

/**
 * ITime is an interface (Year, Month, DayOfMonth, Hour, Minute, TimeSlot).
 * Only its static operator is ported: `time + minutes` -> `ITime.op_Addition(time, minutes)`.
 */
export class ITime {
	static op_Addition(time, minutes) {
		const newTime = new Time(time);
		newTime.AddMinutes(minutes);
		return newTime;
	}
}

export class Time {
	/** new Time() or new Time(ITime time) */
	constructor(time = null) {
		this.Year = 0;
		this.Month = 0;
		this.DayOfMonth = 0;
		this.Hour = 0;
		this.Minute = 0;

		if (time != null) {
			this.Year = time.Year;
			this.Month = time.Month;
			this.DayOfMonth = time.DayOfMonth;
			this.Hour = time.Hour;
			this.Minute = time.Minute;
		}
	}

	get TimeSlot() { return Math.trunc((this.Hour * 60 + this.Minute) / 5); }

	static op_Addition(time, minutes) {
		return ITime.op_Addition(time, minutes);
	}

	GetDifferenceInHours(other) {
		const years = this.Year - other.Year;
		const month = this.Month - other.Month;
		const days = this.DayOfMonth - other.DayOfMonth;
		const hours = this.Hour - other.Hour;

		return years * 12 * 31 * 24 + month * 31 * 24 + days * 24 + hours;
	}

	AddHours(hours) {
		if (hours > 24)
			throw new AmbermoonException(ExceptionScope.Application, 'Max 24 hours can be added at once.');

		this.Hour += hours;

		if (this.Hour >= 24) {
			this.Hour -= 24;

			if (++this.DayOfMonth === 31) {
				this.DayOfMonth = 0;

				if (this.Month === 13) {
					this.Month = 0;
					++this.Year;
				}
			}
		}
	}

	AddMinutes(minutes) {
		if (minutes % 5 !== 0)
			throw new AmbermoonException(ExceptionScope.Application, 'Only 5-minute intervals can be used.');

		if (minutes >= 60) {
			this.AddHours(Math.trunc(minutes / 60));
			minutes %= 60;
		}

		this.Minute += minutes;

		if (this.Minute >= 60) {
			this.Minute -= 60;

			if (++this.Hour === 24) {
				this.Hour = 0;

				if (++this.DayOfMonth === 31) {
					this.DayOfMonth = 0;

					if (this.Month === 13) {
						this.Month = 0;
						++this.Year;
					}
				}
			}
		}
	}
}

export class SavegameTime {
	constructor(savegame) {
		this.lastTickTime = Date.now();
		this.pauseTime = null;
		this.currentMoveTicks = 0;

		this.MinuteChanged = new Event();
		this.HourChanged = new Event();
		this.GotTired = new Event();
		this.GotExhausted = new Event();
		this.NewDay = new Event();
		this.NewYear = new Event();

		this.savegame = savegame;
	}

	get Year() { return this.savegame.Year; }
	get Month() { return this.savegame.Month; }
	get DayOfMonth() { return this.savegame.DayOfMonth; }
	get Hour() { return this.savegame.Hour; }
	get Minute() { return this.savegame.Minute; }
	get TimeSlot() { return Math.trunc((this.savegame.Hour * 60 + this.savegame.Minute) / 5); }
	get HoursWithoutSleep() { return this.savegame.HoursWithoutSleep; }
	set HoursWithoutSleep(value) { this.savegame.HoursWithoutSleep = value; }

	static op_Addition(time, minutes) {
		return ITime.op_Addition(time, minutes);
	}

	Pause() {
		this.pauseTime = Date.now();
	}

	Resume() {
		if (this.pauseTime != null) {
			const now = Date.now();
			const elapsed = now - this.lastTickTime;
			const paused = now - this.pauseTime;
			this.lastTickTime = now - (elapsed - paused);
			this.pauseTime = null;
		}
	}

	static SecondsPerTimeSlot = 8;

	Update() {
		if (Date.now() - this.lastTickTime > SavegameTime.SecondsPerTimeSlot * 1000)
			this.Tick();
	}

	ResetTickTimer() {
		this.lastTickTime = Date.now();
	}

	Tick() {
		this.savegame.Minute += 5;
		this.MinuteChanged.invoke(5);

		if (this.savegame.Minute >= 60) {
			this.savegame.Minute = 0;
			++this.savegame.Hour;
			++this.savegame.HoursWithoutSleep;
			this.PostIncreaseUpdate();
		}

		this.currentMoveTicks = 0;
		this.ResetTickTimer();
		this.HandleTimePassed(0, 5);
	}

	Ticks(amount) {
		const minutes = amount * 5;
		let hours = 0;
		this.savegame.Minute += minutes;

		while (this.savegame.Minute >= 60) {
			this.savegame.Minute -= 60;
			++this.savegame.Hour;
			++this.savegame.HoursWithoutSleep;
			++hours;
		}

		this.MinuteChanged.invoke(minutes);
		if (hours !== 0)
			this.PostIncreaseUpdate(hours);
		this.currentMoveTicks = 0;
		this.ResetTickTimer();
		this.HandleTimePassed(Math.trunc(minutes / 60), minutes % 60);
	}

	MoveTick(map, travelType) {
		++this.currentMoveTicks;

		if (map.Type === MapType.Map3D) {
			if (this.currentMoveTicks === 5)
				this.Tick();
		} else if ((map.Flags & MapFlags.Indoor) === MapFlags.Indoor) {
			if (this.currentMoveTicks === 5)
				this.Tick();
		} else {
			let stepsPerTick;
			switch (travelType) {
				case TravelType.Walk: stepsPerTick = 2; break;
				case TravelType.Horse: stepsPerTick = 3; break;
				case TravelType.Raft: stepsPerTick = 2; break;
				case TravelType.Ship: stepsPerTick = 4; break;
				case TravelType.MagicalDisc: stepsPerTick = 2; break;
				case TravelType.Eagle: stepsPerTick = 6; break;
				case TravelType.Fly: stepsPerTick = 256; break;
				case TravelType.Swim: stepsPerTick = 2; break;
				case TravelType.WitchBroom: stepsPerTick = 4; break;
				case TravelType.SandLizard: stepsPerTick = 3; break;
				case TravelType.SandShip: stepsPerTick = 4; break;
				case TravelType.Wasp: stepsPerTick = 6; break;
				default: stepsPerTick = 2; break;
			}

			if (this.currentMoveTicks === stepsPerTick)
				this.Tick();
		}
	}

	Wait(hours) {
		this.savegame.HoursWithoutSleep += hours;
		this.savegame.Hour += hours;
		this.HandleTimePassed(hours, 0);
		this.MinuteChanged.invoke(hours * 60);
		this.PostIncreaseUpdate(hours);
		this.ResetTickTimer();
	}

	PostIncreaseUpdate(hours = 1) {
		let dayPassed = false;
		let yearPassed = false;

		if (this.savegame.Hour >= 24) {
			this.savegame.Hour -= 24;
			++this.savegame.DayOfMonth;
			dayPassed = true;

			if (this.savegame.DayOfMonth > 31) {
				this.savegame.DayOfMonth = 1;
				++this.savegame.Month;

				if (this.savegame.Month > 12) {
					this.savegame.Month = 1;
					++this.savegame.Year;
					if (this.savegame.YearsPassed < 0xffff)
						++this.savegame.YearsPassed;
					yearPassed = true;

					if (this.savegame.Year > 0xffff)
						this.savegame.Year = 0;
				}
			}
		}

		const hoursWithoutSleep = this.savegame.HoursWithoutSleep;

		if (yearPassed)
			this.NewYear.invoke(hoursWithoutSleep < 36 ? 0 : Math.min(hours, hoursWithoutSleep - 35), hours);
		else if (dayPassed)
			this.NewDay.invoke(hoursWithoutSleep < 36 ? 0 : Math.min(hours, hoursWithoutSleep - 35), hours);
		else if (hoursWithoutSleep >= 36)
			this.GotExhausted.invoke(Math.min(hours, hoursWithoutSleep - 35), hours);
		else if (hoursWithoutSleep >= 24)
			this.GotTired.invoke(hours);
		else
			this.HourChanged.invoke(hours);
	}

	HandleTimePassed(passedHours, passedMinutes) {
		const passed5MinuteChunks = passedHours * 12 + Math.trunc(passedMinutes / 5);

		for (const activeSpellType of EnumHelper.GetValues(ActiveSpellType)) {
			const activeSpell = this.savegame.ActiveSpells[activeSpellType];

			if (activeSpell != null) {
				if (activeSpell.Duration <= passed5MinuteChunks)
					this.savegame.ActiveSpells[activeSpellType] = null;
				else
					activeSpell.Duration = toUInt(activeSpell.Duration - passed5MinuteChunks);
			}
		}
	}
}

export class TimeExtensions {
	static GetDayTime(time) {
		// 6-8 -> Dusk
		// 8-18 -> Day
		// 18-20 -> Dawn
		// 20-6 -> Night

		if (time.Hour < 6 || time.Hour >= 20)
			return DayTime.Night;
		else if (time.Hour < 8)
			return DayTime.Dusk;
		else if (time.Hour < 18)
			return DayTime.Day;
		else
			return DayTime.Dawn;
	}

	static CombatBackgroundPaletteIndex(time) {
		/// 3 palettes for daylight (07:00-18:59),
		/// twilight (05:00-06:59, 19:00-20:59)
		/// and night (21:00-04:59) in that order.
		if (time.Hour >= 7 && time.Hour < 19)
			return 0;
		if (time.Hour >= 21 || time.Hour < 5)
			return 2;
		return 1;
	}
}
