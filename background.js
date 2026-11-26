/* Xshots MV3 service worker: fetches X CDN images safely and coordinates background clipboard writes. */
'use strict';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 10000;
const MAX_ACTIVE_READS = 6;
const MAX_QUEUED_READS = 32;
const MAX_PNG_URL_LENGTH = 32 * 1024 * 1024;

let activeReads = 0;
const readQueue = [];
let clipboardQueue = Promise.resolve();

async function ensureOffscreen() {
  const url = chrome.runtime.getURL('offscreen.html');
  const exists = chrome.runtime.getContexts
    ? (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] })).length > 0
    : (await clients.matchAll()).some(client => client.url === url);
  if (!exists) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD', 'BLOBS'],
      justification: 'Copy the generated PNG to clipboard even while the browser is in the background.'
    });
  }
}

function xsCopyPng(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_PNG_URL_LENGTH ||
      !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(dataUrl)) {
    return Promise.reject(new Error('截图数据无效或过大，请降低清晰度后重试。'));
  }
  const job = clipboardQueue.then(async () => {
    try {
      await ensureOffscreen();
      const result = await chrome.runtime.sendMessage({
        type: 'XS_OFFSCREEN_COPY',
        target: 'xs-offscreen',
        dataUrl
      });
      if (!result?.ok) throw new Error(result?.error || '写入剪贴板失败，请重试。');
      return { ok: true };
    } finally {
      await chrome.offscreen.closeDocument().catch(() => {});
    }
  });
  clipboardQueue = job.catch(() => {});
  return job;
}

function isAuthorizedSender(sender) {
  if (!sender || sender.id !== chrome.runtime.id || typeof sender.url !== 'string') return false;
  try {
    const url = new URL(sender.url);
    if (url.protocol === 'chrome-extension:') return url.hostname === chrome.runtime.id;
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      /(^|\.)(x\.com|twitter\.com)$/.test(url.hostname);
  } catch {
    return false;
  }
}

function imageError(code, text) {
  return Object.assign(new Error(text), { code });
}

function validateImageUrl(value) {
  if (typeof value !== 'string' || value.length > 4096 ||
      !/^https:\/\/(pbs\.twimg\.com|abs\.twimg\.com)\//i.test(value)) {
    throw imageError('XS_IMAGE_SOURCE', '图片来源暂不支持直接读取');
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
      !['pbs.twimg.com', 'abs.twimg.com'].includes(url.hostname)) {
    throw imageError('XS_IMAGE_URL', '图片地址无效');
  }
  const isFileImage = /\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(url.pathname);
  const isPublicPath = url.hostname === 'pbs.twimg.com' &&
    /^\/(?:media|profile_images|profile_banners|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb|card_img|ad_img|semantic_core_img|community_banner_img|list_banner_img)\/.+/i.test(url.pathname);
  if (!isFileImage && !isPublicPath) throw imageError('XS_IMAGE_PATH', '这张 X 图片的地址格式暂不支持');
  return url.href;
}

function withReadSlot(task) {
  if (readQueue.length >= MAX_QUEUED_READS) {
    return Promise.reject(new Error('图片请求过多，请稍后重试'));
  }
  return new Promise((resolve, reject) => {
    const run = () => {
      activeReads += 1;
      Promise.resolve().then(task).then(resolve, reject).finally(() => {
        activeReads -= 1;
        const next = readQueue.shift();
        if (next) next();
      });
    };
    if (activeReads < MAX_ACTIVE_READS) run();
    else readQueue.push(run);
  });
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function fetchImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    });
    if (!response.ok) {
      throw Object.assign(imageError('XS_IMAGE_HTTP', `图片服务器返回 HTTP ${response.status}`), { status: response.status });
    }
    const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/[a-z0-9.+-]+$/.test(mime)) throw new Error('服务器没有返回图片');
    const reportedSize = Number(response.headers.get('content-length'));
    if (reportedSize > MAX_IMAGE_BYTES) throw new Error('图片超过 12 MB，请换一条帖子重试');
    if (!response.body) throw new Error('图片内容为空');

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          controller.abort();
          await reader.cancel().catch(() => {});
          throw new Error('图片超过 12 MB，请换一条帖子重试');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (!total) throw new Error('图片内容为空');
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return `data:${mime};base64,${bytesToBase64(bytes)}`;
  } catch (error) {
    if (error.name === 'AbortError') throw imageError('XS_IMAGE_TIMEOUT', '图片加载超时，请重试');
    if (error instanceof TypeError) throw imageError('XS_IMAGE_NETWORK', '图片网络请求失败，请检查网络或插件权限后重试');
    throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function fetchImageWithRetry(url) {
  try {
    return await fetchImage(url);
  } catch (error) {
    const transient = ['XS_IMAGE_NETWORK', 'XS_IMAGE_TIMEOUT'].includes(error.code) ||
      (error.code === 'XS_IMAGE_HTTP' && (error.status === 429 || error.status >= 500));
    if (!transient) throw error;
    await new Promise(resolve => setTimeout(resolve, 250));
    return fetchImage(url);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !['XS_FETCH_IMAGE', 'XS_COPY_PNG'].includes(message.type)) return false;
  if (!isAuthorizedSender(sender)) {
    sendResponse({ ok: false, error: '消息来源无效' });
    return false;
  }
  (async () => {
    if (message.type === 'XS_COPY_PNG') return xsCopyPng(message.dataUrl);
    const url = validateImageUrl(message.url);
    const dataUrl = await withReadSlot(() => fetchImageWithRetry(url));
    return { ok: true, dataUrl };
  })().then(
    sendResponse,
    error => sendResponse({ ok: false, code: error.code, error: error.message || '操作失败，请重试' })
  );
  return true;
});
