// Port of Ambermoon.Data.Legacy/Serialization/OutroData.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { AmigaExecutable } from './AmigaExecutable.js';
import { DataReader } from './DataReader.js';
import { GraphicReader } from './GraphicReader.js';
import { OutroAction, OutroCommand, OutroGraphicInfo, OutroOption } from '../../Ambermoon.Data.Common/IOutroData.js';
import { Graphic, GraphicInfo, GraphicFormat } from '../../Ambermoon.Data.Common/Graphic.js';
import { Glyph } from '../../Ambermoon.Data.Common/Glyph.js';
import { Color } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import {
	ArgumentException, count, first, getValue, isNullOrWhiteSpace, lastOrDefault, tryGetValue
} from '../../../runtime.js';

// The outro texts are grouped by sections which
// are divided by clicks.
//
// 1. Destruction of the temple of brotherhood
// 2. End of brotherhood Tarbos and peace with Moranians
// 3. Travel to Kire's moon and rescue of the dwarves
// 4. Valdyn leaves (no yellow teleporter stone)
// 5. Valdyn leaves (with yellow teleporter stone)
// 6. End texts and credits
//
// There are 3 sequences:
//
// 1. Uses 1 2 3 4 6
// 2. Uses 1 2 3 5 6
// 3. Uses 1 2 3 6
//
// In each group there are some large texts which
// should match translations and which can help to
// group normal texts in-between.
//
// For translations the last german credit texts
// are not used where you should send feedback to
// the Thalion office. Basically after the large
// text "HARALD UENZELMANN" there should be 1 more
// large text and then only normal texts to the end.
// Everything else should be removed for translations.
//
// The new file Outro_texts.amb has the following format:
//
// word NumberOfClickGroups
// word[n] NumberOfTextGroups (for each of the n click groups)
// For each click group:
//   word[m] TextCount (for each of the m text groups)
//   For each text group:
//     byte[x] Null-terminated texts for the group
// (byte) Padding (if needed there is a padding byte)
// word NumberOfTranslators
// byte[x] Null-terminated translator names
// byte[x] Null-terminated text for the click message
// (byte) Padding (if needed there is a padding byte)
//
//
// Outro texts can contain \r (0x0d), followed by another byte.
// This will add a newline (following text will appear 12 or 23
// pixels below dependent on font size). The byte after \r gives
// the X offset of the new line (added to the X offset of the action).
// This seems to be unused in Ambermoon though.

/** System.Text.Encoding.UTF8 replacement */
const UTF8Encoding = {
	IsSingleByte: false,
	GetString(bytes) {
		return new TextDecoder('utf-8').decode(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes));
	},
	GetBytes(str) {
		return new TextEncoder().encode(str);
	}
};

/** Creates an OutroAction (readonly struct with init properties). */
function createAction(props) {
	return Object.assign(new OutroAction(), props);
}

/** C# `action with { ... }` */
function withProps(action, props) {
	return Object.assign(Object.assign(new OutroAction(), action), props);
}

function addUnique(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

/** list[^n] */
function fromEnd(list, n) {
	return list[list.length - n];
}

class ClickGroup_Group {
	constructor() {
		this.ChangePictureAction = null;
		this.Large = false;
		this.TextActions = null;
	}
}

class ClickGroup {
	constructor() {
		this.Groups = null;
	}
}

ClickGroup.Group = ClickGroup_Group;

let paletteGraphicInfo = null;

function getPaletteGraphicInfo() {
	if (paletteGraphicInfo === null) {
		paletteGraphicInfo = new GraphicInfo();
		paletteGraphicInfo.Width = 32;
		paletteGraphicInfo.Height = 1;
		paletteGraphicInfo.GraphicFormat = GraphicFormat.XRGB16;
	}
	return paletteGraphicInfo;
}

const GlyphMappingSearchBytes = [0xff, 0x42, 0xff, 0xff];
const AdvanceValuesSearchBytes = [0x0b, 0x09, 0x09, 0x0a];
const LargeAdvanceValuesSearchBytes = [0x15, 0x11, 0x10, 0x13];

function FindByteSequence(reader, sequence) {
	let matchLength = 0;

	while (reader.Position < reader.Size) {
		if ((reader.Size - reader.Position) + matchLength < sequence.length)
			return -1;

		if (reader.ReadByte() === sequence[matchLength]) {
			if (++matchLength === sequence.length)
				return reader.Position - matchLength;
		} else {
			matchLength = 0;
		}
	}

	return -1;
}

export class OutroData {
	/** @param gameData ILegacyGameData (uses gameData.Files: Map<string, IFileContainer>) */
	constructor(gameData) {
		this.outroActions = new Map();
		this.outroPalettes = [];
		// The key is the offset inside the image hunk (it is reference by it from the data hunk).
		// The byte of the pair is the 0-based palette index (in relation to the OutroPalettes).
		this.graphics = new Map(); // Map<uint, { Key: Graphic, Value: byte }>
		this.texts = [];
		this.glyphs = new Map();
		this.largeGlyphs = new Map();
		this.GraphicAtlas = null; // If null, the atlas is created from Graphics property

		const outroActions = this.outroActions;
		const outroPalettes = this.outroPalettes;
		const graphics = this.graphics;
		const texts = this.texts;

		const outroHunks = AmigaExecutable.Read(getValue(getValue(gameData.Files, 'Ambermoon_extro').Files, 1));
		const codeHunks = outroHunks.filter(h => h.Type === AmigaExecutable.HunkType.Code)
			.map(h => DataReader.FromData(h.Data));
		const dataHunks = outroHunks
			.filter(h => h.Type === AmigaExecutable.HunkType.Data)
			.map(h => DataReader.FromData(h.Data));
		const graphicReader = new GraphicReader();
		const graphicInfo = new GraphicInfo();
		graphicInfo.GraphicFormat = GraphicFormat.Palette5Bit;
		graphicInfo.Alpha = false;
		graphicInfo.PaletteOffset = 0;
		const dataHunk = dataHunks[0];
		const imageHunk = dataHunks[1];
		const actionCache = new Map();
		const imageDataOffsets = [];
		function LoadPalette(hunk) {
			const paletteGraphic = new Graphic();
			graphicReader.ReadGraphic(paletteGraphic, hunk, getPaletteGraphicInfo());
			return paletteGraphic;
		}

		this.LoadFonts(codeHunks[0]);

		// #region Hunk 0 - Actions and texts

		// Initial palette (all zeros)
		outroPalettes.push(LoadPalette(dataHunk));

		// There are actually 3 outro sequence lists dependent on if Valdyn
		// is in the party and if you found the yellow teleporter sphere.
		for (let i = 0; i < 3; ++i) {
			const sequence = [];

			while (true) {
				const actionListOffset = dataHunk.ReadBEUInt32();

				if (actionListOffset === 0)
					break;

				const imageDataOffset = dataHunk.ReadBEUInt32();

				if (!imageDataOffsets.includes(imageDataOffset))
					imageDataOffsets.push(imageDataOffset);

				sequence.push(createAction({
					Command: OutroCommand.ChangePicture,
					ImageOffset: imageDataOffset
				}));

				const [found, cachedActions] = tryGetValue(actionCache, actionListOffset);

				if (found) {
					sequence.push(...cachedActions);
				} else {
					const readPosition = dataHunk.Position;
					dataHunk.Position = actionListOffset;
					const actions = [];

					while (true) {
						const scrollAmount = dataHunk.ReadByte();

						if (scrollAmount === 0xff) {
							actions.push(createAction({
								Command: OutroCommand.WaitForClick
							}));
							break;
						}

						const textDisplayX = dataHunk.ReadByte();
						const largeText = dataHunk.ReadByte() !== 0;
						const text = dataHunk.ReadNullTerminatedString();
						const textIndex = text.length === 0 ? null : texts.length;

						if (text.length !== 0)
							texts.push(text);

						actions.push(createAction({
							Command: OutroCommand.PrintTextAndScroll,
							LargeText: largeText,
							TextIndex: textIndex,
							ScrollAmount: scrollAmount + 1,
							TextDisplayX: textDisplayX
						}));
					}

					sequence.push(...actions);
					addUnique(actionCache, actionListOffset, actions);
					dataHunk.Position = readPosition;
				}
			}

			addUnique(outroActions, i, sequence);
		}

		// #endregion

		// #region Hunk 1 - Images

		function LoadGraphic(width, height) {
			graphicInfo.Width = width;
			graphicInfo.Height = height;
			const graphic = new Graphic();
			graphicReader.ReadGraphic(graphic, imageHunk, graphicInfo);
			return graphic;
		}

		for (const imageDataOffset of imageDataOffsets) {
			imageHunk.Position = imageDataOffset;
			const width = imageHunk.ReadBEUInt16() * 16;
			const height = imageHunk.ReadBEUInt16();
			imageHunk.Position += 2; // unused word
			const paletteIndex = outroPalettes.length & 0xff;
			outroPalettes.push(LoadPalette(imageHunk));
			addUnique(graphics, imageDataOffset, { Key: LoadGraphic(width, height), Value: paletteIndex });
		}

		// #endregion

		// Special handling of the new "remake-only" Extro_texts.amb
		const [hasOutroTexts, outroTextsContainer] = tryGetValue(gameData.Files, 'Extro_texts.amb');
		if (hasOutroTexts) {
			const outroTextsReader = getValue(outroTextsContainer.Files, 1);
			outroTextsReader.Position = 0;
			const clickGroupCount = outroTextsReader.ReadWord();
			const clickGroupSizes = new Array(clickGroupCount).fill(0);
			const newTextClickGroups = new Array(clickGroupCount).fill(null);

			for (let i = 0; i < clickGroupCount; ++i) {
				clickGroupSizes[i] = outroTextsReader.ReadWord();
				newTextClickGroups[i] = [];
			}

			for (let i = 0; i < clickGroupCount; ++i) {
				const groupCount = clickGroupSizes[i];
				const groupSizes = new Array(groupCount).fill(0);

				for (let g = 0; g < groupCount; ++g) {
					groupSizes[g] = outroTextsReader.ReadWord();
					newTextClickGroups[i].push([]);
				}

				for (let g = 0; g < groupCount; ++g) {
					const newTextGroups = newTextClickGroups[i][g];
					const textCount = groupSizes[g];

					for (let t = 0; t < textCount; ++t)
						newTextGroups.push(outroTextsReader.ReadNullTerminatedString(UTF8Encoding));

					newTextClickGroups[i].push(newTextGroups);
				}

				if (outroTextsReader.Position % 2 === 1)
					++outroTextsReader.Position;
			}

			const translatorCount = outroTextsReader.ReadWord();
			const translators = [];

			for (let i = 0; i < translatorCount; ++i)
				translators.push(outroTextsReader.ReadNullTerminatedString(UTF8Encoding));

			const clickText = outroTextsReader.ReadNullTerminatedString(UTF8Encoding);

			if (outroTextsReader.Position % 2 === 1)
				++outroTextsReader.Position;

			this.PatchTexts(newTextClickGroups, translators, clickText, 44);
		}
	}

	/** IReadOnlyDictionary<OutroOption, IReadOnlyList<OutroAction>> (Map) */
	get OutroActions() {
		const result = new Map();
		for (const [key, value] of this.outroActions)
			result.set(key, value.slice());
		return result;
	}

	get OutroPalettes() {
		return this.outroPalettes.slice();
	}

	get Graphics() {
		return [...this.graphics].sort((a, b) => a[0] - b[0]).map(g => g[1].Key);
	}

	get Texts() {
		return this.texts.slice();
	}

	/** IReadOnlyDictionary<uint, OutroGraphicInfo> (Map) */
	get GraphicInfos() {
		const result = new Map();
		[...this.graphics].sort((a, b) => a[0] - b[0]).forEach(([key, value], index) => {
			const info = new OutroGraphicInfo();
			info.GraphicIndex = index;
			info.Width = value.Key.Width;
			info.Height = value.Key.Height;
			info.PaletteIndex = value.Value;
			result.set(key, info);
		});
		return result;
	}

	/** IReadOnlyDictionary<char, Glyph> (Map) */
	get Glyphs() {
		return this.glyphs;
	}

	/** IReadOnlyDictionary<char, Glyph> (Map) */
	get LargeGlyphs() {
		return this.largeGlyphs;
	}

	PatchTexts(newTextGroups, translators, clickText, maxLineLength) {
		if (newTextGroups.length !== 6)
			throw new AmbermoonException(ExceptionScope.Data, 'Wrong count of outro text groups.');

		// Texts starting with an underscore are large texts.
		// Texts starting with a single dollar sign mark the name of the translator dummy.
		// Texts starting with two dollar signs mark the description of the translator.
		const processedTexts = new Array(6).fill(null);

		function GetWords(line) {
			if (isNullOrWhiteSpace(line))
				return [];

			if (line.startsWith(' ')) {
				let wordStartIndex = 0;

				while (line[wordStartIndex++] === ' ')
					;

				const wordEndIndex = line.indexOf(' ', wordStartIndex + 1);

				if (wordEndIndex === -1) // only one word
					return [line];

				return [line.substring(0, wordEndIndex), ...line.substring(wordEndIndex + 1).split(' ')];
			} else {
				return line.split(' ');
			}
		}

		function IsLarge(text) {
			if (text.length === 0) return false;
			if (text[0] === '_') return true;
			return text.startsWith('$_');
		}

		// This will re-arrange text lines to fit into the max line length-
		// It may add or remove some lines but won't touch large text lines
		// (headings) or the click texts.
		// #region Process text lines
		let clickGroupIndex = 0;
		for (const clickGroup of newTextGroups) {
			const processedClickGroup = [];

			for (const group of clickGroup) {
				const processedGroup = [];

				for (let i = 0; i < group.length; ++i) {
					group[i] = group[i].trimEnd();
					const text = group[i];

					if (text.startsWith('$')) {
						processedGroup.push(text);
						continue;
					}

					if (IsLarge(text)) {
						processedGroup.push(text);
						continue;
					}

					if (i === group.length - 1) { // can't move excess text to next line in this case
						let remainingText = text.trim();

						while (remainingText.length !== 0) {
							if (remainingText.length > maxLineLength) {
								const words = GetWords(remainingText);

								if (words[0].length > maxLineLength)
									throw new AmbermoonException(ExceptionScope.Data, 'Outro text could not be fit in.');

								let fitText = words[0];

								for (let w = 1; w < words.length; ++w) {
									if (fitText.length + 1 + words[w].length > maxLineLength)
										break;

									fitText += ' ' + words[w];
								}

								remainingText = remainingText.substring(fitText.length).trimStart();
								processedGroup.push(fitText);
							} else {
								processedGroup.push(remainingText);
								break;
							}
						}
					} else {
						let moveExceedingWordsToNextLine = true;

						// Check if words of the next line fit into the current line
						const nextWords = GetWords(group[i + 1].trimEnd());

						if (nextWords.length !== 0) {
							const words = GetWords(text);
							let lineLength = text.length;
							let consumedNextWords = 0;

							// + 1 as we need a space character in between
							while (consumedNextWords < nextWords.length && lineLength + 1 + nextWords[consumedNextWords].length <= maxLineLength) {
								// Add the word to the current line
								group[i] += ' ' + nextWords[consumedNextWords++];
								lineLength = group[i].length;
							}

							// Remove moved words from next line
							if (consumedNextWords !== 0) {
								group[i + 1] = nextWords.slice(consumedNextWords).join(' ');

								// Note: in this case it does not make sense to move words of
								// the current line to the next line.
								moveExceedingWordsToNextLine = false;
							}
						}

						if (moveExceedingWordsToNextLine) {
							const words = [...GetWords(text)];

							while (group[i].length > maxLineLength) {
								if (words.length === 1)
									throw new AmbermoonException(ExceptionScope.Data, 'Outro text could not be fit in.');

								group[i + 1] = words[words.length - 1] + ' ' + group[i + 1];
								words.splice(words.length - 1, 1);
								group[i] = words.join(' ');
							}
						}

						if (group[i].trim().length !== 0)
							processedGroup.push(group[i]);
					}
				}

				processedClickGroup.push(processedGroup.slice());
			}

			processedTexts[clickGroupIndex++] = processedClickGroup;
		}
		// #endregion

		const allActions = [];
		for (const [key, value] of this.outroActions)
			for (const a of value)
				allActions.push({ Key: key, Value: a });
		const baseTextGroups = this.GroupActions(allActions);
		const groups = [
			getValue(baseTextGroups, OutroOption.ValdynInPartyNoYellowSphere)[0],
			getValue(baseTextGroups, OutroOption.ValdynInPartyNoYellowSphere)[1],
			getValue(baseTextGroups, OutroOption.ValdynInPartyNoYellowSphere)[2],
			getValue(baseTextGroups, OutroOption.ValdynInPartyNoYellowSphere)[3],
			getValue(baseTextGroups, OutroOption.ValdynInPartyWithYellowSphere)[3],
			getValue(baseTextGroups, OutroOption.ValdynInPartyNoYellowSphere)[4]
		];
		const newActionLists = [[], [], [], [], [], []];
		this.texts.length = 0;

		function ProcessText(text) {
			return (text[0] === '_' ? text.substring(1) : text).trim();
		}

		// If in the source there was only 1 line of text but
		// we have to split it into 2 or more lines due to its
		// length in the translation, we need to know how much
		// the first text should scroll.
		const defaultSmallTextScroll = 13;

		for (let i = 0; i < 6; ++i) {
			const clickGroup = groups[i];
			const newTexts = processedTexts[i];
			let groupIndex = 0;
			const newActions = newActionLists[i];

			for (const textGroup of clickGroup.Groups) {
				if (textGroup.ChangePictureAction != null)
					newActions.push(textGroup.ChangePictureAction);

				const texts = newTexts[groupIndex++];
				let t;

				for (t = 0; t < textGroup.TextActions.length; ++t) {
					if (t === texts.length) {
						// The translation needs fewer text lines.
						// We need to use the last scroll amount.
						const lastTextAction = lastOrDefault(textGroup.TextActions.slice(t), a => a.Command === OutroCommand.PrintTextAndScroll && a.TextIndex != null, new OutroAction());
						if (lastTextAction.TextIndex != null)
							newActions[newActions.length - 1] = withProps(fromEnd(newActions, 1), { ScrollAmount: lastTextAction.ScrollAmount });
						break;
					}

					let textAction = textGroup.TextActions[t];

					if (textAction.Command === OutroCommand.WaitForClick ||
						textAction.TextIndex == null)
						break;

					const largeText = texts[t][0] === '_';

					if (largeText && !textAction.LargeText)
						break;

					textAction = withProps(textAction, { TextIndex: this.texts.length });
					if (translators.length > 0 && texts[t].startsWith('$') && !texts[t].startsWith('$$')) {
						this.texts.push(ProcessText(translators[0]));
						newActions.push(textAction);
					} else if (translators.length > 1 && texts[t].startsWith('$$')) {
						this.texts.push(ProcessText(texts[t]));
						newActions.push(textAction);

						for (let tr = 1; tr < translators.length; ++tr) {
							const translatorTextAction = withProps(fromEnd(newActions, 2), { TextIndex: this.texts.length });
							const translatorDescAction = fromEnd(newActions, 1);
							this.texts.push(ProcessText(translators[tr]));
							newActions.push(translatorTextAction);
							newActions.push(translatorDescAction);
						}
					} else {
						this.texts.push(ProcessText(texts[t]));
						newActions.push(textAction);
					}

					if (t !== 0 && largeText)
						throw new AmbermoonException(ExceptionScope.Data, 'Invalid text patch data.');
				}

				const preT = t;

				if (t < texts.length) {
					let lastAction = fromEnd(newActions, 1);

					// More texts but not enough actions.
					if (count(newActions, a => a.Command === OutroCommand.PrintTextAndScroll) > 1 && !fromEnd(newActions, 2).LargeText) {
						// At least two small text lines
						const secondLastAction = fromEnd(newActions, 2);
						const lastScrollAmount = lastAction.ScrollAmount;
						newActions[newActions.length - 1] = withProps(lastAction, { ScrollAmount: secondLastAction.ScrollAmount });
						let textAction;

						while (t < texts.length - 1) {
							textAction = withProps(secondLastAction, { TextIndex: this.texts.length });
							this.texts.push(texts[t++]); // no need for ProcessText as the text is always small
							newActions.push(textAction);
						}

						textAction = withProps(secondLastAction, { TextIndex: this.texts.length, ScrollAmount: lastScrollAmount });
						this.texts.push(texts[t++]); // no need for ProcessText as the text is always small
						newActions.push(textAction);
					} else {
						// Single small text line
						const lastScrollAmount = lastAction.ScrollAmount;
						lastAction = newActions[newActions.length - 1] = withProps(lastAction, { ScrollAmount: defaultSmallTextScroll });
						let textAction;

						while (t < texts.length - 1) {
							textAction = withProps(lastAction, { TextIndex: this.texts.length });
							this.texts.push(texts[t++]); // no need for ProcessText as the text is always small
							newActions.push(textAction);
						}

						textAction = withProps(lastAction, { TextIndex: this.texts.length, ScrollAmount: lastScrollAmount });
						this.texts.push(texts[t++]); // no need for ProcessText as the text is always small
						newActions.push(textAction);
					}
				}

				if (preT < textGroup.TextActions.length) {
					const emptyTextActions = textGroup.TextActions.slice(preT).filter(x => x.TextIndex == null);

					if (emptyTextActions.length !== 0) {
						if (emptyTextActions.length !== 1)
							throw new AmbermoonException(ExceptionScope.Data, 'Invalid text patch data.');

						newActions.push(first(emptyTextActions));
					} else if (textGroup.TextActions.some(a => a.Command === OutroCommand.PrintTextAndScroll && a.TextIndex == null)) {
						throw new AmbermoonException(ExceptionScope.Data, 'Invalid text patch data.');
					}
				} else if (textGroup.TextActions.some(a => a.Command === OutroCommand.PrintTextAndScroll && a.TextIndex == null)) {
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid text patch data.');
				}
			}

			newActions.push(createAction({
				Command: OutroCommand.WaitForClick
			}));
		}

		const groupMappings = [
			[0, 1, 2, 3, 5],
			[0, 1, 2, 4, 5],
			[0, 1, 2, 5],
		];

		// Re-assign the new action lists
		for (let i = 0; i < 3; ++i) {
			this.outroActions.set(i, groupMappings[i].flatMap(index => newActionLists[index]));
		}
	}

	/**
	 * @param input array of { Key: OutroOption, Value: OutroAction }
	 * @returns Map<OutroOption, ClickGroup[]>
	 */
	GroupActions(input) {
		const inputList = [...input];
		const firstTextItemIndex = inputList.findIndex(item => item.Value.TextIndex != null);
		const firstTextItem = first(inputList, item => item.Value.TextIndex != null);
		const clickGroups = new Map();
		const currentGroups = [];
		let currentGroup = new ClickGroup.Group();
		currentGroup.TextActions = [firstTextItem.Value];
		currentGroup.Large = firstTextItem.Value.LargeText;
		currentGroup.ChangePictureAction = inputList[0].Value.Command === OutroCommand.ChangePicture ? inputList[0].Value : null;

		function FinishCurrentGroup() {
			// If the group only consists of a single empty scroll action
			// we just add it to the last group instead.
			if (currentGroup.TextActions.length === 1 &&
				currentGroup.TextActions[0].Command === OutroCommand.PrintTextAndScroll &&
				currentGroup.TextActions[0].TextIndex == null) {
				fromEnd(currentGroups, 1).TextActions.push(currentGroup.TextActions[0]);
			} else {
				currentGroups.push(currentGroup);
			}
			currentGroup = new ClickGroup.Group();
			currentGroup.TextActions = [];
		}

		function FinishCurrentClickGroup(option) {
			FinishCurrentGroup();
			const clickGroup = new ClickGroup();
			clickGroup.Groups = currentGroups.slice();
			const [found, optionClickGroups] = tryGetValue(clickGroups, option);
			if (!found)
				clickGroups.set(option, [clickGroup]);
			else
				optionClickGroups.push(clickGroup);
			currentGroups.length = 0;
		}

		for (const item of inputList.slice(firstTextItemIndex + 1)) {
			if (item.Value.Command === OutroCommand.WaitForClick) {
				currentGroup.TextActions.push(item.Value);
				FinishCurrentClickGroup(item.Key);
				continue;
			}

			if (item.Value.Command === OutroCommand.ChangePicture) {
				currentGroup.ChangePictureAction = item.Value;
				continue;
			}

			if (item.Value.LargeText) {
				if (currentGroup.TextActions.length > 0)
					FinishCurrentGroup();
				currentGroup.Large = true;
			} else if (currentGroup.TextActions.length > 0) {
				const lastAction = fromEnd(currentGroup.TextActions, 1);

				if (lastAction.Command === OutroCommand.PrintTextAndScroll && !lastAction.LargeText) {
					// When text indentation changes or the previous text is an empty scroll
					// action, we will create a new paragraph group. Also if the last scroll
					// amount was greater than the current one.
					if (item.Value.TextIndex != null && (lastAction.TextIndex == null || lastAction.TextDisplayX !== item.Value.TextDisplayX || lastAction.ScrollAmount > item.Value.ScrollAmount)) {
						FinishCurrentGroup();
					}

					// At the end of a paragraph there is a different scroll offset but this is
					// provide by the last line of the paragraph so this line must be included
					// in the current group. So in this case first add the action and then finish
					// the group. We only do this if the scroll amount gets bigger as this indicates
					// the paragraph end. If it gets smaller it was a single line of text in the
					// paragraph which is handled above.
					else if (item.Value.TextIndex != null && lastAction.ScrollAmount < item.Value.ScrollAmount) {
						currentGroup.TextActions.push(item.Value);
						FinishCurrentGroup();
						continue;
					}
				}
			}

			currentGroup.TextActions.push(item.Value);
		}

		if (currentGroup.TextActions.length > 0)
			FinishCurrentClickGroup(fromEnd(inputList, 1).Key);

		return clickGroups;
	}

	LoadFonts(dataReader) {
		dataReader.Position = 0x600; // The data won't be located before that
		const glyphMappingOffset = FindByteSequence(dataReader, GlyphMappingSearchBytes);
		const advanceValueOffset = FindByteSequence(dataReader, AdvanceValuesSearchBytes);
		const largeAdvanceValueOffset = FindByteSequence(dataReader, LargeAdvanceValuesSearchBytes);

		if (glyphMappingOffset === -1 || advanceValueOffset === -1 || largeAdvanceValueOffset === -1)
			throw new AmbermoonException(ExceptionScope.Data, 'Invalid outro data');

		function LoadFont(large, glyphWidth, glyphHeight, glyphs) {
			const bytesPerGlyph = Math.trunc(glyphWidth * glyphHeight / 8);

			// Read glyph mapping
			dataReader.Position = glyphMappingOffset;
			const glyphMapping = dataReader.ReadBytes(96); // 96 chars (first is space)

			// Read advance positions
			dataReader.Position = large ? largeAdvanceValueOffset : advanceValueOffset;
			const advanceValues = dataReader.ReadBytes(76); // for 76 valid chars

			// Read glyph data
			const dataOffset = (large ? largeAdvanceValueOffset : advanceValueOffset) + 76;
			dataReader.Position = dataOffset;
			const glyphData = dataReader.ReadBytes(76 * bytesPerGlyph); // for 76 valid chars

			for (let i = 1; i < glyphMapping.length; ++i) {
				const index = glyphMapping[i];

				if (index === 0xff)
					continue;

				const ch = String.fromCharCode(0x20 + i);
				const graphic = new Graphic();
				graphic.Width = glyphWidth;
				graphic.Height = glyphHeight;
				graphic.IndexedGraphic = true;
				graphic.Data = new Uint8Array(glyphWidth * glyphHeight);
				const numBytesPerRow = Math.trunc((glyphWidth + 7) / 8);
				let ptr = index * bytesPerGlyph;
				for (let y = 0; y < glyphHeight; ++y) {
					let offset = 0;

					for (let n = 0; n < numBytesPerRow; ++n) {
						const data = glyphData[ptr++];

						for (let b = 0; b < 8; ++b) {
							if ((data & (1 << (7 - b))) !== 0)
								graphic.Data[y * numBytesPerRow * 8 + offset + b] = Color.White;
						}

						offset += 8;
					}
				}
				const glyph = new Glyph();
				glyph.Advance = advanceValues[index];
				glyph.Graphic = graphic;
				addUnique(glyphs, ch, glyph);
			}
		}

		// Normal font
		LoadFont(false, 16, 11, this.glyphs);

		// Large font
		LoadFont(true, 32, 22, this.largeGlyphs);
	}
}
