const mineflayer = require('mineflayer');
const config = require('./config.json');

let isSleeping = false;

// --- [Düzeltme] Aktif bot referansı — temiz kapanış için module seviyesinde tutulur ---
let aktifBot = null;

// --- [Düzeltme 3] Beklenmedik hata/promise reddi process'i çökertmesin ---
process.on('uncaughtException', (err) => {
    console.error('[Sistem] Yakalanmamış hata (process devam ediyor):', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Sistem] İşlenmemiş promise reddi (process devam ediyor):', reason);
});

// --- GitHub Actions 4 saatlik job döngüsü için temiz kapanış ---
// 4 saat = 240 dk; 238 dk sonra bot quit() → exit(0) → Cloudflare Worker yeni job başlatır
const JOB_SURE_MS = 238 * 60 * 1000;
setTimeout(() => {
    console.log('[Sistem] Job süresi dolmak üzere, process temiz kapatılıyor (exit 0)...');
    // --- [Düzeltme] Önce botu temiz kapat, paketin gitmesi için 500ms bekle ---
    if (aktifBot) {
        aktifBot.quit();
    }
    setTimeout(() => process.exit(0), 500);
}, JOB_SURE_MS);

// --- [Düzeltme 4] Exponential backoff için yeniden bağlanma sayacı ---
let baglanmaDenemeSayisi = 0;
const MAX_BACKOFF_MS = 60000; // en fazla 60 saniye bekle

function yenidenBaglanmaGecikmesi() {
    // 5s → 10s → 20s → 40s → 60s (max)
    const gecikme = Math.min(5000 * Math.pow(2, baglanmaDenemeSayisi), MAX_BACKOFF_MS);
    baglanmaDenemeSayisi++;
    return gecikme;
}
/*
function handleSleep(triggerName, mainBot) {
    if (isSleeping) return;
    isSleeping = true;

    if (triggerName) {
        mainBot.chat(`${triggerName} uyuyor! Geceyi atlamak için 15 saniyeliğine çıkıyorum... İyi geceler!`);
    } else {
        mainBot.chat(`Geceyi atlamak için 15 saniyeliğine çıkıyorum... İyi geceler!`);
    }

    // Ana botu çıkar (mesajın gitmesi için azıcık bekle)
    setTimeout(() => {
        mainBot.quit();
    }, 500);

    // 15 saniye sonra geri dön
    setTimeout(() => {
        isSleeping = false;
        console.log('[Sistem] Uyku süresi doldu, ana bot geri dönüyor...');
        createBot();
    }, 15000);
}
*/
// Ana bot oluşturma fonksiyonu
function createBot() {
    // --- [Düzeltme 2] Her spawn'da eski interval'ı temizlemek için referans ---
    let ziplamaInterval = null;

    const bot = mineflayer.createBot({
        host: config.host,
        port: config.port,
        username: config.mainBotName,
        version: config.version || false
    });
    // --- [Düzeltme] Yeni bot referansını module seviyesinde güncelle ---
    aktifBot = bot;

    bot.on('login', () => {
        console.log(`[${config.mainBotName}] Sunucuya katıldı ve sunucuyu ayakta tutuyor!`);
        // --- [Düzeltme 4] Başarılı bağlantıda sayacı sıfırla ---
        baglanmaDenemeSayisi = 0;
    });

    bot.on('end', (reason) => {
        console.log(`[${config.mainBotName}] Sunucudan ayrıldı. Sebep: ${reason}`);

        // --- [Düzeltme 2] Bot kapandığında zıplama interval'ını temizle ---
        if (ziplamaInterval) {
            clearInterval(ziplamaInterval);
            ziplamaInterval = null;
        }

        if (!isSleeping) {
            // --- [Düzeltme 4] Sabit 5s yerine exponential backoff kullan ---
            const gecikme = yenidenBaglanmaGecikmesi();
            console.log(`[${config.mainBotName}] Yeniden bağlanıyor... (${Math.round(gecikme / 1000)}s sonra, deneme #${baglanmaDenemeSayisi})`);
            setTimeout(() => createBot(), gecikme);
        }
    });

    bot.on('error', (err) => {
        console.log(`[${config.mainBotName}] Hata:`, err.message);
    });

    bot.on('kicked', (reason) => {
        console.log(`[${config.mainBotName}] Sunucudan atıldı:`, reason);
    });
    /*
    // Oyun içi sohbetten komut okuma
    bot.on('chat', (username, message) => {
        if (username === bot.username) return;

        const command = message.trim().toLowerCase();

        if (command === '!sleep') {
            handleSleep(username, bot);
        }
    });

     Yakınlarda bir oyuncu yatağa yattığında otomatik algıla — [DEVREDİŞI]
     bot.on('entitySleep', (entity) => {
         if (entity.type === 'player' && entity.username !== bot.username) {
             handleSleep(entity.username, bot);
         }
    });*/

    // AFK kalmamak için periyodik olarak zıplama
    bot.on('spawn', () => {
        // --- [Düzeltme 2] Önceki interval'ı temizle, sonra yenisini başlat ---
        if (ziplamaInterval) {
            clearInterval(ziplamaInterval);
        }
        ziplamaInterval = setInterval(() => {
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 500);
        }, 30000 + Math.random() * 30000); // 30-60 saniyede bir rastgele zıpla
    });
}

// Botu başlat
console.log('Ana bot başlatılıyor...');
console.log(`[Sistem] Process ${Math.round(JOB_SURE_MS / 60000)} dakika sonra otomatik kapatılacak.`);
createBot();
