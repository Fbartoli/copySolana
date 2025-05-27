import type { Database } from "bun:sqlite";
import type { ParsedTransactionResult, DuneTransaction, TokenAcquisitionRow, TokenDisposalPnlRow, TransactionRow } from "../types";

export function saveParsedTransactionData(
    database: Database, 
    rawTx: DuneTransaction, // The raw transaction object from Dune API
    parsedData: ParsedTransactionResult,
    user_chat_id: string, // New parameter
    address_tracked: string // New parameter for the specific address this tx is related to for this user
) {
  const signature = rawTx.raw_transaction.transaction.signatures[0];
  const blockTime = rawTx.block_time;
  const rawDataJson = JSON.stringify(rawTx);

  const txn = database.transaction(() => {
    const insertTxQuery = database.query(
      `INSERT OR IGNORE INTO transactions (signature, block_slot, block_time, user_chat_id, address_tracked, fee_sol, sol_change_sol, transaction_type, parsed_message, raw_data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);` // Added user_chat_id
    );
    insertTxQuery.run(
      signature,
      rawTx.block_slot,
      blockTime,
      user_chat_id, // Pass user_chat_id
      address_tracked, // Pass address_tracked
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

    // Handle acquisitions (token purchases)
    if (parsedData.acquisitionDetails) {
      const ad = parsedData.acquisitionDetails as NonNullable<ParsedTransactionResult['acquisitionDetails']>; 
      const insertAcquisitionQuery = database.query(
        `INSERT INTO token_acquisitions (transaction_signature, user_chat_id, address_tracked, mint, block_time, amount_acquired, sol_cost_per_unit, total_sol_cost, amount_remaining)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);` // Added address_tracked
      );
      insertAcquisitionQuery.run(
        signature,
        user_chat_id, // Pass user_chat_id
        address_tracked, // CRITICAL FIX: Pass address_tracked for proper FIFO scoping
        ad.mint,
        blockTime,
        ad.amountAcquired,
        ad.solCostPerUnit,
        ad.totalSolCost,
        ad.amountAcquired
      );
      
      // Update portfolio position
      updatePortfolioPosition(database, user_chat_id, address_tracked, ad.mint, ad.amountAcquired, ad.totalSolCost, blockTime);
    }

    // Handle disposals (token sales)
    if (parsedData.pnlDetails) {
      const pd = parsedData.pnlDetails as NonNullable<ParsedTransactionResult['pnlDetails']>; 
      const insertDisposalQuery = database.query(
        `INSERT INTO token_disposals_pnl (transaction_signature, user_chat_id, address_tracked, mint, block_time, amount_sold, sol_proceeds_per_unit, total_sol_proceeds, cost_of_goods_sold_sol, realized_pnl_sol)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);` // Added address_tracked
      );
      insertDisposalQuery.run(
        signature,
        user_chat_id, // Pass user_chat_id
        address_tracked, // CRITICAL FIX: Pass address_tracked for proper FIFO scoping
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
        [string, string, string] // Added string for address_tracked
      >(
        "SELECT id, amount_remaining FROM token_acquisitions WHERE user_chat_id = ? AND address_tracked = ? AND mint = ? AND amount_remaining > 0 ORDER BY block_time ASC;" // Added address_tracked filter
      );
      const acquisitionsToUpdate = getAcquisitionsForUpdateQuery.all(user_chat_id, address_tracked, pd.mint); // Pass address_tracked

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
          console.warn(`PnL Save: Could not fully update acquisition amounts for sale of ${pd.mint} on ${address_tracked}. Remaining to deduct: ${amountToDeductFromFifo}`);
      }
      
      // Update portfolio position for sale
      updatePortfolioPosition(database, user_chat_id, address_tracked, pd.mint, -pd.amountSold, -pd.costBasisInSol, blockTime);
    }

    // ENHANCED: Handle token movements that don't have acquisition/disposal details
    // This ensures portfolio positions are updated even for complex transactions
    if (!parsedData.acquisitionDetails && !parsedData.pnlDetails && parsedData.aggregatedTokenTransfers.length > 0) {
      console.log(`Processing token movements without acquisition/disposal details for tx ${signature}`);
      
      // Estimate costs for token movements without formal acquisition details
      const totalSolChange = Math.abs(parsedData.solChange);
      const tokenReceived = parsedData.aggregatedTokenTransfers.filter(t => t.action === "Received");
      const tokenSent = parsedData.aggregatedTokenTransfers.filter(t => t.action === "Sent");
      
      // Handle token purchases (received tokens, lost SOL)
      if (tokenReceived.length > 0 && parsedData.solChange < -1e-6) {
        const totalTokensReceived = tokenReceived.reduce((sum, token) => sum + parseFloat(token.amount), 0);
        
        tokenReceived.forEach(transfer => {
          const amountReceived = parseFloat(transfer.amount);
          const proportionalCost = totalTokensReceived > 0 ? (totalSolChange * (amountReceived / totalTokensReceived)) : totalSolChange;
          const avgCostPerUnit = amountReceived > 0 ? proportionalCost / amountReceived : 0;
          
          // Create a basic acquisition record
          const insertBasicAcquisitionQuery = database.query(
            `INSERT INTO token_acquisitions (transaction_signature, user_chat_id, address_tracked, mint, block_time, amount_acquired, sol_cost_per_unit, total_sol_cost, amount_remaining)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`
          );
          insertBasicAcquisitionQuery.run(
            signature,
            user_chat_id,
            address_tracked,
            transfer.mint,
            blockTime,
            amountReceived,
            avgCostPerUnit,
            proportionalCost,
            amountReceived
          );
          
          // Update portfolio position
          updatePortfolioPosition(database, user_chat_id, address_tracked, transfer.mint, amountReceived, proportionalCost, blockTime);
          console.log(`Created basic acquisition for ${amountReceived} of ${transfer.mint} at ${avgCostPerUnit} SOL/token`);
        });
      }
      
      // Handle token sales (sent tokens, gained SOL)
      if (tokenSent.length > 0 && parsedData.solChange > 1e-6) {
        const totalTokensSent = tokenSent.reduce((sum, token) => sum + parseFloat(token.amount), 0);
        
        tokenSent.forEach(transfer => {
          const amountSent = parseFloat(transfer.amount);
          const proportionalProceeds = totalTokensSent > 0 ? (parsedData.solChange * (amountSent / totalTokensSent)) : parsedData.solChange;
          
          // Get cost basis from FIFO
          const acquisitions = getAcquisitionsForFifo(database, user_chat_id, address_tracked, transfer.mint);
          let costOfGoodsSold = 0;
          let amountToCoverByFifo = amountSent;

          for (const acq of acquisitions) {
            if (amountToCoverByFifo <= 1e-9) break;
            const amountFromThisAcq = Math.min(acq.amount_remaining, amountToCoverByFifo);
            costOfGoodsSold += amountFromThisAcq * acq.sol_cost_per_unit;
            amountToCoverByFifo -= amountFromThisAcq;
          }
          
          const realizedPnl = proportionalProceeds - costOfGoodsSold;
          
          // Create a basic disposal record
          const insertBasicDisposalQuery = database.query(
            `INSERT INTO token_disposals_pnl (transaction_signature, user_chat_id, address_tracked, mint, block_time, amount_sold, sol_proceeds_per_unit, total_sol_proceeds, cost_of_goods_sold_sol, realized_pnl_sol)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
          );
          insertBasicDisposalQuery.run(
            signature,
            user_chat_id,
            address_tracked,
            transfer.mint,
            blockTime,
            amountSent,
            amountSent > 0 ? proportionalProceeds / amountSent : 0,
            proportionalProceeds,
            costOfGoodsSold,
            realizedPnl
          );
          
          // Update FIFO records
          const getAcquisitionsForUpdateQuery = database.query<
            { id: number; amount_remaining: number },
            [string, string, string]
          >(
            "SELECT id, amount_remaining FROM token_acquisitions WHERE user_chat_id = ? AND address_tracked = ? AND mint = ? AND amount_remaining > 0 ORDER BY block_time ASC;"
          );
          const acquisitionsToUpdate = getAcquisitionsForUpdateQuery.all(user_chat_id, address_tracked, transfer.mint);
          
          const updateAcquisitionAmountQuery = database.query(
            "UPDATE token_acquisitions SET amount_remaining = ? WHERE id = ?;"
          );
          
          let remainingToDeduct = amountSent;
          for (const acq of acquisitionsToUpdate) {
            if (remainingToDeduct <= 1e-9) break;
            const deduction = Math.min(acq.amount_remaining, remainingToDeduct);
            const newRemaining = acq.amount_remaining - deduction;
            updateAcquisitionAmountQuery.run(newRemaining, acq.id);
            remainingToDeduct -= deduction;
          }
          
          // Update portfolio position
          updatePortfolioPosition(database, user_chat_id, address_tracked, transfer.mint, -amountSent, -costOfGoodsSold, blockTime);
          console.log(`Created basic disposal for ${amountSent} of ${transfer.mint} with PnL ${realizedPnl.toFixed(4)} SOL`);
        });
      }
    }
  }); 
  
  // Execute the transaction
  txn();

  console.log(`Saved transaction ${signature} and related PnL/Acquisition data to DB.`);
}

export function getTransactionBySignature(database: Database, signature: string): TransactionRow | null {
    const query = database.query<TransactionRow, [string]>("SELECT * FROM transactions WHERE signature = ?;");
    return query.get(signature) || null;
}

export function getTotalRealizedPnL(database: Database, user_chat_id: string, address_tracked?: string): { total_pnl: number; disposal_count: number } {
    if (address_tracked) {
        const query = database.query<{ total_pnl: number | null; disposal_count: number }, [string, string]>(
            "SELECT SUM(realized_pnl_sol) as total_pnl, COUNT(*) as disposal_count FROM token_disposals_pnl WHERE user_chat_id = ? AND address_tracked = ?;"
        );
        const result = query.get(user_chat_id, address_tracked);
        return {
            total_pnl: result?.total_pnl ?? 0,
            disposal_count: result?.disposal_count ?? 0,
        };
    } else {
        const query = database.query<{ total_pnl: number | null; disposal_count: number }, [string]>(
            "SELECT SUM(realized_pnl_sol) as total_pnl, COUNT(*) as disposal_count FROM token_disposals_pnl WHERE user_chat_id = ?;"
        );
        const result = query.get(user_chat_id);
        return {
            total_pnl: result?.total_pnl ?? 0,
            disposal_count: result?.disposal_count ?? 0,
        };
    }
}

export function getAcquisitionsForFifo(database: Database, user_chat_id: string, address_tracked: string, mint: string): TokenAcquisitionRow[] {
    const query = database.query<
        TokenAcquisitionRow,
        [string, string, string] // Added string for address_tracked
    >(
        "SELECT id, transaction_signature, user_chat_id, mint, block_time, amount_acquired, sol_cost_per_unit, total_sol_cost, amount_remaining FROM token_acquisitions WHERE user_chat_id = ? AND address_tracked = ? AND mint = ? AND amount_remaining > 0 ORDER BY block_time ASC;" // Added address_tracked filter
    );
    return query.all(user_chat_id, address_tracked, mint); // Pass address_tracked
}

// New function to update portfolio positions
export function updatePortfolioPosition(
    database: Database, 
    user_chat_id: string, 
    address_tracked: string, 
    mint: string, 
    amount_change: number, 
    sol_value_change: number,
    block_time: number
) {
    const getCurrentPositionQuery = database.query<
        { current_balance: number; average_cost_basis: number; total_invested: number },
        [string, string, string]
    >(
        "SELECT current_balance, average_cost_basis, total_invested FROM portfolio_positions WHERE user_chat_id = ? AND address_tracked = ? AND mint = ?;"
    );
    
    const currentPosition = getCurrentPositionQuery.get(user_chat_id, address_tracked, mint);
    
    let newBalance: number;
    let newAverageCostBasis: number;
    let newTotalInvested: number;
    
    if (currentPosition) {
        newBalance = currentPosition.current_balance + amount_change;
        
        if (amount_change > 0) {
            // Buying more tokens - update average cost basis
            const oldValue = currentPosition.current_balance * currentPosition.average_cost_basis;
            const newValue = oldValue + sol_value_change;
            newTotalInvested = currentPosition.total_invested + sol_value_change;
            newAverageCostBasis = newBalance > 0 ? newValue / newBalance : 0;
        } else {
            // Selling tokens - keep average cost basis the same
            newAverageCostBasis = currentPosition.average_cost_basis;
            newTotalInvested = currentPosition.total_invested + sol_value_change; // sol_value_change is negative for sales
        }
    } else {
        // New position
        newBalance = amount_change;
        newAverageCostBasis = amount_change > 0 ? sol_value_change / amount_change : 0;
        newTotalInvested = sol_value_change;
    }
    
    // If balance becomes zero or negative, remove the position
    if (newBalance <= 1e-9) {
        const deleteQuery = database.query(
            "DELETE FROM portfolio_positions WHERE user_chat_id = ? AND address_tracked = ? AND mint = ?;"
        );
        deleteQuery.run(user_chat_id, address_tracked, mint);
    } else {
        // Insert or update position
        const upsertQuery = database.query(
            `INSERT OR REPLACE INTO portfolio_positions 
             (user_chat_id, address_tracked, mint, current_balance, average_cost_basis, total_invested, last_updated)
             VALUES (?, ?, ?, ?, ?, ?, ?);`
        );
        upsertQuery.run(user_chat_id, address_tracked, mint, newBalance, newAverageCostBasis, newTotalInvested, block_time);
    }
}

// New function to get portfolio positions
export function getPortfolioPositions(database: Database, user_chat_id: string, address_tracked?: string) {
    if (address_tracked) {
        const query = database.query<
            { mint: string; address_tracked: string; current_balance: number; average_cost_basis: number; total_invested: number; last_updated: number },
            [string, string]
        >(
            "SELECT mint, address_tracked, current_balance, average_cost_basis, total_invested, last_updated FROM portfolio_positions WHERE user_chat_id = ? AND address_tracked = ? AND current_balance > 0;"
        );
        return query.all(user_chat_id, address_tracked);
    } else {
        const query = database.query<
            { mint: string; address_tracked: string; current_balance: number; average_cost_basis: number; total_invested: number; last_updated: number },
            [string]
        >(
            "SELECT mint, address_tracked, current_balance, average_cost_basis, total_invested, last_updated FROM portfolio_positions WHERE user_chat_id = ? AND current_balance > 0;"
        );
        return query.all(user_chat_id);
    }
}

// New function to get PnL breakdown by wallet
export function getPnlByWallet(database: Database, user_chat_id: string) {
    const query = database.query<
        { address_tracked: string; total_pnl: number | null; disposal_count: number },
        [string]
    >(
        `SELECT address_tracked, SUM(realized_pnl_sol) as total_pnl, COUNT(*) as disposal_count 
         FROM token_disposals_pnl 
         WHERE user_chat_id = ? 
         GROUP BY address_tracked
         ORDER BY total_pnl DESC;`
    );
    
    return query.all(user_chat_id).map(row => ({
        address_tracked: row.address_tracked,
        total_pnl: row.total_pnl ?? 0,
        disposal_count: row.disposal_count
    }));
} 