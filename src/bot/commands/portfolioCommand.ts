import { Bot, MessageContext } from "gramio";
import { db, getPortfolioPositions, getAllTrackedWalletsDB } from "../../db";
import { getTokenSymbol, fetchTokenMetadata } from "../../utils/tokenCache";

interface JupiterPriceResponse {
    data: {
        [mint: string]: {
            id: string;
            mintSymbol: string;
            vsToken: string;
            vsTokenSymbol: string;
            price: number;
        };
    };
}

export function registerPortfolioCommand(bot: Bot) {
    bot.command("portfolio", async (context: MessageContext<Bot>) => {
        try {
            const chatId = context.chat?.id;
            if (!chatId) {
                context.send("Could not identify the chat. Please try again.");
                return;
            }
            const userChatIdString = String(chatId);

            const portfolioPositions = getPortfolioPositions(db, userChatIdString);
            const trackedWallets = getAllTrackedWalletsDB(db).filter(w => w.user_chat_id === userChatIdString);

            if (portfolioPositions.length === 0) {
                context.send("📊 **Portfolio Summary**\n\nNo active positions found.\n\nTip: Your portfolio will appear here after you buy tokens on your tracked wallets.");
                return;
            }

            context.send("🔄 Fetching current prices...");

            // Get unique mints for price fetching
            const uniqueMints = [...new Set(portfolioPositions.map(p => p.mint))];
            
            // Fetch current prices from Jupiter
            const currentPrices = await fetchCurrentPrices(uniqueMints);

            // Group positions by wallet
            const positionsByWallet = new Map<string, typeof portfolioPositions>();
            portfolioPositions.forEach(position => {
                const walletPositions = positionsByWallet.get(position.address_tracked) || [];
                walletPositions.push(position);
                positionsByWallet.set(position.address_tracked, walletPositions);
            });

            let message = `📊 **Portfolio Summary**\n\n`;
            let totalPortfolioValue = 0;
            let totalInvested = 0;
            
            for (const [walletAddress, positions] of positionsByWallet) {
                const wallet = trackedWallets.find(w => w.solana_address === walletAddress);
                const walletName = wallet?.alias || `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`;
                
                message += `**🏦 ${walletName}**\n`;
                
                let walletValue = 0;
                let walletInvested = 0;
                
                for (const position of positions) {
                    const tokenSymbol = getTokenSymbol(position.mint);
                    const currentPrice = currentPrices[position.mint] || 0;
                    const currentValue = position.current_balance * currentPrice;
                    const unrealizedPnl = currentValue - (position.current_balance * position.average_cost_basis);
                    const unrealizedPnlPercent = position.average_cost_basis > 0 ? (unrealizedPnl / (position.current_balance * position.average_cost_basis)) * 100 : 0;
                    
                    walletValue += currentValue;
                    walletInvested += position.current_balance * position.average_cost_basis;
                    
                    const pnlEmoji = unrealizedPnl >= 0 ? '🟢' : '🔴';
                    const priceDisplay = currentPrice > 0 ? `${currentPrice.toFixed(8)} SOL` : 'Price N/A';
                    
                    message += `  • **${position.current_balance.toFixed(6)} ${tokenSymbol}**\n`;
                    message += `    Current: ${priceDisplay}\n`;
                    message += `    Avg Cost: ${position.average_cost_basis.toFixed(8)} SOL\n`;
                    message += `    Value: ${currentValue.toFixed(4)} SOL\n`;
                    message += `    ${pnlEmoji} P&L: ${unrealizedPnl.toFixed(4)} SOL (${unrealizedPnlPercent.toFixed(1)}%)\n`;
                    message += `\n`;
                }
                
                const walletPnl = walletValue - walletInvested;
                const walletPnlPercent = walletInvested > 0 ? (walletPnl / walletInvested) * 100 : 0;
                const walletPnlEmoji = walletPnl >= 0 ? '🟢' : '🔴';
                
                message += `  **Wallet Total:**\n`;
                message += `    Value: ${walletValue.toFixed(4)} SOL\n`;
                message += `    Invested: ${walletInvested.toFixed(4)} SOL\n`;
                message += `    ${walletPnlEmoji} P&L: ${walletPnl.toFixed(4)} SOL (${walletPnlPercent.toFixed(1)}%)\n`;
                message += `\n`;
                
                totalPortfolioValue += walletValue;
                totalInvested += walletInvested;
            }
            
            const totalUnrealizedPnl = totalPortfolioValue - totalInvested;
            const totalPnlPercent = totalInvested > 0 ? (totalUnrealizedPnl / totalInvested) * 100 : 0;
            const totalPnlEmoji = totalUnrealizedPnl >= 0 ? '🟢' : '🔴';
            
            message += `**📈 PORTFOLIO TOTAL:**\n`;
            message += `**Current Value:** ${totalPortfolioValue.toFixed(4)} SOL\n`;
            message += `**Total Invested:** ${totalInvested.toFixed(4)} SOL\n`;
            message += `**${totalPnlEmoji} Unrealized P&L:** ${totalUnrealizedPnl.toFixed(4)} SOL (${totalPnlPercent.toFixed(1)}%)\n`;
            message += `\n*Last updated: ${new Date().toLocaleTimeString()}*`;
            message += `\n*Use /totalpnl for realized P&L from completed trades*`;

            // Split message if it's too long
            if (message.length > 4000) {
                const messages = splitMessage(message, 4000);
                for (let i = 0; i < messages.length; i++) {
                    setTimeout(() => context.send(messages[i]), i * 100);
                }
            } else {
                context.send(message);
            }

        } catch (error) {
            console.error("Error fetching portfolio for /portfolio command:", error);
            context.send("Sorry, there was an error fetching your portfolio. Please try again.");
        }
    });
}

async function fetchCurrentPrices(mints: string[]): Promise<{ [mint: string]: number }> {
    const prices: { [mint: string]: number } = {};
    
    try {
        // Try Jupiter Price API v2
        const mintList = mints.join(',');
        const response = await fetch(`https://price.jup.ag/v4/price?ids=${mintList}`, {
            headers: {
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
            const data: JupiterPriceResponse = await response.json();
            
            for (const mint of mints) {
                const priceData = data.data[mint];
                if (priceData && priceData.price) {
                    prices[mint] = priceData.price;
                }
            }
        } else {
            console.warn('Jupiter Price API returned non-OK response:', response.status);
        }
    } catch (error) {
        console.warn('Error fetching prices from Jupiter:', error);
        
        // Fallback: Try to get individual prices
        const pricePromises = mints.slice(0, 5).map(async (mint) => { // Limit to 5 to avoid rate limits
            try {
                const response = await fetch(`https://price.jup.ag/v4/price?ids=${mint}`, {
                    signal: AbortSignal.timeout(3000)
                });
                if (response.ok) {
                    const data: JupiterPriceResponse = await response.json();
                    const priceData = data.data[mint];
                    if (priceData && priceData.price) {
                        prices[mint] = priceData.price;
                    }
                }
            } catch (e) {
                console.warn(`Failed to fetch price for ${mint}:`, e);
            }
        });
        
        await Promise.allSettled(pricePromises);
    }
    
    return prices;
}

function splitMessage(message: string, maxLength: number): string[] {
    const messages: string[] = [];
    let currentMessage = "";
    
    const lines = message.split('\n');
    
    for (const line of lines) {
        if ((currentMessage + line + '\n').length > maxLength) {
            if (currentMessage) {
                messages.push(currentMessage.trim());
                currentMessage = "";
            }
        }
        currentMessage += line + '\n';
    }
    
    if (currentMessage.trim()) {
        messages.push(currentMessage.trim());
    }
    
    return messages;
} 