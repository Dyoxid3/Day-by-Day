import { EventBus, GameEvents, type FocusAppliedPayload, type NightNudgePayload } from '../game/EventBus';
import { focusOfferMessage, GetNightNudgeMessage, nightFocusMessage } from '../game/data/GentleMessages';
import { eveningFocus } from '../game/state/EveningFocus';
import { RequestToast } from '../online/OnlineSession';
import { GentleCard } from './GentleCard';
import { Pluralize } from './UiFormat';

// The cards shown late in the day (see state/EveningFocus): an offer in the evening to shrink the list to what matters
// most, a nudge at night to do just one thing, and a note when the list shrinks on its own at night
export class EveningPrompts
{
    constructor (card: GentleCard)
    {
        EventBus.on(GameEvents.FocusOffered, () => {
            card.Enqueue((shownCard, finish) => shownCard.Show({
                title: focusOfferMessage.title,
                text: focusOfferMessage.text,
                buttons: [
                    { label: 'Not today', onClick: finish },
                    {
                        label: "Yes, let's do that",
                        isPrimary: true,
                        onClick: () => {
                            eveningFocus.AcceptOffer();
                            finish();
                        }
                    }
                ]
            }));
        });

        EventBus.on(GameEvents.NightNudge, (payload: NightNudgePayload) => {
            const message = GetNightNudgeMessage(payload.taskName);

            card.Enqueue((shownCard, finish) => shownCard.Show({
                title: message.title,
                text: message.text,
                buttons: [ { label: 'Okay', isPrimary: true, onClick: finish } ]
            }));
        });

        EventBus.on(GameEvents.FocusApplied, (payload: FocusAppliedPayload) => {
            if (payload.reason === 'night')
            {
                card.Enqueue((shownCard, finish) => shownCard.Show({
                    title: nightFocusMessage.title,
                    text: nightFocusMessage.text,
                    buttons: [ { label: 'Okay', isPrimary: true, onClick: finish } ]
                }));
            }
            else
            {
                RequestToast('Your list is smaller now', `${Pluralize(payload.exemptCount, 'task')} can wait for another day.`, 'info');
            }
        });
    }
}
