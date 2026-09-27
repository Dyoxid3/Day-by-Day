import { defineConfig, loadEnv } from 'vite';
import { OnlinePrototypeServer } from '../server/OnlinePrototypeServer.mjs';
import { GentleHelperServer } from '../server/GentleHelperServer.mjs';

export default defineConfig(({ mode }) => {

    // GEMINI_API_KEY (and optionally GEMINI_MODEL) for the gentle helpers, from .env.local (which git ignores).
    // Only the server reads them; they never reach the browser.
    const env = loadEnv(mode, process.cwd(), '');

    return {
        base: './',
        build: {
            rollupOptions: {
                output: {
                    manualChunks: {
                        phaser: ['phaser']
                    }
                }
            },
        },
        server: {
            port: 8080,
            // Lets a temporary Cloudflare tunnel reach the dev server, for testing on a phone when the Wi-Fi
            // blocks devices from reaching each other (see ONLINE_PLAYTEST.md)
            allowedHosts: [ '.trycloudflare.com' ],
            watch: {
                // The online server's save file changes constantly and isn't part of the game
                ignored: ['**/server/data/**']
            }
        },
        plugins: [
            // Serves the online features (accounts, friends, visits, notifications) at /api
            OnlinePrototypeServer(),
            // Serves the gentle helpers (Google Gemini) at /ai
            GentleHelperServer({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL })
        ]
    };

});
