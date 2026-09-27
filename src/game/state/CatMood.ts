import { EventBus, GameEvents, type CatMoodChangedPayload, type TasksChangedPayload } from '../EventBus';
import type { CatExpression } from '../data/CatAppearance';
import type { Feeling } from '../data/DaySettings';
import { playerInventory } from './Inventory';
import { playerIslandLayout } from './IslandLayout';
import { moodCheckIn } from './MoodCheckIn';

// A prototype of the cat's mood. Happiness (0-100) mixes two things:
// - comfort: how many items the player owns for the island (placed or stored), which lasts
// - attention: goes up when the player does things (buying and placing items, finishing tasks), and while they're
//   doing nothing it drifts toward a baseline set by how they said they're feeling today, so an idle cat comes to
//   reflect the player's own mood rather than always slipping toward miserable
const catMoodSettings = {
    startingAttention: 80,
    // Attention drifts toward this when the player hasn't checked in yet today
    defaultBaselineAttention: 55,
    // With a check-in, idle attention settles here; doing things can push it above or below for a while
    baselineAttentionByFeeling: { good: 85, okay: 60, bad: 35, terrible: 15 } satisfies Record<Feeling, number>,
    // How far attention drifts toward its baseline each minute of doing nothing
    attentionDriftPerMinute: 6,
    attentionForBuyingItem: 8,
    attentionForPlacingItem: 15,
    attentionForFinishingTask: 10,
    // Comfort from each item owned, up to 100
    comfortPerItem: 15,
    // Share of happiness that comes from comfort (the rest comes from attention)
    comfortWeight: 0.4,
    // How often the cat changes its face on its own, picking again from its mood's expressions
    minExpressionChangeMs: 6000,
    maxExpressionChangeMs: 12000,
    // How long the cat stays excited after a new item is placed
    excitedDurationMs: 5000,
    tickMs: 1000
};

export interface CatMoodDefinition
{
    name: string;
    // The cat is in the first mood (from the top) whose minimum its happiness reaches
    minHappiness: number;
    // Expressions this mood can show, with how likely each one is
    expressions: Partial<Record<CatExpression, number>>;
    // Whether the cat does its idle breathing animation while standing (a sad cat just stands still)
    playsIdleAnimation: boolean;
}

// Happiest first
export const catMoods: CatMoodDefinition[] = [
    { name: 'thriving', minHappiness: 70, expressions: { satisfied: 6, cool: 3, default: 1 }, playsIdleAnimation: true },
    { name: 'content', minHappiness: 45, expressions: { default: 6, cool: 3, satisfied: 1 }, playsIdleAnimation: true },
    { name: 'meh', minHappiness: 28, expressions: { default: 4, dazed: 4, sad: 2 }, playsIdleAnimation: true },
    { name: 'sad', minHappiness: 12, expressions: { sad: 8, dazed: 2 }, playsIdleAnimation: false },
    { name: 'miserable', minHappiness: 0, expressions: { defeated: 1 }, playsIdleAnimation: false }
];

// Tracks the player's cat's mood and which face it shows. The island scene just draws what this decides.
class CatMood
{
    private attention = catMoodSettings.startingAttention;
    private comfort = 0;
    private expression: CatExpression = 'default';
    private currentMood: CatMoodDefinition;
    private excitedUntil = 0;
    private nextExpressionChangeAt = 0;
    private lastSentSignature = '';

    constructor ()
    {
        this.currentMood = this.FindMood();
        this.PickExpression();

        EventBus.on(GameEvents.ItemPurchased, () => this.AddAttention(catMoodSettings.attentionForBuyingItem));
        EventBus.on(GameEvents.ItemPlaced, () => {
            this.AddAttention(catMoodSettings.attentionForPlacingItem);
            this.GetExcited();
        });
        EventBus.on(GameEvents.TasksChanged, (payload: TasksChangedPayload) => {
            if (payload.isFirstCompletion)
            {
                this.AddAttention(catMoodSettings.attentionForFinishingTask);
            }
        });
        EventBus.on(GameEvents.IslandLayoutChanged, this.UpdateComfort, this);
        EventBus.on(GameEvents.InventoryChanged, this.UpdateComfort, this);
        EventBus.on(GameEvents.PlayerDataLoaded, this.UpdateComfort, this);

        setInterval(() => this.Tick(), catMoodSettings.tickMs);
    }

    GetHappiness (): number
    {
        const weight = catMoodSettings.comfortWeight;

        return Math.round(this.comfort * weight + this.attention * (1 - weight));
    }

    GetMood (): CatMoodDefinition
    {
        return this.currentMood;
    }

    GetExpression (): CatExpression
    {
        return this.expression;
    }

    // For testing: changes attention directly (see the debug keys)
    AdjustAttention (amount: number)
    {
        this.AddAttention(amount);
    }

    // A short burst of excitement, e.g. for a new item on the island
    GetExcited ()
    {
        this.excitedUntil = Date.now() + catMoodSettings.excitedDurationMs;
        this.SetExpression('excited');
    }

    private AddAttention (amount: number)
    {
        this.attention = Clamp(this.attention + amount, 0, 100);
        this.Refresh();
    }

    private UpdateComfort ()
    {
        const itemsOwned = playerIslandLayout.GetPlacedItems().length + playerInventory.GetTotalCount();

        this.comfort = Math.min(100, itemsOwned * catMoodSettings.comfortPerItem);
        this.Refresh();
    }

    private Tick ()
    {
        const baseline = this.GetBaselineAttention();
        const driftAmount = catMoodSettings.attentionDriftPerMinute * catMoodSettings.tickMs / 60000;

        if (this.attention > baseline)
        {
            this.attention = Math.max(baseline, this.attention - driftAmount);
        }
        else if (this.attention < baseline)
        {
            this.attention = Math.min(baseline, this.attention + driftAmount);
        }

        this.Refresh();
    }

    // What idle attention drifts toward: how the player said they're feeling today, or a neutral default before they check in
    private GetBaselineAttention (): number
    {
        const feeling = moodCheckIn.GetFeeling();

        return feeling ? catMoodSettings.baselineAttentionByFeeling[feeling] : catMoodSettings.defaultBaselineAttention;
    }

    // Moves to a new mood if happiness crossed a line, and changes face when it's time to
    private Refresh ()
    {
        const now = Date.now();
        const mood = this.FindMood();
        const hasMoodChanged = mood !== this.currentMood;

        this.currentMood = mood;

        if (now < this.excitedUntil)
        {
            this.SetExpression('excited');
        }
        else if (hasMoodChanged || now >= this.nextExpressionChangeAt || this.expression === 'excited')
        {
            this.PickExpression();
        }

        this.Emit();
    }

    private FindMood (): CatMoodDefinition
    {
        const happiness = this.GetHappiness();

        return catMoods.find(mood => happiness >= mood.minHappiness) ?? catMoods[catMoods.length - 1];
    }

    // A weighted random pick from the mood's expressions, trying not to repeat the current one
    private PickExpression ()
    {
        const options = Object.entries(this.currentMood.expressions) as [ CatExpression, number ][];
        const freshOptions = options.filter(([ expression ]) => expression !== this.expression);
        const choices = freshOptions.length > 0 ? freshOptions : options;
        const totalWeight = choices.reduce((total, [ , weight ]) => total + weight, 0);
        let roll = Math.random() * totalWeight;

        for (const [ expression, weight ] of choices)
        {
            roll -= weight;

            if (roll <= 0)
            {
                this.SetExpression(expression);
                break;
            }
        }

        this.nextExpressionChangeAt = Date.now() + catMoodSettings.minExpressionChangeMs
            + Math.random() * (catMoodSettings.maxExpressionChangeMs - catMoodSettings.minExpressionChangeMs);
    }

    private SetExpression (expression: CatExpression)
    {
        this.expression = expression;
        this.Emit();
    }

    // Only when something visible changed (the rounded happiness, the mood or the face)
    private Emit ()
    {
        const payload: CatMoodChangedPayload = {
            happiness: this.GetHappiness(),
            moodName: this.currentMood.name,
            expression: this.expression
        };
        const signature = `${payload.happiness}|${payload.moodName}|${payload.expression}`;

        if (signature !== this.lastSentSignature)
        {
            this.lastSentSignature = signature;
            EventBus.emit(GameEvents.CatMoodChanged, payload);
        }
    }
}

function Clamp (value: number, min: number, max: number): number
{
    return Math.min(max, Math.max(min, value));
}

export const playerCatMood = new CatMood();
