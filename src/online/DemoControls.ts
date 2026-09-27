import { onlineSession } from './OnlineSession';

// Dev-only keys for showing the online features on one screen. They need you logged in, and nobody logged in as Sam
// (the server's demoFriends setting controls this). If Sam isn't your friend yet, he befriends you.
// Sam leaving a lantern (N) and encouraging you (M) are in the debug menu, along with a button for the visit.
const demoKeys = {
    // Sam sails over and wanders your island for a while, dropping a few coins
    visit: 'v',
    // A demo friend lets you know they're having a tough day, so you can encourage them
    lowDay: 't'
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

        if (key === demoKeys.visit)
        {
            onlineSession.RunDemoFriendAction('visit');
        }
        else if (key === demoKeys.lowDay)
        {
            onlineSession.RunDemoFriendAction('struggle');
        }
    });
}
