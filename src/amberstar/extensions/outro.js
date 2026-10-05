// The Amberstar outro on the Ambermoon outro player (Ambermoon.net/Outro.js).
//
// The Amberstar extro (EXTRO.UDO, a LOB packed program) shows Lord Karwain's speech at the celebration in
// Twinlake and an epilogue that leads to Ambermoon. Its texts are stored in the program as pages (0 terminated,
// line breaks = 13) in two sections (terminated by 0xff). The pictures of the extro are part of its packed
// animation code and are not decoded here, so the outro shows the Amberstar title picture (the giant eagle and
// the dragon flying in harmony - which is exactly what the epilogue describes).
//
// The result implements the members of IOutroData the Ambermoon outro uses: OutroActions (per OutroOption),
// Graphics, GraphicInfos, Texts, Glyphs, LargeGlyphs (the Ambermoon outro fonts are kept).
import { readContainer } from '../../../amberstar/src/data/container.js';
import { OutroAction, OutroCommand, OutroGraphicInfo, OutroOption } from '../../ambermoon/Ambermoon.Data.Common/IOutroData.js';
import { Font } from '../../ambermoon/Ambermoon.net/Font.js';

const LineScroll = 13; // like the Ambermoon outro
const ParagraphScroll = 61;

/** Reads the text sections of EXTRO.UDO: [[page lines]] per section */
export function loadExtroTexts(source) {
	const file = source.files.get('EXTRO.UDO');
	if (!file)
		return null;
	const data = readContainer(file).get(1)?.data;
	if (!data)
		return null;
	const marker = [...'LORD KARWAIN'].map(c => c.charCodeAt(0));
	let start = -1;
	for (let i = 0; i < data.length - marker.length && start < 0; i++) {
		if (marker.every((b, k) => data[i + k] === b))
			start = i;
	}
	if (start < 0)
		return null;
	const sections = [[]];
	let page = '';
	for (let i = start; i < data.length && sections.length <= 2; i++) {
		const c = data[i];
		if (c === 0) {
			sections[sections.length - 1].push(page.split('\r'));
			page = '';
			if (data[i + 1] === 0xff) {
				i++;
				sections.push([]);
			}
		} else {
			page += String.fromCharCode(c);
		}
	}
	return sections.filter(s => s.length !== 0);
}

const ProperNames = ['Lyramion', 'Tarbos', 'Lord', 'Karwain', 'Ambermoon', 'Amber'];

/** Amberstar upper case text -> sentence case like the Ambermoon outro texts. */
function sentenceCase(lines) {
	let capitalize = true;
	return lines.map(line => {
		let result = '';
		for (const word of line.split(/(\s+)/)) {
			let w = word.toLowerCase();
			const proper = ProperNames.find(n => new RegExp(`^${n.toLowerCase()}(?![a-z])`).test(w));
			if (proper || capitalize)
				w = w.replace(/[a-z]/, ch => ch.toUpperCase());
			if (/\S/.test(word))
				capitalize = /[.!?:]$/.test(word) && !word.endsWith('...');
			result += w;
		}
		return result.replace(/ \?/g, '?').replace(/ :/g, ':');
	});
}

export function buildOutroData(ctx, gameData, title, paletteKey) {
	const sections = loadExtroTexts(ctx.source);
	const base = gameData.OutroData;
	if (!sections || !base)
		return null;
	let font = null;
	try {
		font = new Font(base.Glyphs, 6, 0);
	} catch {
		// centering falls back to a fixed indent
	}
	const measure = text => {
		if (!font)
			return 6 * text.length;
		let width = 0;
		for (const ch of text)
			width += ch === ' ' ? 6 : (font.glyphs.get(ch)?.Advance ?? font.glyphs.get(ch.toUpperCase())?.Advance ?? 0);
		return width;
	};

	const texts = [];
	const actions = [];
	const print = (line, scroll) => {
		texts.push(line);
		actions.push(new OutroAction({
			Command: OutroCommand.PrintTextAndScroll, ScrollAmount: scroll, LargeText: false,
			TextDisplayX: Math.max(0, Math.trunc((320 - measure(line)) / 2)), TextIndex: texts.length - 1,
		}));
	};
	const scroll = amount => actions.push(new OutroAction({ Command: OutroCommand.PrintTextAndScroll, ScrollAmount: amount, TextIndex: null }));

	for (const section of sections) {
		for (const page of section) {
			const lines = sentenceCase(page);
			lines.forEach((line, i) => {
				if (line.trim() === '')
					scroll(LineScroll);
				else
					print(line, i === lines.length - 1 ? ParagraphScroll : LineScroll);
			});
		}
		scroll(ParagraphScroll);
	}
	// Scroll the last text out, then show the title picture until the player clicks.
	scroll(200);
	actions.push(new OutroAction({ Command: OutroCommand.ChangePicture, ImageOffset: 0 }));
	actions.push(new OutroAction({ Command: OutroCommand.WaitForClick }));

	const graphicInfos = new Map([[0, new OutroGraphicInfo({
		GraphicIndex: 0, Width: title.graphic.Width, Height: title.graphic.Height,
		// Outro: sprite palette = FirstOutroPaletteIndex + PaletteIndex - 1, our palette key - 1
		PaletteIndex: paletteKey - ctx.baseProvider.FirstOutroPaletteIndex,
	})]]);
	const outroActions = new Map([
		[OutroOption.ValdynInPartyNoYellowSphere, actions],
		[OutroOption.ValdynInPartyWithYellowSphere, actions],
		[OutroOption.ValdynNotInParty, actions],
	]);
	return {
		IsAmberstarOutro: true,
		GraphicAtlas: null,
		OutroActions: outroActions,
		OutroPalettes: [],
		Graphics: [title.graphic],
		GraphicInfos: graphicInfos,
		Texts: texts,
		Glyphs: base.Glyphs,
		LargeGlyphs: base.LargeGlyphs,
	};
}
