import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import type { ParsedTransactionResult, CopyTradingConfig, TradeExecution } from "../types";
import { getTokenSymbol } from "../utils/tokenCache";

export class TradeExecutor {
    private connection: Connection;
    private wallet: Keypair;
    private config: CopyTradingConfig;

    constructor(rpcUrl: string, privateKey: string, config: CopyTradingConfig) {
        this.connection = new Connection(rpcUrl, 'confirmed');
        this.wallet = Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
        this.config = config;
    }

    async executeCopyTrade(
        parsedTx: ParsedTransactionResult,
        originalWallet: string
    ): Promise<TradeExecution> {
        const execution: TradeExecution = {
            originalTx: parsedTx.signature,
            status: 'pending'
        };

        try {
            // Check if copy trading is enabled
            if (!this.config.enabled) {
                execution.status = 'skipped';
                execution.reason = 'Copy trading disabled';
                return execution;
            }

            // Determine trade type and size
            if (parsedTx.acquisitionDetails) {
                // Token purchase
                const { mint, amountAcquired, totalSolCost } = parsedTx.acquisitionDetails;
                
                // Check position size limits
                const tradeSize = this.calculateTradeSize(totalSolCost);
                if (tradeSize > this.config.maxPositionSize) {
                    execution.status = 'skipped';
                    execution.reason = `Trade size ${tradeSize} SOL exceeds max ${this.config.maxPositionSize} SOL`;
                    return execution;
                }

                // Execute buy order
                console.log(`Copying BUY: ${amountAcquired} ${getTokenSymbol(mint)} for ${tradeSize} SOL`);
                
                // TODO: Implement actual Solana swap transaction
                // This would involve:
                // 1. Finding the best DEX route (Jupiter, Raydium, etc.)
                // 2. Building the swap transaction
                // 3. Signing and sending the transaction
                
                execution.status = 'executed';
                execution.copyTx = 'SIMULATED_TX_SIGNATURE'; // Replace with actual tx
                execution.executedAt = Date.now();
                
            } else if (parsedTx.pnlDetails) {
                // Token sale
                const { mint, amountSold } = parsedTx.pnlDetails;
                
                // Check if we have this token
                // TODO: Check actual token balance
                
                console.log(`Copying SELL: ${amountSold} ${getTokenSymbol(mint)}`);
                
                execution.status = 'executed';
                execution.copyTx = 'SIMULATED_TX_SIGNATURE'; // Replace with actual tx
                execution.executedAt = Date.now();
            }

        } catch (error) {
            execution.status = 'failed';
            execution.reason = error instanceof Error ? error.message : 'Unknown error';
        }

        return execution;
    }

    private calculateTradeSize(originalSize: number): number {
        if (this.config.proportionalSizing && this.config.sizingRatio) {
            return originalSize * this.config.sizingRatio;
        }
        return Math.min(originalSize, this.config.maxPositionSize);
    }

    async getWalletBalance(): Promise<number> {
        const balance = await this.connection.getBalance(this.wallet.publicKey);
        return balance / 1e9; // Convert lamports to SOL
    }
} 