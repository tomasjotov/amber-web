// Port of Ambermoon.Data.Legacy/Serialization/ItemSlotReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class ItemSlotReader {
	static ReadItemSlot(itemSlot, dataReader) {
		itemSlot.Amount = dataReader.ReadByte();
		itemSlot.NumRemainingCharges = dataReader.ReadByte();
		itemSlot.RechargeTimes = dataReader.ReadByte();
		itemSlot.Flags = dataReader.ReadByte();
		itemSlot.ItemIndex = dataReader.ReadWord();
	}
}
