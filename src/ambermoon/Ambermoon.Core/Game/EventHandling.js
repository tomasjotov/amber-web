// Port of Ambermoon.Core/Game/EventHandling.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Partial class GameCore (EventHandling part).

import {
	hasFlag, toUInt, toUShort, toShort, toByte, getValue, range, repeat
} from '../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { TransportLocation } from '../../Ambermoon.Data.Common/Savegame.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { CharacterDirection } from '../../Ambermoon.Common/Direction.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { CollectionExtensions } from '../../Ambermoon.Common/CollectionExtensions.js';
import {
	EventType, ChestEvent, DoorEvent, ConditionEvent, TeleportEvent, RewardEvent, TrapEvent
} from '../../Ambermoon.Data.Common/Event.js';
import { Chest, ChestType } from '../../Ambermoon.Data.Common/Chest.js';
import { Merchant } from '../../Ambermoon.Data.Common/Merchant.js';
import { ItemSlot } from '../../Ambermoon.Data.Common/ItemSlot.js';
import { ItemFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemFlags.js';
import { ItemType } from '../../Ambermoon.Data.Common/Enumerations/ItemType.js';
import { GenderFlag } from '../../Ambermoon.Data.Common/Enumerations/Gender.js';
import { SpellTypeMastery } from '../../Ambermoon.Data.Common/Enumerations/SpellSchool.js';
import { AutomapType } from '../../Ambermoon.Data.Common/Enumerations/AutomapType.js';
import { SpecialItemPurpose } from '../../Ambermoon.Data.Common/Enumerations/SpecialItemPurpose.js';
import { Skill } from '../../Ambermoon.Data.Common/Enumerations/Skill.js';
import { Attribute } from '../../Ambermoon.Data.Common/Enumerations/Attribute.js';
import { Condition } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';
import { Race } from '../../Ambermoon.Data.Common/Enumerations/Race.js';
import { Features } from '../../Ambermoon.Data.Common/Enumerations/Features.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { TravelType, TravelTypeExtensions } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { Picture80x80 } from '../../Ambermoon.Data.Common/Enumerations/Picture80x80.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import { EventTrigger, MapExtensions } from '../MapExtensions.js';
import { EventExtensions } from '../EventExtensions.js';
import { Geometry } from '../Geometry/Geometry.js';
import { Global } from '../UI/Global.js';
import { Window } from '../UI/Window.js';
import { LayoutType } from '../UI/Layout.js';
import { ScrollbarType } from '../UI/ScrollbarType.js';
import { ItemGrid } from '../UI/ItemGrid.js';
import { TextAlign } from '../Render/TextAlign.js';
import { ItemAnimation } from '../Render/ItemAnimation.js';
import { MouseButtons } from '../MouseButtons.js';
import { CharacterInfo } from './Rendering.js';
import { MobileAction } from './Input.js';

// Copy of the private const GameCore.LockpickItemIndex (declared in Game/Items.cs).
const LockpickItemIndex = 138;

export class GameCore_EventHandling {
	static initialChests = new Map();
	static PartyMemberCharacterBits = new Map([
		// Netsrak
		[2, 0x2000],
		// Mando
		[3, 0x2001],
		// Erik
		[4, 0x2002],
		// Chris
		[5, 0x2003],
		// Monika
		[6, 0x2004],
		// Tar the dark
		[7, 0x2141],
		// Egil
		[8, 0x2163],
		// Selena
		[9, 0x22c2],
		// Nelvin
		[10, 0x2321],
		// Sabine
		[11, 0x23a0],
		// Valdyn
		[12, 0x2400],
		// Targor
		[13, 0x3320],
		// Leonaria
		[14, 0x3440],
		// Gryban
		[15, 0x35a0],
		// Kasimir
		[16, 0x2203],
		// S'Ebi
		[17, 0x3c00]
	]);
	// Some party members like Sabine appear at some different location first (e.g. Luminor's torture chamber)
	// and will spawn somewhere else later (Burnville healers). This stores the initial location bit.
	static PartyMemberInitialCharacterBits = new Map([
		// Netsrak
		[2, 0x2000],
		// Mando
		[3, 0x2001],
		// Erik
		[4, 0x2002],
		// Chris
		[5, 0x2003],
		// Monika
		[6, 0x2004],
		// Tar the dark
		[7, 0x2141],
		// Egil
		[8, 0x2163],
		// Selena
		[9, 0x22e0],
		// Nelvin
		[10, 0x2321],
		// Sabine
		[11, 0x2485],
		// Valdyn
		[12, 0x24e0],
		// Targor
		[13, 0x3320],
		// Leonaria
		[14, 0x3440],
		// Gryban
		[15, 0x35a0],
		// Kasimir
		[16, 0x2203],
		// S'Ebi
		[17, 0x3bc5]
	]);

	static initFields(self) {
		// If true, avoid triggering events
		self.noEvents = false;
		self.levitating = false;

		self.Teleporting = false;
		/** Open chest which can be used to store items. (internal, private set) */
		self.OpenStorage = null;

		// readonly Places places is assigned by the GameCore constructor.
		self.currentPlace = null;
	}

	/**
	 * Overloads:
	 * - TriggerMapEvents(EventTrigger trigger, Position position) (private): Triggers map events with the given trigger and position inside the map view.
	 * - TriggerMapEvents(EventTrigger trigger, uint x, uint y)
	 * - TriggerMapEvents(EventTrigger? trigger)
	 */
	TriggerMapEvents(trigger, xOrPosition, y) {
		if (arguments.length >= 3)
			return this.TriggerMapEventsAt(trigger, xOrPosition, y);
		if (arguments.length === 2)
			return this.TriggerMapEventsAtViewPosition(trigger, xOrPosition);
		return this.TriggerMapEventsNullable(trigger);
	}

	/** Port helper: C# bool TriggerMapEvents(EventTrigger trigger, Position position) */
	TriggerMapEventsAtViewPosition(trigger, position) {
		if (this.is3D) {
			throw new AmbermoonException(ExceptionScope.Application, 'Triggering map events by map view position is not supported for 3D maps.');
		} else { // 2D
			const tilePosition = this.renderMap2D.PositionToTile(position);

			if (this.CoreConfiguration.IsMobile) {
				const range = trigger === EventTrigger.Mouth ? 3 : 2;

				const xDist = Math.abs(this.player2D.Position.X - tilePosition.X);
				const yDist = Math.abs(this.player2D.Position.Y - tilePosition.Y);

				if (xDist > range || yDist > range)
					return false;
			}

			return this.TriggerMapEventsAt(trigger, tilePosition.X, tilePosition.Y);
		}
	}

	/** Port helper: C# internal bool TriggerMapEvents(EventTrigger trigger, uint x, uint y) */
	TriggerMapEventsAt(trigger, x, y) {
		if (this.noEvents)
			return false;

		if (this.is3D) {
			return this.renderMap3D.TriggerEvents(this, trigger, x, y, this.CurrentSavegame);
		} else { // 2D
			return this.renderMap2D.TriggerEvents(this.player2D, trigger, x, y, this.MapManager,
				this.CurrentTicks, this.CurrentSavegame);
		}
	}

	/**
	 * C#: internal bool TestUseItemMapEvent(uint itemIndex, out uint x, out uint y, out EventType eventType)
	 * Returns [bool, x, y, eventType].
	 */
	TestUseItemMapEvent(itemIndex) {
		let x = this.player.Position.X;
		let y = this.player.Position.Y;
		let eventType = EventType.Invalid;
		let eventX = x;
		let eventY = y;
		let event = this.is3D ? MapExtensions.GetEvent(this.Map, x, y, this.CurrentSavegame) : this.renderMap2D.GetEvent(x, y, this.CurrentSavegame);
		const map = this.is3D ? this.Map : this.renderMap2D.GetMapFromTile(x, y);

		// In the remake we allow using keys (including lockpick) to open a nearby chest/door.
		// This will only happen if nearby chests/doors can be opened with it. The chest or
		// door screen is opened and the item is used automatically. If there is a scrollable
		// text, the key using is postponed to after reading through it.
		const item = this.ItemManager.GetItem(itemIndex);
		const isKey = item.Type === ItemType.Key;

		const IsMatchingKeyEvent = () => {
			if (!isKey)
				return false;

			if (event instanceof ChestEvent && this.CurrentSavegame.IsChestLocked(event.RealChestIndex - 1))
				return true;
			if (event instanceof DoorEvent && this.CurrentSavegame.IsDoorLocked(event.DoorIndex))
				return true;

			return false;
		};

		// returns [bool, eventType]
		const TestEvent = () => {
			const eventType = event?.Type ?? EventType.Invalid;

			if (IsMatchingKeyEvent())
				return [true, eventType];

			if (!(event instanceof ConditionEvent))
				return [false, eventType];
			const conditionEvent = event;

			if (conditionEvent.TypeOfCondition === ConditionEvent.ConditionType.UseItem &&
				conditionEvent.ObjectIndex === itemIndex)
				return [true, eventType];

			const lastEventStatus = true;
			const trigger = EventTrigger.Item0 + itemIndex;

			[event] = EventExtensions.ExecuteEvent(conditionEvent, map, this, trigger, eventX, eventY, lastEventStatus);

			return TestEvent();
		};

		let testResult;
		[testResult, eventType] = TestEvent();
		if (testResult)
			return [true, x, y, eventType];

		const mapWidth = this.Map.IsWorldMap ? 2147483647 : this.Map.Width;
		const mapHeight = this.Map.IsWorldMap ? 2147483647 : this.Map.Height;

		if (this.is3D) {
			const [px, pz] = this.camera3D.GetForwardPosition(Global.DistancePerBlock, false, false);
			const position = Geometry.CameraToBlockPosition(this.Map, px, pz);

			if (!Position.op_Equality(position, this.player.Position) &&
				position.X >= 0 && position.X < this.Map.Width &&
				position.Y >= 0 && position.Y < this.Map.Height &&
				this.renderMap3D.IsBlockingPlayer(position)) {
				// Only check the forward position if it is blocking.
				// Sometimes use item events might be placed on walls etc.
				// Otherwise don't check the forward position as the
				// player can walk on the empty tile and use the item there.
				x = position.X;
				y = position.Y;
				event = MapExtensions.GetEvent(this.Map, x, y, this.CurrentSavegame);
				eventX = x;
				eventY = y;

				[testResult, eventType] = TestEvent();
				return [testResult, x, y, eventType];
			} else {
				return [false, x, y, eventType];
			}
		} else {
			let offsets = [new Position(0, -1), new Position(1, 0), new Position(0, 1), new Position(-1, 0)];
			const IsOffsetInvalid = (offset, x, y) => x + offset.X < 0 || x + offset.X >= mapWidth || y + offset.Y < 0 || y + offset.Y >= mapHeight;
			const shift = this.player.Direction;
			offsets = offsets.slice(shift).concat(offsets.slice(0, shift));

			// returns [bool, eventType]
			const TestEventAtOffset = (offset, x, y) => {
				eventX = x + offset.X;
				eventY = y + offset.Y;
				event = this.renderMap2D.GetEvent(eventX, eventY, this.CurrentSavegame);

				return TestEvent();
			};

			for (const offset of offsets) {
				if (IsOffsetInvalid(offset, x, y))
					continue;

				[testResult, eventType] = TestEventAtOffset(offset, x, y);

				if (testResult) {
					x = x + offset.X;
					y = y + offset.Y;
					return [true, x, y, eventType];
				}
			}

			return [false, x, y, eventType];
		}
	}

	/** Port helper: C# internal bool TriggerMapEvents(EventTrigger? trigger) */
	TriggerMapEventsNullable(trigger) {
		if (this.noEvents)
			return false;

		if (trigger == null) {
			// If null it was triggered by crosshair cursor. We test mouth, eye and hand in this case.
			if (this.TriggerMapEventsNullable(EventTrigger.Mouth))
				return true;
			if (this.TriggerMapEventsNullable(EventTrigger.Eye))
				return true;
			if (this.TriggerMapEventsNullable(EventTrigger.Hand))
				return true;
			return false;
		}

		const consumed = this.TriggerMapEventsAt(trigger, this.player.Position.X, this.player.Position.Y);

		if (this.is3D) {
			if (consumed)
				return true;

			// In 3D we might trigger adjacent tile events.
			if (trigger !== EventTrigger.Move) {
				const [x, z] = this.camera3D.GetForwardPosition(Global.DistancePerBlock, false, false);
				const position = Geometry.CameraToBlockPosition(this.Map, x, z);

				if (!Position.op_Equality(position, this.player.Position) &&
					position.X >= 0 && position.X < this.Map.Width &&
					position.Y >= 0 && position.Y < this.Map.Height) {
					return this.TriggerMapEventsAt(trigger, position.X, position.Y);
				}
			}
		} else if (trigger >= EventTrigger.Item0) {
			if (consumed)
				return true;

			// In 2D we might trigger adjacent tile events when items are used.
		}

		return false;
	}

	/**
	 * C#: private void GetEventIndex(Position position, out uint? eventIndex, out uint? mapIndex)
	 * Returns [eventIndex, mapIndex].
	 */
	GetEventIndex(position) {
		if (this.Map.Type === MapType.Map3D) {
			const eventIndex = MapExtensions.GetEventIndex(this.Map, position.X, position.Y, this.CurrentSavegame);
			const mapIndex = this.Map.Index;
			return [eventIndex, mapIndex];
		} else {
			let x = position.X;
			let y = position.Y;

			let map = this.Map;

			if (map.IsWorldMap) {
				map = this.renderMap2D.GetMapFromTile(x, y);
				x %= 50;
				y %= 50;
			}

			const eventIndex = MapExtensions.GetEventIndex(map, x, y, this.CurrentSavegame);
			const mapIndex = map.Index;
			return [eventIndex, mapIndex];
		}
	}


	// #region Teleport

	/**
	 * Overloads:
	 * - public bool Teleport(uint mapIndex, uint x, uint y, CharacterDirection direction, out bool blocked, bool force = false, bool fadeIfMapChange = false)
	 *   -> JS: Teleport(mapIndex, x, y, direction, force, fadeIfMapChange) returns [bool, blocked]
	 * - internal void Teleport(TeleportEvent teleportEvent, uint x, uint y)
	 */
	Teleport(...args) {
		if (args[0] instanceof TeleportEvent)
			return this.TeleportByEvent(args[0], args[1], args[2]);
		return this.TeleportTo(...args);
	}

	/** Port helper for C# Teleport(uint mapIndex, ...out bool blocked...). Returns [bool, blocked]. */
	TeleportTo(mapIndex, x, y, direction, force = false, fadeIfMapChange = false) {
		let blocked = false;

		if (!this.Ingame || this.layout.OptionMenuOpen || this.BattleActive || (!force && (this.WindowActive || this.layout.PopupActive)))
			return [false, blocked];

		if (mapIndex === 0)
			mapIndex = this.Map.Index;

		const newMap = this.MapManager.GetMap(mapIndex);

		if (newMap == null) {
			blocked = true;
			return [false, blocked];
		}

		if (!newMap.UseTravelTypes && (this.TravelType !== TravelType.Walk && this.TravelType !== TravelType.Swim))
			return [false, blocked];

		const mapChange = newMap.Index !== this.Map.Index;
		const player = this.is3D ? this.player3D : this.player2D;
		const mapTypeChanged = this.Map.Type !== newMap.Type;

		// The position (x, y) is 1-based in the data so we subtract 1.
		// If the position is 0,0 the current position should be used.
		const newX = x === 0 ? player.Position.X : x - 1;
		const newY = y === 0 ? player.Position.Y : y - 1;

		if (newMap.Type === MapType.Map2D) {
			// Note: There are cases where teleporting onto a blocking tile is performed and allowed.
			// One example is the Inn in Newlake where you are teleported on top of a table.
			// In this case we force the teleport.
			if (!force && !newMap.Tiles[newX][newY].AllowMovement(this.MapManager.GetTilesetForMap(newMap), this.TravelType, true, true)) {
				blocked = true;
				return [false, blocked];
			}
		} else {
			// Note: Normally we won't force teleport to a blocking 3D block as the player would
			// stuck in the wall. But the game logic might use change tile events to remove walls.
			// So we hope that the game only teleports to blocking tiles if it is removed on map enter.
			if (!force && newMap.Blocks[newX][newY].BlocksPlayer(this.MapManager.GetLabdataForMap(newMap))) {
				blocked = true;
				return [false, blocked];
			}
		}

		if (!this.is3D && !mapChange) {
			this.renderMap2D.ScrollToPlayer(newX, newY);
		}

		if (direction === CharacterDirection.Keep)
			direction = this.PlayerDirection;

		const MoveToMap = () => {
			const UpdateMapNameAndLight = map => {
				if (mapChange && !this.WindowActive) {
					this.UpdateMapName(map);
					this.UpdateLight(true, false, false, map);
				}
			};

			player.MoveTo(newMap, newX, newY, this.CurrentTicks, true, direction, UpdateMapNameAndLight);
			this.player.Position.X = this.RenderPlayer.Position.X;
			this.player.Position.Y = this.RenderPlayer.Position.Y;
			// This will update the appearance.
			this.TravelType = this.travelType;

			if (!mapTypeChanged) {
				this.PlayerMoved(mapChange);
			}

			if (mapChange && !this.WindowActive) {
				// Color of the filled upper right area may need update cause of palette change.
				this.mapViewRightFillArea.Color = this.GetUIColor(28);
			}

			if (!mapChange) // Otherwise the map change handler takes care of this
				this.ResetMoveKeys();

			if (!this.WindowActive && !this.layout.PopupActive && !TravelTypeExtensions.IgnoreEvents(this.TravelType)) {
				// Trigger events after map transition
				this.TriggerMapEventsAt(EventTrigger.Move, this.player.Position.X,
					this.player.Position.Y);
			}
		};

		if (mapChange && fadeIfMapChange) {
			this.Fade(MoveToMap);
		} else {
			MoveToMap();
		}

		return [true, blocked];
	}

	/** Port helper: C# internal void Teleport(TeleportEvent teleportEvent, uint x, uint y) */
	/** Web port: Amberstar travel exits leave the transport at the current location (outside of the town). */
	LeaveTransportForAmberstarExit(teleportEvent) {
		if (!this.renderView.GameData?.IsAmberstar || teleportEvent.NewTravelType !== TravelType.Walk || this.is3D)
			return;
		if (!TravelTypeExtensions.UsesMapObject(this.TravelType)) {
			if (this.TravelType !== TravelType.Walk && this.TravelType !== TravelType.Swim)
				this.TravelType = TravelType.Walk;
			return;
		}
		const x = this.player.Position.X;
		const y = this.player.Position.Y;
		const mapIndex = this.renderMap2D.GetMapFromTile(x, y).Index;
		for (let i = 0; i < this.CurrentSavegame.TransportLocations.length; ++i) {
			if (this.CurrentSavegame.TransportLocations[i] == null) {
				const transportLocation = new TransportLocation();
				transportLocation.MapIndex = mapIndex;
				transportLocation.Position = this.Map.IsWorldMap ? new Position(x % 50 + 1, y % 50 + 1) : new Position(x + 1, y + 1);
				transportLocation.TravelType = this.TravelType;
				this.CurrentSavegame.TransportLocations[i] = transportLocation;
				break;
			}
		}
		this.TravelType = TravelType.Walk;
	}

	TeleportByEvent(teleportEvent, x, y) {
		this.Teleporting = true;

		const targetX = teleportEvent.X === 0 ? x + 1 : teleportEvent.X;
		const targetY = teleportEvent.Y === 0 ? y + 1 : teleportEvent.Y;

		this.ResetMoveKeys();
		this.ResetMapCharacterInteraction(this.Map);

		if (this.PopupActive)
			this.layout.ClosePopup(false, true);

		const RunTransition = () => {
			this.levitating = false;
			this.LeaveTransportForAmberstarExit(teleportEvent);
			this.TeleportTo(teleportEvent.MapIndex, targetX, targetY, teleportEvent.Direction, true);

			if (this.Map.IsWorldMap && teleportEvent.NewTravelType != null && teleportEvent.NewTravelType !== this.TravelType)
				this.TravelType = teleportEvent.NewTravelType;

			if (TravelTypeExtensions.UsesMapObject(this.TravelType) &&
				!this.CheckTeleportDestination(teleportEvent.MapIndex, targetX, targetY)) {
				this.ToggleTransport();
				const [transport, index] = this.GetTransportAtPlayerLocation(); // eslint-disable-line no-unused-vars
				this.CurrentSavegame.TransportLocations[index] = null;
				this.renderMap2D.RemoveTransport(index);
			}

			this.Teleporting = false;
		};

		let transition = teleportEvent.Transition;

		if (transition === TeleportEvent.TransitionType.MapChange && this.levitating)
			transition = TeleportEvent.TransitionType.Climbing;

		switch (transition) {
			case TeleportEvent.TransitionType.Teleporter:
				RunTransition();
				break;
			case TeleportEvent.TransitionType.WindGate:
				if (this.CurrentSavegame.IsSpecialItemActive(SpecialItemPurpose.WindChain))
					RunTransition();
				else
					this.Teleporting = false;
				break;
			case TeleportEvent.TransitionType.Falling:
			{
				if (!this.is3D) {
					this.Fade(RunTransition);
				} else {
					this.Pause();
					this.Fall(x, y, () => this.Fade(() => {
						this.noEvents = true;
						RunTransition();
						this.MoveVertically(false, true, () => {
							this.Resume();
							this.noEvents = false;
							this.TriggerMapEventsNullable(EventTrigger.Move);
						});
					}));
				}
				break;
			}
			case TeleportEvent.TransitionType.Climbing:
				if (!this.is3D) {
					this.Fade(RunTransition);
				} else {
					this.Pause();
					this.Climb(() => this.Fade(() => {
						this.noEvents = true;
						RunTransition();
						this.MoveVertically(true, true, () => {
							this.Resume();
							this.noEvents = false;
							this.TriggerMapEventsNullable(EventTrigger.Move);
						});
					}));
				}
				break;
			case TeleportEvent.TransitionType.Outro:
				this.Teleporting = false;
				this.Hook_Outro();
				break;
			default:
				this.Fade(RunTransition);
				break;
		}
	}

	CheckTeleportDestination(mapIndex, x, y) {
		if (mapIndex === 0)
			mapIndex = this.Map.Index;

		const newMap = this.MapManager.GetMap(mapIndex);

		if (newMap == null)
			return false;

		const newX = x === 0 ? this.player.Position.X : x - 1;
		const newY = y === 0 ? this.player.Position.Y : y - 1;

		if (newMap.Type === MapType.Map3D)
			return !newMap.Blocks[newX][newY].BlocksPlayer(this.MapManager.GetLabdataForMap(newMap));
		else
			return newMap.Tiles[newX][newY].AllowMovement(this.MapManager.GetTilesetForMap(newMap), this.TravelType);
	}

	// #endregion


	// #region Chests & Doors

	GetChest(index) {
		return getValue(this.CurrentSavegame.Chests, index);
	}

	GetInitialChest(index) {
		if (GameCore_EventHandling.initialChests.size === 0) {
			try {
				const initialSavegame = this.SavegameManager.LoadInitial(this.renderView.GameData, this.savegameSerializer);
				// C#: initialChests = initialSavegame.Chests; (the static Map is filled in place so that the
				// copy of this static on GameCore (applyPartials) keeps referencing the same Map)
				GameCore_EventHandling.initialChests.clear();
				for (const [key, value] of initialSavegame.Chests)
					GameCore_EventHandling.initialChests.set(key, value);
			} catch {
				// ignore
			}
		}

		return getValue(GameCore_EventHandling.initialChests, index);
	}

	RefillChest(chestIndex) {
		// If not saved, restore initial content
		const initialChest = this.GetInitialChest(chestIndex);

		if (initialChest != null && CollectionExtensions.ToList(initialChest.Slots).filter(s => s instanceof ItemSlot).reduce((s, item) => s + item.Amount, 0) +
			initialChest.Gold + initialChest.Food === 1) {
			const chest = this.GetChest(chestIndex);

			chest.Gold = initialChest.Gold;
			chest.Food = initialChest.Food;

			for (let y = 0; y < Chest.SlotRows; ++y) {
				for (let x = 0; x < Chest.SlotsPerRow; ++x)
					chest.Slots[x][y].Replace(initialChest.Slots[x][y]);
			}
		}
	}

	ChestClosed() {
		// This is called by manually close the chest window via the Exit button
		const chestEvent = this.currentWindow.WindowParameters[0];
		const position = this.currentWindow.WindowParameters[4];

		this.CloseWindow(() => {
			const chestIndex = chestEvent.RealChestIndex;

			if (chestEvent.NoSave) {
				this.RefillChest(chestIndex);
			}

			if (chestEvent.Next != null) {
				EventExtensions.TriggerEventChain(this.Map, this, EventTrigger.Always, position?.X ?? 0,
					position?.Y ?? 0, chestEvent.Next, false);
			}
		});
	}

	ChestRemoved() {
		const chestEvent = this.currentWindow.WindowParameters[0];
		const position = this.currentWindow.WindowParameters[4];

		this.CloseWindow(() => {
			const chestIndex = chestEvent.RealChestIndex;

			if (chestEvent.NoSave) {
				this.RefillChest(chestIndex);
			} else if (chestEvent.CloseWhenEmpty) {
				const chest = this.GetChest(chestEvent.RealChestIndex);

				if (chest.Empty) {
					const [eventIndex, mapIndex] = this.GetEventIndex(position);

					if (eventIndex != null)
						this.CurrentSavegame.SetEventBit(mapIndex, eventIndex - 1, true);
				}
			}

			if (chestEvent.Next != null) {
				EventExtensions.TriggerEventChain(this.Map, this, EventTrigger.Always, position?.X ?? 0,
					position?.Y ?? 0, chestEvent.Next, true);
			}
		});
	}

	ItemRemovedFromStorage() {
		if (this.OpenStorage instanceof Chest) {
			const chest = this.OpenStorage;
			if (!chest.IsBattleLoot) {
				if (chest.Empty) {
					if (chest.Type === ChestType.Chest)
						this.layout.Set80x80Picture(Picture80x80.ChestOpenEmpty);

					// If a chest has AllowsItemDrop = false this
					// means it is removed when it is empty.
					if (!chest.AllowsItemDrop)
						this.ChestRemoved();
				} else {
					if (chest.Type === ChestType.Chest)
						this.layout.Set80x80Picture(Picture80x80.ChestOpenFull);
				}
			}
		} else if (this.OpenStorage instanceof Merchant) {
			// TODO: Show message that he doesn't sell anything if no item is left
		}
	}

	ChestGoldChanged() {
		const chest = this.OpenStorage instanceof Chest ? this.OpenStorage : null;

		if (chest.Gold > 0) {
			if (chest.Type === ChestType.Chest)
				this.layout.Set80x80Picture(Picture80x80.ChestOpenFull);
			this.ShowTextPanel(CharacterInfo.ChestGold, true,
				`${this.DataNameProvider.GoldName}^${chest.Gold}`, new Rect(111, 104, 43, 15));
		} else {
			this.HideTextPanel(CharacterInfo.ChestGold);

			if (chest.Empty && !chest.IsBattleLoot) {
				if (chest.Type === ChestType.Chest)
					this.layout.Set80x80Picture(Picture80x80.ChestOpenEmpty);

				if (!chest.AllowsItemDrop)
					this.ChestRemoved();
			}
		}
	}

	ChestFoodChanged() {
		const chest = this.OpenStorage instanceof Chest ? this.OpenStorage : null;

		if (chest.Food > 0) {
			if (chest.Type === ChestType.Chest)
				this.layout.Set80x80Picture(Picture80x80.ChestOpenFull);
			this.ShowTextPanel(CharacterInfo.ChestFood, true,
				`${this.DataNameProvider.FoodName}^${chest.Food}`, new Rect(260, 104, 43, 15));
		} else {
			this.HideTextPanel(CharacterInfo.ChestFood);

			if (chest.Empty && !chest.IsBattleLoot) {
				if (chest.Type === ChestType.Chest)
					this.layout.Set80x80Picture(Picture80x80.ChestOpenEmpty);

				if (!chest.AllowsItemDrop)
					this.ChestRemoved();
			}
		}
	}

	ShowLoot(storage, initialText, initialTextClosedEvent, chestEvent = null,
		triggerFollowEvents = false, eventX = 0, eventY = 0) {
		if (chestEvent?.Next != null && triggerFollowEvents) {
			const oldCloseWindowHandler = this.closeWindowHandler;
			this.closeWindowHandler = backToMap => {
				oldCloseWindowHandler?.(backToMap);

				if (backToMap)
					EventExtensions.TriggerEventChain(this.Map, this, EventTrigger.Always, eventX, eventY, chestEvent.Next, true);
			};
		}
		this.OpenStorage = storage;
		this.OpenStorage.AllowsItemDrop = chestEvent == null ? false : !chestEvent.CloseWhenEmpty;
		this.layout.SetLayout(LayoutType.Items);
		this.layout.FillArea(new Rect(110, 43, 194, 80), this.GetUIColor(28), false);
		const itemSlotPositions = range(1, 6).map(index => new Position(index * 22, 139));
		itemSlotPositions.push(...range(1, 6).map(index => new Position(index * 22, 168)));
		const itemGrid = ItemGrid.Create(this, this.layout, this.renderView, this.ItemManager, itemSlotPositions, CollectionExtensions.ToList(storage.Slots),
			this.OpenStorage.AllowsItemDrop, 12, 6, 24, new Rect(7 * 22, 139, 6, 53), new Size(6, 27), ScrollbarType.SmallVertical);
		itemGrid.Refresh();
		this.layout.AddItemGrid(itemGrid);
		const pile = storage.IsBattleLoot || (storage instanceof Chest && storage.Type === ChestType.Junk);

		if (pile) {
			this.layout.Set80x80Picture(Picture80x80.Treasure);
		} else if (storage.Empty) {
			this.layout.Set80x80Picture(Picture80x80.ChestOpenEmpty);
		} else {
			this.layout.Set80x80Picture(Picture80x80.ChestOpenFull);
		}

		itemGrid.ItemDragged.add((slotIndex, itemSlot, amount, updateSlot) => {
			if (updateSlot) {
				const column = slotIndex % Chest.SlotsPerRow;
				const row = Math.trunc(slotIndex / Chest.SlotsPerRow);
				storage.Slots[column][row].Remove(amount);
			}
		});
		itemGrid.ItemDropped.add((slotIndex, itemSlot, amount) => {
			if (!pile)
				this.layout.Set80x80Picture(Picture80x80.ChestOpenFull);
		});

		if (storage.Gold > 0) {
			this.ShowTextPanel(CharacterInfo.ChestGold, true,
				`${this.DataNameProvider.GoldName}^${storage.Gold}`, new Rect(111, 104, 43, 15));
		}

		if (storage.Food > 0) {
			this.ShowTextPanel(CharacterInfo.ChestFood, true,
				`${this.DataNameProvider.FoodName}^${storage.Food}`, new Rect(260, 104, 43, 15));
		}

		if (initialText != null) {
			this.layout.ShowClickChestMessage(initialText, initialTextClosedEvent, true);
		}
	}

	ShowChest(chestEvent, foundTrap, disarmedTrap, map,
		position, fromEvent, triggerFollowEvents = false, usedItem = 0) {
		const chest = this.GetChest(chestEvent.RealChestIndex);
		const keyUser = usedItem !== 0 ? this.CurrentInventory : null;

		if (chestEvent.CloseWhenEmpty && chest.Empty) {
			if (!chestEvent.NoSave) {
				const [eventIndex, mapIndex] = this.GetEventIndex(position);

				if (eventIndex != null)
					this.CurrentSavegame.SetEventBit(mapIndex, eventIndex - 1, true);
			}

			return false; // Chest has gone due to looting
		}

		chest.Type = chestEvent.CloseWhenEmpty ? ChestType.Junk : ChestType.Chest;

		const OpenChest = () => {
			const changed = !chest.Equals(this.GetInitialChest(chestEvent.RealChestIndex), false);
			const initialText = changed ? null : map != null && fromEvent && chestEvent.TextIndex !== 255 ?
				map.GetText(chestEvent.TextIndex, this.DataNameProvider.TextBlockMissing) : null;
			this.layout.Reset();
			this.ShowMap(false);
			this.SetWindow(Window.Chest, chestEvent, foundTrap, disarmedTrap, map, position, triggerFollowEvents);
			this.CursorType = CursorType.Sword;
			this.ResetMapCharacterInteraction(map ?? this.Map, true);

			if (chestEvent.LockpickingChanceReduction !== 0 && this.CurrentSavegame.IsChestLocked(chestEvent.RealChestIndex - 1)) {
				this.ShowLocked(Picture80x80.ChestClosed, () => {
					this.CurrentSavegame.UnlockChest(chestEvent.RealChestIndex - 1);
					this.currentWindow.Window = Window.Chest; // This avoids returning to locked screen when closing chest window.
					this.ExecuteNextUpdateCycle(() => this.ShowChest(chestEvent, false, false, map, position, true, true));
				}, null, chestEvent.KeyIndex, chestEvent.LockpickingChanceReduction, foundTrap, disarmedTrap,
				chestEvent.UnlockFailedEventIndex === 0xffff ? null : () => EventExtensions.TriggerEventChain(map ?? this.Map, this, EventTrigger.Always,
					position.X, position.Y, (map ?? this.Map).Events[chestEvent.UnlockFailedEventIndex], true),
				() => {
					if (chestEvent.Next != null)
						EventExtensions.TriggerEventChain(map ?? this.Map, this, EventTrigger.Always, position.X, position.Y, chestEvent.Next, false);
				}, usedItem, keyUser);
			} else {
				this.ShowLoot(chest, initialText, null, chestEvent, triggerFollowEvents, position.X, position.Y);
			}
		};

		if (this.CurrentWindow.Window === Window.Chest)
			OpenChest();
		else if (this.CurrentWindow.Window === Window.Inventory && this.LastWindow.Window === Window.Chest)
			this.CloseWindow(OpenChest);
		else
			this.Fade(OpenChest);

		return true;
	}

	ShowDoor(doorEvent, foundTrap, disarmedTrap, map, x, y,
		fromEvent, moved, usedItem = 0) {
		const keyUser = usedItem !== 0 ? this.CurrentInventory : null;
		if (!this.CurrentSavegame.IsDoorLocked(doorEvent.DoorIndex))
			return false;

		const ShowDoorAction = () => {
			const initialText = fromEvent && doorEvent.TextIndex !== 255 ?
				map.GetText(doorEvent.TextIndex, this.DataNameProvider.TextBlockMissing) : null;
			const unlockText = doorEvent.UnlockTextIndex !== 255 ?
				map.GetText(doorEvent.UnlockTextIndex, this.DataNameProvider.TextBlockMissing) : null;
			this.layout.Reset();
			this.ShowMap(false);
			this.SetWindow(Window.Door, doorEvent, foundTrap, disarmedTrap, map, x, y, moved);
			this.ShowLocked(Picture80x80.Door, () => {
				if (moved && !this.is3D) {
					this.player2D.Position.X = this.player.Position.X = x;
					this.player2D.Position.Y = this.player.Position.Y = y;
					this.player2D.UpdateAppearance(this.CurrentTicks);
				}

				this.CurrentSavegame.UnlockDoor(doorEvent.DoorIndex);

				const Close = () => {
					this.CloseWindow(() => {
						if (this.is3D) {
							// 3D doors that have automap type wall seem to be removed after opening.
							// This is at least the case for the Newlake library bookshelf.
							const wallIndex = map.Blocks[x][y].WallIndex;
							const labdata = this.MapManager.GetLabdataForMap(map);

							if (wallIndex !== 0 &&
								labdata.Walls[(wallIndex - 1) % labdata.Walls.length].AutomapType === AutomapType.Wall) {
								this.RemoveMapTile(map, x, y, true);
							}
						}
						// If this is a direct map event it is deactivated when the door is opened.
						if (doorEvent.Next == null) {
							const eventIndex = map.EventList.indexOf(doorEvent);
							if (eventIndex !== -1)
								this.CurrentSavegame.ActivateEvent(map.Index, eventIndex, false);
						} else {
							EventExtensions.TriggerEventChain(map ?? this.Map, this, EventTrigger.Always, x, y, doorEvent.Next, true);
						}
					});
				};

				if (unlockText != null) {
					this.layout.ShowClickChestMessage(unlockText, Close);
				} else {
					Close();
				}
			}, initialText, doorEvent.KeyIndex, doorEvent.LockpickingChanceReduction, foundTrap, disarmedTrap,
			doorEvent.UnlockFailedEventIndex === 0xffff ? null : () => EventExtensions.TriggerEventChain(map, this, EventTrigger.Always,
				x, y, map.Events[doorEvent.UnlockFailedEventIndex], true),
			() => {
				if (doorEvent.Next != null)
					EventExtensions.TriggerEventChain(map, this, EventTrigger.Always, x, y, doorEvent.Next, false);
			}, usedItem, keyUser);
		};

		if (this.CurrentWindow.Window === Window.Door)
			ShowDoorAction();
		else if (this.CurrentWindow.Window === Window.Inventory && this.LastWindow.Window === Window.Door)
			this.CloseWindow(ShowDoorAction);
		else
			this.Fade(ShowDoorAction);

		return true;
	}

	ShowLocked(picture80X80, openedAction, initialMessage,
		keyIndex, lockpickingChanceReduction, foundTrap, disarmedTrap, failedAction,
		abortAction, usedKey = 0, keyUser = null) {
		const layout = this.layout;
		layout.SetLayout(LayoutType.Items);
		layout.FillArea(new Rect(110, 43, 194, 80), this.GetUIColor(28), false);
		const itemArea = new Rect(16, 139, 151, 53);
		const itemSlotPositions = range(1, 6).map(index => new Position(index * 22, 139));
		itemSlotPositions.push(...range(1, 6).map(index => new Position(index * 22, 168)));
		const itemGrid = ItemGrid.Create(this, layout, this.renderView, this.ItemManager, itemSlotPositions, repeat(null, 24),
			false, 12, 6, 24, new Rect(7 * 22, 139, 6, 53), new Size(6, 27), ScrollbarType.SmallVertical);
		layout.AddItemGrid(itemGrid);
		itemGrid.Disabled = true;
		layout.Set80x80Picture(picture80X80);
		const hasTrap = failedAction != null;
		const chest = picture80X80 === Picture80x80.ChestClosed;

		layout.EnableButton(1, this.CurrentPartyMember.Inventory.Slots.some(s => s?.Empty === false));
		layout.EnableButton(3, !foundTrap);
		layout.EnableButton(6, foundTrap && !disarmedTrap);

		const PlayerSwitched = () => {
			itemGrid.HideTooltip();
			itemGrid.Disabled = true;
			layout.ShowChestMessage(null);
			this.UntrapMouse();
			this.CursorType = CursorType.Sword;
			this.inputEnable = true;
			layout.EnableButton(1, this.CurrentPartyMember.Inventory.Slots.some(s => s?.Empty === false));
		};

		this.ActivePlayerChanged.clear();
		this.ActivePlayerChanged.add(PlayerSwitched);
		this.closeWindowHandler = _ => this.ActivePlayerChanged.remove(PlayerSwitched);

		const Exit = () => {
			this.CloseWindow(abortAction);
		};

		const SetupRightClickAbort = () => {
			this.nextClickHandler = buttons => {
				if (buttons === MouseButtons.Right) {
					itemGrid.HideTooltip();
					itemGrid.Disabled = true;
					layout.ShowChestMessage(null);
					this.UntrapMouse();
					this.CursorType = CursorType.Sword;
					this.inputEnable = true;
					return true;
				}

				return false;
			};
		};

		const StartUseItems = () => {
			if (chest)
				layout.ShowChestMessage(this.DataNameProvider.WhichItemToOpenChest, TextAlign.Left);
			else
				layout.ShowChestMessage(this.DataNameProvider.WhichItemToOpenDoor, TextAlign.Left);

			itemGrid.Disabled = false;
			itemGrid.DisableDrag = true;
			itemGrid.Initialize([...this.CurrentPartyMember.Inventory.Slots], false);
			this.TrapMouse(itemArea);
			SetupRightClickAbort();
		};

		const Unlocked = (withLockpick, finishAction) => {
			layout.ShowClickChestMessage(withLockpick ? (chest ? this.DataNameProvider.UnlockedChestWithLockpick : this.DataNameProvider.UnlockedDoorWithLockpick)
				: (chest ? this.DataNameProvider.HasOpenedChest : this.DataNameProvider.HasOpenedDoor), finishAction);
		};

		const CheckKey = (itemSlot, showItemsAfterwards, removeItemFromCharacter) => {
			const isActivePlayerItem = removeItemFromCharacter || keyUser.Index === this.CurrentPartyMember.Index;
			const targetPlayer = isActivePlayerItem ? this.CurrentPartyMember : keyUser;

			this.StartSequence();
			itemGrid.HideTooltip();
			const targetPosition = chest ? new Position(28, 76) : new Position(73, 102);
			itemGrid.PlayMoveAnimation(itemSlot, targetPosition, () => {
				const canOpen = keyIndex === itemSlot.ItemIndex || (keyIndex === 0 && itemSlot.ItemIndex === LockpickItemIndex);
				const item = layout.GetItem(itemSlot);
				const itemIndex = itemSlot.ItemIndex;
				item.ShowItemAmount = false;

				itemGrid.PlayShakeAnimation(itemSlot, () => {
					this.EndSequence();
					if (canOpen) {
						Unlocked(itemSlot.ItemIndex === LockpickItemIndex, () => {
							const itemInfo = this.ItemManager.GetItem(itemSlot.ItemIndex);
							if (hasFlag(itemInfo.Flags, ItemFlags.DestroyAfterUsage)) {
								ItemAnimation.Play(this, this.renderView, ItemAnimation.Type.Consume, targetPosition, () => {
									this.AddTimedEvent(250, () => {
										itemGrid.ResetAnimation(itemSlot);
										item.ShowItemAmount = false;
										item.Visible = false;
										itemGrid.HideTooltip();
										itemGrid.Disabled = true;
										this.EndSequence();
										openedAction?.();
									});
								}, 50);
								this.AddTimedEvent(250, () => {
									item.Visible = false;
									const itemIndex = itemSlot.ItemIndex;
									itemSlot.Remove(1);

									if (removeItemFromCharacter)
										this.InventoryItemRemoved(itemIndex, 1, targetPlayer);
								});
							} else {
								// Just move back
								this.StartSequence();
								itemGrid.HideTooltip();
								itemGrid.PlayMoveAnimation(itemSlot, null, () => {
									itemGrid.ResetAnimation(itemSlot);
									item.ShowItemAmount = false;
									item.Visible = false;
									itemGrid.HideTooltip();
									itemGrid.Disabled = true;
									this.EndSequence();
									openedAction?.();
								});
							}
						});
					} else {
						if (itemSlot.ItemIndex === LockpickItemIndex) { // Lockpick
							this.AddTimedEvent(50, () => { item.Visible = false; });
							ItemAnimation.Play(this, this.renderView, ItemAnimation.Type.Destroy, targetPosition, () => {
								layout.ShowClickChestMessage(this.DataNameProvider.LockpickBreaks, () => {
									const itemIndex = itemSlot.ItemIndex;
									itemSlot.Remove(1);

									if (removeItemFromCharacter)
										this.InventoryItemRemoved(itemIndex, 1, targetPlayer);

									if (itemSlot.Amount > 0) {
										this.StartSequence();
										itemGrid.HideTooltip();
										itemGrid.PlayMoveAnimation(itemSlot, itemGrid.GetSlotPosition(itemGrid.SlotFromItemSlot(itemSlot)), () => {
											itemGrid.ResetAnimation(itemSlot);
											this.EndSequence();

											if (showItemsAfterwards)
												StartUseItems();
										});
									} else {
										// This is the only case where an item is removed and the lock is not opened.
										// We have to check if this was the last item and the player is still able to
										// use items.
										if (!this.CurrentPartyMember.Inventory.Slots.some(s => s?.Empty === false)) {
											layout.EnableButton(1, false);
											itemGrid.HideTooltip();
											itemGrid.Disabled = true;
											layout.ShowChestMessage(null);
											this.UntrapMouse();
										} else if (showItemsAfterwards) {

											itemGrid.ResetAnimation(itemSlot);
											item.ShowItemAmount = true;
											item.Visible = true;

											StartUseItems();
										} else {
											itemGrid.HideTooltip();
											itemGrid.Disabled = true;
											layout.ShowChestMessage(null);
											this.UntrapMouse();
										}
									}
								});
							}, 50, null, item);
						} else {
							layout.ShowClickChestMessage(chest ? this.DataNameProvider.ThisItemDoesNotOpenChest : this.DataNameProvider.ThisItemDoesNotOpenDoor, () => {
								this.StartSequence();
								itemGrid.HideTooltip();
								itemGrid.PlayMoveAnimation(itemSlot, null, () => {
									itemGrid.ResetAnimation(itemSlot);
									this.EndSequence();

									if (showItemsAfterwards)
										StartUseItems();
									else {
										itemGrid.HideTooltip();
										itemGrid.Disabled = true;
										layout.ShowChestMessage(null);
										this.UntrapMouse();
									}

									if (!removeItemFromCharacter) {
										const item = this.ItemManager.GetItem(itemIndex);

										// If the item was used and therefore consumed/destroyed, we have to add it back.
										if (hasFlag(item.Flags, ItemFlags.DestroyAfterUsage)) {
											targetPlayer.AddItem(itemIndex, hasFlag(item.Flags, ItemFlags.Stackable));
											this.InventoryItemAdded(itemIndex, 1, targetPlayer);

											if (isActivePlayerItem)
												layout.EnableButton(1, true);
										}
									}
								});
							});
						}
					}
				});
			});
		};

		itemGrid.ItemClicked.add((_grid, _slotIndex, itemSlot) => {
			this.UntrapMouse();
			this.nextClickHandler = null;
			layout.ShowChestMessage(null);
			CheckKey(itemSlot, true, true);
		});

		// Lockpick button
		layout.AttachEventToButton(0, () => {
			// TODO: Can locks theoretically be lockpicked if they need a key? I guess in Ambermoon all locks with key have a lockpickingChanceReduction of 100%.
			//       But what would happen if this value was below 100% for such doors? For now we allow lockpicking those doors as we don't check for key index.
			const chance = Util.Limit(0, this.CurrentPartyMember.Skills[Skill.LockPicking].TotalCurrentValue, 100) - lockpickingChanceReduction;

			if (chance <= 0 || this.RollDice100() >= chance) {
				// Failed
				// Note: The trap is triggered by the follow-up event (if given) but only if a dice roll against DEX fails.
				const trapDisarmed = this.currentWindow.WindowParameters[2]; // Don't use the parameter as we could have disarmed it just yet.
				if (hasTrap && !trapDisarmed && this.RollDice100() >= this.CurrentPartyMember.Attributes[Attribute.Dexterity].TotalCurrentValue) {
					this.CloseWindow(failedAction);
				} else {
					layout.ShowClickChestMessage(this.DataNameProvider.UnableToPickTheLock);
				}
			} else {
				// Success
				Unlocked(false, openedAction);
			}
		});
		// Use item button
		layout.AttachEventToButton(1, StartUseItems);
		// Find trap button
		layout.AttachEventToButton(3, () => {
			const chance = Util.Limit(0, this.CurrentPartyMember.Skills[Skill.FindTraps].TotalCurrentValue, 100);

			if (hasTrap && chance > 0 && this.RollDice100() < chance) {
				layout.ShowClickChestMessage(this.DataNameProvider.FindTrap);
				this.currentWindow.WindowParameters[1] = true; // Found trap flag
				layout.EnableButton(3, false);
				layout.EnableButton(6, true);
			} else {
				layout.ShowClickChestMessage(this.DataNameProvider.DoesNotFindTrap);
			}
		});
		// Disarm trap button
		layout.AttachEventToButton(6, () => {
			const chance = Util.Limit(0, this.CurrentPartyMember.Skills[Skill.DisarmTraps].TotalCurrentValue, 100); // TODO: Is there a "find trap" reduction as well?

			if (chance <= 0 || this.RollDice100() >= chance) {
				if (this.RollDice100() >= this.CurrentPartyMember.Attributes[Attribute.Dexterity].TotalCurrentValue) {
					this.CloseWindow(failedAction);
				} else {
					layout.ShowClickChestMessage(this.DataNameProvider.UnableToDisarmTrap);
				}
			} else {
				// Trap was disarmed
				layout.ShowClickChestMessage(this.DataNameProvider.DisarmTrap);
				this.currentWindow.WindowParameters[2] = true; // Disarmed trap flag
				layout.EnableButton(6, false);
			}
		});
		// Exit button
		layout.AttachEventToButton(2, Exit);

		const CheckImmediateOpen = () => {
			if (usedKey === 0)
				return;

			this.StartSequence();
			const targetPosition = chest ? new Position(28, 76) : new Position(73, 102); // eslint-disable-line no-unused-vars
			itemGrid.Disabled = false;
			itemGrid.DisableDrag = true;
			const itemSlot = new ItemSlot();
			itemSlot.ItemIndex = usedKey;
			itemSlot.Amount = 1;
			itemGrid.Initialize([itemSlot], false);
			CheckKey(itemSlot, false, false);
		};

		if (!(initialMessage == null || initialMessage.trim().length === 0))
			layout.ShowClickChestMessage(initialMessage, CheckImmediateOpen);
		else
			CheckImmediateOpen();
	}

	// #endregion


	// #region Places

	GetMerchant(index) {
		return getValue(this.CurrentSavegame.Merchants, index);
	}

	// #endregion


	// #region Traps & Spinners

	TriggerTrap(trapEvent, lastEventStatus, x, y) {
		let targetFilter = null;
		let genderFilter = null;

		if (trapEvent.AffectedGenders !== GenderFlag.None && trapEvent.AffectedGenders !== GenderFlag.Both) {
			genderFilter = p => {
				const genderFlag = 1 << p.Gender;
				return hasFlag(trapEvent.AffectedGenders, genderFlag);
			};
		}

		const currentPartyMember = this.CurrentPartyMember;

		switch (trapEvent.Target) {
			case TrapEvent.TrapTarget.ActivePlayer:
				// Note: Don't check against the property CurrentPartyMember
				// directly as it might change if someone dies.
				targetFilter = p => p === currentPartyMember;
				break;
			default:
				break;
		}

		const GetDamage = _ => {
			if (trapEvent.BaseDamage === 0)
				return 0;

			return trapEvent.BaseDamage + this.RandomInt(0, Math.trunc(trapEvent.BaseDamage / 2) - 1);
		};

		const Finished = someoneDied => {
			if (someoneDied) {
				this.clickMoveActive = false;
				this.CurrentMobileAction = MobileAction.None;
				this.ResetMoveKeys(true);
			}

			if (trapEvent.Next != null) {
				EventExtensions.TriggerEventChain(this.Map, this, EventTrigger.Always, x,
					y, trapEvent.Next, lastEventStatus);
			} else {
				this.ResetMapCharacterInteraction(this.Map);
			}
		};

		this.DamageAllPartyMembers(GetDamage, p => {
			return targetFilter?.(p) !== false && genderFilter?.(p) !== false &&
				this.RollDice100() >= p.Attributes[Attribute.Luck].TotalCurrentValue;
		}, (p, finish) => {
			const allInputWasDisabled = this.allInputDisabled;

			const Next = () => {
				this.allInputDisabled = allInputWasDisabled;
				finish?.();
			};

			if (targetFilter?.(p) !== false) {
				this.allInputDisabled = false;
				this.ShowMessagePopup(p.Name + this.DataNameProvider.EscapedTheTrap, Next);
			} else
				Next();
		}, Finished, trapEvent.GetAilment());
	}

	Spin(direction, nextEvent) {
		if (!this.Is3D || this.WindowActive)
			return; // Should not happen

		if (direction === CharacterDirection.Random)
			direction = this.RandomInt(0, 3);

		// Spin at least for 180°
		let currentAngle = this.player3D.Angle;

		while (currentAngle < 360.0)
			currentAngle += 360.0;
		while (currentAngle >= 360.0)
			currentAngle -= 360.0;

		let targetAngle = direction * 90.0;
		let right = true;

		if (targetAngle <= currentAngle) {
			if (currentAngle - targetAngle < 180.0)
				targetAngle += 360.0;
			else
				right = false;
		} else if (targetAngle - currentAngle < 180.0) {
			currentAngle += 360.0;
			right = false;
		}

		const dist = targetAngle - currentAngle;
		const stepSize = right ? 15.0 : -15.0;
		const fullSteps = Math.max(Math.trunc(180 / 15), Util.Round(dist / stepSize));
		let halfStepSize = dist % 15.0;

		if (!right)
			halfStepSize = -halfStepSize;

		let stepIndex = 0;

		const Step = () => {
			if (stepIndex++ < fullSteps)
				this.player3D.TurnRight(stepSize);
			else
				this.player3D.TurnRight(halfStepSize);

			this.CurrentSavegame.CharacterDirection = this.player.Direction = this.player3D.Direction;
		};

		this.PlayTimedSequence(fullSteps + 1, Step, 65, () => {
			this.ResetMoveKeys();

			if (nextEvent != null) {
				EventExtensions.TriggerEventChain(this.Map, this, EventTrigger.Always,
					this.player.Position.X, this.player.Position.Y, nextEvent, true);
			}
		});
	}

	// #endregion


	// #region Rewards

	RewardPlayer(partyMember, rewardEvent, followAction) {
		const Change = (characterValue, amount, percentage, lpLike, increaseMax) => {
			let max = lpLike && !increaseMax ? characterValue.TotalMaxValue : characterValue.MaxValue;

			if (increaseMax)
				max = Math.max(max, Math.max(0, max + amount));

			if (percentage)
				amount = Math.trunc(amount * max / 100);

			if (increaseMax) {
				characterValue.MaxValue = max;

				if (characterValue.CurrentValue > characterValue.MaxValue)
					characterValue.CurrentValue = characterValue.MaxValue;
			} else
				characterValue.CurrentValue = Util.Limit(0, characterValue.CurrentValue + amount, max);
		};

		const RandomizeIfNecessary = value => rewardEvent.Random ? toUInt(1 + this.random.Next() % value) : value;

		const RewardValue = (characterValue, lpLike, increaseMax = false) => {
			const value = RandomizeIfNecessary(rewardEvent.Value);

			switch (rewardEvent.Operation) {
				case RewardEvent.RewardOperation.Increase:
					Change(characterValue, value, false, lpLike, increaseMax);
					break;
				case RewardEvent.RewardOperation.Decrease:
					Change(characterValue, -value, false, lpLike, increaseMax);
					break;
				case RewardEvent.RewardOperation.IncreasePercentage:
					Change(characterValue, value, true, lpLike, increaseMax);
					break;
				case RewardEvent.RewardOperation.DecreasePercentage:
					Change(characterValue, -value, true, lpLike, increaseMax);
					break;
				case RewardEvent.RewardOperation.Fill:
					if (increaseMax) {
						this.ShowMessagePopup('ERROR: Reward operation fill is not allowed on a max value.', followAction);
						return false;
					} else
						characterValue.CurrentValue = lpLike ? characterValue.TotalMaxValue : characterValue.MaxValue;
					break;
			}

			return true;
		};

		const features = this.Features;

		switch (rewardEvent.TypeOfReward) {
			case RewardEvent.RewardType.Attribute:
				if (rewardEvent.Attribute != null && rewardEvent.Attribute < Attribute.Age)
					RewardValue(partyMember.Attributes[rewardEvent.Attribute], false);
				else {
					this.ShowMessagePopup('ERROR: Invalid reward event attribute type.', followAction);
					return;
				}
				break;
			case RewardEvent.RewardType.Skill:
				if (rewardEvent.Skill != null)
					RewardValue(partyMember.Skills[rewardEvent.Skill], false);
				else {
					this.ShowMessagePopup('ERROR: Invalid reward event skill type.', followAction);
					return;
				}
				break;
			case RewardEvent.RewardType.HitPoints:
			{
				// Note: Rewards happen silently so there is no damage splash.
				// Looking at the original code there isn't even a die handling
				// when a negative reward would leave the LP at 0 but we do so here.
				RewardValue(partyMember.HitPoints, true);
				if (partyMember.Alive && partyMember.HitPoints.CurrentValue === 0)
					this.KillPartyMember(partyMember);
				else
					this.layout.UpdateCharacter(partyMember);
				break;
			}
			case RewardEvent.RewardType.SpellPoints:
				RewardValue(partyMember.SpellPoints, true);
				this.layout.UpdateCharacter(partyMember);
				break;
			case RewardEvent.RewardType.SpellLearningPoints:
			{
				switch (rewardEvent.Operation) {
					case RewardEvent.RewardOperation.Increase:
						partyMember.SpellLearningPoints = toUShort(Util.Min(65535, partyMember.SpellLearningPoints + RandomizeIfNecessary(rewardEvent.Value)));
						break;
					case RewardEvent.RewardOperation.Decrease:
						partyMember.SpellLearningPoints = toUShort(Util.Max(0, partyMember.SpellLearningPoints - RandomizeIfNecessary(rewardEvent.Value)));
						break;
				}
				break;
			}
			case RewardEvent.RewardType.Conditions:
			{
				if (rewardEvent.Conditions == null) {
					this.ShowMessagePopup('ERROR: Invalid reward event condition.', followAction);
					return;
				}

				const wasDead = !partyMember.Alive;

				switch (rewardEvent.Operation) {
					case RewardEvent.RewardOperation.Add:
						partyMember.Conditions |= rewardEvent.Conditions;
						break;
					case RewardEvent.RewardOperation.Remove:
						partyMember.Conditions &= ~rewardEvent.Conditions;
						break;
					case RewardEvent.RewardOperation.Toggle:
						partyMember.Conditions ^= rewardEvent.Conditions;
						break;
				}

				if (hasFlag(rewardEvent.Conditions, Condition.Blind) && partyMember === this.CurrentPartyMember)
					this.UpdateLight();

				if (wasDead && partyMember.Alive) {
					partyMember.HitPoints.CurrentValue = 1;
					this.layout.UpdateCharacter(partyMember, followAction);
					return;
				}

				break;
			}
			case RewardEvent.RewardType.UsableSpellTypes:
			{
				if (rewardEvent.UsableSpellTypes == null) {
					this.ShowMessagePopup('ERROR: Invalid reward event spell mastery.', followAction);
					return;
				}

				switch (rewardEvent.Operation) {
					case RewardEvent.RewardOperation.Add:
						partyMember.SpellMastery |= rewardEvent.UsableSpellTypes;
						break;
					case RewardEvent.RewardOperation.Remove:
						partyMember.SpellMastery &= ~rewardEvent.UsableSpellTypes;
						break;
					case RewardEvent.RewardOperation.Toggle:
						partyMember.SpellMastery ^= rewardEvent.UsableSpellTypes;
						break;
				}
				break;
			}
			case RewardEvent.RewardType.Languages:
			{
				if (rewardEvent.Languages == null && (!hasFlag(features, Features.ExtendedLanguages) || rewardEvent.ExtendedLanguages == null)) {
					this.ShowMessagePopup('ERROR: Invalid reward event language.', followAction);
					return;
				}

				switch (rewardEvent.Operation) {
					case RewardEvent.RewardOperation.Add:
						if (rewardEvent.Languages != null)
							partyMember.SpokenLanguages |= rewardEvent.Languages;
						else
							partyMember.SpokenExtendedLanguages |= rewardEvent.ExtendedLanguages;
						break;
					case RewardEvent.RewardOperation.Remove:
						if (rewardEvent.Languages != null)
							partyMember.SpokenLanguages &= ~rewardEvent.Languages;
						else
							partyMember.SpokenExtendedLanguages &= ~rewardEvent.ExtendedLanguages;
						break;
					case RewardEvent.RewardOperation.Toggle:
						if (rewardEvent.Languages != null)
							partyMember.SpokenLanguages ^= rewardEvent.Languages;
						else
							partyMember.SpokenExtendedLanguages ^= rewardEvent.ExtendedLanguages;
						break;
				}
				break;
			}
			case RewardEvent.RewardType.Experience:
			{
				if (partyMember.Race !== Race.Animal) {
					switch (rewardEvent.Operation) {
						case RewardEvent.RewardOperation.Increase:
							this.AddExperience(partyMember, RandomizeIfNecessary(rewardEvent.Value), followAction);
							return;
						case RewardEvent.RewardOperation.Decrease:
							partyMember.ExperiencePoints = toUInt(Util.Max(0, partyMember.ExperiencePoints - RandomizeIfNecessary(rewardEvent.Value)));
							break;
					}
				}
				break;
			}
			case RewardEvent.RewardType.MaxAttribute:
				if (rewardEvent.Attribute != null && rewardEvent.Attribute < Attribute.Age) {
					if (!RewardValue(partyMember.Attributes[rewardEvent.Attribute], false, true))
						return;
				} else {
					this.ShowMessagePopup('ERROR: Invalid reward event attribute type.', followAction);
					return;
				}
				break;
			case RewardEvent.RewardType.MaxSkill:
				if (rewardEvent.Skill != null && rewardEvent.Skill < 10) {
					if (!RewardValue(partyMember.Skills[rewardEvent.Skill], false, true))
						return;
				} else {
					this.ShowMessagePopup('ERROR: Invalid reward event skill type.', followAction);
					return;
				}
				break;
			case RewardEvent.RewardType.AttacksPerRound:
			{
				const oldAttacksPerRound = partyMember.AttacksPerRound;

				switch (rewardEvent.Operation) {
					case RewardEvent.RewardOperation.Increase:
						partyMember.AttacksPerRound = toByte(Util.Limit(1, partyMember.AttacksPerRound + RandomizeIfNecessary(rewardEvent.Value), 255));
						break;
					case RewardEvent.RewardOperation.Decrease:
						partyMember.AttacksPerRound = toByte(Util.Limit(1, partyMember.AttacksPerRound - RandomizeIfNecessary(rewardEvent.Value), 255));
						break;
				}

				if (partyMember.AttacksPerRound !== oldAttacksPerRound) {
					const currentAttacksPerRoundIncreaseLevels = Math.trunc(partyMember.Level / Math.max(1, partyMember.AttacksPerRound - 1));

					if (partyMember.AttacksPerRound === 1 && partyMember.AttacksPerRoundIncreaseLevels !== 0)
						partyMember.AttacksPerRoundIncreaseLevels = toUShort(Math.max(partyMember.AttacksPerRoundIncreaseLevels, partyMember.Level + 1));
					else if (partyMember.AttacksPerRound > 1)
						partyMember.AttacksPerRoundIncreaseLevels = toUShort(Math.max(1, currentAttacksPerRoundIncreaseLevels));
				}

				break;
			}
			case RewardEvent.RewardType.TrainingPoints:
			{
				switch (rewardEvent.Operation) {
					case RewardEvent.RewardOperation.Increase:
						partyMember.TrainingPoints = toUShort(Util.Min(65535, partyMember.TrainingPoints + RandomizeIfNecessary(rewardEvent.Value)));
						break;
					case RewardEvent.RewardOperation.Decrease:
						partyMember.TrainingPoints = toUShort(Util.Max(0, partyMember.TrainingPoints - RandomizeIfNecessary(rewardEvent.Value)));
						break;
				}
				break;
			}
			case RewardEvent.RewardType.Level:
			{
				switch (rewardEvent.Operation) {
					case RewardEvent.RewardOperation.Increase:
					{
						if (partyMember.Level >= 50 && hasFlag(features, Features.LevelShards)) {
							for (let i = 0; i < rewardEvent.Value; i++)
								partyMember.AddLevelShardEffects((min, max) => this.RandomInt(min, max), features);
							followAction?.();
							return;
						}
						const levelUps = Util.Limit(0, rewardEvent.Value, 50 - partyMember.Level);
						if (levelUps === 0) {
							followAction?.();
							return;
						}
						partyMember.Level = toByte(partyMember.Level + levelUps);
						for (let i = 0; i < levelUps; ++i) {
							if (partyMember.Race === Race.Animal) {
								let lpAdd = Math.trunc(partyMember.HitPointsPerLevel * this.RandomInt(50, 100) / 100);
								const tpAdd = Math.trunc(partyMember.TrainingPointsPerLevel * this.RandomInt(50, 100) / 100);

								if (hasFlag(features, Features.StaminaHPOnLevelUp))
									lpAdd += Math.trunc(partyMember.Attributes[Attribute.Stamina].TotalCurrentValue / 25);

								partyMember.HitPoints.MaxValue += lpAdd;
								partyMember.HitPoints.CurrentValue += lpAdd;
								partyMember.TrainingPoints = toUShort(Math.min(65535, partyMember.TrainingPoints + tpAdd));
							} else {
								partyMember.AddLevelUpEffects((min, max) => this.RandomInt(min, max), features);
							}
						}
						this.ShowLevelUpWindow(partyMember, followAction);
						return;
					}
				}
				break;
			}
			case RewardEvent.RewardType.Damage:
			{
				switch (rewardEvent.Operation) {
					case RewardEvent.RewardOperation.Increase:
						partyMember.BaseAttackDamage = toShort(Util.Min(32767, partyMember.BaseAttackDamage + RandomizeIfNecessary(rewardEvent.Value)));
						break;
					case RewardEvent.RewardOperation.Decrease:
						partyMember.BaseAttackDamage = toShort(Util.Max(0, partyMember.BaseAttackDamage - RandomizeIfNecessary(rewardEvent.Value)));
						break;
				}
				break;
			}
			case RewardEvent.RewardType.Defense:
			{
				switch (rewardEvent.Operation) {
					case RewardEvent.RewardOperation.Increase:
						partyMember.BaseDefense = toShort(Util.Min(32767, partyMember.BaseDefense + RandomizeIfNecessary(rewardEvent.Value)));
						break;
					case RewardEvent.RewardOperation.Decrease:
						partyMember.BaseDefense = toShort(Util.Max(0, partyMember.BaseDefense - RandomizeIfNecessary(rewardEvent.Value)));
						break;
				}
				break;
			}
			case RewardEvent.RewardType.MaxHitPoints:
			{
				// Note: Rewards happen silently so there is no damage splash.
				// Looking at the original code there isn't even a die handling
				// when a negative reward would leave the LP at 0 but we do so here.
				RewardValue(partyMember.HitPoints, true, true);
				if (partyMember.Alive && partyMember.HitPoints.CurrentValue === 0)
					this.KillPartyMember(partyMember);
				else
					this.layout.UpdateCharacter(partyMember);
				break;
			}
			case RewardEvent.RewardType.MaxSpellPoints:
				RewardValue(partyMember.SpellPoints, true, true);
				this.layout.UpdateCharacter(partyMember);
				break;
			case RewardEvent.RewardType.EmpowerSpells:
			{
				if (rewardEvent.Value < 3)
					partyMember.BattleFlags |= (1 << (rewardEvent.Value + 4));
				break;
			}
			case RewardEvent.RewardType.ChangePortrait:
			{
				const changed = partyMember.PortraitIndex !== rewardEvent.Value;
				partyMember.PortraitIndex = toByte(rewardEvent.Value);
				this.layout.UpdateCharacter(partyMember, followAction, changed);
				return;
			}
			case RewardEvent.RewardType.MagicArmorLevel:
			{
				switch (rewardEvent.Operation) {
					case RewardEvent.RewardOperation.Increase:
						partyMember.MagicDefense = toShort(Util.Min(32767, partyMember.MagicDefense + RandomizeIfNecessary(rewardEvent.Value)));
						break;
					case RewardEvent.RewardOperation.Decrease:
						partyMember.MagicDefense = toShort(Util.Max(0, partyMember.MagicDefense - RandomizeIfNecessary(rewardEvent.Value)));
						break;
				}
				break;
			}
			case RewardEvent.RewardType.MagicWeaponLevel:
			{
				switch (rewardEvent.Operation) {
					case RewardEvent.RewardOperation.Increase:
						partyMember.MagicAttack = toShort(Util.Min(32767, partyMember.MagicAttack + RandomizeIfNecessary(rewardEvent.Value)));
						break;
					case RewardEvent.RewardOperation.Decrease:
						partyMember.MagicAttack = toShort(Util.Max(0, partyMember.MagicAttack - RandomizeIfNecessary(rewardEvent.Value)));
						break;
				}
				break;
			}
			case RewardEvent.RewardType.Spells:
			{
				if (rewardEvent.Spells == null) {
					this.ShowMessagePopup('ERROR: Invalid reward event spell.', followAction);
					return;
				}

				let spellTypeIndex = -1;

				for (let i = 0; i < 4; i++) {
					if (hasFlag(partyMember.SpellMastery, 1 << i)) {
						spellTypeIndex = i;
						break;
					}
				}

				if (spellTypeIndex === -1) {
					followAction?.();
					return;
				}

				let setter;
				let currentSpells;

				switch (spellTypeIndex) {
					case 0:
						currentSpells = partyMember.LearnedHealingSpells;
						setter = value => { partyMember.LearnedHealingSpells = value; };
						break;
					case 1:
						currentSpells = partyMember.LearnedAlchemisticSpells;
						setter = value => { partyMember.LearnedAlchemisticSpells = value; };
						break;
					case 2:
						currentSpells = partyMember.LearnedMysticSpells;
						setter = value => { partyMember.LearnedMysticSpells = value; };
						break;
					default:
						currentSpells = partyMember.LearnedDestructionSpells;
						setter = value => { partyMember.LearnedDestructionSpells = value; };
						break;
				}

				switch (rewardEvent.Operation) {
					case RewardEvent.RewardOperation.Add:
						setter(toUInt(currentSpells | rewardEvent.Spells));
						break;
					case RewardEvent.RewardOperation.Remove:
						setter(toUInt(currentSpells & ~rewardEvent.Spells));
						break;
					case RewardEvent.RewardOperation.Toggle:
						setter(toUInt(currentSpells ^ rewardEvent.Spells));
						break;
				}
				break;
			}
		}

		followAction?.();
	}

	// #endregion


	// #region Input events

	SayWord(map, x, y, events, conditionEvent) {
		const wasPaused = this.paused;
		this.Pause();
		const CheckResume = () => {
			if (!wasPaused)
				this.Resume();
		};
		this.OpenDictionary(word => {
			this.layout.ClosePopup();

			const entry = this.textDictionary.Entries[conditionEvent.ObjectIndex];
			const match = entry.toUpperCase() === word.toUpperCase(); // string.Compare(a, b, ignoreCase: true) == 0
			const mapEventIfFalse = conditionEvent.ContinueIfFalseWithMapEventIndex === 0xffff
				? null : events[conditionEvent.ContinueIfFalseWithMapEventIndex];
			const event = match ? conditionEvent.Next : mapEventIfFalse;
			CheckResume();
			if (event != null)
				EventExtensions.TriggerEventChain(map, this, EventTrigger.Always, x, y, event, true);
		}, null, CheckResume);
	}

	EnterNumber(map, x, y, events, conditionEvent) {
		const wasPaused = this.paused;
		this.Pause();
		const CheckResume = () => {
			if (!wasPaused)
				this.Resume();
		};
		this.layout.OpenAmountInputBox(this.DataNameProvider.WhichNumber, null, null, 9999, number => {
			this.ClosePopup();
			const mapEventIfFalse = conditionEvent.ContinueIfFalseWithMapEventIndex === 0xffff
				? null : events[conditionEvent.ContinueIfFalseWithMapEventIndex];
			const event = (number === conditionEvent.ObjectIndex) === (conditionEvent.Value !== 0)
				? conditionEvent.Next : mapEventIfFalse;
			CheckResume();
			if (event != null)
				EventExtensions.TriggerEventChain(map, this, EventTrigger.Always, x, y, event, true);
		}, CheckResume);
	}

	// #endregion
}
