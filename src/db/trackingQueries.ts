import type { Database } from "bun:sqlite";

export interface TrackedWalletEntry {
    user_chat_id: string;
    solana_address: string;
    alias: string | null;
}

export function addTrackedWalletDB(
    database: Database,
    user_chat_id: string,
    solana_address: string,
    alias?: string
): { success: boolean; message: string } {
    try {
        const query = database.query(
            `INSERT INTO tracked_wallets (user_chat_id, solana_address, alias)
             VALUES (?, ?, ?)
             ON CONFLICT(user_chat_id, solana_address) DO UPDATE SET alias = excluded.alias;`
        );
        query.run(user_chat_id, solana_address, alias || null);
        return { success: true, message: `Wallet ${solana_address}${alias ? ' (alias: ' + alias + ')' : ''} is now being tracked.` };
    } catch (error: any) {
        console.error("Error in addTrackedWalletDB:", error);
        return { success: false, message: `Failed to track wallet: ${error.message}` };
    }
}

export function removeTrackedWalletDB(
    database: Database,
    user_chat_id: string,
    address_or_alias: string
): { success: boolean; message: string } {
    try {
        const findQuery = database.query<{ solana_address: string }, [string, string, string]>(
            `SELECT solana_address FROM tracked_wallets WHERE user_chat_id = ? AND (solana_address = ? OR alias = ?);`
        );
        const walletToRemove = findQuery.get(user_chat_id, address_or_alias, address_or_alias);

        if (!walletToRemove) {
            return { success: false, message: `Wallet "${address_or_alias}" not found or not tracked by you.` };
        }

        const deleteQuery = database.query(
            `DELETE FROM tracked_wallets WHERE user_chat_id = ? AND solana_address = ?;`
        );
        deleteQuery.run(user_chat_id, walletToRemove.solana_address);
        return { success: true, message: `Wallet ${walletToRemove.solana_address} is no longer tracked.` };
    } catch (error: any) {
        console.error("Error in removeTrackedWalletDB:", error);
        return { success: false, message: `Failed to untrack wallet: ${error.message}` };
    }
}

export function listTrackedWalletsDB(
    database: Database,
    user_chat_id: string
): TrackedWalletEntry[] {
    try {
        const query = database.query<TrackedWalletEntry, [string]>(
            "SELECT user_chat_id, solana_address, alias FROM tracked_wallets WHERE user_chat_id = ?;"
        );
        return query.all(user_chat_id);
    } catch (error) {
        console.error("Error in listTrackedWalletsDB:", error);
        return [];
    }
}

export function getAllTrackedWalletsDB(
    database: Database
): TrackedWalletEntry[] {
    try {
        const query = database.query<TrackedWalletEntry, []>(
            "SELECT user_chat_id, solana_address, alias FROM tracked_wallets;"
        );
        return query.all();
    } catch (error) {
        console.error("Error in getAllTrackedWalletsDB:", error);
        return [];
    }
}

export async function findTrackedWalletByAddressOrAliasDB(
    database: Database,
    user_chat_id: string,
    address_or_alias: string
): Promise<TrackedWalletEntry | null> {
    try {
        const query = database.query<TrackedWalletEntry, [string, string, string]>(
            `SELECT user_chat_id, solana_address, alias 
             FROM tracked_wallets 
             WHERE user_chat_id = ? AND (solana_address = ? OR alias = ?);`
        );
        const result = query.get(user_chat_id, address_or_alias, address_or_alias);
        return result || null;
    } catch (error) {
        console.error("Error in findTrackedWalletByAddressOrAliasDB:", error);
        return null;
    }
} 