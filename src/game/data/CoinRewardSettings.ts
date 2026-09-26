// How many coins things are worth. Friends' coin boosts are added on top of these.
export const coinRewardSettings = {
    // For checking off a task (only the first time each task is checked)
    taskCompletionCoins: 5,

    // Cats visiting an island now and then drop coins for whoever is looking at it:
    // the visitor on their own screen, and the island's owner on theirs
    visitCoinsPerDrop: 3,
    visitMaxDropsPerVisit: 5,
    visitDropIntervalMinMs: 5000,
    visitDropIntervalMaxMs: 10000
};
