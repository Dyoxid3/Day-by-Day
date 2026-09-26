import { defineConfig } from 'vite';
import { OnlinePrototypeServer } from '../server/OnlinePrototypeServer.mjs';

export default defineConfig({
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
        watch: {
            // The online server's save file changes constantly and isn't part of the game
            ignored: ['**/server/data/**']
        }
    },
    plugins: [
        // Serves the online features (accounts, friends, visits, notifications) at /api
        OnlinePrototypeServer()
    ]
});
