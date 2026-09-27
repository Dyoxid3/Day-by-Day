import { EventBus, GameEvents } from '../game/EventBus';
import type { CatExpression } from '../game/data/CatAppearance';
import { letterSettings } from '../game/data/DaySettings';
import {
    freshStartLetterOffer,
    GetLetterDeliveredMessage,
    letterSavedMessage,
    letterWritingMessage,
    letterWritingOffer
} from '../game/data/GentleMessages';
import { letters, type FutureLetter } from '../game/state/Letters';
import { RequestToast } from '../online/OnlineSession';
import { CreateCatPortrait } from './CatPortrait';
import { GentleCard } from './GentleCard';
import { ShakeElement } from './UiAnimations';
import { uiAssets } from './UiAssets';
import './Letters.css';

// The cards for letters to future you: writing one (offered on good days, see DayStartFlow, or from the profile),
// and reading one the cat hands over on a hard day (also in DayStartFlow)
export class LetterCards
{
    constructor (card: GentleCard)
    {
        EventBus.on(GameEvents.FutureLetterWriteRequested, () => card.Enqueue((shownCard, finish) => ShowWritingCard(shownCard, finish)));
    }
}

// On a good day's check-in: an offer to write a letter for a harder day (see DayStartFlow). A brand new account's
// first one is worded as a fresh start.
export function ShowWritingOffer (card: GentleCard, next: () => void, isFreshStart = false)
{
    const message = isFreshStart ? freshStartLetterOffer : letterWritingOffer;

    card.Show({
        title: message.title,
        text: message.text,
        buttons: [
            { label: 'Not today', onClick: next },
            { label: 'Write one', isPrimary: true, onClick: () => ShowWritingCard(card, next) }
        ]
    });
}

// The cat hands over a letter the player wrote on a better day.
// Shown inside the hard day's single check-in card, so it doesn't add another prompt
export function CreateDeliveredLetter (letter: FutureLetter): HTMLElement
{
    const message = GetLetterDeliveredMessage(FormatDay(letter.writtenOnDayKey));
    const deliveredLetter = document.createElement('div');
    deliveredLetter.className = 'letter-delivered';

    const captionElement = document.createElement('p');
    captionElement.className = 'letter-delivered-caption';
    captionElement.textContent = `${message.title}: ${message.text.charAt(0).toLowerCase()}${message.text.slice(1)}`;

    deliveredLetter.append(captionElement, CreateLetterBody(letter.text, 'from you, on a better day', 'satisfied'));

    return deliveredLetter;
}

function ShowWritingCard (card: GentleCard, finish: () => void)
{
    const body = document.createElement('div');
    body.className = 'letter-writing';

    const textInput = document.createElement('textarea');
    textInput.className = 'letter-writing-input';
    textInput.maxLength = letterSettings.maxLetterLength;
    textInput.rows = 5;
    textInput.placeholder = 'Dear future me...';
    textInput.setAttribute('aria-label', 'Your letter');

    const countElement = document.createElement('p');
    countElement.className = 'letter-writing-count';

    const UpdateCount = () => {
        countElement.textContent = `${textInput.value.length} / ${letterSettings.maxLetterLength}`;
    };

    textInput.addEventListener('input', UpdateCount);
    UpdateCount();
    body.append(textInput, countElement);

    card.Show({
        title: letterWritingMessage.title,
        text: letterWritingMessage.text,
        body,
        buttons: [
            { label: 'Not now', onClick: finish },
            {
                label: 'Save letter',
                isPrimary: true,
                onClick: () => {
                    if (textInput.value.trim() === '')
                    {
                        ShakeElement(textInput);
                        textInput.focus();
                        return;
                    }

                    letters.WriteFutureLetter(textInput.value);
                    RequestToast(letterSavedMessage.title, letterSavedMessage.text, 'reward', false, 'star');
                    finish();
                }
            }
        ]
    });

    textInput.focus({ preventScroll: true });
}

// The cat beside a sheet of paper with the letter on it (sealed with a star, a placeholder for letter art)
function CreateLetterBody (text: string, signature: string, expression: CatExpression): HTMLElement
{
    const body = document.createElement('div');
    body.className = 'letter';

    const paper = document.createElement('div');
    paper.className = 'letter-paper';

    const seal = document.createElement('img');
    seal.className = 'letter-seal';
    seal.src = uiAssets.star;
    seal.alt = '';
    seal.draggable = false;

    const textElement = document.createElement('p');
    textElement.className = 'letter-text';
    textElement.textContent = text;

    paper.append(seal, textElement);

    if (signature)
    {
        const signatureElement = document.createElement('p');
        signatureElement.className = 'letter-signature';
        signatureElement.textContent = signature;
        paper.append(signatureElement);
    }

    body.append(CreateCatPortrait(expression), paper);

    return body;
}

// e.g. "September 26"
function FormatDay (dayKey: string): string
{
    const [ year, month, day ] = dayKey.split('-').map(Number);

    return new Date(year, month - 1, day).toLocaleDateString([], { month: 'long', day: 'numeric' });
}
