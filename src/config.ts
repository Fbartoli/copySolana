export const DUNE_KEY = Bun.env.DUNE_KEY;
export const BOT_TOKEN = Bun.env.BOT_TOKEN as string;

export const API_TIMEOUT = 5000;
export const BOT_POLLING_TIMEOUT = 5000;

if (!DUNE_KEY) {
    throw new Error("DUNE_KEY is not set in environment variables.");
}

if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN is not set in environment variables.");
}

export const DUNE_API_OPTIONS = { method: 'GET', headers: { 'X-Sim-Api-Key': DUNE_KEY } };