import { onlineSession, RequestToast } from '../online/OnlineSession';
import { ShakeElement } from './UiAnimations';
// The shared inputs and buttons (profile-input, profile-button)
import './ProfilePanel.css';
import './AuthForm.css';

type AuthMode = 'signup' | 'login';

// The tab picked last, so a form that's rebuilt (or shown somewhere else) opens on the same one
let lastAuthMode: AuthMode = 'signup';

// Signing up or logging in: Sign up and Log in tabs, a username and password, and a button. Used in the profile and in
// the log-in card that opens when the game starts. onSignedIn runs once it worked.
export function CreateAuthForm (onSignedIn?: () => void): HTMLElement
{
    const wrapper = document.createElement('div');
    wrapper.className = 'auth';

    const tabs = document.createElement('div');
    tabs.className = 'auth-tabs';
    tabs.setAttribute('role', 'tablist');

    const form = document.createElement('form');
    form.className = 'auth-form';
    form.noValidate = true;

    const usernameInput = CreateLabeledInput(form, 'Username', 'text', 'username');
    const passwordInput = CreateLabeledInput(form, 'Password', 'password', lastAuthMode === 'signup' ? 'new-password' : 'current-password');

    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'profile-button is-primary auth-submit';

    const errorElement = document.createElement('p');
    errorElement.className = 'auth-error';
    errorElement.setAttribute('role', 'alert');

    const hintElement = document.createElement('p');
    hintElement.className = 'auth-hint';

    form.append(submitButton, errorElement, hintElement);

    const ApplyMode = () => {
        const isSignUp = lastAuthMode === 'signup';

        submitButton.textContent = isSignUp ? 'Create account' : 'Log in';
        hintElement.textContent = isSignUp ? '3-16 letters, numbers or _ for your username.' : '';
        passwordInput.autocomplete = isSignUp ? 'new-password' : 'current-password';
        errorElement.textContent = '';

        for (const tab of tabs.children)
        {
            const isSelected = tab instanceof HTMLElement && tab.dataset.mode === lastAuthMode;

            tab.classList.toggle('is-selected', isSelected);
            tab.setAttribute('aria-selected', String(isSelected));
        }
    };

    for (const [ mode, label ] of [ [ 'signup', 'Sign up' ], [ 'login', 'Log in' ] ] as const)
    {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'auth-tab';
        tab.textContent = label;
        tab.dataset.mode = mode;
        tab.setAttribute('role', 'tab');
        tab.addEventListener('click', () => {
            lastAuthMode = mode;
            ApplyMode();
            usernameInput.focus();
        });
        tabs.append(tab);
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (username === '' || password === '')
        {
            const emptyInput = username === '' ? usernameInput : passwordInput;

            ShakeElement(emptyInput);
            emptyInput.focus();
            return;
        }

        const isSignUp = lastAuthMode === 'signup';

        submitButton.disabled = true;
        submitButton.textContent = isSignUp ? 'Creating account...' : 'Logging in...';
        errorElement.textContent = '';

        try
        {
            if (isSignUp)
            {
                await onlineSession.SignUp(username, password);
                RequestToast(`Welcome, ${onlineSession.GetUsername()}!`, 'Add a friend by their username to get started.', 'reward');
            }
            else
            {
                await onlineSession.LogIn(username, password);
                RequestToast(`Welcome back, ${onlineSession.GetUsername()}!`, 'Your island has been loaded.', 'reward');
            }

            onSignedIn?.();
        }
        catch (error)
        {
            submitButton.disabled = false;
            ApplyMode();
            errorElement.textContent = error instanceof Error ? error.message : 'Something went wrong';
            ShakeElement(form);
        }
    });

    ApplyMode();
    wrapper.append(tabs, form);

    return wrapper;
}

function CreateLabeledInput (form: HTMLFormElement, labelText: string, type: string, autocomplete: AutoFill): HTMLInputElement
{
    const label = document.createElement('label');
    label.className = 'auth-field';

    const labelTextElement = document.createElement('span');
    labelTextElement.textContent = labelText;

    const input = document.createElement('input');
    input.type = type;
    input.className = 'profile-input';
    input.autocomplete = autocomplete;
    input.maxLength = 40;

    label.append(labelTextElement, input);
    form.append(label);

    return input;
}
