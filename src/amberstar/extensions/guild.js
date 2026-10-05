// Amberstar guild membership on the Ambermoon trainer place.
//
// In Amberstar a character without class (the hero starts as "nothing") joins one of the 8 guilds to get its
// class (amberstar/src/game/screens/placeScreen.js #joinGuild):
//  - already member of this guild -> guild welcome message
//  - member of another guild (class != none) or the class is not allowed for the character
//    (CHARDATA possible classes bit field, depends on the race) -> refused
//  - otherwise the membership price (place data word 0) is paid and the class changes.
// The Amberstar guilds are converted to Ambermoon trainers (convert/characters/places.js: they train the main skill
// of the class for the level up price). places.js stores the Amberstar guild class (place word 3) and the
// membership price (place word 2), so the trainer window gets an extra "join" button for Amberstar guilds
// (GameCore.OpenTrainer calls SetupTrainer). The Ambermoon class of a guild is mappings.js ClassMapping.
import { ButtonType } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/ButtonType.js';
import { Button } from '../../ambermoon/Ambermoon.Core/UI/Button.js';
import { TextAlign } from '../../ambermoon/Ambermoon.Core/Render/TextAlign.js';
import { ClassMapping, classSpellMastery } from '../convert/characters/mappings.js';
import { convertMessage } from '../convert/maps2D/texts.js';

const Message = Object.freeze({ GuildMembershipPrice: 71, NotEnoughGold: 76, GuildWelcome: 198 });

/** Amberstar class of an Ambermoon class (0 = none) */
function amberstarClassOf(ambermoonClass) {
	const index = ClassMapping.indexOf(ambermoonClass);
	return index < 0 ? -1 : index;
}

export function createGuildExtension(ctx) {
	const messages = new Map();
	const message = index => {
		if (!messages.has(index))
			messages.set(index, convertMessage(ctx, index) ?? '');
		return messages.get(index);
	};
	const possibleClasses = new Map();
	const possibleClassesOf = characterIndex => {
		if (!possibleClasses.has(characterIndex)) {
			let value = 0xffff;
			try {
				value = ctx.source.loadPerson(characterIndex)?.possibleClasses ?? 0xffff;
			} catch {
				// unknown character: allow all classes
			}
			possibleClasses.set(characterIndex, value);
		}
		return possibleClasses.get(characterIndex);
	};

	const extension = {
		/** { amberstarClass, ambermoonClass, joinPrice } of a trainer place or null (no Amberstar guild) */
		GetGuild(trainer) {
			const amberstarClass = trainer.GetWord?.(6) ?? 0;
			if (amberstarClass < 1 || amberstarClass > 8)
				return null;
			return { amberstarClass, ambermoonClass: ClassMapping[amberstarClass], joinPrice: trainer.GetWord(4) };
		},

		GetWelcomeText(trainer) {
			return extension.GetGuild(trainer) ? message(Message.GuildWelcome) : null;
		},

		/** Result of a join request: 'member', 'refused' or 'canjoin' */
		CheckJoin(partyMember, guild) {
			if (partyMember.Class === guild.ambermoonClass)
				return 'member';
			if (amberstarClassOf(partyMember.Class) !== 0)
				return 'refused';
			if ((possibleClassesOf(partyMember.Index) & (1 << guild.amberstarClass)) === 0)
				return 'refused';
			return 'canjoin';
		},

		Join(partyMember, guild) {
			const oldMastery = classSpellMastery(partyMember.Class);
			partyMember.Class = guild.ambermoonClass;
			partyMember.SpellMastery = (partyMember.SpellMastery & ~oldMastery) | classSpellMastery(guild.ambermoonClass);
		},

		/**
		 * Called by GameCore.OpenTrainer for every trainer window. Adds the join button (button 0) for Amberstar
		 * guilds. `updateGold` refreshes the gold display of the place, `playerSwitched` the train button.
		 */
		SetupTrainer(game, trainer, updateGold, playerSwitched) {
			const guild = extension.GetGuild(trainer);
			if (!guild)
				return;
			const layout = game.layout;
			const join = () => {
				const partyMember = game.CurrentPartyMember;
				switch (extension.CheckJoin(partyMember, guild)) {
					case 'member':
						layout.ShowClickChestMessage(message(Message.GuildWelcome));
						return;
					case 'refused':
						layout.ShowClickChestMessage(amberstarClassOf(partyMember.Class) !== 0
							? `${partyMember.Name} is already a member of another guild.`
							: `${partyMember.Name} cannot join this guild.`);
						return;
					default:
						break;
				}
				const price = guild.joinPrice;
				layout.ShowPlaceQuestion(`${message(Message.GuildMembershipPrice)} ${price}${game.DataNameProvider.AgreeOnPrice}`, answer => {
					if (!answer)
						return;
					if (trainer.AvailableGold < price) {
						layout.ShowClickChestMessage(message(Message.NotEnoughGold));
						return;
					}
					trainer.AvailableGold -= price;
					updateGold?.();
					extension.Join(partyMember, guild);
					game.UpdateCharacterInfo?.();
					playerSwitched?.();
					layout.ShowClickChestMessage(`${partyMember.Name} is now a ${game.DataNameProvider.GetClassName(partyMember.Class)}.`);
				}, TextAlign.Left);
			};
			layout.buttonGrid.SetButton(0, ButtonType.AskToJoin, false, join, false, layout.GetTooltip(Button.TooltipType.AskToJoin));
		},
	};
	return extension;
}


