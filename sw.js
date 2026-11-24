/* فلاتر — Service Worker
   الغرض: تشغيل التطبيق كاملًا بلا إنترنت بعد أول فتحة.
   كل شيء داخل المتصفح: لا شبكة، لا سيرفر، لا رفع صور. */

const VERSION = "filters-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./index_standalone.html",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];

/* التثبيت: نزّل كل شيء إلى الكاش مسبقًا */
self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // نستخدم add بنسخة متسامحة: أي ملف يفشل لا يُسقط التثبيت كله
      await Promise.all(
        ASSETS.map(url =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => null)
        )
      );
      await self.skipWaiting();
    })()
  );
});

/* التنشيط: احذف الكاشات القديمة */
self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

/* الجلب: الكاش أولًا، ثم الشبكة، ثم صفحة الطوارئ */
self.addEventListener("fetch", event => {
  const req = event.request;

  // لا نتدخل إلا في GET من نفس الأصل
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);

      // ① طلب تنقّل (فتح الصفحة): أعطِ index.html من الكاش فورًا
      if (req.mode === "navigate") {
        // جرّب الصفحة المطلوبة نفسها أولًا (index.html أو index_standalone.html)
        const self_ = await cache.match(req, { ignoreSearch: true });
        if (self_) return self_;
        const cached = await cache.match("./index.html");
        if (cached) {
          // نحدّث في الخلفية بهدوء عند توفر الشبكة
          fetch(req).then(res => {
            if (res && res.ok) cache.put("./index.html", res.clone());
          }).catch(() => {});
          return cached;
        }
      }

      // ② أي ملف آخر: كاش، ثم شبكة
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;

      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === "basic") {
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      } catch (e) {
        // ③ آخر حل: الصفحة الرئيسية
        const fallback = await cache.match("./index.html");
        if (fallback) return fallback;
        return new Response("غير متصل", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })()
  );
});

/* رسالة من الصفحة: هل أنت جاهز؟ */
self.addEventListener("message", event => {
  if (event.data === "ping") {
    event.source && event.source.postMessage({ type: "pong", version: VERSION });
  }
});
