import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { createJupiterApiClient } from "@jup-ag/api";

export class JupiterSwap {
    private jupiterApi: any;
    private connection: Connection;

    constructor(connection: Connection) {
        this.connection = connection;
        this.jupiterApi = createJupiterApiClient();
    }

    async getSwapQuote(
        inputMint: string,
        outputMint: string,
        amount: number,
        slippageBps: number = 50 // 0.5% default slippage
    ) {
        try {
            const quote = await this.jupiterApi.quoteGet({
                inputMint,
                outputMint,
                amount,
                slippageBps,
                onlyDirectRoutes: false,
                asLegacyTransaction: false,
            });

            return quote;
        } catch (error) {
            console.error("Error getting swap quote:", error);
            throw error;
        }
    }

    async executeSwap(
        wallet: Keypair,
        inputMint: string,
        outputMint: string,
        amount: number,
        slippageBps: number = 50
    ): Promise<string> {
        try {
            // Get quote
            const quote = await this.getSwapQuote(inputMint, outputMint, amount, slippageBps);

            // Get swap transaction
            const swapResult = await this.jupiterApi.swapPost({
                swapRequest: {
                    quoteResponse: quote,
                    userPublicKey: wallet.publicKey.toBase58(),
                    dynamicComputeUnitLimit: true,
                    prioritizationFeeLamports: "auto"
                }
            });

            // Deserialize transaction
            const swapTransactionBuf = Buffer.from(swapResult.swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

            // Sign transaction
            transaction.sign([wallet]);

            // Execute transaction
            const signature = await this.connection.sendTransaction(transaction);
            
            // Wait for confirmation
            const latestBlockhash = await this.connection.getLatestBlockhash();
            await this.connection.confirmTransaction({
                signature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            });

            return signature;
        } catch (error) {
            console.error("Error executing swap:", error);
            throw error;
        }
    }

    // Helper to get SOL price for position sizing
    async getTokenPrice(mint: string): Promise<number | null> {
        try {
            const prices = await this.jupiterApi.priceGet({ ids: [mint] });
            return prices.data[mint]?.price || null;
        } catch (error) {
            console.error("Error getting token price:", error);
            return null;
        }
    }
} 