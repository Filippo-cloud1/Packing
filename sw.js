// Packing service worker: open instantly from the saved copy, refresh it in the background,
// and let the app know when a newer version has been downloaded.
const CACHE='packing-v33';
const FILES=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'];
const FLAG='./__packing_new_version';
const verOf=t=>(String(t).match(/APP_VERSION='([^']+)'/)||[])[1]||'';
async function markNew(text){const v=verOf(text);if(!v)return;const c=await caches.open(CACHE);await c.put(FLAG,new Response(v));
  (await self.clients.matchAll({includeUncontrolled:true})).forEach(cl=>cl.postMessage({t:'packing-updated',v}))}

// Google Fonts used by index.html: saved at install so the app keeps its look offline from the very first launch.
const FONT_CSS='https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap';
async function cacheFonts(c){try{
  const res=await fetch(FONT_CSS,{mode:'cors'});if(!res.ok)return;const css=await res.clone().text();await c.put(FONT_CSS,res);
  const urls=[...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m=>m[1]);
  await Promise.all(urls.map(u=>fetch(u,{mode:'cors'}).then(r=>r.ok&&c.put(u,r)).catch(()=>{})));
}catch(e){}}

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(async c=>{await c.addAll(FILES.map(u=>new Request(u,{cache:'reload'})));await cacheFonts(c)}));
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
    const cached=await cache.match(req,{ignoreSearch:!/^https:\/\/fonts\./.test(req.url),ignoreVary:true})||(page?await cache.match('index.html'):undefined);
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
