/* 半调工厂 Service Worker
 *
 * 策略：预缓存 + 缓存优先（stale-while-revalidate）
 *   - 页面加载时先用缓存，秒开且离线可用；
 *   - 同时在后台拉取线上最新版本写回缓存；
 *   - 后台更新时逐字节比对“缓存里的旧版本”和“线上新版本”，
 *     一旦发现不一致就通知页面弹出“检测到更新，请刷新”的提示。
 */

const CACHE_PREFIX = 'halftone-factory-';
// 需要让所有客户端强制重新下载全部资源时，把版本号往上加一位即可
const CACHE_NAME = CACHE_PREFIX + 'v2';

const PRECACHE_URLS = [
  './',
  './index.html',
  './factory-main.css',
  './factory-main.js',
  './manifest.webmanifest'
];

// 关键资源：这些文件变了就意味着当前页面本身已经过时，需要提示用户刷新
const WATCH_URLS = [
  './',
  './index.html',
  './factory-main.css',
  './factory-main.js'
];

// 未缓存且网络不可用时的兜底入口
const FALLBACK_URL = './index.html';

// 被判定为“手上拿的是旧内容”的页面，按 client 精确记录：
// 只有当时真的拿到旧内容的那个页面才需要提示，刷新过或新开的页面都不该被打扰。
const outdatedClients = new Set();

let watchList = null;
function isWatched(url) {
  if (!watchList) {
    watchList = WATCH_URLS.map((entry) => new URL(entry, self.registration.scope).href);
  }
  return watchList.indexOf(url) !== -1;
}

/* ---------------- 安装：预缓存 ---------------- */

function precache() {
  return caches.open(CACHE_NAME).then((cache) =>
    Promise.all(
      PRECACHE_URLS.map((url) =>
        // cache: 'reload' 绕过 HTTP 缓存，确保拿到的是线上最新版本
        fetch(new Request(url, { cache: 'reload' }))
          .then((res) => {
            if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
            return cache.put(url, res);
          })
          .catch((err) => {
            // 入口文件拿不到就让安装失败（保留旧 SW 继续服务），其余资源尽力而为
            if (url === './' || url === './index.html') throw err;
            console.warn('[SW] 预缓存跳过：' + url, err);
          })
      )
    )
  );
}

// 注意：这里不调用 skipWaiting()。
// 新版本进入 waiting 状态，由页面提示用户后发送 SKIP_WAITING 再接管，
// 避免页面在用户毫无察觉时被换掉（也避免首次访问被强制刷新一次）。
self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

/* ---------------- 激活：清理旧缓存并接管页面 ---------------- */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ---------------- 消息 ---------------- */

function broadcast(message) {
  self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => client.postMessage(message));
  });
}

// 只通知“确实拿到旧内容”的那个页面；页面若在监听注册之前错过这条消息，
// 还可以在加载完成后用 UPDATE_STATE 主动查询补回来。
function notifyContentUpdated(url, clientId) {
  if (!clientId) {
    broadcast({ type: 'CONTENT_UPDATED', url: url });
    return;
  }

  outdatedClients.add(clientId);
  self.clients
    .get(clientId)
    .then((client) => {
      if (client) {
        client.postMessage({ type: 'CONTENT_UPDATED', url: url });
      } else {
        outdatedClients.delete(clientId);
      }
    })
    .catch(() => {});
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // 页面加载后主动询问“本页有没有拿到旧内容”，用来兜住通知早于监听注册的竞态
  if (data.type === 'UPDATE_STATE') {
    const clientId = event.source && event.source.id;
    if (clientId && outdatedClients.has(clientId) && event.source) {
      event.source.postMessage({ type: 'CONTENT_UPDATED' });
    }
  }
});

/* ---------------- 内容比对 ---------------- */

function sameBytes(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  for (let i = 0; i < x.length; i += 1) {
    if (x[i] !== y[i]) return false;
  }
  return true;
}

function compareAndNotify(cachedRes, freshRes, url, clientId) {
  if (!isWatched(url)) return Promise.resolve();

  // 长度不同必然内容不同，先走这条快速路径
  const cachedLen = cachedRes.headers.get('content-length');
  const freshLen = freshRes.headers.get('content-length');
  if (cachedLen && freshLen && cachedLen !== freshLen) {
    notifyContentUpdated(url, clientId);
    return Promise.resolve();
  }

  return Promise.all([cachedRes.arrayBuffer(), freshRes.arrayBuffer()])
    .then(([a, b]) => {
      if (!sameBytes(a, b)) notifyContentUpdated(url, clientId);
    })
    .catch(() => {});
}

/* ---------------- 网络请求：更新缓存并检查更新 ---------------- */

function fetchAndUpdate(req, cachedForCompare, clientId) {
  return fetch(req, { cache: 'no-cache' })
    .then((res) => {
      if (!res || !res.ok || res.type !== 'basic') return res;

      const forCompare = cachedForCompare ? res.clone() : null;
      const forCache = res.clone();

      return caches
        .open(CACHE_NAME)
        .then((cache) => cache.put(req, forCache))
        // 先写缓存再比对通知：页面收到提示时，缓存里已经是新版本了
        .then(() =>
          forCompare ? compareAndNotify(cachedForCompare, forCompare, req.url, clientId) : null
        )
        .then(() => res);
    })
    .catch(() => null);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // 带查询串的请求（版本探测之类）不接管，避免污染缓存
  if (url.search) return;

  // 导航请求对应的页面在 resultingClientId 上，普通资源请求在 clientId 上
  const clientId = event.resultingClientId || event.clientId || null;

  event.respondWith(
    caches.match(req).then((cached) => {
      // 必须在把 cached 交给页面之前克隆一份用于比对（响应体只能被读一次）
      const cachedForCompare = cached ? cached.clone() : null;
      const networkPromise = fetchAndUpdate(req, cachedForCompare, clientId);

      if (cached) return cached; // 缓存优先：秒开 + 离线可用

      return networkPromise.then((res) => {
        if (res) return res;
        return caches
          .match(FALLBACK_URL)
          .then((fallback) => fallback || new Response('', { status: 504, statusText: 'Offline' }));
      });
    })
  );
});
