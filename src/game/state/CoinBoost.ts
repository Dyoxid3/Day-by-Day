import { EventBus, GameEvents, type CoinBoostChangedPayload } from '../EventBus';

export interface ActiveCoinBoost
{
    percent: number;
    // Date.now() time when it runs out
    endsAt: number;
    fromUsername: string;
    // 'encouragement' when a friend encouraged the player, 'reply' when a friend replied to the player's encouragement
    kind: 'encouragement' | 'reply';
}

// Extra coins earned thanks to friends. The online session keeps this up to date; coin rewards read it.
class CoinBoost
{
    private boosts: ActiveCoinBoost[] = [];
    private totalPercent = 0;

    GetMultiplier (): number
    {
        return 1 + this.totalPercent / 100;
    }

    GetTotalPercent (): number
    {
        return this.totalPercent;
    }

    GetActiveBoosts (): ActiveCoinBoost[]
    {
        const now = Date.now();

        return this.boosts.filter(boost => boost.endsAt > now);
    }

    SetBoosts (boosts: ActiveCoinBoost[], totalPercent: number)
    {
        const change = totalPercent - this.totalPercent;

        this.boosts = boosts;
        this.totalPercent = totalPercent;

        if (change !== 0)
        {
            const payload: CoinBoostChangedPayload = { percent: totalPercent, change };

            EventBus.emit(GameEvents.CoinBoostChanged, payload);
        }
    }

    Clear ()
    {
        this.SetBoosts([], 0);
    }
}

export const playerCoinBoost = new CoinBoost();
