export interface TokenCache {
    [mintAddress: string]: string; // e.g., "So111..." : "SOL"
}

export interface AggregatedTokenTransfer {
    mint: string;
    amount: string; // Formatted string with decimals
    action: "Received" | "Sent";
    decimals: number;
}

export interface PnlDetails {
    mint: string;
    pnlInSol: number;
    costBasisInSol: number;
    proceedsInSol: number;
    amountSold: number;
    tokenSymbol: string;
    decimals: number;
}

export interface AcquisitionDetails {
    mint: string;
    amountAcquired: number;
    solCostPerUnit: number;
    totalSolCost: number;
    tokenSymbol: string;
    decimals: number;
}

// Data returned by the transaction parser
export interface ParsedTransactionResult {
    message: string;
    fee: number;
    solChange: number;
    transactionType: string;
    aggregatedTokenTransfers: AggregatedTokenTransfer[];
    pnlDetails?: PnlDetails;
    acquisitionDetails?: AcquisitionDetails;
    // Raw transaction data that was parsed
    rawTransaction: any; // Consider defining a more specific type for the raw TX if needed
    signature: string;
    blockSlot: number;
    blockTime: number;
}

// For database queries specifically, it's good to have types for rows
export interface AppMetaRow {
    meta_key: string;
    meta_value: string;
}

export interface TransactionRow {
    signature: string;
    block_slot: number;
    block_time: number;
    address_tracked: string;
    fee_sol: number;
    sol_change_sol: number;
    transaction_type: string;
    parsed_message: string;
    raw_data_json: string;
}

export interface TokenMovementRow {
    id?: number; // Optional as it's auto-incrementing on insert
    transaction_signature: string;
    mint: string;
    amount_ui: string;
    action: string;
    decimals: number;
}

export interface TokenAcquisitionRow {
    id?: number;
    transaction_signature: string;
    user_chat_id: string;
    address_tracked: string;
    mint: string;
    block_time: number;
    amount_acquired: number;
    sol_cost_per_unit: number;
    total_sol_cost: number;
    amount_remaining: number;
}

export interface TokenDisposalPnlRow {
    id?: number;
    transaction_signature: string;
    user_chat_id: string;
    address_tracked: string;
    mint: string;
    block_time: number;
    amount_sold: number;
    sol_proceeds_per_unit: number;
    total_sol_proceeds: number;
    cost_of_goods_sold_sol: number;
    realized_pnl_sol: number;
}

export interface PortfolioPositionRow {
    id?: number;
    user_chat_id: string;
    address_tracked: string;
    mint: string;
    current_balance: number;
    average_cost_basis: number;
    total_invested: number;
    last_updated: number;
}

export interface DuneTransaction {
    address: string; // The address that was queried, e.g., addressToTrack
    block_time: number; // Microseconds since epoch
    chain: string;
    block_slot: number;
    raw_transaction: {
        transaction: {
            message: {
                header: {
                    numReadonlySignedAccounts: number;
                    numReadonlyUnsignedAccounts: number;
                    numRequiredSignatures: number;
                };
                accountKeys: string[];
                recentBlockhash: string;
                instructions: any[]; // Can be more specific if needed
                addressTableLookups: any[] | null; 
            };
            signatures: string[];
        };
        meta: {
            status: { err: any | null };
            fee: number; // in lamports
            preBalances: number[];
            postBalances: number[];
            innerInstructions?: any[];
            logMessages?: string[];
            preTokenBalances?: TokenBalanceMeta[];
            postTokenBalances?: TokenBalanceMeta[];
            rewards?: any[];
            loadedAddresses?: { readonly: string[], writable: string[] };
            returnData?: any | null;
            computeUnitsConsumed?: number;
            err?: any | null; 
        };
        version?: string | number;
    };
    // Sometimes the API wraps transactions in a "transactions" array
    // This type can be used for the items within that array.
}

export interface DuneApiResponse {
    transactions: DuneTransaction[];
    // Potentially other fields like cursor, etc.
}

export interface TokenBalanceMeta {
    accountIndex: number;
    mint: string;
    uiTokenAmount: {
        uiAmount: number | null;
        decimals: number;
        amount: string;
        uiAmountString: string;
    };
    owner: string;
    programId: string;
} 