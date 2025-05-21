export const DUNE_KEY = Bun.env.DUNE_KEY;
export const BOT_TOKEN = Bun.env.BOT_TOKEN as string;
export const ADDRESS_TO_TRACK = Bun.env.ADDRESS_TO_TRACK || "8rvAsDKeAcEjEkiZMug9k8v1y8mW6gQQiMobd89Uy7qR";
export const TELEGRAM_CHAT_ID = Bun.env.TELEGRAM_CHAT_ID ? parseInt(Bun.env.TELEGRAM_CHAT_ID, 10) : -4642723252; // Example, make configurable

export const API_TIMEOUT = 5000;
export const BOT_POLLING_TIMEOUT = 5000; // Renamed from `timeout` for clarity

if (!DUNE_KEY) {
    throw new Error("DUNE_KEY is not set in environment variables.");
}

if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN is not set in environment variables.");
}

export const DUNE_API_OPTIONS = { method: 'GET', headers: { 'X-Sim-Api-Key': DUNE_KEY } };

console.log(`Tracking address: ${ADDRESS_TO_TRACK}`);
console.log(`Telegram Chat ID: ${TELEGRAM_CHAT_ID}`); 