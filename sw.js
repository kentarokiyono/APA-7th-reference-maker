/* アプリ本体だけをキャッシュする。書誌データベースへの問い合わせは常にネットワークへ流す */
const VERSION = "apa-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/core.css",
  "./css/desktop.css",
  "./css/glass.css",
  "./js/app.js",
  "./js/types.js",
  "./js/util.js",
  "./js/format.js",
  "./js/sources.js",
  "./js/importers.js",
  "./js/store.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  /* 外部 API は絶対に握らない: 古い検索結果を返さないため */
  if(url.origin !== self.location.origin) return;
  if(e.request.method !== "GET") return;

  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if(res && res.ok){
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      /* キャッシュを即返しつつ裏で更新する */
      return hit || net;
    })
  );
});
