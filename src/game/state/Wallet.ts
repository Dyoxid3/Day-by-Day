import { EventBus, GameEvents, type CoinsChangedPayload } from '../EventBus';

const startingCoins = 0;

class Wallet
{
    private coins = startingCoins;

    GetCoins (): number
    {
        return this.coins;
    }

    CanAfford (amount: number): boolean
    {
        return this.coins >= amount;
    }

    AddCoins (amount: number)
    {
        if (amount <= 0)
        {
            return;
        }

        this.coins += amount;
        this.EmitChange(amount);
    }

    TrySpendCoins (amount: number): boolean
    {
        if (!this.CanAfford(amount))
        {
            return false;
        }

        this.coins -= amount;
        this.EmitChange(-amount);

        return true;
    }

    private EmitChange (change: number)
    {
        const payload: CoinsChangedPayload = { coins: this.coins, change };

        EventBus.emit(GameEvents.CoinsChanged, payload);
    }
}

export const playerWallet = new Wallet();
