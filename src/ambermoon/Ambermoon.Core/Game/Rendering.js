// Port of Ambermoon.Core/Game/Rendering.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Event, Queue, newArray } from '../../runtime.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { FloatPosition } from '../../Ambermoon.Common/Position.js';
import { DirectionExtensions } from '../../Ambermoon.Common/Direction.js';
import { PartyMember } from '../../Ambermoon.Data.Common/PartyMember.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import { Color as TextColor, TextColors } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { Spell } from '../../Ambermoon.Data.Common/Enumerations/Spells.js';
import { MouseButtons } from '../MouseButtons.js';
import { Color } from '../Render/Color.js';
import { RenderMap2D } from '../Render/RenderMap2D.js';
import { SpellAnimation } from '../Render/SpellAnimation.js';
import { TextAlign } from '../Render/TextAlign.js';
import { BuiltinTooltips } from '../UI/BuiltinTooltips.js';
import { Global } from '../UI/Global.js';
import { LayoutType } from '../UI/Layout.js';
import { TimedGameEvent } from './Lifecycle.js';
import { MobileAction } from './Input.js';

const FadeTime = 1000;
const MaxBaseLine = 0x4000;
// Note: This is half the max base line which is used for the player in complete
// darkness. Big gaps are needed as the z buffer precision is lower with higher distance.
const FowBaseLine = 0x2000;

const ShakeOffsetFactors = [
	-0.5, 0.0, 1.0, 0.5, -1.0, 0.0, 0.5
];

/**
 * Character info texts that may change while
 * in Inventory/Stats window.
 */
export const CharacterInfo = Object.freeze({
	Age: 0,
	Level: 1,
	EP: 2,
	LP: 3,
	SP: 4,
	SLPAndTP: 5,
	GoldAndFood: 6,
	Attack: 7,
	Defense: 8,
	Weight: 9,
	/** Gold of the conversating party member. */
	ConversationGold: 10,
	/** Food of the conversating party member. */
	ConversationFood: 11,
	ChestGold: 12,
	ChestFood: 13,
	/** Name of the conversating party member. */
	ConversationPartyMember: 14,
});

let map2DViewArea = null;
let map3DViewArea = null;

export class GameCore_Rendering {
	static FadeTime = FadeTime;
	static MaxBaseLine = MaxBaseLine;
	static FowBaseLine = FowBaseLine;
	static ShakeOffsetFactors = ShakeOffsetFactors;

	static get Map2DViewArea() {
		return map2DViewArea ??= new Rect(Global.Map2DViewX, Global.Map2DViewY,
			Global.Map2DViewWidth, Global.Map2DViewHeight);
	}

	static get Map3DViewArea() {
		return map3DViewArea ??= new Rect(Global.Map3DViewX, Global.Map3DViewY,
			Global.Map3DViewWidth, Global.Map3DViewHeight);
	}

	static initFields(self) {
		self.renderView = null;

		self.Fading = false;

		//#region Misc rendering

		self.blinkingHighlight = false;
		self.ouchEvent = new TimedGameEvent();
		self.hurtPlayerEvent = new TimedGameEvent();
		self.ouchSprite = null;
		self.hurtPlayerSprites = newArray(6); // splash (MaxPartyMembers)
		self.hurtPlayerDamageTexts = newArray(6); // (MaxPartyMembers)
		self.drugOverlay = null;
		self.lastDrugColorChangeTicks = 0;
		self.lastDrugMouseMoveTicks = 0;
		// Note: Multicast delegate in C# (GameWindow uses +=), so it is an Event here.
		self.DrugTicked = new Event();
		self.mobileClickIndicator = null;

		/**
		 * This is used for screen shaking.
		 * Position is in percentage of the resolution.
		 */
		self.ViewportOffset = null;

		//#endregion

		//#region UI

		self.weightDisplayBlinking = false;
		self.mapViewRightFillArea = null;
		self.mapViewArea = GameCore_Rendering.Map2DViewArea;
		self.buttonGridBackground = null;
		self.characterInfoTexts = new Map();
		self.characterInfoPanels = new Map();
		self.characterInfoStatTooltips = new Map();

		//#endregion

		//#region Map

		self.renderMap2D = null;
		self.renderMap3D = null;
		self.fow2D = null;
		self.lightIntensity = 0;
		self.lightEffectProvider = null;

		//#endregion

		//#region Player

		self.player = null;
		self.player2D = null;
		self.player3D = null;
		self.camera3D = null;
		self.lastPlayerPosition = null;

		//#endregion

		//#region Palettes & Colors

		self.currentUIPaletteIndex = 0;

		self.PrimaryUIPaletteIndex = 0;
		self.SecondaryUIPaletteIndex = 0;
		self.AutomapPaletteIndex = 0;

		//#endregion

		//#region Cursor

		self.cursor = null;

		//#endregion
	}

	//#region Misc rendering

	/**
	 * ShakeScreen(TimeSpan durationPerShake, int numShakes, int pixelAmplitude)
	 * ShakeScreen(TimeSpan durationPerShake, int numShakes, float amplitude)
	 * durationPerShake in milliseconds. An integer amplitude is treated as pixel amplitude.
	 */
	ShakeScreen(durationPerShake, numShakes, amplitude) {
		if (Number.isInteger(amplitude)) // int pixelAmplitude overload
			amplitude = amplitude / Global.VirtualScreenHeight;

		let shakeIndex = 0;

		const Shake = () => {
			if (++shakeIndex === numShakes) {
				this.ViewportOffset = null;
			} else {
				this.ViewportOffset = new FloatPosition(0.0, amplitude * ShakeOffsetFactors[(shakeIndex - 1) % ShakeOffsetFactors.length]);
				this.AddTimedEvent(durationPerShake, Shake);
			}
		};

		Shake();
	}

	ShowDamageSplash(partyMember, damageProvider, finished) {
		const slot = this.SlotFromPartyMember(partyMember);
		this.layout.SetCharacter(slot, partyMember);
		this.ShowPlayerDamage(slot, damageProvider?.(partyMember) ?? 0);
		finished?.();
	}

	DisplayOuch() {
		if (this.is3D) {
			this.ouchSprite.X = 88;
			this.ouchSprite.Y = 65;
			this.ouchSprite.Resize(32, 23);
		} else {
			const playerArea = this.player2D.DisplayArea;
			this.ouchSprite.X = playerArea.X + 16;
			this.ouchSprite.Y = playerArea.Y - 24;
			this.ouchSprite.Resize(Math.min(32, GameCore_Rendering.Map2DViewArea.Right - this.ouchSprite.X),
				Math.min(23, GameCore_Rendering.Map2DViewArea.Bottom - this.ouchSprite.Y));
		}

		this.ouchSprite.Visible = true;

		this.RenewTimedEvent(this.ouchEvent, 150);
	}

	ShowPlayerDamage(slot, amount) {
		const area = new Rect(Global.PartyMemberPortraitAreas[slot]);
		this.hurtPlayerSprites[slot].X = area.X;
		this.hurtPlayerSprites[slot].Y = area.Y + 1;
		this.hurtPlayerSprites[slot].Visible = true;
		this.hurtPlayerDamageTexts[slot].Text = this.renderView.TextProcessor.CreateText(amount > 99 ? '**' : String(amount));
		area.Position.Y += 11;
		this.hurtPlayerDamageTexts[slot].Place(area, TextAlign.Center);
		this.hurtPlayerDamageTexts[slot].Visible = amount !== 0;

		this.RenewTimedEvent(this.hurtPlayerEvent, 500);
	}

	//#endregion

	//#region UI

	UpdateCharacterBars() {
		if (!this.Ingame || this.layout == null || this.CurrentSavegame == null)
			return;

		for (let i = 0; i < this.constructor.MaxPartyMembers; ++i) {
			this.layout.FillCharacterBars(i, this.GetPartyMember(i));
		}
	}

	UpdateCharacterStatus(partyMember) {
		if (!this.Ingame || this.layout == null || this.CurrentSavegame == null)
			return;

		this.layout.UpdateCharacterStatus(partyMember);
	}

	UpdateCharacters(finishAction, partyMembers = null) {
		const queue = new Queue(partyMembers ?? this.PartyMembers);

		const UpdateNext = () => {
			if (queue.Count === 0) {
				finishAction?.();
				return;
			}

			const partyMember = queue.Dequeue();

			if (partyMember == null) {
				UpdateNext();
				return;
			}

			const slot = this.SlotFromPartyMember(partyMember);

			if (slot == null) {
				UpdateNext();
				return;
			}

			this.layout.SetCharacter(slot, partyMember, false, UpdateNext, false, true);
		};

		UpdateNext();
	}

	ShowSecondaryStatTooltip(area, secondaryStat, character) {
		if (character instanceof PartyMember && this.CoreConfiguration.ShowPlayerStatsTooltips) {
			const tooltip = BuiltinTooltips.GetSecondaryStatTooltip(this.Features, this.GameLanguage, secondaryStat, character);
			return this.layout.AddTooltip(area, tooltip, TextColor.White, TextAlign.Left, new Color(this.GetPrimaryUIColor(15), 0xb0));
		}

		return null;
	}

	UpdateSecondaryStatTooltip(tooltip, secondaryStat, character) {
		if (secondaryStat === BuiltinTooltips.SecondaryStat.EP50 && character.Level < 50)
			secondaryStat = BuiltinTooltips.SecondaryStat.EPPre50;
		else if (secondaryStat === BuiltinTooltips.SecondaryStat.LevelWithAPRIncrease && character.AttacksPerRoundIncreaseLevels === 0)
			secondaryStat = BuiltinTooltips.SecondaryStat.LevelWithoutAPRIncrease;

		if (tooltip != null && character instanceof PartyMember && this.CoreConfiguration.ShowPlayerStatsTooltips)
			tooltip.Text = BuiltinTooltips.GetSecondaryStatTooltip(this.Features, this.GameLanguage, secondaryStat, character);
	}

	PlayHealAnimation(partyMember, finishAction = null) {
		this.currentAnimation?.Destroy();
		this.currentAnimation = new SpellAnimation(this, this.layout);
		this.currentAnimation.CastOn(Spell.SmallHealing, partyMember, () => {
			this.currentAnimation.Destroy();
			this.currentAnimation = null;
			finishAction?.();
		});
	}

	//#endregion

	//#region Text

	/** ProcessText(string text) and ProcessText(string text, Rect bounds) */
	ProcessText(text, bounds) {
		if (arguments.length >= 2) {
			return this.renderView.TextProcessor.WrapText(this.ProcessText(text), bounds, new Size(Global.GlyphWidth, Global.GlyphLineHeight));
		}

		if (text.includes('~RUN1~') && this.AutoDerune) { // has rune alphabet and auto derune is active
			// ~INK 32~ resets to default color (at least in our implementation)
			// ~INK cc~
			// ~RUN1~text~NORM~ or ~"text"~
			text = text
				.replaceAll('~RUN1~ ', `~INK ${TextColor.Beige}~`)
				.replaceAll('~RUN1~', `~INK ${TextColor.Beige}~`)
				.replaceAll('~NORM~ ', '~INK 32~')
				.replaceAll('~NORM~', '~INK 32~');
		}

		return this.renderView.TextProcessor.ProcessText(text, this.nameProvider, this.Dictionary);
	}

	AddAnimatedText(textAdder, area, text, textAlign, continueChecker, timePerFrame, blink) {
		let textColorIndex = 0;
		const textColors = blink
			? TextColors.TextBlinkColors
			: TextColors.TextAnimationColors;
		const animatedText = textAdder(area, text, textColors[0], textAlign);

		const AnimateText = () => {
			if (animatedText != null && continueChecker?.() === true) {
				animatedText.SetTextColor(textColors[textColorIndex]);
				textColorIndex = (textColorIndex + 1) % textColors.length;
				this.AddTimedEvent(timePerFrame, AnimateText);
			}
		};

		AnimateText();

		return animatedText;
	}

	//#endregion

	//#region Map

	get CurrentMapViewArea() { return new Rect(this.mapViewArea); }

	//#endregion

	//#region Player

	get RenderPlayer() { return this.Is3D ? this.player3D : this.player2D; }
	get PlayerAngle() { return this.Is3D ? Util.Round(this.player3D.Angle) : DirectionExtensions.ToAngle(this.player2D.Direction); }
	get PlayerDirection() { return this.Is3D ? this.player3D.Direction : this.player2D.Direction; }

	//#endregion

	//#region Palettes & Colors

	get CustomGraphicPaletteIndex() { return (this.PrimaryUIPaletteIndex + 3) & 0xff; }
	get UIPaletteIndex() { return this.currentUIPaletteIndex; }
	get TextPaletteIndex() {
		// web port: Amberstar map palettes have no UI (text) colors, the text colors are taken from the UI palette
		if (this.WindowActive || this.renderView.GameData?.IsAmberstar)
			return this.UIPaletteIndex;
		return ((this.Map?.PaletteIndex ?? 1) - 1) & 0xff;
	}

	SetCurrentUIPaletteIndex(paletteIndex) { this.currentUIPaletteIndex = paletteIndex; }

	GetPlayerPaletteIndex() { return Math.max(1, this.Map?.PaletteIndex ?? 1) - 1; }

	GetTextColor(textColor) { return this.GetUIColor(textColor); }

	GetNamedPaletteColor(namedPaletteColor) { return this.GetUIColor(namedPaletteColor); }

	GetPaletteColor(paletteIndex, colorIndex) {
		const paletteData = this.renderView.GraphicInfoProvider.Palettes.get(paletteIndex).Data;
		return new Color(
			paletteData[colorIndex * 4 + 0],
			paletteData[colorIndex * 4 + 1],
			paletteData[colorIndex * 4 + 2],
			paletteData[colorIndex * 4 + 3]
		);
	}

	GetPrimaryUIColor(colorIndex) { return this.GetPaletteColor(this.renderView.GraphicInfoProvider.PrimaryUIPaletteIndex, colorIndex); }

	GetUIColor(colorIndex) { return this.GetPaletteColor(1 + this.UIPaletteIndex, colorIndex); }

	UpdateUIPalette(map) {
		if (map && !this.renderView.GameData?.IsAmberstar) { // web port: Amberstar map palettes have no UI colors
			// TODO: MapFlags.SecondaryUI2D / MapFlags.SecondaryUI3D?
			this.currentUIPaletteIndex = ((this.Map?.PaletteIndex ?? 1) - 1) & 0xff;
		} else {
			this.currentUIPaletteIndex = this.PrimaryUIPaletteIndex;
		}

		this.ouchSprite.PaletteIndex = this.currentUIPaletteIndex;
		this.layout.UpdateUIPalette(this.currentUIPaletteIndex);
		this.cursor.UpdatePalette(this);
	}

	//#endregion

	//#region Cursor

	get CursorType() {
		return this.cursor.Type;
	}

	set CursorType(value) {
		if (this.cursor.Type === value)
			return;

		if (value !== CursorType.Eye &&
			value !== CursorType.Mouth &&
			value !== CursorType.Hand &&
			value !== CursorType.Target)
			this.targetMode2DActive = false;

		if (this.CoreConfiguration.IsMobile) {
			if (value !== CursorType.Click)
				this.HideMobileClickIndicator();

			if (value >= CursorType.ArrowUp && value <= CursorType.ArrowRotateRight) {
				this.CursorType = CursorType.Sword;
				return; // Don't allow mouse cursor movement on mobile
			}

			if (value === CursorType.Hand)
				this.CurrentMobileAction = MobileAction.Hand;
			else if (value === CursorType.Eye)
				this.CurrentMobileAction = MobileAction.Eye;
			else if (value === CursorType.Mouth)
				this.CurrentMobileAction = MobileAction.Mouth;
			else if (value === CursorType.Target)
				this.CurrentMobileAction = MobileAction.Interact;

			this.cursor.Type = value;

			if (this.cursor.Type === CursorType.Click && this.layout.PopupActive) {
				this.ShowMobileClickIndicatorForPopup();
			}
		} else {
			this.cursor.Type = value;

			if (!this.is3D && !this.WindowActive && !this.layout.PopupActive &&
				(this.cursor.Type === CursorType.Eye ||
				this.cursor.Type === CursorType.Hand)) {
				const yOffset = this.Map?.UseTravelTypes === true ? 12 : 0;
				this.TrapMouse(new Rect(this.player2D.DisplayArea.X - 9, this.player2D.DisplayArea.Y - 9 - yOffset, 33, 49));
			} else if (!this.is3D && !this.WindowActive && !this.layout.PopupActive &&
				(this.cursor.Type === CursorType.Mouth ||
				this.cursor.Type === CursorType.Target)) {
				const yOffset = this.Map?.UseTravelTypes === true ? 12 : 0;
				this.TrapMouse(new Rect(this.player2D.DisplayArea.X - 25, this.player2D.DisplayArea.Y - 25 - yOffset, 65, 65));
			} else if (!this.disableUntrapping) {
				if (this.is3D && this.clickMoveActive && !this.trappedAfterClickMoveActivation &&
					value >= CursorType.ArrowForward && value <= CursorType.Wait)
					return;

				this.UntrapMouse();
			}
		}
	}

	/** UpdateCursor() and UpdateCursor(Position cursorPosition, MouseButtons buttons) */
	UpdateCursor(cursorPosition, buttons) {
		if (arguments.length === 0) {
			this.UpdateCursor(this.lastMousePosition, MouseButtons.None);
			return;
		}

		// lock (cursor)
		this.cursor.UpdatePosition(cursorPosition, this);

		if (!this.InputEnable) {
			if (this.layout.FreeTextScrollingActive) {
				this.CursorType = CursorType.None;
			} else if (this.layout.PopupActive) {
				let cursorType = this.layout.PopupClickCursor ? CursorType.Click : CursorType.Sword;
				[, cursorType] = this.layout.Hover(this.renderView.ScreenToGame(cursorPosition), cursorType);
				this.CursorType = cursorType;
			} else if ((this.layout.Type === LayoutType.Event && !this.GameOverButtonsVisible) ||
				(this.ConversationTextActive && this.layout.Type === LayoutType.Conversation) ||
				(this.currentBattle?.RoundActive === true && this.currentBattle?.ReadyForNextAction === true) ||
				this.currentBattle?.WaitForClick === true ||
				this.layout.ChestText?.WithScrolling === true ||
				this.layout.InventoryMessageWaitsForClick)
				this.CursorType = CursorType.Click;
			else
				this.CursorType = CursorType.Sword;

			if (this.layout.IsDragging && this.layout.InventoryMessageWaitsForClick &&
				buttons === MouseButtons.None) {
				this.layout.UpdateDraggedItemPosition(this.renderView.ScreenToGame(cursorPosition));
			}

			if (this.layout.OptionMenuOpen) {
				if (!this.layout.PopupActive)
					this.layout.HoverButtonGrid(this.renderView.ScreenToGame(cursorPosition));
				else {
					let cursorType = this.cursor.Type;
					[cursorType] = this.layout.SaveListScrollDrag(this.renderView.ScreenToGame(cursorPosition), cursorType);
					this.CursorType = cursorType;
				}
			}

			return;
		}

		const relativePosition = this.renderView.ScreenToGame(cursorPosition);
		const mapViewArea = this.mapViewArea;

		if (!this.WindowActive && !this.layout.PopupActive && (mapViewArea.Contains(relativePosition) || this.clickMoveActive)) {
			// Change arrow cursors when hovering the map
			if (this.Ingame && this.cursor.Type >= CursorType.Sword && this.cursor.Type <= CursorType.Wait) {
				if (this.Map.Type === MapType.Map2D) {
					const playerArea = this.player2D.DisplayArea;
					playerArea.Position.Y = playerArea.Bottom - RenderMap2D.TILE_HEIGHT;
					playerArea.Size.Height = RenderMap2D.TILE_HEIGHT;

					const left = relativePosition.X < playerArea.Left;
					const right = relativePosition.X >= playerArea.Right;
					const up = relativePosition.Y < playerArea.Top;
					const down = relativePosition.Y >= playerArea.Bottom;

					if (up) {
						if (left)
							this.CursorType = CursorType.ArrowUpLeft;
						else if (right)
							this.CursorType = CursorType.ArrowUpRight;
						else
							this.CursorType = CursorType.ArrowUp;
					} else if (down) {
						if (left)
							this.CursorType = CursorType.ArrowDownLeft;
						else if (right)
							this.CursorType = CursorType.ArrowDownRight;
						else
							this.CursorType = CursorType.ArrowDown;
					} else {
						if (left)
							this.CursorType = CursorType.ArrowLeft;
						else if (right)
							this.CursorType = CursorType.ArrowRight;
						else
							this.CursorType = CursorType.Wait;
					}
				} else {
					relativePosition.Offset(-mapViewArea.Left, -mapViewArea.Top);

					const horizontal = Math.trunc(relativePosition.X / Math.trunc(mapViewArea.Width / 3));
					const vertical = Math.trunc(relativePosition.Y / Math.trunc(mapViewArea.Height / 3));

					if (vertical <= 0) { // up
						if (horizontal <= 0) // left
							this.CursorType = CursorType.ArrowTurnLeft;
						else if (horizontal >= 2) // right
							this.CursorType = CursorType.ArrowTurnRight;
						else
							this.CursorType = CursorType.ArrowForward;
					} else if (vertical >= 2) { // down
						if (horizontal <= 0) // left
							this.CursorType = CursorType.ArrowRotateLeft;
						else if (horizontal >= 2) // right
							this.CursorType = CursorType.ArrowRotateRight;
						else
							this.CursorType = CursorType.ArrowBackward;
					} else {
						if (horizontal <= 0) // left
							this.CursorType = CursorType.ArrowStrafeLeft;
						else if (horizontal >= 2) // right
							this.CursorType = CursorType.ArrowStrafeRight;
						else
							this.CursorType = CursorType.Wait;
					}
				}

				return;
			}
		} else {
			if (buttons === MouseButtons.None && !this.allInputDisabled) {
				let cursorType = this.cursor.Type;
				[, cursorType] = this.layout.Hover(relativePosition, cursorType);
				this.CursorType = cursorType;
			} else if (buttons === MouseButtons.Left) {
				let cursorType = this.cursor.Type;
				[cursorType] = this.layout.Drag(relativePosition, cursorType);
				this.CursorType = cursorType;
			}
		}

		if (this.cursor.Type >= CursorType.ArrowUp && this.cursor.Type <= CursorType.Wait)
			this.CursorType = CursorType.Sword;
	}

	// Alternates through eye, mouth and hand cursor when the
	// mouse wheel is used on the 2D map screen.
	ScrollCursor(cursorPosition, down) {
		if (down) {
			if (this.CursorType < CursorType.Eye)
				this.CursorType = CursorType.Eye;
			else if (this.CursorType === CursorType.Eye)
				this.CursorType = CursorType.Mouth;
			else if (this.CursorType === CursorType.Mouth)
				this.CursorType = CursorType.Hand;
			else if (this.CursorType === CursorType.Hand) {
				this.CursorType = CursorType.Sword;
				this.UpdateCursor(cursorPosition, MouseButtons.None);
				return;
			} else
				return;
		} else { // up
			if (this.CursorType < CursorType.Eye)
				this.CursorType = CursorType.Hand;
			else if (this.CursorType === CursorType.Eye) {
				this.CursorType = CursorType.Sword;
				this.UpdateCursor(cursorPosition, MouseButtons.None);
				return;
			} else if (this.CursorType === CursorType.Mouth)
				this.CursorType = CursorType.Eye;
			else if (this.CursorType === CursorType.Hand)
				this.CursorType = CursorType.Mouth;
			else
				return;
		}
	}

	ResetCursor() {
		if (this.CursorType === CursorType.Click ||
			this.CursorType === CursorType.SmallArrow ||
			this.CursorType === CursorType.None) {
			this.CursorType = CursorType.Sword;
		}

		this.UpdateCursor(this.lastMousePosition, MouseButtons.None);
	}

	//#endregion
}
