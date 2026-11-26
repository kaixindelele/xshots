/* Offscreen clipboard writer: copies PNG bitmaps reliably even when the browser is unfocused. */
'use strict';

async function copyImage(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const objectUrl = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('剪贴板图片加载超时，请重试。')), 15000);
      frame.onload = () => { clearTimeout(timer); resolve(); };
      frame.onerror = () => { clearTimeout(timer); reject(new Error('剪贴板图片加载失败，请重试。')); };
      frame.src = objectUrl;
      document.body.append(frame);
    });
    const doc = frame.contentDocument;
    const img = doc?.querySelector('img');
    if (!img?.complete || !img.naturalWidth) throw new Error('剪贴板图片加载失败，请重试。');
    frame.contentWindow.focus();
    if (!doc.execCommand('copy')) throw new Error('无法写入剪贴板，请重试。');
    await new Promise(resolve => setTimeout(resolve, 150));
  } finally {
    frame.remove();
    URL.revokeObjectURL(objectUrl);
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== 'xs-offscreen' || message.type !== 'XS_OFFSCREEN_COPY') return false;
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('background.js')) {
    respond({ ok: false, error: '消息来源无效' });
    return false;
  }
  copyImage(message.dataUrl).then(
    () => respond({ ok: true }),
    error => respond({ ok: false, error: error.message || '写入剪贴板失败，请重试。' })
  );
  return true;
});
