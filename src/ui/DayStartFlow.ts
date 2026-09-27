import { EventBus, GameEvents } from '../game/EventBus';
import { comebackSettings, feelings, feelingsThatRest, feelingsWithShortCheckIn, letterSettings } from '../game/data/DaySettings';
import { feelingResponses, GetComebackMessage, noPlanMessages, PickMessage, plannedDayMessages } from '../game/data/GentleMessages';
import { taskTypes } from '../game/data/TaskTypes';
import { comebacks } from '../game/state/Comebacks';
import { dailyStars } from '../game/state/DailyStars';
import { dayCycle } from '../game/state/DayCycle';
import { letters, type FutureLetter } from '../game/state/Letters';
import { moodCheckIn } from '../game/state/MoodCheckIn';
import { playerTaskList } from '../game/state/TaskList';
import { RequestToast } from '../online/OnlineSession';
import { GentleCard } from './GentleCard';
import { CreateDeliveredLetter, ShowWritingOffer } from './Letters';
import './DayStartFlow.css';

// The start of each day. First: how are you feeling today? (Good, Okay, Bad or Terrible). Then:
// - Terrible: nothing to plan. A gentle note to rest shows in the corner (not a card), and a letter from a better day
//   is handed over, if there is one
// - Bad: a single planning card (with that letter inside, if there is one)
// - Good or okay:
//   1. On a good day (every so often): an offer to write a letter to future you
//   2. After a few days away: an offer to earn back the missed stars
//   3. Plan the day: add tasks, or leave planning for later
//   4. A few gentle words, then the island is theirs to explore
export class DayStartFlow
{
    private card: GentleCard;
    private isQueued = false;

    constructor (card: GentleCard)
    {
        this.card = card;

        EventBus.on(GameEvents.CheckInNeeded, this.Begin, this);
    }

    private Begin ()
    {
        if (this.isQueued)
        {
            return;
        }

        this.isQueued = true;
        // Follows straight on from anything before it (like the log-in card), with no pause
        this.card.Enqueue((card, finish) => this.Run(card, () => {
            this.isQueued = false;
            finish();
        }), false);
    }

    // Each step checks again whether it's still needed, since another account's progress may have loaded meanwhile
    private Run (card: GentleCard, finish: () => void)
    {
        if (dayCycle.HasPlannedToday())
        {
            finish();
            return;
        }

        if (moodCheckIn.HasAnsweredToday())
        {
            this.ContinueAfterFeeling(card, finish);
        }
        else
        {
            this.ShowFeelingStep(card, () => this.ContinueAfterFeeling(card, finish));
        }
    }

    // What follows depends on how the player feels: the harder the day, the fewer cards
    private ContinueAfterFeeling (card: GentleCard, finish: () => void)
    {
        const feeling = moodCheckIn.GetFeeling();
        const isHardDay = feeling !== null && feelingsWithShortCheckIn.includes(feeling);
        // On a hard day the cat hands over a letter the player wrote to themselves on a better one, inside the one card
        const letter = feeling && letterSettings.feelingsThatGetLetters.includes(feeling) ? letters.TakeLetterForToday() : null;

        if (feeling && feelingsThatRest.includes(feeling))
        {
            this.ShowRestStep(card, letter, finish);
        }
        else if (isHardDay)
        {
            this.ShowPlanStep(card, letter, finish);
        }
        else if (letters.ShouldOfferWriting())
        {
            // On a good day (every so often, and the first good day after logging in): write to future you. A brand
            // new account's first one is a fresh start.
            const isFreshStart = letters.IsFreshStart();

            letters.MarkWritingOffered();
            ShowWritingOffer(card, () => this.ShowComebackStep(card, finish), isFreshStart);
        }
        else
        {
            this.ShowComebackStep(card, finish);
        }
    }

    // A terrible day: nothing to plan. The note to rest is a quiet notice in the corner, like putting a prop away, so
    // it doesn't get in the way. Only a letter from a better day, if there is one, gets a card.
    private ShowRestStep (card: GentleCard, letter: FutureLetter | null, finish: () => void)
    {
        const message = feelingResponses.terrible;

        dayCycle.MarkPlanned();
        RequestToast(message.title, message.text, 'info');

        if (!letter)
        {
            finish();
            return;
        }

        card.Show({
            title: 'Something for you',
            body: CreateDeliveredLetter(letter),
            buttons: [ { label: 'Thank you', isPrimary: true, onClick: finish } ]
        });
    }

    private ShowFeelingStep (card: GentleCard, next: () => void)
    {
        const choices = document.createElement('div');
        choices.className = 'day-start-feelings';

        for (const feeling of feelings)
        {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `day-start-feeling pixel-pill is-${feeling.id}`;
            button.textContent = feeling.label;
            button.addEventListener('click', () => {
                moodCheckIn.ShareFeeling(feeling.id);
                next();
            });
            choices.append(button);
        }

        card.Show({
            title: 'How are you feeling today?',
            text: 'Whatever the answer is, it is okay.',
            body: choices,
            buttons: []
        });
    }

    private ShowComebackStep (card: GentleCard, finish: () => void)
    {
        const offer = dailyStars.GetComebackOffer();

        if (!offer || offer.isAnnounced)
        {
            this.ShowPlanStep(card, null, finish);
            return;
        }

        const message = GetComebackMessage(offer.missedDays, offer.starsOnOffer, comebackSettings.requiredPercent, comebacks.GetCount());

        card.Show({
            title: message.title,
            text: message.text,
            buttons: [ {
                label: "I'll give it a try",
                isPrimary: true,
                onClick: () => {
                    dailyStars.MarkComebackAnnounced();
                    this.ShowPlanStep(card, null, finish);
                }
            } ]
        });
    }

    // Lists today's tasks as they're added, with buttons to add another or to finish planning. On a hard day, a letter
    // from a better day sits above the list.
    private ShowPlanStep (card: GentleCard, letter: FutureLetter | null, finish: () => void)
    {
        const feeling = moodCheckIn.GetFeeling();
        const intro = feeling
            ? feelingResponses[feeling]
            : { title: "Let's plan your day", text: 'Keep it as big or as small as feels right.' };
        const taskListElement = document.createElement('ul');
        taskListElement.className = 'day-start-tasks';

        const body = document.createElement('div');
        body.className = 'day-start-plan';
        body.append(...(letter ? [ CreateDeliveredLetter(letter) ] : []), taskListElement);

        const ShowPlan = () => {
            const tasks = playerTaskList.GetSortedTasks();

            taskListElement.replaceChildren(...tasks.map(task => {
                const item = document.createElement('li');
                item.className = 'day-start-task';
                item.style.setProperty('--task-color', taskTypes[task.typeId].color);
                item.textContent = task.name;

                return item;
            }));
            taskListElement.hidden = tasks.length === 0;

            card.Show({
                title: intro.title,
                text: intro.text,
                body,
                buttons: [
                    { label: tasks.length === 0 ? 'Add a task' : 'Add another', onClick: () => EventBus.emit(GameEvents.NewTaskPromptRequested) },
                    {
                        // Only a terrible day is a rest day (it has its own card), so this never says to rest
                        label: tasks.length === 0 ? 'Plan later' : "I'm ready",
                        isPrimary: true,
                        onClick: () => {
                            EventBus.off(GameEvents.TasksChanged, ShowPlan);
                            dayCycle.MarkPlanned();

                            // On a hard day the planning card already said the gentle part, so it ends here
                            if (feeling && feelingsWithShortCheckIn.includes(feeling))
                            {
                                finish();
                            }
                            else
                            {
                                this.ShowClosingMessage(card, tasks.length > 0, finish);
                            }
                        }
                    }
                ]
            });
        };

        EventBus.on(GameEvents.TasksChanged, ShowPlan);
        ShowPlan();
    }

    private ShowClosingMessage (card: GentleCard, hasTasks: boolean, finish: () => void)
    {
        const message = PickMessage(hasTasks ? plannedDayMessages : noPlanMessages);

        card.Show({
            title: message.title,
            text: message.text,
            buttons: [ { label: 'Explore my island', isPrimary: true, onClick: finish } ]
        });
    }
}
