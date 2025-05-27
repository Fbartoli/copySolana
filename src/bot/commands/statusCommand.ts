import { Bot, MessageContext } from "gramio";
import { db, getAllTrackedWalletsDB, getTotalRealizedPnL, getPortfolioPositions } from "../../db";
import { getPollingInterval } from "./startCommand";

export function registerStatusCommand(bot: Bot) {
    bot.command("status", (context: MessageContext<Bot>) => {
        try {
            const chatId = context.chat?.id;
            if (!chatId) {
                context.send("Could not identify the chat. Please try again.");
                return;
            }
            const userChatIdString = String(chatId);

            const trackedWallets = getAllTrackedWalletsDB(db).filter(w => w.user_chat_id === userChatIdString);
            const totalPnlData = getTotalRealizedPnL(db, userChatIdString);
            const portfolioPositions = getPortfolioPositions(db, userChatIdString);
            const pollingInterval = getPollingInterval();

            let message = `🤖 **Bot Status Report**\n\n`;

            // Bot status
            const botStatus = pollingInterval ? "🟢 Active" : "🔴 Stopped";
            message += `**Bot Status:** ${botStatus}\n`;
            
            if (pollingInterval) {
                message += `**Polling:** Every 5 seconds\n`;
            }
            
            message += `\n`;

            // Tracking summary
            message += `**📊 Tracking Summary:**\n`;
            message += `**Tracked Wallets:** ${trackedWallets.length}\n`;
            
            if (trackedWallets.length > 0) {
                message += `**Active Positions:** ${portfolioPositions.length}\n`;
                message += `**Total Trades:** ${totalPnlData.disposal_count}\n`;
                message += `**Realized P&L:** ${totalPnlData.total_pnl.toFixed(4)} SOL\n`;
                message += `\n`;

                // Wallet details
                message += `**📍 Tracked Wallets:**\n`;
                trackedWallets.forEach((wallet, index) => {
                    const walletPositions = portfolioPositions.filter(p => p.address_tracked === wallet.solana_address);
                    const walletPnl = getTotalRealizedPnL(db, userChatIdString, wallet.solana_address);
                    const addressDisplay = wallet.alias || `${wallet.solana_address.substring(0, 6)}...${wallet.solana_address.substring(wallet.solana_address.length - 4)}`;
                    
                    message += `${index + 1}. **${addressDisplay}**\n`;
                    message += `   Positions: ${walletPositions.length}\n`;
                    message += `   Trades: ${walletPnl.disposal_count}\n`;
                    message += `   P&L: ${walletPnl.total_pnl.toFixed(4)} SOL\n`;
                });
                message += `\n`;
            } else {
                message += `\nNo wallets are currently being tracked.\nUse /track <address> to start tracking a wallet.\n\n`;
            }

            // Recent activity
            const recentTransactionsQuery = db.query(`
                SELECT block_time, transaction_type, parsed_message, address_tracked 
                FROM transactions 
                WHERE user_chat_id = ? 
                ORDER BY block_time DESC 
                LIMIT 3
            `);
            const recentTransactions = recentTransactionsQuery.all(userChatIdString) as Array<{
                block_time: number;
                transaction_type: string;
                parsed_message: string;
                address_tracked: string;
            }>;

            if (recentTransactions.length > 0) {
                message += `**📈 Recent Activity:**\n`;
                recentTransactions.forEach((tx, index) => {
                    const timeAgo = getTimeAgo(tx.block_time / 1000);
                    const addressDisplay = `${tx.address_tracked.substring(0, 6)}...${tx.address_tracked.substring(tx.address_tracked.length - 4)}`;
                    const txTypeEmoji = getTxTypeEmoji(tx.transaction_type);
                    
                    message += `${index + 1}. ${txTypeEmoji} ${tx.transaction_type} (${timeAgo})\n`;
                    message += `   Wallet: ${addressDisplay}\n`;
                    
                    // Extract key info from parsed message
                    const lines = tx.parsed_message.split('\n');
                    const keyLine = lines.find(line => 
                        line.includes('Received') || 
                        line.includes('Sent') || 
                        line.includes('Bought') || 
                        line.includes('Sold')
                    );
                    if (keyLine) {
                        message += `   ${keyLine.trim()}\n`;
                    }
                });
                message += `\n`;
            }

            // Help section
            message += `**🔧 Available Commands:**\n`;
            message += `• /portfolio - View current holdings & unrealized P&L\n`;
            message += `• /totalpnl - View realized P&L summary\n`;
            message += `• /track <address> - Start tracking a wallet\n`;
            message += `• /untrack <address> - Stop tracking a wallet\n`;
            message += `• /listtracked - List all tracked wallets\n`;
            if (pollingInterval) {
                message += `• /stop - Stop the bot\n`;
            } else {
                message += `• /start - Start the bot\n`;
            }

            context.send(message);
        } catch (error) {
            console.error("Error fetching status for /status command:", error);
            context.send("Sorry, there was an error fetching the bot status.");
        }
    });
}

function getTxTypeEmoji(transactionType: string): string {
    switch (transactionType) {
        case "Token Purchase (SOL)":
        case "Token Purchase":
            return "🛒";
        case "Token Sale (SOL)":
        case "Token Sale":
            return "💰";
        case "Token Swap":
            return "🔄";
        case "Token Transfer":
            return "📤";
        case "SOL Transfer":
            return "💸";
        default:
            return "📊";
    }
}

function getTimeAgo(timestamp: number): string {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    
    if (diff < 60) {
        return `${Math.floor(diff)}s ago`;
    } else if (diff < 3600) {
        return `${Math.floor(diff / 60)}m ago`;
    } else if (diff < 86400) {
        return `${Math.floor(diff / 3600)}h ago`;
    } else {
        return `${Math.floor(diff / 86400)}d ago`;
    }
} 