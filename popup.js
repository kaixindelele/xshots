/* global Xshots, chrome */
(() => {
  'use strict';

  const { DEFAULTS, normalizeSettings } = globalThis.Xshots;
  const isExtension = Boolean(globalThis.chrome?.runtime?.id && globalThis.chrome?.storage?.local);
  const form = document.querySelector('#settings-form');
  const exportButton = document.querySelector('#export-button');
  const exportLabel = document.querySelector('#export-label');
  const statusElement = document.querySelector('#page-status');
  const statusText = document.querySelector('#status-text');
  const feedback = document.querySelector('#feedback');

  let settings = normalizeSettings(DEFAULTS);
  let activeTab = null;
  let mode = 'loading';
  let selectedCount = 0;
  let saveQueue = Promise.resolve();
  let saveFailed = false;
  let detecting = false;

  function showFeedback(message = '') {
    feedback.textContent = message;
    feedback.hidden = !message;
  }

  function renderSettings() {
    form.elements.background.value = settings.background;
    form.elements.scale.value = String(settings.scale);
    form.elements.showMetrics.checked = settings.showMetrics;
    form.elements.showSource.checked = settings.showSource;
    if (document.activeElement !== form.elements.watermark) {
      form.elements.watermark.value = settings.watermark;
    }
    document.querySelector('#preview').dataset.background = settings.background;
    document.querySelector('#sample-metrics').hidden = !settings.showMetrics;
    document.querySelector('#sample-source').hidden = !settings.showSource;
    const watermarkEl = document.querySelector('#sample-watermark');
    if (watermarkEl) {
      watermarkEl.textContent = settings.watermark;
      watermarkEl.hidden = !settings.watermark;
    }
  }

  function readyActionLabel() {
    return selectedCount > 1 ? `合并复制已选 ${selectedCount} 条` : '复制当前帖子';
  }

  function setStatus(nextMode, text) {
    mode = nextMode;
    statusText.textContent = text;
    statusElement.dataset.state = nextMode === 'ready' || nextMode === 'demo'
      ? 'ready'
      : nextMode === 'loading' ? 'loading' : 'warning';
    exportButton.disabled = !['ready', 'open', 'demo'].includes(nextMode);
    exportLabel.textContent = nextMode === 'open'
      ? '打开 X，发现好帖子'
      : nextMode === 'loading'
        ? '正在检测帖子…'
        : nextMode === 'ready' ? readyActionLabel() : '复制当前帖子';
    document.querySelector('.file-type').hidden = nextMode === 'open';
  }

  function isSupportedUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && /^(?:[a-z0-9-]+\.)*(?:x\.com|twitter\.com)$/.test(parsed.hostname);
    } catch {
      return false;
    }
  }

  async function detectPage() {
    if (detecting) return;
    if (!isExtension) {
      document.body.dataset.demo = 'true';
      setStatus('demo', '交互预览 · 安装后即可复制 X 帖子');
      return;
    }
    detecting = true;
    document.querySelector('#refresh-status').disabled = true;
    setStatus('loading', '正在检查当前页面…');
    try {
      [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !isSupportedUrl(activeTab.url)) {
        selectedCount = 0;
        setStatus('open', '在 X 页面上即可一键复制');
        return;
      }
      let response;
      try {
        response = await chrome.tabs.sendMessage(activeTab.id, { type: 'XS_STATUS' });
      } catch {
        selectedCount = 0;
        setStatus('unavailable', '请刷新 X 页面，再重新检测');
        return;
      }
      selectedCount = Number(response?.selectedCount) || 0;
      if (response?.ok && (response.count > 0 || selectedCount > 0)) {
        setStatus('ready', selectedCount > 1
          ? `已多选 ${selectedCount} 条帖子 · 点击一键合并复制`
          : '已就绪 · 复制屏幕中最显眼的帖子');
      } else {
        setStatus('empty', '还没有找到帖子，请滚动或稍后重试');
      }
    } catch {
      selectedCount = 0;
      setStatus('unavailable', '暂时无法读取页面，请重新打开插件');
    } finally {
      detecting = false;
      document.querySelector('#refresh-status').disabled = false;
    }
  }

  function persistSettings() {
    settings = normalizeSettings({
      background: form.elements.background.value,
      scale: Number(form.elements.scale.value),
      showMetrics: form.elements.showMetrics.checked,
      showSource: form.elements.showSource.checked,
      watermark: form.elements.watermark.value
    });
    renderSettings();
    showFeedback();
    if (isExtension) {
      const snapshot = { ...settings };
      saveQueue = saveQueue.then(async () => {
        try {
          await chrome.storage.local.set({ settings: snapshot });
          saveFailed = false;
        } catch {
          saveFailed = true;
          showFeedback('设置暂时未能保存，请重新选择后重试。');
        }
      });
    }
  }

  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('change', persistSettings);
  form.elements.watermark.addEventListener('input', () => {
    if (form.elements.watermark.value.length > 40) return;
    persistSettings();
  });

  document.querySelector('#refresh-status').addEventListener('click', () => {
    showFeedback();
    void detectPage();
  });

  document.querySelector('#help-button').addEventListener('click', event => {
    const panel = document.querySelector('#help-panel');
    panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
  });

  exportButton.addEventListener('click', async () => {
    showFeedback();
    if (mode === 'demo') {
      showFeedback('这是外观预览。将 Xshots 加载到 Chrome 后，即可在 X 上一键复制帖子卡片。');
      return;
    }
    if (mode === 'open') {
      try {
        await chrome.tabs.create({ url: 'https://x.com/' });
        window.close();
      } catch {
        showFeedback('未能打开 X，请手动访问 x.com。');
      }
      return;
    }
    if (mode !== 'ready' || !activeTab?.id) return;
    exportButton.disabled = true;
    exportLabel.textContent = '正在复制截图…';
    try {
      await saveQueue;
      if (saveFailed) {
        showFeedback('设置尚未保存，请重新选择后再复制。');
        return;
      }
      const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'XS_EXPORT_VISIBLE' });
      if (!response?.ok) {
        showFeedback(response?.error || '暂时无法复制，请确认帖子已加载完成。');
        return;
      }
      window.close();
    } catch {
      showFeedback('页面连接已断开，请刷新 X 页面后重试。');
    } finally {
      exportButton.disabled = false;
      exportLabel.textContent = readyActionLabel();
    }
  });

  async function initialize() {
    if (isExtension) {
      try {
        const saved = await chrome.storage.local.get('settings');
        settings = normalizeSettings(saved.settings);
      } catch {
        showFeedback('暂时无法读取设置，已使用默认样式。');
      }
    }
    renderSettings();
    form.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = false; });
  }

  void Promise.all([initialize(), detectPage()]);
})();
