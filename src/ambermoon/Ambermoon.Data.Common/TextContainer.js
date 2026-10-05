// Port of Ambermoon.Data.Common/TextContainer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class TextContainer {
	static Load(reader, dataReader, processUIPlaceholders) {
		const textContainer = new TextContainer();
		reader.ReadTextContainer(textContainer, dataReader, processUIPlaceholders);
		return textContainer;
	}

	constructor() {
		this.WorldNames = [];
		this.FormatMessages = [];
		this.Messages = [];
		this.AutomapTypeNames = [];
		this.OptionNames = [];
		this.MusicNames = [];
		this.SpellClassNames = [];
		this.SpellNames = [];
		this.LanguageNames = [];
		this.ClassNames = [];
		this.RaceNames = [];
		this.SkillNames = [];
		this.AttributeNames = [];
		this.SkillShortNames = [];
		this.AttributeShortNames = [];
		this.ItemTypeNames = [];
		this.ConditionNames = [];
		this.UITexts = [];
		this.UITextWithPlaceholderIndices = [];
		this.VersionString = null;
		this.DateAndLanguageString = null;
	}
}
