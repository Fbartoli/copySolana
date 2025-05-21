import { Bot, Context } from "gramio";
import { db, getTotalRealizedPnL } from "../../db"; // Corrected path

export function registerTotalPnlCommand(bot: Bot) {
    bot.command("totalpnl", (context: any) => { // Using `any` for context type
        try {
            const pnlData = getTotalRealizedPnL(db);

            let message = `📈 Total Realized PnL (SOL) Summary 📉\n\n`;
            message += `Total Realized PnL: ${pnlData.total_pnl.toFixed(4)} SOL\n`;
            message += `Based on ${pnlData.disposal_count} disposal(s).\n\n`;
            message += `Note: This reflects PnL from token sales directly for SOL that have been processed by the tracker.`;

            context.send(message);
        } catch (error) {
            console.error("Error fetching total PnL for /totalpnl command:", error);
            context.send("Sorry, there was an error calculating the total PnL.");
        }
    });
} 