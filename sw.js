// Guarda la pantalla de Kronos en el celu para poder abrirla sin conexión con la PC (fuera de casa).
// Los datos del plan los guarda app.js aparte (la "copia"); acá solo van los archivos de la pantalla.
// Sirve igual para la copia con contraseña de GitHub (por eso las direcciones no empiezan con "/").
const CACHE = "kronos-v21";
const ARCHIVOS = ["./", "index.html", "estilos.css", "app.js", "inercia.js", "comisiones.js", "manifest.webmanifest", "icono-192.png", "icono-512.png", "icono-mascara-512.png", "banner-hoy.webp"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Primero intenta la PC (para tener siempre lo último); si no responde, usa lo guardado.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.includes("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});
