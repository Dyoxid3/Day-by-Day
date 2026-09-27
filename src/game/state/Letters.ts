import { EventBus, GameEvents, type LoggedInPayload } from '../EventBus';
import { letterSettings } from '../data/DaySettings';
import { dayCycle } from './DayCycle';
import { GetDaysBetween } from './GameClock';
import { moodCheckIn } from './MoodCheckIn';

// A letter the player wrote to themselves on a good day, handed back by the cat on a hard one
export interface FutureLetter
{
    id: number;
    text: string;
    writtenOnDayKey: string;
    timesDelivered: number;
    lastDeliveredDayKey: string | null;
}

export interface LettersSaveData
{
    futureLetters: FutureLetter[];
    nextLetterId: number;
    lastWritingOfferDayKey: string | null;
    isWritingOfferDueAfterLogin: boolean;
    isFreshStart: boolean;
}

// Letters to future you. They stay on this device; nothing in them is ever sent anywhere.
class Letters
{
    private futureLetters: FutureLetter[] = [];
    private nextLetterId = 1;
    private lastWritingOfferDayKey: string | null = null;
    // Just logged in: the next good day offers a letter, however recently the last offer was
    private isWritingOfferDueAfterLogin = false;
    // A brand new account: that first offer is worded as a fresh start
    private isFreshStart = false;

    constructor ()
    {
        EventBus.on(GameEvents.LoggedIn, (payload?: LoggedInPayload) => {
            this.isWritingOfferDueAfterLogin = true;
            this.isFreshStart = payload?.isNewAccount === true;
            EventBus.emit(GameEvents.LettersChanged);
        });
    }

    // Whether the next offer to write is a new account's fresh start
    IsFreshStart (): boolean
    {
        return this.isFreshStart;
    }

    WriteFutureLetter (text: string)
    {
        const letterText = text.trim().slice(0, letterSettings.maxLetterLength);

        if (letterText === '')
        {
            return;
        }

        this.futureLetters.push({
            id: this.nextLetterId++,
            text: letterText,
            writtenOnDayKey: dayCycle.GetDayKey(),
            timesDelivered: 0,
            lastDeliveredDayKey: null
        });
        EventBus.emit(GameEvents.LettersChanged);
    }

    GetFutureLetterCount (): number
    {
        return this.futureLetters.length;
    }

    // The letter to hand over on a hard day: one never read yet (oldest first), otherwise the one read longest ago.
    // None on a day that already had one, and never one written today.
    TakeLetterForToday (): FutureLetter | null
    {
        const today = dayCycle.GetDayKey();

        if (this.futureLetters.some(letter => letter.lastDeliveredDayKey === today))
        {
            return null;
        }

        const letter = this.futureLetters
            .filter(candidate => candidate.writtenOnDayKey !== today)
            .sort((first, second) => first.timesDelivered - second.timesDelivered
                || (first.lastDeliveredDayKey ?? '').localeCompare(second.lastDeliveredDayKey ?? '')
                || first.id - second.id)[0];

        if (!letter)
        {
            return null;
        }

        letter.timesDelivered++;
        letter.lastDeliveredDayKey = today;
        EventBus.emit(GameEvents.LettersChanged);
        EventBus.emit(GameEvents.FutureLetterDelivered);

        return letter;
    }

    // After checking in on a good day: whether to offer writing a letter. At most once every few days (see
    // letterSettings), except that the first good day after logging in always offers one. Never twice in a day.
    ShouldOfferWriting (): boolean
    {
        const today = dayCycle.GetDayKey();
        const feeling = moodCheckIn.GetFeeling();
        const isGoodDay = feeling !== null && letterSettings.feelingsThatOfferWriting.includes(feeling);
        const hasWrittenToday = this.futureLetters.some(letter => letter.writtenOnDayKey === today);
        const isOfferDue = this.isWritingOfferDueAfterLogin
            || this.lastWritingOfferDayKey === null
            || GetDaysBetween(this.lastWritingOfferDayKey, today) >= letterSettings.writingOfferCooldownDays;

        return isGoodDay && !hasWrittenToday && isOfferDue && this.lastWritingOfferDayKey !== today;
    }

    MarkWritingOffered ()
    {
        this.lastWritingOfferDayKey = dayCycle.GetDayKey();
        this.isWritingOfferDueAfterLogin = false;
        this.isFreshStart = false;
        EventBus.emit(GameEvents.LettersChanged);
    }

    ToSaveData (): LettersSaveData
    {
        return {
            futureLetters: this.futureLetters,
            nextLetterId: this.nextLetterId,
            lastWritingOfferDayKey: this.lastWritingOfferDayKey,
            isWritingOfferDueAfterLogin: this.isWritingOfferDueAfterLogin,
            isFreshStart: this.isFreshStart
        };
    }

    LoadSaveData (data: Partial<LettersSaveData> | undefined)
    {
        this.futureLetters = data?.futureLetters ?? [];
        this.nextLetterId = Math.max(data?.nextLetterId ?? 1, this.futureLetters.length + 1);
        this.lastWritingOfferDayKey = data?.lastWritingOfferDayKey ?? null;
        this.isWritingOfferDueAfterLogin = data?.isWritingOfferDueAfterLogin === true;
        this.isFreshStart = data?.isFreshStart === true;
    }
}

export const letters = new Letters();
