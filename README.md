# Solana Copy Trading Bot

An advanced Telegram bot for tracking Solana wallets, analyzing trading performance with accurate PnL calculations, portfolio management, and automated copy trading functionality.

## 🚀 Features

### Core Functionality
- **Multi-Wallet Tracking**: Track multiple Solana wallets simultaneously
- **Real-time Transaction Monitoring**: Automatically detect and analyze new transactions
- **Accurate PnL Calculations**: FIFO-based cost basis tracking with proper wallet isolation
- **Portfolio Management**: Real-time portfolio values with unrealized P&L
- **Token Metadata**: Automatic token symbol resolution via Jupiter and Solana token registry
- **Automated Copy Trading**: Mirror trades from tracked wallets with customizable settings

### Copy Trading Features 🔄
- **Automated Trade Execution**: Automatically copy buy/sell transactions from tracked wallets
- **Risk Management**: Set maximum position sizes and per-trade limits
- **Selective Copying**: Choose which wallets to copy trades from
- **Slippage Protection**: Configurable slippage tolerance for trades
- **Trade Notifications**: Real-time alerts for executed copy trades
- **Performance Tracking**: Monitor copy trading results separately

### Enhanced PnL Tracking
- ✅ **Fixed FIFO Logic**: Proper cost basis calculation scoped by wallet address
- ✅ **Realized vs Unrealized PnL**: Separate tracking of completed trades and open positions
- ✅ **Per-Wallet Breakdown**: Individual P&L analysis for each tracked wallet
- ✅ **Position Tracking**: Average cost basis and current value for all holdings
- ✅ **Precision Improvements**: Better handling of decimal calculations

### Commands Overview
- **Wallet Management**: Track and manage Solana wallets
- **Portfolio & PnL**: View holdings and performance metrics
- **Copy Trading**: Configure and control automated trading
- **Bot Control**: Start/stop tracking and manage settings

## 🛠 Installation

### Prerequisites
- [Bun](https://bun.sh/) runtime
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- Dune Analytics API Key
- Solana RPC endpoint (optional, defaults to public endpoint)

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
export SOLANA_RPC_URL="your_rpc_endpoint" # Optional
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

### Copy Trading Commands 🔄
- `/copystart <wallet_address>` - Enable copy trading for a specific wallet
- `/copystop <wallet_address>` - Disable copy trading for a wallet
- `/copylist` - List all wallets with copy trading enabled
- `/copysettings` - View current copy trading configuration
- `/setmaxposition <amount>` - Set maximum SOL per position (default: 0.1)
- `/setmaxtrade <amount>` - Set maximum SOL per trade (default: 0.05)
- `/setslippage <percentage>` - Set slippage tolerance (default: 1%)
- `/copystatus` - View copy trading statistics and recent trades

### Bot Control
- `/start` - Start the tracking bot
- `/stop` - Stop the tracking bot

## 🔧 Copy Trading Configuration

### Risk Management Settings
```
Max Position Size: 0.1 SOL (default)
Max Trade Size: 0.05 SOL (default)
Slippage Tolerance: 1% (default)
```

### How Copy Trading Works
1. **Trade Detection**: When a tracked wallet makes a trade, the bot detects it in real-time
2. **Copy Decision**: If copy trading is enabled for that wallet, the bot prepares to mirror the trade
3. **Risk Checks**: The bot validates the trade against your risk management settings
4. **Execution**: The trade is executed on your behalf with the configured parameters
5. **Notification**: You receive a Telegram notification with trade details and results

### Example Copy Trading Flow
```
1. /track 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU whale
2. /copystart 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
3. /setmaxposition 0.5
4. Bot automatically copies trades from "whale" wallet
```

## 🏗 Architecture

### Database Schema
```sql
-- Core tables
tracked_wallets       -- User wallet tracking relationships
transactions         -- All processed transactions
token_movements      -- Token transfer details

-- PnL tracking
token_acquisitions   -- Token purchases with FIFO tracking
token_disposals_pnl  -- Token sales with realized P&L
portfolio_positions  -- Current holdings and cost basis

-- Copy trading
copy_trading_config  -- User copy trading settings
copy_trades         -- Executed copy trade history
```

### Key Components
- **Transaction Parser**: Analyzes Solana transactions for token movements
- **FIFO Engine**: Accurate cost basis calculation using first-in-first-out
- **Price Oracle**: Real-time token pricing via Jupiter API
- **Portfolio Manager**: Position tracking and P&L calculations
- **Copy Trade Executor**: Automated trade execution with risk management
- **Notification System**: Real-time alerts via Telegram

## 📈 Usage Examples

### Setting Up Copy Trading
```
/track 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU trader1
/copystart 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
/setmaxposition 0.2
/setslippage 2
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

### Checking Copy Trading Status
```
/copystatus
```
**Output:**
```
📊 Copy Trading Statistics

Active Wallets: 2
Total Trades Copied: 15
Success Rate: 93.3%

Recent Trades:
• BUY 1000 BONK @ 0.00002100 SOL ✅
• SELL 500 WIF @ 2.15000000 SOL ✅
```

## 🔍 Monitoring

The bot provides comprehensive monitoring through:

- **Real-time notifications** for all tracked wallet activities
- **Copy trade alerts** with execution details and results
- **Status dashboard** showing bot health and tracking statistics  
- **Recent activity feed** with transaction summaries
- **P&L alerts** for significant gains/losses
- **Copy trading performance** metrics and success rates

## 🛡 Safety Features

### Copy Trading Safeguards
- **Maximum position limits** to prevent overexposure
- **Per-trade size limits** for risk management
- **Slippage protection** to avoid bad fills
- **Wallet whitelist** - only copy from explicitly enabled wallets
- **Emergency stop** - instantly disable all copy trading
- **Trade validation** before execution

### Error Handling
- API timeout protection
- Database transaction rollbacks
- Graceful degradation for external services
- Comprehensive logging for debugging
- Failed trade notifications

## ⚠️ Important Disclaimers

- **Not Financial Advice**: This bot is for educational purposes only
- **Risk of Loss**: Copy trading involves significant financial risk
- **No Guarantees**: Past performance doesn't indicate future results
- **Your Responsibility**: You are responsible for all trades executed
- **Test First**: Always test with small amounts before scaling up

## 🚧 Future Enhancements

Planned improvements include:
- [ ] Advanced copy trading strategies (proportional sizing, filters)
- [ ] Historical P&L charts and analytics
- [ ] Risk management alerts and position limits
- [ ] DeFi integration (LP positions, staking rewards)
- [ ] Performance metrics (Sharpe ratio, win rate)
- [ ] Export functionality for tax reporting
- [ ] Multi-chain support
- [ ] Stop-loss and take-profit orders
- [ ] Copy trading performance analytics

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please read the contributing guidelines and submit pull requests for any improvements.

## 🔒 Security

- Never share your private keys or seed phrases
- Use a dedicated wallet for copy trading with limited funds
- Regularly review and update your risk management settings
- Monitor your trades and adjust settings as needed

---

**Note**: This bot is for educational and informational purposes. Always verify transactions and P&L calculations independently. Copy trading carries substantial risk of financial loss. Only trade with funds you can afford to lose.
