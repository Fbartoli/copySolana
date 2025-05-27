# Solana Copy Trading Bot

An advanced Telegram bot for tracking Solana wallets and analyzing trading performance with accurate PnL calculations, portfolio management, and real-time position tracking.

## 🚀 Features

### Core Functionality
- **Multi-Wallet Tracking**: Track multiple Solana wallets simultaneously
- **Real-time Transaction Monitoring**: Automatically detect and analyze new transactions
- **Accurate PnL Calculations**: FIFO-based cost basis tracking with proper wallet isolation
- **Portfolio Management**: Real-time portfolio values with unrealized P&L
- **Token Metadata**: Automatic token symbol resolution via Jupiter and Solana token registry

### Enhanced PnL Tracking
- ✅ **Fixed FIFO Logic**: Proper cost basis calculation scoped by wallet address
- ✅ **Realized vs Unrealized PnL**: Separate tracking of completed trades and open positions
- ✅ **Per-Wallet Breakdown**: Individual P&L analysis for each tracked wallet
- ✅ **Position Tracking**: Average cost basis and current value for all holdings
- ✅ **Precision Improvements**: Better handling of decimal calculations

### New Commands
- `/portfolio` - View current holdings with real-time prices and unrealized P&L
- `/totalpnl` - Enhanced realized P&L summary with wallet breakdown
- `/status` - Comprehensive bot status with tracking summary and recent activity

## 🛠 Installation

### Prerequisites
- [Bun](https://bun.sh/) runtime
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- Dune Analytics API Key

### Setup
1. Clone the repository:
```bash
git clone <repository-url>
cd copySolana
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
export BOT_TOKEN="your_telegram_bot_token"
export DUNE_KEY="your_dune_api_key"
```

4. Run the bot:
```bash
bun run src/main.ts
```

## 📱 Commands

### Wallet Management
- `/track <address> [alias]` - Start tracking a Solana wallet
- `/untrack <address>` - Stop tracking a wallet  
- `/listtracked` - List all tracked wallets

### Portfolio & PnL
- `/portfolio` - View current portfolio with real-time prices
- `/totalpnl` - View realized P&L summary with breakdown
- `/status` - Bot status and recent activity summary

### Bot Control
- `/start` - Start the tracking bot
- `/stop` - Stop the tracking bot

## 🔧 Key Improvements Made

### 1. **Fixed FIFO Logic Bug** 🐛→✅
**Problem**: The original FIFO cost basis calculation didn't properly isolate acquisitions by wallet address, causing incorrect P&L when tracking multiple wallets.

**Solution**: 
- Added `address_tracked` field to `token_acquisitions` and `token_disposals_pnl` tables
- Updated all FIFO queries to filter by both `user_chat_id` AND `address_tracked`
- Added database migration to update existing data

### 2. **Enhanced Portfolio Tracking** 📊
**New Features**:
- Real-time portfolio positions with current balances
- Average cost basis tracking per position
- Unrealized P&L calculations with current market prices
- Portfolio value breakdown by wallet

### 3. **Improved Token Metadata** 🏷️
**Enhancements**:
- Dynamic token symbol fetching from Jupiter API
- Fallback to Solana token registry
- In-memory caching for performance
- Graceful degradation to truncated mint addresses

### 4. **Better Price Integration** 💰
**Features**:
- Jupiter Price API integration for real-time token prices
- Batch price fetching for efficiency
- Fallback mechanisms for reliability
- SOL-denominated pricing throughout

### 5. **Enhanced User Experience** ✨
**Improvements**:
- Rich message formatting with emojis and status indicators
- Automatic message splitting for long responses
- Comprehensive status reporting
- Recent activity summaries
- Per-wallet P&L breakdowns

## 🏗 Architecture

### Database Schema
```sql
-- Core tables
tracked_wallets       -- User wallet tracking relationships
transactions         -- All processed transactions
token_movements      -- Token transfer details

-- PnL tracking (FIXED)
token_acquisitions   -- Token purchases with FIFO tracking
token_disposals_pnl  -- Token sales with realized P&L
portfolio_positions  -- Current holdings and cost basis
```

### Key Components
- **Transaction Parser**: Analyzes Solana transactions for token movements
- **FIFO Engine**: Accurate cost basis calculation using first-in-first-out
- **Price Oracle**: Real-time token pricing via Jupiter API
- **Portfolio Manager**: Position tracking and P&L calculations

## 📈 Usage Examples

### Tracking a Wallet
```
/track 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU trader1
```

### Viewing Portfolio
```
/portfolio
```
**Output:**
```
📊 Portfolio Summary

🏦 trader1
  • 1000.000000 BONK
    Current: 0.00002156 SOL
    Avg Cost: 0.00001800 SOL
    Value: 21.5600 SOL
    🟢 P&L: 3.5600 SOL (19.8%)

📈 PORTFOLIO TOTAL:
Current Value: 21.5600 SOL
Total Invested: 18.0000 SOL
🟢 Unrealized P&L: 3.5600 SOL (19.8%)
```

## 🔍 Monitoring

The bot provides comprehensive monitoring through:

- **Real-time notifications** for all tracked wallet activities
- **Status dashboard** showing bot health and tracking statistics  
- **Recent activity feed** with transaction summaries
- **P&L alerts** for significant gains/losses

## 🛡 Error Handling

Robust error handling includes:
- API timeout protection
- Database transaction rollbacks
- Graceful degradation for external services
- Comprehensive logging for debugging

## 🚧 Future Enhancements

Planned improvements include:
- [ ] Historical P&L charts and analytics
- [ ] Risk management alerts and position limits
- [ ] DeFi integration (LP positions, staking rewards)
- [ ] Performance metrics (Sharpe ratio, win rate)
- [ ] Export functionality for tax reporting
- [ ] Multi-chain support

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please read the contributing guidelines and submit pull requests for any improvements.

---

**Note**: This bot is for educational and informational purposes. Always verify transactions and P&L calculations independently. Not financial advice.
