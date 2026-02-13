# Web Dashboard Guide

The Polymarket Mirror Bot now includes a modern web dashboard for easy configuration and monitoring.

## Features

✅ **No Authentication Required** - Single-page app, all settings stored in browser
✅ **LocalStorage Configuration** - No .env file needed, configure directly in UI
✅ **Real-time Updates** - WebSocket connection for live trade notifications
✅ **Dark Theme UI** - Clean, modern interface inspired by Polymarket
✅ **Live Statistics** - View balance, trades, and spending in real-time
✅ **Activity Log** - Monitor bot activity with timestamped logs
✅ **Trade History** - See all executed trades with details
✅ **Position Tracking** - View active positions from target wallet

## Quick Start

### 1. Start the Web Server

```bash
npm run web
```

Or for development with auto-reload:

```bash
npm run web:dev
```

### 2. Open Dashboard

Open your browser and navigate to:

```
http://localhost:3000
```

### 3. Configure Bot

1. **Fill in Configuration:**
   - Target Wallet: The wallet address you want to copy (e.g., `0x...`)
   - Private Key: Your wallet private key (stored only in browser)
   - Target Balance: Target trader's estimated total balance in USD (e.g., 200000)
   - Max Trade Size: Maximum $ per single trade (e.g., 100)
   - Daily Spending Limit: Maximum $ per day (e.g., 500)
   - Min Liquidity Ratio: Minimum market liquidity % (e.g., 10%)

2. **Toggle Settings:**
   - **Dry Run Mode**: ✅ Always enable for testing first!
   - **Browser Notifications**: Get alerts when trades execute

3. **Click "Save Configuration"**

### 4. Connect Wallet

Click "Connect Wallet" button in the top right, enter your private key.

⚠️ **Security Note**: Your private key is stored in browser localStorage only, never sent to any server.

### 5. Start Bot

Click **"Start Bot"** button to begin monitoring and trading.

## Dashboard Sections

### Header

- **Bot Status Badge**: Shows if bot is Running/Stopped/Error
- **Connect Wallet Button**: Quick access to wallet connection

### Configuration Panel

Configure all bot settings directly in the UI:
- All values saved to browser localStorage
- Changes take effect on next bot start
- No need to edit .env files

### Statistics Overview

Four stat cards showing:
- **Total Trades**: Lifetime trade count
- **Today's Spending**: Current day spending
- **Total Spent (30d)**: Last 30 days spending
- **USDC Balance**: Current wallet balance

Updates automatically every 10 seconds while bot runs.

### Active Positions

Shows positions detected from target wallet:
- Market name/ID
- Outcome (YES/NO)
- Size and Price
- Total Value
- Time detected

### Trade History

List of all executed trades:
- What was traded
- Amount spent
- Target's amount (for comparison)
- Execution time
- Shows last 20 trades

### Activity Log

Real-time activity feed:
- Color-coded by severity (success, error, warning, info)
- Timestamped entries
- Automatically pruned to last 50 entries
- Clear button to reset log

## Using the Dashboard

### Starting the Bot

1. Ensure configuration is saved
2. Click "Start Bot"
3. Watch activity log for confirmation
4. Status badge changes to "Running" (green)

### Monitoring

While running:
- Statistics update every 10 seconds
- New positions show immediately
- Trade executions appear in real-time
- Activity log shows all events

### Stopping the Bot

1. Click "Stop Bot" (red button appears when running)
2. Bot stops monitoring gracefully
3. Status changes to "Stopped"
4. Final stats shown in activity log

### Refreshing Data

Use "Refresh" buttons to manually update:
- Positions list
- Trade history

## Security & Privacy

### LocalStorage

All configuration stored in browser localStorage:
- Private key encrypted in browser
- Settings persist across sessions
- No server storage
- Cleared when you clear browser data

### Private Key Safety

⚠️ **Important Security Notes:**

1. **Never share your private key**
2. **Use a dedicated wallet** for bot trading
3. **Start with small amounts**
4. **Enable Dry Run first**
5. **Clear browser data** when done on shared computers

### Data Transmission

- Configuration sent to local server only (localhost:3000)
- WebSocket connection is local only
- No external API calls for config
- Trade execution uses Polymarket's API

## Dry Run Mode

**Always test in Dry Run first!**

When enabled:
- ✅ Bot monitors target wallet normally
- ✅ Detects new positions
- ✅ Validates trades with risk checks
- ✅ Logs everything to database
- ❌ **DOES NOT** execute real trades
- Shows "(DRY RUN)" in activity log

### How to Test

1. Enable "Dry Run Mode" toggle
2. Save configuration
3. Start bot
4. Wait for target to make trades
5. Verify detection works correctly
6. Check logs show validation passing
7. Review simulated trades in history

### Going Live

**Only after successful dry run testing:**

1. Toggle off "Dry Run Mode"
2. Set conservative limits:
   - Max Trade Size: $10-20
   - Daily Limit: $50-100
3. Save configuration
4. Start bot
5. Monitor closely for first day

## Troubleshooting

### Dashboard Won't Load

```bash
# Check server is running
npm run web

# Should see:
# 🚀 Bot Server Running
#    Dashboard: http://localhost:3000
```

### "Failed to connect to server"

1. Ensure server is running (`npm run web`)
2. Check port 3000 is not in use
3. Refresh browser page
4. Check browser console for errors

### WebSocket Connection Failed

1. WebSocket uses same port as HTTP (3000)
2. Some firewalls block WebSocket
3. Try disabling browser extensions
4. Check browser console for details

### Configuration Not Saving

1. Check browser allows localStorage
2. Ensure not in Private/Incognito mode
3. Check browser storage isn't full
4. Try different browser

### Bot Won't Start

1. Verify all required fields filled
2. Check private key format (0x...)
3. Check target wallet format (0x...)
4. Look at activity log for error details
5. Check browser console (F12)

### No Positions Detected

1. Verify target wallet has positions on Polymarket
2. Check target wallet address is correct
3. Wait 60 seconds for first poll
4. Check activity log for errors
5. Try clicking "Refresh Positions"

### Balance Shows $0.00

1. Ensure you have USDC on Polygon network
2. Check wallet address is correct
3. Verify private key matches wallet
4. May take a moment to load on first start

## Browser Compatibility

### Supported Browsers

✅ Chrome/Edge (Recommended)
✅ Firefox
✅ Safari
⚠️ Brave (may need to allow WebSocket)

### Requirements

- JavaScript enabled
- LocalStorage enabled
- WebSocket support
- ES6+ support

## Advanced Tips

### Multiple Wallets

To copy multiple traders:
1. Open dashboard in separate browser profiles
2. Each profile has its own localStorage
3. Configure different target wallets
4. Run multiple bot instances on different ports

### Keyboard Shortcuts

- `Ctrl+Shift+R` - Hard refresh dashboard
- `F12` - Open browser developer tools
- `Ctrl+L` - Focus address bar

### Developer Tools

Access browser console (F12) to:
- See detailed logs
- Check API requests
- Debug WebSocket messages
- Inspect localStorage

### Export Configuration

```javascript
// In browser console:
console.log(JSON.stringify(localStorage));

// To import later:
// Copy values manually or paste JSON
```

## Performance

### Resource Usage

- **CPU**: Minimal, only during position checks
- **Memory**: ~50MB for dashboard
- **Network**: WebSocket + API polls every 60s

### Optimization

- Close unused browser tabs
- Keep only one dashboard instance open
- Clear activity log periodically
- Restart browser if sluggish

## FAQ

**Q: Is my private key safe?**
A: It's stored in browser localStorage only, never sent to external servers. But use at your own risk.

**Q: Can I use this on mobile?**
A: Yes, but desktop recommended for better experience.

**Q: Does the bot need to stay open?**
A: Yes, keep the browser tab open while bot runs.

**Q: What happens if I close the browser?**
A: Bot stops. Configuration persists in localStorage.

**Q: Can I run multiple bots?**
A: Yes, use different browser profiles or ports.

**Q: Do I still need .env file?**
A: No! Web dashboard uses localStorage instead.

**Q: Will trades show on Polymarket?**
A: Yes, bot uses your real wallet to trade on Polymarket.

**Q: Can I manually stop a trade?**
A: No, but you can stop the bot before trade executes.

## Next Steps

1. ✅ Start web server
2. ✅ Configure bot in dashboard
3. ✅ Test in Dry Run mode
4. ✅ Monitor for 24 hours
5. ✅ Go live with small limits
6. ✅ Gradually increase as confidence grows

---

**Need Help?**

- Check main README.md for detailed bot documentation
- Review QUICKSTART.md for setup guides
- Open browser console (F12) for error details
