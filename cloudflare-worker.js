/**
 * Cloudflare Worker — GitHub Actions Bot Tetikleyici
 *
 * Bu worker, GitHub Actions'tan gelen "job bitti" isteğini alır
 * ve hemen yeni bir GitHub Actions job'ı başlatır (repository_dispatch).
 *
 * KURULUM:
 *  1. Cloudflare Dashboard → Workers & Pages → Create Worker
 *  2. Bu kodu editöre yapıştır ve Deploy et
 *  3. Settings → Variables altına şu değişkenleri ekle (Encrypt ile):
 *     - GITHUB_PAT   : GitHub Fine-Grained Token (Actions: Read & Write)
 *     - WORKER_SECRET: Rastgele bir şifre (GitHub secret'ı ile aynı olmalı)
 *     - GITHUB_OWNER : GitHub kullanıcı adın (örn: "talha")
 *     - GITHUB_REPO  : Repo adı (örn: "myminebot")
 *
 * GITHUB SECRETS (repo → Settings → Secrets → Actions):
 *   - CLOUDFLARE_WORKER_URL : Bu Worker'ın URL'si
 *   - WORKER_SECRET         : Yukarıdaki WORKER_SECRET ile aynı değer
 */

export default {
  async fetch(request, env) {
    // Sadece POST isteği kabul et
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Gizli token kontrolü — yetkisiz tetiklemeye karşı koruma
    const secret = request.headers.get("X-Worker-Secret");
    if (!secret || secret !== env.WORKER_SECRET) {
      console.error("Yetkisiz istek: geçersiz X-Worker-Secret");
      return new Response("Unauthorized", { status: 401 });
    }

    console.log("Yetkilendirilmiş istek alındı. Yeni GitHub job tetikleniyor...");

    // GitHub repository_dispatch API'ye istek gönder
    const githubApiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/dispatches`;

    try {
      const githubResponse = await fetch(githubApiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GITHUB_PAT}`,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "CloudflareWorker-BotTrigger/1.0",
        },
        body: JSON.stringify({
          event_type: "start-bot",          // bot.yml'deki repository_dispatch types ile eşleşmeli
          client_payload: {
            triggered_at: new Date().toISOString(),
            source: "cloudflare-worker",
          },
        }),
      });

      // GitHub 204 No Content döndürür başarıda
      if (githubResponse.status === 204) {
        console.log("✅ GitHub Actions job başarıyla tetiklendi.");
        return new Response(
          JSON.stringify({ ok: true, message: "Yeni bot job'ı tetiklendi." }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } else {
        const errorBody = await githubResponse.text();
        console.error(`GitHub API hatası: ${githubResponse.status} — ${errorBody}`);
        return new Response(
          JSON.stringify({ ok: false, status: githubResponse.status, error: errorBody }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    } catch (err) {
      console.error("Fetch hatası:", err.message);
      return new Response(
        JSON.stringify({ ok: false, error: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
