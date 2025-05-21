import { initializeBot } from "./bot/bot";
import { db, checkAndSetupDatabase } from "./db";

console.log("Application starting...");

// Ensure database is set up before bot starts
checkAndSetupDatabase(db);

// Initialize and start the bot
const bot = initializeBot();

bot.start({ /* Optional: Add gramio start options here if needed */ });

console.log("Application main.ts has finished setup. Bot is running.");

// Graceful shutdown (optional, but good practice)
process.on('SIGINT', () => {
    console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
    bot.stop();
    db.close(); // Close the database connection
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log("Gracefully shutting down from SIGTERM");
    bot.stop();
    db.close();
    process.exit(0);
}); 