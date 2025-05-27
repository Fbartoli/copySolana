import { DUNE_API_OPTIONS, API_TIMEOUT } from "../config";
import type { DuneApiResponse, DuneTransaction } from "../types";

export async function fetchLatestTransactions(address: string, limit: number = 1): Promise<DuneTransaction[]> {
    const url = `https://api.sim.dune.com/beta/svm/transactions/${address}?limit=${limit}`;
    try {
        const response = await fetch(url, {
            ...DUNE_API_OPTIONS,
            signal: AbortSignal.timeout(API_TIMEOUT) // Add timeout to the fetch call
        });
        if (!response.ok) {
            console.error(`Dune API error! Status: ${response.status}, Body: ${await response.text()}`);
            return [];
        }
        const data = await response.json() as DuneApiResponse;
        return data.transactions || [];
    } catch (err) {
        if (err instanceof Error && err.name === 'TimeoutError') {
            console.error(`Dune API request timed out after ${API_TIMEOUT}ms for address: ${address}`);
        } else {
            console.error(`Error fetching transactions from Dune API for address ${address}:`, err);
        }
        return [];
    }
}

export async function fetchInitialTransactionsToDetermineLastSlot(trackedAddress: string): Promise<DuneTransaction | null> {
    // Fetch a larger number initially in case of many transactions quickly
    // The user had 100, but if the goal is just the *latest single slot* for init,
    // a smaller number like 10-20 might be safer if the API is slow with 100.
    // However, sticking to user's intent if they want to get an older slot as baseline.
    // For now, let's use a moderate number like 20 for stability, then user can adjust config.
    // The specific logic of which transaction to use (e.g., transactions[99]) is handled by the caller.
    const initialFetchLimit = 1; // As per user's last change in original index.ts
    console.log(`Fetching initial ${initialFetchLimit} transactions to determine starting block slot for ${trackedAddress}...`)
    const transactions = await fetchLatestTransactions(trackedAddress, initialFetchLimit);
    if (transactions.length > 0) {
        // The original logic was data.transactions[99].block_slot.
        // This implies wanting the OLDEST of the 100 most recent if 100 are returned.
        // If fewer than 100 are returned, transactions[transactions.length - 1] would be the oldest.
        // If the API returns newest first (typical), transactions[0] is newest.
        // Let's return the last one as per the user's edit to index.ts (data.transactions[99])
        // This means if transactions.length is 100, it returns transactions[99]
        // if transactions.length is 50, it returns transactions[49]
        // if transactions.length is 1, it returns transactions[0]
        return transactions[transactions.length -1]; 
    }
    return null;
} 