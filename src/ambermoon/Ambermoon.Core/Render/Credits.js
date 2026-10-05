// Port of Ambermoon.Core/Render/Credits.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Queue } from '../../../runtime.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { GameCore } from '../GameCore.js';
import { Global } from '../UI/Global.js';
import { Layer } from './Layer.js';
import { TextAlign } from './TextAlign.js';

const LayerPositionFactor = 10;
const LayerSizeFactor = 10;

// struct
class CreditsText {
	constructor(EmptyLines = 0, Text = null) {
		this.EmptyLines = EmptyLines;
		this.Text = Text;
	}
}

export class Credits {
	static get TicksPerLine() {
		return 6 * Global.GlyphLineHeight;
	}

	constructor(renderView, layout, finishAction) {
		this.texts = [];
		this.creditsTexts = new Queue();
		this.ticks = 0;
		this.nextTextTicks = 0;
		this.lastScrollTicks = 0;
		this.lineScrollTicks = 0;
		this.lastText = new CreditsText();

		this.renderView = renderView;
		this.layout = layout;
		this.finishAction = finishAction;

		this.AddHeader('Ambermoon');
		this.AddText('rewritten by Pyrdacor');

		this.AddText('With this project I fulfilled a dream of mine.', 6);
		this.AddText('I loved Ambermoon from the start and making it');
		this.AddText('available to more people makes me very happy.');

		this.AddText('I am very grateful to Karsten Köper and the whole', 2);
		this.AddText('team of Thalion Software for creating this game.');
		this.AddText('It made my childhood an adventure too. Thank you!');

		this.AddHeader('Special Thanks', 14);

		this.AddText('First of all I want to thank kermitfrog for his', 1);
		this.AddText('awesome m68k skills and introducing me to Ghidra.');
		this.AddText('Without him much of this wouldn\'t have been possible.');

		this.AddText('And of course I want to thank Alex Holland!', 3);
		this.AddText('Not only did he manage to preserve an English');
		this.AddText('version of Ambermoon, but he also has incredible');
		this.AddText('knowledge about Ambermoon, Amberstar and Thalion.');
		this.AddText('Over the years, he has kept so much information and');
		this.AddText('so many resources alive that Ambermoon likely');
		this.AddText('wouldn\'t exist today without him.');
		this.AddText('Thank you so much for everything you\'ve done!');

		this.AddText('I also want to thank Nico Bendlin and Jurie Horneman.', 3);
		this.AddText('Even though they don\'t have much time, they support');
		this.AddText('where they can. Nico decoded the fantasy intro');
		this.AddText('and Jurie finally found and released the original');
		this.AddText('Ambermoon source code and docs in May 2023.');

		this.AddText('And of course I want to thank my wife.', 3);
		this.AddText('She was incredibly patient and supportive with me,');
		this.AddText('and I\'m truly grateful for that.');

		this.AddHeader('My supporters', 16);
		this.AddText('Every nerd also needs something to eat. So I am very', 1);
		this.AddText('thankful for all the support I get. Many people');
		this.AddText('donated or even became a patron of mine.');
		this.AddText('Thanks to you all! Especially to my top patrons:');

		this.AddText('Philip Breitsprecher', 1);
		this.AddText('Sebberick');
		this.AddText('Thomas Ritschel');
		this.AddText('Tschorle');
		this.AddText('Mike Valtix');
		this.AddText('timbo t');
		this.AddText('Anton Huber');
		this.AddText('Lars Haugseth');
		this.AddText('giom');
		this.AddText('MD');
		this.AddText('Daniel Egger');
		this.AddText('Kaspar');
		this.AddText('Wolfgang Dobmeier');
		this.AddText('NLS');
		this.AddText('Stay Forever');
		this.AddText('Other Retro Matt');
		this.AddText('meok meok');
		this.AddText('LoneRaider');
		this.AddText('Lorenz P.');
		this.AddText('Unreality');
		this.AddText('Milan');
		this.AddText('NeXuS-Arts');
		this.AddText('Peter Holtgrewe');
		this.AddText('frostworx');
		this.AddText('Martin Tramm');
		this.AddText('André Wösten');
		this.AddText('Alexander Holland');
		this.AddText('Stephan Mankie');
		this.AddText('Benno');
		this.AddText('JR_Riketz');
		this.AddText('Sprudel');
		this.AddText('Carl-Eric Menzel');
		this.AddText('Benjamin Ziebert');
		this.AddText('David Geiger');
		this.AddText('crediar');
		this.AddText('Robin Mattheussen');
		this.AddText('Levidega');
		this.AddText('orgi');
		this.AddText('skobry');
		this.AddText('AMike');
		this.AddText('soulsuckingjerk');
		this.AddText('Mahen');
		this.AddText('Teladi');

		this.AddHeader('Contributors', 12);
		this.AddText('Over the years many people contributed to Ambermoon.', 1);
		this.AddText('In honor of their efforts I list some of them here:');

		this.AddText('meynaf', 1);
		this.AddText('st-h');
		this.AddText('dlfrSilver (Dennis Lechevalier)');
		this.AddText('MetalliC (Vitaly Grebennik)');
		this.AddText('Hexaae (Luca Longone)');
		this.AddText('Oliver Gantert (amberworlds project)');
		this.AddText('Daniel Schulz (slothsoft.net)');
		this.AddText('Nico Bendlin (Ambermoon gitlab)');
		this.AddText('Metibor');
		this.AddText('prophesore');
		this.AddText('Michael Böhnisch');
		this.AddText('Simone Bevilacqua');
		this.AddText('Karol Kliestenec');
		this.AddText('Georg Fuchs');
		this.AddText('Gerald Müller-Bruhnke');

		this.AddText('Thank you guys! You\'re awesome!', 1);

		this.AddText('Also thanks to all the testers of Ambermoon.net!', 3);
		this.AddText('Especially to Thallyrion, Uukrull, Nephilim, crediar');
		this.AddText('and skdubg who also helped fixing translation bugs.');

		this.AddText('Thanks to Czudak who created the app icon, convinced', 1);
		this.AddText('me to create a patreon page and wrote about my');
		this.AddText('project.');

		this.AddText('Thanks to all the project contributors on github.', 1);
		this.AddText('Hessi9b, rap2hpoutre, ReddestDream, midwan, TheYoctoJester,');
		this.AddText('sisch, cbrueffer, claasd and of course Metibor. :)');

		this.AddText('Matthias Steinwachs (the guy who made the incredible', 6);
		this.AddText('music for Ambermoon) started creating remixes of');
		this.AddText('all the beautiful tracks. Check his work out at:');
		this.AddText('https://soundcloud.com/audiotexturat/sets');

		this.AddHeader('Projects to come', 16);
		this.AddText('The next project will be ~INK 17~Ambermoon Advanced~INK 31~.', 1);
		this.AddText('It will balance the game, add new quests, places,');
		this.AddText('monsters, NPCs, items and much more.');
		this.AddText('You can play it on the Amiga or with Ambermoon.net.');

		this.AddText('After this I will start creating the ~INK 17~third part~INK 31~.', 3);
		this.AddText('~INK 17~of the Amber trilogy~INK 31~. This will be a huge project.');

		this.AddText('To stay informed visit me on github, join my', 3);
		this.AddText('discord server, become a patreon or mail me.');

		this.AddHeader('The real end', 9);

		this.AddText('Pyrdacor - trobt(at)web.de', 2);
		this.AddText('github.com/Pyrdacor');
		this.AddText('www.patreon.com/Pyrdacor');
		this.AddText('Discord Server: https://discord.gg/CCTt3bAh7g');
		this.AddText('www.pyrdacor.net');

		this.AddText('November 2025', 2);

		this.lastText = this.creditsTexts.Peek();
		this.SetupNextText(this.lastText.EmptyLines);
	}

	SetupNextText(emptyLines) {
		this.nextTextTicks = this.ticks + emptyLines * Credits.TicksPerLine;
	}

	AddHeader(text, emptyLines = 0) {
		this.AddText(text, emptyLines);
		this.AddText('-'.repeat(text.length));
	}

	AddText(text, emptyLines = 0) {
		this.creditsTexts.Enqueue(new CreditsText(emptyLines, text));
	}

	CreateText(text) {
		const bounds = this.layout.GetTextRect(0, Global.VirtualScreenHeight, Global.VirtualScreenWidth, Global.GlyphLineHeight);
		const renderText = this.renderView.RenderTextFactory.Create(
			(this.renderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1) & 0xff,
			this.renderView.GetLayer(Layer.SubPixelText),
			this.renderView.TextProcessor.ProcessText(text, null, null),
			TextColor.Bright, false, bounds,
			LayerPositionFactor, LayerSizeFactor, TextAlign.Center);
		this.texts.push(renderText);
		renderText.Visible = true;
	}

	Scroll() {
		const tickDiff = this.ticks - this.lastScrollTicks;
		this.lastScrollTicks = this.ticks;
		this.lineScrollTicks += tickDiff;
		const scrollAmount = Util.Round(this.lineScrollTicks * LayerPositionFactor / 6.0);

		if (scrollAmount !== 0) {
			for (let i = this.texts.length - 1; i >= 0; --i) {
				this.texts[i].Place(new Rect(0, this.texts[i].Y - scrollAmount, Global.VirtualScreenWidth * LayerSizeFactor, this.texts[i].Height * LayerSizeFactor), TextAlign.Center);

				if (this.texts[i].Y <= -Global.GlyphLineHeight * LayerSizeFactor) {
					this.texts[i].Delete();
					this.texts.splice(i, 1);
				}
			}
		}

		this.lineScrollTicks -= scrollAmount * 6.0 / LayerPositionFactor;
	}

	Update(deltaTime) {
		this.ticks += GameCore.TicksPerSecond * deltaTime;

		this.Scroll();

		if (this.ticks >= this.nextTextTicks) {
			if (this.creditsTexts.Count === 0) {
				this.finishAction?.(() => {
					this.texts.forEach(text => text?.Delete());
					this.texts.length = 0;
				});
				return;
			}

			const text = this.creditsTexts.Dequeue();

			if (this.creditsTexts.Count === 0)
				this.nextTextTicks = this.ticks + 9.25 * GameCore.TicksPerSecond;
			else
				this.SetupNextText(1 + this.creditsTexts.Peek().EmptyLines);

			this.CreateText(text.Text);
		}
	}
}
