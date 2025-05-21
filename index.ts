import { Bot } from "gramio"
import { Database } from "bun:sqlite";

const duneKey = Bun.env.DUNE_KEY;
const addressToTrack = "8rvAsDKeAcEjEkiZMug9k8v1y8mW6gQQiMobd89Uy7qR"
let lastTransactionId: string | null = null;
let lastProcessedBlockSlot: number = 0; // Add tracking for last processed block slot
const timeout = 30000;

// --- Database Setup ---
const db = new Database("tracker.sqlite");

function checkAndSetupDatabase(database: Database) {
  const checkTableQuery = database.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='app_meta';"
  );
  const tableExists = checkTableQuery.get();

  if (!tableExists) {
    console.log("'app_meta' table not found. Setting up database...");
    setupDatabase(database);
  } else {
    console.log("Database already appears to be set up.");
  }
}

function setupDatabase(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS app_meta (
      meta_key TEXT PRIMARY KEY,
      meta_value TEXT
    );
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      signature TEXT PRIMARY KEY,
      block_slot INTEGER NOT NULL,
      block_time INTEGER NOT NULL,
      address_tracked TEXT NOT NULL,
      fee_sol REAL NOT NULL,
      sol_change_sol REAL NOT NULL, -- Net SOL change for the tracked address in this TX
      transaction_type TEXT,
      parsed_message TEXT NOT NULL,
      raw_data_json TEXT
    );
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS token_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_signature TEXT NOT NULL,
      mint TEXT NOT NULL,
      amount_ui TEXT NOT NULL,
      action TEXT NOT NULL, -- "Received" or "Sent" by tracked address
      decimals INTEGER NOT NULL,
      FOREIGN KEY (transaction_signature) REFERENCES transactions(signature) ON DELETE CASCADE
    );
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS token_acquisitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_signature TEXT NOT NULL,
      mint TEXT NOT NULL,
      block_time INTEGER NOT NULL, -- For FIFO ordering
      amount_acquired REAL NOT NULL, -- Store as numeric for calculations
      sol_cost_per_unit REAL NOT NULL,
      total_sol_cost REAL NOT NULL,
      amount_remaining REAL NOT NULL, -- For FIFO tracking
      FOREIGN KEY (transaction_signature) REFERENCES transactions(signature) ON DELETE CASCADE
    );
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS token_disposals_pnl (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_signature TEXT NOT NULL,
      mint TEXT NOT NULL,
      block_time INTEGER NOT NULL,
      amount_sold REAL NOT NULL, -- Store as numeric
      sol_proceeds_per_unit REAL NOT NULL,
      total_sol_proceeds REAL NOT NULL,
      cost_of_goods_sold_sol REAL NOT NULL,
      realized_pnl_sol REAL NOT NULL,
      FOREIGN KEY (transaction_signature) REFERENCES transactions(signature) ON DELETE CASCADE
    );
  `);
  console.log("Database tables checked/created (including PnL tables).");
}

// Call checkAndSetupDatabase at the start instead of setupDatabase directly
checkAndSetupDatabase(db);

function getLastProcessedBlockSlotFromDB(database: Database, trackedAddress: string): number {
  const query = database.query<{ meta_value: string }, [string]>(
    "SELECT meta_value FROM app_meta WHERE meta_key = ?;"
  );
  const result = query.get(`last_processed_block_slot_for_${trackedAddress}`);
  return result ? parseInt(result.meta_value, 10) : 0;
}

function saveLastProcessedBlockSlotToDB(database: Database, trackedAddress: string, blockSlot: number) {
  const query = database.query(
    "INSERT OR REPLACE INTO app_meta (meta_key, meta_value) VALUES (?, ?);"
  );
  query.run(`last_processed_block_slot_for_${trackedAddress}`, blockSlot.toString());
  console.log(`Saved lastProcessedBlockSlot to DB: ${blockSlot} for ${trackedAddress}`);
}

// --- End Database Setup ---

// Token cache to help identify common tokens
const tokenCache: Record<string, string> = {
    "So11111111111111111111111111111111111111112": "SOL",
    "5uErKfXnzt3aHQyWf9ST4LotEN4oUdNrgQbHPERq3h8X": "MM",
    "8c9yqAKmuDXNyLXvdKsdq4AdBxeD6KZKhRm1rXBLpump": "MM", // Added from sample transaction
};

if (!duneKey) {
    throw new Error("DUNE_KEY is not set");
}

const options = { method: 'GET', headers: { 'X-Sim-Api-Key': duneKey } };

// This function will now return an object with message and data for DB
interface ParsedTransactionData {
  message: string;
  fee: number;
  solChange: number; // Net SOL change for the tracked wallet in this TX
  transactionType: string;
  aggregatedTokenTransfers: { mint: string, amount: string, action: string, decimals: number }[];
  // PnL specific fields, populated if a sale with PnL occurs
  pnlDetails?: {
    mint: string;
    pnlInSol: number;
    costBasisInSol: number;
    proceedsInSol: number;
    amountSold: number; // Keep as number for consistency
    tokenSymbol: string;
    decimals: number;
  };
  // Acquisition details for direct SOL buys
  acquisitionDetails?: {
    mint: string;
    amountAcquired: number;
    solCostPerUnit: number;
    totalSolCost: number;
    tokenSymbol: string;
    decimals: number;
  };
}

function parseTransaction(tx: any): ParsedTransactionData | null {
  try {
    const timestamp = new Date(tx.block_time / 1000).toLocaleString();
    const signature = tx.raw_transaction.transaction.signatures[0];
    const rawTx = tx.raw_transaction;
    
    const fee = rawTx.meta.fee / 1_000_000_000; 
    
    const walletIndex = rawTx.transaction.message.accountKeys.findIndex(
      (key: string) => key === addressToTrack
    );
    
    let solChange = 0;
    if (walletIndex !== -1) {
      const preBal = rawTx.meta.preBalances[walletIndex] / 1_000_000_000;
      const postBal = rawTx.meta.postBalances[walletIndex] / 1_000_000_000;
      solChange = postBal - preBal;
    }

    const netTokenChanges = new Map<string, { change: number, decimals: number }>();
    (rawTx.meta.preTokenBalances || []).forEach((balance: any) => {
        if (balance.owner === addressToTrack && balance.uiTokenAmount?.uiAmountString && typeof balance.uiTokenAmount.decimals === 'number') {
            const amount = parseFloat(balance.uiTokenAmount.uiAmountString);
            const current = netTokenChanges.get(balance.mint) || { change: 0, decimals: balance.uiTokenAmount.decimals };
            current.change -= amount;
            current.decimals = balance.uiTokenAmount.decimals;
            netTokenChanges.set(balance.mint, current);
        }
    });
    (rawTx.meta.postTokenBalances || []).forEach((balance: any) => {
        if (balance.owner === addressToTrack && balance.uiTokenAmount?.uiAmountString && typeof balance.uiTokenAmount.decimals === 'number') {
            const amount = parseFloat(balance.uiTokenAmount.uiAmountString);
            const current = netTokenChanges.get(balance.mint) || { change: 0, decimals: balance.uiTokenAmount.decimals };
            current.change += amount;
            current.decimals = balance.uiTokenAmount.decimals;
            netTokenChanges.set(balance.mint, current);
        }
    });

    const aggregatedTokenTransfers: { mint: string, amount: string, action: string, decimals: number }[] = [];
    netTokenChanges.forEach((data, mint) => {
        if (Math.abs(data.change) > 1e-9) { 
            aggregatedTokenTransfers.push({
                mint: mint,
                amount: Math.abs(data.change).toFixed(data.decimals),
                action: data.change > 0 ? "Received" : "Sent",
                decimals: data.decimals
            });
        }
    });
      
    const logMessages = rawTx.meta.logMessages || [];
    let transactionType = "Unknown";
    for (const log of logMessages) {
      if (log.includes("Instruction: Sell")) { transactionType = "Token Sale"; break; }
      else if (log.includes("Instruction: Buy")) { transactionType = "Token Purchase"; break; }
      else if (log.includes("Instruction: Swap")) { transactionType = "Token Swap"; break; }
      else if (log.includes("Instruction: Transfer") && aggregatedTokenTransfers.length > 0) { transactionType = "Token Transfer"; break; }
      else if (log.includes("Instruction: Transfer")) { transactionType = "SOL Transfer"; break; }
    }
      
    let message = `📊 *${transactionType}* at ${timestamp}\n`;
    if (aggregatedTokenTransfers.length > 0) {
      aggregatedTokenTransfers.forEach(transfer => {
        const tokenSymbolDisplay = tokenCache[transfer.mint] || transfer.mint;
        message += `${transfer.action} ${transfer.amount} ${tokenSymbolDisplay}\n`;
      });
    }
    if (walletIndex !== -1 && Math.abs(solChange) > 0.000000001) { // Check if solChange is significant
      const solChangeFormatted = solChange.toFixed(9); // Show more precision for SOL
      message += `SOL Change: ${solChange > 0 ? '+' : ''}${solChangeFormatted}\n`;
    }
    message += `Fee: ${fee.toFixed(9)} SOL\n`; // Show more precision for SOL fees
    message += `TX: https://solscan.io/tx/${signature}`;
      
    if (walletIndex === -1 && aggregatedTokenTransfers.length === 0) {
        // If the tracked address is not involved and no token transfers for it, this tx might not be relevant to it.
        // However, the API returned it for the address, so it's likely an interaction (e.g., program interaction)
        // We'll still log it but with a generic message if no specific actions for the tracked wallet.
         console.log(`Transaction ${signature} does not directly involve ${addressToTrack} in balances or known token movements.`);
         // Keep the generic message if nothing specific was found for the address.
         if (transactionType === "Unknown") {
             message = `Interaction detected for ${addressToTrack} at ${timestamp}\nTX: https://solscan.io/tx/${signature}\nFee: ${fee.toFixed(9)} SOL`;
         }
    }
    
    return { message, fee, solChange, transactionType, aggregatedTokenTransfers };

  } catch (error) {
    console.error("Error parsing transaction:", error);
    // Return null or a structure indicating error to prevent further processing
    return null; 
  }
}

async function saveTransactionData(
    database: Database, 
    tx: any, // The raw transaction object from Dune
    parsedData: ParsedTransactionData
) {
  const signature = tx.raw_transaction.transaction.signatures[0];
  const blockTime = tx.block_time; // Store as is, it's a large number (microseconds)
  const rawDataJson = JSON.stringify(tx);

  const insertTxQuery = database.query(
    `INSERT INTO transactions (signature, block_slot, block_time, address_tracked, fee_sol, sol_change_sol, transaction_type, parsed_message, raw_data_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`
  );
  insertTxQuery.run(
    signature,
    tx.block_slot,
    blockTime,
    addressToTrack,
    parsedData.fee,
    parsedData.solChange,
    parsedData.transactionType,
    parsedData.message,
    rawDataJson
  );

  const insertTokenMovementQuery = database.query(
    `INSERT INTO token_movements (transaction_signature, mint, amount_ui, action, decimals)
     VALUES (?, ?, ?, ?, ?);`
  );
  parsedData.aggregatedTokenTransfers.forEach(tm => {
    insertTokenMovementQuery.run(
      signature,
      tm.mint,
      tm.amount,
      tm.action,
      tm.decimals
    );
  });
  console.log(`Saved transaction ${signature} to DB.`);
}

async function sendTransactionNotification(bot: Bot, tx: any): Promise<ParsedTransactionData | null> {
  const parsedData = parseTransaction(tx);
  if (!parsedData) {
    console.error(`Failed to parse transaction, skipping notification and DB save for signature: ${tx.raw_transaction.transaction.signatures[0]}`);
    return null;
  }
  
  try {
    await bot.api.sendMessage({
      chat_id: -4642723252, // Replace with your chat ID or make it configurable
      text: parsedData.message,
      parse_mode: "Markdown"
    });
    console.log(`Sent notification for transaction: ${tx.raw_transaction.transaction.signatures[0]}`);
    return parsedData; // Return parsed data for DB saving
  } catch (error) {
    console.error("Error sending notification:", error);
    return null; // Indicate failure
  }
}

let interval: NodeJS.Timeout | null = null;
const bot = new Bot(Bun.env.BOT_TOKEN as string)
    .command("start", async (context) => {
        console.log('room ID', context.chatId)
        context.send("Wallet tracker starting...")

        lastProcessedBlockSlot = getLastProcessedBlockSlotFromDB(db, addressToTrack);
        console.log(`Retrieved lastProcessedBlockSlot from DB: ${lastProcessedBlockSlot}`);

        if (lastProcessedBlockSlot === 0) {
          context.send("No previous block slot found in DB. Fetching latest transaction to initialize...");
          try {
            const response = await fetch(`https://api.sim.dune.com/beta/svm/transactions/${addressToTrack}?limit=1`, options);
            const data = await response.json();
            if (data.transactions?.length > 0) {
              lastProcessedBlockSlot = data.transactions[0].block_slot;
              saveLastProcessedBlockSlotToDB(db, addressToTrack, lastProcessedBlockSlot);
              context.send(`Initialized. Tracking will start from block slot: ${lastProcessedBlockSlot}`);
            } else {
              context.send("Could not fetch initial transaction. Please try starting again later.");
              return;
            }
          } catch (err) {
            console.error("Error initializing last block slot:", err);
            context.send("Error initializing. Please check logs.");
            return;
          }
        } else {
            context.send(`Resuming from block slot: ${lastProcessedBlockSlot}. I'll notify you of new transactions.`);
        }
        
        if (interval) clearInterval(interval); // Clear existing interval if any

        interval = setInterval(async () => {
            try {
                // Fetch more transactions in case many were missed. Adjust limit as needed.
                const response = await fetch(`https://api.sim.dune.com/beta/svm/transactions/${addressToTrack}?limit=50`, options);
                const data = await response.json();
                
                if (data.transactions?.length > 0) {
                    const newTransactions = data.transactions.filter(
                      (tx: any) => tx.block_slot > lastProcessedBlockSlot
                    );
                    
                    if (newTransactions.length > 0) {
                      console.log(`Found ${newTransactions.length} new transactions to process.`);
                      const sortedTransactions = newTransactions.sort(
                        (a: any, b: any) => a.block_slot - b.block_slot
                      );
                      
                      for (const tx of sortedTransactions) {
                        // Check DB first to prevent reprocessing due to race conditions or API inconsistencies
                        const checkTxQuery = db.query("SELECT signature FROM transactions WHERE signature = ?;");
                        if (checkTxQuery.get(tx.raw_transaction.transaction.signatures[0])) {
                            console.log(`Transaction ${tx.raw_transaction.transaction.signatures[0]} already in DB, skipping.`);
                            // Ensure lastProcessedBlockSlot is at least this tx's slot
                            if (tx.block_slot > lastProcessedBlockSlot) {
                                lastProcessedBlockSlot = tx.block_slot;
                                saveLastProcessedBlockSlotToDB(db, addressToTrack, lastProcessedBlockSlot);
                            }
                            continue;
                        }

                        const parsedData = await sendTransactionNotification(bot, tx);
                        if (parsedData) {
                           await saveTransactionData(db, tx, parsedData);
                           lastProcessedBlockSlot = tx.block_slot;
                           lastTransactionId = tx.raw_transaction.transaction.signatures[0];
                           saveLastProcessedBlockSlotToDB(db, addressToTrack, lastProcessedBlockSlot);
                        } else {
                            // If parsing/sending failed, decide if we should advance block slot or retry.
                            // For now, we'll advance to avoid getting stuck, but log the issue.
                            console.error(`Skipping DB save for failed tx ${tx.raw_transaction.transaction.signatures[0]}, but advancing block slot to ${tx.block_slot} to prevent getting stuck.`);
                            if (tx.block_slot > lastProcessedBlockSlot) { // Only update if it's newer
                                lastProcessedBlockSlot = tx.block_slot;
                                saveLastProcessedBlockSlotToDB(db, addressToTrack, lastProcessedBlockSlot);
                            }
                        }
                      }
                    }
                }
            } catch (err) {
                console.error("Error fetching transactions:", err);
            }
        }, timeout);
    })
    .command("stop", (context) => {
        if (interval) {
            clearInterval(interval);
            interval = null;
            context.send("Wallet tracker stopped!")
            console.log("Wallet tracker stopped by command.");
        } else {
            context.send("Wallet tracker is not currently running.");
        }
    })
    .command("reset", async (context) => {
        context.send("Resetting tracker...");
        if (interval) {
            clearInterval(interval);
            interval = null;
        }
        
        try {
            const response = await fetch(`https://api.sim.dune.com/beta/svm/transactions/${addressToTrack}?limit=1`, options);
            const data = await response.json();
            
            if (data.transactions?.length > 0) {
                lastProcessedBlockSlot = data.transactions[0].block_slot;
                lastTransactionId = data.transactions[0].raw_transaction.transaction.signatures[0];
                saveLastProcessedBlockSlotToDB(db, addressToTrack, lastProcessedBlockSlot);
                context.send(`Reset successful! Tracking will now start from block slot: ${lastProcessedBlockSlot}. Use /start to begin.`);
                console.log(`Reset to last processed block slot: ${lastProcessedBlockSlot}`);
            } else {
                // If no transactions found, perhaps set to 0 or keep current? For now, set to 0.
                lastProcessedBlockSlot = 0;
                lastTransactionId = null;
                saveLastProcessedBlockSlotToDB(db, addressToTrack, lastProcessedBlockSlot); // Save 0 to indicate a full reset
                context.send("Reset successful, but no transactions found to initialize from. Will start from scratch on next /start.");
            }
        } catch (err) {
            console.error("Error resetting last block slot:", err);
            context.send("Failed to reset block slot due to API error. Current block slot remains unchanged in DB.");
        }
    })
    .command("status", (context) => {
        const dbSlot = getLastProcessedBlockSlotFromDB(db, addressToTrack);
        context.send(
            `🔍 Wallet Tracker Status:\n` +
            `- Tracking Address: ${addressToTrack}\n` +
            `- Interval Active: ${interval !== null ? 'Yes' : 'No'}\n` +
            `- Current In-Memory Block Slot: ${lastProcessedBlockSlot}\n` +
            `- Last Block Slot in DB: ${dbSlot}\n` +
            `- Last Processed TX ID (In-Memory): ${lastTransactionId ? lastTransactionId.slice(0, 8) + '...' : 'None'}`
        );
    })
    .onStart(() => {
      console.log("Bot started and connected to Telegram.");
      // Initial load of lastProcessedBlockSlot for the main variable
      lastProcessedBlockSlot = getLastProcessedBlockSlotFromDB(db, addressToTrack);
      console.log(`Initial lastProcessedBlockSlot from DB on bot start-up: ${lastProcessedBlockSlot}`);
    });

bot.start();