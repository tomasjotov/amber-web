// Port of Ambermoon.Core/UI/BuiltinTooltips.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Tooltip texts for built-in UI elements

import { format, hasFlag, tryGetValue, getValue } from '../../../runtime.js';
import { GameLanguage } from '../../Ambermoon.Data.Common/IGameData.js';
import { Features } from '../../Ambermoon.Data.Common/Enumerations/Features.js';
import { Attribute } from '../../Ambermoon.Data.Common/Enumerations/Attribute.js';
import { Skill } from '../../Ambermoon.Data.Common/Enumerations/Skill.js';
import { Condition } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';
import { ClassExtensions } from '../../Ambermoon.Data.Common/Enumerations/Class.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';

const SecondaryStat = Object.freeze({
	Age: 0,
	LP: 1,
	SP: 2,
	SLP: 3,
	TP: 4,
	Gold: 5,
	Food: 6,
	Damage: 7,
	Defense: 8,
	EPPre50: 9,
	EP50: 10,
	LevelWithAPRIncrease: 11,
	LevelWithoutAPRIncrease: 12,
	MagicLevelUpValues: 13, // SP and SLP substring
	RangeOperator: 14, // "bis" or "to"
	MagicIntBonus: 15 // INT/25 etc
});

/** $"{value,2}" */
function alignRight2(value) {
	return String(value).padStart(2, ' ');
}

// The tables are created lazily on first use (they use imported enums).
let featureBasedAttributeTooltips = null;
let attributeTooltips = null;
let skillTooltips = null;
let conditionTooltips = null;
let secondaryStatTooltips = null;

export class BuiltinTooltips {
	static SecondaryStat = SecondaryStat;

	static GetSecondaryStatTooltip(features, gameLanguage, secondaryStat, partyMember) {
		const formatString = getValue(BuiltinTooltips.SecondaryStatTooltips, gameLanguage)[secondaryStat];

		function CreateAPRLevelString() {
			let aprLevels = '';

			const start = hasFlag(features, Features.AdvancedAPRCalculation)
				? partyMember.AttacksPerRoundIncreaseLevels
				: partyMember.AttacksPerRoundIncreaseLevels * 2;

			for (let i = start; i <= 50; i += partyMember.AttacksPerRoundIncreaseLevels) {
				aprLevels += `${i} `;
			}

			return aprLevels.replace(/ +$/, '');
		}

		// returns [hp, spAndSlp, tp, intBonus]
		function GetLevelUpBaseValues() {
			let hp, spAndSlp, tp, intBonus;
			const rangeOperator = getValue(BuiltinTooltips.SecondaryStatTooltips, gameLanguage)[SecondaryStat.RangeOperator];
			const hpPerLevel = partyMember.HitPointsPerLevel;
			hp = `${alignRight2(Math.trunc(hpPerLevel / 2))}${rangeOperator}${hpPerLevel}`;
			if (ClassExtensions.IsMagic(partyMember.Class)) {
				intBonus = format(getValue(BuiltinTooltips.SecondaryStatTooltips, gameLanguage)[SecondaryStat.MagicIntBonus], Math.trunc(partyMember.Attributes[Attribute.Intelligence].TotalCurrentValue / 25));
				const spPerLevel = partyMember.SpellPointsPerLevel;
				const sp = spPerLevel === 0 ? '0' : `${alignRight2(Math.trunc(spPerLevel / 2))}${rangeOperator}${spPerLevel}`;
				const slpPerLevel = partyMember.SpellLearningPointsPerLevel;
				const slp = slpPerLevel === 0 ? '0' : `${alignRight2(Math.trunc(slpPerLevel / 2))}${rangeOperator}${slpPerLevel}`;
				spAndSlp = format(getValue(BuiltinTooltips.SecondaryStatTooltips, gameLanguage)[SecondaryStat.MagicLevelUpValues], sp, slp);
			} else {
				spAndSlp = '^';
				intBonus = '';
			}
			const tpPerLevel = partyMember.TrainingPointsPerLevel;
			tp = `${alignRight2(Math.trunc(tpPerLevel / 2))}${rangeOperator}${tpPerLevel}`;
			return [hp, spAndSlp, tp, intBonus];
		}

		switch (secondaryStat) {
			case SecondaryStat.Age:
				return format(formatString, partyMember.Attributes[Attribute.Age].MaxValue);
			case SecondaryStat.EPPre50:
				return format(formatString, partyMember.GetNextLevelExperiencePoints(features));
			case SecondaryStat.LevelWithAPRIncrease: {
				const [hp, spAndSlp, tp, intBonus] = GetLevelUpBaseValues();
				return format(formatString, hp, spAndSlp, tp, intBonus, partyMember.AttacksPerRound, CreateAPRLevelString());
			}
			case SecondaryStat.LevelWithoutAPRIncrease: {
				const [hp, spAndSlp, tp, intBonus] = GetLevelUpBaseValues();
				return format(formatString, hp, spAndSlp, tp, intBonus, partyMember.AttacksPerRound);
			}
			default:
				return formatString;
		}
	}

	static GetAttributeTooltip(features, gameLanguage, attribute, partyMember) {
		let formatString = getValue(BuiltinTooltips.AttributeTooltips, gameLanguage)[attribute];

		const [found, tooltips] = tryGetValue(BuiltinTooltips.FeatureBasedAttributeTooltips, attribute);
		if (found && hasFlag(features, tooltips.Feature))
			formatString = getValue(tooltips.Languages, gameLanguage);

		const attributeValue = partyMember.Attributes[attribute].TotalCurrentValue;

		switch (attribute) {
			case Attribute.Strength:
				return format(formatString, attributeValue, Math.trunc(attributeValue / 25), Math.trunc(attributeValue / 50));
			case Attribute.Intelligence:
				return format(formatString, Math.trunc(attributeValue / 25));
			case Attribute.Dexterity:
				return format(formatString, attributeValue, Math.trunc((attributeValue + partyMember.Attributes[Attribute.Luck].TotalCurrentValue) * 100 / 150), Math.trunc(attributeValue / 25), Math.trunc(attributeValue / 50));
			case Attribute.Speed:
				return format(formatString, 1 + Math.trunc(attributeValue / 80));
			case Attribute.Stamina:
				return format(formatString, Math.trunc(attributeValue / 25), Math.trunc(attributeValue / 25));
			case Attribute.Charisma:
				return format(formatString, Math.trunc(attributeValue / 10));
			case Attribute.Luck:
				return format(formatString, attributeValue, Math.trunc((attributeValue + partyMember.Attributes[Attribute.Dexterity].TotalCurrentValue) * 100 / 150));
			case Attribute.AntiMagic:
				return format(formatString, attributeValue);
			default:
				throw new AmbermoonException(ExceptionScope.Application, 'Unsupported attribute tooltip');
		}
	}

	static GetSkillTooltip(gameLanguage, skill, partyMember) {
		const formatString = getValue(BuiltinTooltips.SkillTooltips, gameLanguage)[skill];
		const skillValue = partyMember.Skills[skill].TotalCurrentValue;

		switch (skill) {
			case Skill.Swim:
				return format(formatString, Math.trunc(skillValue / 2));
			case Skill.Searching:
				return formatString;
			default:
				return format(formatString, skillValue);
		}
	}

	static GetConditionTooltip(gameLanguage, condition, partyMember) {
		return condition === Condition.Aging
			? format(getValue(getValue(BuiltinTooltips.ConditionTooltips, gameLanguage), condition), partyMember.Attributes[Attribute.Age].MaxValue)
			: getValue(getValue(BuiltinTooltips.ConditionTooltips, gameLanguage), condition);
	}

	static CreateFeatureBasedAttributeTooltips() {
		// Value: { Feature, Languages } (named tuple)
		const root = new Map();

		root.set(Attribute.Strength, { Feature: Features.AdjustedWeaponDamage, Languages: new Map([
			[GameLanguage.German, 'Stärke^^Erhöht das Maximalgewicht um 1kg pro Punkt.^^Außerdem wird alle 25 Punkte der Nahkampfschaden^um 1 und der Fernkampfschaden alle 50 Punkte^um 1 erhöht.^^Aktuell +{0}kg^        +{1} Nahkampfchaden^        +{2} Fernkampfschaden'],
			[GameLanguage.English, 'Strength^^Increases the max weight by 1kg per point.^^Also increases close-ranged damage by 1 every 25^points and long-ranged damage by 1 every 50 points.^^Currently +{0}kg^          +{1} close-ranged damage^          +{2} long-ranged damage'],
			[GameLanguage.French, 'Force^^Augmente le poids maximum de 1kg par point.^^Augmente également les dégâts au corps à^corps de 1 tous les 25 points et les^dégâts à distance de 1 tous les 50 points.^^Actuellement +{0}kg^             +{1} dégâts au corps à corps^             +{2} dégâts à distance'],
			[GameLanguage.Polish, 'Siła^^Zwiększa maksymalny udźwig o 1 kg na punkt.^^Zwiększa również obrażenia w walce wręcz o 1 co 25^punktów oraz obrażenia dystansowe o 1 co 50 punktów.^^Obecnie +{0} kg^        +{1} obrażeń w walce wręcz^        +{2} obrażeń dystansowych'],
			[GameLanguage.Czech, 'Síla^^Zvyšuje maximální nosnost o 1 kg za bod.^^Také zvyšuje poškození na blízko o 1 každých 25^bodů a poškození na dálku o 1 každých 50 bodů.^^V současné době +{0}kg^                +{1} poškození na blízko^                +{2} poškození na dálku'],
		]) });

		// Dexterity
		root.set(Attribute.Dexterity, { Feature: Features.AdjustedWeaponDamage, Languages: new Map([
			[GameLanguage.German, 'Geschicklichkeit^^Chance in Prozent, Schlösser-Fallen^nicht auszulösen.^^Erhöht zusammen mit Glück die^Chance Kämpfe zu vermeiden.^^Erhöht Fernkampfschaden um 1 alle 25 Punkte^und Nahkampfschaden um 1 alle 50 Punkte.^^Aktuell {0}% Fallen-Vermeidung^        {1}% Kampf-Vermeidung^        +{2} Fernkampfschaden^        +{3} Nahkampfschaden'],
			[GameLanguage.English, 'Dexterity^^Chance in percent to not trigger^a trap when messing with locks.^^Adds, together with Luck,^to the chance of avoiding fights.^^Increases long-ranged damage by 1 every 25 points^and close-ranged damage by 1 every 50 points.^^Currently {0}% trap avoid chance^          {1}% fight avoid chance^          +{2} long-ranged damage^          +{3} close-ranged damage'],
			[GameLanguage.French, 'Dextérité^^Chance en pourcentage de ne pas déclencher^un piège en manipulant des serrures.^^Ajoute, avec la Chance, aux chances d\'éviter^les combats.^^Augmente les dégâts à longue portée de 1 tous les 25^points et à courte portée de 1 tous les 50 points.^^Actuellement {0}% de chances d\'éviter les pièges^             {1}% de chances d\'éviter les combats^             +{2} dégâts à longue portée^             +{3} dégâts à courte portée'],
			[GameLanguage.Polish, 'Zręczność^^Szansa w procentach, by nie uruchomić pułapki^podczas majstrowania przy zamkach.^^Dodaje się, wraz ze szczęściem,^do szansy na uniknięcie walki.^^Zwiększa obrażenia dystansowe o 1 co 25 punktów^oraz obrażenia w zwarciu o 1 co 50 punktów.^^Obecnie {0}% szansy na uniknięcie pułapki^        {1}% szansy na uniknięcie walki^        +{2} obrażeń dystansowych^        +{3} obrażeń w zwarciu'],
			[GameLanguage.Czech, 'Obratnost^^Šance v procentech nespustit^past při manipulaci se zámky.^^Přidává spolu se štěstím^k šanci vyhnout se boji.^^Zvyšuje poškození na dálku o 1 každých 25 bodů^a poškození na blízko o 1 každých 50 bodů.^^V současné době {0}% šance vyhnout se pasti^                {1}% šance vyhnout se boji^                +{2} poškození na dálku^                +{3} poškození na blízko'],
		]) });

		// Stamina
		root.set(Attribute.Stamina, { Feature: Features.StaminaHPOnLevelUp, Languages: new Map([
			[GameLanguage.German, 'Konstitution^^Erhöht die Abwehr um 1 pro 25 Punkte.^^Fügt pro 25 Punkte zusätzliche 1 LP^beim Level-Aufstieg hinzu.^^Aktuell +{0} Abwehr, +{1} LP'],
			[GameLanguage.English, 'Stamina^^Increases defense by 1 every 25 points.^^Adds 1 additional LP on^level up for every 25 points.^^Currently +{0} defense, +{1} LP'],
			[GameLanguage.French, 'Énergie^^Augmente la défense de 1 tous les 25 points.^^Ajoute 1 PV supplémentaire au niveau^supérieur pour chaque tranche de 25 points.^^Actuellement +{0} défense, +{1} PV'],
			[GameLanguage.Polish, 'Wytrzymałość^^Zwiększa obronę o 1 co 25 punktów.^^Dodaje 1 dodatkowy PZ na poziom,^za każde 25 punktów.^^Obecnie +{0} do obrony, +{1} PZ'],
			[GameLanguage.Czech, 'Stamina^^Zvyšuje obranu o 1 každých 25 bodů.^^Přidává 1 další BZ na úrovni^za každých 25 bodů.^^V současné době +{0} obrana, +{1} BZ'],
		]) });

		return root;
	}

	static get FeatureBasedAttributeTooltips() {
		return featureBasedAttributeTooltips ??= BuiltinTooltips.CreateFeatureBasedAttributeTooltips();
	}

	static get AttributeTooltips() {
		return attributeTooltips ??= new Map([
			[GameLanguage.German, [
				// Strength
				'Stärke^^Erhöht das Maximalgewicht um 1kg pro Punkt.^^Außerdem wird pro 25 Punkte der Schaden um 1 erhöht.^^Aktuell +{0}kg und +{1} Schaden',
				// Intelligence
				'Intelligenz^^Fügt pro 25 Punkte zusätzliche 1 SP und^SLP beim Level-Aufstieg hinzu.^^Aktuell +{0} SP und SLP',
				// Dexterity
				'Geschicklichkeit^^Chance in Prozent, Schlösser-Fallen^nicht auszulösen.^^Erhöht zusammen mit Glück die^Chance Kämpfe zu vermeiden.^^Aktuell {0}% Fallen-Vermeidung^        {1}% Kampf-Vermeidung',
				// Speed
				'Schnelligkeit^^Höhere Schnelligkeit ermöglicht es im^Kampf früher an der Reihe zu sein.^^Für alle 80 Punkte kannst du dich^ein weiteres Feld pro Runde bewegen.^^Aktuell kannst du dich {0} Feld(er) bewegen.',
				// Stamina
				'Konstitution^^Erhöht die Abwehr um 1 pro 25 Punkte.^^Aktuell +{0} Abwehr',
				// Charisma
				'Karisma^^Erhöht den Verkaufspreis um 1% alle 10 Punkte.^^Aktuell +{0}% Verkaufspreis',
				// Luck
				'Glück^^Chance in Prozent, die Effekte einer^bereits ausgelösten Falle zu verhindern.^^Erhöht zusammen mit Geschicklichkeit^die Chance Kämpfe zu vermeiden.^^Aktuell {0}% Falleneffekt-Vermeidung^        {1}% Kampf-Vermeidung',
				// Anti-Magic
				'Anti-Magie^^Chance in Prozent, einen gegnerischen^Zauber abzuwehren.^^Aktuell {0}% Abwehrchance',
			]],
			[GameLanguage.English, [
				// Strength
				'Strength^^Increases the max weight by 1kg per point.^^Also increases damage by 1 every 25 points.^^Currently +{0}kg and +{1} damage',
				// Intelligence
				'Intelligence^^Adds 1 additional SP and SLP on^level up for every 25 points.^^Currently +{0} SP and SLP',
				// Dexterity
				'Dexterity^^Chance in percent to not trigger^a trap when messing with locks.^^Adds, together with Luck,^to the chance of avoiding fights.^^Currently {0}% trap avoid chance^          {1}% fight avoid chance',
				// Speed
				'Speed^^Higher speed values let you act earlier in battle.^^Every 80 points you can move 1 additional field^per round.^^Currently you can move {0} field(s).',
				// Stamina
				'Stamina^^Increases defense by 1 every 25 points.^^Currently +{0} defense',
				// Charisma
				'Charisma^^Increases the sell price by 1%^every full 10 points.^^Currently +{0}% sell price',
				// Luck
				'Luck^^Chance in percent to avoid the effect^of an already triggered trap.^Adds, together with Dexterity,^to the chance of avoiding fights.^^Currently {0}% trap effect avoid chance^          {1}% fight avoid chance',
				// Anti-Magic
				'Anti-Magic^^Chance in percent to block enemy spells.^^Currently {0}% spell block chance',
			]],
			[GameLanguage.French, [
				// Strength
				'Force^^Augmente le poids maximum de 1kg par point.^^Augmente également les dégâts de^1 tous les 25 points.^^Actuellement +{0}kg et +{1} dégâts',
				// Intelligence
				'Intelligence^^Ajoute 1 PS et 1 PAS supplémentaire^au niveau supérieur pour chaque^tranche de 25 points.^^Actuellement +{0} PS et +{0} PAS',
				// Dexterity
				'Dextérité^^Chance en pourcentage de ne pas^déclencher un piège en manipulant^des serrures.^^Ajoute, avec la Chance,^aux chances d\'éviter les combats.^^Actuellement:^  {0}% de chances d\'éviter les pièges^  {1}% de chances d\'éviter les combats',
				// Speed
				'Vitesse^^Des valeurs de vitesse plus élevées vous^permettent d\'agir plus tôt dans la bataille.^^Tous les 80 points, vous pouvez vous déplacer^d\'un champ supplémentaire par round.^^Actuellement, vous pouvez vous^déplacer de {0} champ(s).',
				// Stamina
				'Énergie^^Augmente la défense de 1 tous les 25 points.^^Actuellement +{0} défense',
				// Charisma
				'Charisme^^Augmente le prix de vente de 1%^à chaque tranche de 10 points.^^Actuellement +{0}% de prix de vente',
				// Luck
				'Chance^^Chance en pourcentage d\'éviter^l\'effet d\'un piège déjà déclenché.^Ajoute, avec la Dextérité,^aux chances d\'éviter les combats.^^Actuellement:^  {0}% de chance d\'éviter l\'effet d\'un piège^  {1}% de chance d\'éviter un combat',
				// Anti-Magic
				'Anti-magie^^Chance en pourcentage de bloquer les sorts ennemis.^^Actuellement:^  {0}% de chances de bloquer les sorts',
			]],
			[GameLanguage.Polish, [
				// Strength
				'Siła^^Zwiększa maksymalny udźwig o 1 kg na punkt.^^Zwiększa również obrażenia o 1 co 25 punktów.^^Obecnie +{0} kg i +{1} obrażeń.',
				// Intelligence
				'Inteligencja^^Dodaje 1 dodatkowy PM i PNM^na poziom, za każde 25 punktów.^^Obecnie +{0} PM i PNM',
				// Dexterity
				'Zręczność^^Szansa w procentach, by nie uruchomić pułapki^podczas majstrowania przy zamkach.^^Dodaje się, wraz ze szczęściem,^do szansy na uniknięcie walki.^^Obecnie {0}% szansy na uniknięcie pułapki^        {1}% szansy na uniknięcie walki.',
				// Speed
				'Szybkość^^Wyższa wartość szybkości pozwala działać wcześniej w walce.^^Za każde 80 punktów możesz poruszyć się o 1 dodatkowe pole^na rundę.^^Obecnie możesz poruszyć się o {0} pól.',
				// Stamina
				'Wytrzymałość^^Zwiększa obronę o 1 co 25 punktów.^^Obecnie +{0} do obrony',
				// Charisma
				'Charyzma^^Zwiększa cenę sprzedaży o 1%^za każde pełne 10 punktów.^^Obecnie +{0}% ceny sprzedaży',
				// Luck
				'Szczęście^^Szansa w procentach na uniknięcie efektu już uruchomionej pułapki.^Dodaje się, wraz ze Zręcznością, do szansy na uniknięcie walki.^^Obecnie {0}% szansy na uniknięcie efektu pułapki^        {1}% szansy na uniknięcie walki.',
				// Anti-Magic
				'Anty-magia^^Procentowa szansa na zablokowanie zaklęć przeciwnika.^^Obecnie {0}% szansy na zablokowanie zaklęć.',
			]],
			[GameLanguage.Czech, [
				// Strength
				'Síla^^Zvyšuje maximální nosnost o 1 kg za bod.^^Také zvyšuje poškození o 1 každých 25 bodů.^^V současné době +{0}kg a +{1} poškození',
				// Intelligence
				'Inteligence^^Přidává 1 další BM a BUK na^úrovni za každých 25 bodů.^^Současně +{0} BM a BUK',
				// Dexterity
				'Obratnost^^Šance v procentech nespustit^past při manipulaci se zámky.^^Přidává spolu se štěstím^k šanci vyhnout se boji.^^V současné době {0}% šance vyhnout se pasti^                {1}% šance vyhnout se boji',
				// Speed
				'Pohyb^^Vyšší hodnoty vám umožňují jednat v bitvě dříve.^^Každých 80 bodů vám umožní posunout se o 1 pole^za kolo.^^V současné době se můžete posunout o {0} políček',
				// Stamina
				'Stamina^^Zvyšuje obranu o 1 každých 25 bodů.^^V současné době +{0} obrana',
				// Charisma
				'Charisma^^Zvyšuje prodejní cenu o 1%^každých plných 10 bodů.^^Aktuálně +{0}% prodejní ceny',
				// Luck
				'Štěstí^^Šance vyhnout se účinku již spuštěné pasti.^Přidává spolu s obratností ^k šanci vyhnout se boji.^^Aktuálně {0}% šance vyhnout se účinku pasti^ {1}% šance vyhnout se boji',
				// Anti-Magic
				'Anti-Magie^^Šance na blokování nepřátelských kouzel v procentech.^^V současné době {0}% šance na blokování kouzel',
			]]
		]);
	}

	static get SkillTooltips() {
		return skillTooltips ??= new Map([
			[GameLanguage.German, [
				// Attack
				'Attacke^^Chance in Prozent, den Gegner zu treffen.^^Aktuell {0}% Trefferchance',
				// Parry
				'Parade^^Chance in Prozent, einen Angriff abzuwehren.^Benötigt die Aktion \'Verteidigen\' im Kampf.^^Aktuell {0}% Abwehrchance',
				// Swim
				'Schwimmen^^Schadensreduktion beim Schwimmen.^^Aktuell {0}% Schadensreduktion',
				// Crit
				'Kritischer Treffer^^Chance in Prozent, einen Gegner^mit einem Schlag zu töten.^Funktioniert nicht gegen Bosse.^^Aktuell {0}% Chance',
				// Find traps
				'Fallen Finden^^Chance in Prozent, eine Schloss-Falle zu finden.^^Aktuell {0}% Chance',
				// Disarm traps
				'Fallen Entschärfen^^Chance in Prozent, eine gefundene^Schloss-Falle zu entschärfen.^^Aktuell {0}% Chance',
				// Lockpick
				'Schlösser Öffnen^^Chance in Prozent, ein Schloss^ohne Dietrich zu knacken.^Funktioniert nicht bei Schlössern,^die einen Schlüssel benötigen.^^Aktuell {0}% Chance',
				// Search
				'Suchen^^Chance geheime Schätze zu entdecken.^Höhere Werte ermöglichen es^bestimmte Truhen zu finden.',
				// Read magic
				'Spruchrollen Lesen^^Chance in Prozent, eine Spruchrolle^erfolgreich zu lesen.^Ansonsten wird diese zerstört.^^Aktuell {0}% Chance',
				// Use magic
				'Magie Benutzen^^Chance in Prozent, einen Zauber^erfolgreich zu wirken.^Manche Zauber haben negative Effekte^wenn sie fehlschlagen.^^Aktuell {0}% Chance',
			]],
			[GameLanguage.English, [
				// Attack
				'Attack^^Chance to hit an enemy.^^Currently {0}% hit chance',
				// Parry
				'Parry^^Chance to block an enemy attack.^The battle action \'Defend\' is necessary for this.^^Currently {0}% block chance',
				// Swim
				'Swim^^Damage reduction while swimming.^^Currently {0}% damage reduction',
				// Crit
				'Critical Hit^^Chance to kill an opponent with a single strike.^Does not work against bosses.^^Current chance: {0}%',
				// Find traps
				'Find Traps^^Chance to find a lock trap.^^Current chance: {0}%',
				// Disarm traps
				'Disarm Traps^^Chance to disarm a found lock trap.^^Current chance: {0}%',
				// Lockpick
				'Lockpicking^^Chance to pick a lock without a lockpick.^Does not work for doors which require a key.^^Current chance: {0}%',
				// Search
				'Searching^^Chance to find secret treasures.^Higher values allow you to find specific chests.',
				// Read magic
				'Read Magic^^Chance to learn a spell from a scroll.^Otherwise the scroll is destroyed.^^Current chance: {0}%',
				// Use magic
				'Use Magic^^Chance to cast a spell successfully.^Some spells have negative effects if the cast fails.^^Current chance: {0}%',
			]],
			[GameLanguage.French, [
				// Attack
				'Attaquer^^Chance de toucher un ennemi.^^Actuellement {0}% de chance de toucher',
				// Parry
				'Parer^^Chance de bloquer une attaque ennemie.^L\'action de combat \'Parer\' est nécessaire pour cela.^^Actuellement {0}% de chances de blocage',
				// Swim
				'Nager^^Réduction des dégâts en nageant.^^Actuellement {0}% de réduction des dégâts',
				// Crit
				'Coup fatal^^Chance de tuer un adversaire d\'un seul coup.^Ne fonctionne pas contre les boss.^^Chance actuelle : {0}%',
				// Find traps
				'Trouver pièges^^Chance de trouver un piège à serrure.^^Chance actuelle : {0}%',
				// Disarm traps
				'Désarmer pièges^^Chance de désarmer un piège à serrure trouvé.^^Chance actuelle : {0}%"',
				// Lockpick
				'Crocheter^^Chance de crocheter une serrure^sans passe-partout.^Ne fonctionne pas pour les^portes nécessitant une clé.^^Chance actuelle : {0}%',
				// Search
				'Chercher^^Chance de trouver des trésors secrets.^Les valeurs les plus élevées vous permettent^de trouver des coffres spécifiques.',
				// Read magic
				'Lire magie^^Chance d\'apprendre un sort à partir d\'un parchemin.^En cas d\'échec, le parchemin est détruit.^^Chance actuelle : {0}%.',
				// Use magic
				'Utiliser magie^^Chance de lancer un sort avec succès.^Certains sorts ont des effets^négatifs en cas d\'échec.^^Chance actuelle : {0}%',
			]],
			[GameLanguage.Polish, [
				// Attack
				'Atak^^Szansa na trafienie przeciwnika.^^Obecnie {0}% szansy na trafienie',
				// Parry
				'Parowanie^^Szansa na zablokowanie ataku przeciwnika.^Konieczne jest wykonanie w trakcie walki akcji \'Obrona\'.^^Obecnie {0}% szansy na zablokowanie.',
				// Swim
				'Pływanie^^Redukcja obrażeń podczas pływania.^^Obecnie {0}% redukcji obrażeń',
				// Crit
				'Krytyczne uderzenie^^Szansa na zabicie przeciwnika jednym uderzeniem.^^Nie działa przeciwko bossom.^^Aktualna szansa: {0}%',
				// Find traps
				'Znajdowanie pułapek^^Szansa na znalezienie pułapki w zamku.^^Aktualna szansa: {0}%',
				// Disarm traps
				'Rozbrajanie pułapek^^Szansa na rozbrojenie znalezionej pułapki.^^Aktualna szansa: {0}%',
				// Lockpick
				'Otwieranie zamków^^Szansa na otwarcie zamka bez wytrycha.^^Nie działa w przypadku drzwi wymagających klucza.^^Aktualna szansa: {0}%',
				// Search
				'Przeszukiwanie^^Szansa na znalezienie ukrytych skarbów.^Wyższe wartości pozwalają znaleźć określone skrzynie.',
				// Read magic
				'Czytanie magii^^Szansa na nauczenie się zaklęcia ze zwoju.^W przeciwnym razie zwój zostanie zniszczony.^^Aktualna szansa: {0}%',
				// Use magic
				'Używanie magii^^Szansa na pomyślne rzucenie zaklęcia.^Niektóre zaklęcia mają negatywne efekty, jeśli rzucenie nie powiedzie się^^Aktualna szansa: {0}%',
			]],
			[GameLanguage.Czech, [
				// Attack
				'Útok^^Šance zasáhnout nepřítele.^^V současné době {0}% šance na zásah',
				// Parry
				'Blokování^^Šance zablokovat nepřátelský útok.^Je k tomu nutná bojová akce \'Parírování\'.^^Současná {0}% šance na zablokování',
				// Swim
				'Plavání^^Snížení poškození při plavání.^^V současné době {0}% snížení poškození',
				// Crit
				'Kritický zásah^^Šance zabít protivníka jediným úderem.^Nefunguje proti bossům.^^Aktuální šance: {0}%',
				// Find traps
				'Najít past^^Šance najít past na zámku.^^Aktuální šance: {0}%',
				// Disarm traps
				'Zneškodnit past^^Šance na zneškodnění nalezené pasti na zámku.^^Aktuální šance: {0}%',
				// Lockpick
				'Odemykání^^Šance na odemčení zámku bez paklíče.^Nefunguje u dveří, které vyžadují klíč.^^Aktuální šance: {0}%',
				// Search
				'Průzkum^^Šance najít tajné poklady.^Vyšší hodnoty umožňují najít konkrétní truhly.',
				// Read magic
				'Čtení kouzel^^Šance naučit se kouzlo ze svitku.^Jinak je svitek zničen.^^Aktuální šance: {0}%',
				// Use magic
				'Sesílání kouzel^^Šance na úspěšné seslání kouzla.^Některá kouzla mají negativní účinky,^pokud se seslání nezdaří.^^Aktuální šance: {0}%',
			]]
		]);
	}

	static get ConditionTooltips() {
		return conditionTooltips ??= new Map([
			[GameLanguage.German, new Map([
				// Irritated
				[Condition.Irritated, 'Der Charakter kann keine Zauber wirken.^^Hält nur für die Dauer des Kampfes.'],
				// Crazy
				[Condition.Crazy, 'Der Charakter führt zufällige Aktionen im Kampf aus.^Sein Inventar ist nicht einsehbar.'],
				// Sleep
				[Condition.Sleep, 'Der Charakter kann keine Kampfaktion ausführen.^Erleidet er Schaden, endet der Status.^^Hält nur für die Dauer des Kampfes.'],
				// Panic
				[Condition.Panic, 'Der Charakter versucht zu fliehen.^Keine Kampfaktion möglich.^Inventar nicht einsehbar.^^Hält nur für die Dauer des Kampfes.'],
				// Blind
				[Condition.Blind, 'Der Charakter kann nicht sehen.^Lichtradius auf 2D-Karten nicht vorhanden.^Völlige Dunkelheit auf 3D-Karten.'],
				// Drugged
				[Condition.Drugged, 'Der Charakter steht unter Drogeneinfluss.^Steuerung erschwert und visuelle Effekte.'],
				// Exhausted
				[Condition.Exhausted, 'Alle Attribute temporär halbiert.^Kann durch Schlafen beseitigt werden.'],
				// Unused
				[Condition.Fleeing, ''],
				// Lamed
				[Condition.Lamed, 'Keine Bewegung und kein Angriff möglich.'],
				// Poisoned
				[Condition.Poisoned, 'Der Charakter erleidet Schaden pro^Kampfrunde und sonst jede Stunde.'],
				// Petrified
				[Condition.Petrified, 'Das Inventar ist nicht verfügbar.^Der Charakter kann keine Aktion^ausführen und altert nicht.'],
				// Diseased
				[Condition.Diseased, 'Der Charakter verliert jeden Tag^dauerhaft einen Punkt eines^zufälligen Attributs.'],
				// Aging
				[Condition.Aging, 'Der Charakter altert pro Tag um ein Jahr.^Je nach Rasse stirbt er ab^einem bestimmten Alter.^^Maximalalter: {0}'],
				// DeadCorpse
				[Condition.DeadCorpse, 'Der Charakter nimmt nicht an Kämpfen teil.^Er kann nicht kommunizieren.'],
				// DeadAshes
				[Condition.DeadAshes, 'Der Charakter nimmt nicht an Kämpfen teil.^Er kann nicht kommunizieren.^Er muss zunächst in Fleisch verwandelt^werden, um ihn wiederzubeleben.'],
				// DeadDust
				[Condition.DeadDust, 'Der Charakter nimmt nicht an Kämpfen teil.^Er kann nicht kommunizieren.^Er muss zunächst in Asche und danach^in Fleisch verwandelt werden,^um ihn wiederzubeleben.'],
			])],
			[GameLanguage.English, new Map([
				// Irritated
				[Condition.Irritated, 'The character can not cast spells.^^Only active during battle.'],
				// Crazy
				[Condition.Crazy, 'The character performs random actions in battle.^His inventory is not accessible.'],
				// Sleep
				[Condition.Sleep, 'The character can not perform battle actions.^Any damage will cancel the status.^^Only active during battle.'],
				// Panic
				[Condition.Panic, 'The character tries to flee.^No battle action possible.^Inventory not accessible.^^Only active during battle.'],
				// Blind
				[Condition.Blind, 'The character can not see.^Light radius on 2D maps is disabled.^Complete darkness on 3D maps.'],
				// Drugged
				[Condition.Drugged, 'The charater is under the influence of drugs.^Complicated control and visual effects.'],
				// Exhausted
				[Condition.Exhausted, 'All attributes halved temporarly.^Can be removed by sleeping.'],
				// Unused
				[Condition.Fleeing, ''],
				// Lamed
				[Condition.Lamed, 'No movement or attack is possible.'],
				// Poisoned
				[Condition.Poisoned, 'The character receives damage^every battle round or hour.'],
				// Petrified
				[Condition.Petrified, 'The inventory is not accessible.^The character can not take any^action and does not age.'],
				// Diseased
				[Condition.Diseased, 'The character loses a point of^a random attribute every day.'],
				// Aging
				[Condition.Aging, 'The character ages every day.^Dependent on his race he will^eventually die at a specific age.^^Max age: {0}'],
				// DeadCorpse
				[Condition.DeadCorpse, 'The character does not participate in battles.^He can not communicate.'],
				// DeadAshes
				[Condition.DeadAshes, 'The character does not participate in battles.^He can not communicate.^His ashes must be converted to^flesh first to resurrect him.'],
				// DeadDust
				[Condition.DeadDust, 'The character does not participate in battles.^He can not communicate.^His dust must be converted to ashes^and then to flesh to resurrect him.'],
			])],
			[GameLanguage.French, new Map([
				// Irritated
				[Condition.Irritated, 'Le personnage ne peut pas lancer de sorts.^^Uniquement actif pendant le combat.'],
				// Crazy
				[Condition.Crazy, 'Le personnage effectue des actions aléatoires au cours du combat.^L\'inventaire n\'est pas accessible.'],
				// Sleep
				[Condition.Sleep, 'Le personnage ne peut pas effectuer d\'actions de combat.^Tout dommage annulera le statut.^^Uniquement actif pendant le combat.'],
				// Panic
				[Condition.Panic, 'Le personnage tente de fuir.^Aucune action de combat possible.^Inventaire non accessible.^Actif uniquement pendant le combat.'],
				// Blind
				[Condition.Blind, 'Le personnage ne peut pas voir.^La zone lumineuse sur les cartes 2D est désactivée.^Les cartes 3D sont complètement sombres.'],
				// Drugged
				[Condition.Drugged, 'Le personnage est sous l\'influence de drogues.^Le contrôle est difficile et il y a des effets visuels.'],
				// Exhausted
				[Condition.Exhausted, 'Tous les attributs sont temporairement réduits de moitié.^Cette réduction peut être supprimée en dormant.'],
				// Unused
				[Condition.Fleeing, ''],
				// Lamed
				[Condition.Lamed, 'Aucun mouvement ou attaque n\'est possible.'],
				// Poisoned
				[Condition.Poisoned, 'Le personnage reçoit des dégâts^à chaque round ou heure de combat.'],
				// Petrified
				[Condition.Petrified, 'L\'inventaire n\'est pas accessible.^Le personnage ne peut faire aucune^action et ne vieillit pas.'],
				// Diseased
				[Condition.Diseased, 'Le personnage perd un point d\'un^attribut aléatoire chaque jour.'],
				// Aging
				[Condition.Aging, 'Le personnage vieillit chaque jour.^En fonction de sa race, il finira^par mourir à un âge précis.^^Age maximum : {0}'],
				// DeadCorpse
				[Condition.DeadCorpse, 'Le personnage ne participe pas aux combats,^il ne peut pas communiquer.'],
				// DeadAshes
				[Condition.DeadAshes, 'Le personnage ne participe pas aux combats,^il ne peut pas communiquer.^Ses cendres doivent d\'abord être transformées^en corps pour qu\'il puisse être ressuscité.'],
				// DeadDust
				[Condition.DeadDust, 'Le personnage ne participe pas aux combats,^il ne peut pas communiquer.^Sa poussière doit être transformée en cendres^et ensuite en corps pour le ressusciter.'],
			])],
			[GameLanguage.Polish, new Map([
				// Irritated
				[Condition.Irritated, 'Postać nie może rzucać zaklęć.^^Aktywne tylko podczas walki.'],
				// Crazy
				[Condition.Crazy, 'Postać wykonuje losowe akcje w walce.^Jej ekwipunek jest niedostępny.'],
				// Sleep
				[Condition.Sleep, 'Postać nie może wykonywać akcji w walce.^Jakiekolwiek obrażenia anulują ten status.^^Aktywne tylko podczas walki.'],
				// Panic
				[Condition.Panic, 'Postać próbuje uciec.^Brak możliwości wykonania akcji w walce.^Brak dostępu do ekwipunku.^^Aktywne tylko podczas walki.'],
				// Blind
				[Condition.Blind, 'Postać nie widzi.^Zasięg wzroku na mapach 2D jest wyzerowany.^Całkowita ciemność na mapach 3D.'],
				// Drugged
				[Condition.Drugged, 'Postać jest pod wpływem narkotyków.^Utrudnion sterowanie i efekty wizualne.'],
				// Exhausted
				[Condition.Exhausted, 'Wszystkie atrybuty są tymczasowo zmniejszone o połowę.^Można usunąć przez przespanie się.'],
				// Unused
				[Condition.Fleeing, ''],
				// Lamed
				[Condition.Lamed, 'Nie jest możliwy ruch ani atak.'],
				// Poisoned
				[Condition.Poisoned, 'Postać otrzymuje obrażenia^co rundę lub co godzinę.'],
				// Petrified
				[Condition.Petrified, 'Ekwipunek jest niedostępny.^Postać nie może wykonać żadnej^akcji i nie starzeje się.'],
				// Diseased
				[Condition.Diseased, 'Postać traci codziennie punkt^losowo wybranej cechy.'],
				// Aging
				[Condition.Aging, 'Postać starzeje się każdego dnia.^W zależności od rasy ostatecznie umrze w określonym wieku.^^Maksymalny wiek: {0}'],
				// DeadCorpse
				[Condition.DeadCorpse, 'Postać nie bierze udziału w walce.^Nie może się komunikować.'],
				// DeadAshes
				[Condition.DeadAshes, 'Postać nie bierze udziału w walce.^Nie może się komunikować.^By ją wskrzesić, najpierw popioły^muszą zostać przekształcone w ciało.'],
				// DeadDust
				[Condition.DeadDust, 'Postać nie bierze udziału w walce.^Nie może się komunikować.^By ją wskrzesić, proch musi zostać^przekształcony w popiół, a następnie w ciało.'],
			])],
			[GameLanguage.Czech, new Map([
				// Irritated
				[Condition.Irritated, 'Postava nemůže sesílat kouzla.^^Aktivní pouze během boje.'],
				// Crazy
				[Condition.Crazy, 'Postava provádí v boji náhodné akce.^Inventář není přístupný.'],
				// Sleep
				[Condition.Sleep, 'Postava nemůže provádět bojové akce.^Jakékoli poškození status zruší.^^Aktivní pouze během boje.'],
				// Panic
				[Condition.Panic, 'Postava se pokusí utéct.^Žádná bojová akce není možná.^Inventář není přístupný.^^Aktivní pouze během boje.'],
				// Blind
				[Condition.Blind, 'Postava nevidí.^Poloměr světla na 2D mapách je vypnutý.^Úplná tma na 3D mapách.'],
				// Drugged
				[Condition.Drugged, 'Postava je pod vlivem.^Závratě a nekoordinovanost pohybů.'],
				// Exhausted
				[Condition.Exhausted, 'Všechny atributy se dočasně sníží na polovinu.^Může být odstraněno spánkem.'],
				// Unused
				[Condition.Fleeing, ''],
				// Lamed
				[Condition.Lamed, 'Není možný žádný pohyb ani útok.'],
				// Poisoned
				[Condition.Poisoned, 'Postava dostává poškození^každé bojové kolo nebo hodinu.'],
				// Petrified
				[Condition.Petrified, 'Inventář není přístupný.^Postava nemůže provádět žádné^akce a nestárne.'],
				// Diseased
				[Condition.Diseased, 'Postava ztrácí každý den bod^náhodného atributu.'],
				// Aging
				[Condition.Aging, 'Postava stárne každým dnem.^Závisí to na její rase.^nakonec zemře v určitém věku.^^Max. věk: {0}'],
				// DeadCorpse
				[Condition.DeadCorpse, 'Postava se neúčastní bitev.^Nemůže komunikovat.'],
				// DeadAshes
				[Condition.DeadAshes, 'Postava se neúčastní bitev.^Nemůže komunikovat.^Její popel se musí nejprve přeměnit^na tělo, aby mohla být vzkříšena.'],
				// DeadDust
				[Condition.DeadDust, 'Postava se neúčastní bitev.^Nemůže komunikovat.^Její prach se musí přeměnit v popel^a pak na tělo, aby mohla být vzkříšena.'],
			])]
		]);
	}

	static get SecondaryStatTooltips() {
		return secondaryStatTooltips ??= new Map([
			[GameLanguage.German, [
				// Age
				'Alter des Charakters^^Er stirbt wenn das maximale^Alter von {0} erreicht ist.',
				// LP
				'Lebenspunkte^^Wenn sie auf 0 sinken,^stirbt der Charakter.',
				// SP
				'Spruchpunkte^^Werden zum Wirken^von Zaubern benötigt.',
				// SLP
				'Spruchlernpunkte^^Werden zum Lernen^von Zaubern benötigt.',
				// TP
				'Trainingspunkte^^Werden zum Steigern von^Fähigkeiten bei Trainern benötigt.',
				// Gold
				'Gold^^Die Währung in Ambermoon.^Wird für den Kauf von Waren benötigt.',
				// Food
				'Rationen^^Bei jeder Rast (außer in Gasthäusern),^wird 1 Ration pro Charakter^verbraucht um LP und SP aufzufüllen.',
				// Damage
				'Schaden^^Grundwert für den Schaden im Kampf.^^Wird durch die Ausrüstung und Stärke bestimmt.',
				// Defense
				'Abwehr^^Grundwert für die Schadensreduzierung^von physischen Angriffen.^^Wird durch Ausrüstung und Konstitution bestimmt.',
				// EPPre50
				'Erfahrungspunkte^^Werden für den Levelaufstieg benötigt.^^Nächster Level bei {0} EP.',
				// EP50
				'Erfahrungspunkte^^Werden für den Levelaufstieg benötigt.^^Maximallevel bereits erreicht.',
				// LevelWithAPRIncrease
				'Charakterlevel^^Jeder Levelaufstieg erhöht die^Werte des Charakters um:^^ LP : {0,-10}{1} TP : {2}{3}^^Attacken pro Runde erhöhen sich^bei bestimmten Leveln:^^ {5}^^Attacken pro Runde sind {4}',
				// LevelWithoutAPRIncrease
				'Charakterlevel^^Jeder Levelaufstieg erhöht die^Werte des Charakters um:^^ LP : {0,-10}{1} TP : {2}{3}^^Attacken pro Runde sind {4}',
				// MagicLevelUpValues
				' SP : {0}^ SLP: {1,-10}',
				// RangeOperator
				' - ',
				// MagicIntBonus
				'^ Bonus: SP und SLP +INT/25 ({0})',
			]],
			[GameLanguage.English, [
				// Age
				'Age of the character^^They die at the max age of {0}.',
				// LP
				'Life Points^^When they reach 0^the character dies.',
				// SP
				'Spell Points^^Are used to cast spells.',
				// SLP
				'Spell Learning Points^^Are used to learn spells.',
				// TP
				'Training Points^^Are used to increase^skills at trainers.',
				// Gold
				'Gold^^Currency of Ambermoon.^Is used to buy goods.',
				// Food
				'Rations^^For every rest (besides sleeping at inns),^1 ration is consumed per character to^refill LP and SP.',
				// Damage
				'Damage^^Base value for damage in battles.^^Is composed of equipment and strength.',
				// Defense
				'Defense^^Base value for physical damage^reduction in battles.^^Is composed of equipment and stamina.',
				// EPPre50
				'Experience Points^^Are needed to gain levels.^^Next level at {0} EP.',
				// EP50
				'Experience Points^^Are needed to gain levels.^^Max level already reached.',
				// LevelWithAPRIncrease
				'Character Level^^Each level-up increases the^character\'s values by:^^ LP : {0,-10}{1} TP : {2}{3}^^Attacks per round increase^at specific levels:^^ {5}^^Attacks per round are {4}',
				// LevelWithoutAPRIncrease
				'Character Level^^Each level-up increases the^character\'s values by:^^ LP : {0,-10}{1} TP : {2}{3}^^Attacks per round are {4}',
				// MagicLevelUpValues
				' SP : {0}^ SLP: {1,-10}',
				// RangeOperator
				' to ',
				// MagicIntBonus
				'^ Bonus: SP and SLP +INT/25 ({0})',
			]],
			[GameLanguage.French, [
				// Age
				'Âge du personnage^^Il meurt à l\'âge maximum de {0}.',
				// LP
				'Points de vie^^Lorsqu\'ils atteignent^0 le personnage meurt.',
				// SP
				'Points de sorts^^Sont utilisés pour lancer des sorts.',
				// SLP
				'Points d\'apprentissage de sorts^^Ils sont utilisés pour apprendre des sorts.',
				// TP
				'Points d\'entrainement^^Sont utilisés pour améliorer les compétences^lors des visites aux entraîneurs.',
				// Gold
				'Or^^Monnaie d\'Ambermoon. Il est utilisé^pour acheter des marchandises.',
				// Food
				'Rations^^Pour chaque repos (en dehors des auberges),^1 ration est consommée par personnage^pour remplir les PV et les PS.',
				// Damage
				'Dégâts^^Valeur de base pour les^dégâts lors des combats.^^Se compose de l\'équipement^et de la force.',
				// Defense
				'Défense^^Valeur de base pour la réduction^des dégâts physiques au combat.^^Se compose de l\'équipement^et d\'énergie.',
				// EPPre50
				'Points d\'expérience^^Nécessaires pour gagner des niveaux.^^Prochain niveau à {0} XP.',
				// EP50
				'Points d\'expérience^^Nécessaires pour gagner des niveaux.^^Le niveau maximum a déjà été atteint.',
				// LevelWithAPRIncrease
				'Niveau du personnage^^Chaque augmentation de niveau accroît^les valeurs du personnage de :^^ PV : {0,-10}{1} PE : {2}{3}^^Les attaques par round augmentent^à des niveaux spécifiques:^^ {5}^^Les attaques par round sont {4}',
				// LevelWithoutAPRIncrease
				'Niveau du personnage^^Chaque augmentation de niveau accroît^les valeurs du personnage de :^^ PV : {0,-10}{1} PE : {2}{3}^^Les attaques par round sont {4}',
				// MagicLevelUpValues
				' PS : {0}^ PAS: {1,-10}',
				// RangeOperator
				' à ',
				// MagicIntBonus
				'^ Bonus: PS et PAS +INT/25 ({0})',
			]],
			[GameLanguage.Polish, [
				// Age
				'Wiek postaci^^Umiera w maksymalnym wieku {0} lat.',
				// LP
				'Punkty życia^^Gdy osiągną 0, postać umiera.',
				// SP
				'Punkty magii^^Służą do rzucania zaklęć.',
				// SLP
				'Punkty nauki magii^^Służą do nauki zaklęć.',
				// TP
				'Punkty treningu^^Są używane do zwiększania umiejętności u trenerów.',
				// Gold
				'Złoto^^Waluta Ambermoon.^Służy do kupowania towarów.',
				// Food
				'Racje żywnościowe^^Każdy odpoczynek (poza spaniem w karczmach)^zużywa 1 rację żywnościową na postać w celu^uzupełnienia PŻ i PM.',
				// Damage
				'Obrażenia^^Podstawowa wartość obrażeń w walce.^^Składowa wyposażenia i siły.',
				// Defense
				'Osłona^^Podstawowa wartość redukcji obrażeń fizycznych w walce.^^Składowa wyposażenia i wytrzymałości.',
				// EPPre50
				'Punkty doświadczenia^^Potrzebne do zdobywania poziomów.^^Następny poziom przy {0} EP.',
				// EP50
				'Punkty doświadczenia^^Potrzebne do zdobywania poziomów.^^Maksymalny poziom został już osiągnięty.',
				// LevelWithAPRIncrease
				'Poziom postaci^^Każde podniesienie poziomu zwiększa cechy postaci o:^^ PŻ : {0,-10}{1} PT : {2}{3}^^Ataki na rundę wzrastają^na określonych poziomach:^^ {5}^^Ataki na rundę wynoszą {4}',
				// LevelWithoutAPRIncrease
				'Poziom postaci^^Każde podniesienie poziomu zwiększa cechy postaci o:^^ PŻ : {0,-10}{1} PT : {2}{3}^^Ataki na rundę wynoszą {4}.',
				// MagicLevelUpValues
				' PM : {0}^ PNM: {1,-10}',
				// RangeOperator
				' do ',
				// MagicIntBonus
				'^ Premia: PM i PNM +INT/25 ({0})',
			]],
			[GameLanguage.Czech, [
				// Age
				'Věk postavy^^Umírá v maximálním věku {0}.',
				// LP
				'Body života^^Když dosáhnou 0^postava umírá.',
				// SP
				'Body magie^^Slouží k sesílání kouzel.',
				// SLP
				'Body učení kouzel^^Slouží k učení kouzel.',
				// TP
				'Tréninkové body^^Slouží ke zvýšení^dovedností u trenérů.',
				// Gold
				'Zlato^^Měna Ambermoonu.^Slouží k nákupu zboží.',
				// Food
				'Jídlo^^Při každém odpočinku (kromě spaní v hostincích)^1 jídlo na postavu k^doplnění BŽ a BM.',
				// Damage
				'Poškození^^Základní hodnota poškození v bitvách.^^Skládá se z vybavení a síly.',
				// Defense
				'Obrana^^Základní hodnota pro snížení fyzického poškození^v bitvách.^^Kombinace správného vybavení a staminy.',
				// EPPre50
				'Zkušenostní body^^Potřebné k získání úrovně.^^Další úroveň na {0} ZB.',
				// EP50
				'Zkušenostní body^^Jsou potřebné k získání úrovně.^^Max. úrovně již bylo dosaženo.',
				// LevelWithAPRIncrease
				'Úroveň postavy^^Každé zvýšení úrovně zvyšuje hodnoty^postavy o:^^ BŽ : {0,-10}{1} TB : {2}{3}^^Útoky za kolo se zvyšují^na určitých úrovních:^^ {5}^^Útoky v jednom kole jsou {4}',
				// LevelWithoutAPRIncrease
				'Úroveň postavy^^Každé zvýšení úrovně zvyšuje hodnoty^postavy o:^^ BŽ : {0,-10}{1} TB : {2}{3}^^Útoky v jednom kole jsou {4}',
				// MagicLevelUpValues
				' BM : {0}^ BUK: {1,-10}',
				// RangeOperator
				' na ',
				// MagicIntBonus
				'^ Bonus: BM a BUK +INT/25 ({0})',
			]]
		]);
	}
}

export { SecondaryStat as BuiltinTooltips_SecondaryStat };
