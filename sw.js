// Service worker สำหรับร้านผ้าศิริเจริญ
// ทำให้เปิดโปรแกรมได้แม้ไม่มีอินเทอร์เน็ต (หลังจากเคยเปิดออนไลน์อย่างน้อย 1 ครั้ง)
//
// กลยุทธ์แคช:
// - หน้าเอกสารหลัก (index.html): network-first แล้วอัปเดตแคชทุกครั้งที่โหลดสำเร็จ
// - สคริปต์จาก CDN ที่เป็นไฟล์คงที่ (เช่น supabase-js, qrious): cache-first
// - ห้ามแคชการเรียกข้อมูล/API เด็ดขาด (เช่น Supabase) !!!
//   เวอร์ชันก่อนหน้าแคชทุก GET รวมถึงการดึงข้อมูลร้านจาก Supabase ทำให้บางครั้งหน้าเว็บได้ข้อมูลเก่าจากแคช
//   แล้วพอบันทึกก็เอาข้อมูลเก่าไปทับข้อมูลจริงบนคลาวด์ (สาเหตุบิลหาย) จึงแก้ให้ปล่อยทุกคำขอที่ไม่ใช่ไฟล์ของเว็บนี้หรือ CDN ไปที่เน็ตตรงๆ

const CACHE_NAME = "siricharoen-fabric-shop-v2";
const CORE_ASSETS = ["/", "/index.html"];
const STATIC_CDN_HOSTS = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com"];

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
  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  const sameOrigin = url.origin === self.location.origin;
  const isStaticCdn = STATIC_CDN_HOSTS.includes(url.hostname);
  // คำขออื่นทั้งหมด (Supabase / API / เว็บอื่น) -> ไม่ยุ่ง ปล่อยให้เบราว์เซอร์ไปเน็ตตามปกติ
  if (!sameOrigin && !isStaticCdn) return;
  // ไฟล์ของเว็บนี้ที่ไม่ใช่หน้าเอกสาร (เช่น /api/...) ก็ไม่แคช
  const isDocument = req.mode === "navigate" || req.destination === "document";
  if (sameOrigin && !isDocument) return;

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

  // สคริปต์ CDN แบบไฟล์คงที่: cache-first + รีเฟรชแคชเบื้องหลัง
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
