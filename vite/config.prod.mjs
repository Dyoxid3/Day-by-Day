import { defineConfig, loadEnv } from 'vite';
import { OnlinePrototypeServer } from '../server/OnlinePrototypeServer.mjs';
import { GentleHelperServer } from '../server/GentleHelperServer.mjs';

// GEMINI_API_KEY (and optionally GEMINI_MODEL) for the gentle helpers, from .env.local (which git ignores).
// Only the preview server reads them; they're never built into the game.
const env = loadEnv('production', process.cwd(), '');

const phasermsg = () => {
    return {
        name: 'phasermsg',
        buildStart() {
            process.stdout.write(`Building for production...\n`);
        },
        buildEnd() {
            const line = "---------------------------------------------------------";
            const msg = `❤️❤️❤️ Tell us about your game! - games@phaser.io ❤️❤️❤️`;
            process.stdout.write(`${line}\n${msg}\n${line}\n`);
            
            process.stdout.write(`✨ Done ✨\n`);
        }
    }
}   

export default defineConfig({
    base: './',
    logLevel: 'warning',
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
        minify: 'terser',
        terserOptions: {
            compress: {
                passes: 2
            },
            mangle: true,
            format: {
                comments: false
            }
        }
    },
    server: {
        port: 8080
    },
    plugins: [
        phasermsg(),
        // Only used by `vite preview`, so a built game can still reach the online features and gentle helpers
        OnlinePrototypeServer(),
        GentleHelperServer({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL })
    ]
});
