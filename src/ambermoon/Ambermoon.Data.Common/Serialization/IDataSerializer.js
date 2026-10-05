// Port of Ambermoon.Data.Common/Serialization/IDataSerializer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Only the enum is ported; IDataSerializer itself is a pure interface.

export const WriteOperation = Object.freeze({
	Insert: 0,
	Override: 1,
	Append: 2
});
