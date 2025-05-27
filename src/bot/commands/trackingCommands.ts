import { Bot, MessageContext } from "gramio";
import { db } from "../../db"; // Assuming db is exported from here
import { addTrackedWalletDB, removeTrackedWalletDB, listTrackedWalletsDB } from "../../db/trackingQueries"; // Import from new location

// --- Command Registration ---

export function registerTrackingCommands(bot: Bot) {
    bot.command("track", (context: MessageContext<Bot>) => {
        const chatId = context.chat?.id;
        if (!chatId) {
            context.send("Could not identify the chat. Please try again.");
            return;
        }
        const userChatIdString = String(chatId);
        const args = context.text?.split(' ').slice(1) || [];
        const solanaAddress = args[0];
        const alias = args[1];

        if (!solanaAddress) {
            context.send("Please provide a Solana address to track. Usage: /track <address> [alias]");
            return;
        }
        // Basic Solana address validation (improves UX slightly)
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solanaAddress)) {
             context.send("Invalid Solana address format. Please check the address and try again.");
            return;
        }

        const result = addTrackedWalletDB(db, userChatIdString, solanaAddress, alias);
        context.send(result.message);
    });

    bot.command("untrack", (context: MessageContext<Bot>) => {
        const chatId = context.chat?.id;
        if (!chatId) {
            context.send("Could not identify the chat. Please try again.");
            return;
        }
        const userChatIdString = String(chatId);
        const addressOrAlias = context.text?.split(' ')[1];

        if (!addressOrAlias) {
            context.send("Please provide a Solana address or alias to untrack. Usage: /untrack <address_or_alias>");
            return;
        }

        const result = removeTrackedWalletDB(db, userChatIdString, addressOrAlias);
        context.send(result.message);
    });

    bot.command("listtracked", (context: MessageContext<Bot>) => {
        const chatId = context.chat?.id;
        if (!chatId) {
            context.send("Could not identify the chat. Please try again.");
            return;
        }
        const userChatIdString = String(chatId);

        const wallets = listTrackedWalletsDB(db, userChatIdString);
        if (wallets.length === 0) {
            context.send("You are not currently tracking any wallets. Use /track <address> to add one.");
            return;
        }

        let message = "📋 Tracked Wallets:\n";
        wallets.forEach(wallet => {
            message += `- ${wallet.solana_address}${wallet.alias ? ' (Alias: ' + wallet.alias + ')' : ''}\n`;
        });
        context.send(message);
    });
} 