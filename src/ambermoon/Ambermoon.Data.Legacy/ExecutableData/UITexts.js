// Port of Ambermoon.Data.Legacy/ExecutableData/UITexts.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { AmigaExecutable } from '../Serialization/AmigaExecutable.js';

// Enum.GetValues: all values ordered by their unsigned value
const getValues = enumObject => Object.values(enumObject).sort((a, b) => (a >>> 0) - (b >>> 0));
// Dictionary.Add (throws on duplicate keys)
function add(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

/**
 * Note: Placeholders can be inside the texts.
 * They are represented by increasing numbers
 * starting at 0.
 *
 * Examples:
 * 0 -> Replaced by a 1-digit value (e.g. "5")
 * 01 -> Replaced by a 2-digit value (e.g. " 5" or "23")
 * 012 -> Replaced by a 3-digit value (e.g. "  5" or " 23" or "512")
 * And so on. It allows up to 10 digits.
 *
 * If a 2-digit placeholders is replaced by a 3-digit value (e.g. 100)
 * the display should show "**" instead. As a general rule, fill the
 * hole placeholder length with '*' if the replacement value has more
 * digits as the placeholder allows.
 *
 * Text indices that ends with "Display" are UI labels which display
 * some ingame value along with some text. All others are just texts.
 */
export const UITextIndex = Object.freeze({
	APR: 0,
	He: 1,
	She: 2,
	His: 3,
	Her: 4,
	Skills: 5,
	Attributes: 6,
	Languages: 7,
	Conditions: 8,
	Male: 9,
	Female: 10,
	CardinalDirections: 11,
	AgeDisplay: 12,
	PercentageValueDisplay: 13,
	ValueDisplay: 14,
	EP: 15,
	EPDisplay: 16,
	LPDisplay: 17,
	SPDisplay: 18,
	SLPDisplay: 19,
	TPDisplay: 20,
	GoldAndFoodDisplay: 21,
	LabeledValueDisplay: 22,
	Gold: 23,
	Food: 24,
	ClassHeader: 25,
	Sex: 26,
	BothSexes: 27,
	WeightGramDisplay: 28,
	HandsDisplay: 29,
	FingersDisplay: 30,
	DamageDisplay: 31,
	DefenseDisplay: 32,
	MaxLPDisplay: 33,
	MaxSPDisplay: 34,
	MBWDisplay: 35,
	MBRDisplay: 36,
	Attribute: 37,
	Skill: 38,
	Placeholder2Digit: 39,
	Placeholder2DigitInParentheses: 40,
	Cursed: 41,
	Weight: 42,
	WeightKilogramDisplay: 43,
	Legend: 44,
	Location: 45,
	On: 46,
	Off: 47,
	DataHeader: 48,
	ChooseCharacter: 49,
	Inventory: 50,
});

/**
 * After the ConditionNames there are the
 * UI texts.
 */
export class UITexts {
	/**
	 * UITexts(uiTexts) or UITexts(dataReader)
	 */
	constructor(uiTextsOrDataReader) {
		this.entries = new Map();

		if (Array.isArray(uiTextsOrDataReader)) {
			const uiTexts = uiTextsOrDataReader;

			if (uiTexts.length !== 49)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid number of UI texts.');

			for (let i = 0; i < uiTexts.length; ++i) {
				if (i < 11)
					add(this.entries, i, uiTexts[i]);
				else if (i === 11)
					add(this.entries, UITextIndex.BothSexes, uiTexts[i]);
				else if (i < 28)
					add(this.entries, i - 1, uiTexts[i]);
				else if (i < 39)
					add(this.entries, i, uiTexts[i]);
				else
					add(this.entries, i + 2, uiTexts[i]);
			}

			add(this.entries, UITextIndex.Placeholder2Digit, '{0:00}');
			add(this.entries, UITextIndex.Placeholder2DigitInParentheses, '({0:00})');
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the UI texts just behind the
			 * condition names.
			 *
			 * It will be behind the UI texts after this.
			 */
			const dataReader = uiTextsOrDataReader;
			const placeholderRegex = /[0-9]+/g;

			for (const type of getValues(UITextIndex)) {
				let text = dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding);
				const matches = [...text.matchAll(placeholderRegex)];

				for (let m = matches.length - 1; m >= 0; --m) {
					const match = matches[m];
					text = text.substring(0, match.index) + '{' + m.toString() + ':' + '0'.repeat(match[0].length) + '}' + text.substring(match.index + match[0].length);
				}

				add(this.entries, type, text);
			}

			dataReader.AlignToWord();
		}
	}

	get Entries() { return this.entries; }
}
