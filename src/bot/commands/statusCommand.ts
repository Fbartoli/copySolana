import { Bot, Context, MessageContext } from "gramio";
import { db, getLastProcessedBlockSlotFromDB } from "../../db"; // Corrected path
import { ADDRESS_TO_TRACK } from "../../config"; // Corrected path
import { getPollingInterval } from "./startCommand"; // To check if polling is active

// Need to access lastTransactionIdInMemory from startCommand or manage globally
// For now, this status command will only show DB slot and a generic polling status.

export function registerStatusCommand(bot: Bot) {
    bot.command("status", (context: MessageContext<Bot>) => { // Using `any` for context type
        const dbSlot = getLastProcessedBlockSlotFromDB(db, ADDRESS_TO_TRACK);
        const interval = getPollingInterval(); // Check current interval status
        
        // We can't easily access lastTransactionIdInMemory from startCommand.ts here
        // without a more complex state management or passing it around.
        // So, we'll omit it or show a placeholder.

        context.send(
            `🔍 Wallet Tracker Status:\n` +
            `- Tracking Address: ${ADDRESS_TO_TRACK}\n` +
            `- Polling Active: ${interval !== null ? 'Yes' : 'No'}\n` +
            `- Last Block Slot in DB: ${dbSlot}\n` +
            `- (In-memory last TX ID is not directly accessible by /status command)`
        );
    });
} 