import { app } from './app.js';

import { registerComponents } from './components.js';

window.app = app;
document.addEventListener('alpine:init', () => registerComponents(window.Alpine));

const dev = new URLSearchParams(location.search).get('dev') === '1';

if ('serviceWorker' in navigator) {
  if (dev) {
    navigator.serviceWorker.getRegistrations()
      .then((rs) => Promise.all(rs.map((r) => r.unregister())))
      .then(() => ('caches' in window ? caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))) : null))
      .catch((e) => console.warn('sw cleanup failed', e));
  } else {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('sw register failed', e));
  }
}

function missingLibs() {
  const miss = [];
  if (typeof XLSX === 'undefined') miss.push('SheetJS');
  if (typeof Dexie === 'undefined') miss.push('Dexie');
  if (typeof LightweightCharts === 'undefined') miss.push('Lightweight Charts');
  return miss;
}

function showFatal(msg) {
  const el = document.createElement('div');
  el.setAttribute('role', 'alert');
  el.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:#050507;color:#f4f4f6;font-family:system-ui,sans-serif;text-align:center';
  el.innerHTML = '<div style="max-width:32rem"><h1 style="font-size:1.15rem;margin:0 0 .5rem">Could not start</h1><p style="color:#9a9aa6;margin:0 0 1rem;font-size:.9rem">' + msg + '</p><button onclick="location.reload()" style="padding:.5rem 1rem;border-radius:8px;border:1px solid #a78bfa;background:#8b5cf6;color:#fff;font:inherit;cursor:pointer">Retry</button></div>';
  document.body.appendChild(el);
}

function loadAlpine() {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/dist/cdn.min.js';
  s.defer = true;
  s.onerror = () => showFatal('A required library failed to load. Check your connection and retry.');
  s.onload = () => {
    const miss = missingLibs();
    if (miss.length) showFatal('Failed to load: ' + miss.join(', ') + '. Check your connection and retry.');
  };
  document.head.appendChild(s);
}

const params = new URLSearchParams(location.search);

function dropDb(name, onBlocked) {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve();
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = () => resolve();
    r.onblocked = () => { if (onBlocked) onBlocked(); };
  });
}

function showNotice(msg) {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:.6rem 1rem;background:#8b5cf6;color:#fff;font:13px system-ui,sans-serif;text-align:center';
  el.textContent = msg;
  document.body.appendChild(el);
  return el;
}

function dropCaches() {
  if (!('caches' in window)) return Promise.resolve();
  return caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))));
}

dropDb('tradeJournal');

if (params.get('new') === '1') {
  let note = null;
  Promise.all([
    dropDb('tradefolio', () => {
      if (!note) note = showNotice('Close other Tradefolio tabs to finish resetting data...');
    }),
    dropCaches()
  ])
    .catch((e) => console.warn('reset failed', e))
    .then(() => {
      if (note) note.remove();
      params.delete('new');
      const q = params.toString();
      history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
      loadAlpine();
    });
} else {
  loadAlpine();
}
