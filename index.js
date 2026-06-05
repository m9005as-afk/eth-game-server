const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");

const app = express();
const server = http.createServer(app);

// ✅ استخدام port من Railway أو 3000 افتراضي
const PORT = process.env.PORT || 3000;

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// =========================
// 🎮 بيانات اللعبة
// =========================
let countdown = 60;
let isFrozen = false;
let userCount = 0;
let red = 0, green = 0, purple = 0;
let lastNumbers = [];

// 💰 السعر
let currentPrice = "0.00";
let lastRealPrice = 0;

// 🚫 متغيرات منع التكرار
let resultSent = false;
let roundNumber = 0;
let lastResultTime = 0;
let isRoundEnding = false;
let isRoundActive = true;

// 🆕 متغيرات إضافية للتحكم
let gameInterval = null;
let resetTimeout = null;

// =========================
// 🔌 معالجة اتصالات Socket.IO
// =========================
io.on("connection", (socket) => {
    console.log(`✅ Player connected: ${socket.id}`);
    console.log(`👥 Total connected: ${io.engine.clientsCount}`);

    // إرسال الحالة الحالية فوراً للاعب الجديد
    socket.emit("update", {
        countdown: countdown,
        userCount: userCount,
        red: red,
        green: green,
        purple: purple,
        price: currentPrice,
        isRoundActive: isRoundActive && !isRoundEnding
    });

    // إرسال السجل
    socket.emit("history", lastNumbers.slice(0, 10));

    socket.on("disconnect", (reason) => {
        console.log(`❌ Player disconnected: ${socket.id} - Reason: ${reason}`);
        console.log(`👥 Total connected: ${io.engine.clientsCount}`);
    });

    socket.on("error", (error) => {
        console.error(`⚠️ Socket error from ${socket.id}:`, error.message);
    });
});

// =========================
// 🔥 جلب السعر الحقيقي كل 10 ثواني
// =========================
async function fetchRealPrice() {
    try {
        const res = await axios.get(
            "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
            { timeout: 10000 }
        );
        if (res.data && res.data.ethereum && res.data.ethereum.usd) {
            lastRealPrice = res.data.ethereum.usd;
            console.log(`💰 REAL PRICE: $${lastRealPrice}`);
        }
    } catch (e) {
        console.log(`⚠️ API ERROR: ${e.message}`);
        // إذا فشل API، استخدم سعر افتراضي
        if (lastRealPrice === 0) {
            lastRealPrice = 3500.00;
        }
    }
}

// جلب السعر الأول
fetchRealPrice();
// جلب السعر كل 10 ثواني
setInterval(fetchRealPrice, 10000);

// =========================
// 🔥 تحريك السعر كل ثانية
// =========================
setInterval(() => {
    if (lastRealPrice > 0) {
        // حركة أكثر واقعية
        let move = (Math.random() * 6 - 3); // ±3 بدلاً من ±2
        let newPrice = lastRealPrice + move;
        currentPrice = newPrice.toFixed(2);
    } else if (currentPrice === "0.00") {
        currentPrice = "3500.00";
    }
}, 1000);

// =========================
// 🎮 منطق اللعبة الرئيسي
// =========================
function startGameLoop() {
    if (gameInterval) {
        clearInterval(gameInterval);
    }

    gameInterval = setInterval(() => {
        // 🚫 إذا كانت الجولة في مرحلة النهاية، لا تفعل شيئاً
        if (isRoundEnding) {
            return;
        }

        countdown--;

        // تجميد الرهانات عند 20 ثانية
        if (countdown === 20 && !isFrozen) {
            isFrozen = true;
            console.log(`🔒 Round #${roundNumber + 1} - Betting FROZEN at ${countdown}s`);
        }

        // تحديث الإحصائيات قبل التجميد
        if (!isFrozen && countdown > 0) {
            userCount += Math.floor(Math.random() * 10) + 5;
            red += Math.floor(Math.random() * 50) + 10;
            green += Math.floor(Math.random() * 50) + 10;
            purple += Math.floor(Math.random() * 50) + 10;
        }

        // 🔥 نهاية الجولة
        if (countdown <= 0 && !resultSent && !isRoundEnding) {
            endRound();
        }

        // 🔥 إرسال التحديث
        sendUpdate();

    }, 1000);
}

function endRound() {
    // 🚫 قفل الجولة
    isRoundEnding = true;
    resultSent = true;
    isRoundActive = false;
    roundNumber++;

    // الحصول على الرقم الفائز من آخر رقم في السعر
    let priceStr = currentPrice.toString();
    let lastDigit = priceStr.slice(-1);
    
    // التأكد من أن الرقم صالح
    if (isNaN(lastDigit) || lastDigit === "" || lastDigit === ".") {
        lastDigit = Math.floor(Math.random() * 10).toString();
    }

    let resultTime = Date.now();
    lastResultTime = resultTime;

    // إضافة للسجل
    lastNumbers.unshift(parseInt(lastDigit));
    if (lastNumbers.length > 20) lastNumbers = lastNumbers.slice(0, 20);

    console.log(`═══════════════════════════════════════`);
    console.log(`🏆 ROUND #${roundNumber} ENDED`);
    console.log(`📅 Time: ${new Date(resultTime).toISOString()}`);
    console.log(`🎯 Winning Number: ${lastDigit}`);
    console.log(`💰 Full Price: $${currentPrice}`);
    console.log(`👥 Total Players: ${userCount}`);
    console.log(`💵 Bets - Red: $${red}, Green: $${green}, Purple: $${purple}`);
    console.log(`📊 History: [${lastNumbers.slice(0, 10).join(', ')}]`);
    console.log(`═══════════════════════════════════════`);

    // ✅ إرسال النتيجة
    io.emit("result", {
        digit: lastDigit,
        price: currentPrice,
        history: lastNumbers.slice(0, 10),
        roundNumber: roundNumber,
        timestamp: resultTime,
        bets: {
            red: red,
            green: green,
            purple: purple
        }
    });

    // 🆕 إرسال تحديث نهائي
    io.emit("update", {
        countdown: 0,
        userCount: userCount,
        red: red,
        green: green,
        purple: purple,
        price: currentPrice,
        isRoundActive: false,
        winningNumber: parseInt(lastDigit)
    });

    // إعادة تعيين بعد 5 ثواني
    if (resetTimeout) {
        clearTimeout(resetTimeout);
    }

    resetTimeout = setTimeout(() => {
        resetRound();
    }, 5000);
}

function resetRound() {
    console.log(`🔄 Resetting for round #${roundNumber + 1}`);
    
    countdown = 60;
    isFrozen = false;
    userCount = Math.floor(Math.random() * 50) + 20;
    red = 0;
    green = 0;
    purple = 0;
    resultSent = false;
    isRoundEnding = false;
    isRoundActive = true;

    // إشعار ببدء جولة جديدة
    io.emit("update", {
        countdown: countdown,
        userCount: userCount,
        red: 0,
        green: 0,
        purple: 0,
        price: currentPrice,
        isRoundActive: true
    });

    console.log(`✅ Round #${roundNumber + 1} READY - Countdown: ${countdown}s`);
}

function sendUpdate() {
    if (!isRoundEnding) {
        io.emit("update", {
            countdown: countdown,
            userCount: userCount,
            red: red,
            green: green,
            purple: purple,
            price: currentPrice,
            isRoundActive: true
        });
    }
}

// =========================
// 🛡️ حماية إضافية - إعادة تعيين طارئ
// =========================
setInterval(() => {
    if (isRoundEnding) {
        const timeSinceLastResult = Date.now() - lastResultTime;
        if (timeSinceLastResult > 15000) {
            console.warn(`⚠️ FORCE RESET - Round stuck for ${timeSinceLastResult}ms`);
            resetRound();
        }
    }
}, 3000);

// =========================
// 🩺 نقاط النهاية
// =========================
app.get("/", (req, res) => {
    res.send(`
        <html>
        <head><title>Game Server</title>
        <style>
            body { font-family: Arial; background: #1a1a2e; color: white; padding: 20px; }
            .card { background: #16213e; padding: 15px; margin: 10px 0; border-radius: 8px; }
            .green { color: #4CAF50; } .red { color: #f44336; } .yellow { color: #FFD700; }
        </style>
        </head>
        <body>
            <h1>🎮 Game Server Status</h1>
            <div class="card">
                <p>🟢 Server: <span class="green">Running</span></p>
                <p>👥 Connected Players: <span class="yellow">${io.engine.clientsCount}</span></p>
                <p>📊 Round: <span class="yellow">#${roundNumber + 1}</span></p>
                <p>⏱️ Countdown: <span class="${countdown <= 20 ? 'red' : 'yellow'}">${countdown}s</span></p>
                <p>🔒 Frozen: <span class="${isFrozen ? 'red' : 'green'}">${isFrozen ? 'YES' : 'NO'}</span></p>
                <p>💰 Price: <span class="yellow">$${currentPrice}</span></p>
                <p>📜 History: <span class="yellow">[${lastNumbers.slice(0, 10).join(', ')}]</span></p>
            </div>
            <p>📊 <a href="/status" style="color: #FFD700;">JSON Status</a></p>
            <p>🩺 <a href="/health" style="color: #FFD700;">Health Check</a></p>
        </body>
        </html>
    `);
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        uptime: process.uptime(),
        players: io.engine.clientsCount,
        round: roundNumber + 1,
        countdown: countdown
    });
});

app.get("/status", (req, res) => {
    res.json({
        server: "running",
        countdown: countdown,
        isFrozen: isFrozen,
        isRoundEnding: isRoundEnding,
        isRoundActive: isRoundActive,
        resultSent: resultSent,
        userCount: userCount,
        connectedPlayers: io.engine.clientsCount,
        bets: { red, green, purple },
        price: currentPrice,
        roundNumber: roundNumber + 1,
        lastResultTime: lastResultTime > 0 ? new Date(lastResultTime).toISOString() : null,
        history: lastNumbers.slice(0, 10)
    });
});

// =========================
// 🚀 بدء السيرفر
// =========================
server.listen(PORT, () => {
    console.log(`═══════════════════════════════════════`);
    console.log(`🎮 Game Server Started`);
    console.log(`🌐 Port: ${PORT}`);
    console.log(`📊 Status: http://localhost:${PORT}/status`);
    console.log(`🩺 Health: http://localhost:${PORT}/health`);
    console.log(`🛡️ Anti-duplicate: ENABLED`);
    console.log(`⏱️ Round duration: 60s`);
    console.log(`⏱️ Reset delay: 5000ms`);
    console.log(`═══════════════════════════════════════`);
    
    // بدء حلقة اللعبة
    startGameLoop();
    console.log(`✅ Game loop started`);
});

// =========================
// 🛑 معالجة الإغلاق النظيف
// =========================
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received - shutting down gracefully');
    if (gameInterval) clearInterval(gameInterval);
    if (resetTimeout) clearTimeout(resetTimeout);
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received - shutting down gracefully');
    if (gameInterval) clearInterval(gameInterval);
    if (resetTimeout) clearTimeout(resetTimeout);
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});