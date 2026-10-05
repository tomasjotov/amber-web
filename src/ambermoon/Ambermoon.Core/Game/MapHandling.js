// Port of Ambermoon.Core/Game/MapHandling.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Partial class GameCore (MapHandling part) plus the nested structs GameCore.AutomapOptions and GameCore.AutomapWall.

import {
	hasFlag, toUInt, toByte, tryGetValue, getValue, firstOrDefault, cloneStruct, formatNumber
} from '../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { EnumHelper } from '../../Ambermoon.Common/EnumHelper.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { Map as DataMap, MapFlags } from '../../Ambermoon.Data.Common/Map.js';
import { Automap } from '../../Ambermoon.Data.Common/Automap.js';
import { TransportLocation } from '../../Ambermoon.Data.Common/Savegame.js';
import { Tileset } from '../../Ambermoon.Data.Common/Tileset.js';
import { EventType, ChangeTileEvent, PopupTextEvent, RectangularExplorationEvent } from '../../Ambermoon.Data.Common/Event.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { TravelType, TravelTypeExtensions } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { SpecialItemPurpose } from '../../Ambermoon.Data.Common/Enumerations/SpecialItemPurpose.js';
import { ActiveSpellType } from '../../Ambermoon.Data.Common/Enumerations/ActiveSpellType.js';
import { Skill } from '../../Ambermoon.Data.Common/Enumerations/Skill.js';
import { Condition } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';
import { Song } from '../../Ambermoon.Data.Common/Enumerations/Song.js';
import { AutomapType, AutomapExtensions } from '../../Ambermoon.Data.Common/Enumerations/AutomapType.js';
import { AutomapGraphic } from '../../Ambermoon.Data.Common/Enumerations/AutomapGraphic.js';
import { UIGraphic } from '../../Ambermoon.Data.Common/Enumerations/UIGraphic.js';
import { UICustomGraphic } from '../../Ambermoon.Data.Common/Enumerations/UICustomGraphic.js';
import { Picture80x80 } from '../../Ambermoon.Data.Common/Enumerations/Picture80x80.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import { Character2DAnimationInfo } from '../../Ambermoon.Data.Common/Render/Character2DAnimationInfo.js';
import { EventTrigger } from '../MapExtensions.js';
import { Key } from '../Key.js';
import { MouseButtons } from '../MouseButtons.js';
import { PlayerMovementAbility } from '../PlayerMovementAbility.js';
import { Global } from '../UI/Global.js';
import { Window } from '../UI/Window.js';
import { LayoutType } from '../UI/Layout.js';
import { Layer } from '../Render/Layer.js';
import { Color } from '../Render/Color.js';
import { Graphics } from '../Render/Graphics.js';
import { TextAlign } from '../Render/TextAlign.js';
import { TextureAtlasManager } from '../Render/TextureAtlasManager.js';
import { RenderMap3D } from '../Render/RenderMap3D.js';
import { MapCharacter2D } from '../Render/MapCharacter2D.js';
import { Player2D } from '../Render/Player2D.js';
import { MobileAction } from './Input.js';

// Copy of the internal const GameCore.MaxBaseLine (declared in Game/Rendering.cs).
const MaxBaseLine = 0x4000;

/** Nested struct GameCore.AutomapOptions */
export class AutomapOptions {
	constructor() {
		this.SecretDoorsVisible = false;
		this.MonstersVisible = false;
		this.PersonsVisible = false;
		this.TrapsVisible = false;
		this.ShowGotoPoints = false;
	}

	clone() {
		const clone = new AutomapOptions();
		Object.assign(clone, this);
		return clone;
	}
}

/** Nested struct GameCore.AutomapWall */
export class AutomapWall {
	constructor() {
		this.TileX = 0;
		this.TileY = 0;
		this.DrawX = 0;
		this.DrawY = 0;
		this.NormalWall = null; // true: normal, false: fake wall, null: wall with automap graphic on it
		this.BlocksSight = false;
	}

	clone() {
		const clone = new AutomapWall();
		Object.assign(clone, this);
		return clone;
	}
}

export { AutomapOptions as GameCore_AutomapOptions, AutomapWall as GameCore_AutomapWall };

/** string.Compare(a, b, ignoreCase: true) == 0 */
function equalsIgnoreCase(a, b) {
	return (a ?? '').toUpperCase() === (b ?? '').toUpperCase();
}

export class GameCore_MapHandling {
	static initFields(self) {
		self.is3D = false;
		self.swamLastTick = false;
		self.swimDamageHandled = false;
		self.lastSwimDamageHour = 0;
		self.lastSwimDamageMinute = 0;
		self.changedMaps = [];
		self.monstersCanMoveImmediately = false; // this is set when the player just moved so that monsters who see the player can instantly move (2D only)

		self.CurrentMapCharacter = null; // This is set when interacting with a map character
		// MapManager (public IMapManager MapManager { get; }) is assigned by the GameCore constructor.
		self.MonsterSeesPlayer = false;
	}

	get Is3D() { return this.is3D; }
	get Map() { return !this.Ingame ? null : this.Is3D ? this.renderMap3D?.Map ?? null : this.renderMap2D?.Map ?? null; }

	ShowMap(show, playMusic = true) {
		this.layout.HideTooltip();

		if (show) {
			this.UpdateUIPalette(true);
			this.currentBattle = null;
			this.layout.CancelDrag();
			this.ResetCursor();
			this.OpenStorage = null;
			this.UpdateMapName();
			this.Resume();
			this.ResetMoveKeys(true);
			this.UpdateLight();

			if (playMusic) {
				if (this.lastPlayedSong != null && this.lastPlayedSong !== Song.BarBrawlin)
					this.PlayMusic(this.lastPlayedSong);
				else if (this.Map.UseTravelMusic)
					this.PlayMusic(TravelTypeExtensions.TravelSong(this.TravelType));
				else
					this.PlayMusic(Song.Default);
			}
		} else {
			this.UpdateUIPalette(false);
			this.Pause();
		}

		this.ShowWindowTitle(show);

		if (this.is3D) {
			if (show)
				this.layout.SetLayout(LayoutType.Map3D, this.movement.MovementTicks(true, false, TravelType.Walk));
			this.renderView.GetLayer(Layer.Map3DBackground).Visible = show;
			this.renderView.GetLayer(Layer.Map3DBackgroundFog).Visible = show;
			this.renderView.GetLayer(Layer.Map3DCeiling).Visible = show;
			this.renderView.GetLayer(Layer.Map3D).Visible = show;
			this.renderView.GetLayer(Layer.Billboards3D).Visible = show;
		} else {
			if (show)
				this.layout.SetLayout(LayoutType.Map2D, this.movement.MovementTicks(false, this.Map.UseTravelTypes, this.TravelType));
			for (let i = Global.First2DLayer; i <= Global.Last2DLayer; ++i)
				this.renderView.GetLayer(i).Visible = show;
		}

		if (show) {
			this.layout.Reset();
			this.mapViewRightFillArea = this.layout.FillArea(new Rect(208, 49, 96, 80), this.GetUIColor(28), false);
			this.SetWindow(Window.MapView);

			for (const specialItem of EnumHelper.GetValues(SpecialItemPurpose)) {
				if (this.CurrentSavegame.IsSpecialItemActive(specialItem))
					this.layout.AddSpecialItem(specialItem);
			}

			for (const activeSpell of EnumHelper.GetValues(ActiveSpellType)) {
				if (this.CurrentSavegame.ActiveSpells[activeSpell] != null)
					this.layout.AddActiveSpell(activeSpell, this.CurrentSavegame.ActiveSpells[activeSpell], false);
			}
		}
	}

	ResetMapCharacterInteraction(map, leaveMapCharacter = false) {
		if (this.CurrentMapCharacter != null) {
			this.CurrentMapCharacter.ResetLastInteractionTime();

			if (!leaveMapCharacter)
				this.CurrentMapCharacter = null;
		}

		if (map.Type === MapType.Map3D)
			RenderMap3D.Reset();
		else
			MapCharacter2D.Reset();
	}

	Set3DFade(fade) {
		this.renderView.Set3DFade(fade);
		// TODO: ceiling/floor color
	}

	Fade3DMapOut(totalSteps, timePerStep) {
		const div = totalSteps;

		for (let i = 0; i <= totalSteps; i++) {
			const light = this.constructor.FadeAlphaToLight(1.0 - i / div);
			this.AddTimedEvent(i * timePerStep, () => this.Set3DFade(light));
		}
	}

	Fade3DMapIn(totalSteps, timePerStep) {
		const div = totalSteps;

		for (let i = 0; i <= totalSteps; i++) {
			const light = this.constructor.FadeAlphaToLight(i / div);
			this.AddTimedEvent(i * timePerStep, () => this.Set3DFade(light));
		}
	}

	ChangeMapAreaExploration(mapIndex, x, y, width, height, explorationType) {
		if (width === 0 || height === 0)
			return;

		const map = this.MapManager.GetMap(mapIndex);

		// we use 0-based coordinates
		x = Math.max(1, x) - 1;
		y = Math.max(1, y) - 1;

		if (x >= map.Width || y >= map.Height)
			return;

		const [found, existingAutomap] = tryGetValue(this.CurrentSavegame.Automaps, mapIndex);
		let automap;
		if (found)
			automap = existingAutomap;
		else {
			automap = new Automap();
			automap.ExplorationBits = new Uint8Array(Math.trunc((map.Width * map.Height + 7) / 8));
		}

		const startX = x;
		const endX = Math.min(x + width, map.Width);
		const endY = Math.min(y + height, map.Height);

		for (; y < endY; y++) {
			let rowBaseBit = y * map.Width + startX;

			for (x = startX; x < endX; x++) {
				const bitIndex = rowBaseBit++;
				const byteIndex = bitIndex >> 3;
				const mask = toByte(1 << (bitIndex & 7));

				switch (explorationType) {
					case RectangularExplorationEvent.ExplorationType.Reveal:
						automap.ExplorationBits[byteIndex] |= mask;
						break;

					case RectangularExplorationEvent.ExplorationType.Hide:
						automap.ExplorationBits[byteIndex] &= toByte(~mask);
						break;

					case RectangularExplorationEvent.ExplorationType.Invert:
						automap.ExplorationBits[byteIndex] ^= mask;
						break;
				}
			}
		}

		this.CurrentSavegame.Automaps.set(this.Map.Index, automap);
	}

	/**
	 * Overloads: ExploreMapArea(RectangularExplorationEvent) and ExploreMapArea(VerticalLineRevealEvent).
	 */
	ExploreMapArea(explorationEvent) {
		if (explorationEvent instanceof RectangularExplorationEvent) {
			const rectangularExplorationEvent = explorationEvent;

			if (!this.Ingame || this.Map == null || !this.Is3D)
				return;

			let mapIndex = rectangularExplorationEvent.MapIndex;

			if (mapIndex === 0)
				mapIndex = this.Map.Index;

			this.ChangeMapAreaExploration(mapIndex, rectangularExplorationEvent.X, rectangularExplorationEvent.Y,
				rectangularExplorationEvent.Width, rectangularExplorationEvent.Height, rectangularExplorationEvent.Exploration);
		} else {
			const verticalLineRevealEvent = explorationEvent;

			if (!this.Ingame || this.Map == null || !this.Is3D)
				return;

			const reveal = RectangularExplorationEvent.ExplorationType.Reveal;

			if (verticalLineRevealEvent.Height1 !== 0) {
				this.ChangeMapAreaExploration(this.Map.Index, verticalLineRevealEvent.X1, verticalLineRevealEvent.Y1,
					1, verticalLineRevealEvent.Height1, reveal);
			}

			if (verticalLineRevealEvent.Height2 !== 0) {
				this.ChangeMapAreaExploration(this.Map.Index, verticalLineRevealEvent.X2, verticalLineRevealEvent.Y2,
					1, verticalLineRevealEvent.Height2, reveal);
			}

			if (verticalLineRevealEvent.Height3 !== 0) {
				this.ChangeMapAreaExploration(this.Map.Index, verticalLineRevealEvent.X3, verticalLineRevealEvent.Y3,
					1, verticalLineRevealEvent.Height3, reveal);
			}
		}
	}

	ExploreMap() {
		const Map = this.Map;

		if (!this.Ingame || Map == null || !this.Is3D)
			return false;

		let [found, automap] = tryGetValue(this.CurrentSavegame.Automaps, Map.Index);

		if (!found) {
			automap = new Automap();
			automap.ExplorationBits = new Uint8Array(Math.trunc((Map.Width * Map.Height + 7) / 8)).fill(0xff);
			this.CurrentSavegame.Automaps.set(Map.Index, automap);
		} else {
			automap.ExplorationBits = new Uint8Array(Math.trunc((Map.Width * Map.Height + 7) / 8)).fill(0xff);
		}

		if ((Map.GotoPoints?.length ?? 0) > 0) {
			for (const gotoPoint of Map.GotoPoints) {
				this.CurrentSavegame.ActivateGotoPoint(gotoPoint.Index);
			}
		}

		if (this.currentWindow.Window === Window.Automap && this.nextClickHandler != null) {
			const automapOptions = this.currentWindow.WindowParameters[0];
			const oldCloseWindowHandler = this.closeWindowHandler;
			this.closeWindowHandler = backToMap => {
				oldCloseWindowHandler?.(backToMap);
				this.ShowAutomap(automapOptions);
			};
			const nextClickHandler = this.nextClickHandler;
			this.nextClickHandler = null;
			nextClickHandler(MouseButtons.Right); // This closes the automap
		}

		return true;
	}

	ActivateTransport(travelType) {
		if (travelType === TravelType.Walk ||
			travelType === TravelType.Swim)
			throw new AmbermoonException(ExceptionScope.Application, 'Walking and swimming should not be set via ActivateTransport');

		if (!this.Map.UseTravelTypes)
			return false;

		if (this.TravelType !== TravelType.Walk)
			return false;

		const Activate = () => {
			this.TravelType = travelType;
			this.layout.TransportEnabled = true;
			if (this.layout.ButtonGridPage === 1) {
				this.layout.EnableButton(3, true);
				this.layout.EnableButton(5, TravelTypeExtensions.CanCampOn(travelType));
			}
		};

		if (this.WindowActive)
			this.CloseWindow(Activate);
		else
			Activate();

		return true;
	}

	ToggleTransport() {
		const x = this.player.Position.X;
		const y = this.player.Position.Y;
		const mapIndex = this.renderMap2D.GetMapFromTile(x, y).Index;
		let [transport, index] = this.GetTransportAtPlayerLocation();

		if (transport == null) {
			if (TravelTypeExtensions.UsesMapObject(this.TravelType)) {
				index = null;
				for (let i = 0; i < this.CurrentSavegame.TransportLocations.length; ++i) {
					if (this.CurrentSavegame.TransportLocations[i] == null) {
						const transportLocation = new TransportLocation();
						transportLocation.MapIndex = mapIndex;
						transportLocation.Position = this.Map.IsWorldMap
							? new Position(x % 50 + 1, y % 50 + 1)
							: new Position(x + 1, y + 1);
						transportLocation.TravelType = this.TravelType;
						this.CurrentSavegame.TransportLocations[i] = transportLocation;
						index = i;
						break;
					}
				}

				if (index != null)
					this.renderMap2D.PlaceTransport(mapIndex, this.Map.IsWorldMap ? x % 50 : x, this.Map.IsWorldMap ? y % 50 : y, this.TravelType, index);
				else
					return;
			} else {
				this.layout.TransportEnabled = false;
				if (this.layout.ButtonGridPage === 1)
					this.layout.EnableButton(3, false);
			}

			const tile = this.renderMap2D.get(this.player.Position);

			if (tile.Type === DataMap.TileType.Water &&
				(!TravelTypeExtensions.UsesMapObject(this.TravelType) ||
				!TravelTypeExtensions.CanStandOn(this.TravelType)))
				this.StartSwimming();
			else
				this.TravelType = TravelType.Walk;

			if (this.layout.ButtonGridPage === 1)
				this.layout.EnableButton(5, TravelTypeExtensions.CanCampOn(this.TravelType));

			this.renderMap2D.TriggerEvents(this.player2D, EventTrigger.Move, x, y, this.MapManager, this.CurrentTicks, this.CurrentSavegame);
		} else if (transport != null && this.TravelType === TravelType.Walk) {
			this.CurrentSavegame.TransportLocations[index] = null;
			this.renderMap2D.RemoveTransport(index);
			this.ActivateTransport(transport.TravelType);
		}
	}

	/**
	 * C#: TransportLocation? GetTransportAtPlayerLocation(out int? index)
	 * Returns [transport, index].
	 */
	GetTransportAtPlayerLocation() {
		let index = null;
		const player = this.player;
		const mapIndex = this.renderMap2D.GetMapFromTile(player.Position.X, player.Position.Y).Index;
		// Note: Savegame stores positions 1-based but we 0-based so increase by 1,1 for tests below.
		const position = this.Map.IsWorldMap
			? new Position(player.Position.X % 50 + 1, player.Position.Y % 50 + 1)
			: new Position(player.Position.X + 1, player.Position.Y + 1);

		for (let i = 0; i < this.CurrentSavegame.TransportLocations.length; ++i) {
			const transport = this.CurrentSavegame.TransportLocations[i];

			if (transport != null) {
				if (transport.MapIndex === mapIndex && Position.op_Equality(transport.Position, position)) {
					index = i;
					return [transport, index];
				}
			}
		}

		return [null, index];
	}

	/**
	 * C#: List<TransportLocation> GetTransportsInVisibleArea(out TransportLocation? transportAtPlayerIndex)
	 * Returns [transports, transportAtPlayerIndex].
	 */
	GetTransportsInVisibleArea() {
		let transportAtPlayerIndex = null;
		const transports = [];

		if (!this.Map.UseTravelTypes)
			return [transports, transportAtPlayerIndex];

		const player = this.player;
		const mapIndex = this.renderMap2D.GetMapFromTile(player.Position.X, player.Position.Y).Index;
		// Note: Savegame stores positions 1-based but we 0-based so increase by 1,1 for tests below.
		const position = this.Map.IsWorldMap
			? new Position(player.Position.X % 50 + 1, player.Position.Y % 50 + 1)
			: new Position(player.Position.X + 1, player.Position.Y + 1);

		for (let i = 0; i < this.CurrentSavegame.TransportLocations.length; ++i) {
			const transport = this.CurrentSavegame.TransportLocations[i];

			if (transport != null && this.renderMap2D.IsMapVisible(transport.MapIndex)) {
				transports.push(transport);

				if (transport.MapIndex === mapIndex && Position.op_Equality(transport.Position, position))
					transportAtPlayerIndex = transport;
			}
		}

		return [transports, transportAtPlayerIndex];
	}

	StartSwimming() {
		this.TravelType = TravelType.Swim;
		this.DoSwimDamage();
	}

	DoSwimDamage(numTicks = 1, finishAction = null) {
		this.lastSwimDamageHour = this.GameTime.Hour;
		this.lastSwimDamageMinute = this.GameTime.Minute;
		this.swamLastTick = true;

		const CalculateDamage = partyMember => {
			const swimSkill = partyMember.Skills[Skill.Swim].TotalCurrentValue;

			if (swimSkill >= 99)
				return 0;

			const factor = Math.trunc((100 - swimSkill) / 2);
			let hitPoints = partyMember.HitPoints.CurrentValue;
			let totalDamage = 0;

			for (let i = 0; i < numTicks; ++i) {
				const damage = Math.max(1, Math.trunc(factor * hitPoints / 100));
				totalDamage += damage;
				hitPoints = toUInt(hitPoints - damage);
			}

			return totalDamage;
		};

		// Make sure the party stops moving after someone died
		finishAction ??= someoneDied => {
			if (someoneDied) {
				this.clickMoveActive = false;
				this.CurrentMobileAction = MobileAction.None;
				this.ResetMoveKeys(true);
			}
		};

		this.DamageAllPartyMembers(CalculateDamage, null, null, finishAction);
	}

	RemoveMapTile(map, x, y, save) {
		const changeTileEvent = new ChangeTileEvent();
		changeTileEvent.Type = EventType.ChangeTile;
		changeTileEvent.Index = 0xffffffff;
		changeTileEvent.FrontTileIndex = 0;
		changeTileEvent.MapIndex = map.Index;
		changeTileEvent.X = x + 1;
		changeTileEvent.Y = y + 1;
		this.UpdateMapTile(changeTileEvent, null, null, save);
	}

	GetMapFrontTileIndex(map, x, y) {
		map ??= this.Map;

		if (map == null)
			return 0;

		if (map.Type === MapType.Map2D)
			return map.Tiles[x][y].FrontTileIndex;

		const tile3D = map.Blocks[x][y];

		if (tile3D.MapBorder)
			return 255;

		if (tile3D.WallIndex !== 0)
			return 100 + tile3D.WallIndex;

		return tile3D.ObjectIndex;
	}

	UpdateMapTile(changeTileEvent, currentX = null, currentY = null, save = true) {
		const sameMap = changeTileEvent.MapIndex === 0 || changeTileEvent.MapIndex === this.Map.Index;
		const map = sameMap ? this.Map : this.MapManager.GetMap(changeTileEvent.MapIndex);
		let x;
		if (changeTileEvent.X === 0) {
			if (currentX == null)
				throw new AmbermoonException(ExceptionScope.Data, 'No change tile position given');
			x = currentX;
		} else
			x = changeTileEvent.X - 1;
		let y;
		if (changeTileEvent.Y === 0) {
			if (currentY == null)
				throw new AmbermoonException(ExceptionScope.Data, 'No change tile position given');
			y = currentY;
		} else
			y = changeTileEvent.Y - 1;

		if (save) {
			// Add it to the savegame as well.
			const changeEvents = this.CurrentSavegame.TileChangeEvents;

			if (!changeEvents.has(map.Index))
				changeEvents.set(map.Index, [changeTileEvent]);
			else {
				const list = changeEvents.get(map.Index);
				const existing = firstOrDefault(list, e => e.X === changeTileEvent.X && e.Y === changeTileEvent.Y);

				if (existing != null) {
					const existingIndex = list.indexOf(existing);
					if (existingIndex >= 0)
						list.splice(existingIndex, 1);
				}

				list.push(changeTileEvent);
			}
		}

		if (!this.changedMaps.includes(map.Index))
			this.changedMaps.push(map.Index);

		if (map.Type === MapType.Map3D) {
			const block = map.Blocks[x][y];
			block.ObjectIndex = changeTileEvent.ObjectIndex;
			block.WallIndex = changeTileEvent.WallIndex;
			block.MapBorder = false;

			if (sameMap)
				this.renderMap3D.UpdateBlock(x, y);
		} else { // 2D
			map.UpdateTile(x, y, changeTileEvent.FrontTileIndex, this.MapManager.GetTilesetForMap(map));

			let visible;
			[visible, x, y] = this.renderMap2D.IsMapVisible(changeTileEvent.MapIndex, x, y);
			if (visible)
				this.renderMap2D.UpdateTile(x, y);
		}

		if (changeTileEvent.Next == null)
			this.ResetMapCharacterInteraction(this.Map);
	}

	SetMapEventBit(mapIndex, eventListIndex, bit) {
		this.CurrentSavegame.SetEventBit(mapIndex, eventListIndex, bit);
	}

	/**
	 * Overloads:
	 * - SetMapCharacterBit(uint mapIndex, uint characterIndex, bool bit)
	 * - SetMapCharacterBit(uint characterBit, bool bit)
	 */
	SetMapCharacterBit(...args) {
		if (args.length === 2) {
			const [characterBit, bit] = args;
			const mapIndex = 1 + Math.trunc(characterBit / 32);
			const characterIndex = characterBit % 32;

			this.SetMapCharacterBit(mapIndex, characterIndex, bit);
			return;
		}

		const [mapIndex, characterIndex, bit] = args;

		this.CurrentSavegame.SetCharacterBit(mapIndex, characterIndex, bit);

		// Note: That might not work for world maps but there are no characters on those maps.
		if (this.Map.Index === mapIndex) {
			if (this.Is3D) {
				this.renderMap3D.UpdateCharacterVisibility(characterIndex);
			} else {
				this.renderMap2D.UpdateCharacterVisibility(characterIndex);
			}
		}
	}

	IsMapCharacterActive(characterBit) {
		const mapIndex = 1 + Math.trunc(characterBit / 32);
		const characterIndex = characterBit % 32;

		return !this.CurrentSavegame.GetCharacterBit(mapIndex, characterIndex);
	}

	UpdateTransportPosition(index) {
		if (!this.is3D && this.Map.UseTravelTypes) {
			const transport = this.CurrentSavegame.TransportLocations[index];
			this.renderMap2D.RemoveTransport(index);
			this.renderMap2D.PlaceTransport(transport.MapIndex, transport.Position.X - 1,
				transport.Position.Y - 1, transport.TravelType, index);
		}
	}

	UpdateOutdoorLight(minutesPassed, lightOff) {
		let lightBuffBurningOut = false;

		if (!this.CurrentSavegame.IsSpellActive(ActiveSpellType.Light) && minutesPassed === 5) {
			let lastHour;

			if (this.GameTime.Minute === 0) { // hour changed
				lastHour = this.GameTime.Hour === 0 ? 23 : this.GameTime.Hour - 1;
			} else {
				lastHour = this.GameTime.Hour;
			}

			const expectedLightIntensity = this.GetDaytimeLightIntensity(lastHour);

			if (this.lightIntensity > expectedLightIntensity)
				lightBuffBurningOut = true;
		}

		const newExpectedLightIntensity = this.GetDaytimeLightIntensity();

		if (lightBuffBurningOut)
			this.lightIntensity = Math.max(newExpectedLightIntensity, this.lightIntensity - 16);
		else
			this.lightIntensity = newExpectedLightIntensity;

		this.UpdateLight(false, false, false, null, lightBuffBurningOut ? this.lightIntensity : null);

		this.renderMap3D?.SetFog(this.Map, this.MapManager.GetLabdataForMap(this.Map), lightOff);
	}

	RenderMap3D_MapChanged(map) {
		this.ResetMoveKeys();
		this.RunSavegameTileChangeEvents(map.Index);
	}

	RenderMap2D_MapChanged(lastMap, maps) {
		if (lastMap == null || !lastMap.IsWorldMap ||
			!maps[0].IsWorldMap || lastMap.World !== maps[0].World)
			this.ResetMoveKeys();

		for (const map of maps)
			this.RunSavegameTileChangeEvents(map.Index);
	}

	Get3DLight() {
		let usedLightIntensity;

		if (hasFlag(this.CurrentPartyMember.Conditions, Condition.Blind))
			return 0.0;

		if (hasFlag(this.Map.Flags, MapFlags.Outdoor)) {
			// This is handled by palette color replacement.
			return 1.0;
		} else if (hasFlag(this.Map.Flags, MapFlags.Indoor)) {
			// Indoor always use full brightness.
			usedLightIntensity = 255;
		} else {
			usedLightIntensity = this.lightIntensity;
		}

		if (usedLightIntensity === 0)
			return 0.0;
		else if (usedLightIntensity === 255)
			return 1.0;

		return usedLightIntensity / 255.0;
	}

	/**
	 * Overloads:
	 * - private uint GetDaytimeLightIntensity()
	 * - private static uint GetDaytimeLightIntensity(uint hour) (also available as static GameCore.GetDaytimeLightIntensity(hour))
	 */
	GetDaytimeLightIntensity(hour) {
		if (arguments.length === 0) {
			hour = this.GameTime.Hour;

			if (this.GameTime.Minute === 60) // this might happen during a minute tick just before the hours are adjusted
				hour = (hour + 1) % 24;
		}

		if (this.renderView?.GameData?.IsAmberstar) {
			// web port: Amberstar day times (day 08-18, dusk 18-20, night 20-06, dawn 06-08) like the sky of the
			// Amberstar cities (AmberstarLightEffectProvider), so 2D and 3D maps get dark at the same time.
			if (hour < 6 || hour >= 20)
				return 32;
			else if (hour < 7 || hour >= 19)
				return 80;
			else if (hour < 8 || hour >= 18)
				return 128;
			return 255;
		}

		return GameCore_MapHandling.GetDaytimeLightIntensity(hour);
	}

	static GetDaytimeLightIntensity(hour) {
		// 17:00-18:59: 128
		// 19:00-19:59: 80
		// 20:00-05:59: 32
		// 06:00-06:59: 80
		// 07:00-07:59: 128
		// 08:00-16:59: 255

		if (hour < 6 || hour >= 20)
			return 32;
		else if (hour < 7)
			return 80;
		else if (hour < 8)
			return 128;
		else if (hour < 17)
			return 255;
		else if (hour < 19)
			return 128;
		else if (hour < 20)
			return 80;
		else
			return 32;
	}

	UpdateLight(mapChange = false, lightActivated = false, playerSwitched = false, map = null,
		customOutdoorLightIntensity = null) {
		map ??= this.Map;

		if (map == null)
			return;

		const ChangeLightRadiusOuter = (lastRadius, newRadius) => {
			const oldMap = map;
			const lightLevel = this.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Light);
			const timePerChange = 75;
			const timeSpan = timePerChange; // TimeSpan in ms

			const ChangeLightRadius = () => {
				if (oldMap !== map || // map changed
					lightLevel !== this.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Light)) // light buff changed
					return;

				const diff = newRadius - lastRadius;

				if (diff !== 0) {
					const change = mapChange || playerSwitched ? diff : Math.sign(diff) * Math.min(Math.abs(diff), 8);
					lastRadius += change;
					this.fow2D.Radius = toByte(lastRadius);
					this.fow2D.Visible = !this.is3D && lastRadius < 112;

					if (newRadius - lastRadius !== 0)
						this.AddTimedEvent(timeSpan, ChangeLightRadius);
				}
			};

			if (mapChange || playerSwitched)
				ChangeLightRadius();
			else
				this.AddTimedEvent(timeSpan, ChangeLightRadius);
		};

		if (this.TravelType === TravelType.Fly) {
			// Full light
			this.lightIntensity = 255;
			this.fow2D.Visible = false;
		} else if (hasFlag(this.CurrentPartyMember.Conditions, Condition.Blind)) {
			this.lightIntensity = 0;

			if (!this.Is3D) {
				this.fow2D.Radius = 0;
				this.fow2D.Visible = true;
			} else {
				this.renderMap3D.HideSky();
			}
		} else if (hasFlag(this.Map.Flags, MapFlags.Outdoor)) {
			// Light is based on daytime and own light sources
			// Each light spell level adds an additional 32.

			if (!this.Is3D || customOutdoorLightIntensity == null) {
				const lastIntensity = this.lightIntensity;

				this.lightIntensity = this.GetDaytimeLightIntensity();
				this.lightIntensity = Math.min(255, this.lightIntensity + this.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Light) * 32);

				if (!this.Is3D && (lastIntensity !== this.lightIntensity || mapChange)) {
					const lastRadius = mapChange ? 0 : (lastIntensity >>> 1);
					const newRadius = (this.lightIntensity >>> 1);
					this.fow2D.Visible = lastIntensity < 224;
					ChangeLightRadiusOuter(lastRadius, newRadius);
				}
			}
		} else if (hasFlag(this.Map.Flags, MapFlags.Indoor)) {
			// Full light
			this.lightIntensity = 255;
			this.fow2D.Visible = false;

			if (this.Is3D)
				this.renderMap3D.HideSky();
		} else { // Dungeon
			// Otherwise light is based on own light sources only.
			if (lightActivated || mapChange || playerSwitched) {
				if (this.Is3D) {
					if (mapChange && !this.CurrentSavegame.IsSpellActive(ActiveSpellType.Light))
						this.lightIntensity = 0;
					else {
						const lightLevel = this.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Light);
						if (lightLevel > 0 || !playerSwitched) {
							this.lightIntensity = Math.min(255, 176 + this.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Light) * 32);
							if (lightLevel === 1)
								this.lightIntensity = Math.min(255, this.lightIntensity + 16);
						}
					}
				} else {
					const lastIntensity = this.lightIntensity;
					this.lightIntensity = this.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Light) * 32;

					if (lastIntensity !== this.lightIntensity) {
						const lastRadius = (lastIntensity >>> 1);
						const newRadius = (this.lightIntensity >>> 1);
						this.fow2D.Visible = lastIntensity < 224;
						ChangeLightRadiusOuter(lastRadius, newRadius);
					}
				}
			} else if (!this.Is3D && this.lightIntensity < 224) {
				this.fow2D.Radius = toByte(this.lightIntensity >>> 1);
				this.fow2D.Visible = true;
			}
			if (this.Is3D) {
				this.fow2D.Visible = false;
				this.renderMap3D.HideSky();
			}
		}

		if (this.Is3D) {
			this.fow2D.Visible = false;
			const light3D = this.Get3DLight();
			this.renderView.SetLight(light3D);
			const lightBuffIntensity = hasFlag(this.Map.Flags, MapFlags.Outdoor)
				? Math.max(0, (customOutdoorLightIntensity ?? this.lightIntensity) - this.GetDaytimeLightIntensity())
				: this.lightIntensity;

			this.renderMap3D.UpdateSky(this.lightEffectProvider, this.GameTime, lightBuffIntensity);
			this.renderMap3D.SetColorLightFactor(light3D);
			this.renderMap3D.SetFog(this.Map, this.MapManager.GetLabdataForMap(this.Map));
		} else { // 2D
			const [, transportAtPlayerIndex] = this.GetTransportsInVisibleArea();

			this.player2D ??= new Player2D(this, this.renderView.GetLayer(Layer.Characters), this.player, this.renderMap2D,
				this.renderView.SpriteFactory, new Position(0, 0), this.MapManager);
			this.player2D.BaselineOffset = !this.CanSee() || transportAtPlayerIndex != null ? MaxBaseLine :
				this.player.MovementAbility > PlayerMovementAbility.Swimming ? 32 : 0;
		}
	}

	OpenMiniMap(finishAction = null) {
		this.CloseWindow(() => {
			this.Pause();
			const layout = this.layout;
			const Map = this.Map;
			const popup = layout.OpenPopup(this.constructor.Map2DViewArea.Position, 11, 9, true, false);
			const contentArea = popup.ContentArea;

			this.CursorType = CursorType.Sword;
			this.TrapMouse(contentArea);

			const numVisibleTilesX = 72; // (11 - 2) * 16 / 2
			const numVisibleTilesY = 56; // (9 - 2) * 16 / 2
			const displayWidth = Map.IsWorldMap ? numVisibleTilesX : Math.min(numVisibleTilesX, Map.Width);
			const displayHeight = Map.IsWorldMap ? numVisibleTilesY : Math.min(numVisibleTilesY, Map.Height);
			const baseX = popup.ContentArea.Position.X + (numVisibleTilesX - displayWidth); // 1 tile = 2 pixel, half of it is 1, it's actually * 1 here
			const baseY = popup.ContentArea.Position.Y + (numVisibleTilesY - displayHeight); // 1 tile = 2 pixel, half of it is 1, it's actually * 1 here
			const backgroundFill = layout.FillArea(popup.ContentArea, Color.Black, 90);
			const filledAreas = [];
			let drawX = baseX;
			let drawY = baseY;

			const rightMap = Map.IsWorldMap ? this.MapManager.GetMap(Map.RightMapIndex) : null;
			const downMap = Map.IsWorldMap ? this.MapManager.GetMap(Map.DownMapIndex) : null;
			const downRightMap = Map.IsWorldMap ? this.MapManager.GetMap(Map.DownRightMapIndex) : null;
			let tileColorProvider = null; // returns { Key: byte, Value: byte? }

			if (this.is3D) {
				const labdata = this.MapManager.GetLabdataForMap(Map);

				tileColorProvider = (map, x, y) => {
					// Note: In original this seems bugged. The map border is drawn in different colors depending on savegame and who knows what.
					// We just skip map border drawing at all by using color index 0 if there is no wall.
					if (map.Blocks[x][y].WallIndex === 0 || map.Blocks[x][y].WallIndex >= labdata.Walls.length)
						return { Key: 0, Value: null };
					else
						return { Key: labdata.Walls[map.Blocks[x][y].WallIndex - 1].ColorIndex, Value: null };
				};
			} else { // 2D
				// Possible adjacent maps should use the same tileset so don't bother to provide 4 tilesets here.
				const tileset = this.MapManager.GetTilesetForMap(Map);

				tileColorProvider = (map, x, y) => {
					const backTileIndex = map.Tiles[x][y].BackTileIndex;
					const frontTileIndex = map.Tiles[x][y].FrontTileIndex;
					const backColorIndex = tileset.Tiles[backTileIndex - 1].ColorIndex;
					const frontColorIndex = frontTileIndex === 0 ? null : tileset.Tiles[frontTileIndex - 1].ColorIndex;

					return { Key: backColorIndex, Value: frontColorIndex };
				};
			}
			const DrawTile = (map, x, y) => {
				const visible = popup.ContentArea.Contains(drawX + 1, drawY + 1);
				const tileColors = tileColorProvider(map, x, y);
				const backArea = layout.FillArea(new Rect(drawX, drawY, 2, 2),
					this.GetPaletteColor(map.PaletteIndex, this.renderView.GraphicInfoProvider.PaletteIndexFromColorIndex(map, tileColors.Key)), 100);
				filledAreas.push(backArea);
				backArea.Visible = visible;

				if (tileColors.Value != null) {
					const color = this.GetPaletteColor(map.PaletteIndex, this.renderView.GraphicInfoProvider.PaletteIndexFromColorIndex(map, tileColors.Value));
					const upperRightArea = layout.FillArea(new Rect(drawX + 1, drawY, 1, 1), color, 110);
					const lowerLeftArea = layout.FillArea(new Rect(drawX, drawY + 1, 1, 1), color, 110);

					filledAreas.push(upperRightArea);
					filledAreas.push(lowerLeftArea);

					upperRightArea.Visible = visible;
					lowerLeftArea.Visible = visible;
				}
			};
			for (let y = 0; y < Map.Height; ++y) {
				drawX = baseX;

				for (let x = 0; x < Map.Width; ++x) {
					DrawTile(Map, x, y);
					drawX += 2;
				}

				if (rightMap != null) {
					for (let x = 0; x < rightMap.Width; ++x) {
						DrawTile(rightMap, x, y);
						drawX += 2;
					}
				}

				drawY += 2;
			}
			if (downMap != null) {
				for (let y = 0; y < downMap.Height; ++y) {
					drawX = baseX;

					for (let x = 0; x < downMap.Width; ++x) {
						DrawTile(downMap, x, y);
						drawX += 2;
					}

					if (downRightMap != null) {
						for (let x = 0; x < downRightMap.Width; ++x) {
							DrawTile(downRightMap, x, y);
							drawX += 2;
						}
					}

					drawY += 2;
				}
			}
			let closed = false;
			// 16x10 pixels per frame, stored as one image of 16x40 pixels
			// The real position inside each frame has an offset of 7,4
			const positionMarkerGraphicIndex = Graphics.GetUIGraphicIndex(UIGraphic.PlusBlinkAnimation);
			const positionMarker = popup.AddImage(new Rect(baseX + this.player.Position.X * 2 - 7, baseY + this.player.Position.Y * 2 - 4, 16, 10),
				positionMarkerGraphicIndex, Layer.UI, 120, this.UIPaletteIndex);
			positionMarker.ClipArea = contentArea;
			const positionMarkerBaseTextureOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.UI).GetOffset(positionMarkerGraphicIndex);
			let positionMarkerFrame = 0;
			const AnimatePosition = () => {
				if (!closed) {
					const textureFactor = Math.trunc(positionMarker.Layer?.TextureFactor ?? 1);
					positionMarker.TextureAtlasOffset = Position.op_Addition(positionMarkerBaseTextureOffset, new Position(0, positionMarkerFrame * textureFactor));
					positionMarkerFrame = (positionMarkerFrame + 1) % 4; // 4 frames in total
					this.AddTimedEvent(75, AnimatePosition);
				}
			};
			AnimatePosition();
			popup.Closed.add(() => {
				closed = true;
				positionMarker.Delete();
				backgroundFill.Destroy();
				filledAreas.forEach(area => area.Destroy());
				this.UntrapMouse();
				this.Resume();
				finishAction?.();
			});
			this.nextClickHandler = buttons => {
				if (buttons === MouseButtons.Right) {
					this.ClosePopup();
					return true;
				}

				return false;
			};
			if (Map.IsWorldMap) {
				// Only world maps can be scrolled.
				// We assume that every map has a size of 50x50.
				// Each scrolling will scroll at least 4 tiles.
				const tilesPerScroll = 4;
				const maxScrollX = Math.trunc((100 - numVisibleTilesX) / tilesPerScroll); // 7
				const maxScrollY = Math.trunc((100 - numVisibleTilesY) / tilesPerScroll); // 11
				let scrollOffsetX = 0; // in 4 pixel chunks
				let scrollOffsetY = 0; // in 4 pixel chunks

				const Scroll = (x, y) => {
					const newX = Util.Limit(0, scrollOffsetX + x, maxScrollX);
					const newY = Util.Limit(0, scrollOffsetY + y, maxScrollY);

					if (scrollOffsetX !== newX || scrollOffsetY !== newY) {
						const diffX = (newX - scrollOffsetX) * tilesPerScroll;
						const diffY = (newY - scrollOffsetY) * tilesPerScroll;
						scrollOffsetX = newX;
						scrollOffsetY = newY;
						const diff = new Position(diffX, diffY);

						for (const area of filledAreas) {
							if (area?.Position != null) {
								area.Position = Position.op_Subtraction(area.Position, diff);
								area.Visible = contentArea.Contains(area.Position.X + 1, area.Position.Y + 1);
							}
						}

						positionMarker.X -= diffX;
						positionMarker.Y -= diffY;
					}
				};

				const CheckScroll = () => {
					if (!closed) {
						this.AddTimedEvent(50, () => {
							if (this.InputEnable) {
								const position = this.renderView.ScreenToGame(this.GetMousePosition(this.lastMousePosition));
								const x = position.X < contentArea.Left + 4 ? -1 : position.X > contentArea.Right - 4 ? 1 : 0;
								const y = position.Y < contentArea.Top + 4 ? -1 : position.Y > contentArea.Bottom - 4 ? 1 : 0;

								if (x !== 0 || y !== 0)
									Scroll(x, y);
							}

							CheckScroll();
						});
					}
				};

				CheckScroll();
			}
		});
	}

	/**
	 * Overloads:
	 * - internal void ShowAutomap()
	 * - internal void ShowAutomap(AutomapOptions automapOptions, Action? finishAction = null)
	 */
	ShowAutomap(automapOptions, finishAction = null) {
		if (arguments.length === 0) {
			if (!hasFlag(this.Map.Flags, MapFlags.Automapper)) {
				this.ShowMessagePopup(this.DataNameProvider.AutomapperNotWorkingHere);
				return;
			}

			const showAll = this.CurrentSavegame.IsSpellActive(ActiveSpellType.MysticMap);

			const options = new AutomapOptions();
			options.SecretDoorsVisible = showAll;
			options.MonstersVisible = showAll;
			options.PersonsVisible = showAll;
			options.TrapsVisible = showAll;
			options.ShowGotoPoints = true;
			this.ShowAutomap(options);
			return;
		}

		this.ShowAutomapWithOptions(automapOptions, finishAction);
	}

	/** Port helper: C# internal void ShowAutomap(AutomapOptions automapOptions, Action? finishAction = null) */
	ShowAutomapWithOptions(automapOptions, finishAction = null) {
		this.mobileAutomapScroll.X = 0;
		this.mobileAutomapScroll.Y = 0;

		const Create = () => {
			this.Fade(() => {
				const layout = this.layout;
				const renderView = this.renderView;
				const DataNameProvider = this.DataNameProvider;
				// Note: Each tile is displayed as 8x8.
				//       The automap type icons are 16x16 but the lower-left 8x8 area is placed on a tile.
				//       The player pin is 16x32 at the lower-left 8x8 is placed on the tile.
				//       Each horizontal map background tile is 16 pixels wide and can contain 2 map tiles/blocks.
				//       Each vertical map background tile is 32 pixels height and can contain 4 map tiles/blocks.
				//       Fill inner map area with AA7744 (index 6). Lines (like walls) are drawn with 663300 (index 7).
				const paletteIndex = toByte(renderView.GraphicInfoProvider.AutomapPaletteIndex - 1);
				const backgroundColor = this.GetPaletteColor(renderView.GraphicInfoProvider.AutomapPaletteIndex, 6);
				const foregroundColor = this.GetPaletteColor(renderView.GraphicInfoProvider.AutomapPaletteIndex, 7); // eslint-disable-line no-unused-vars
				const labdata = this.MapManager.GetLabdataForMap(this.Map);
				let legendPage = 0;
				const legendSprites = new Array(8).fill(null);
				const legendTexts = new Array(8).fill(null);
				const textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.UI);
				let scrollOffsetX = 0; // in 16 pixel chunks
				let scrollOffsetY = 0; // in 16 pixel chunks

				this.InputEnable = true;
				this.ShowMap(false);
				this.SetWindow(Window.Automap, automapOptions);
				layout.Reset();
				layout.SetLayout(LayoutType.Automap);
				this.ResetMoveKeys(true);
				this.CursorType = CursorType.Sword;

				const Map = this.Map;
				const sprites = [];
				const animatedSprites = [];
				// key = tile index, value = tileX, tileY, drawX, drawY, boolean -> true = normal blocking wall, false = fake wall, null = count as wall but has automap graphic on it
				const walls = new globalThis.Map();
				const gotoPoints = []; // KeyValuePair<Map.GotoPoint, Tooltip> -> { Key, Value }
				const automapIcons = new globalThis.Map();
				let animationsPaused = false;
				let closed = false;

				// #region Legend
				layout.FillArea(new Rect(208, 37, Global.VirtualScreenWidth - 208, Global.VirtualScreenHeight - 37), Color.Black, 9);
				// Legend panels
				const headerArea = new Rect(217, 46, 86, 8);
				layout.AddPanel(headerArea, 11);
				layout.AddText(headerArea.CreateModified(0, 1, 0, -1), DataNameProvider.LegendHeader, TextColor.White, TextAlign.Center, 15);
				const legendArea = new Rect(217, 56, 86, 108);
				layout.AddPanel(legendArea, 11);
				for (let i = 0; i < 8; ++i) {
					legendSprites[i] = layout.AddSprite(new Rect(legendArea.X + 2, legendArea.Y + 4 + i * 13 + Global.GlyphLineHeight - 16, 16, 16),
						0, paletteIndex, toByte(15 + i));
					legendTexts[i] = layout.AddText(new Rect(legendArea.X + 18, legendArea.Y + 4 + i * 13, 68, Global.GlyphLineHeight), '',
						TextColor.White, TextAlign.Left, 15);
				}
				const ShowLegendPage = page => {
					legendPage = page;

					this.AddTimedEvent(4000, ToggleLegendPage);

					const SetLegendEntry = (index, automapType) => {
						if (automapType == null) {
							legendSprites[index].Visible = false;
							legendTexts[index].Visible = false;
						} else {
							legendSprites[index].TextureAtlasOffset = textureAtlas.GetOffset(Graphics.GetAutomapGraphicIndex(AutomapExtensions.ToGraphic(automapType)));
							legendTexts[index].SetText(renderView.TextProcessor.CreateText(DataNameProvider.GetAutomapName(automapType)));
							legendSprites[index].Visible = true;
							legendTexts[index].Visible = true;
						}
					};

					if (page === 0) {
						SetLegendEntry(0, AutomapType.Riddlemouth);
						SetLegendEntry(1, AutomapType.Teleporter);
						SetLegendEntry(2, AutomapType.Door);
						SetLegendEntry(3, AutomapType.Chest);
						if (automapOptions.TrapsVisible) {
							SetLegendEntry(4, AutomapType.Spinner);
							SetLegendEntry(5, AutomapType.Merchant);
							SetLegendEntry(6, AutomapType.Tavern);
							SetLegendEntry(7, AutomapType.Special);
						} else {
							SetLegendEntry(4, AutomapType.Merchant);
							SetLegendEntry(5, AutomapType.Tavern);
							SetLegendEntry(6, AutomapType.Special);
							SetLegendEntry(7, null);
						}
					} else {
						SetLegendEntry(0, AutomapType.Exit);
						SetLegendEntry(1, AutomapType.Pile);
						let index = 2;
						if (automapOptions.TrapsVisible) {
							SetLegendEntry(2, AutomapType.Trap);
							SetLegendEntry(3, AutomapType.Trapdoor);
							index = 4;
						}
						if (automapOptions.MonstersVisible) {
							SetLegendEntry(index++, AutomapType.Monster);
						}
						if (automapOptions.PersonsVisible) {
							SetLegendEntry(index++, AutomapType.Person);
						}
						SetLegendEntry(index++, AutomapType.GotoPoint);
						while (index < 8)
							SetLegendEntry(index++, null);
					}
				};
				const ToggleLegendPage = () => {
					if (this.CurrentWindow.Window === Window.Automap)
						ShowLegendPage(1 - legendPage);
				};
				ShowLegendPage(0);
				const DrawPin = (x, y, upperDisplayLayer, lowerDisplayLayer, onMap) => {
					const pinHead = !this.CurrentSavegame.IsSpecialItemActive(SpecialItemPurpose.Compass)
						? AutomapGraphic.PinUpperHalf
						: AutomapGraphic.PinDirectionUp + this.player3D.PreciseDirection;
					const upperSprite = layout.AddSprite(new Rect(x, y, 16, 16), Graphics.GetAutomapGraphicIndex(pinHead), paletteIndex, upperDisplayLayer);
					const lowerSprite = layout.AddSprite(new Rect(x, y + 16, 16, 16), Graphics.GetAutomapGraphicIndex(AutomapGraphic.PinLowerHalf), paletteIndex, lowerDisplayLayer);

					if (onMap) {
						upperSprite.ClipArea = Global.AutomapArea;
						lowerSprite.ClipArea = Global.AutomapArea;
						sprites.push(upperSprite);
						sprites.push(lowerSprite);
					}
				};
				const locationArea = new Rect(217, 166, 86, 22);
				layout.AddPanel(locationArea, 11);
				if (this.CurrentSavegame.IsSpecialItemActive(SpecialItemPurpose.MapLocation)) {
					layout.AddText(new Rect(locationArea.X + 2, locationArea.Y + 3, 70, Global.GlyphLineHeight), DataNameProvider.Location, TextColor.White, TextAlign.Left, 15);
					layout.AddText(new Rect(locationArea.X + 2, locationArea.Y + 12, 70, Global.GlyphLineHeight), `X:${String(this.player3D.Position.X + 1).padEnd(2, ' ')} Y:${this.player3D.Position.Y + 1}`, TextColor.White, TextAlign.Left, 15);
				}
				DrawPin(locationArea.Right - 16, locationArea.Bottom - 32, 16, 16, false);
				// #endregion

				// #region Map
				const [hasAutomap, a] = tryGetValue(this.CurrentSavegame.Automaps, Map.Index);
				const automap = hasAutomap ? a : null;

				const displayLayers = new globalThis.Map();
				displayLayers.set(this.RenderPlayer.Position.X + this.RenderPlayer.Position.Y * Map.Width, 100);
				const AddGraphic = (x, y, automapGraphic, width, height, displayLayer = 2) => {
					let sprite;

					switch (automapGraphic) {
						case AutomapGraphic.Riddlemouth:
						case AutomapGraphic.Teleport:
						case AutomapGraphic.Spinner:
						case AutomapGraphic.Trap:
						case AutomapGraphic.TrapDoor:
						case AutomapGraphic.Special:
						case AutomapGraphic.Monster: // this and all above have 4 frames
						case AutomapGraphic.GotoPoint: // this has 8 frames
						{
							const animatedSprite = layout.AddAnimatedSprite(new Rect(x, y, width, height), Graphics.GetAutomapGraphicIndex(automapGraphic),
								paletteIndex, automapGraphic === AutomapGraphic.GotoPoint ? 8 : 4, displayLayer);
							animatedSprites.push(animatedSprite);
							sprite = animatedSprite;
							break;
						}
						default:
							sprite = layout.AddSprite(new Rect(x, y, width, height), Graphics.GetAutomapGraphicIndex(automapGraphic), paletteIndex, displayLayer);
							break;
					}

					sprite.ClipArea = Global.AutomapArea;
					sprites.push(sprite);
					return sprite;
				};
				const AddAutomapType = (tx, ty, x, y, automapType,
					displayLayer = 5) => { // 5: above walls, fake wall overlays and player pin lower half (2, 3 and 4)
					if (!automapOptions.TrapsVisible && (automapType === AutomapType.Trap ||
						automapType === AutomapType.Trapdoor || automapType === AutomapType.Spinner))
						return;

					const baseDisplayLayer = displayLayer; // eslint-disable-line no-unused-vars
					const graphic = AutomapExtensions.ToGraphic(automapType);

					if (graphic != null) {
						if (tx > 0) {
							if (displayLayers.has(tx - 1 + ty * Map.Width))
								displayLayer = toByte(Math.min(255, displayLayers.get(tx - 1 + ty * Map.Width) + 1));
							else if (ty > 0) {
								if (tx < Map.Width - 1 && displayLayers.has(tx + 1 + (ty - 1) * Map.Width))
									displayLayer = toByte(Math.min(255, displayLayers.get(tx + 1 + (ty - 1) * Map.Width) + 1));
								else if (displayLayers.has(tx + (ty - 1) * Map.Width))
									displayLayer = toByte(Math.min(255, displayLayers.get(tx + (ty - 1) * Map.Width) + 1));
								else if (tx > 0 && displayLayers.has(tx - 1 + (ty - 1) * Map.Width))
									displayLayer = toByte(Math.min(255, displayLayers.get(tx - 1 + (ty - 1) * Map.Width) + 1));
							}
						} else if (ty > 0) {
							if (tx < Map.Width - 1 && displayLayers.has(tx + 1 + (ty - 1) * Map.Width))
								displayLayer = toByte(Math.min(255, displayLayers.get(tx + 1 + (ty - 1) * Map.Width) + 1));
							else if (displayLayers.has(tx + (ty - 1) * Map.Width))
								displayLayer = toByte(Math.min(255, displayLayers.get(tx + (ty - 1) * Map.Width) + 1));
						}

						const tileIndex = tx + ty * Map.Width;

						if (automapIcons.has(tileIndex)) {
							// Already an automap icon there -> remove it
							automapIcons.get(tileIndex)?.Delete();
						}

						automapIcons.set(tileIndex, AddGraphic(x, y - 8, graphic, 16, 16, displayLayer));
						if (!displayLayers.has(tileIndex) || displayLayers.get(tileIndex) < displayLayer)
							displayLayers.set(tileIndex, displayLayer);
					}
				};
				const AddTile = (tx, ty, x, y) => {
					let [, automapType] = this.renderMap3D.CharacterTypeFromBlock(tx, ty);

					if (automapType === AutomapType.None)
						automapType = this.renderMap3D.AutomapTypeFromBlock(tx, ty);

					if (automapType === AutomapType.Monster) {
						if (automapOptions.MonstersVisible)
							AddAutomapType(tx, ty, x, y, AutomapType.Monster, 6);
					} else if (automapType === AutomapType.Person) {
						if (automapOptions.PersonsVisible)
							AddAutomapType(tx, ty, x, y, AutomapType.Person, 6);
					}

					if (automap != null && !automap.IsBlockExplored(Map, tx, ty))
						return;

					// Note: Maps are always 3D
					const block = Map.Blocks[tx][ty];

					if (block.MapBorder) {
						// draw nothing
						return;
					}
					if (automapOptions.ShowGotoPoints) {
						const gotoPoint = firstOrDefault(Map.GotoPoints, p => p.X === tx + 1 && p.Y === ty + 1); // positions of goto points are 1-based
						if (gotoPoint != null && this.CurrentSavegame.IsGotoPointActive(gotoPoint.Index)) {
							AddAutomapType(tx, ty, x, y, AutomapType.GotoPoint);
							gotoPoints.push({ Key: gotoPoint,
								Value: layout.AddTooltip(new Rect(x, y, 8, 8), gotoPoint.Name, TextColor.White) });
						}
					}
					if (automapType !== AutomapType.None && automapType !== AutomapType.Monster && automapType !== AutomapType.Person)
						AddAutomapType(tx, ty, x, y, automapType);
					if (block.WallIndex !== 0 && block.WallIndex <= labdata.Walls.length) {
						const wall = labdata.Walls[block.WallIndex - 1];
						const blockingWall = block.BlocksPlayer(labdata);

						// Walls that don't block and use transparency are not considered walls
						// nor fake walls. For example a destroyed cobweb uses this.
						// Fake walls on the other hand won't block but are not transparent.
						if (wall.AutomapType === AutomapType.Wall || blockingWall || !hasFlag(wall.Flags, Tileset.TileFlags.Transparency)) {
							const draw = automapType === AutomapType.None || wall.AutomapType === AutomapType.Wall ||
								automapType === AutomapType.Tavern || automapType === AutomapType.Merchant || automapType === AutomapType.Door;

							const key = tx + ty * Map.Width;
							if (walls.has(key))
								throw new Error('An item with the same key has already been added.');
							const automapWall = new AutomapWall();
							automapWall.TileX = tx;
							automapWall.TileY = ty;
							automapWall.DrawX = x;
							automapWall.DrawY = y;
							automapWall.NormalWall = draw ? blockingWall : null;
							automapWall.BlocksSight = hasFlag(wall.Flags, Tileset.TileFlags.BlockSight);
							walls.set(key, automapWall);
						}
					}
				};

				let x = Global.AutomapArea.X;
				let y = Global.AutomapArea.Y;
				const xParts = Math.trunc((Map.Width + 1) / 2);
				const yParts = Math.trunc((Map.Height + 3) / 4);
				const totalArea = new Rect(Global.AutomapArea.X, Global.AutomapArea.Y, 64 + xParts * 16, 64 + yParts * 32);
				const mapNameBounds = new Rect(Global.AutomapArea.X, Global.AutomapArea.Y + 32, totalArea.Width, Global.GlyphLineHeight);
				const mapName = layout.AddText(mapNameBounds, Map.Name, TextColor.White, TextAlign.Center, 3);

				// Fill background black
				layout.FillArea(Global.AutomapArea, Color.Black, 0);

				// #region Upper border
				AddGraphic(x, y, AutomapGraphic.MapUpperLeft, 32, 32);
				x += 32;
				for (let tx = 0; tx < xParts; ++tx) {
					AddGraphic(x, y, AutomapGraphic.MapBorderTop1 + tx % 4, 16, 32);
					x += 16;
				}
				AddGraphic(x, y, AutomapGraphic.MapUpperRight, 32, 32);
				x = Global.AutomapArea.X;
				y += 32;
				// #endregion

				// #region Map content
				let mapFill = null;

				const FillMap = () => {
					mapFill?.Destroy();
					const fillArea = new Rect(Global.AutomapArea.X + 32 - scrollOffsetX * 16, Global.AutomapArea.Y + 32 - scrollOffsetY * 16, xParts * 16, yParts * 32);
					let clipArea = new Rect(Global.AutomapArea);
					const maxScrollX = Math.trunc((totalArea.Width - 208) / 16);
					const maxScrollY = Math.trunc((totalArea.Height - 160) / 16);
					if (scrollOffsetX >= maxScrollX - 1)
						clipArea = clipArea.SetWidth(clipArea.Width - (2 - (maxScrollX - scrollOffsetX)) * 16);
					if (scrollOffsetY >= maxScrollY - 1)
						clipArea = clipArea.SetHeight(clipArea.Height - (2 - (maxScrollY - scrollOffsetY)) * 16);
					fillArea.Clip(clipArea);
					mapFill = layout.FillArea(fillArea, backgroundColor, 1);
				};
				FillMap();
				for (let ty = 0; ty < Map.Height; ++ty) {
					if (ty % 4 === 0) {
						AddGraphic(Global.AutomapArea.X, y, AutomapGraphic.MapBorderLeft1 + Math.trunc((ty % 8) / 4), 32, 32);
					}

					x = Global.AutomapArea.X + 32;

					for (let tx = 0; tx < Map.Width; ++tx) {
						AddTile(tx, ty, x, y);
						x += 8;
					}

					if (ty % 4 === 0) {
						if (Map.Width % 2 !== 0)
							x += 8;
						AddGraphic(x, y, AutomapGraphic.MapBorderRight1 + Math.trunc((ty % 8) / 4), 32, 32);
					}

					y += 8;
				}
				// Draw walls
				for (const [, wallValue] of walls) {
					const tx = wallValue.TileX;
					const ty = wallValue.TileY;
					const dx = wallValue.DrawX;
					const dy = wallValue.DrawY;
					const type = wallValue.NormalWall;
					const blocksSight = wallValue.BlocksSight;

					if (type != null) {
						// returns [bool, otherWall]
						const ContainsSameWall = (x, y) => {
							let otherWall = false;

							const [found, wall] = tryGetValue(walls, x + y * Map.Width);
							if (!found)
								return [false, otherWall];

							// Note: This is used to detect if walls should be
							// merged visually. There are some special walls that
							// have a different block sight state (e.g. the crystal
							// wall in the temple of brotherhood).
							// Those should be treated as "another" wall so we will
							// return false here if the block sight states do not match.
							otherWall = blocksSight !== wall.BlocksSight;

							return [!otherWall || wall.NormalWall == null, otherWall];
						};

						let hasOtherWallLeft = false;
						let hasOtherWallUp = false;
						let hasOtherWallRight = false;
						let hasOtherWallDown = false;
						let hasWallLeft = false;
						let hasWallUp = false;
						let hasWallRight = false;
						let hasWallDown = false;
						if (tx > 0)
							[hasWallLeft, hasOtherWallLeft] = ContainsSameWall(tx - 1, ty);
						if (ty > 0)
							[hasWallUp, hasOtherWallUp] = ContainsSameWall(tx, ty - 1);
						if (tx < Map.Width - 1)
							[hasWallRight, hasOtherWallRight] = ContainsSameWall(tx + 1, ty);
						if (ty < Map.Height - 1)
							[hasWallDown, hasOtherWallDown] = ContainsSameWall(tx, ty + 1);
						let wallGraphicType = 15; // closed

						if (hasWallLeft) {
							if (hasWallRight) {
								if (hasWallUp) {
									if (hasWallDown) {
										// all directions open (+ crossing)
										wallGraphicType = 12;
									} else {
										// left, right and top open (T crossing)
										wallGraphicType = 8;
									}
								} else if (hasWallDown) {
									// left, right and bottom open (T crossing)
									wallGraphicType = 10;
								} else {
									// left and right open
									wallGraphicType = 14;
								}
							} else {
								if (hasWallUp) {
									if (hasWallDown) {
										// left, top and bottom open (T crossing)
										wallGraphicType = 11;
									} else {
										// left and top open (corner)
										wallGraphicType = 7;
									}
								} else if (hasWallDown) {
									// left and bottom open (corner)
									wallGraphicType = 5;
								} else {
									// only left open
									wallGraphicType = 3;
								}
							}
						} else if (hasWallRight) {
							if (hasWallUp) {
								if (hasWallDown) {
									// right, top and bottom open (T crossing)
									wallGraphicType = 9;
								} else {
									// right and top open
									wallGraphicType = 6;
								}
							} else if (hasWallDown) {
								// right and bottom open (corner)
								wallGraphicType = 4;
							} else {
								// only right open
								wallGraphicType = 1;
							}
						} else {
							if (hasWallUp) {
								if (hasWallDown) {
									// top and bottom open
									wallGraphicType = 13;
								} else {
									// only top open
									wallGraphicType = 0;
								}
							} else if (hasWallDown) {
								// only bottom open
								wallGraphicType = 2;
							} else {
								if (hasOtherWallLeft || hasOtherWallRight) {
									// left and right open
									wallGraphicType = 14;
								} else if (hasOtherWallUp || hasOtherWallDown) {
									// top and bottom open
									wallGraphicType = 13;
								} else {
									// closed single wall
									wallGraphicType = 15;
								}
							}
						}

						let sprite = layout.AddSprite(new Rect(dx, dy, 8, 8), Graphics.GetCustomUIGraphicIndex(UICustomGraphic.AutomapWallFrames), paletteIndex, 2);
						const textureFactor = Math.trunc(renderView.GetLayer(Layer.UI).TextureFactor);
						sprite.TextureAtlasOffset = new Position(sprite.TextureAtlasOffset.X + wallGraphicType * 8 * textureFactor, sprite.TextureAtlasOffset.Y);
						sprite.ClipArea = Global.AutomapArea;
						sprites.push(sprite);

						if (type === false && automapOptions.SecretDoorsVisible) { // fake wall
							sprite = layout.AddSprite(new Rect(dx, dy, 8, 8), Graphics.GetCustomUIGraphicIndex(UICustomGraphic.FakeWallOverlay), paletteIndex, 3);
							sprite.ClipArea = Global.AutomapArea;
							sprites.push(sprite);
						}
					}
				}
				// Animate automap icons
				const Animate = () => {
					if (this.CurrentWindow.Window === Window.Automap && !animationsPaused) {
						for (const animatedSprite of animatedSprites)
							++animatedSprite.CurrentFrame;

						this.AddTimedEvent(120, Animate);
					}
				};
				Animate();
				// Draw player pin
				DrawPin(Global.AutomapArea.X + 32 + this.RenderPlayer.Position.X * 8, Global.AutomapArea.Y + 32 + this.RenderPlayer.Position.Y * 8 - 24, 100, 100, true);
				// #endregion

				// #region Lower border
				x = Global.AutomapArea.X;
				while ((y - Global.AutomapArea.Y) % 32 !== 0)
					y += 8;
				AddGraphic(x, y, AutomapGraphic.MapLowerLeft, 32, 32);
				x += 32;
				for (let tx = 0; tx < xParts; ++tx) {
					AddGraphic(x, y, AutomapGraphic.MapBorderBottom1 + tx % 4, 16, 32);
					x += 16;
				}
				AddGraphic(x, y, AutomapGraphic.MapLowerRight, 32, 32);
				// #endregion

				// #region Mobile goto point reveal
				let gotoPointInfoArea = new Rect();
				let gotoPointInfoActive = false;
				let eyeHighlight = null;
				if (this.CoreConfiguration.IsMobile && gotoPoints.length > 0) {
					const text = layout.AddText(new Rect(20, 200 - 16 + 3, 300, 7), DataNameProvider.GetAutomapName(AutomapType.GotoPoint), TextColor.White, TextAlign.Left, 25);
					gotoPointInfoArea = new Rect(0, 178, 20 + text.Area.Width + 2, 22);
					layout.AddPanel(gotoPointInfoArea, 15);
					layout.AddSprite(new Rect(2, 200 - 16 - 2, 16, 16), CursorType.Eye, 0, 30, null, null, Layer.Cursor, true);
					eyeHighlight = layout.FillArea(gotoPointInfoArea.CreateModified(1, 1, -2, -2), new Color(99, 44, 44), 18);
					eyeHighlight.Visible = false;
				}
				// #endregion

				const Scroll = (x, y) => {
					// The automap screen is 208x163 but we use 208x160 so they are both dividable by 16.
					// If scrolled to the left there is the 32 pixel wide border so you can see max 22 tiles (208 - 32) / 8 = 22.
					// Scrolling right is possible unless the 32 pixel wide border on the right is fully visible.
					// The total automap width is 64 + xParts * 16. So max scroll offset X in tiles is (64 + xParts * 16 - 208) / 16.
					// We will always scroll by 2 tiles (16 pixel chunks) in both directions.

					const maxScrollX = Math.trunc((totalArea.Width - 208) / 16);
					const maxScrollY = Math.trunc((totalArea.Height - 160) / 16);
					const newX = Util.Limit(0, scrollOffsetX + x, maxScrollX);
					const newY = Util.Limit(0, scrollOffsetY + y, maxScrollY);

					if (scrollOffsetX !== newX || scrollOffsetY !== newY) {
						const diffX = (newX - scrollOffsetX) * 16;
						const diffY = (newY - scrollOffsetY) * 16;
						scrollOffsetX = newX;
						scrollOffsetY = newY;

						mapName.SetBounds(mapNameBounds.CreateOffset(-newX * 16, -newY * 16));
						mapName.Clip(Global.AutomapArea);
						FillMap();

						for (const sprite of sprites) {
							sprite.X -= diffX;
							sprite.Y -= diffY;
						}

						for (const gotoPoint of gotoPoints) {
							gotoPoint.Value.Area.Position.X -= diffX;
							gotoPoint.Value.Area.Position.Y -= diffY;
						}

						// Update active tooltips
						const cursorType = CursorType.None;
						layout.Hover(this.GetMousePosition(this.lastMousePosition), cursorType);
					}
				};

				const Exit = (followAction = null) => {
					const exitAction = finishAction == null ? followAction : () => {
						followAction?.();
						finishAction();
					};

					closed = true;
					this.UntrapMouse();
					if (this.currentWindow.Window === Window.Automap)
						this.CloseWindow(exitAction);
					else
						exitAction?.();
				};

				const SetupClickHandlers = () => {
					this.nextClickHandler = buttons => {
						if (buttons === MouseButtons.Right) {
							Exit();
							return true;
						} else if (buttons === MouseButtons.Left && gotoPoints.length !== 0) {
							const mousePosition = renderView.ScreenToGame(this.GetMousePosition(this.lastMousePosition));

							if (gotoPointInfoArea.Contains(mousePosition)) {
								gotoPointInfoActive = !gotoPointInfoActive;
								eyeHighlight.Visible = gotoPointInfoActive;
								this.ExecuteNextUpdateCycle(SetupClickHandlers);
								return true;
							} else if (gotoPointInfoActive) {
								this.ExecuteNextUpdateCycle(SetupClickHandlers);
								return false;
							}

							const noGotoPoint = { Key: null, Value: null };
							let clickedGotoPoint = firstOrDefault(gotoPoints, gotoPoint => gotoPoint.Value.Area.Contains(mousePosition), noGotoPoint);

							// Be a bit more forgiving on mobile devices if they not exactly hit the small circle
							if (clickedGotoPoint.Key == null && this.CoreConfiguration.IsMobile)
								clickedGotoPoint = firstOrDefault(gotoPoints, gotoPoint => gotoPoint.Value.Area.CreateModified(-6, -6, 12, 12).Contains(mousePosition), noGotoPoint);

							if (clickedGotoPoint.Key != null) {
								const AbortGoto = () => {
									animationsPaused = false;
									Animate();
									this.TrapMouse(Global.AutomapArea);
									SetupClickHandlers();
								};

								layout.HideTooltip();
								this.UntrapMouse();
								animationsPaused = true;
								if (!this.CanSee()) {
									this.ShowMessagePopup(DataNameProvider.DarkDontFindWayBack, AbortGoto, TextAlign.Left, 202);
								} else if (this.MonsterSeesPlayer) {
									this.ShowMessagePopup(DataNameProvider.WayBackTooDangerous, AbortGoto, TextAlign.Left, 202);
								} else {
									this.ShowDecisionPopup(DataNameProvider.ReallyWantToGoThere, response => {
										if (response === PopupTextEvent.Response.Yes) {
											if (this.player3D.Position.X + 1 === clickedGotoPoint.Key.X && this.player3D.Position.Y + 1 === clickedGotoPoint.Key.Y) {
												this.ShowMessagePopup(DataNameProvider.AlreadyAtGotoPoint, AbortGoto, TextAlign.Center, 202);
											} else {
												Exit(() => {
													const xDiff = Math.abs(clickedGotoPoint.Key.X - (this.player3D.Position.X + 1));
													const yDiff = Math.abs(clickedGotoPoint.Key.Y - (this.player3D.Position.Y + 1));
													const ticks = toUInt(Util.Round((xDiff + yDiff) * 0.2));
													this.GameTime.Ticks(ticks);
													this.TeleportTo(Map.Index, clickedGotoPoint.Key.X, clickedGotoPoint.Key.Y, clickedGotoPoint.Key.Direction, true);
												});
											}
										} else {
											AbortGoto();
										}
									}, 1, 202, TextAlign.Center);
								}
								return true;
							}
						}

						return false;
					};
				};
				SetupClickHandlers();

				const CheckScroll = () => {
					if (!closed) {
						this.AddTimedEvent(100, () => {
							if (this.InputEnable) {
								if (this.CoreConfiguration.IsMobile) {
									const x = Util.Round(this.mobileAutomapScroll.X);
									const y = Util.Round(this.mobileAutomapScroll.Y);

									if (x !== 0 || y !== 0) {
										if (x !== 0)
											this.mobileAutomapScroll.X -= x;
										if (y !== 0)
											this.mobileAutomapScroll.Y -= y;
										Scroll(x, y);
									}
								} else {
									const position = renderView.ScreenToGame(this.GetMousePosition(this.lastMousePosition));
									let x = position.X < 4 ? -1 : position.X > 204 ? 1 : 0;
									let y = position.Y < 41 ? -1 : position.Y > 196 ? 1 : 0;

									if (x !== 0 || y !== 0)
										Scroll(x, y);
									else {
										const keys = this.keys;
										const left = keys[Key.Left] || keys[Key.A] || keys[Key.Home];
										const right = keys[Key.Right] || keys[Key.D] || keys[Key.End];
										const up = keys[Key.Up] || keys[Key.W] || keys[Key.PageUp];
										const down = keys[Key.Down] || keys[Key.S] || keys[Key.PageDown];

										if (left && !right)
											x = -1;
										else if (right && !left)
											x = 1;
										if (up && !down)
											y = -1;
										else if (down && !up)
											y = 1;

										if (x !== 0 || y !== 0)
											Scroll(x, y);
									}
								}
							}

							CheckScroll();
						});
					}
				};

				CheckScroll();

				// Initial scroll
				const startScrollX = Math.max(0, Math.trunc((this.player.Position.X - 6) / 2));
				const startScrollY = Math.max(0, Math.trunc((this.player.Position.Y - 8) / 2));
				Scroll(startScrollX, startScrollY);

				this.lastMousePosition = renderView.GameToScreen(Global.AutomapArea.Center);
				this.TrapMouse(Global.AutomapArea);
				this.UpdateCursor();
			});
		};

		if (this.currentWindow.Window === Window.Automap)
			Create();
		else
			this.CloseWindow(Create);
	}

	ShowRiddlemouth(map, riddlemouthEvent, solvedHandler, showRiddle = true) {
		this.Fade(() => {
			const layout = this.layout;
			const DataNameProvider = this.DataNameProvider;
			this.SetWindow(Window.Riddlemouth, riddlemouthEvent, solvedHandler);
			layout.SetLayout(LayoutType.Riddlemouth);
			this.ShowMap(false);
			layout.Reset();
			const riddleArea = new Rect(16, 50, 176, 144);
			layout.FillArea(riddleArea, this.GetUIColor(28), false);
			const riddleText = this.ProcessText(map.GetText(riddlemouthEvent.RiddleTextIndex, DataNameProvider.TextBlockMissing));
			const solutionResponseText = this.ProcessText(map.GetText(riddlemouthEvent.SolutionTextIndex, DataNameProvider.TextBlockMissing));

			// Show stone head
			layout.Set80x80Picture(Picture80x80.Riddlemouth, 224, 49);
			const eyes = layout.AddAnimatedSprite(new Rect(240, 72, 48, 9), Graphics.RiddlemouthEyeIndex, this.UIPaletteIndex, 4);
			const mouth = layout.AddAnimatedSprite(new Rect(240, 90, 48, 15), Graphics.RiddlemouthMouthIndex, this.UIPaletteIndex, 7);

			const HeadChangeEyes = (open, followAction = null) => {
				const NextFrame = () => {
					const Next = () => this.AddTimedEvent(150, NextFrame);

					if (open) {
						if (++eyes.CurrentFrame === 3)
							followAction?.();
						else
							Next();

					} else { // close
						if (--eyes.CurrentFrame === 0)
							followAction?.();
						else
							Next();
					}
				};

				NextFrame();
			};

			const HeadSpeak = () => {
				const NextFrame = () => {
					const Next = () => this.AddTimedEvent(150, NextFrame);

					++mouth.CurrentFrame;

					// Note: The property will reset the frame to 0 when animation is done.
					// But don't use an inline increment operator inside the if. This won't work!
					if (mouth.CurrentFrame !== 0)
						Next();
				};

				mouth.CurrentFrame = 0;
				NextFrame();
			};

			const Exit = followAction => {
				HeadChangeEyes(false, () => this.CloseWindow(followAction));
			};

			const ShowRiddle = () => {
				this.InputEnable = false;
				HeadSpeak();
				layout.OpenTextPopup(riddleText, riddleArea.Position, riddleArea.Width, riddleArea.Height, true, true, true, TextColor.White).Closed.add(() => {
					this.InputEnable = true;
				});
			};
			const TestSolution = solution => {
				const entries = this.textDictionary.Entries;
				if (equalsIgnoreCase(entries[riddlemouthEvent.CorrectAnswerDictionaryIndex1], solution) ||
					(riddlemouthEvent.CorrectAnswerDictionaryIndex1 !== riddlemouthEvent.CorrectAnswerDictionaryIndex2 &&
						equalsIgnoreCase(entries[riddlemouthEvent.CorrectAnswerDictionaryIndex2], solution))) {
					this.InputEnable = false;
					HeadSpeak();
					layout.OpenTextPopup(solutionResponseText, riddleArea.Position, riddleArea.Width, riddleArea.Height, true, true, true, TextColor.White, () => {
						Exit(() => {
							this.InputEnable = true;
							solvedHandler?.();
						});
					});
				} else {
					if (!entries.some(entry => equalsIgnoreCase(entry, solution)))
						solution = DataNameProvider.That;
					const failedText = this.ProcessText(solution + DataNameProvider.WrongRiddlemouthSolutionText);
					this.InputEnable = false;
					HeadSpeak();
					layout.OpenTextPopup(failedText, riddleArea.Position, riddleArea.Width, riddleArea.Height, true, true, true, TextColor.White).Closed.add(() => {
						this.InputEnable = true;
					});
				}
			};

			if (showRiddle) {
				// Open eyes on start (and show the riddle)
				this.AddTimedEvent(250, () => HeadChangeEyes(true, () => {
					ShowRiddle();
				}));
			} else {
				// Eyes already open
				eyes.CurrentFrame = 3;
			}

			layout.AttachEventToButton(6, () => this.OpenDictionary(TestSolution));
			layout.AttachEventToButton(8, ShowRiddle);
			layout.AttachEventToButton(2, () => Exit(null));
		});
	}

	GetPlayerDrawOffset(direction) {
		if (this.Map.UseTravelTypes) {
			const travelInfo = this.renderView.GameData.GetTravelGraphicInfo(this.TravelType, direction ?? this.player.Direction);

			return new Position(travelInfo.OffsetX - 16, travelInfo.OffsetY - 16);
		} else {
			return new Position();
		}
	}

	GetPlayerAnimationInfo(direction = null) {
		if (this.Map.UseTravelTypes) {
			const travelInfo = this.renderView.GameData.GetTravelGraphicInfo(this.TravelType, direction ?? this.player.Direction);

			const info = new Character2DAnimationInfo();
			info.FrameWidth = travelInfo.Width;
			info.FrameHeight = travelInfo.Height;
			info.StandFrameIndex = Graphics.TravelGraphicOffset + this.TravelType * 4;
			info.SitFrameIndex = 0;
			info.SleepFrameIndex = 0;
			info.NumStandFrames = 1;
			info.NumSitFrames = 0;
			info.NumSleepFrames = 0;
			info.TicksPerFrame = 0;
			info.NoDirections = false;
			info.IgnoreTileType = false;
			info.UseTopSprite = false;
			return info;
		} else {
			// struct copy
			const animationInfo = cloneStruct(this.renderView.GameData.PlayerAnimationInfo);
			const offset = this.Map.World * 17;
			animationInfo.StandFrameIndex += offset;
			animationInfo.SitFrameIndex += offset;
			animationInfo.SleepFrameIndex += offset;
			return animationInfo;
		}
	}

	IsNight() {
		return this.CurrentSavegame.Hour >= 22 || this.CurrentSavegame.Hour < 5;
	}

	/** Returns the named tuple { Flags, CombatBackgroundIndex } */
	GetTileFlags(x, y) {
		if (this.is3D) {
			const block = this.Map.Blocks[x][y];

			if (block.ObjectIndex !== 0)
				return { Flags: 0x007fff00, CombatBackgroundIndex: this.MapManager.GetLabdataForMap(this.Map).CombatBackground };
			else if (block.WallIndex !== 0) {
				const flags = this.MapManager.GetLabdataForMap(this.Map).Walls[block.WallIndex - 1].Flags;
				return { Flags: flags, CombatBackgroundIndex: toUInt(flags) >>> 28 };
			} else
				return { Flags: Tileset.TileFlags.None, CombatBackgroundIndex: 0 };
		} else { // 2D
			const tile = this.renderMap2D.get(x, y);
			const map = this.renderMap2D.GetMapFromTile(x, y);
			const tileset = this.MapManager.GetTilesetForMap(map);
			const backTileFlags = tile.BackTileIndex === 0 ? Tileset.TileFlags.None : tileset.Tiles[tile.BackTileIndex - 1].Flags;
			const frontTileFlags = tile.FrontTileIndex === 0 ? Tileset.TileFlags.None : tileset.Tiles[tile.FrontTileIndex - 1].Flags;

			if (frontTileFlags === Tileset.TileFlags.None || hasFlag(frontTileFlags, Tileset.TileFlags.UseBackgroundTileFlags))
				return { Flags: backTileFlags, CombatBackgroundIndex: toUInt(backTileFlags) >>> 28 };
			else
				return { Flags: frontTileFlags, CombatBackgroundIndex: toUInt(frontTileFlags) >>> 28 };
		}
	}
}
