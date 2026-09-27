import { EventBus, GameEvents, type LanternOpenedPayload } from '../game/EventBus';
import { GetLanternGlowMessage } from '../game/data/GentleMessages';
import { lanterns } from '../game/state/Lanterns';
import { RequestToast } from '../online/OnlineSession';
import { GentleCard } from './GentleCard';
import { DescribeGiftGoal } from './NotificationText';
import './LanternMessages.css';

// The message inside a lantern when the player taps it, and a note (once per visit) when lanterns are waiting
export class LanternMessages
{
    private hasAnnouncedGlow = false;

    constructor (card: GentleCard)
    {
        EventBus.on(GameEvents.LanternOpened, (payload: LanternOpenedPayload) => {
            const lantern = payload.lantern;
            const body = document.createElement('div');
            body.className = 'lantern-message';

            const messageElement = document.createElement('p');
            messageElement.className = 'lantern-message-text';
            messageElement.textContent = `"${lantern.message}"`;
            body.append(messageElement);

            if (lantern.gift)
            {
                const giftElement = document.createElement('p');
                giftElement.className = 'lantern-message-gift';
                giftElement.textContent = DescribeGiftGoal(lantern.gift, lantern.boostPercent);
                body.append(giftElement);
            }

            card.Enqueue((shownCard, finish) => shownCard.Show({
                title: `A lantern from ${lantern.fromUsername}`,
                body,
                buttons: [
                    ...(lantern.hasReplied ? [] : [ {
                        label: 'Write back',
                        onClick: () => {
                            finish();
                            EventBus.emit(GameEvents.NotificationsMenuRequested);
                        }
                    } ]),
                    { label: 'Thank you', isPrimary: true, onClick: finish }
                ]
            }));
        });

        // Coming back to lanterns already waiting gets a gentle note; ones arriving while playing have their own toast
        EventBus.on(GameEvents.LanternsChanged, () => {
            const waitingLanterns = lanterns.GetLanterns();

            if (this.hasAnnouncedGlow || waitingLanterns.length === 0)
            {
                return;
            }

            this.hasAnnouncedGlow = true;

            const message = GetLanternGlowMessage([ ...new Set(waitingLanterns.map(lantern => lantern.fromUsername)) ]);

            RequestToast(message.title, message.text, 'reward', false, 'star');
        });
    }
}
