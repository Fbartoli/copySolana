import type { Database } from "bun:sqlite";
import type { ParsedTransactionResult, DuneTransaction, TokenAcquisitionRow, TokenDisposalPnlRow, TransactionRow } from "../types";
import { ADDRESS_TO_TRACK } from "../config"; // Import addressToTrack if it's globally used for saving

export function saveParsedTransactionData(
    database: Database, 
    rawTx: DuneTransaction, // The raw transaction object from Dune API
    parsedData: ParsedTransactionResult
) {
  const signature = rawTx.raw_transaction.transaction.signatures[0];
  const blockTime = rawTx.block_time;
  const rawDataJson = JSON.stringify(rawTx);

  database.transaction(() => {
    const insertTxQuery = database.query(
      `INSERT OR IGNORE INTO transactions (signature, block_slot, block_time, address_tracked, fee_sol, sol_change_sol, transaction_type, parsed_message, raw_data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`
    );
    insertTxQuery.run(
      signature,
      rawTx.block_slot,
      blockTime,
      ADDRESS_TO_TRACK, // Use imported constant
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

    if (parsedData.acquisitionDetails) {
      const ad = parsedData.acquisitionDetails as NonNullable<ParsedTransactionResult['acquisitionDetails']>; 
      const insertAcquisitionQuery = database.query(
        `INSERT INTO token_acquisitions (transaction_signature, mint, block_time, amount_acquired, sol_cost_per_unit, total_sol_cost, amount_remaining)
         VALUES (?, ?, ?, ?, ?, ?, ?);`
      );
      insertAcquisitionQuery.run(
        signature,
        ad.mint,
        blockTime, 
        ad.amountAcquired,
        ad.solCostPerUnit,
        ad.totalSolCost,
        ad.amountAcquired 
      );
    }

    if (parsedData.pnlDetails) {
      const pd = parsedData.pnlDetails as NonNullable<ParsedTransactionResult['pnlDetails']>; 
      const insertDisposalQuery = database.query(
        `INSERT INTO token_disposals_pnl (transaction_signature, mint, block_time, amount_sold, sol_proceeds_per_unit, total_sol_proceeds, cost_of_goods_sold_sol, realized_pnl_sol)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`
      );
      insertDisposalQuery.run(
        signature,
        pd.mint,
        blockTime, 
        pd.amountSold,
        (pd.amountSold === 0 ? 0 : pd.proceedsInSol / pd.amountSold), // Avoid division by zero
        pd.proceedsInSol,
        pd.costBasisInSol,
        pd.pnlInSol
      );

      let amountToDeductFromFifo = pd.amountSold;
      const getAcquisitionsForUpdateQuery = database.query<
        { id: number; amount_remaining: number }, 
        [string]
      >(
        "SELECT id, amount_remaining FROM token_acquisitions WHERE mint = ? AND amount_remaining > 0 ORDER BY block_time ASC;"
      );
      const acquisitionsToUpdate = getAcquisitionsForUpdateQuery.all(pd.mint);

      const updateAcquisitionAmountQuery = database.query(
        "UPDATE token_acquisitions SET amount_remaining = ? WHERE id = ?;"
      );

      for (const acq of acquisitionsToUpdate) {
        if (amountToDeductFromFifo <= 1e-9) break; 
        const deduction = Math.min(acq.amount_remaining, amountToDeductFromFifo);
        const newRemaining = acq.amount_remaining - deduction;
        updateAcquisitionAmountQuery.run(newRemaining, acq.id);
        amountToDeductFromFifo -= deduction;
      }
      if (amountToDeductFromFifo > 1e-9) {
          console.warn(`PnL Save: Could not fully update acquisition amounts for sale of ${pd.mint}. Remaining to deduct: ${amountToDeductFromFifo}`);
      }
    }
  }); 

  console.log(`Saved transaction ${signature} and related PnL/Acquisition data to DB.`);
}

export function getTransactionBySignature(database: Database, signature: string): TransactionRow | null {
    const query = database.query<TransactionRow, [string]>("SELECT * FROM transactions WHERE signature = ?;");
    return query.get(signature) || null;
}

export function getTotalRealizedPnL(database: Database): { total_pnl: number; disposal_count: number } {
    const query = database.query<{ total_pnl: number | null; disposal_count: number }, []>(
        "SELECT SUM(realized_pnl_sol) as total_pnl, COUNT(*) as disposal_count FROM token_disposals_pnl;"
    );
    const result = query.get();
    return {
        total_pnl: result?.total_pnl ?? 0,
        disposal_count: result?.disposal_count ?? 0,
    };
}

export function getAcquisitionsForFifo(database: Database, mint: string): TokenAcquisitionRow[] {
    const query = database.query<
        TokenAcquisitionRow, 
        [string]
    >(
        "SELECT id, transaction_signature, mint, block_time, amount_acquired, sol_cost_per_unit, total_sol_cost, amount_remaining FROM token_acquisitions WHERE mint = ? AND amount_remaining > 0 ORDER BY block_time ASC;"
    );
    return query.all(mint);
} 