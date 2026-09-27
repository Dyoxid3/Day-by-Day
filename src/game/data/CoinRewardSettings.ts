// How many coins things are worth. Friends' coin boosts are added on top of these.
export const coinRewardSettings = {
    // For checking off a task (only the first time each task is checked)
    taskCompletionCoins: 5,
    // Extra for finishing every task of the day (with the day's second star)
    dayCompleteBonusCoins: 50,

    // A cat visiting an island drops a few coins shortly after it arrives, and then no more that visit, for whoever
    // is looking at it: the visitor on their own screen, and the island's owner on theirs (5 x 1 = 5 coins)
    visitCoinsPerDrop: 1,
    visitMaxDropsPerVisit: 5,
    // Wait after stepping off the boat before the first coin
    visitFirstDropDelayMs: 900,
    // Between one coin and the next
    visitDropIntervalMinMs: 250,
    visitDropIntervalMaxMs: 500
};
