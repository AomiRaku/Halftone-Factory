/* 半调工厂 Service Worker
 *
 * 缓存策略：预缓存 + 缓存优先（stale-while-revalidate），秒开且离线可用。
 *
 * 为什么不能只是“后台更新缓存 + 比对”：
 *   GitHub Pages 给静态文件带的是 Cache-Control: max-age=600。如果 SW 把这种响应
 *   原样交给页面，浏览器自己那一层缓存会直接满足后续请求，请求根本到不了
 *   Service Worker —— SW 后台更新得再正确，页面刷新后看到的还是旧文件。
 *   HTML 因为是导航请求、必定经过 SW，所以只有它表现正常（这解释了
 *   “改 HTML 能更新、改 JS 刷新无效”）。
 *
 * 因此这里做了三件事：
 *   1. 返回 HTML 时给 css/js 的引用注入内容版本参数，URL 一变就绕开浏览器缓存；
 *   2. 每次导航都由 SW 主动把所有关键资源跟线上比对一遍，不再依赖子资源请求
 *      是否到得了 SW，发现不一致就通知页面“检测到更新，请刷新”；
 *   3. 缓存条目统一以“不带参数的 URL”为键，页面带版本参数请求时直接回填缓存内容，
 *      所以离线时同样可用。
 */

const CACHE_PREFIX = 'halftone-factory-';
// 需要让所有客户端强制重新下载全部资源时，把版本号往上加一位即可
const CACHE_NAME = CACHE_PREFIX + 'v3';

const PRECACHE_URLS = [
  './',
  './index.html',
  './factory-main.css',
  './factory-main.js',
  './manifest.webmanifest'
];

// 页面直接引用的关键资源：返回 HTML 时会给它们加上版本参数
const ASSET_FILES = ['factory-main.css', 'factory-main.js'];

// 这些文件的内容变化意味着当前页面已经过时
const WATCH_URLS = ['./', './index.html', './factory-main.css', './factory-main.js'];

// 缓存缺失且网络不可用时的兜底入口
const FALLBACK_URL = './index.html';

// 被判定为“手上拿的是旧内容”的页面，按 client 精确记录：
// 只有当时真的拿到旧内容的那个页面才需要提示，刷新过或新开的页面都不该被打扰。
const outdatedClients = new Set();

/* ---------------- 路径工具 ---------------- */

function abs(path) {
  return new URL(path, self.registration.scope).href;
}

function relOf(url) {
  const base = new URL(self.registration.scope);
  if (url.origin !== base.origin || url.pathname.indexOf(base.pathname) !== 0) return null;
  return './' + url.pathname.slice(base.pathname.length);
}

let watchList = null;
function isWatched(url) {
  if (!watchList) watchList = WATCH_URLS.map((p) => abs(p));
  return watchList.indexOf(url) !== -1;
}

let assetPathList = null;
function isAssetPath(pathname) {
  if (!assetPathList) assetPathList = ASSET_FILES.map((f) => new URL('./' + f, self.registration.scope).pathname);
  return assetPathList.indexOf(pathname) !== -1;
}

/* ---------------- 响应工具 ---------------- */

// 网络响应：只有同源基本响应才值得写进缓存
function cacheable(res) {
  return !!res && res.ok && res.type === 'basic' && res.body !== null;
}

// 要交给页面的响应：从 Cache 里取出来的条目 type 是 'default'（不是 'basic'），
// 所以不能复用上面的判断，否则缓存内容永远不会被处理（注入会静默失效）。
function servable(res) {
  return !!res && res.ok && res.body !== null;
}

// 写入缓存前统一去掉 Vary：缓存里同一个 URL 只留一份内容，
// 这样带参数/不带参数的请求都能命中，不受请求头差异影响。
function cleanForCache(res) {
  const headers = new Headers(res.headers);
  headers.delete('vary');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// 缓存条目的“版本标识”，用来给资源 URL 加参数
function versionTag(res) {
  const etag = res.headers.get('etag');
  if (etag) {
    const hex = /[0-9a-fA-F]{4,}/.exec(etag);
    if (hex) return hex[0];
  }
  const lastModified = res.headers.get('last-modified');
  if (lastModified) {
    const time = Date.parse(lastModified);
    if (!isNaN(time)) return time.toString(36);
  }
  return '';
}

function injectVersions(html, versions) {
  let out = html;
  ASSET_FILES.forEach((file) => {
    const tag = versions[file];
    if (!tag) return;
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('((?:href|src)=["\'])' + escaped + '(?:\\?[^"\']*)?(["\'])', 'g');
    out = out.replace(pattern, '$1' + file + '?v=' + tag + '$2');
  });
  return out;
}

async function buildVersions() {
  const versions = {};
  await Promise.all(
    ASSET_FILES.map(async (file) => {
      const res = await caches.match(abs('./' + file));
      if (!res) return;
      const tag = versionTag(res);
      if (tag) versions[file] = tag;
    })
  );
  return versions;
}

// 交给页面的响应：
//   - HTML 注入资源版本参数，并禁止浏览器缓存它（保证每次都由 SW 决定内容）
//   - 子资源 URL 已带版本，保持可缓存反而更快
async function toClient(res, isHTML) {
  if (!servable(res)) return res;

  const headers = new Headers(res.headers);
  headers.delete('content-length');

  if (isHTML) {
    let html;
    try {
      html = await res.text();
    } catch (err) {
      return res;
    }
    headers.set('cache-control', 'no-store');
    const versions = await buildVersions();
    return new Response(injectVersions(html, versions), {
      status: res.status,
      statusText: res.statusText,
      headers
    });
  }

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/* ---------------- 安装 / 激活 ---------------- */

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    PRECACHE_URLS.map(async (path) => {
      try {
        // cache: 'reload' 绕过 HTTP 缓存，确保拿到线上最新版本
        const res = await fetch(new Request(abs(path), { cache: 'reload' }));
        if (!cacheable(res)) throw new Error('HTTP ' + (res && res.status));
        await cache.put(abs(path), cleanForCache(res));
      } catch (err) {
        // 入口文件拿不到就让安装失败（保留旧 SW 继续服务），其余资源尽力而为
        if (path === './' || path === './index.html') throw err;
        console.warn('[SW] 预缓存跳过：' + path, err);
      }
    })
  );
}

// 注意：这里不调用 skipWaiting()。新版本先进入 waiting，由页面提示用户后
// 发送 SKIP_WAITING 再接管，避免页面在用户毫无察觉时被换掉。
self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

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

// 把某个资源跟线上最新版本对一次：更新缓存 + 必要时提示页面刷新
async function revalidate(url, clientId) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);

  let res;
  try {
    res = await fetch(new Request(url, { cache: 'no-cache' }));
  } catch (err) {
    return; // 离线，保持现状
  }
  if (!cacheable(res)) return;

  const cachedForCompare = cached ? cached.clone() : null;
  await cache.put(url, cleanForCache(res.clone()));

  // 先写缓存再比对通知：页面收到提示时，缓存里已经是新版本了
  if (cachedForCompare) await compareAndNotify(cachedForCompare, res, url, clientId);
}

// 页面每次导航都把关键资源全查一遍。
// 子资源请求可能被浏览器自己的缓存拦下、根本到不了 SW，所以不能只靠它们。
function revalidateAll(clientId) {
  return Promise.all(WATCH_URLS.map((path) => revalidate(abs(path), clientId).catch(() => {})));
}

/* ---------------- 网络取用 ---------------- */

async function fetchAndCache(req) {
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (!cacheable(res)) return res;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(req.url, cleanForCache(res.clone()));
    return res;
  } catch (err) {
    return null;
  }
}

function fallbackResponse(isHTML) {
  return caches
    .match(abs(FALLBACK_URL))
    .then((res) => (res ? toClient(res.clone(), isHTML) : new Response('', { status: 504, statusText: 'Offline' })));
}

/* ---------------- fetch ---------------- */

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const clientId = event.resultingClientId || event.clientId || null;

  // 关键资源带版本参数的请求（URL 由 SW 注入）：
  // 版本与内容一一对应，直接把缓存里的最新内容回填过去，离线也照常可用。
  if (url.search) {
    const rel = isAssetPath(url.pathname) ? relOf(url) : null;
    if (!rel) return;

    event.respondWith(
      caches.match(abs(rel)).then((bare) => {
        if (bare) return toClient(bare.clone(), false);
        return fetch(url.href, { cache: 'no-cache' })
          .then((res) => (cacheable(res) ? toClient(res, false) : fallbackResponse(false)))
          .catch(() => fallbackResponse(false));
      })
    );
    return;
  }

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (isHTML) {
        // 导航时顺带把关键资源全查一遍
        event.waitUntil(revalidateAll(clientId));
      } else if (cached) {
        event.waitUntil(revalidate(url.href, clientId));
      }

      if (cached) return toClient(cached.clone(), isHTML); // 缓存优先：秒开 + 离线可用

      return fetchAndCache(req).then((res) => (res ? toClient(res, isHTML) : fallbackResponse(isHTML)));
    })
  );
});
