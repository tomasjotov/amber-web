// Port of Ambermoon.Data.Common/Enumerations/Gender.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export const Gender = Object.freeze({
	Male: 0,
	Female: 1
});

export const GenderFlag = Object.freeze({
	None: 0,
	Male: 1,
	Female: 2,
	Both: 3
});

export class GenderExtensions {
	static Contains(genders, gender) {
		const flag = 1 << gender;
		return (genders & flag) === flag;
	}
}
