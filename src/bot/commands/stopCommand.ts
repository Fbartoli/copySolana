import { Bot, Context } from "gramio";
import { clearPollingInterval, getPollingInterval } from "./startCommand"; // Assuming these are exported from startCommand.ts

export function registerStopCommand(bot: Bot) {
    bot.command("stop", (context: any) => { // Using `any` for context type for now
        const interval = getPollingInterval();
        if (interval) {
            clearPollingInterval();
            context.send("Wallet tracker stopped!");
            console.log("Wallet tracker stopped by /stop command.");
        } else {
            context.send("Wallet tracker is not currently running.");
        }
    });
} 