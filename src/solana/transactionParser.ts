import type { Database } from "bun:sqlite";
import type { DuneTransaction, ParsedTransactionResult, AcquisitionDetails, PnlDetails } from "../types";
import { getTokenSymbol, fetchTokenMetadata } from "../utils/tokenCache";
import { getAcquisitionsForFifo } from "../db/transactionQueries"; // Import for FIFO logic

export function parseDuneTransaction(
    tx: DuneTransaction,
    database: Database, // For PnL calculations
    user_chat_id: string, // New: For scoping FIFO lookups
    tracked_solana_address: string // New: The specific address this transaction is being parsed for
): ParsedTransactionResult | null {
  try {
    const signature = tx.raw_transaction.transaction.signatures[0];
    const blockSlot = tx.block_slot;
    const blockTime = tx.block_time;
    const rawTx = tx.raw_transaction;
    
    const fee = rawTx.meta.fee / 1_000_000_000; 
    
    const walletIndex = rawTx.transaction.message.accountKeys.findIndex(
      (key: string) => key === tracked_solana_address
    );
    
    let solChange = 0;
    if (walletIndex !== -1) {
      const preBal = rawTx.meta.preBalances[walletIndex] / 1_000_000_000;
      const postBal = rawTx.meta.postBalances[walletIndex] / 1_000_000_000;
      solChange = postBal - preBal; 
    }

    const netTokenChanges = new Map<string, { change: number, decimals: number }>();
    (rawTx.meta.preTokenBalances || []).forEach((balance) => {
        if (balance.owner === tracked_solana_address && balance.uiTokenAmount?.uiAmountString && typeof balance.uiTokenAmount.decimals === 'number') {
            const amount = parseFloat(balance.uiTokenAmount.uiAmountString);
            const current = netTokenChanges.get(balance.mint) || { change: 0, decimals: balance.uiTokenAmount.decimals };
            current.change -= amount;
            current.decimals = balance.uiTokenAmount.decimals;
            netTokenChanges.set(balance.mint, current);
        }
    });
    (rawTx.meta.postTokenBalances || []).forEach((balance) => {
        if (balance.owner === tracked_solana_address && balance.uiTokenAmount?.uiAmountString && typeof balance.uiTokenAmount.decimals === 'number') {
            const amount = parseFloat(balance.uiTokenAmount.uiAmountString);
            const current = netTokenChanges.get(balance.mint) || { change: 0, decimals: balance.uiTokenAmount.decimals };
            current.change += amount;
            current.decimals = balance.uiTokenAmount.decimals;
            netTokenChanges.set(balance.mint, current);
        }
    });

    const aggregatedTokenTransfers: ParsedTransactionResult['aggregatedTokenTransfers'] = [];
    let pnlDetails: PnlDetails | undefined = undefined;
    let acquisitionDetails: AcquisitionDetails | undefined = undefined;

    // Collect all mint addresses for metadata preloading
    const mintAddresses = Array.from(netTokenChanges.keys());
    
    // Preload token metadata in background (don't wait for it)
    if (mintAddresses.length > 0) {
        fetchTokenMetadata(mintAddresses[0]).catch(() => null); // Start fetching for the first token
    }

    // Track multiple acquisitions and disposals for complex transactions
    const multipleAcquisitions: AcquisitionDetails[] = [];
    const multipleDisposals: PnlDetails[] = [];

    netTokenChanges.forEach((data, mint) => {
        if (Math.abs(data.change) > 1e-9) { 
            const numericAmount = Math.abs(data.change);
            const action = data.change > 0 ? "Received" : "Sent";
            aggregatedTokenTransfers.push({
                mint: mint,
                amount: numericAmount.toFixed(data.decimals),
                action: action,
                decimals: data.decimals
            });

            const tokenSymbol = getTokenSymbol(mint);
            
            // More flexible acquisition detection
            if (action === "Received" && solChange < -1e-6) { // Lowered threshold
                const amountAcquired = numericAmount;
                // For complex transactions, allocate SOL cost proportionally
                const totalTokenValue = Array.from(netTokenChanges.values())
                    .filter(change => change.change > 0)
                    .reduce((sum, change) => sum + Math.abs(change.change), 0);
                
                const proportionalSolCost = totalTokenValue > 0 ? 
                    (Math.abs(solChange) * (numericAmount / totalTokenValue)) : 
                    Math.abs(solChange);
                
                const acquisitionDetail: AcquisitionDetails = {
                    mint: mint,
                    amountAcquired: amountAcquired,
                    solCostPerUnit: proportionalSolCost / amountAcquired,
                    totalSolCost: proportionalSolCost,
                    tokenSymbol: tokenSymbol,
                    decimals: data.decimals
                };
                
                multipleAcquisitions.push(acquisitionDetail);
                
                // Set main acquisition for single token transactions
                if (netTokenChanges.size === 1) {
                    acquisitionDetails = acquisitionDetail;
                }
            } 
            // More flexible disposal detection
            else if (action === "Sent" && solChange > 1e-6) { // Lowered threshold
                const amountSold = numericAmount;
                
                // For complex transactions, allocate SOL proceeds proportionally
                const totalTokenValue = Array.from(netTokenChanges.values())
                    .filter(change => change.change < 0)
                    .reduce((sum, change) => sum + Math.abs(change.change), 0);
                
                const proportionalSolProceeds = totalTokenValue > 0 ? 
                    (solChange * (numericAmount / totalTokenValue)) : 
                    solChange;
                
                const acquisitions = getAcquisitionsForFifo(database, user_chat_id, tracked_solana_address, mint);
                let costOfGoodsSold = 0;
                let amountToCoverByFifo = amountSold;

                for (const acq of acquisitions) {
                    if (amountToCoverByFifo <= 1e-9) break;
                    const amountFromThisAcq = Math.min(acq.amount_remaining, amountToCoverByFifo);
                    costOfGoodsSold += amountFromThisAcq * acq.sol_cost_per_unit;
                    amountToCoverByFifo -= amountFromThisAcq;
                }
                
                if (amountToCoverByFifo > 1e-9) {
                    console.warn(`PnL Warn: Could not find sufficient acquisition history for ${amountSold.toFixed(data.decimals)} of ${tokenSymbol} (Mint: ${mint}) on wallet ${tracked_solana_address}. PnL might be inaccurate. Missing: ${amountToCoverByFifo.toFixed(data.decimals)}`);
                }

                const realizedPnl = proportionalSolProceeds - costOfGoodsSold;
                const pnlDetail: PnlDetails = {
                    mint: mint,
                    pnlInSol: realizedPnl,
                    costBasisInSol: costOfGoodsSold,
                    proceedsInSol: proportionalSolProceeds,
                    amountSold: amountSold, 
                    tokenSymbol: tokenSymbol,
                    decimals: data.decimals
                };
                
                multipleDisposals.push(pnlDetail);
                
                // Set main disposal for single token transactions
                if (netTokenChanges.size === 1) {
                    pnlDetails = pnlDetail;
                }
            }
        }
    });

    // If we have multiple acquisitions/disposals, use the largest one as the primary
    if (!acquisitionDetails && multipleAcquisitions.length > 0) {
        acquisitionDetails = multipleAcquisitions.reduce((largest, current) => 
            current.totalSolCost > largest.totalSolCost ? current : largest
        );
    }
    
    if (!pnlDetails && multipleDisposals.length > 0) {
        pnlDetails = multipleDisposals.reduce((largest, current) => 
            Math.abs(current.proceedsInSol) > Math.abs(largest.proceedsInSol) ? current : largest
        );
    }

    const logMessages = rawTx.meta.logMessages || [];
    let transactionType = "Unknown";
    if (acquisitionDetails || multipleAcquisitions.length > 0) transactionType = "Token Purchase (SOL)";
    else if (pnlDetails || multipleDisposals.length > 0) transactionType = "Token Sale (SOL)";
    else {
        for (const log of logMessages) {
          if (log.includes("Instruction: Sell")) { transactionType = "Token Sale"; break; }
          else if (log.includes("Instruction: Buy")) { transactionType = "Token Purchase"; break; }
          else if (log.includes("Instruction: Swap")) { transactionType = "Token Swap"; break; }
          else if (log.includes("Instruction: Transfer") && aggregatedTokenTransfers.length > 0) { transactionType = "Token Transfer"; break; }
          else if (log.includes("Instruction: Transfer")) { transactionType = "SOL Transfer"; break; }
        }
    }
    
    const timestampLocale = new Date(blockTime / 1000).toLocaleString();
    let message = `📊 *${transactionType}* at ${timestampLocale}\n`;
    if (aggregatedTokenTransfers.length > 0) {
      aggregatedTokenTransfers.forEach(transfer => {
        const tokenSymbolDisplay = getTokenSymbol(transfer.mint);
        message += `${transfer.action} ${transfer.amount} ${tokenSymbolDisplay}\n`;
      });
    }

    if (pnlDetails) {
        const pd = pnlDetails as NonNullable<PnlDetails>; 
        message += `📈 Sold ${pd.amountSold.toFixed(pd.decimals)} ${pd.tokenSymbol} for ${pd.proceedsInSol.toFixed(4)} SOL\n`;
        message += `   Cost Basis: ${pd.costBasisInSol.toFixed(4)} SOL\n`;
        message += `   PnL: ${pd.pnlInSol.toFixed(4)} SOL (${pd.pnlInSol >= 0 ? 'Profit' : 'Loss'})\n`;
    }
    if (acquisitionDetails) {
        const ad = acquisitionDetails as NonNullable<AcquisitionDetails>; 
        message += `🛒 Bought ${ad.amountAcquired.toFixed(ad.decimals)} ${ad.tokenSymbol} for ${ad.totalSolCost.toFixed(4)} SOL\n`;
        message += `   Price: ${(ad.solCostPerUnit).toFixed(6)} SOL per ${ad.tokenSymbol}\n`;
    }

    if (walletIndex !== -1 && Math.abs(solChange) > 1e-9) {
      if (!pnlDetails && !acquisitionDetails) {
         const solChangeFormatted = solChange.toFixed(9);
         message += `SOL Change: ${solChange > 0 ? '+' : ''}${solChangeFormatted}\n`;
      }
    }
    message += `Fee: ${fee.toFixed(9)} SOL\n`;
    message += `TX: https://solscan.io/tx/${signature}`;
      
    if (walletIndex === -1 && aggregatedTokenTransfers.length === 0 && !pnlDetails && !acquisitionDetails) {
         console.log(`Transaction ${signature} (Slot: ${blockSlot}) does not directly involve ${tracked_solana_address} in SOL/Token balances.`);
         if (transactionType === "Unknown") {
             message = `Interaction detected for ${tracked_solana_address} at ${timestampLocale}\nTX: https://solscan.io/tx/${signature}\nFee: ${fee.toFixed(9)} SOL`;
         }
    }
    
    const parsedResult: ParsedTransactionResult = {
        message,
        fee,
        solChange,
        transactionType,
        aggregatedTokenTransfers,
        pnlDetails,
        acquisitionDetails,
        rawTransaction: tx, // Pass the original tx for saving raw data
        signature,
        blockSlot,
        blockTime
    };

    return parsedResult;

  } catch (error) {
    console.error(`Error parsing transaction ${tx?.raw_transaction?.transaction?.signatures[0]}:`, error);
    return null; 
  }
} 