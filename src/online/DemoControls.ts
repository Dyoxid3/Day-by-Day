import { onlineSession } from './OnlineSession';

// Dev-only keys for showing the online features on one screen. They need Mochi or Pixel added as a friend,
// with nobody logged in as them (the server's demoFriends setting controls this).
const demoKeys = {
    // A demo friend sends you encouragement (and a coin boost)
    encourage: 'e',
    // A demo friend sails over and wanders your island for a while, dropping coins
    visit: 'v'
};

export function RegisterDemoControls ()
{
    window.addEventListener('keydown', event => {
        const target = event.target;
        const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

        if (isTyping || event.repeat || event.ctrlKey || event.metaKey || event.altKey)
        {
            return;
        }

        const key = event.key.toLowerCase();

        if (key === demoKeys.encourage)
        {
            onlineSession.RunDemoFriendAction('encourage');
        }
        else if (key === demoKeys.visit)
        {
            onlineSession.RunDemoFriendAction('visit');
        }
    });
}
