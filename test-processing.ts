import { fetchLatestTransactions } from "./src/solana/duneApi";
import { parseDuneTransaction } from "./src/solana/transactionParser";
import { db, saveParsedTransactionData, getTransactionBySignature } from "./src/db";

async function testProcessing() {
    console.log("Testing transaction processing flow...\n");
    
    const testAddress = "8rvAsDKeAcEjEkiZMug9k8v1y8mW6gQQiMobd89Uy7qR";
    const testUserId = "1334939420";
    
    try {
        // Step 1: Fetch transactions
        console.log("1. Fetching transactions...");
        const transactions = await fetchLatestTransactions(testAddress, 5);
        console.log(`   Found ${transactions.length} transactions\n`);
        
        if (transactions.length === 0) {
            console.log("No transactions to process");
            return;
        }
        
        // Step 2: Process the first transaction
        const tx = transactions[0];
        const signature = tx.raw_transaction.transaction.signatures[0];
        console.log(`2. Processing transaction: ${signature}`);
        
        // Check if already exists
        const existingTx = getTransactionBySignature(db, signature);
        if (existingTx) {
            console.log(`   Transaction already exists in database\n`);
        } else {
            console.log(`   Transaction not in database, processing...\n`);
        }
        
        // Step 3: Parse transaction
        console.log("3. Parsing transaction...");
        const parsedData = parseDuneTransaction(tx, db, testUserId, testAddress);
        
        if (!parsedData) {
            console.log("   Failed to parse transaction!");
            return;
        }
        
        console.log("   Parsed successfully!");
        console.log(`   Type: ${parsedData.transactionType}`);
        console.log(`   SOL Change: ${parsedData.solChange}`);
        console.log(`   Token Transfers: ${parsedData.aggregatedTokenTransfers.length}`);
        
        if (parsedData.acquisitionDetails) {
            console.log(`   Acquisition: ${parsedData.acquisitionDetails.amountAcquired} ${parsedData.acquisitionDetails.tokenSymbol} for ${parsedData.acquisitionDetails.totalSolCost} SOL`);
        }
        
        if (parsedData.pnlDetails) {
            console.log(`   Disposal: ${parsedData.pnlDetails.amountSold} ${parsedData.pnlDetails.tokenSymbol} for ${parsedData.pnlDetails.proceedsInSol} SOL (PnL: ${parsedData.pnlDetails.pnlInSol} SOL)`);
        }
        
        console.log("\n4. Message that would be sent:");
        console.log(parsedData.message);
        
        // Step 4: Save to database (if not exists)
        if (!existingTx) {
            console.log("\n5. Saving to database...");
            saveParsedTransactionData(db, tx, parsedData, testUserId, testAddress);
            console.log("   Saved successfully!");
            
            // Wait a bit before checking
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Verify it was saved
            const savedTx = getTransactionBySignature(db, signature);
            if (savedTx) {
                console.log("   Verified: Transaction now in database");
            } else {
                console.log("   ERROR: Transaction not found after saving!");
            }
        }
        
    } catch (error) {
        console.error("Error during processing:", error);
    }
    
    // Don't close the database immediately
    // db.close();
}

testProcessing(); 