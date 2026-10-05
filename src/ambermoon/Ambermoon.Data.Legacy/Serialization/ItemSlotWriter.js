// Port of Ambermoon.Data.Legacy/Serialization/ItemSlotWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class ItemSlotWriter {
	static WriteItemSlot(itemSlot, dataWriter) {
		dataWriter.WriteByte(itemSlot.Amount);
		dataWriter.WriteByte(itemSlot.NumRemainingCharges);
		dataWriter.WriteByte(itemSlot.RechargeTimes);
		dataWriter.WriteEnumAsByte(itemSlot.Flags);
		dataWriter.WriteWord(itemSlot.ItemIndex);
	}
}
