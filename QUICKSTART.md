# Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Configure Environment

Copy the example environment file and fill in your details:

```bash
cp .env.example .env
nano .env
```

**Required Configuration:**

```env
# Your wallet private key (KEEP SECRET!)
PRIVATE_KEY=0x...

# Target trader's wallet to copy
TARGET_WALLET=0x...

# Polymarket API key
POLYMARKET_API_KEY=your_key_here

# Target balance (0 = auto-fetch from chain + positions)
TARGET_BALANCE=0
MAX_TRADE_SIZE=100
DAILY_SPENDING_LIMIT=500

# Safety first - start in dry run mode
DRY_RUN=true
```

### Step 2: Test with Dry Run

Always test first without risking real money:

```bash
npm start
```

The bot will:
- ✅ Connect to Polygon network
- ✅ Monitor target wallet
- ✅ Detect new positions
- ✅ Simulate trades (without executing)
- ✅ Log everything to database

Leave it running for 24 hours to verify it works correctly.

### Step 3: Go Live (Optional)

**⚠️ Only after successful testing!**

1. Update `.env`:
   ```env
   DRY_RUN=false
   MAX_TRADE_SIZE=10        # Start small!
   DAILY_SPENDING_LIMIT=50  # Low limit initially
   ```

2. Start the bot:
   ```bash
   npm start
   ```

3. Monitor logs carefully for the first few days

## 📊 Monitoring

### Check Database

```bash
# Recent trades
sqlite3 polymarket.db "SELECT * FROM copied_trades ORDER BY timestamp DESC LIMIT 10;"

# Today's spending
sqlite3 polymarket.db "SELECT * FROM daily_spending WHERE date = date('now');"
```

### Logs to Watch For

```
✅ Position copied successfully! - Good, trade executed
❌ Failed to copy position - Check error message
⚠️  DRY RUN MODE - Simulation only
📊 New position detected - Target made a trade
```

## 🛑 Stop the Bot

Press `Ctrl+C` to gracefully shutdown. The bot will:
- Stop monitoring
- Close database connections
- Print final statistics

## ⚙️ Configuration Tips

### Conservative (Recommended for Start)
```env
TARGET_BALANCE=0            # Auto-fetch target's balance
MAX_TRADE_SIZE=10           # $10 max per trade
DAILY_SPENDING_LIMIT=50     # $50 per day
```

### Moderate
```env
TARGET_BALANCE=0            # Auto-fetch target's balance
MAX_TRADE_SIZE=100          # $100 max per trade
DAILY_SPENDING_LIMIT=500    # $500 per day
```

### Aggressive (Use with caution!)
```env
TARGET_BALANCE=0            # Auto-fetch target's balance
MAX_TRADE_SIZE=500          # $500 max per trade
DAILY_SPENDING_LIMIT=2000   # $2000 per day
```

## 🔍 Finding Target Wallet Address

### Method 1: Polymarket Profile
1. Go to target's profile (e.g., https://polymarket.com/@distinct-baguette)
2. Open browser DevTools (F12)
3. Go to Network tab
4. Refresh page
5. Look for API calls containing wallet address

### Method 2: Block Explorer
1. If you know any transaction from the target
2. Use Polygonscan.com to trace wallet address

### Method 3: Ask the Community
- Polymarket Discord
- Twitter/X
- Reddit r/Polymarket

## 💰 Getting USDC on Polygon

1. **Buy USDC** on exchange (Coinbase, Binance, etc.)
2. **Bridge to Polygon**:
   - Use official Polygon Bridge: https://portal.polygon.technology/
   - Or use Polymarket's built-in bridge
3. **Verify Balance**: Check your wallet has USDC on Polygon network

## 🆘 Common Issues

### "Missing required environment variable"
- Check `.env` file exists in project root
- Verify all required variables are set

### "Insufficient balance"
- Ensure you have USDC on Polygon (not Ethereum mainnet!)
- Check balance: https://polygonscan.com/

### "Failed to fetch target positions"
- Verify `TARGET_WALLET` address is correct
- Check target has open positions on Polymarket
- Try increasing `POLL_INTERVAL` to avoid rate limits

### "Invalid PRIVATE_KEY format"
- Must start with `0x`
- Must be 66 characters (including 0x)
- Export from MetaMask: Settings → Security → Reveal Private Key

## 📈 Success Metrics

After 7 days of running:
- Check total trades executed
- Compare your positions vs. target's positions
- Review daily spending history
- Calculate ROI on copied trades

## 🔐 Security Checklist

- [ ] Never commit `.env` to git
- [ ] Store private key securely (consider hardware wallet)
- [ ] Start with small amounts
- [ ] Use low daily limits initially
- [ ] Monitor bot daily for first week
- [ ] Keep USDC wallet separate from main holdings

## 🎯 Next Steps

1. ✅ Configure `.env` with your settings
2. ✅ Run in dry mode for 24h
3. ✅ Verify trades are detected correctly
4. ✅ Check database logs
5. ✅ Go live with small amounts
6. ✅ Gradually increase limits as confidence grows

---

**Need help?** Check README.md for detailed documentation.

**Questions?** Review the troubleshooting section in README.md
