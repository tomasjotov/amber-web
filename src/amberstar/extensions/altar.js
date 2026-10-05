// The altar of reunification: assembling the Amberstar from its 13 pieces (Amberstar event type 22 "Altar",
// on the world map 49 in the original data).
//
// Original behavior (Amberstar program AMBERDEV.UDO, PUZZLE.ICN, PUZZLE.TXT):
//  - The altar event resets the party position (like places, Map2DScreen.TryExecuteMapEvent). Without 13
//    "Piece of Amberstar" (item 110) the altar message (program message 201) is shown and the party is pushed back.
//  - With all pieces the puzzle starts: PUZZLE.TXT text 2 (welcome, the pieces start to glow, each shows a symbol
//    and a name), then 12 times "A voice says: lay <...>" (texts 4..15). The player has to lay the piece of the
//    right god/being into the star:
//       knowledge -> Mork, the ally -> Bralkur, master of the sea -> Sobek, mother of life -> Gala,
//       falsehood -> Sansri, friend of the eagles -> Nut, evil -> Lord Tarbos, power of the earth -> Geb,
//       mother of death -> Bala, fire -> Harachte, the traitor -> Marmion, what is coming -> Talmit.
//    A right piece: text 0 ("...you are to be rewarded"), a wrong piece: text 1 (a lightning bolt burns the party
//    to ashes -> game over). After the 12th piece: text 3, the party receives the Amberstar (item 105) which opens
//    the door of the fortress of Godsbane (the final dungeon) and is used against Tarbos in the ritual room.
//  - Data in the program (found by searching, English 1.96 offsets 0x29026..0x291c6): the puzzle palette (16
//    colors), the prompt text indices 4..15, the solution (prompt -> name index, 1-based), the symbol -> name table
//    of the pieces (1-based), the positions of the 12 star points in the 176x144 altar picture, the 12 names.
//  - PUZZLE.ICN (Atari ST word interleaved 4 bit planes): altar picture 176x144, center disc 96x96 (the 13th piece),
//    12 star points 32x32 (one per position), 12 zodiac symbols 32x32 (one per piece).
//
// The reward of a right piece is not known exactly (the text only says "you are to be rewarded"): every living
// party member receives RewardExperience experience points. The center disc (the 13th piece without a name) is laid
// automatically after the welcome text.
//
// Ambermoon style UI: a window like the riddlemouth (LayoutType.Riddlemouth): the altar picture in the map area with
// the star points appearing as they are laid, the Amberstar 80x80 picture at the upper right, buttons
// "lay a piece" (hand), "hear the voice" (ear) and exit (only before the first piece). Laying a piece opens a popup
// with the remaining pieces (symbol and name); a click lays the piece.
import { readContainer } from '../../../amberstar/src/data/container.js';
import { Image80x80 } from '../../../amberstar/src/data/enums.js';
import { Graphic } from '../../ambermoon/Ambermoon.Data.Common/Graphic.js';
import { Item } from '../../ambermoon/Ambermoon.Data.Common/Item.js';
import { ButtonType } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/ButtonType.js';
import { Condition } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/Condition.js';
import { Color as TextColor } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/Color.js';
import { CursorType } from '../../ambermoon/Ambermoon.Data.Common/CursorType.js';
import { CharacterDirection } from '../../ambermoon/Ambermoon.Common/Direction.js';
import { Position } from '../../ambermoon/Ambermoon.Common/Position.js';
import { Rect } from '../../ambermoon/Ambermoon.Common/Rect.js';
import { Graphics } from '../../ambermoon/Ambermoon.Core/Render/Graphics.js';
import { Layer } from '../../ambermoon/Ambermoon.Core/Render/Layer.js';
import { TextAlign } from '../../ambermoon/Ambermoon.Core/Render/TextAlign.js';
import { EventTrigger } from '../../ambermoon/Ambermoon.Core/MapExtensions.js';
import { Button } from '../../ambermoon/Ambermoon.Core/UI/Button.js';
import { LayoutType } from '../../ambermoon/Ambermoon.Core/UI/Layout.js';
import { Window } from '../../ambermoon/Ambermoon.Core/UI/Window.js';
import { toAmbermoonPalette } from '../common.js';
import { convertAmberstarText, convertMessage } from '../convert/maps2D/texts.js';
import { getPicture80x80 } from '../convert/characters/graphics.js';
import { titleCase } from '../convert/characters/texts.js';

export const PieceOfAmberstarItem = 110;
export const AmberstarItem = 105;
export const RequiredPieces = 13;
export const RewardExperience = 500;
const AltarMessage = 201;
const AmberstarItemGraphic = 66; // the glowing star (unused by the Amberstar items)
const AmberstarNameFragment = 'AMBERSTAR';

export { AmberstarAltarEvent, AmberstarAltarEventType } from './altarEvent.js';

// ---------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------

// Fallback values (English 1.96 AMBERDEV.UDO) if the table can not be found in the program
const Fallback = Object.freeze({
	palette: [0x000, 0x521, 0x333, 0x222, 0x111, 0x763, 0x751, 0x640, 0x530, 0x420, 0x310, 0x200, 0x012, 0x122, 0x410, 0x666],
	prompts: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
	solution: [7, 2, 11, 4, 12, 8, 1, 9, 5, 10, 3, 6],
	pieceNames: [3, 1, 8, 5, 10, 4, 2, 9, 7, 6, 11, 12],
	positions: [[81, 1], [113, 17], [129, 49], [129, 65], [113, 97], [81, 113], [65, 113], [33, 97], [17, 65], [17, 49], [33, 17], [65, 1]],
	names: ['LORD TARBOS', 'BRALKUR', 'MARMION', 'GALA', 'BALA', 'TALMIT', 'MORK', 'NUT', 'GEB', 'HARACHTE', 'SOBEK', 'SANSRI'],
});

function findSequence(data, sequence) {
	outer:
	for (let i = 0; i <= data.length - sequence.length; i++) {
		for (let k = 0; k < sequence.length; k++) {
			if (data[i + k] !== sequence[k])
				continue outer;
		}
		return i;
	}
	return -1;
}

function readPuzzleData(ctx) {
	try {
		const data = readContainer(ctx.source.files.get('AMBERDEV.UDO')).get(1).data;
		// prompt text indices 4..15 (bytes), followed by the solution and the piece names tables
		const start = findSequence(data, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
		if (start < 0)
			return Fallback;
		const word = o => (data[o] << 8) | data[o + 1];
		const bytes = (o, n) => [...data.subarray(o, o + n)];
		const isPermutation = a => a.slice().sort((x, y) => x - y).every((v, i) => v === i + 1);
		const solution = bytes(start + 12, 12);
		const pieceNames = bytes(start + 24, 12);
		if (!isPermutation(solution) || !isPermutation(pieceNames))
			return Fallback;
		const palette = Array.from({ length: 16 }, (_, i) => word(start - 0x2c + i * 2));
		const positions = Array.from({ length: 12 }, (_, i) => [word(start + 36 + i * 4), word(start + 38 + i * 4)]);
		// names: "LORD TARBOS\0BRALKUR\0..."
		const namesStart = findSequence(data, [...'LORD TARBOS'].map(c => c.charCodeAt(0)));
		let names = Fallback.names;
		if (namesStart >= 0) {
			names = [];
			let o = namesStart;
			for (let i = 0; i < 12; i++) {
				let name = '';
				while (data[o] !== 0)
					name += String.fromCharCode(data[o++]);
				o++;
				names.push(name);
			}
		}
		if (palette[0] !== 0 || positions.some(([x, y]) => x > 176 || y > 144))
			return { ...Fallback, solution, pieceNames, names };
		return { palette, prompts: bytes(start, 12), solution, pieceNames, positions, names };
	} catch {
		return Fallback;
	}
}

/** Atari ST word interleaved 4 bit planes -> indexed Ambermoon graphic */
function decodeInterleaved(data, offset, width, height) {
	const graphic = new Graphic(width, height, 0);
	const bytesPerLine = width / 16 * 8;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const group = offset + y * bytesPerLine + (x >> 4) * 8;
			const bit = 15 - (x & 15);
			let color = 0;
			for (let p = 0; p < 4; p++) {
				const w = (data[group + p * 2] << 8) | data[group + p * 2 + 1];
				color |= ((w >> bit) & 1) << p;
			}
			graphic.Data[x + y * width] = color;
		}
	}
	return graphic;
}

// Extra UI graphic keys (Graphics.ExtraUIGraphicOffset + key)
const Key = Object.freeze({ Background: 0, Disc: 1, FirstPoint: 2, FirstSymbol: 14 });
const AltarArea = new Rect(16, 50, 176, 144);

function addAmberstarItem(ctx) {
	const itemManager = ctx.result.itemManager;
	if (!itemManager || itemManager.items?.has?.(AmberstarItem))
		return;
	const piece = itemManager.GetItem(PieceOfAmberstarItem);
	const item = Object.assign(new Item(), piece ?? {});
	item.Index = AmberstarItem;
	item.GraphicIndex = AmberstarItemGraphic;
	const fragment = ctx.source.findWord?.(AmberstarNameFragment);
	item.Name = titleCase(fragment != null ? ctx.source.fragment(fragment) : AmberstarNameFragment);
	item.Price = 0;
	itemManager.items?.set(AmberstarItem, item);
}

// ---------------------------------------------------------------------------------------------
// Preparation (conversion time) and runtime
// ---------------------------------------------------------------------------------------------

export function prepareAltar(ctx, gameData, extraUIGraphics) {
	addAmberstarItem(ctx);

	const icn = ctx.source.files.get('PUZZLE.ICN');
	if (!icn || icn.length < 12672 + 4608 + 24 * 512)
		return null;
	const data = readPuzzleData(ctx);
	extraUIGraphics.set(Key.Background, decodeInterleaved(icn, 0, 176, 144));
	extraUIGraphics.set(Key.Disc, decodeInterleaved(icn, 12672, 96, 96));
	for (let i = 0; i < 12; i++) {
		extraUIGraphics.set(Key.FirstPoint + i, decodeInterleaved(icn, 12672 + 4608 + i * 512, 32, 32));
		extraUIGraphics.set(Key.FirstSymbol + i, decodeInterleaved(icn, 12672 + 4608 + (12 + i) * 512, 32, 32));
	}
	const colors = data.palette.map(v => [((v >> 8) & 7) * 32, ((v >> 4) & 7) * 32, (v & 7) * 32]);
	const paletteIndex = ctx.palettes.add(toAmbermoonPalette(colors), 'altar') - 1;

	let texts = [];
	try {
		const container = ctx.source.text('puzzle', 1);
		for (let i = 0; i < container.textBlockCount; i++)
			texts.push(convertAmberstarText(container.getTextBlock(i)));
	} catch {
		texts = [];
	}
	const text = index => texts[index] ?? '';
	const names = data.names.map(n => titleCase(n));
	const altarMessage = convertMessage(ctx, AltarMessage) ?? '';

	return new AltarController({ data, text, names, altarMessage, paletteIndex });
}

class AltarController {
	constructor({ data, text, names, altarMessage, paletteIndex }) {
		this.data = data;
		this.text = text;
		this.names = names;
		this.altarMessage = altarMessage;
		this.paletteIndex = paletteIndex;
	}

	static CountPieces(game) {
		let count = 0;
		for (const partyMember of game.PartyMembers) {
			for (const slot of [...partyMember.Inventory.Slots, ...partyMember.Equipment.Slots.values()]) {
				if (slot?.ItemIndex === PieceOfAmberstarItem)
					count += slot.Amount;
			}
		}
		return count;
	}

	/** Executes the altar event. Returns false if the event was not executed (wrong trigger). */
	Trigger(game, map, trigger, x, y, event) {
		if (trigger !== EventTrigger.Move && trigger !== EventTrigger.Always)
			return false;
		// Amberstar resets the party position on altars (the altar tile is never entered)
		const direction = game.PlayerDirection;
		const back = [[0, 1], [-1, 0], [0, -1], [1, 0]][direction] ?? [0, 0];
		const backX = x + back[0], backY = y + back[1];
		const pushBack = () => {
			if (backX >= 0 && backY >= 0 && backX < map.Width && backY < map.Height)
				game.TeleportTo(0, backX + 1, backY + 1, CharacterDirection.Keep, true);
		};
		if (AltarController.CountPieces(game) < RequiredPieces) {
			const text = map.Texts?.[event.TextIndex] ?? this.altarMessage;
			game.ShowMessagePopup(text, pushBack, TextAlign.Left);
			return true;
		}
		this.Open(game, pushBack);
		return true;
	}

	Open(game, closeAction) {
		const layout = game.layout;
		const data = this.data;
		const extraOffset = Graphics.ExtraUIGraphicOffset;
		const state = { prompt: 0, placed: new Set(), started: false };
		const sprites = { points: [] };

		const lay = (pieceIndex) => {
			const prompt = state.prompt;
			const correct = data.pieceNames[pieceIndex] === data.solution[prompt];
			state.started = true;
			updateButtons();
			if (!correct) {
				game.ShowMessagePopup(this.text(1), () => this.#burn(game), TextAlign.Left);
				return;
			}
			state.placed.add(pieceIndex);
			sprites.points[prompt].Visible = true;
			state.prompt++;
			game.ShowMessagePopup(this.text(0), () => {
				const living = game.PartyMembers.filter(p => p.Alive);
				game.AddExperience(living, RewardExperience, () => {
					if (state.prompt === 12)
						this.#finish(game, closeAction);
					else
						hearVoice();
				});
			}, TextAlign.Left);
		};

		const hearVoice = () => {
			if (state.prompt < 12)
				game.ShowMessagePopup(this.text(data.prompts[state.prompt]), null, TextAlign.Left);
		};

		const openTray = () => {
			if (state.prompt >= 12 || layout.PopupActive)
				return;
			this.#openTray(game, state, lay);
		};

		const updateButtons = () => {
			const grid = layout.buttonGrid;
			grid.SetButton(0, ButtonType.Empty, false, null, false);
			grid.SetButton(1, ButtonType.Empty, false, null, false);
			grid.SetButton(2, ButtonType.Exit, state.started, state.started ? null : () => game.CloseWindow(closeAction), false,
				layout.GetTooltip(Button.TooltipType.Exit));
			grid.SetButton(3, ButtonType.Empty, false, null, false);
			grid.SetButton(4, ButtonType.Empty, false, null, false);
			grid.SetButton(5, ButtonType.Empty, false, null, false);
			grid.SetButton(6, ButtonType.Hand, state.prompt >= 12, openTray, false, layout.GetTooltip(Button.TooltipType.Hand));
			grid.SetButton(7, ButtonType.Empty, false, null, false);
			grid.SetButton(8, ButtonType.Ear, state.prompt >= 12, hearVoice, false, layout.GetTooltip(Button.TooltipType.HearRiddle));
		};

		game.Fade(() => {
			game.SetWindow(Window.Event, false);
			layout.SetLayout(LayoutType.Riddlemouth);
			game.ShowMap(false);
			layout.Reset();
			layout.FillArea(AltarArea, game.GetUIColor(28), false);
			layout.AddSprite(AltarArea, extraOffset + Key.Background, this.paletteIndex, 2);
			sprites.points = data.positions.map(([px, py], i) =>
				layout.AddSprite(new Rect(AltarArea.Left + px - 1, AltarArea.Top + py - 1, 32, 32), extraOffset + Key.FirstPoint + i,
					this.paletteIndex, 3, null, null, null, false));
			sprites.disc = layout.AddSprite(new Rect(AltarArea.Left + 40, AltarArea.Top + 24, 96, 96), extraOffset + Key.Disc,
				this.paletteIndex, 4, null, null, null, false);
			layout.Set80x80Picture(getPicture80x80(Image80x80.Amberstar), 224, 49);
			updateButtons();
			game.ShowMessagePopup(this.text(2), () => {
				// The 13th piece (the center without a name) is laid first.
				sprites.disc.Visible = true;
				hearVoice();
			}, TextAlign.Left);
		});
	}

	/** Popup with the remaining pieces (symbol and name). */
	#openTray(game, state, lay) {
		const layout = game.layout;
		const columns = 6;
		const cellWidth = 48, cellHeight = 52;
		const remaining = Array.from({ length: 12 }, (_, i) => i).filter(i => !state.placed.has(i));
		const rows = Math.ceil(remaining.length / columns);
		const popupColumns = 20;
		const popupRows = 2 + Math.ceil((22 + rows * cellHeight) / 16);
		const position = new Position(0, Math.max(37, 200 - popupRows * 16 - 4));
		const popup = layout.OpenPopup(position, popupColumns, popupRows, true, false);
		const content = popup.ContentArea;
		popup.AddText(new Rect(content.Left, content.Top + 2, content.Width, 7),
			game.ProcessText(this.#promptName(state.prompt)), TextColor.LightYellow, TextAlign.Center);
		remaining.forEach((pieceIndex, i) => {
			const cellX = content.Left + (i % columns) * cellWidth + Math.trunc((content.Width - columns * cellWidth) / 2);
			const cellY = content.Top + 16 + Math.floor(i / columns) * cellHeight;
			popup.AddImage(new Rect(cellX + 8, cellY, 32, 32), Graphics.ExtraUIGraphicOffset + Key.FirstSymbol + pieceIndex,
				Layer.UI, 2, this.paletteIndex);
			const name = this.names[this.data.pieceNames[pieceIndex] - 1] ?? '';
			const lines = name.length * 6 > cellWidth && name.includes(' ') ? name.split(' ') : [name];
			lines.forEach((line, l) => popup.AddText(new Rect(cellX - 4, cellY + 34 + l * 7, cellWidth + 8, 7),
				game.ProcessText(line), TextColor.White, TextAlign.Center));
			// Clickable area (the popup forwards clicks to its texts)
			const area = new Rect(cellX, cellY, cellWidth, cellHeight - 2);
			popup.texts.push({
				WithScrolling: false,
				Click: clickPosition => {
					if (!area.Contains(clickPosition))
						return false;
					layout.ClosePopup();
					game.UntrapMouse();
					game.ExecuteNextUpdateCycle(() => lay(pieceIndex));
					return true;
				},
				Destroy() { },
			});
		});
		popup.Closed.add(() => game.UntrapMouse());
		game.CursorType = CursorType.Sword;
		game.TrapMouse(popup.ContentArea);
	}

	/** "Lay knowledge" from the prompt text "A voice says: "lay knowledge." */
	#promptName(prompt) {
		const text = this.text(this.data.prompts[prompt]).replace(/\^/g, ' ');
		const quote = text.indexOf('"');
		const result = (quote >= 0 ? text.substring(quote + 1) : text).replace(/["]/g, '').trim();
		return result.charAt(0) + result.substring(1).toLowerCase();
	}

	#burn(game) {
		for (const partyMember of game.PartyMembers) {
			if (partyMember.Alive)
				game.KillPartyMember(partyMember, Condition.DeadAshes);
			game.layout.UpdateCharacter?.(partyMember);
		}
		game.RecheckActivePartyMember();
	}

	#finish(game, closeAction) {
		game.ShowMessagePopup(this.text(3), () => {
			const itemManager = game.ItemManager;
			const pieceWeight = itemManager.GetItem(PieceOfAmberstarItem)?.Weight ?? 0;
			let remove = RequiredPieces;
			for (const partyMember of game.PartyMembers) {
				for (const slot of partyMember.Inventory.Slots) {
					if (remove === 0 || slot.ItemIndex !== PieceOfAmberstarItem)
						continue;
					const amount = Math.min(remove, slot.Amount);
					slot.Remove(amount);
					partyMember.TotalWeight -= amount * pieceWeight;
					remove -= amount;
				}
			}
			const amberstar = itemManager.GetItem(AmberstarItem);
			const receiver = [game.CurrentPartyMember, ...game.PartyMembers].find(p => p?.Alive && p.Inventory.Slots.some(s => s.Empty))
				?? game.CurrentPartyMember;
			receiver.AddItem(AmberstarItem, false);
			receiver.TotalWeight += amberstar?.Weight ?? 0;
			game.CloseWindow(closeAction);
		}, TextAlign.Left);
	}
}
