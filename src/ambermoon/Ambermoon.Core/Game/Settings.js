// Port of Ambermoon.Core/Game/Settings.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { TravelType } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { Event } from '../../../runtime.js';

const RuneTableItemIndex = 145;

export class GameCore_Settings {
	static RuneTableItemIndex = RuneTableItemIndex;

	static initFields(self) {
		// readonly string gameVersionName; readonly string fullVersion; (assigned in GameCore constructor)
		// internal GameLanguage GameLanguage { get; private set; } (assigned in GameCore constructor)
		// public ICoreConfiguration CoreConfiguration { get; private set; } (assigned in GameCore constructor)
		// readonly FullscreenChangeHandler fullscreenChangeHandler; (assigned in GameCore constructor)
		// readonly ResolutionChangeHandler resolutionChangeHandler; (assigned in GameCore constructor)
		self.ConfigurationChanged = new Event();
	}

	get GameVersionName() { return this.gameVersionName; }

	get AutoDerune() {
		return this.TravelType === TravelType.Fly || // Superman mode can also read runes as text
			(this.CoreConfiguration.AutoDerune && [...this.PartyMembers].some(p => p.HasItem(RuneTableItemIndex)));
	}

	NotifyConfigurationChange(windowChange) {
		if (this.Is3D) {
			this.renderMap3D?.UpdateFloorAndCeilingVisibility(this.CoreConfiguration.ShowFloor, this.CoreConfiguration.ShowCeiling);
			this.renderMap3D?.SetFog(this.Map, this.MapManager.GetLabdataForMap(this.Map));
		}

		this.ConfigurationChanged.invoke(this.CoreConfiguration, windowChange);

		// Ensure the music is updated
		this.UpdateMusic();

		if (windowChange && !this.Trapped) {
			this.trappedMousePositionOffset.X = 0;
			this.trappedMousePositionOffset.Y = 0;
			this.MouseTrappedChanged.invoke(false, this.lastMousePosition);
			this.UpdateCursor();
		}
	}

	RequestFullscreenChange(windowMode) { this.fullscreenChangeHandler?.(windowMode); }
	NotifyResolutionChange(oldWidth) { this.resolutionChangeHandler?.(oldWidth); }
	GetFullVersion() { return this.fullVersion; }
	ExternalGraphicFilterChanged() { this.layout.OnExternalGraphicFilterChanged(); }
	ExternalGraphicFilterOverlayChanged() { this.layout.OnExternalGraphicFilterOverlayChanged(); }
	ExternalEffectsChanged() { this.layout.OnExternalEffectsChanged(); }
	ExternalBattleSpeedChanged() {
		this.SetBattleSpeed(this.CoreConfiguration.BattleSpeed);
		this.layout.OnExternalBattleSpeedChanged();
	}
	ExternalMusicChanged() { this.layout.OnExternalMusicChanged(); }
	ExternalVolumeChanged() { this.layout.OnExternalVolumeChanged(); }
	PreFullscreenChanged() {
		this.preFullscreenMousePosition = this.renderView.ScreenToGame(this.GetMousePosition(this.lastMousePosition));
		this.preFullscreenChangeTrapMouseArea = this.trapMouseGameArea;
		if (this.trapMouseGameArea != null)
			this.UntrapMouse();
	}
	PostFullscreenChanged() {
		if (this.preFullscreenMousePosition != null)
			this.lastMousePosition = this.renderView.GameToScreen(this.preFullscreenMousePosition);

		if (this.preFullscreenChangeTrapMouseArea != null) {
			this.TrapMouse(this.preFullscreenChangeTrapMouseArea);
			this.preFullscreenChangeTrapMouseArea = null;
		} else {
			this.MousePositionChanged.invoke(this.lastMousePosition);
		}

		if (this.layout?.OptionMenuOpen === true) {
			this.layout.UpdateFullscreenOption();
		}
	}
}
