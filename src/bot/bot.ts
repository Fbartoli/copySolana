import { Bot } from "gramio";
import { BOT_TOKEN } from "../config";
import { registerStartCommand } from "./commands/startCommand";
import { registerStopCommand } from "./commands/stopCommand";
import { registerResetCommand } from "./commands/resetCommand";
import { registerStatusCommand } from "./commands/statusCommand";
import { registerTotalPnlCommand } from "./commands/totalpnlCommand";
import { getLastProcessedBlockSlotFromDB, db } from "../db"; // For initial console log
import { ADDRESS_TO_TRACK } from "../config";

export function initializeBot(): Bot {
    const bot = new Bot(BOT_TOKEN);

    // Register all commands
    registerStartCommand(bot);
    registerStopCommand(bot);
    registerResetCommand(bot);
    registerStatusCommand(bot);
    registerTotalPnlCommand(bot);

    bot.onStart(() => {
        console.log("Telegram Bot connected and listening for commands.");
        // Initial load of lastProcessedBlockSlot for the main variable in startCommand is handled within startCommand itself.
        // This log is just for an initial peek at DB state when bot daemon starts.
        const initialDbSlot = getLastProcessedBlockSlotFromDB(db, ADDRESS_TO_TRACK);
        console.log(`Bot daemon started. Initial lastProcessedBlockSlot from DB for ${ADDRESS_TO_TRACK}: ${initialDbSlot}`);
        console.log(`Registered commands: /start, /stop, /reset, /status, /totalpnl`);
    });

    // No catch all or default message handler for now to keep it clean.
    // bot.on("message", (ctx) => ctx.send("Unknown command. Try /start, /stop, /reset, /status, or /totalpnl."));

    return bot;
} 