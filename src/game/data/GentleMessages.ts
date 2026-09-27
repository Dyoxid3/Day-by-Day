import type { Feeling } from './DaySettings';

// Everything the game says to encourage the player. Kept gentle: no pressure, no guilt, no emojis.
// Only a terrible day is told to rest (see feelingsThatRest); every other day is nudged toward one small step.
// Where there's a list, one is picked at random each time.

export interface GentleMessage
{
    title: string;
    text: string;
}

// Said right after the player answers "How are you feeling today?", before planning the day
export const feelingResponses: Record<Feeling, GentleMessage> = {
    good: {
        title: "That's lovely to hear",
        text: "Let's make a plan for today. Keep it as big or as small as feels right."
    },
    okay: {
        title: 'Okay is perfectly fine',
        text: 'What would you like to do today? A few small things are more than enough.'
    },
    bad: {
        title: 'Thank you for telling me',
        text: 'Be kind to yourself today. Pick just one or two small things; small steps still count.'
    },
    // A terrible day's only option is to rest (see feelingsThatRest), so this is the whole check-in
    terrible: {
        title: "I'm glad you're here",
        text: "Today, just rest. There's nothing you need to do, and your island will be here whenever you're ready."
    }
};

// After planning a day with tasks in it
export const plannedDayMessages: GentleMessage[] = [
    { title: 'That sounds like a good day', text: 'Go at your own pace. Every small step still counts.' },
    { title: 'Your plan is ready', text: "There's no rush. Take things one at a time, and be kind to yourself along the way." },
    { title: 'Nicely done', text: 'Making a plan is a step in itself. Your island will be here whenever you need a break.' }
];

// After finishing planning without adding any tasks (on a day that isn't a rest day)
export const noPlanMessages: GentleMessage[] = [
    { title: "Whenever you're ready", text: 'Your to-do list is here whenever you want it. Even one small thing counts.' },
    { title: 'No plan yet, and that is okay', text: 'Add something small to your to-do list whenever you feel like it.' }
];

// Offered on a new day after missing a few (the number of days, stars and comebacks is filled in)
export function GetComebackMessage (missedDays: number, starsOnOffer: number, requiredPercent: number, comebackCount: number): GentleMessage
{
    const goal = requiredPercent >= 100 ? 'all of today\'s tasks' : `${requiredPercent}% of today's tasks`;

    return {
        title: 'Welcome back',
        text: `It's been ${missedDays} days, and that's okay. You're here now, and that's comeback number ${comebackCount}: `
            + `be proud of that. Finish ${goal} and you'll earn back the ${starsOnOffer} stars from the days you were away.`
    };
}

// Shown (in the corner) every time the player comes back after time away
export function GetComebackNoticeMessage (comebackCount: number): GentleMessage
{
    return {
        title: `Comeback number ${comebackCount}`,
        text: 'You came back, and that is the hardest part. Be proud of yourself.'
    };
}

// --- Letters ---

export const letterWritingMessage: GentleMessage = {
    title: 'A letter to future you',
    text: 'Write a few kind words to read on a harder day. What would you want to hear? Your letters stay on this device.'
};

// Offered right after checking in as feeling good (see letterSettings for how often)
export const letterWritingOffer: GentleMessage = {
    title: 'A good day is a gift',
    text: 'Would you like to write a few kind words to your future self, for a day that feels harder? '
        + 'Your cat will keep them safe.'
};

// The first good day of a brand new account: the same offer, as a fresh start
export const freshStartLetterOffer: GentleMessage = {
    title: 'A fresh start',
    text: 'Welcome to your island. Today feels good, so it is a lovely day to begin: would you like to write a few kind '
        + 'words to your future self? Your cat will keep them safe for a day that feels harder.'
};

export const letterSavedMessage: GentleMessage = {
    title: 'Letter saved',
    text: 'Your cat will keep it safe until a day you need it.'
};

// When the cat hands over a letter on a hard day (the date it was written is filled in)
export function GetLetterDeliveredMessage (writtenOnText: string): GentleMessage
{
    return {
        title: 'Your cat found something for you',
        text: `A letter you wrote on ${writtenOnText}, for a day like today.`
    };
}

// --- Lanterns ---

export function GetLanternGlowMessage (names: string[]): GentleMessage
{
    const nameText = names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and others`;

    return {
        title: 'Lanterns are glowing on your island',
        text: `${nameText} thought of you. Tap a lantern to read it.`
    };
}

export const comebackEarnedMessage: GentleMessage = {
    title: 'Welcome back, truly',
    text: 'You earned back every star from your time away. Coming back is the hardest part, and you did it.'
};

// Offered in the evening, more often to players who said they weren't feeling well
export const focusOfferMessage: GentleMessage = {
    title: "Your day isn't over",
    text: "It's okay if today didn't go the way you hoped. Would you like to shrink your list to just what matters most? "
        + 'Finish those, and today still counts in full.'
};

// Shown when the list shrinks on its own late at night
export const nightFocusMessage: GentleMessage = {
    title: "It's getting late",
    text: 'Your list now holds just the most important things. Doing even one of them counts; everything else can wait.'
};

// At night with hardly anything done and a list that's already short: a nudge to do just one thing
export function GetNightNudgeMessage (taskName: string): GentleMessage
{
    return {
        title: "It's getting late",
        text: `Even one small thing counts. How about just "${taskName}" before bed?`
    };
}

// The gentle helper's suggestions in the new task menu
export const bigTaskSuggestion: GentleMessage = {
    title: 'This sounds like a big one for today',
    text: "Here it is in smaller steps that together finish it. Keep the ones you'd like."
};


export const kinderNameSuggestion: GentleMessage = {
    title: 'A kinder way to say it?',
    text: 'Be as gentle with yourself as you would with a friend.'
};

// When a day's stars are earned
export const firstStarMessages = [ 'A star for today. Well done.', 'You earned a star today.' ];
export const secondStarMessages = [ 'Everything done today. Another star for you.', 'You finished your whole list. Take a moment to enjoy that.' ];

export function PickMessage<Message> (messages: readonly Message[]): Message
{
    return messages[Math.floor(Math.random() * messages.length)];
}
