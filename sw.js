// Service worker สำหรับร้านผ้าศิริเจริญ
// ทำให้เปิดโปรแกรมได้แม้ไม่มีอินเทอร์เน็ต (หลังจากเคยเปิดออนไลน์อย่างน้อย 1 ครั้ง)
//
// กลยุทธ์แคช:
// - หน้าเอกสารหลัก (index.html): network-first แล้วอัปเดตแคชทุกครั้งที่โหลดสำเร็จ
//   เพื่อให้ผู้ใช้เห็นเวอร์ชันล่าสุดทันทีที่มีเน็ต และ fallback ไปแคชเมื่อออฟไลน์
// - ไฟล์อื่น ๆ (เช่นสคริปต์ Supabase จาก CDN): cache-first แล้วอัปเดตแคชเบื้องหลัง

const CACHE_NAME = "siricharoen-fabric-shop-v1";
const CORE_ASSETS = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const isDocument = req.mode === "navigate" || req.destination === "document";

  if (isDocument) {
    // network-first: พยายามโหลดเวอร์ชันล่าสุดก่อนเสมอเมื่อมีเน็ต
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("/index.html")))
    );
    return;
  }

  // cache-first สำหรับไฟล์อื่น ๆ (เช่น script CDN) + รีเฟรชแคชเบื้องหลัง
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
