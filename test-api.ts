import { fetchLatestTransactions } from "./src/solana/duneApi";

async function testAPI() {
    console.log("Testing Dune API...");
    
    const testAddress = "8rvAsDKeAcEjEkiZMug9k8v1y8mW6gQQiMobd89Uy7qR";
    console.log(`Fetching transactions for address: ${testAddress}`);
    
    try {
        const transactions = await fetchLatestTransactions(testAddress, 5);
        console.log(`Found ${transactions.length} transactions`);
        
        if (transactions.length > 0) {
            console.log("\nFirst transaction:");
            console.log(`- Signature: ${transactions[0].raw_transaction.transaction.signatures[0]}`);
            console.log(`- Block Slot: ${transactions[0].block_slot}`);
            console.log(`- Block Time: ${new Date(transactions[0].block_time / 1000).toLocaleString()}`);
        } else {
            console.log("No transactions found for this address");
        }
    } catch (error) {
        console.error("Error fetching transactions:", error);
    }
}

testAPI(); 