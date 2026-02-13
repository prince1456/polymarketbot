// API Base URL
const API_URL = 'http://localhost:3000';

// State
let botRunning = false;
let ws = null;

// Load configuration from localStorage on page load
document.addEventListener('DOMContentLoaded', () => {
    loadConfiguration();
    initializeEventListeners();
    connectWebSocket();
    fetchInitialData();
});

// Load configuration from localStorage
function loadConfiguration() {
    const config = {
        targetWallet: localStorage.getItem('targetWallet') || '',
        privateKey: localStorage.getItem('privateKey') || '',
        targetBalance: localStorage.getItem('targetBalance') || '200000',
        maxTradeSize: localStorage.getItem('maxTradeSize') || '100',
        dailySpendingLimit: localStorage.getItem('dailySpendingLimit') || '500',
        minLiquidityRatio: localStorage.getItem('minLiquidityRatio') || '10',
        dryRun: localStorage.getItem('dryRun') !== 'false',
        notifications: localStorage.getItem('notifications') === 'true'
    };

    document.getElementById('target-wallet').value = config.targetWallet;
    document.getElementById('private-key').value = config.privateKey;
    document.getElementById('target-balance').value = config.targetBalance;
    document.getElementById('max-trade-size').value = config.maxTradeSize;
    document.getElementById('daily-spending-limit').value = config.dailySpendingLimit;
    document.getElementById('min-liquidity-ratio').value = config.minLiquidityRatio;
    document.getElementById('dry-run-toggle').checked = config.dryRun;
    document.getElementById('notifications-toggle').checked = config.notifications;

    if (config.targetWallet) {
        updateTargetWalletDisplay(config.targetWallet);
    }
}

// Save configuration to localStorage
function saveConfiguration() {
    const config = {
        targetWallet: document.getElementById('target-wallet').value,
        privateKey: document.getElementById('private-key').value,
        targetBalance: document.getElementById('target-balance').value,
        maxTradeSize: document.getElementById('max-trade-size').value,
        dailySpendingLimit: document.getElementById('daily-spending-limit').value,
        minLiquidityRatio: document.getElementById('min-liquidity-ratio').value,
        dryRun: document.getElementById('dry-run-toggle').checked,
        notifications: document.getElementById('notifications-toggle').checked
    };

    // Validate configuration
    if (!config.targetWallet || !config.targetWallet.startsWith('0x')) {
        showNotification('Invalid target wallet address', 'error');
        return false;
    }

    if (!config.privateKey || !config.privateKey.startsWith('0x')) {
        showNotification('Invalid private key', 'error');
        return false;
    }

    // Save to localStorage
    Object.keys(config).forEach(key => {
        localStorage.setItem(key, config[key]);
    });

    updateTargetWalletDisplay(config.targetWallet);
    showNotification('Configuration saved successfully', 'success');
    return true;
}

// Initialize event listeners
function initializeEventListeners() {
    // Save configuration
    document.getElementById('save-config-btn').addEventListener('click', saveConfiguration);

    // Start/Stop bot
    document.getElementById('start-bot-btn').addEventListener('click', startBot);
    document.getElementById('stop-bot-btn').addEventListener('click', stopBot);

    // Connect wallet modal
    document.getElementById('connect-wallet-btn').addEventListener('click', () => {
        document.getElementById('wallet-modal').style.display = 'flex';
    });

    document.getElementById('close-modal').addEventListener('click', () => {
        document.getElementById('wallet-modal').style.display = 'none';
    });

    document.getElementById('cancel-connect').addEventListener('click', () => {
        document.getElementById('wallet-modal').style.display = 'none';
    });

    document.getElementById('confirm-connect').addEventListener('click', () => {
        const privateKey = document.getElementById('modal-private-key').value;
        if (privateKey && privateKey.startsWith('0x')) {
            document.getElementById('private-key').value = privateKey;
            localStorage.setItem('privateKey', privateKey);
            document.getElementById('wallet-modal').style.display = 'none';
            showNotification('Wallet connected', 'success');
        } else {
            showNotification('Invalid private key', 'error');
        }
    });

    // Refresh buttons
    document.getElementById('refresh-target-positions-btn').addEventListener('click', fetchTargetPositions);
    document.getElementById('refresh-positions-btn').addEventListener('click', fetchPositions);
    document.getElementById('refresh-trades-btn').addEventListener('click', fetchTrades);

    // Clear log
    document.getElementById('clear-log-btn').addEventListener('click', () => {
        const logContainer = document.getElementById('activity-log');
        logContainer.innerHTML = '<div class="log-entry"><span class="log-time">--:--:--</span><span class="log-message">Log cleared</span></div>';
    });
}

// WebSocket connection
function connectWebSocket() {
    ws = new WebSocket('ws://localhost:3000');

    ws.onopen = () => {
        addLogEntry('Connected to bot server', 'success');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    ws.onclose = () => {
        addLogEntry('Disconnected from server. Reconnecting...', 'error');
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'status':
            updateBotStatus(data.status);
            break;
        case 'newPosition':
            addLogEntry(`New position detected: ${data.position.outcome} on ${data.position.marketId}`, 'info');
            fetchPositions();
            break;
        case 'tradeExecuted':
            addLogEntry(`Trade executed: ${data.trade.outcome} for $${data.trade.ourAmount.toFixed(2)}`, 'success');
            fetchTrades();
            fetchStats();
            showNotification('Trade executed successfully', 'success');
            break;
        case 'tradeRejected':
            addLogEntry(`Trade rejected: ${data.reason}`, 'warning');
            break;
        case 'error':
            addLogEntry(`Error: ${data.message}`, 'error');
            showNotification(data.message, 'error');
            break;
        case 'log':
            addLogEntry(data.message, data.level || 'info');
            break;
    }
}

// Start bot
async function startBot() {
    if (!saveConfiguration()) {
        return;
    }

    try {
        const config = {
            targetWallet: localStorage.getItem('targetWallet'),
            privateKey: localStorage.getItem('privateKey'),
            targetBalance: parseFloat(localStorage.getItem('targetBalance')) || 200000,
            maxTradeSize: parseFloat(localStorage.getItem('maxTradeSize')),
            dailySpendingLimit: parseFloat(localStorage.getItem('dailySpendingLimit')),
            minLiquidityRatio: parseFloat(localStorage.getItem('minLiquidityRatio')) / 100,
            dryRun: localStorage.getItem('dryRun') !== 'false'
        };

        const response = await fetch(`${API_URL}/api/bot/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const result = await response.json();

        if (result.success) {
            botRunning = true;
            updateUIForRunningBot();
            showNotification('Bot started successfully', 'success');
            addLogEntry('Bot started', 'success');
        } else {
            showNotification('Failed to start bot: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Failed to connect to server', 'error');
        console.error(error);
    }
}

// Stop bot
async function stopBot() {
    try {
        const response = await fetch(`${API_URL}/api/bot/stop`, {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            botRunning = false;
            updateUIForStoppedBot();
            showNotification('Bot stopped', 'success');
            addLogEntry('Bot stopped', 'info');
        }
    } catch (error) {
        showNotification('Failed to stop bot', 'error');
        console.error(error);
    }
}

// Fetch initial data
async function fetchInitialData() {
    await fetchStats();
    await fetchTargetPositions();
    await fetchPositions();
    await fetchTrades();
    await checkBotStatus();
}

// Fetch stats
async function fetchStats() {
    try {
        const response = await fetch(`${API_URL}/api/stats`);
        const stats = await response.json();

        document.getElementById('total-trades').textContent = stats.totalTrades || 0;
        document.getElementById('today-spending').textContent = `$${(stats.todaySpending || 0).toFixed(2)}`;
        document.getElementById('total-spent').textContent = `$${(stats.totalSpent || 0).toFixed(2)}`;
        document.getElementById('usdc-balance').textContent = `$${(stats.balance || 0).toFixed(2)}`;
    } catch (error) {
        console.error('Failed to fetch stats:', error);
    }
}

// Fetch target wallet positions
async function fetchTargetPositions() {
    try {
        const targetWallet = localStorage.getItem('targetWallet');

        if (!targetWallet) {
            const container = document.getElementById('target-positions-list');
            container.innerHTML = '<div class="empty-state"><p>Please configure target wallet first</p><small>Enter target wallet address in configuration above</small></div>';
            return;
        }

        addLogEntry('Fetching target wallet positions...', 'info');

        const response = await fetch(`${API_URL}/api/target/positions?wallet=${targetWallet}`);
        const positions = await response.json();

        const container = document.getElementById('target-positions-list');

        if (positions.error) {
            container.innerHTML = `<div class="empty-state"><p>Error: ${positions.error}</p></div>`;
            addLogEntry(`Failed to fetch target positions: ${positions.error}`, 'error');
            return;
        }

        if (!positions || positions.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No open positions found for target wallet</p><small>Target wallet may not have any active positions on Polymarket</small></div>';
            addLogEntry('No positions found for target wallet', 'warning');
            return;
        }

        addLogEntry(`Found ${positions.length} positions for target wallet`, 'success');

        container.innerHTML = positions.map(pos => {
            const pnlColor = pos.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
            const pnlSign = pos.pnl >= 0 ? '+' : '';
            return `
            <div class="position-item">
                <div class="position-market">
                    <div style="font-weight: 500; margin-bottom: 4px;">${pos.market || truncateString(pos.marketId, 40)}</div>
                    <span class="position-outcome ${pos.outcome.toLowerCase()}">${pos.outcome}</span>
                </div>
                <div class="position-detail">
                    <div class="position-detail-label">Size</div>
                    <div class="position-detail-value">${pos.size.toFixed(0)}</div>
                </div>
                <div class="position-detail">
                    <div class="position-detail-label">Avg Price</div>
                    <div class="position-detail-value">$${(pos.avgPrice || pos.price).toFixed(3)}</div>
                </div>
                <div class="position-detail">
                    <div class="position-detail-label">Current</div>
                    <div class="position-detail-value">$${pos.price.toFixed(3)}</div>
                </div>
                <div class="position-detail">
                    <div class="position-detail-label">Value</div>
                    <div class="position-detail-value">$${pos.value.toFixed(2)}</div>
                </div>
                <div class="position-detail">
                    <div class="position-detail-label">PnL</div>
                    <div class="position-detail-value" style="color: ${pnlColor}">
                        ${pnlSign}$${pos.pnl.toFixed(2)}<br>
                        <small>(${pnlSign}${pos.percentPnl.toFixed(1)}%)</small>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Failed to fetch target positions:', error);
        addLogEntry('Failed to fetch target positions', 'error');
        const container = document.getElementById('target-positions-list');
        container.innerHTML = '<div class="empty-state"><p>Failed to load positions</p><small>Check console for details</small></div>';
    }
}

// Fetch positions
async function fetchPositions() {
    try {
        const response = await fetch(`${API_URL}/api/positions`);
        const positions = await response.json();

        const container = document.getElementById('positions-list');

        if (positions.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No active positions yet</p><small>Positions will appear here when the bot detects and copies trades</small></div>';
            return;
        }

        container.innerHTML = positions.map(pos => `
            <div class="position-item">
                <div class="position-market">
                    ${truncateString(pos.marketId, 30)}
                    <span class="position-outcome ${pos.outcome.toLowerCase()}">${pos.outcome}</span>
                </div>
                <div class="position-detail">
                    <div class="position-detail-label">Size</div>
                    <div class="position-detail-value">${pos.size.toFixed(2)}</div>
                </div>
                <div class="position-detail">
                    <div class="position-detail-label">Price</div>
                    <div class="position-detail-value">$${pos.price.toFixed(2)}</div>
                </div>
                <div class="position-detail">
                    <div class="position-detail-label">Value</div>
                    <div class="position-detail-value">$${pos.value.toFixed(2)}</div>
                </div>
                <div class="position-detail">
                    <div class="position-detail-label">Time</div>
                    <div class="position-detail-value">${formatTimestamp(pos.timestamp)}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to fetch positions:', error);
    }
}

// Fetch trades
async function fetchTrades() {
    try {
        const response = await fetch(`${API_URL}/api/trades`);
        const trades = await response.json();

        const container = document.getElementById('trades-list');

        if (trades.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No trades executed yet</p><small>Trade history will appear here</small></div>';
            return;
        }

        container.innerHTML = trades.map(trade => `
            <div class="trade-item">
                <div class="position-market">
                    ${truncateString(trade.marketId, 30)}
                    <span class="position-outcome ${trade.outcome.toLowerCase()}">${trade.outcome}</span>
                </div>
                <div class="position-detail">
                    <div class="position-detail-label">Amount</div>
                    <div class="position-detail-value">$${trade.ourAmount.toFixed(2)}</div>
                </div>
                <div class="position-detail">
                    <div class="position-detail-label">Price</div>
                    <div class="position-detail-value">$${trade.price.toFixed(2)}</div>
                </div>
                <div class="position-detail">
                    <div class="position-detail-label">Target Amount</div>
                    <div class="position-detail-value">$${trade.targetAmount.toFixed(2)}</div>
                </div>
                <div class="position-detail">
                    <div class="position-detail-label">Time</div>
                    <div class="position-detail-value">${formatDate(trade.timestamp)}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to fetch trades:', error);
    }
}

// Check bot status
async function checkBotStatus() {
    try {
        const response = await fetch(`${API_URL}/api/bot/status`);
        const status = await response.json();
        botRunning = status.running;

        if (botRunning) {
            updateUIForRunningBot();
        } else {
            updateUIForStoppedBot();
        }
    } catch (error) {
        console.error('Failed to check bot status:', error);
    }
}

// UI Updates
function updateBotStatus(status) {
    const badge = document.getElementById('bot-status');
    const statusText = badge.querySelector('.status-text');

    badge.className = 'status-badge';

    if (status === 'running') {
        badge.classList.add('connected');
        statusText.textContent = 'Running';
    } else if (status === 'stopped') {
        statusText.textContent = 'Stopped';
    } else if (status === 'error') {
        badge.classList.add('error');
        statusText.textContent = 'Error';
    } else {
        statusText.textContent = 'Disconnected';
    }
}

function updateUIForRunningBot() {
    document.getElementById('start-bot-btn').style.display = 'none';
    document.getElementById('stop-bot-btn').style.display = 'inline-block';
    updateBotStatus('running');
}

function updateUIForStoppedBot() {
    document.getElementById('start-bot-btn').style.display = 'inline-block';
    document.getElementById('stop-bot-btn').style.display = 'none';
    updateBotStatus('stopped');
}

function updateTargetWalletDisplay(wallet) {
    const display = document.getElementById('target-wallet-display');
    display.textContent = truncateWallet(wallet);
}

// Logging
function addLogEntry(message, level = 'info') {
    const logContainer = document.getElementById('activity-log');
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;

    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-message">${message}</span>
    `;

    logContainer.insertBefore(entry, logContainer.firstChild);

    // Keep only last 50 entries
    while (logContainer.children.length > 50) {
        logContainer.removeChild(logContainer.lastChild);
    }

    // Browser notification
    if (level === 'success' && localStorage.getItem('notifications') === 'true') {
        showBrowserNotification('Polymarket Mirror', message);
    }
}

// Notifications
function showNotification(message, type = 'info') {
    // For now, just log to activity
    addLogEntry(message, type);
}

function showBrowserNotification(title, message) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: message });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification(title, { body: message });
            }
        });
    }
}

// Utility functions
function truncateWallet(wallet) {
    if (!wallet) return '...';
    return `${wallet.substring(0, 6)}...${wallet.substring(wallet.length - 4)}`;
}

function truncateString(str, length) {
    if (!str) return '...';
    if (str.length <= length) return str;
    return `${str.substring(0, length)}...`;
}

function formatTimestamp(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString();
}

// Auto-refresh data every 10 seconds
setInterval(() => {
    if (botRunning) {
        fetchStats();
        fetchTargetPositions();
        fetchPositions();
    }
}, 10000);
