# Solana Transaction Tracker

A Telegram bot that tracks transactions for a specific Solana wallet address and provides formatted notifications.

## Features

- Monitors a Solana wallet address for new transactions
- Parses transaction details to provide human-readable information
- Detects token transfers, sales, and purchases 
- Calculates SOL balance changes
- Sends formatted notifications to a Telegram channel
- Processes missed transactions in chronological order
- Commands to start, stop, reset, and check status

## Commands

- `/start` - Start tracking transactions
- `/stop` - Stop tracking transactions
- `/reset` - Reset the tracking to the latest transaction (useful after downtime)
- `/status` - Show current tracking status

## Configuration

The bot requires the following environment variables:

- `DUNE_KEY` - API key for Dune's Solana API
- `BOT_TOKEN` - Your Telegram bot token

## Transaction Parsing

The bot parses Solana transactions to extract meaningful information:

- Transaction type (Sale, Purchase, Transfer, etc.)
- Token transfers with amounts
- SOL balance changes
- Transaction fees
- Links to transaction explorer

## Setup

1. Install dependencies: `pnpm install`
2. Set up environment variables
3. Run the bot: `pnpm start` or `bun start`

## Technical Details

- Built with TypeScript and Bun runtime
- Uses the Gramio library for Telegram bot functionality
- Tracks block slots to ensure no transactions are missed
- Implements pagination and chronological ordering of transactions

## Adding Custom Tokens

Custom tokens can be added to the token cache for better readability:

```typescript
const tokenCache: Record<string, string> = {
  "So11111111111111111111111111111111111111112": "SOL",
  "YOUR_TOKEN_MINT_ADDRESS": "YOUR_TOKEN_SYMBOL",
};
```
