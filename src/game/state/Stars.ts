import { EventBus, GameEvents, type StarsChangedPayload } from '../EventBus';

export interface StarsSaveData
{
    stars: number;
    lifetimeStars: number;
}

// Stars are earned by finishing a good part of each day (see DailyStars) and are never taken away.
// The player can give some to a friend with an encouragement, but shop unlocks go by lifetimeStars, so giving
// stars away never locks anything again.
class Stars
{
    private stars = 0;
    private lifetimeStars = 0;

    GetStars (): number
    {
        return this.stars;
    }

    GetLifetimeStars (): number
    {
        return this.lifetimeStars;
    }

    AddStars (amount: number)
    {
        if (amount <= 0)
        {
            return;
        }

        this.stars += amount;
        this.lifetimeStars += amount;
        this.EmitChange(amount);
    }

    // For giving stars to a friend; a gift that comes back is added again with AddStars
    TrySpendStars (amount: number): boolean
    {
        if (amount <= 0 || amount > this.stars)
        {
            return amount === 0;
        }

        this.stars -= amount;
        this.EmitChange(-amount);

        return true;
    }

    // A returned gift gives the stars back without counting them as newly earned
    RefundStars (amount: number)
    {
        if (amount <= 0)
        {
            return;
        }

        this.stars += amount;
        this.EmitChange(amount);
    }

    ToSaveData (): StarsSaveData
    {
        return { stars: this.stars, lifetimeStars: this.lifetimeStars };
    }

    LoadSaveData (data: Partial<StarsSaveData> | undefined)
    {
        this.stars = Math.max(0, Math.floor(data?.stars ?? 0));
        this.lifetimeStars = Math.max(this.stars, Math.floor(data?.lifetimeStars ?? 0));
    }

    private EmitChange (change: number)
    {
        const payload: StarsChangedPayload = { stars: this.stars, lifetimeStars: this.lifetimeStars, change };

        EventBus.emit(GameEvents.StarsChanged, payload);
    }
}

export const playerStars = new Stars();
