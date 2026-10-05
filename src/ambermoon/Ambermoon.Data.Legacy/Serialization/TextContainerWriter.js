// Port of Ambermoon.Data.Legacy/Serialization/TextContainerWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { TextContainerReader } from './TextContainerReader.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { sum } from '../../../runtime.js';

export class TextContainerWriter {
	WriteTextContainer(textContainer, dataWriter, withProcessedUIPlaceholders) {
		if (textContainer.WorldNames?.length !== 3)
			throw new AmbermoonException(ExceptionScope.Data, `Invalid number of world names: ${textContainer.WorldNames?.length ?? 0}, expected: 3.`);

		let formatMessageDataSize = sum(textContainer.WorldNames, n => n.length + 1);
		const formatMessages = [...textContainer.FormatMessages];
		let i;

		function CheckAndReplaceMouseClickMessage(text) {
			if (!text.endsWith(TextContainerReader.MouseClickMessage))
				throw new AmbermoonException(ExceptionScope.Data, 'Missing mouse click message in multi-line text.');

			const length = TextContainerReader.MouseClickMessage.length;

			return text = text.substring(0, text.length - length);
		}

		formatMessages[4] = CheckAndReplaceMouseClickMessage(formatMessages[4]);
		formatMessages[5] = CheckAndReplaceMouseClickMessage(formatMessages[5]);

		for (i = 0; i < TextContainerReader.FormatStringMergeInfos.length; ++i) {
			const mergeInfo = TextContainerReader.FormatStringMergeInfos[i];
			const text = formatMessages[mergeInfo.FormatMessageIndex];
			const parts = text.split(/[{}]/).filter(s => s.length !== 0); // there is a '0' where a placeholder would be
			let placeholder = mergeInfo.FirstFormatMessageTextPartIndex !== 0;
			let first = true;
			let index = mergeInfo.FormatMessageIndex;

			for (let p = 0; p < mergeInfo.NumTotalParts; ++p) {
				if (!placeholder) {
					if (first) {
						formatMessages[index++] = parts[p];
						first = false;
					} else {
						formatMessages.splice(index++, 0, parts[p]);
					}
				}

				placeholder = !placeholder;
			}
		}

		const numFormatMessageOffsets = textContainer.WorldNames.length + formatMessages.length;
		formatMessageDataSize += sum(formatMessages, m => m.length + 1); // +1 for terminating 0, or 0xff for multi-line strings
		let formatMessageDataSizeInLongs = formatMessageDataSize + 3;
		formatMessageDataSizeInLongs >>= 2;

		dataWriter.WriteWord(formatMessageDataSizeInLongs);
		dataWriter.WriteWord(numFormatMessageOffsets);

		let offset = 0;

		for (i = 0; i < 3; ++i) {
			dataWriter.WriteWord(offset);
			offset += textContainer.WorldNames[i].length + 1;
		}

		for (; i < numFormatMessageOffsets; ++i) {
			dataWriter.WriteWord(offset);
			offset += formatMessages[i - 3].length + 1;
		}

		for (const worldName of textContainer.WorldNames)
			dataWriter.WriteNullTerminated(worldName);

		i = 0;

		for (const formatMessage of formatMessages) {
			if (i === 7 || i === 8) {
				dataWriter.WriteNullTerminated(formatMessage.replaceAll('\n', '\0').replace(/\0+$/, ''));
				dataWriter.WriteByte(0xff);
			} else {
				dataWriter.WriteNullTerminated(formatMessage);
			}

			++i;
		}

		while (formatMessageDataSize++ % 4 !== 0)
			dataWriter.WriteByte(0);

		const placeholderRegexSource = withProcessedUIPlaceholders
			? '\\{[0-9]+:([0-9]+)\\}'
			: '0(1(2(3(4(5(6(7(89?)?)?)?)?)?)?)?)?';

		function WriteTextSection(texts, placeholderTextIndices) {
			function CreatePlaceholder(length) {
				if (length < 1 || length > 10)
					throw new AmbermoonException(ExceptionScope.Data, 'Placeholder length out of range (allowed is 1 to 10).');

				let placeholder = '';

				for (let i = 0; i < length; ++i)
					placeholder += String.fromCharCode(0x30 + i);

				return placeholder;
			}

			const countPosition = dataWriter.Position;
			dataWriter.WriteWord(0); // reserve space for text count

			const processedTexts = [];
			let textIndex = 0;
			let entryCount = texts.length;

			for (const text of texts) {
				let processedText = text;

				if (placeholderTextIndices != null && placeholderTextIndices.includes(textIndex)) {
					if (!withProcessedUIPlaceholders) {
						const matches = [...processedText.matchAll(new RegExp(placeholderRegexSource, 'g'))];

						// There is only 1 case with two placeholders and
						// it stores the second placeholder first.
						for (let i = matches.length - 1; i >= 0; --i) {
							dataWriter.WriteByte(0xff);
							dataWriter.WriteByte(matches[i].index);
							++entryCount;
						}
					} else {
						const placeholderRegex = new RegExp(placeholderRegexSource);

						while (true) {
							const match = placeholderRegex.exec(processedText);

							if (match == null)
								break;

							processedText = processedText.substring(0, match.index) + processedText.substring(match.index + match[0].length);
							processedText = processedText.substring(0, match.index) + CreatePlaceholder(match[1].length) + processedText.substring(match.index);
							dataWriter.WriteByte(0xff);
							dataWriter.WriteByte(match.index);
							++entryCount;
						}
					}
				}

				processedTexts.push(processedText);
				dataWriter.WriteWord(processedText.length + 1);
				++textIndex;
			}

			dataWriter.ReplaceWord(countPosition, entryCount);

			const offset = dataWriter.Position;

			for (const text of processedTexts)
				dataWriter.WriteNullTerminated(text);

			let size = dataWriter.Position - offset;

			while (size++ % 4 !== 0)
				dataWriter.WriteByte(0);
		}

		function WriteSimpleTextSection(texts, expectedAmount) {
			if (expectedAmount !== texts.length)
				throw new AmbermoonException(ExceptionScope.Data, `Invalid number of text: ${texts.length}, expected: ${expectedAmount}.`);

			let size = sum(texts, t => t.length + 1);
			const sizeInLongs = (size + 3) >> 2;

			dataWriter.WriteWord(sizeInLongs);

			for (const text of texts)
				dataWriter.WriteNullTerminated(text);

			while (size++ % 4 !== 0)
				dataWriter.WriteByte(0);
		}

		WriteTextSection(textContainer.Messages, null);
		WriteSimpleTextSection(textContainer.AutomapTypeNames, 17);
		WriteSimpleTextSection(textContainer.OptionNames, 5);
		WriteSimpleTextSection(textContainer.MusicNames, 32);
		WriteSimpleTextSection(textContainer.SpellClassNames, 7);
		WriteSimpleTextSection(textContainer.SpellNames, 210);
		WriteSimpleTextSection(textContainer.LanguageNames, 8);
		WriteSimpleTextSection(textContainer.ClassNames, 11);
		WriteSimpleTextSection(textContainer.RaceNames, 15);
		WriteSimpleTextSection(textContainer.SkillNames, 10);
		WriteSimpleTextSection(textContainer.AttributeNames, 9);
		WriteSimpleTextSection(textContainer.SkillShortNames, 10);
		WriteSimpleTextSection(textContainer.AttributeShortNames, 8);
		WriteSimpleTextSection(textContainer.ItemTypeNames, 20);
		WriteSimpleTextSection(textContainer.ConditionNames, 16);
		WriteTextSection(textContainer.UITexts, textContainer.UITextWithPlaceholderIndices);

		const versionStringLength = (textContainer.VersionString.length + 1 + 3) >> 2;
		const dateAndLanguageStringLength = (textContainer.DateAndLanguageString.length + 1 + 3) >> 2;

		dataWriter.WriteByte(versionStringLength);
		dataWriter.WriteByte(dateAndLanguageStringLength);

		dataWriter.WriteNullTerminated(textContainer.VersionString);
		let padding = versionStringLength * 4 - textContainer.VersionString.length - 1;

		for (i = 0; i < padding; ++i)
			dataWriter.WriteByte(0);

		dataWriter.WriteNullTerminated(textContainer.DateAndLanguageString);
		padding = dateAndLanguageStringLength * 4 - textContainer.DateAndLanguageString.length - 1;

		for (i = 0; i < padding; ++i)
			dataWriter.WriteByte(0);
	}
}
