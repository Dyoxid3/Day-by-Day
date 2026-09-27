// The rules for each day: stars, check-ins, evenings and nights. Times are hours of the day (13.5 = 1:30 PM).

export type Feeling = 'good' | 'okay' | 'bad' | 'terrible';

// Offered in this order when the player is asked how they're feeling
export const feelings: { id: Feeling, label: string }[] = [
    { id: 'good', label: 'Good' },
    { id: 'okay', label: 'Okay' },
    { id: 'bad', label: 'Bad' },
    { id: 'terrible', label: 'Terrible' }
];

export const starSettings = {
    // One star for finishing at least this share of the day's tasks...
    firstStarPercent: 33,
    // ...and another for finishing all of them
    secondStarPercent: 100
};

export const comebackSettings = {
    // Coming back after missing at least this many days counts as a comeback (the count never goes down)
    countAfterMissedDays: 1,
    // Coming back after missing at least this many days in a row offers the missed stars back
    minMissedDays: 2,
    // Stars on offer for each missed day (the most a day can earn)
    starsPerMissedDay: 2,
    // Longer absences still only offer this many days' worth
    maxDaysOffered: 7,
    // How much of the day has to be finished to win them back
    requiredPercent: 100
};

// Late in the day, a long list shrinks to its most important tasks; the rest are marked "can wait"
export const focusSettings = {
    // How many unfinished tasks are kept, picking the most important first
    tasksKept: 2,
    // From this hour, a day that's less than lowProgressPercent done gets one prompt: a long list shrinks by itself,
    // and a short one gets a nudge to do just its most important task
    nightStartsAtHour: 21,
    lowProgressPercent: 33,
    // Between these hours the player may be offered the smaller list early (a chance at redemption),
    // more likely the worse they said they felt that morning (terrible days are rest days, so they get none; see
    // feelingsThatRest)
    offerWindowStartHour: 17,
    offerWindowEndHour: 20.5,
    offerChanceByFeeling: { good: 0.1, okay: 0.3, bad: 0.7, terrible: 1 } satisfies Record<Feeling, number>,
    // Used when the player didn't say how they felt
    offerChanceWithoutCheckIn: 0.3,
    // Neither the offer nor the night shrink comes sooner than this many hours after planning the day, so they
    // never pile on straight after the morning check-in
    quietHoursAfterPlanning: 1
};

// Whether the player seems on track to finish their day. Friends get a note (once a day) when they aren't.
export const onTrackSettings = {
    // Progress is expected to rise evenly from 0% at the start of the day to 100% at its end
    dayStartHour: 8,
    dayEndHour: 21,
    // How far behind that line counts as off track, in percentage points
    allowedLagPercent: 35,
    // No one is called off track before this hour
    earliestHour: 12
};

// Moods that let friends know the player could use some encouragement
export const feelingsThatNotifyFriends: Feeling[] = [ 'bad', 'terrible' ];

// Moods that get a shorter check-in: one planning card (with any letter from a better day inside it), and no
// welcome-back card or closing message, so a hard morning isn't a wall of prompts
export const feelingsWithShortCheckIn: Feeling[] = [ 'bad', 'terrible' ];

// Moods where the only option is to rest: a single card with a "Rest today" button and no planning. No evening or
// night prompts follow on these days either.
export const feelingsThatRest: Feeling[] = [ 'terrible' ];

// When the gentle helper (Google Gemini) suggests breaking a new task into smaller steps, right in the new task menu.
// Only tasks rated hard, or that sound hard, get steps suggested; a short task like "study for 5 minutes" never does.
// The player picks which steps to keep; together the suggested steps always finish the whole task.
export const taskSplitSettings = {
    // Tasks the player rates at least this hard get steps suggested, unless they take about 5 minutes or less
    // (1 = easy, 2 = medium, 3 = hard)
    splitFromDifficulty: 3,
    // Other tasks only get steps if they sound hard: more than this many minutes of real effort (e.g. "run for an hour")
    soundsHardAfterMinutes: 30,
    // How long each suggested step takes at most: the worse the player feels, the smaller the steps
    stepMinutesByFeeling: { good: 30, okay: 20, bad: 15, terrible: 10 } satisfies Record<Feeling, number>,
    stepMinutesWithoutCheckIn: 20,
    // Most steps suggested for one task (the server allows up to 8)
    maxSteps: 6,
    // How long to wait for the helper before adding the task as it is
    maxWaitMs: 8000
};

// The day and night lighting on the island
export const lightingSettings = {
    // Fully dark from nightStartHour to nightEndHour, fading over fadeHours before and after
    nightStartHour: 21,
    nightEndHour: 5,
    fadeHours: 2.5,
    // What the island is multiplied by at full night (red, green, blue: 1 = unchanged)
    nightTint: { red: 0.42, green: 0.48, blue: 0.72 },
    // A warm touch at the start of the evening fade, and at the end of the morning one
    duskTint: { red: 1, green: 0.86, blue: 0.78 }
};

// Letters to future you: the player's own, kept on this device
export const letterSettings = {
    // Checking in with one of these hands over a letter the player wrote on a better day
    feelingsThatGetLetters: [ 'bad', 'terrible' ] as Feeling[],
    // Checking in with one of these offers to write one (right after logging in, the next such day always does)
    feelingsThatOfferWriting: [ 'good' ] as Feeling[],
    // Days between offers to write
    writingOfferCooldownDays: 10,
    maxLetterLength: 400
};

// Each encouragement leaves a lantern on the player's island until they tap it to read it
export const lanternSettings = {
    maxShown: 8,
    // Older encouragements don't leave a lantern
    maxAgeDays: 7
};

export const encouragementSettings = {
    // The share of their day a friend has to finish to receive an encouragement's gift
    defaultGoalPercent: 33,
    minGoalPercent: 10,
    maxGoalPercent: 100,
    goalPercentStep: 1
};
