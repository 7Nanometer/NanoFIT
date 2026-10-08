// ============================================================
// Service Worker —— 负责"断网也能打开"
// ============================================================
//
// 【它是什么】
// 一个跑在浏览器后台的小工人。第一次打开 App 时，它把界面需要的文件
// （网页、脚本、样式、图标）存一份在自己的"仓库"里。
// 以后你再打开，它直接去仓库拿，不用联网下载 —— 所以开了飞行模式也能用。
//
// 【为什么手写，不装现成的库】
// 手写只有下面几十行，你能一行行读懂，出问题知道改哪里。
// 装 vite-plugin-pwa 会多出两个几百 KB 的黑盒依赖，出问题只能求人。
//
// 【以后改了代码，为什么不用手动清缓存】
// 打包出来的脚本和样式文件名里带着一串随机字符（例如 index-0EKJbgqY.js），
// 内容一改，这串字符就变，文件名跟着变 ——
// 浏览器来要新名字的文件，仓库里没有，自然就去网上拿最新的了。
// 网页文件（index.html）则走"先联网"的规矩，也总是最新的。
//
// 【★但这几种文件必须手动升版本号】
// favicon.svg、icons/ 里的图标、manifest.webmanifest ——
// 它们**文件名固定不变**，内容改了名字也不改，
// 仓库里存着旧的就会一直拿旧的（图标换了手机上却不变，就是这么来的）。
//
// 所以：**只要动了上面这几种文件，就必须把 CACHE_VERSION 升一位**，
// 新工人上任时会把旧仓库整个删掉，全部重新下载。
// ============================================================

// v3（2026-10-08）：动过 manifest.webmanifest（底色 #121212 → #0a0a0c）。
// 它属于上面那类"文件名固定"的文件，不升这一位手机上就还是旧底色。
const CACHE_VERSION = 'nanofit-v3'

// 第一次装上时，先把这几个"名字固定"的文件存进仓库。
// 带随机字符的脚本和样式不在这里 —— 它们会在第一次被请求时顺手存下来。
const PRECACHE = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
]

// ---------- 装上时：把要预先存的文件搬进仓库 ----------
self.addEventListener('install', (event) => {
  // 新工人装好后立刻接班，不用等所有页面都关掉
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)),
  )
})

// ---------- 启用时：把旧版本的仓库删掉 ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_VERSION)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// ---------- 每次要资源时：决定去仓库拿还是去网上拿 ----------
self.addEventListener('fetch', (event) => {
  const request = event.request

  // 只处理"读取"请求。记录训练是往手机本地写，不经过网络。
  if (request.method !== 'GET') return

  // 只管自己网站的文件，别人的（比如你以后想加的外链）不插手
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // 【第一类】打开页面的请求：先联网拿最新的，连不上就翻仓库。
  // 这样你每次打开都能拿到最新版本，断网时也不会白屏。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('./index.html').then((cached) => cached ?? fetch(request)),
      ),
    )
    return
  }

  // 【第二类】脚本、样式、图片：先翻仓库（快），仓库没有再去网上拿，
  // 拿到之后顺手存进仓库，下次就不用再下载了。
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached !== undefined) return cached

      return fetch(request).then((response) => {
        // 只存"正常拿到"的响应。存下 404 或出错页会让问题被藏起来。
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
