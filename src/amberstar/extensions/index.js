// Engine extensions for Amberstar on the Ambermoon engine (things the Ambermoon engine has no equivalent for):
//  - main menu with the Amberstar title picture (titlePicture.js, AmberstarMainMenu.js, used by the host)
//  - the altar of reunification: assembling the Amberstar from its 13 pieces (altar.js)
//  - the Amberstar outro (outro.js, replaces gameData.OutroData)
//  - the game over picture (Amberstar 80x80 picture "dead people")
//  - guild membership (class change) at the guilds (guild.js, used by the trainer place)
//
// installAmberstarExtensions(ctx, gameData) is called at the end of createAmberstarGameData. Everything that
// needs palettes or textures is prepared here (before the host builds the texture atlases); the runtime parts are
// reached through gameData.AmberstarExtensions.
import { Image80x80 } from '../../../amberstar/src/data/enums.js';
import { getEventPictureIndex } from '../convert/characters/graphics.js';
import { loadTitlePicture } from './titlePicture.js';
import { buildOutroData } from './outro.js';
import { prepareAltar } from './altar.js';
import { createGuildExtension } from './guild.js';
import { AmberstarMainMenu } from './AmberstarMainMenu.js';
import { IntroGraphic } from '../../ambermoon/Ambermoon.Data.Common/IIntroData.js';

/** Installs the extensions (gameData.AmberstarExtensions, gameData.ExtraUIGraphics: UI textures at Graphics.ExtraUIGraphicOffset + key). */
export function installAmberstarExtensions(ctx, gameData) {
	const extensions = {};
	const extraUIGraphics = new Map();

	const title = loadTitlePicture(ctx.source);
	if (title) {
		const key = ctx.palettes.add(title.palette, 'titlepicture');
		extensions.titlePicture = { graphic: title.graphic, paletteIndex: key - 1, paletteKey: key };
		// The host puts the title picture into the main menu texture atlas instead of the Ambermoon main menu
		// background (the Ambermoon intro is not used for Amberstar) and creates the Amberstar main menu.
		extensions.mainMenu = {
			textureKey: IntroGraphic.MainMenuBackground,
			graphic: title.graphic,
			Create: (renderView, cursor, introFont, texts, canContinue, continueLoadingText, newLoadingText, playMusic) =>
				new AmberstarMainMenu(renderView, cursor, IntroGraphic.MainMenuBackground, key - 1, introFont, texts, canContinue,
					continueLoadingText, newLoadingText, playMusic),
		};
		const outroData = buildOutroData(ctx, gameData, title, key);
		if (outroData)
			Object.defineProperty(gameData, 'OutroData', { value: outroData, configurable: true });
	}

	extensions.gameOverPictureIndex = getEventPictureIndex(Image80x80.DeadPeople);
	extensions.altar = prepareAltar(ctx, gameData, extraUIGraphics);
	extensions.guild = createGuildExtension(ctx, gameData);

	gameData.ExtraUIGraphics = extraUIGraphics;
	gameData.AmberstarExtensions = extensions;
	return extensions;
}
