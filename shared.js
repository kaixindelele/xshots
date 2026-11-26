/* Shared, dependency-free helpers for Xshots popup and content script. */
(() => {
  'use strict';

  const BACKGROUNDS = ['plain', 'mist', 'midnight'];
  const SCALES = [1, 2, 3];
  const DEFAULTS = Object.freeze({
    background: 'mist',
    scale: 2,
    showMetrics: true,
    showSource: true,
    watermark: ''
  });

  function normalizeSettings(value) {
    const input = value && typeof value === 'object' ? value : {};
    const scale = Number(input.scale);
    return {
      background: BACKGROUNDS.includes(input.background) ? input.background : DEFAULTS.background,
      scale: SCALES.includes(scale) ? scale : DEFAULTS.scale,
      showMetrics: typeof input.showMetrics === 'boolean' ? input.showMetrics : DEFAULTS.showMetrics,
      showSource: typeof input.showSource === 'boolean' ? input.showSource : DEFAULTS.showSource,
      watermark: typeof input.watermark === 'string' ? input.watermark.trim().slice(0, 40) : DEFAULTS.watermark
    };
  }

  function parsePostUrl(value) {
    try {
      const url = new URL(value, 'https://x.com');
      if (url.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)*(?:x\.com|twitter\.com)$/.test(url.hostname)) {
        return null;
      }
      const match = url.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)(?:\/|$)/);
      if (!match) return null;
      return {
        username: match[1],
        id: match[2],
        url: `https://x.com/${match[1]}/status/${match[2]}`
      };
    } catch {
      return null;
    }
  }

  function captureScale(width, height, requested) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error('帖子尺寸无效，请刷新页面后重试。');
    }
    const scale = Math.min(
      requested,
      16384 / width,
      16384 / height,
      Math.sqrt(24000000 / (width * height))
    );
    if (scale < 0.5) throw new Error('这条帖子过长，请分段截图。');
    return Math.floor(scale * 100) / 100;
  }

  globalThis.Xshots = Object.freeze({ DEFAULTS, normalizeSettings, parsePostUrl, captureScale });
})();
