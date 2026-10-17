// Packing service worker: open instantly from the saved copy, refresh it in the background,
// and let the app know when a newer version has been downloaded.
const CACHE='packing-v28';
const FILES=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'];
const FLAG='./__packing_new_version';
const verOf=t=>(String(t).match(/APP_VERSION='([^']+)'/)||[])[1]||'';
async function markNew(text){const v=verOf(text);if(!v)return;const c=await caches.open(CACHE);await c.put(FLAG,new Response(v));
  (await self.clients.matchAll({includeUncontrolled:true})).forEach(cl=>cl.postMessage({t:'packing-updated',v}))}

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(u=>new Request(u,{cache:'reload'})))));
  self.skipWaiting();
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(async keys=>{
    const old=keys.filter(k=>k!==CACHE);await Promise.all(old.map(k=>caches.delete(k)));await self.clients.claim();
    if(old.length){const r=await (await caches.open(CACHE)).match('index.html');if(r)await markNew(await r.text())}
  }));
});
self.addEventListener('message',e=>{
  if(e.data==='packing-check')e.waitUntil(caches.open(CACHE).then(c=>c.match(FLAG)).then(r=>r&&r.text()).then(v=>{if(v&&e.source)e.source.postMessage({t:'packing-updated',v})}));
});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET'||req.url.includes('__packing_new_version'))return;
  const page=req.mode==='navigate'||/\/(index\.html)?$/.test(new URL(req.url).pathname);
  e.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(req,{ignoreSearch:true})||(page?await cache.match('index.html'):undefined);
    const oldCopy=cached&&page?cached.clone():null;
    const net=fetch(req,{cache:'no-cache'}).then(async res=>{
      if(res&&(res.ok||res.type==='opaque')){
        if(page&&res.ok){const txt=await res.clone().text();const old=oldCopy?await oldCopy.text():'';
          await cache.put('index.html',new Response(txt,{headers:{'Content-Type':'text/html; charset=utf-8'}}));await cache.put('./',new Response(txt,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
          if(cached&&old!==txt)await markNew(txt);
        }else await cache.put(req,res.clone());
      }
      return res;
    });
    if(cached){e.waitUntil(net.catch(()=>{}));return cached}
    return page?net.catch(()=>cache.match('index.html')):net;
  }));
});
