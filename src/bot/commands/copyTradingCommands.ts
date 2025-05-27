import { Bot, MessageContext } from "gramio";
import type { Database } from "bun:sqlite";

export function registerCopyTradingCommands(bot: Bot, db: Database) {
    // Enable/Disable copy trading
    bot.command("copytrade", async (context: MessageContext<Bot>) => {
        const userId = context.chat?.id?.toString();
        if (!userId) return;

        const args = context.text?.split(" ").slice(1) || [];
        
        if (args.length === 0) {
            // Show current status
            const config = db.query<{
                enabled: number;
                max_position_size: number;
                slippage_tolerance: number;
                auto_approve: number;
                proportional_sizing: number;
                sizing_ratio: number;
            }, [string]>(`
                SELECT * FROM copy_trading_config WHERE user_chat_id = ?
            `).get(userId);

            if (!config) {
                await context.send("Copy trading is not configured. Use /setupcopy to set it up.");
                return;
            }

            const status = config.enabled ? "✅ Enabled" : "❌ Disabled";
            await context.send(
                `*Copy Trading Status*\n\n` +
                `Status: ${status}\n` +
                `Max Position Size: ${config.max_position_size} SOL\n` +
                `Slippage: ${config.slippage_tolerance}%\n` +
                `Auto-approve: ${config.auto_approve ? "Yes" : "No"}\n` +
                `Proportional Sizing: ${config.proportional_sizing ? "Yes" : "No"}\n` +
                `${config.proportional_sizing ? `Sizing Ratio: ${config.sizing_ratio}x\n` : ""}` +
                `\nUse /copytrade on or /copytrade off to toggle`,
                { parse_mode: "Markdown" }
            );
            return;
        }

        const action = args[0].toLowerCase();
        if (action === "on") {
            db.query(`
                UPDATE copy_trading_config SET enabled = 1 WHERE user_chat_id = ?
            `).run(userId);
            await context.send("✅ Copy trading enabled!");
        } else if (action === "off") {
            db.query(`
                UPDATE copy_trading_config SET enabled = 0 WHERE user_chat_id = ?
            `).run(userId);
            await context.send("❌ Copy trading disabled!");
        } else {
            await context.send("Usage: /copytrade [on|off]");
        }
    });

    // Setup copy trading
    bot.command("setupcopy", async (context: MessageContext<Bot>) => {
        const userId = context.chat?.id?.toString();
        if (!userId) return;

        await context.send(
            "*Copy Trading Setup*\n\n" +
            "To set up copy trading, you need to provide:\n" +
            "1. Your wallet private key (base64 encoded)\n" +
            "2. Max position size in SOL\n" +
            "3. Slippage tolerance (percentage)\n\n" +
            "Example:\n" +
            "`/setcopywallet <private_key>`\n" +
            "`/setcopysize 0.5` (max 0.5 SOL per trade)\n" +
            "`/setcopyslippage 1` (1% slippage)\n\n" +
            "⚠️ *Security Warning*: Never share your private key with anyone!",
            { parse_mode: "Markdown" }
        );

        // Initialize config if not exists
        db.query(`
            INSERT OR IGNORE INTO copy_trading_config (user_chat_id) VALUES (?)
        `).run(userId);
    });

    // Set wallet private key
    bot.command("setcopywallet", async (context: MessageContext<Bot>) => {
        const userId = context.chat?.id?.toString();
        if (!userId) return;

        const args = context.text?.split(" ").slice(1) || [];
        if (args.length === 0) {
            await context.send("Usage: /setcopywallet <base64_private_key>");
            return;
        }

        const privateKey = args[0];
        
        try {
            // Validate it's a valid base64 string
            Buffer.from(privateKey, 'base64');
            
            db.query(`
                UPDATE copy_trading_config 
                SET wallet_private_key = ? 
                WHERE user_chat_id = ?
            `).run(privateKey, userId);

            await context.send("✅ Wallet configured successfully!");
        } catch (error) {
            await context.send("❌ Invalid private key format. Please provide a base64 encoded private key.");
        }
    });

    // Set max position size
    bot.command("setcopysize", async (context: MessageContext<Bot>) => {
        const userId = context.chat?.id?.toString();
        if (!userId) return;

        const args = context.text?.split(" ").slice(1) || [];
        if (args.length === 0) {
            await context.send("Usage: /setcopysize <max_sol_per_trade>");
            return;
        }

        const size = parseFloat(args[0]);
        if (isNaN(size) || size <= 0) {
            await context.send("❌ Invalid size. Please provide a positive number.");
            return;
        }

        db.query(`
            UPDATE copy_trading_config 
            SET max_position_size = ? 
            WHERE user_chat_id = ?
        `).run(size, userId);

        await context.send(`✅ Max position size set to ${size} SOL`);
    });

    // View copy trading history
    bot.command("copyhistory", async (context: MessageContext<Bot>) => {
        const userId = context.chat?.id?.toString();
        if (!userId) return;

        const history = db.query<{
            executed_at: number;
            status: string;
            trade_type: string;
            amount: number;
            sol_value: number;
            reason: string | null;
        }, [string]>(`
            SELECT * FROM copy_trading_history 
            WHERE user_chat_id = ? 
            ORDER BY executed_at DESC 
            LIMIT 10
        `).all(userId);

        if (history.length === 0) {
            await context.send("No copy trading history found.");
            return;
        }

        let message = "*Recent Copy Trading History*\n\n";
        
        for (const trade of history) {
            const date = new Date(trade.executed_at).toLocaleString();
            const status = trade.status === 'executed' ? '✅' : 
                          trade.status === 'failed' ? '❌' : '⏭️';
            
            message += `${status} ${trade.trade_type} ${trade.amount} tokens\n`;
            message += `   Value: ${trade.sol_value.toFixed(4)} SOL\n`;
            message += `   Status: ${trade.status}${trade.reason ? ` (${trade.reason})` : ''}\n`;
            message += `   Time: ${date}\n\n`;
        }

        await context.send(message, { parse_mode: "Markdown" });
    });
} 