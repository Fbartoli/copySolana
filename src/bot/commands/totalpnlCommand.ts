import { Bot, MessageContext } from "gramio";
import { db, getTotalRealizedPnL, getPnlByWallet, getPortfolioPositions } from "../../db"; // Updated imports
import { getTokenSymbol } from "../../utils/tokenCache";

export function registerTotalPnlCommand(bot: Bot) {
    bot.command("totalpnl", (context: MessageContext<Bot>) => {
        try {
            const chatId = context.chat?.id; // Get chat ID
            if (!chatId) {
                context.send("Could not identify the chat. Please try again.");
                return;
            }
            const userChatIdString = String(chatId);

            const totalPnlData = getTotalRealizedPnL(db, userChatIdString); // Pass userChatIdString
            const walletPnlBreakdown = getPnlByWallet(db, userChatIdString);
            const portfolioPositions = getPortfolioPositions(db, userChatIdString);

            let message = `📈 **Total Realized PnL Summary** 📉\n\n`;
            message += `**Total Realized PnL:** ${totalPnlData.total_pnl.toFixed(4)} SOL\n`;
            message += `**Total Disposals:** ${totalPnlData.disposal_count}\n\n`;

            if (walletPnlBreakdown.length > 0) {
                message += `**PnL by Wallet:**\n`;
                walletPnlBreakdown.forEach((wallet, index) => {
                    const addressDisplay = `${wallet.address_tracked.substring(0, 6)}...${wallet.address_tracked.substring(wallet.address_tracked.length - 4)}`;
                    const pnlEmoji = wallet.total_pnl >= 0 ? '🟢' : '🔴';
                    message += `${index + 1}. ${addressDisplay}: ${pnlEmoji} ${wallet.total_pnl.toFixed(4)} SOL (${wallet.disposal_count} trades)\n`;
                });
                message += `\n`;
            }

            if (portfolioPositions.length > 0) {
                message += `**Current Portfolio:**\n`;
                const positionsByWallet = new Map<string, typeof portfolioPositions>();
                
                portfolioPositions.forEach(position => {
                    const walletPositions = positionsByWallet.get(position.address_tracked) || [];
                    walletPositions.push(position);
                    positionsByWallet.set(position.address_tracked, walletPositions);
                });

                positionsByWallet.forEach((positions, walletAddress) => {
                    const addressDisplay = `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`;
                    message += `\n**${addressDisplay}:**\n`;
                    
                    let totalInvested = 0;
                    positions.forEach(position => {
                        const tokenSymbol = getTokenSymbol(position.mint);
                        const currentValue = position.current_balance * position.average_cost_basis;
                        totalInvested += position.total_invested;
                        
                        message += `  • ${position.current_balance.toFixed(6)} ${tokenSymbol}\n`;
                        message += `    Avg Cost: ${position.average_cost_basis.toFixed(6)} SOL\n`;
                        message += `    Value: ${currentValue.toFixed(4)} SOL\n`;
                    });
                    
                    message += `  **Total Invested:** ${totalInvested.toFixed(4)} SOL\n`;
                });
            } else {
                message += `**Current Portfolio:** No active positions\n`;
            }

            message += `\n*Note: This reflects realized PnL from completed trades. Use /portfolio for real-time position values.*`;

            // Split message if it's too long (Telegram limit is 4096 characters)
            if (message.length > 4000) {
                const messages = splitMessage(message, 4000);
                messages.forEach((msg, index) => {
                    setTimeout(() => context.send(msg), index * 100); // Small delay between messages
                });
            } else {
                context.send(message);
            }
        } catch (error) {
            console.error("Error fetching total PnL for /totalpnl command:", error);
            context.send("Sorry, there was an error calculating the total PnL.");
        }
    });
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