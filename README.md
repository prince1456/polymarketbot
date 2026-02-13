# Polymarket Copy Trading Bot

Automated copy trading bot for Polymarket prediction markets. Monitors a target trader's positions and automatically replicates their trades in real-time with proportional sizing and safety limits.

## Features

- ✅ **Real-time Monitoring**: Continuously monitors target wallet for new positions
- ✅ **Ratio-Based Sizing**: Matches target trader's portfolio ratio (e.g., target trades 1% of 200k = $2000, you trade 1% of $200 = $2)
- ✅ **Risk Management**: Built-in safety limits for trade size, daily spending, and liquidity
- ✅ **Dry Run Mode**: Test the bot without executing real trades
- ✅ **Trade Tracking**: SQLite database tracks all copied trades
- ✅ **Graceful Shutdown**: Handles interrupts cleanly

## Prerequisites

- Node.js (v18 or higher)
- Polygon wallet with USDC
- Polymarket API key

## Installation

1. Clone or navigate to the project directory:
```bash
cd polymarket
```

2. Install dependencies (already done):
```bash
npm install
```

3. Configure your environment:
```bash
cp .env.example .env
```

4. Edit `.env` with your settings:
```bash
nano .env
```

## Configuration

### Required Variables

- `PRIVATE_KEY`: Your wallet private key (starts with 0x)
- `TARGET_WALLET`: Wallet address to copy (e.g., 0x1234...)
- `POLYMARKET_API_KEY`: Your Polymarket API key

### Trading Parameters

- `TARGET_BALANCE`: Target trader's estimated total balance in USD (used for ratio calculation)
- `MAX_TRADE_SIZE`: Maximum USD per single trade (safety limit)
- `DAILY_SPENDING_LIMIT`: Maximum USD to spend per day
- `MIN_LIQUIDITY_RATIO`: Minimum market liquidity required (0.1 = 10%)

### Ratio-Based Sizing

The bot calculates trade sizes by matching the target's portfolio ratio:

```
ratio = target_trade_value / TARGET_BALANCE
your_trade = your_balance * ratio
```

Example: Target has $200,000 and trades $2,000 (1% of portfolio).
You have $200 USDC, so the bot trades $2 (same 1% ratio).

### Example Configuration

```env
PRIVATE_KEY=0xYourPrivateKeyHere
TARGET_WALLET=0xTargetWalletAddressHere
POLYMARKET_API_KEY=your_api_key_here

TARGET_BALANCE=200000
MAX_TRADE_SIZE=100
DAILY_SPENDING_LIMIT=500
MIN_LIQUIDITY_RATIO=0.1
SLIPPAGE_TOLERANCE=0.02

DRY_RUN=true
```

## Getting Your Polymarket API Key

1. Visit [Polymarket Documentation](https://docs.polymarket.com/)
2. Sign up for API access
3. Generate an API key from your dashboard

## Finding the Target Wallet Address

To find a trader's wallet address from their profile URL:

1. Go to their profile: https://polymarket.com/@distinct-baguette?tab=positions
2. Use Polymarket's API or block explorer to find their wallet address
3. Or use browser dev tools to inspect network requests and find the address

## Usage

### Build the Project

```bash
npm run build
```

### Start with Dry Run (Recommended First)

Test the bot without executing real trades:

```bash
npm start
```

Make sure `DRY_RUN=true` in your `.env` file.

### Live Trading

**⚠️ WARNING: This will execute real trades with real money!**

1. Set `DRY_RUN=false` in `.env`
2. Start with low limits (e.g., MAX_TRADE_SIZE=5, DAILY_SPENDING_LIMIT=20)
3. Run the bot:

```bash
npm start
```

### Development Mode

Run without building (uses ts-node):

```bash
npm run dev
```

## How It Works

1. **Monitoring**: Bot polls the target wallet every minute (configurable) for new positions
2. **Detection**: When a new position is detected, it calculates the ratio-based proportional size
3. **Validation**: Risk manager checks:
   - Trade size doesn't exceed MAX_TRADE_SIZE
   - Daily spending limit not exceeded
   - Sufficient market liquidity
   - Sufficient USDC balance
4. **Execution**: If approved, places order on Polymarket CLOB
5. **Logging**: Saves trade to database for tracking

## Safety Features

### Risk Limits

- **Max Trade Size**: Caps individual trade amounts
- **Daily Spending Limit**: Prevents excessive daily trading
- **Liquidity Check**: Ensures markets have sufficient depth
- **Balance Verification**: Confirms sufficient USDC before trading

### Duplicate Prevention

- Tracks recent trades in database
- Skips positions already copied within 5 minutes
- Prevents accidental double-execution

### Graceful Shutdown

Press `Ctrl+C` to stop the bot safely:
- Stops monitoring loop
- Closes database connections
- Prints final statistics

## Database

The bot uses SQLite to track:
- All copied trades (market, outcome, amounts, timestamps)
- Daily spending totals
- Prevents duplicate trades

Database file: `polymarket.db`

### Query Trade History

```bash
sqlite3 polymarket.db "SELECT * FROM copied_trades ORDER BY timestamp DESC LIMIT 10;"
```

### Check Daily Spending

```bash
sqlite3 polymarket.db "SELECT * FROM daily_spending ORDER BY date DESC;"
```

## Testing Checklist

Before live trading:

- [ ] Test with `DRY_RUN=true` for 24 hours
- [ ] Verify target positions are detected correctly
- [ ] Check database logs trades properly
- [ ] Verify risk limits are enforced (test with very low limits)
- [ ] Confirm USDC balance is sufficient
- [ ] Test graceful shutdown (Ctrl+C)

## Troubleshooting

### "Missing required environment variable"

- Check that `.env` file exists
- Verify all required variables are set
- No spaces around `=` in `.env` file

### "Invalid PRIVATE_KEY format"

- Private key must start with `0x`
- Must be 66 characters total (0x + 64 hex chars)

### "Insufficient balance"

- Ensure you have USDC on Polygon network
- Bridge USDC to Polygon if needed

### "Failed to fetch target positions"

- Verify TARGET_WALLET address is correct
- Check Polymarket API is accessible
- Verify API key is valid

### No positions detected

- Target wallet may have no open positions
- Check target's profile on Polymarket website
- Increase `POLL_INTERVAL` if rate limiting occurs

## Project Structure

```
polymarket/
├── src/
│   ├── index.ts       # Main application entry point
│   ├── config.ts      # Configuration loader
│   ├── types.ts       # TypeScript interfaces
│   ├── database.ts    # SQLite database manager
│   ├── monitor.ts     # Position monitoring service
│   ├── risk.ts        # Risk management validator
│   └── executor.ts    # Trade execution engine
├── .env.example       # Example configuration
├── .gitignore         # Git ignore rules
├── package.json       # Dependencies
├── tsconfig.json      # TypeScript config
└── README.md          # This file
```

## Future Enhancements

- Web dashboard for monitoring
- Multiple target traders
- Position exit strategies
- Telegram/Discord notifications
- Advanced risk management (drawdown limits, win rate analysis)
- Backtesting framework

## Disclaimers

⚠️ **Important Warnings:**

- This bot executes real trades with real money
- Prediction markets are risky and you can lose money
- Past performance doesn't guarantee future results
- Start with small amounts and low limits
- Never invest more than you can afford to lose
- This software is provided "as is" without warranty

## License

ISC

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the configuration in `.env.example`
3. Check Polymarket documentation: https://docs.polymarket.com/

---

**Made with ❤️ for Polymarket traders**
