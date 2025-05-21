import { Bot, Context } from "gramio";
import { db, saveLastProcessedBlockSlotToDB } from "../../db"; // Corrected path
import { fetchInitialTransactionsToDetermineLastSlot } from "../../solana/duneApi"; // Corrected path
import { ADDRESS_TO_TRACK } from "../../config"; // Corrected path
import { clearPollingInterval } from "./startCommand"; // To stop polling if active

// Need to share these or manage state differently if reset affects startCommand's state
// For now, resetCommand will manage its own interaction with DB for lastProcessedBlockSlot.
// lastTransactionIdInMemory is not directly managed here but reset through block slot.

export function registerResetCommand(bot: Bot) {
    bot.command("reset", async (context: any) => { // Using `any` for context type
        context.send("Resetting tracker state...");
        
        // Stop polling if it's active from startCommand
        clearPollingInterval();
        console.log("Polling stopped by /reset command (if it was active).");

        try {
            const initialTx = await fetchInitialTransactionsToDetermineLastSlot(ADDRESS_TO_TRACK);
            let newBlockSlot = 0;
            let newTxId = null;

            if (initialTx) {
                newBlockSlot = initialTx.block_slot;
                newTxId = initialTx.raw_transaction.transaction.signatures[0];
                saveLastProcessedBlockSlotToDB(db, ADDRESS_TO_TRACK, newBlockSlot);
                context.send(`Reset successful! Tracking will now start from block slot: ${newBlockSlot} (Tx: ${newTxId.slice(0,8)}...). Use /start to begin.`);
                console.log(`Reset to last processed block slot: ${newBlockSlot}`);
            } else {
                saveLastProcessedBlockSlotToDB(db, ADDRESS_TO_TRACK, 0); // Save 0 to indicate a full reset
                context.send("Reset successful, but no transactions found to initialize from. Will start from scratch on next /start (block slot 0).");
                console.log("Reset to block slot 0 as no initial transactions were found.");
            }
            // Note: lastProcessedBlockSlotInMemory and lastTransactionIdInMemory in startCommand.ts are not directly updated here.
            // The /start command will pick up the new DB value when it runs.
        } catch (err) {
            console.error("Error resetting last block slot during /reset:", err);
            context.send("Failed to reset block slot due to API error. Current block slot in DB remains unchanged. Try /start to see current DB state.");
        }
    });
} 