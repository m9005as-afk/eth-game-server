const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 🎮 بيانات اللعبة
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
let isRoundEnding = false; // 🆕 متغير جديد لمنع أي معالجة أثناء نهاية الجولة

// =========================
// 🔥 جلب السعر الحقيقي كل 5 ثواني
// =========================
async function fetchRealPrice() {
  try {
    const res = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
    );
    lastRealPrice = res.data.ethereum.usd;
    console.log("REAL PRICE:", lastRealPrice);
  } catch (e) {
    console.log("API ERROR:", e.message);
  }
}

setInterval(fetchRealPrice, 5000);
fetchRealPrice();

// =========================
// 🔥 تحريك السعر كل ثانية (وهمي)
// =========================
setInterval(() => {
  if (lastRealPrice > 0) {
    let move = (Math.random() * 4 - 2);
    let newPrice = lastRealPrice + move;
    currentPrice = newPrice.toFixed(2);
  }
}, 1000);

// =========================
// 🎮 منطق اللعبة
// =========================
setInterval(() => {

  // 🚫 إذا كانت الجولة في مرحلة النهاية، لا تفعل شيئاً
  if (isRoundEnding) {
    return;
  }

  countdown--;

  if (countdown === 20) {
    isFrozen = true;
  }

  if (!isFrozen) {
    userCount += Math.floor(Math.random() * 100) + 50;
    red += Math.floor(Math.random() * 500);
    green += Math.floor(Math.random() * 500);
    purple += Math.floor(Math.random() * 500);
  }

  // 🔥 نهاية الجولة - تنفذ مرة واحدة فقط
  if (countdown <= 0 && !resultSent && !isRoundEnding) {
    
    // 🚫 قفل الجولة فوراً لمنع أي تكرار
    isRoundEnding = true;
    resultSent = true;
    roundNumber++;
    
    let lastDigit = currentPrice.toString().slice(-1);
    let resultTime = Date.now();
    lastResultTime = resultTime;

    lastNumbers.unshift(lastDigit);
    if (lastNumbers.length > 20) lastNumbers.pop();

    console.log(`═══════════════════════════════════════`);
    console.log(`🏆 ROUND #${roundNumber} ENDED`);
    console.log(`📅 Time: ${new Date(resultTime).toISOString()}`);
    console.log(`🎯 Winning Number: ${lastDigit}`);
    console.log(`💰 Price: ${currentPrice}`);
    console.log(`📊 History (last 10): [${lastNumbers.slice(0, 10).join(', ')}]`);
    console.log(`═══════════════════════════════════════`);

    // إرسال النتيجة مرة واحدة فقط
    io.emit("result", {
      digit: lastDigit,
      price: currentPrice,
      history: lastNumbers,
      roundNumber: roundNumber,
      timestamp: resultTime
    });

    // إعادة تعيين كاملة بعد 3 ثواني (وليس ثانية واحدة)
    setTimeout(() => {
      countdown = 60;
      isFrozen = false;
      userCount = 0;
      red = 0;
      green = 0;
      purple = 0;
      resultSent = false;
      isRoundEnding = false;
      console.log(`🔄 Ready for round #${roundNumber + 1}`);
    }, 3000);

  }

  // 🔥 تحديث مباشر - فقط إذا لم تكن الجولة منتهية
  if (!isRoundEnding) {
    io.emit("update", {
      countdown,
      userCount,
      red,
      green,
      purple,
      price: currentPrice
    });
  } else {
    // أثناء فترة إعادة التعيين، أرسل countdown = 0
    io.emit("update", {
      countdown: 0,
      userCount: userCount,
      red: 0,
      green: 0,
      purple: 0,
      price: currentPrice
    });
  }

}, 1000);

// =========================
// 🛡️ حماية إضافية
// =========================
setInterval(() => {
  const timeSinceLastResult = Date.now() - lastResultTime;
  if (isRoundEnding && timeSinceLastResult > 10000) {
    console.warn(`⚠️ Force reset after ${timeSinceLastResult}ms`);
    countdown = 60;
    isFrozen = false;
    userCount = 0;
    red = 0;
    green = 0;
    purple = 0;
    resultSent = false;
    isRoundEnding = false;
  }
}, 2000);

// =========================

app.get("/", (req, res) => {
  res.send("Server Working 🚀");
});

app.get("/status", (req, res) => {
  res.json({
    countdown: countdown,
    isFrozen: isFrozen,
    isRoundEnding: isRoundEnding,
    resultSent: resultSent,
    userCount: userCount,
    bets: { red, green, purple },
    price: currentPrice,
    roundNumber: roundNumber,
    lastResultTime: new Date(lastResultTime).toISOString(),
    history: lastNumbers.slice(0, 10)
  });
});

server.listen(3000, () => {
  console.log("🎮 Server running on port 3000");
  console.log("📊 Status: http://localhost:3000/status");
  console.log("🛡️ Anti-duplicate: ENABLED");
  console.log("⏱️ Round reset delay: 3000ms");
});