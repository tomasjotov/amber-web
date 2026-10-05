// Port of Ambermoon.Data.Legacy/Serialization/TextContainerReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { AmbermoonEncoding } from '../AmbermoonEncoding.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';

class MergeInfo {
	constructor(formatMessageIndex = 0, firstFormatMessageTextPartIndex = 0, numTotalParts = 0) {
		this.FormatMessageIndex = formatMessageIndex;
		this.FirstFormatMessageTextPartIndex = firstFormatMessageTextPartIndex;
		this.NumTotalParts = numTotalParts;
	}
}

export class TextContainerReader {
	static MouseClickMessage = '{{Click}}';

	static FormatStringMergeInfos = [
		new MergeInfo(0, 0, 5),
		new MergeInfo(3, 0, 3),
		new MergeInfo(12, 1, 2),
		new MergeInfo(13, 1, 4),
		new MergeInfo(15, 1, 6),
		new MergeInfo(18, 1, 2),
		new MergeInfo(19, 1, 2),
		new MergeInfo(20, 1, 2),
		new MergeInfo(21, 0, 3),
		new MergeInfo(23, 1, 4),
		new MergeInfo(25, 1, 6),
		new MergeInfo(28, 1, 4),
		new MergeInfo(30, 1, 4),
		new MergeInfo(32, 1, 4),
		new MergeInfo(34, 0, 3),
		new MergeInfo(36, 1, 4),
		new MergeInfo(38, 1, 6),
		new MergeInfo(41, 1, 2),
	];

	ReadTextContainer(textContainer, dataReader, processUIPlaceholders) {
		const formatMessageDataSizeInLongs = dataReader.ReadWord();
		const numFormatMessageOffsets = dataReader.ReadWord();
		const formatMessageOffsets = new Array(numFormatMessageOffsets + 1).fill(0);
		let i;

		for (i = 0; i < numFormatMessageOffsets; i++)
			formatMessageOffsets[i] = dataReader.ReadWord();
		formatMessageOffsets[i] = formatMessageDataSizeInLongs * 4;

		const formatMessageData = dataReader.ReadBytes(formatMessageDataSizeInLongs * 4);

		// Avoid padding bytes in last text
		while (formatMessageData[formatMessageOffsets[i] - 1] === 0)
			--formatMessageOffsets[i];
		++formatMessageOffsets[i];

		const encoding = new AmbermoonEncoding();

		function ReadText(data, start, end, targetList) {
			const text = encoding.GetString(data.subarray(start, start + end - start - 1));

			if (data[end - 1] !== 0)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid format text data.');

			targetList.push(text);
		}

		function ReadTextLines(data, start, end, targetList) {
			let text = encoding.GetString(data.subarray(start, start + end - start - 1));

			text = text.replaceAll('\0', '\n');

			if (data[end - 1] !== 0xff)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid format text data.');

			text += TextContainerReader.MouseClickMessage;

			targetList.push(text);
		}

		for (i = 0; i < 3; ++i) {
			const start = formatMessageOffsets[i];
			const end = formatMessageOffsets[i + 1];

			ReadText(formatMessageData, start, end, textContainer.WorldNames);
		}

		for (; i < numFormatMessageOffsets; ++i) {
			const start = formatMessageOffsets[i];
			const end = formatMessageOffsets[i + 1];

			if (i === 10 || i === 11)
				ReadTextLines(formatMessageData, start, end, textContainer.FormatMessages);
			else
				ReadText(formatMessageData, start, end, textContainer.FormatMessages);
		}

		for (i = TextContainerReader.FormatStringMergeInfos.length - 1; i >= 0; --i) {
			const mergeInfo = TextContainerReader.FormatStringMergeInfos[i];
			const parts = new Array(mergeInfo.NumTotalParts).fill(null);
			let index = mergeInfo.FormatMessageIndex;
			let placeholder = mergeInfo.FirstFormatMessageTextPartIndex !== 0;
			let deleteCount = 0;
			let placeholderIndex = 0;

			for (let p = 0; p < mergeInfo.NumTotalParts; ++p) {
				if (placeholder) {
					parts[p] = '{' + (placeholderIndex++).toString() + '}';
				} else {
					parts[p] = textContainer.FormatMessages[index];

					if (index++ > mergeInfo.FormatMessageIndex)
						++deleteCount;
				}

				placeholder = !placeholder;
			}

			textContainer.FormatMessages.splice(mergeInfo.FormatMessageIndex + 1, deleteCount);
			textContainer.FormatMessages[mergeInfo.FormatMessageIndex] = parts.join('');
		}

		function ProcessPlaceholders(text, placeholderOffsets) {
			placeholderOffsets.sort((a, b) => a - b);

			for (let i = placeholderOffsets.length - 1; i >= 0; --i) {
				let offset = placeholderOffsets[i];

				if (text[offset] !== '0') // expect 0123 etc
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid placeholder offset.');

				let digit = '1'.charCodeAt(0);
				let length = 1;

				while (++offset < text.length) {
					if (text.charCodeAt(offset) !== digit++) {
						// end of placeholder
						break;
					}

					if (++length === 10)
						break; // max 10 digits
				}

				offset = placeholderOffsets[i];
				text = text.substring(0, offset) + `{${i}:` + '0'.repeat(length) + '}' + text.substring(offset + length);
			}

			return text;
		}

		function ReadTextSection(targetList, placeholderIndicesToWrite) {
			const placeholderRegex = /[0-9]+(?![~])/g;
			const numberOfTexts = dataReader.ReadWord();
			const textLengths = new Array(numberOfTexts).fill(0);

			for (let i = 0; i < numberOfTexts; ++i)
				textLengths[i] = dataReader.ReadWord();

			const placeholderOffsets = [];
			let textDataSize = 0;

			for (let i = 0; i < numberOfTexts; ++i) {
				const textLength = textLengths[i];

				if ((textLength & 0xff00) === 0xff00) {
					if (placeholderIndicesToWrite == null)
						throw new AmbermoonException(ExceptionScope.Data, 'Invalid text section data.');

					// placeholder
					placeholderOffsets.push(textLength & 0xff);
				} else {
					textDataSize += textLength;
					let text = dataReader.ReadString(textLength);

					if (text[text.length - 1] === '\0')
						text = text.substring(0, textLength - 1);

					if (placeholderIndicesToWrite != null && placeholderOffsets.length !== 0) {
						placeholderIndicesToWrite.push(targetList.length);

						if (processUIPlaceholders)
							text = ProcessPlaceholders(text, placeholderOffsets);

						placeholderOffsets.length = 0;
					} else if (processUIPlaceholders) {
						const matches = [...text.matchAll(placeholderRegex)].filter(m => m[0].startsWith('0'));

						for (let m = matches.length - 1; m >= 0; --m) {
							const match = matches[m];
							text = text.substring(0, match.index) + '{' + m.toString() + ':' + '0'.repeat(match[0].length) + '}' + text.substring(match.index + match[0].length);
						}
					}

					targetList.push(text);
				}
			}

			while (textDataSize++ % 4 !== 0)
				++dataReader.Position;
		}

		function ReadSimpleTextSection(targetList, amount) {
			const sizeInLongs = dataReader.ReadWord();
			const end = dataReader.Position + sizeInLongs * 4;

			for (let i = 0; i < amount; ++i) {
				targetList.push(dataReader.ReadNullTerminatedString());
			}

			if (dataReader.Position > end || end - dataReader.Position >= 4)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid simple text section or text amount.');

			dataReader.Position = end;
		}

		ReadTextSection(textContainer.Messages, null);
		ReadSimpleTextSection(textContainer.AutomapTypeNames, 17);
		ReadSimpleTextSection(textContainer.OptionNames, 5);
		ReadSimpleTextSection(textContainer.MusicNames, 32);
		ReadSimpleTextSection(textContainer.SpellClassNames, 7);
		ReadSimpleTextSection(textContainer.SpellNames, 210);
		ReadSimpleTextSection(textContainer.LanguageNames, 8);
		ReadSimpleTextSection(textContainer.ClassNames, 11);
		ReadSimpleTextSection(textContainer.RaceNames, 15);
		ReadSimpleTextSection(textContainer.SkillNames, 10);
		ReadSimpleTextSection(textContainer.AttributeNames, 9);
		ReadSimpleTextSection(textContainer.SkillShortNames, 10);
		ReadSimpleTextSection(textContainer.AttributeShortNames, 8);
		ReadSimpleTextSection(textContainer.ItemTypeNames, 20);
		ReadSimpleTextSection(textContainer.ConditionNames, 16);
		ReadTextSection(textContainer.UITexts, textContainer.UITextWithPlaceholderIndices);

		const versionStringLength = dataReader.ReadByte() * 4;
		const dateAndLanguageStringLength = dataReader.ReadByte() * 4;

		textContainer.VersionString = encoding.GetString(dataReader.ReadBytes(versionStringLength)).replace(/\0+$/, '');
		textContainer.DateAndLanguageString = encoding.GetString(dataReader.ReadBytes(dateAndLanguageStringLength)).replace(/\0+$/, '');
	}
}

TextContainerReader.MergeInfo = MergeInfo;
