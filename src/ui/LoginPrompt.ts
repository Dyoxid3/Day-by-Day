import { GetStoredToken } from '../online/OnlineApi';
import { CreateAuthForm } from './AuthForm';
import { GentleCard } from './GentleCard';

// The first thing the game shows: a card to log in or sign up, before the day's check-in. It's skipped when a login is
// kept from before a reload. Playing as a guest is always an option (logging in later works from the profile).
export class LoginPrompt
{
    // Create before the day's check-in is queued (before PlayerSave starts), so this card comes first
    constructor (card: GentleCard)
    {
        if (GetStoredToken() !== null)
        {
            return;
        }

        card.Enqueue((shownCard, finish) => {
            const authForm = CreateAuthForm(finish);

            shownCard.Show({
                title: 'Welcome to your island',
                text: 'Log in to keep your progress with your account, and to encourage your friends and visit their islands.',
                body: authForm,
                buttons: [ { label: 'Play as a guest', onClick: finish } ]
            });

            authForm.querySelector('input')?.focus({ preventScroll: true });
        });
    }
}
