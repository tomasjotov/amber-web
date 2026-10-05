// Port of Ambermoon.Data.Common/Serialization/ISavegameSerializer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Only the structs are ported; ISavegameSerializer itself is a pure interface.

export class SavegameInputFiles {
	constructor() {
		/** Party_data.sav (IDataReader) */
		this.SaveDataReader = null;
		/** Party_char.amb (IFileContainer) */
		this.PartyMemberDataReaders = null;
		/** Chest_data.amb (IFileContainer) */
		this.ChestDataReaders = null;
		/** Merchant_data.amb (IFileContainer) */
		this.MerchantDataReaders = null;
		/** Automap.amb (IFileContainer) */
		this.AutomapDataReaders = null;
	}

	clone() {
		return Object.assign(new SavegameInputFiles(), this);
	}
}

export class SavegameOutputFiles {
	constructor() {
		/** Party_data.sav (IDataWriter) */
		this.SaveDataWriter = null;
		/** Party_char.amb (Map<number, IDataWriter>) */
		this.PartyMemberDataWriters = null;
		/** Chest_data.amb (Map<number, IDataWriter>) */
		this.ChestDataWriters = null;
		/** Merchant_data.amb (Map<number, IDataWriter>) */
		this.MerchantDataWriters = null;
		/** Automap.amb (Map<number, IDataWriter>) */
		this.AutomapDataWriters = null;
	}

	clone() {
		return Object.assign(new SavegameOutputFiles(), this);
	}
}
