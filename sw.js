/* Yong Social Finance: service worker
 *
 * What it does
 *  - Opening the app always asks the network first, so every website update shows up straight away.
 *  - If the phone is offline (or the network is slow), it shows the last copy it saved.
 *  - If there is no saved copy yet, it shows a small "You're offline" page.
 *  - It never touches prices, news feeds, videos or any other site; those go straight to the network.
 *
 * You only need to change VERSION when you edit THIS file (for example to add files to SHELL).
 * Changing index.html does NOT require touching this file.
 */
const VERSION = "v1";
const CACHE = "ys-shell-" + VERSION;
const SHELL = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png"];
const NAV_TIMEOUT_MS = 4000;

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0f1115">
<title>Offline</title><style>
html,body{height:100%;margin:0;background:#0f1115;color:#e7e9ee;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
body{display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:22px;margin:0 0 8px}p{margin:0 0 22px;color:#9aa3b2;line-height:1.5}
button{background:#2563eb;color:#fff;border:0;border-radius:999px;padding:12px 26px;font-size:15px;font-weight:600}
</style></head><body><div><h1>You&rsquo;re offline</h1><p>Check your connection, then try again.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Save each file separately so one missing file can't block the install.
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ys-shell-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fetchWithTimeout(request, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

function offlinePage() {
  return new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;            // other sites: let the browser handle it

  // Opening the app (or any page of it)
  if (request.mode === "navigate") {
    const isHome = url.pathname === "/" || url.pathname === "/index.html";
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetchWithTimeout(request, NAV_TIMEOUT_MS);
        if (isHome && res.ok) cache.put("/", res.clone());     // keep the newest copy for offline use
        return res;
      } catch (err) {
        if (isHome) { const saved = await cache.match("/"); if (saved) return saved; }
        return offlinePage();
      }
    })());
    return;
  }

  // Icons and the manifest: answer from the saved copy, refresh it in the background
  if (SHELL.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const saved = await cache.match(url.pathname);
      const refresh = fetch(request).then((res) => { if (res.ok) cache.put(url.pathname, res.clone()); return res; }).catch(() => saved);
      return saved || refresh;
    })());
  }
  // everything else on this site (for example a future /privacy-policy asset) goes straight to the network
});
