// Port of Ambermoon.Core/Game/Input.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Event, hasFlag, format } from '../../../runtime.js';
import { Position, FloatPosition } from '../../Ambermoon.Common/Position.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Direction } from '../../Ambermoon.Common/Direction.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import { ConditionEvent, ChestEvent, DoorEvent } from '../../Ambermoon.Data.Common/Event.js';
import { Map as DataMap } from '../../Ambermoon.Data.Common/Map.js';
import { Key } from '../Key.js';
import { KeyModifiers } from '../KeyModifiers.js';
import { MouseButtons } from '../MouseButtons.js';
import { EventTrigger } from '../MapExtensions.js';
import { EventExtensions } from '../EventExtensions.js';
import { Layer } from '../Render/Layer.js';
import { TextureAtlasManager } from '../Render/TextureAtlasManager.js';
import { RenderMap2D } from '../Render/RenderMap2D.js';
import { Global } from '../UI/Global.js';
import { Window } from '../UI/Window.js';
import { TextInput } from '../UI/TextInput.js';
import { ButtonGrid } from '../UI/ButtonGrid.js';
import { CustomTexts } from './CustomTexts.js';

export const MobileIconAction = Object.freeze({
	Eye: 0,
	Hand: 1,
	Mouth: 2,
	Transport: 3,
	Map: 4,
	SpellBook: 5,
	Camp: 6,
	Wait: 7,
	BattlePositions: 8,
	Options: 9,
});

export const MobileAction = Object.freeze({
	None: 0,
	Hand: 1,
	Eye: 2,
	Mouth: 3,
	Interact: 4,
});

const Mobile3DThreshold = 32;

// delegate DrawTouchFingerHandler(int x, int y, bool longPress, Rect? clipArea, bool behindPopup) is skipped

export class GameCore_Input {
	static Mobile3DThreshold = Mobile3DThreshold;

	static initFields(self) {
		self.drawTouchFingerRequest = null; // assigned in constructor
		self.showMobileTouchPadHandler = null; // assigned in constructor
		self.keyboardRequest = null; // assigned in constructor
		self.allInputWasDisabled = false;
		self.allInputDisabled = false;
		self.inputEnable = true;
		self.clickMoveActive = false;
		self.trappedAfterClickMoveActivation = false;
		self.trapMouseArea = null;
		self.trapMouseGameArea = null;
		self.preFullscreenChangeTrapMouseArea = null;
		self.preFullscreenMousePosition = null;
		self.mouseTrappingActive = false;
		self.lastMousePosition = new Position();
		self.mobileAutomapScroll = new FloatPosition();
		self.lastMobileAutomapFingerPosition = new Position();
		self.trappedMousePositionOffset = new Position();
		self.currentMobileAction = MobileAction.None;
		self.mobileActionIndicator = null; // assigned in constructor
		self.targetMode2DActive = false;
		self.disableUntrapping = false;

		self.MouseTrappedChanged = new Event();
		self.MousePositionChanged = new Event();

		self.HideMobileTouchpadDisableOverlay = false;
	}

	get Trapped() { return this.trapMouseArea != null; }
	get AllInputDisabled() { return this.allInputDisabled; }

	get CurrentMobileAction() { return this.currentMobileAction; }
	set CurrentMobileAction(value) {
		if (!this.CoreConfiguration.IsMobile || this.currentMobileAction === value)
			return;

		this.currentMobileAction = value;
		const layer = Layer.Cursor;
		const textureAtlas = TextureAtlasManager.Instance.GetOrCreate(layer);
		this.mobileActionIndicator.Visible = false;
		try {
			let offset;
			switch (this.currentMobileAction) {
				case MobileAction.Hand: offset = textureAtlas.GetOffset(CursorType.Hand); break;
				case MobileAction.Eye: offset = textureAtlas.GetOffset(CursorType.Eye); break;
				case MobileAction.Mouth: offset = textureAtlas.GetOffset(CursorType.Mouth); break;
				case MobileAction.Interact: offset = textureAtlas.GetOffset(CursorType.Target); break;
				default: offset = textureAtlas.GetOffset(0); break;
			}
			this.mobileActionIndicator.TextureAtlasOffset = offset;
			this.mobileActionIndicator.Layer = this.renderView.GetLayer(layer);
			this.mobileActionIndicator.Visible = this.currentMobileAction !== MobileAction.None;
			this.UpdateMobileActionIndicatorPosition();
		} catch {
			this.mobileActionIndicator.Visible = false;
		}
	}

	SetLastMousePosition(position) { this.lastMousePosition = position; }

	/**
	 * The 3x3 buttons will always be enabled!
	 */
	get InputEnable() { return this.inputEnable; }
	set InputEnable(value) {
		if (this.inputEnable === value)
			return;

		this.inputEnable = value;
		this.layout.ReleaseButtons();
		this.clickMoveActive = false;
		if (!this.inputEnable)
			this.layout.HideTooltip();
		this.UntrapMouse();

		if (!this.inputEnable) {
			this.ResetMoveKeys(true);
			this.CurrentMobileAction = MobileAction.None;
		}
	}

	GetMousePosition(position) {
		position = new Position(position); // Important to not modify passed position object!

		if (this.trapMouseArea != null)
			position = Position.op_Addition(position, this.trappedMousePositionOffset);

		return position;
	}

	TrapMouse(area) {
		if (this.clickMoveActive)
			this.trappedAfterClickMoveActivation = true;

		this.mouseTrappingActive = true;

		try {
			const newTrapArea = this.renderView.GameToScreen(area);
			if (Rect.op_Equality(this.trapMouseArea, newTrapArea))
				return;
			this.trapMouseGameArea = area;
			this.trapMouseArea = newTrapArea;
			this.trappedMousePositionOffset.X = 0;
			this.trappedMousePositionOffset.Y = 0;
			if (!this.trapMouseArea.Contains(this.lastMousePosition)) {
				const keepX = this.lastMousePosition.X >= this.trapMouseArea.Left && this.lastMousePosition.X <= this.trapMouseArea.Right;
				const keepY = this.lastMousePosition.Y >= this.trapMouseArea.Top && this.lastMousePosition.Y <= this.trapMouseArea.Bottom;
				if (!keepX)
					this.lastMousePosition.X = this.lastMousePosition.X > this.trapMouseArea.Right ? this.trapMouseArea.Right : this.trapMouseArea.Left;
				if (!keepY)
					this.lastMousePosition.Y = this.lastMousePosition.Y > this.trapMouseArea.Bottom ? this.trapMouseArea.Bottom : this.trapMouseArea.Top;
				this.UpdateCursor(this.lastMousePosition, MouseButtons.None);
			}
			this.MouseTrappedChanged.invoke(true, this.lastMousePosition);
		} finally {
			this.mouseTrappingActive = false;
		}
	}

	UntrapMouse() {
		this.trappedAfterClickMoveActivation = false;

		if (this.mouseTrappingActive)
			return;

		if (this.trapMouseArea == null)
			return;

		this.lastMousePosition = this.GetMousePosition(this.lastMousePosition);
		this.MouseTrappedChanged.invoke(false, this.lastMousePosition);
		this.trapMouseArea = null;
		this.trapMouseGameArea = null;
		this.trappedMousePositionOffset.X = 0;
		this.trappedMousePositionOffset.Y = 0;
	}

	OnMouseMove(position, buttons) {
		if (this.Trapped) {
			const trappedPosition = Position.op_Addition(position, this.trappedMousePositionOffset);

			if (trappedPosition.X < this.trapMouseArea.Left) {
				if (position.X < this.lastMousePosition.X)
					this.trappedMousePositionOffset.X += this.lastMousePosition.X - position.X;
			} else if (trappedPosition.X >= this.trapMouseArea.Right) {
				if (position.X > this.lastMousePosition.X)
					this.trappedMousePositionOffset.X -= position.X - this.lastMousePosition.X;
			}

			if (trappedPosition.Y < this.trapMouseArea.Top) {
				if (position.Y < this.lastMousePosition.Y)
					this.trappedMousePositionOffset.Y += this.lastMousePosition.Y - position.Y;
			} else if (trappedPosition.Y >= this.trapMouseArea.Bottom) {
				if (position.Y > this.lastMousePosition.Y)
					this.trappedMousePositionOffset.Y -= position.Y - this.lastMousePosition.Y;
			}

			if (!this.WindowActive && !this.layout.PopupActive && !this.is3D && this.targetMode2DActive) {
				this.Determine2DTargetMode(position);
			}
		}

		this.layout.MouseMoved(Position.op_Subtraction(position, this.lastMousePosition));

		this.lastMousePosition = new Position(position);
		position = this.GetMousePosition(position);
		this.UpdateCursor(position, buttons);
	}

	OnMouseWheel(xScroll, yScroll, mousePosition) {
		if (this.allInputDisabled)
			return;

		if (this.CoreConfiguration.IsMobile && this.currentWindow.Window === Window.Automap) {
			this.lastMobileAutomapFingerPosition = this.renderView.ScreenToGame(mousePosition);
			this.mobileAutomapScroll.X += xScroll * 4;
			this.mobileAutomapScroll.Y += yScroll * 4;
			return;
		}

		let scrolled = false;

		if (xScroll !== 0)
			scrolled = this.layout.ScrollX(xScroll);
		if (yScroll !== 0 && this.layout.ScrollY(yScroll))
			scrolled = true;

		if (scrolled) {
			mousePosition = this.GetMousePosition(mousePosition);
			this.UpdateCursor(mousePosition, MouseButtons.None);
		} else if (yScroll !== 0 && !this.WindowActive && !this.layout.PopupActive && !this.Is3D && !this.CoreConfiguration.IsMobile) {
			this.ScrollCursor(mousePosition, yScroll < 0);
		}
	}

	InputFocusChanged() {
		this.UpdateCursor();
		this.keyboardRequest?.(TextInput.FocusedInput != null, TextInput.FocusedInput?.Text ?? '');
	}

	Determine2DTargetMode(cursorPosition) {
		const gamePosition = this.renderView.ScreenToGame(this.GetMousePosition(cursorPosition));
		const playerArea = this.player2D.DisplayArea;

		const xDiff = gamePosition.X < playerArea.Left ? playerArea.Left - gamePosition.X : gamePosition.X - playerArea.Right;

		const yTargetRange = gamePosition.Y < playerArea.Top
			? playerArea.Top - gamePosition.Y <= Math.trunc(3 * RenderMap2D.TILE_HEIGHT / 2)
			: gamePosition.Y - playerArea.Bottom <= RenderMap2D.TILE_HEIGHT;
		//int yDiff = gamePosition.Y < playerArea.Top ? playerArea.Top - gamePosition.Y : gamePosition.Y - playerArea.Bottom;

		if (xDiff <= RenderMap2D.TILE_WIDTH && yTargetRange)
			this.CursorType = CursorType.Target;
		else
			this.CursorType = CursorType.Mouth;
	}

	TriggerMobileIconAction(mobileIconAction) {
		if (!this.CoreConfiguration.IsMobile || !this.InputEnable || this.allInputDisabled || this.PopupActive || this.WindowActive || this.currentWindow.Window !== Window.MapView)
			return;

		switch (mobileIconAction) {
			case MobileIconAction.Eye:
				if (this.Is3D)
					this.TriggerMapEvents(EventTrigger.Eye);
				else
					this.CursorType = CursorType.Eye;
				break;
			case MobileIconAction.Hand:
				if (this.Is3D)
					this.TriggerMapEvents(EventTrigger.Hand);
				else
					this.CursorType = CursorType.Hand;
				break;
			case MobileIconAction.Mouth:
				if (this.Is3D) {
					if (!this.TriggerMapEvents(EventTrigger.Mouth))
						this.SpeakToParty();
				} else
					this.CursorType = CursorType.Mouth;
				break;
			case MobileIconAction.Transport:
				if (!this.Is3D && this.layout.TransportEnabled)
					this.ToggleTransport();
				break;
			case MobileIconAction.Map:
				if (this.Is3D)
					this.ShowAutomap();
				break;
			case MobileIconAction.SpellBook:
				if (this.CanUseSpells())
					this.CastSpell(false);
				break;
			case MobileIconAction.Camp:
				if (this.Map?.CanCamp === true)
					this.OpenCamp(false);
				break;
			case MobileIconAction.Wait:
				this.layout.OpenWaitPopup();
				break;
			case MobileIconAction.BattlePositions:
				this.ShowBattlePositionWindow();
				break;
			case MobileIconAction.Options:
				this.showMobileTouchPadHandler?.(false);
				this.layout.OpenOptionMenu();
				break;
		}
	}

	ShowMobileTouchPadHandler() {
		if (this.CoreConfiguration.IsMobile)
			this.showMobileTouchPadHandler?.(true);
	}

	UpdateMobileActionIndicatorPosition() {
		if (!this.CoreConfiguration.IsMobile)
			return;

		if (this.Is3D) {
			const mapViewCenter = this.mapViewArea.Center;
			this.mobileActionIndicator.X = mapViewCenter.X - Math.trunc(this.mobileActionIndicator.Width / 2);
			this.mobileActionIndicator.Y = mapViewCenter.Y - Math.trunc(this.mobileActionIndicator.Height / 2);
		} else {
			this.mobileActionIndicator.X = this.player2D.DisplayArea.X;
			this.mobileActionIndicator.Y = this.player2D.DisplayArea.Y - this.mobileActionIndicator.Height;
		}
	}

	ShowMobileClickIndicator(x, y) {
		if (this.CoreConfiguration.IsMobile && this.mobileClickIndicator != null) {
			this.mobileClickIndicator.PaletteIndex = this.UIPaletteIndex;
			this.mobileClickIndicator.X = x;
			this.mobileClickIndicator.Y = y;
			this.mobileClickIndicator.Visible = true;
		}
	}

	ShowMobileClickIndicatorForPopup() {
		const position = this.layout.GetPopupClickIndicatorPosition();
		this.ShowMobileClickIndicator(position.X, position.Y);
	}

	HideMobileClickIndicator() {
		if (this.mobileClickIndicator != null)
			this.mobileClickIndicator.Visible = false;
	}

	HandleClickMovement() {
		if (!this.clickMoveActive || this.DisallowMoving()) {
			if (this.clickMoveActive) {
				if (!this.trappedAfterClickMoveActivation)
					this.UntrapMouse();
				this.clickMoveActive = false;
			}
			return;
		}

		// lock (cursor)
		{
			let speedFactor3D = 0.0;

			if (this.Is3D) {
				const map3DViewArea = this.constructor.Map3DViewArea;
				const position = this.GetMousePosition(this.lastMousePosition);
				const relativePosition = this.renderView.ScreenToGame(position);
				const center = map3DViewArea.Center;
				speedFactor3D = Math.max(2.0 * Math.abs(relativePosition.X - center.X) / map3DViewArea.Width,
					2.0 * Math.abs(relativePosition.Y - center.Y) / map3DViewArea.Height);
			}
			this.Move(false, speedFactor3D, this.cursor.Type);
		}
	}

	SetClickHandler(action) {
		this.nextClickHandler = _ => { action?.(); return true; };
	}

	OnFingerDown(position) {
		this.lastMobileAutomapFingerPosition = this.renderView.ScreenToGame(position);
	}

	OnFingerUp(position) {
		this.lastMobileAutomapFingerPosition = this.renderView.ScreenToGame(position);

		if (!this.CoreConfiguration.IsMobile)
			return;

		this.keys[Key.W] = false;
		this.keys[Key.A] = false;
		this.keys[Key.S] = false;
		this.keys[Key.D] = false;

		this.CurrentMobileAction = MobileAction.None;
	}

	OnFingerMoveTo(position) {
		if (!this.CoreConfiguration.IsMobile)
			return;

		if (this.currentWindow.Window === Window.Automap) {
			position = this.renderView.ScreenToGame(position);
			const diff = Position.op_Subtraction(position, this.lastMobileAutomapFingerPosition);
			this.lastMobileAutomapFingerPosition = position;
			this.mobileAutomapScroll.X -= 6.0 * diff.X / Global.VirtualScreenWidth;
			this.mobileAutomapScroll.Y -= 6.0 * diff.Y / Global.VirtualScreenHeight;
			return;
		}
	}

	OnKeyDown(key, modifiers, tapped = false) {
		if (this.allInputDisabled || this.pickingNewLeader || this.GameOverButtonsVisible)
			return;

		if (this.currentBattle != null && !this.currentBattle.RoundActive && this.trapMouseArea != null) {
			if (key === Key.Escape)
				this.CancelSpecificPlayerAction();
			return;
		}

		if (!this.InputEnable) {
			if (this.layout.PopupActive && !this.pickingNewLeader && !this.pickingTargetPlayer && !this.pickingTargetInventory) {
				this.layout.KeyDown(key, modifiers);
				return;
			}

			// In battle the space key can be used to click for next action.
			if (key === Key.Space && this.currentBattle?.WaitForClick === true) {
				if (!this.currentBattle.RoundActive && this.nextClickHandler != null) {
					this.nextClickHandler(MouseButtons.Left);
					this.nextClickHandler = null;
				} else
					this.currentBattle.Click(this.CurrentBattleTicks);
				return;
			}

			if (key === Key.Escape && this.currentBattle?.WaitForClick === true && !this.currentBattle.RoundActive && this.nextClickHandler != null) {
				this.nextClickHandler(MouseButtons.Left);
				this.nextClickHandler = null;
				return;
			}

			if (key === Key.Return && this.layout.HasQuestionYesButton()) {
				this.layout.KeyDown(Key.Return, KeyModifiers.None);
				return;
			}

			if (key !== Key.Escape && !(key >= Key.Num1 && key <= Key.Num9))
				return;

			if (this.layout.TextWaitsForClick || this.currentBattle?.WaitForClick === true) // allow only if there is no text active which waits for a click
				return;
		}

		if (this.pickingTargetPlayer) {
			if (key === Key.Escape)
				this.AbortPickingTargetPlayer();
			return;
		}
		if (this.pickingTargetInventory) {
			if (key === Key.Escape)
				this.layout.AbortPickingTargetInventory();
			return;
		}

		this.keys[key] = true;

		if (!this.WindowActive && !this.layout.PopupActive)
			this.Move(tapped);
		else if (this.currentWindow.Window === Window.BattlePositions && this.battlePositionDragging)
			return;
		else if (this.trapMouseArea != null && (this.currentWindow.Window === Window.Merchant ||
			this.currentWindow.Window === Window.Healer || this.currentWindow.Window === Window.Sage ||
			this.currentWindow.Window === Window.Blacksmith || this.currentWindow.Window === Window.Enchanter ||
			this.currentWindow.Window === Window.Door || (this.currentWindow.Window === Window.Chest && this.OpenStorage == null)) &&
			key !== Key.Up && key !== Key.Down && key !== Key.PageUp && key !== Key.PageDown && key !== Key.Escape)
			return;
		if (!this.WindowActive && !this.PopupActive && key >= Key.Number0 && key <= Key.Number9 && hasFlag(modifiers, KeyModifiers.Control)) {
			let saveGameId = key - Key.Number0;
			if (saveGameId === 0)
				saveGameId = 10;
			if (hasFlag(modifiers, KeyModifiers.Shift)) {
				this.LoadGame(saveGameId, false, false, null, false, _ => {
					if (this.CoreConfiguration.ShowSaveLoadMessage) {
						this.ShowBriefMessagePopup(
							format(CustomTexts.GetText(this.GameLanguage, CustomTexts.Index.GameLoaded), saveGameId),
							1500);
					}
				});
			} else {
				const name = `QuickSave${saveGameId}`;
				this.SaveGame(saveGameId, name);
				if (this.CoreConfiguration.ShowSaveLoadMessage) {
					this.ShowBriefMessagePopup(
						format(CustomTexts.GetText(this.GameLanguage, CustomTexts.Index.GameSaved), name),
						1500);
				}
			}
		}
		switch (key) {
			case Key.Escape:
			{
				if (this.Ingame) {
					if (this.layout.PopupActive) {
						if (TextInput.FocusedInput != null)
							TextInput.FocusedInput.KeyDown(key);
						else
							this.layout.ClosePopup();
					} else if (this.layout.InventoryMessageWaitsForClick) {
						this.layout.ClickInventoryMessage();
					} else {
						if (this.layout.IsDragging) {
							this.layout.CancelDrag();
							this.CursorType = CursorType.Sword;
						} else if (this.currentWindow.Window === Window.Automap) {
							this.nextClickHandler?.(MouseButtons.Right);
							this.nextClickHandler = null;
						} else if (this.nextClickHandler != null && this.nextClickHandler?.(MouseButtons.Right) === true) {
							this.nextClickHandler = null;
						} else if (this.layout.OptionMenuOpen) {
							this.layout.PressButton(2, this.CurrentTicks);
						} else if (this.InputEnable) {
							if (this.currentWindow.Closable)
								this.layout.PressButton(2, this.CurrentTicks);
							else if (!this.WindowActive && !this.is3D) {
								if (this.CursorType === CursorType.Eye ||
									this.CursorType === CursorType.Mouth ||
									this.CursorType === CursorType.Hand ||
									this.CursorType === CursorType.Target) {
									this.CursorType = CursorType.Sword;
									this.UpdateCursor(this.lastMousePosition, MouseButtons.None);
								}
							}
						} else {
							if (this.layout.HasQuestionNoButton())
								this.layout.KeyDown(Key.Escape, KeyModifiers.None);
							return;
						}
					}
				}

				break;
			}
			case Key.F1:
			case Key.F2:
			case Key.F3:
			case Key.F4:
			case Key.F5:
			case Key.F6:
				if (!this.layout.PopupActive && !this.layout.IsDragging)
					this.OpenPartyMember(key - Key.F1, this.currentWindow.Window !== Window.Stats);
				break;
			case Key.Num1:
			case Key.Num2:
			case Key.Num3:
			case Key.Num4:
			case Key.Num5:
			case Key.Num6:
			case Key.Num7:
			case Key.Num8:
			case Key.Num9:
			{
				if (this.layout.PopupDisableButtons || this.layout.IsDragging || this.layout.InventoryMessageWaitsForClick)
					break;

				const index = key - Key.Num1;
				const column = index % 3;
				const row = 2 - Math.trunc(index / 3);
				const newCursorType = this.layout.PressButton(column + row * 3, this.CurrentTicks);

				if (newCursorType != null)
					this.CursorType = newCursorType;

				break;
			}
			default:
				if (this.InputEnable && this.is3D && this.currentWindow.Window === Window.MapView && key === Key.Space)
					this.TriggerMapEvents(null);
				else if (this.currentWindow.Window === Window.Automap && (key === Key.Space || key === Key.M)) {
					this.nextClickHandler?.(MouseButtons.Right);
					this.nextClickHandler = null;
				} else if (this.WindowActive || this.layout.PopupActive)
					this.layout.KeyDown(key, modifiers);
				else if (key === Key.Return)
					this.ToggleButtonGridPage();
				break;
		}

		this.lastMoveTicksReset = this.CurrentTicks;
	}

	OnKeyUp(key, modifiers) {
		if (this.allInputDisabled || this.pickingTargetPlayer || this.pickingTargetInventory)
			return;

		if (!this.InputEnable || this.pickingNewLeader) {
			if (key !== Key.Escape && !(key >= Key.Num1 && key <= Key.Num9))
				return;

			if (this.layout.TextWaitsForClick) // allow only if there is no text active which waits for a click
				return;
		}

		this.keys[key] = false;

		switch (key) {
			case Key.Num1:
			case Key.Num2:
			case Key.Num3:
			case Key.Num4:
			case Key.Num5:
			case Key.Num6:
			case Key.Num7:
			case Key.Num8:
			case Key.Num9:
			{
				const index = key - Key.Num1;
				const column = index % 3;
				const row = 2 - Math.trunc(index / 3);
				const immediately = this.CurrentWindow.Window === Window.MapView && index !== 4;
				this.layout.ReleaseButton(column + row * 3, immediately);

				break;
			}
		}
	}

	OnKeyChar(keyChar) {
		if (this.allInputDisabled)
			return;

		if (keyChar >= '1' && keyChar <= '6') {
			const slot = keyChar.charCodeAt(0) - '1'.charCodeAt(0);

			if (!this.keys[Key.Num1 + slot]) {
				const partyMember = this.GetPartyMember(slot);

				if (this.pickingTargetPlayer) {
					if (partyMember != null)
						this.FinishPickingTargetPlayer(slot);
					return;
				}
				if (this.pickingTargetInventory) {
					if (partyMember != null)
						this.layout.TargetInventoryPlayerSelected(slot, partyMember);
					return;
				}
			}
		}

		if (!this.pickingNewLeader && this.layout.KeyChar(keyChar))
			return;

		if (!this.InputEnable)
			return;

		if (!this.PopupActive && (keyChar >= '1' && keyChar <= '6')) {
			const slot = keyChar.charCodeAt(0) - '1'.charCodeAt(0);

			if (this.layout.IsDragging) {
				let cursorType = CursorType.Sword;
				let clicked;
				[clicked, cursorType] = this.layout.Click(Global.ExtendedPartyMemberPortraitAreas[slot].Position, MouseButtons.Left, cursorType, this.CurrentTicks, this.pickingNewLeader, this.pickingTargetPlayer, this.pickingTargetInventory);
				if (clicked)
					this.CursorType = cursorType;
			} else if (!this.keys[Key.Num1 + slot])
				this.SetActivePartyMember(slot);
		}

		if (!this.WindowActive && !this.layout.PopupActive) {
			if (keyChar.toLowerCase() === 'm' && this.Ingame && this.is3D)
				this.ShowAutomap();
		}
	}

	OnLongPress(position) {
		if (!this.CoreConfiguration.IsMobile)
			return;

		if (this.CurrentWindow.Window !== Window.MapView) {
			this.OnMouseDown(position, MouseButtons.Right);
			this.OnMouseUp(position, MouseButtons.Right);
		} else {
			const relativePosition = this.renderView.ScreenToGame(position);

			if (!this.mapViewArea.Contains(relativePosition)) {
				/*if (Global.UpperRightArea.Contains(relativePosition))
				{
					if (!mobileMovementIndicatorEnabled)
						MobileMovementIndicatorEnabled = true;
					else if (!Global.MobileMovementIndicator.Contains(relativePosition))
						MobileMovementIndicatorEnabled = false;
				}*/

				// If long press on an arrow button, we start button movement
				if (this.layout.ButtonGridPage === 0 && Global.ButtonGridArea.Contains(relativePosition)) {
					for (let i = 0; i < 9; i++) {
						if (i === 4)
							continue;

						if (ButtonGrid.ButtonAreas[i].Contains(relativePosition)) {
							this.layout.PressButton(i, this.CurrentTicks);
							return;
						}
					}
				}

				this.OnMouseDown(position, MouseButtons.Right);
				this.OnMouseUp(position, MouseButtons.Right);
				return;
			}

			relativePosition.Offset(-this.mapViewArea.Left, -this.mapViewArea.Top);

			if (this.is3D) {
				this.TriggerMapEvents(null);
			} else {
				const tilePosition = this.renderMap2D.PositionToTile(relativePosition);

				if (tilePosition != null) {
					const tileX = tilePosition.X;
					const tileY = tilePosition.Y;

					const character = this.renderMap2D.GetCharacterFromTile(tileX, tileY);

					if (character?.IsConversationPartner === true) {
						const xDist = Math.abs(this.player2D.Position.X - tilePosition.X);
						const yDist = Math.abs(this.player2D.Position.Y - tilePosition.Y);

						if (xDist > 3 || yDist > 3) {
							this.ShowMessagePopup(this.GetCustomText(CustomTexts.Index.MobileTargetOutOfReach));
							return;
						}

						if (character.Interact(EventTrigger.Mouth, this.renderMap2D.get(tileX, tileY).Type === DataMap.TileType.Bed))
							return;
					}

					const event = this.renderMap2D.GetEvent(tileX, tileY, this.CurrentSavegame);

					const TriggerEvent = (trigger) => {
						const range = trigger === EventTrigger.Mouth ? 3 : 2;

						const xDist = Math.abs(this.player2D.Position.X - tilePosition.X);
						const yDist = Math.abs(this.player2D.Position.Y - tilePosition.Y);

						if (xDist > range || yDist > range) {
							this.ShowMessagePopup(this.GetCustomText(CustomTexts.Index.MobileTargetOutOfReach));
							return;
						}

						const map = this.renderMap2D.GetMapFromTile(tileX, tileY);
						EventExtensions.TriggerEventChain(map, this, trigger, tileX % map.Width, tileY % map.Height, event);
					};

					if (event instanceof ConditionEvent) {
						const condition = event;
						if (condition.TypeOfCondition === ConditionEvent.ConditionType.EnterNumber ||
							condition.TypeOfCondition === ConditionEvent.ConditionType.Eye ||
							condition.TypeOfCondition === ConditionEvent.ConditionType.Hand ||
							condition.TypeOfCondition === ConditionEvent.ConditionType.Mouth ||
							condition.TypeOfCondition === ConditionEvent.ConditionType.MultiCursor ||
							condition.TypeOfCondition === ConditionEvent.ConditionType.SayWord) {
							const GetMultiCursorTrigger = () => {
								const flags = condition.ObjectIndex;
								if ((flags & 0x4) !== 0)
									return EventTrigger.Mouth; // check and return this first as it has a higher range
								if ((flags & 0x1) !== 0)
									return EventTrigger.Hand;
								if ((flags & 0x2) !== 0)
									return EventTrigger.Eye;

								return EventTrigger.Always;
							};

							let trigger;
							switch (condition.TypeOfCondition) {
								case ConditionEvent.ConditionType.Eye: trigger = EventTrigger.Eye; break;
								case ConditionEvent.ConditionType.Hand: trigger = EventTrigger.Hand; break;
								case ConditionEvent.ConditionType.EnterNumber: trigger = EventTrigger.Hand; break;
								case ConditionEvent.ConditionType.MultiCursor: trigger = GetMultiCursorTrigger(); break;
								default: trigger = EventTrigger.Mouth; break;
							}

							TriggerEvent(trigger);
							return;
						}
					} else if (event instanceof ChestEvent) {
						const chestEvent = event;
						if (!chestEvent.CloseWhenEmpty || chestEvent.NoSave) {
							TriggerEvent(EventTrigger.Eye);
							return;
						} else {
							const chest = this.GetChest(chestEvent.RealChestIndex);

							if (!chest.Empty) {
								TriggerEvent(EventTrigger.Eye);
								return;
							}
						}
					} else if (event instanceof DoorEvent) {
						const doorEvent = event;
						if (this.CurrentSavegame.IsDoorLocked(doorEvent.Index)) {
							TriggerEvent(EventTrigger.Eye);
							return;
						}
					}
				}
			}
		}
	}

	OnMouseUp(cursorPosition, buttons) {
		this.lastMousePosition = new Position(cursorPosition);

		if (this.allInputDisabled) {
			this.layout.ClearLeftUpIgnoring();
			return;
		}

		const position = this.renderView.ScreenToGame(this.GetMousePosition(cursorPosition));

		if (this.currentBattle != null && buttons === MouseButtons.Right) {
			if (this.CheckBattleRightClick())
				return;
		}

		if (hasFlag(buttons, MouseButtons.Right)) {
			const [cursorType] = this.layout.RightMouseUp(position, this.CurrentTicks);

			if (cursorType != null)
				this.CursorType = cursorType;
			else if (this.is3D && !this.WindowActive && !this.layout.PopupActive && this.CursorType === CursorType.Target)
				this.CursorType = CursorType.Wait;
		}

		if (hasFlag(buttons, MouseButtons.Left)) {
			if (this.clickMoveActive) {
				this.clickMoveActive = false;

				if (this.is3D)
					this.UntrapMouse();
			}

			const [cursorType] = this.layout.LeftMouseUp(position, this.CurrentTicks);

			if (this.trapMouseArea != null)
				this.disableUntrapping = true;

			if (cursorType != null && cursorType !== CursorType.None)
				this.CursorType = cursorType;
			else // Note: Don't use cursorPosition here as trapping might have updated it
				this.UpdateCursor(this.GetMousePosition(this.lastMousePosition), MouseButtons.None);

			this.disableUntrapping = false;
		}

		if (TextInput.FocusedInput != null)
			this.CursorType = CursorType.None;
	}

	OnMouseDown(position, buttons, keyModifiers = KeyModifiers.None) {
		this.lastMousePosition = new Position(position);

		// Special case to abort multiple monster start animations in battle
		if (this.Ingame && this.allInputDisabled && !this.pickingNewLeader && this.currentWindow.Window === Window.Battle &&
			this.currentBattle?.StartAnimationPlaying === true && this.currentBattle.WaitForClick) {
			this.currentBattle.Click(this.CurrentBattleTicks);
			return;
		}

		if (this.allInputDisabled)
			return;

		if (this.nextClickHandler != null) {
			if (this.nextClickHandler(buttons)) {
				this.nextClickHandler = null;
				return;
			}
		}

		position = this.GetMousePosition(position);

		if (this.Ingame) {
			const relativePosition = this.renderView.ScreenToGame(position);

			if (!this.WindowActive && !this.layout.PopupActive && this.InputEnable && !this.pickingNewLeader &&
				!this.pickingTargetPlayer && !this.pickingTargetInventory && this.mapViewArea.Contains(relativePosition)) {
				// click into the map area
				if (buttons === MouseButtons.Right) {
					if (this.is3D) {
						const PlayTurnSequence = (steps, turnAction) => {
							this.PlayTimedSequence(steps, () => {
								turnAction?.();
								this.CurrentSavegame.CharacterDirection = this.player.Direction = this.player3D.Direction;
							}, 65);
						};

						switch (this.CursorType) {
							case CursorType.ArrowTurnLeft:
								PlayTurnSequence(6, () => this.player3D.TurnLeft(15.0));
								return;
							case CursorType.ArrowTurnRight:
								PlayTurnSequence(6, () => this.player3D.TurnRight(15.0));
								return;
							case CursorType.ArrowRotateLeft:
								PlayTurnSequence(12, () => this.player3D.TurnLeft(15.0));
								return;
							case CursorType.ArrowRotateRight:
								PlayTurnSequence(12, () => this.player3D.TurnRight(15.0));
								return;
							case CursorType.Wait:
								this.CursorType = CursorType.Target;
								this.TriggerMapEvents(null);
								return;
						}
					} else if (this.CursorType > CursorType.Sword && this.CursorType <= CursorType.Wait) {
						this.Determine2DTargetMode(position);
						this.targetMode2DActive = true;
						return;
					}

					if (this.cursor.Type > CursorType.Wait)
						this.CursorType = CursorType.Sword;
				}
				if (!hasFlag(buttons, MouseButtons.Left))
					return;

				relativePosition.Offset(-this.mapViewArea.Left, -this.mapViewArea.Top);
				const previousCursor = this.cursor.Type;

				if (this.cursor.Type === CursorType.Eye) {
					this.CurrentMobileAction = MobileAction.None;
					this.TriggerMapEvents(EventTrigger.Eye, relativePosition);
				} else if (this.cursor.Type === CursorType.Hand) {
					this.CurrentMobileAction = MobileAction.None;
					this.TriggerMapEvents(EventTrigger.Hand, relativePosition);
				} else if (this.cursor.Type === CursorType.Mouth) {
					if (!this.TriggerMapEvents(EventTrigger.Mouth, relativePosition)) {
						if (!this.is3D && this.player2D?.DisplayArea.Contains(Position.op_Addition(this.mapViewArea.Position, relativePosition)) === true) {
							this.CurrentMobileAction = MobileAction.None;
							this.SpeakToParty();
						}
					} else {
						this.CurrentMobileAction = MobileAction.None;
					}
				} else if (this.cursor.Type === CursorType.Target && !this.is3D) {
					if (!this.TriggerMapEvents(EventTrigger.Mouth, relativePosition)) {
						if (!this.TriggerMapEvents(EventTrigger.Eye, relativePosition)) {
							if (this.TriggerMapEvents(EventTrigger.Hand, relativePosition))
								this.CurrentMobileAction = MobileAction.None;
						} else {
							this.CurrentMobileAction = MobileAction.None;
						}
					} else {
						this.CurrentMobileAction = MobileAction.None;
					}
				} else if (this.cursor.Type === CursorType.Wait) {
					this.GameTime.Tick();
				} else if (this.cursor.Type > CursorType.Sword && this.cursor.Type < CursorType.Wait) {
					if (this.is3D)
						this.TrapMouse(this.constructor.Map3DViewArea);
					this.clickMoveActive = true;
					this.lastMoveTicksReset = this.CurrentTicks;
					this.HandleClickMovement();
				} else if (this.CoreConfiguration.IsMobile) {
					this.TriggerMapEvents(null);
				}

				if (this.cursor.Type > CursorType.Wait) {
					if (this.cursor.Type !== CursorType.Click || previousCursor === CursorType.Click)
						this.CursorType = CursorType.Sword;
				}
				return;
			} else {
				if (!this.pickingNewLeader && this.currentBattle != null && this.currentWindow.Window === Window.Battle) {
					if (this.currentBattle.WaitForClick) {
						this.CursorType = CursorType.Sword;
						this.currentBattle.Click(this.CurrentBattleTicks);
						return;
					} else {
						this.currentBattle.ResetClick();
					}
				}

				let cursorType = CursorType.Sword;
				[, cursorType] = this.layout.Click(relativePosition, buttons, cursorType, this.CurrentTicks, this.pickingNewLeader, this.pickingTargetPlayer, this.pickingTargetInventory, keyModifiers);
				this.disableUntrapping = true;
				this.CursorType = cursorType;

				if (!this.allInputDisabled && this.InputEnable && !this.pickingNewLeader && !this.pickingTargetPlayer && !this.pickingTargetInventory) {
					[, cursorType] = this.layout.Hover(relativePosition, cursorType); // Update cursor
					if (this.cursor.Type !== CursorType.None)
						this.CursorType = cursorType;
				}

				this.disableUntrapping = false;
			}
		} else {
			this.CursorType = CursorType.Sword;
		}

		if (TextInput.FocusedInput != null)
			this.CursorType = CursorType.None;
	}

	OnMobileMove(direction) {
		if (!this.CoreConfiguration.IsMobile)
			return;

		if (this.CurrentWindow.Window !== Window.MapView)
			return;

		this.keys[Key.W] = false;
		this.keys[Key.A] = false;
		this.keys[Key.S] = false;
		this.keys[Key.D] = false;

		switch (direction) {
			case Direction.Up:
				this.keys[Key.W] = true;
				break;
			case Direction.UpLeft:
				this.keys[Key.W] = true;
				this.keys[Key.A] = true;
				break;
			case Direction.UpRight:
				this.keys[Key.W] = true;
				this.keys[Key.D] = true;
				break;
			case Direction.Down:
				this.keys[Key.S] = true;
				break;
			case Direction.DownLeft:
				this.keys[Key.S] = true;
				this.keys[Key.A] = true;
				break;
			case Direction.DownRight:
				this.keys[Key.S] = true;
				this.keys[Key.D] = true;
				break;
			case Direction.Left:
				this.keys[Key.A] = true;
				break;
			case Direction.Right:
				this.keys[Key.D] = true;
				break;
			default:
				break;
		}
	}
}
