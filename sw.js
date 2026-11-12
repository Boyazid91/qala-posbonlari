// Qal'a Posbonlari: offline rejim (service worker)
// index.html - avval internetdan (yangi versiya darhol keladi), internet yo'q bo'lsa keshdan.
// Rasmlar, ovozlar, shriftlar - keshdan beriladi va fonda yangilanadi.
// Musiqa va videolar keshlanmaydi (brauzer ularni bo'laklab yuklaydi); internetsiz o'yin ular siz ishlaydi.
const CACHE='qala-v1';
const CORE=['./','./index.html','./manifest.json','./img/icon-192.png','./img/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{}));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  if(r.headers.has('range')||/\/(video|music)\//.test(u.pathname)||/\.(mp4|wav)$/.test(u.pathname))return;
  const same=u.origin===location.origin,font=/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);if(!same&&!font)return;
  if(r.mode==='navigate'||/\/(index\.html)?$/.test(u.pathname)){
    e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));}return res;}).catch(()=>caches.match(r).then(m=>m||caches.match('./index.html'))));return;}
  e.respondWith(caches.open(CACHE).then(c=>c.match(r).then(m=>{const net=fetch(r).then(res=>{if(res.ok||res.type==='opaque')c.put(r,res.clone());return res;}).catch(()=>m);return m||net;})));
});
