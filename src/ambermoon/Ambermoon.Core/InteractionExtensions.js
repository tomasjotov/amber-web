// Port of Ambermoon.Core/InteractionExtensions.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// InteractionExtensions.cs - Extensions for interactions

import { firstOrDefault } from '../runtime.js';
import { ConversationEvent } from '../Ambermoon.Data.Common/Event.js';
import { EventExtensions } from './EventExtensions.js';
import { ConversationItems } from './Game/Conversations.js';

export class InteractionExtensions {
	static ExecuteEvents(conversationPartner, game, trigger, characterIndex) {
		const event = firstOrDefault(conversationPartner.EventList, e => e instanceof ConversationEvent &&
			e.Interaction === ConversationEvent.InteractionType.Talk);

		if (event != null) {
			const x = game.RenderPlayer.Position.X;
			const y = game.RenderPlayer.Position.Y;
			const lastEventStatus = false;
			EventExtensions.ExecuteEvent(event, game.Map, game, trigger, x, y, lastEventStatus,
				conversationPartner, characterIndex);
		} else {
			game.ShowConversation(conversationPartner, characterIndex, null, new ConversationItems());
		}
	}
}
