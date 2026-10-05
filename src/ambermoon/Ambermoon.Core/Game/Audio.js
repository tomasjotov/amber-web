// Port of Ambermoon.Core/Game/Audio.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Song } from '../../Ambermoon.Data.Common/Enumerations/Song.js';
import { TravelTypeExtensions } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { ButtonType } from '../../Ambermoon.Data.Common/Enumerations/ButtonType.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { range } from '../../../runtime.js';

export class GameCore_Audio {
	static initFields(self) {
		// readonly ISongManager songManager; (assigned in GameCore constructor)
		self.currentSong = null;
		self.lastPlayedSong = null;
		self.disableMusicChange = false;
		// internal IAudioOutput AudioOutput { get; private set; } (assigned in GameCore constructor)
	}

	/**
	 * Starts playing a specific music. If Song.Default is given
	 * the current map music is played instead.
	 *
	 * Returns the previously played song.
	 */
	PlayMusic(song) {
		const lastSong = this.lastPlayedSong;
		this.lastPlayedSong = null;

		if (this.disableMusicChange)
			return this.currentSong?.Song ?? Song.Default;

		if (song === Song.Default || song === 255) {
			if (this.Map.UseTravelMusic) {
				let travelSong = TravelTypeExtensions.TravelSong(this.TravelType);

				if (travelSong === Song.Default)
					travelSong = Song.PloddingAlong;

				return this.PlayMusic(travelSong);
			}

			// Web port: in Amberstar song 0 means "keep the current song".
			const keep = this.renderView.GameData?.IsAmberstar ? (this.currentSong?.Song ?? null) : null;
			return this.PlayMusic(this.Map.MusicIndex === 0 || this.Map.MusicIndex === 255 ? (keep ?? lastSong ?? Song.PloddingAlong) : this.Map.MusicIndex);
		}

		const newSong = this.songManager.GetSong(song);
		const oldSong = this.currentSong?.Song ?? Song.Default;

		if (this.currentSong !== newSong) {
			this.currentSong?.Stop();
			this.currentSong = newSong;
			this.ContinueMusic();
		}

		return oldSong;
	}

	/**
	 * Starts playing the map's music.
	 */
	PlayMapMusic() { return this.PlayMusic(Song.Default); }

	EnableMusicChange(enable) { this.disableMusicChange = !enable; }

	/** Returns the duration in ms or null. */
	GetCurrentSongDuration() { return this.currentSong?.SongDuration ?? null; }

	ContinueMusic() {
		if (this.CoreConfiguration.Music)
			this.currentSong?.Play(this.AudioOutput);
	}

	UpdateMusic() {
		if (this.CoreConfiguration.Music && this.currentSong != null)
			this.PlayMusic(this.currentSong.Song);
	}

	// Elf harp
	OpenMusicList(finishAction = null) {
		const wasPaused = this.paused;
		this.Pause();
		const columns = 15;
		const rows = 10;
		const popupArea = new Rect(16, 35, columns * 16, rows * 16);
		this.TrapMouse(new Rect(popupArea.Left + 16, popupArea.Top + 16, popupArea.Width - 32, popupArea.Height - 32));
		const popup = this.layout.OpenPopup(popupArea.Position, columns, rows, true, false);
		const PlaySong = (index, name) => {
			if (this.AudioOutput.Available) {
				this.AudioOutput.Enabled = this.CoreConfiguration.Music = true;
				this.PlayMusic(index + 1);
			}
		};
		// KeyValuePair<string, Action<int, string>> -> { Key, Value }
		const songList = popup.AddSongListBox(range(0, 32).map(index => ({
			Key: this.DataNameProvider.GetSongName(index + 1),
			Value: PlaySong
		})));
		const exitButton = popup.AddButton(new Position(190, 166));
		exitButton.ButtonType = ButtonType.Exit;
		exitButton.Disabled = false;
		exitButton.LeftClickAction = () => this.ClosePopup();
		exitButton.Visible = true;
		popup.Closed.add(() => {
			this.UntrapMouse();
			if (!wasPaused)
				this.Resume();
			finishAction?.();
		});
		const scrollRange = Math.max(0, 16); // = 32 songs - 16 songs visible
		const scrollbar = popup.AddScrollbar(this.layout, scrollRange, 2);
		scrollbar.Scrolled.add(offset => {
			songList.ScrollTo(offset);
		});
	}
}
