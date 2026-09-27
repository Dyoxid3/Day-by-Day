// Runs the finished game on a host (like Render, see render.yaml), so it can be played from any computer with just a
// link. It serves the built game (the dist folder from `npm run build`), plus the online prototype and the gentle
// helpers, which in development run inside the Vite dev server.
//
// Start it with `npm start`. Settings come from the host's environment variables:
//   PORT            the port to listen on (hosts set this themselves; 8080 otherwise)
//   GEMINI_API_KEY  turns the gentle helpers on (a .env.local file works too, for trying this locally)
//   GEMINI_MODEL    optional, a different Gemini model
//
// Only Node's own modules are used. The online prototype saves to server/data/online-db.json; on free hosts that
// file is wiped whenever the server restarts, and Sam the demo friend comes back fresh.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { OnlinePrototypeServer } from './OnlinePrototypeServer.mjs';
import { GentleHelperServer } from './GentleHelperServer.mjs';

const serverSettings = {
    port: Number(process.env.PORT) || 8080,
    // The built game
    gameFolder: join(process.cwd(), 'dist'),
    // Pages are always checked for updates; everything else can be kept by the browser for a while
    fileCacheSeconds: 3600
};

const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

// Only when run directly (npm start), not when a test imports CreateRequestHandler
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
{
    if (!existsSync(join(serverSettings.gameFolder, 'index.html')))
    {
        console.error('No built game found in dist. Run `npm run build` first.');
        process.exit(1);
    }

    createServer(CreateRequestHandler(ReadGeminiSettings())).listen(serverSettings.port, () => {
        console.log(`  Day by Day is running on port ${serverSettings.port}`);
    });
}

// Answers every request: the online prototype at /api, the gentle helpers at /ai, and the game's files otherwise
export function CreateRequestHandler (gemini)
{
    // The two server parts are Vite plugins; this stands in for the Vite server they attach to
    const mountedHandlers = [];
    const hostStandIn = {
        middlewares: { use: (pathPrefix, handler) => mountedHandlers.push({ pathPrefix, handler }) },
        config: { logger: { info: message => console.log(message) } }
    };

    OnlinePrototypeServer().configureServer(hostStandIn);
    GentleHelperServer({ apiKey: gemini.apiKey, model: gemini.model }).configureServer(hostStandIn);

    return (request, response) => {
        const url = request.url ?? '/';

        // Handed to the online prototype or the gentle helpers with their prefix taken off, as Vite does
        for (const { pathPrefix, handler } of mountedHandlers)
        {
            if (url === pathPrefix || url.startsWith(`${pathPrefix}/`) || url.startsWith(`${pathPrefix}?`))
            {
                request.url = url.slice(pathPrefix.length) || '/';
                handler(request, response);
                return;
            }
        }

        ServeGameFile(url, response);
    };
}

// A file from the built game, or the game's page for anything else
function ServeGameFile (url, response)
{
    let filePath = join(serverSettings.gameFolder, 'index.html');

    try
    {
        const requestedPath = decodeURIComponent(new URL(url, 'http://localhost').pathname);
        const candidatePath = normalize(join(serverSettings.gameFolder, requestedPath));

        // Never outside the game folder
        if (candidatePath.startsWith(serverSettings.gameFolder + sep) && existsSync(candidatePath) && statSync(candidatePath).isFile())
        {
            filePath = candidatePath;
        }
    }
    catch
    {
        // An unreadable address gets the game's page
    }

    const extension = extname(filePath).toLowerCase();

    response.writeHead(200, {
        'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
        'Cache-Control': extension === '.html' ? 'no-cache' : `public, max-age=${serverSettings.fileCacheSeconds}`
    });
    createReadStream(filePath).pipe(response);
}

// From the environment, or a .env.local file next to package.json when trying this out locally
function ReadGeminiSettings ()
{
    const fromFile = {};
    const localFilePath = join(process.cwd(), '.env.local');

    if (existsSync(localFilePath))
    {
        for (const line of readFileSync(localFilePath, 'utf8').split(/\r?\n/))
        {
            const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);

            if (match)
            {
                fromFile[match[1]] = match[2];
            }
        }
    }

    return {
        apiKey: process.env.GEMINI_API_KEY || fromFile.GEMINI_API_KEY || '',
        model: process.env.GEMINI_MODEL || fromFile.GEMINI_MODEL || ''
    };
}
