import { Bot, Context, MessageContext } from "gramio";
import { db, getLastProcessedBlockSlotFromDB, saveLastProcessedBlockSlotToDB } from "../../db"; // Adjusted path
import { fetchInitialTransactionsToDetermineLastSlot, fetchLatestTransactions } from "../../solana/duneApi"; // Adjusted path
import { parseDuneTransaction } from "../../solana/transactionParser"; // Adjusted path
import { saveParsedTransactionData, getTransactionBySignature } from "../../db"; // Adjusted path for saveParsedTransactionData
import { ADDRESS_TO_TRACK, BOT_POLLING_TIMEOUT, TELEGRAM_CHAT_ID } from "../../config"; // Adjusted path
import type { ParsedTransactionResult, DuneTransaction } from "../../types"; // Adjusted path

let mainPollingInterval: NodeJS.Timeout | null = null;
let lastProcessedBlockSlotInMemory: number = 0;
let lastTransactionIdInMemory: string | null = null;

async function processTransaction(bot: Bot, tx: DuneTransaction): Promise<boolean> {
    const existingTx = getTransactionBySignature(db, tx.raw_transaction.transaction.signatures[0]);
    if (existingTx) {
        console.log(`Transaction ${tx.raw_transaction.transaction.signatures[0]} already in DB (slot ${tx.block_slot}), skipping processing.`);
        // Ensure memory is at least this slot if we skipped due to DB having it already
        if (tx.block_slot > lastProcessedBlockSlotInMemory) {
            lastProcessedBlockSlotInMemory = tx.block_slot;
            // No need to save to DB here, as it's already based on DB check or will be saved by processor
        }
        return true; // Indicate it was handled (by skipping)
    }

    const parsedData = parseDuneTransaction(tx, db);
    if (!parsedData) {
        console.error(`Failed to parse transaction, skipping notification and DB save for signature: ${tx.raw_transaction.transaction.signatures[0]}`);
        // Decide if we should advance block slot or retry. For now, advance if newer.
        if (tx.block_slot > lastProcessedBlockSlotInMemory) {
            lastProcessedBlockSlotInMemory = tx.block_slot;
            saveLastProcessedBlockSlotToDB(db, ADDRESS_TO_TRACK, lastProcessedBlockSlotInMemory);
        }
        return false; // Indicate failure
    }

    try {
        await bot.api.sendMessage({
            chat_id: TELEGRAM_CHAT_ID,
            text: parsedData.message,
            parse_mode: "Markdown"
        });
        console.log(`Sent notification for transaction: ${parsedData.signature}`);
        saveParsedTransactionData(db, tx, parsedData); // Save after successful notification
        
        lastProcessedBlockSlotInMemory = parsedData.blockSlot;
        lastTransactionIdInMemory = parsedData.signature;
        saveLastProcessedBlockSlotToDB(db, ADDRESS_TO_TRACK, lastProcessedBlockSlotInMemory);
        return true; // Indicate success

    } catch (error) {
        console.error(`Error sending notification for ${parsedData.signature}:`, error);
        // If notification fails, we might not want to save or advance the block slot yet,
        // or implement a retry mechanism for notifications.
        // For now, log and don't save if notification fails, to avoid inconsistent state.
        return false; // Indicate failure
    }
}

async function pollAndProcessTransactions(bot: Bot) {
    try {
        const transactions = await fetchLatestTransactions(ADDRESS_TO_TRACK, 50);
        if (transactions.length > 0) {
            const newTransactions = transactions.filter(
                (tx) => tx.block_slot > lastProcessedBlockSlotInMemory
            );

            if (newTransactions.length > 0) {
                console.log(`Found ${newTransactions.length} new transactions to process.`);
                const sortedTransactions = newTransactions.sort(
                    (a, b) => a.block_slot - b.block_slot
                );

                for (const tx of sortedTransactions) {
                    await processTransaction(bot, tx);
                    // lastProcessedBlockSlotInMemory is updated within processTransaction after successful save
                }
            }
        }
    } catch (err) {
        console.error("Error during polling/processing transactions:", err);
    }
}

export function registerStartCommand(bot: Bot) {
    bot.command("start", async (context: MessageContext<Bot>) => {
        console.log(`'/start' command received from chat ID: ${context.chatId}`);
        context.send("Wallet tracker starting or re-initializing...");

        lastProcessedBlockSlotInMemory = getLastProcessedBlockSlotFromDB(db, ADDRESS_TO_TRACK);
        console.log(`Retrieved lastProcessedBlockSlot from DB: ${lastProcessedBlockSlotInMemory} for ${ADDRESS_TO_TRACK}`);

        if (lastProcessedBlockSlotInMemory === 0) {
            context.send("No previous block slot found in DB. Fetching latest transaction to initialize...");
            try {
                const initialTx = await fetchInitialTransactionsToDetermineLastSlot(ADDRESS_TO_TRACK);
                if (initialTx) {
                    lastProcessedBlockSlotInMemory = initialTx.block_slot;
                    // Check if this very first transaction needs processing or just setting the slot
                    // For safety, let's process it to ensure it's in DB if it's truly new relative to a 0 slot.
                    // However, the main loop will pick it up if lastProcessedBlockSlotInMemory is set correctly before loop starts.
                    // Simplest: save this slot, and the loop will naturally fetch transactions GREATER than it.
                    saveLastProcessedBlockSlotToDB(db, ADDRESS_TO_TRACK, lastProcessedBlockSlotInMemory);
                    console.log(`Initialized lastProcessedBlockSlot to ${lastProcessedBlockSlotInMemory} from transaction ${initialTx.raw_transaction.transaction.signatures[0]}`);
                    context.send(`Initialized. Tracking will start from block slot: ${lastProcessedBlockSlotInMemory}.`);
                } else {
                    context.send("Could not fetch initial transaction. Tracker will start with block slot 0. Please try /reset if issues persist or wait for new transactions.");
                    // lastProcessedBlockSlotInMemory remains 0, which is fine. It will be updated on first new tx.
                }
            } catch (err) {
                console.error("Error initializing last block slot during /start:", err);
                context.send("Error initializing. Please check logs. Tracker will use DB slot or 0.");
            }
        } else {
            context.send(`Resuming from block slot: ${lastProcessedBlockSlotInMemory}.`);
        }
        
        if (mainPollingInterval) {
            clearInterval(mainPollingInterval);
            console.log("Cleared existing polling interval.");
        }
        
        // Initial immediate poll, then set interval
        console.log("Performing initial poll and process cycle...");
        await pollAndProcessTransactions(bot);
        
        mainPollingInterval = setInterval(() => pollAndProcessTransactions(bot), BOT_POLLING_TIMEOUT);
        console.log(`Polling interval started every ${BOT_POLLING_TIMEOUT}ms. Bot is active.`);
        context.send("Wallet tracker is now active and polling for new transactions.");
    });
}

export function getPollingInterval() {
    return mainPollingInterval;
}
export function clearPollingInterval() {
    if(mainPollingInterval) clearInterval(mainPollingInterval);
    mainPollingInterval = null;
} 