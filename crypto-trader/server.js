const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data', 'trades.json');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
        capital: 0,
        trades: []
    }, null, 2));
}

// Helper functions
function readData() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { capital: 0, trades: [] };
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ==================== API Routes ====================

// Get all data
app.get('/api/data', (req, res) => {
    const data = readData();
    res.json(data);
});

// Get capital
app.get('/api/capital', (req, res) => {
    const data = readData();
    res.json({ capital: data.capital });
});

// Set capital
app.post('/api/capital', (req, res) => {
    const { capital } = req.body;
    const data = readData();
    data.capital = parseFloat(capital) || 0;
    writeData(data);
    res.json({ success: true, capital: data.capital });
});

// Get all trades
app.get('/api/trades', (req, res) => {
    const data = readData();
    res.json(data.trades);
});

// Add a new trade
app.post('/api/trades', (req, res) => {
    const { pair, buyPrice, positionSize, sellPrice, type, direction, fee } = req.body;
    const data = readData();
    
    // Calculate PnL
    let pnl = 0;
    if (sellPrice && sellPrice > 0) {
        if (direction === 'long') {
            pnl = (sellPrice - buyPrice) * positionSize;
        } else {
            pnl = (buyPrice - sellPrice) * positionSize;
        }
    }

    const trade = {
        id: Date.now(),
        date: new Date().toLocaleString('zh-CN'),
        pair,
        buyPrice: parseFloat(buyPrice),
        positionSize: parseFloat(positionSize) || 1,
        sellPrice: sellPrice ? parseFloat(sellPrice) : null,
        pnl,
        type,
        direction,
        fee: parseFloat(fee) || 0
    };

    data.trades.push(trade);
    writeData(data);
    
    res.json({ success: true, trade });
});

// Update a trade
app.put('/api/trades/:id', (req, res) => {
    const { id } = req.params;
    const { pair, buyPrice, positionSize, sellPrice, type, direction, fee } = req.body;
    const data = readData();
    
    const index = data.trades.findIndex(t => t.id === parseInt(id));
    if (index === -1) {
        return res.status(404).json({ error: 'Trade not found' });
    }

    // Recalculate PnL
    let pnl = 0;
    if (sellPrice && sellPrice > 0) {
        if (direction === 'long') {
            pnl = (sellPrice - buyPrice) * positionSize;
        } else {
            pnl = (buyPrice - sellPrice) * positionSize;
        }
    }

    const updatedTrade = {
        ...data.trades[index],
        pair,
        buyPrice: parseFloat(buyPrice),
        positionSize: parseFloat(positionSize) || 1,
        sellPrice: sellPrice ? parseFloat(sellPrice) : null,
        pnl,
        type,
        direction,
        fee: parseFloat(fee) || 0
    };

    data.trades[index] = updatedTrade;
    writeData(data);
    
    res.json({ success: true, trade: updatedTrade });
});

// Delete a trade
app.delete('/api/trades/:id', (req, res) => {
    const { id } = req.params;
    const data = readData();
    
    const index = data.trades.findIndex(t => t.id === parseInt(id));
    if (index === -1) {
        return res.status(404).json({ error: 'Trade not found' });
    }

    data.trades.splice(index, 1);
    writeData(data);
    
    res.json({ success: true });
});

// Get statistics
app.get('/api/stats', (req, res) => {
    const data = readData();
    const trades = data.trades;
    
    const limitCount = trades.filter(t => t.type === 'limit').length;
    const marketCount = trades.filter(t => t.type === 'market').length;
    const longCount = trades.filter(t => t.direction === 'long').length;
    const shortCount = trades.filter(t => t.direction === 'short').length;
    const totalFee = trades.reduce((sum, t) => sum + t.fee, 0);
    
    const closedTrades = trades.filter(t => t.sellPrice && t.sellPrice > 0);
    const totalPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
    
    let maxProfit = 0;
    let maxLoss = 0;
    if (closedTrades.length > 0) {
        const pnls = closedTrades.map(t => t.pnl);
        maxProfit = Math.max(...pnls);
        maxLoss = Math.min(...pnls);
    }
    
    const winningTrades = closedTrades.filter(t => t.pnl > 0).length;
    const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length * 100) : 0;
    
    const currentEquity = data.capital - totalFee + totalPnl;
    const profitRate = data.capital > 0 ? ((currentEquity - data.capital) / data.capital * 100) : 0;

    res.json({
        totalTrades: trades.length,
        limitOrders: limitCount,
        marketOrders: marketCount,
        longCount,
        shortCount,
        totalFee,
        currentEquity,
        profitRate,
        maxProfit,
        maxLoss,
        winRate
    });
});

// Clear all trades
app.delete('/api/trades', (req, res) => {
    const data = readData();
    data.trades = [];
    writeData(data);
    res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Crypto Trader Backend running on http://localhost:${PORT}`);
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
