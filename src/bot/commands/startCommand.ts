import { Bot, MessageContext } from "gramio";
import {
    db,
    getLastProcessedBlockSlotFromDB,
    saveLastProcessedBlockSlotToDB,
    saveParsedTransactionData,
    getTransactionBySignature,
    getAllTrackedWalletsDB
} from "../../db";
import type { TrackedWalletEntry } from "../../db";
import { fetchInitialTransactionsToDetermineLastSlot, fetchLatestTransactions } from "../../solana/duneApi";
import { parseDuneTransaction } from "../../solana/transactionParser";
import { BOT_POLLING_TIMEOUT } from "../../config";
import type { ParsedTransactionResult, DuneTransaction } from "../../types";

let mainPollingInterval: NodeJS.Timeout | null = null;

export const lastProcessedData = new Map<string, { blockSlot: number; txId: string | null }>();

export function getWalletKey(user_chat_id: string, solana_address: string): string {
    return `${user_chat_id}_${solana_address}`;
}

async function processTransaction(
    bot: Bot,
    tx: DuneTransaction,
    user_chat_id: string,
    solana_address: string
): Promise<boolean> {
    const signature = tx.raw_transaction.transaction.signatures[0];
    const existingTx = getTransactionBySignature(db, signature);

    if (existingTx) {
        const walletKey = getWalletKey(user_chat_id, solana_address);
        const currentWalletData = lastProcessedData.get(walletKey) || { blockSlot: 0, txId: null };
        if (tx.block_slot > currentWalletData.blockSlot) {
            lastProcessedData.set(walletKey, { blockSlot: tx.block_slot, txId: signature });
            saveLastProcessedBlockSlotToDB(db, user_chat_id, solana_address, tx.block_slot);
        }
        return true; 
    }

    const parsedData = parseDuneTransaction(tx, db, user_chat_id, solana_address);
    if (!parsedData) {
        console.log(`Could not parse transaction ${signature} for ${user_chat_id} - ${solana_address}. Skipping.`);
        return false;
    }

    try {
        console.log(parsedData.message);
        await bot.api.sendMessage({
            chat_id: user_chat_id,
            text: parsedData.message,
            parse_mode: "Markdown"
        });
        console.log(`Sent notification for tx ${parsedData.signature} to ${user_chat_id} for address ${solana_address}`);
        
        saveParsedTransactionData(db, tx, parsedData, user_chat_id, solana_address);
        
        const walletKey = getWalletKey(user_chat_id, solana_address);
        lastProcessedData.set(walletKey, { blockSlot: parsedData.blockSlot, txId: parsedData.signature });
        saveLastProcessedBlockSlotToDB(db, user_chat_id, solana_address, parsedData.blockSlot);
        
        return true;
    } catch (error) {
        console.error(`Error processing tx ${parsedData.signature} for ${user_chat_id}, ${solana_address}:`, error);
        return false;
    }
}

async function pollAndProcessTransactionsForWallet(bot: Bot, trackedWallet: TrackedWalletEntry) {
    const { user_chat_id, solana_address } = trackedWallet;
    const walletKey = getWalletKey(user_chat_id, solana_address);
    const currentWalletData = lastProcessedData.get(walletKey) || { blockSlot: 0, txId: null };

    try {
        const transactions = await fetchLatestTransactions(solana_address, 50);
        
        if (transactions.length > 0) {
            const newTransactions = transactions.filter(
                (tx) => tx.block_slot > currentWalletData.blockSlot || 
                        (tx.block_slot === currentWalletData.blockSlot && tx.raw_transaction.transaction.signatures[0] !== currentWalletData.txId)
            );

            if (newTransactions.length > 0) {
                console.log(`Found ${newTransactions.length} new transaction(s) for ${user_chat_id} - ${solana_address}.`);
                const sortedTransactions = newTransactions.sort((a, b) => {
                    if (a.block_slot === b.block_slot) {
                        return a.raw_transaction.transaction.signatures[0].localeCompare(b.raw_transaction.transaction.signatures[0]);
                    }
                    return a.block_slot - b.block_slot;
                });

                for (const tx of sortedTransactions) {
                    const LPDForWallet = lastProcessedData.get(walletKey);
                    if (LPDForWallet && tx.block_slot === LPDForWallet.blockSlot && tx.raw_transaction.transaction.signatures[0] === LPDForWallet.txId) {
                        continue;
                    }
                    await processTransaction(bot, tx, user_chat_id, solana_address);
                }
            }
        }
    } catch (err) {
        console.error(`Error polling for ${user_chat_id} - ${solana_address}:`, err);
    }
}

async function pollAllTrackedWallets(bot: Bot) {
    const allWallets = getAllTrackedWalletsDB(db);
    if (allWallets.length === 0) {
        return;
    }
    for (const wallet of allWallets) {
        await pollAndProcessTransactionsForWallet(bot, wallet);
    }
}

export function registerStartCommand(bot: Bot) {
    bot.command("start", async (context: MessageContext<Bot>) => {
        const commandInitiatorChatId = context.chat?.id;
        if (!commandInitiatorChatId) {
            context.send("Could not identify the chat to start the bot. Command ignored.");
            console.warn("'/start' command received but could not identify chat ID.");
            return;
        }

        context.send("Bot starting or re-initializing polling for all tracked wallets...");
        console.log(`'/start' command received from chat ID: ${commandInitiatorChatId}`);

        const allWallets = getAllTrackedWalletsDB(db);
        if (allWallets.length === 0) {
            context.send("No wallets are currently being tracked. Use /track <address> to add one. Polling will not start.");
        } else {
            console.log(`Initializing ${allWallets.length} tracked wallets...`);
            for (const wallet of allWallets) {
                const walletKey = getWalletKey(wallet.user_chat_id, wallet.solana_address);
                let dbSlot = getLastProcessedBlockSlotFromDB(db, wallet.user_chat_id, wallet.solana_address);
                
                if (dbSlot === 0) {
                    console.log(`No slot in DB for ${walletKey}. Fetching initial to set slot.`);
                    try {
                        const initialTx = await fetchInitialTransactionsToDetermineLastSlot(wallet.solana_address);
                        if (initialTx) {
                            dbSlot = initialTx.block_slot;
                            saveLastProcessedBlockSlotToDB(db, wallet.user_chat_id, wallet.solana_address, dbSlot);
                            console.log(`Initialized slot for ${walletKey} to ${dbSlot} from tx ${initialTx.raw_transaction.transaction.signatures[0]}.`);
                        }
                    } catch (err) {
                        console.error(`Error fetching initial tx for ${walletKey}:`, err);
                    }
                }
                lastProcessedData.set(walletKey, { blockSlot: dbSlot, txId: null });
                console.log(`Initialized ${walletKey} from DB slot: ${dbSlot}`);
            }
            context.send(`Initialized state for ${allWallets.length} tracked wallet(s).`);
        }

        if (mainPollingInterval) {
            clearInterval(mainPollingInterval);
            console.log("Cleared existing polling interval.");
        }
        
        if (allWallets.length > 0) {
            console.log("Performing initial poll and process cycle for all tracked wallets...");
            await pollAllTrackedWallets(bot);
            
            mainPollingInterval = setInterval(() => pollAllTrackedWallets(bot), BOT_POLLING_TIMEOUT);
            console.log(`Polling interval started every ${BOT_POLLING_TIMEOUT}ms. Bot is active for ${allWallets.length} wallet(s).`);
            context.send("Wallet tracking is now active and polling for new transactions on all tracked wallets.");
        } else {
            console.log("Polling not started as no wallets are tracked.");
        }
    });
}

export function getPollingInterval() {
    return mainPollingInterval;
}

export function clearPollingInterval() {
    if (mainPollingInterval) clearInterval(mainPollingInterval);
    mainPollingInterval = null;
    console.log("Polling interval cleared.");
} 