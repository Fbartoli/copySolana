import { Bot } from "gramio";
import { BOT_TOKEN } from "../config";
import { registerStartCommand } from "./commands/startCommand";
import { registerStopCommand } from "./commands/stopCommand";
import { registerStatusCommand } from "./commands/statusCommand";
import { registerTotalPnlCommand } from "./commands/totalpnlCommand";
import { registerPortfolioCommand } from "./commands/portfolioCommand";
import { registerTrackingCommands } from "./commands/trackingCommands";

export function initializeBot(): Bot {
    const bot = new Bot(BOT_TOKEN);

    // Register all commands
    registerStartCommand(bot);
    registerStopCommand(bot);
    registerStatusCommand(bot);
    registerTotalPnlCommand(bot);
    registerPortfolioCommand(bot);
    registerTrackingCommands(bot);

    bot.onStart(() => {
        console.log("Telegram Bot connected and listening for commands.");
        console.log("Bot daemon started. Note: Last processed block slot is now managed per tracked address.");
        console.log(`Registered commands: /start, /stop, /reset, /status, /totalpnl, /portfolio, /track, /untrack, /listtracked`);
    });

    // bot.on("message", (ctx) => ctx.send("Unknown command. Try /start, /stop, /reset, /status, /totalpnl, or /portfolio."));

    return bot;
} 