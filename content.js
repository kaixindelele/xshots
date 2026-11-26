(() => {
  'use strict';
  if (globalThis.__xshotsLoaded) return;
  globalThis.__xshotsLoaded = true;
  const { normalizeSettings, parsePostUrl, captureScale } = globalThis.Xshots;
  const TWEET = 'article[data-testid="tweet"]';
  const FRAME_PADDING = 44;
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5 10 3h4l1.5 2H20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="4" stroke="currentColor" stroke-width="1.7"/></svg>';
  const SELECT_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  let busy = false;
  let toastHost;
  let toastTimer;
  let dockHost;
  let selectionSeq = 0;
  let fallbackSeq = 0;
  const selectedPosts = new Map();

  function getArticleKey(article) {
    if (article._xsKey) return article._xsKey;
    const post = getPost(article);
    if (post?.url) {
      article._xsKey = post.url;
      return post.url;
    }
    const author = ownElements(article, '[data-testid="User-Name"]')[0]?.textContent?.trim() || '';
    const timeAttr = ownElements(article, 'time')[0]?.getAttribute('datetime') || '';
    const text = ownElements(article, '[data-testid="tweetText"]')[0]?.textContent?.trim()?.slice(0, 60) || '';
    if (author || timeAttr || text) {
      const key = `fallback:${author}|${timeAttr}|${text}`;
      article._xsKey = key;
      return key;
    }
    article._xsKey = `node:${++fallbackSeq}`;
    return article._xsKey;
  }

  function orderedSelected() {
    for (const entry of selectedPosts.values()) {
      if (entry.article && !entry.article.isConnected) entry.article = null;
      if (entry.article) {
        entry.domY = entry.article.getBoundingClientRect().top + window.scrollY;
      }
    }
    return [...selectedPosts.values()].sort((a, b) =>
      Math.abs(a.domY - b.domY) > 4 ? a.domY - b.domY : a.addedOrder - b.addedOrder
    );
  }

  function ensureDock() {
    if (dockHost?.isConnected) return dockHost;
    dockHost = document.createElement('div');
    dockHost.dataset.xsDockHost = '';
    const root = dockHost.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = ':host{all:initial;position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483646;display:none}div.bar{display:flex;align-items:center;gap:10px;padding:8px 10px 8px 16px;border-radius:999px;background:#1c1f24;border:1px solid rgba(255,255,255,0.14);box-shadow:0 10px 30px rgba(0,0,0,0.3);color:#f7f8fa;font:500 13px/1 system-ui,"Microsoft YaHei",sans-serif;white-space:nowrap}span.count{color:#e7ecf2}button{appearance:none;border:0;border-radius:999px;cursor:pointer;font:600 12px/1 system-ui,"Microsoft YaHei",sans-serif;padding:8px 14px;transition:opacity .14s,background-color .14s}button.clear{background:rgba(255,255,255,0.12);color:#d7dde5}button.clear:hover{background:rgba(255,255,255,0.2)}button.merge{background:#e77748;color:#fff}button.merge:hover{background:#ee8457}button:disabled{opacity:.6;cursor:wait}';
    const bar = document.createElement('div');
    bar.className = 'bar';
    const count = document.createElement('span');
    count.className = 'count';
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'clear';
    clearBtn.textContent = '清空';
    clearBtn.addEventListener('click', () => clearSelection());
    const mergeBtn = document.createElement('button');
    mergeBtn.type = 'button';
    mergeBtn.className = 'merge';
    mergeBtn.textContent = '合并截图';
    mergeBtn.addEventListener('click', () => { void exportSelectedPosts(); });
    bar.append(count, clearBtn, mergeBtn);
    root.append(style, bar);
    dockHost._count = count;
    dockHost._merge = mergeBtn;
    document.documentElement.append(dockHost);
    return dockHost;
  }

  function syncSelectionUI() {
    if (selectedPosts.size === 0) {
      document.querySelectorAll('[data-xs-select][data-xs-selected]').forEach(btn => {
        delete btn.dataset.xsSelected;
        btn.title = '加入多选合并截图';
      });
      if (dockHost && dockHost.style.display !== 'none') dockHost.style.display = 'none';
      return;
    }
    for (const entry of selectedPosts.values()) {
      if (entry.article && !entry.article.isConnected) entry.article = null;
    }
    document.querySelectorAll(TWEET).forEach(article => {
      const entry = selectedPosts.get(getArticleKey(article));
      if (entry) {
        entry.article = article;
        const rect = article.getBoundingClientRect();
        entry.domY = rect.top + window.scrollY;
        if (rect.width >= 100 && rect.height >= 30) {
          entry.width = Math.ceil(rect.width);
          entry.height = Math.ceil(rect.height);
        }
      }
    });
    const ordered = orderedSelected();
    const indexMap = new Map(ordered.map((entry, idx) => [entry.key, idx + 1]));
    document.querySelectorAll('[data-xs-select]').forEach(btn => {
      const article = btn.closest(TWEET);
      const order = article ? indexMap.get(getArticleKey(article)) : null;
      if (order) {
        const label = String(order);
        const badge = btn._xsBadge || btn.querySelector('[data-xs-badge]');
        if (badge && badge.textContent !== label) badge.textContent = label;
        if (btn.dataset.xsSelected !== 'true') btn.dataset.xsSelected = 'true';
        const nextTitle = `已选中第 ${label} 条（点击取消）`;
        if (btn.title !== nextTitle) btn.title = nextTitle;
      } else if (btn.hasAttribute('data-xs-selected')) {
        delete btn.dataset.xsSelected;
        btn.title = '加入多选合并截图';
      }
    });
    const dock = ensureDock();
    const countText = `已选 ${ordered.length} 条`;
    const mergeText = ordered.length > 1 ? `合并截图 (${ordered.length})` : '截图并复制';
    if (dock._count.textContent !== countText) dock._count.textContent = countText;
    if (dock._merge.textContent !== mergeText) dock._merge.textContent = mergeText;
    dock._merge.disabled = busy;
    if (dock.style.display !== 'block') dock.style.display = 'block';
  }

  function clearSelection() {
    selectedPosts.clear();
    syncSelectionUI();
  }

  function captureLightweightSnapshot(article, entry) {
    const run = () => {
      if (!selectedPosts.has(entry.key) || !article.isConnected) return;
      const rect = article.getBoundingClientRect();
      if (rect.width >= 100 && rect.height >= 30) {
        entry.width = Math.ceil(rect.width);
        entry.height = Math.ceil(rect.height);
      }
      entry.background = effectiveBackground(article);
      const snapshot = article.cloneNode(true);
      snapshot.querySelectorAll('[data-xs-export], [data-xs-select], script, iframe').forEach(node => node.remove());
      snapshot.querySelectorAll('video').forEach(video => {
        const ph = document.createElement('div');
        if (video.poster) {
          const img = document.createElement('img');
          img.src = video.poster;
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
          ph.append(img);
        }
        video.replaceWith(ph);
      });
      entry.snapshot = snapshot;
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 250 });
    else setTimeout(run, 16);
  }

  function toggleSelect(article) {
    const key = getArticleKey(article);
    if (selectedPosts.has(key)) {
      selectedPosts.delete(key);
    } else {
      const rect = article.getBoundingClientRect();
      const entry = {
        key,
        article,
        snapshot: null,
        background: '#ffffff',
        post: getPost(article) || parsePostUrl(location.href),
        domY: rect.top + window.scrollY,
        addedOrder: ++selectionSeq,
        width: Math.ceil(rect.width) || 600,
        height: Math.ceil(rect.height) || 200
      };
      selectedPosts.set(key, entry);
      captureLightweightSnapshot(article, entry);
    }
    syncSelectionUI();
  }

  function toast(message, error = false, duration = 5000) {
    if (!toastHost?.isConnected) {
      toastHost = document.createElement('div');
      toastHost.dataset.xsToastHost = '';
      const root = toastHost.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = ':host{all:initial;position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 32px);pointer-events:none}div{box-sizing:border-box;padding:14px 20px;border:1px solid #41433f;border-radius:14px;background:#242823;color:#faf9f6;font:500 14px/1.6 system-ui,"Microsoft YaHei",sans-serif;box-shadow:0 8px 32px #0003;max-width:540px}div[data-error]{background:#552d24;border-color:#99573f}';
      const text = document.createElement('div');
      text.setAttribute('role', 'status');
      text.setAttribute('aria-live', 'polite');
      root.append(style, text);
      toastHost._text = text;
      document.documentElement.append(toastHost);
    }
    toastHost._text.textContent = message;
    toastHost._text.toggleAttribute('data-error', error);
    toastHost.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastHost.style.display = 'none'; }, duration);
  }

  async function message(payload) {
    try {
      const result = await chrome.runtime.sendMessage(payload);
      if (!result?.ok) throw Object.assign(new Error(result?.error || '插件未能完成操作，请重试。'), { code: result?.code });
      return result;
    } catch (error) {
      if (/Extension context invalidated|Receiving end does not exist/i.test(error.message)) {
        throw new Error('插件已更新，请刷新 X 页面后再试。');
      }
      throw error;
    }
  }

  function ownElements(article, selector) {
    return [...article.querySelectorAll(selector)].filter(node => node.closest(TWEET) === article);
  }

  function getPost(article) {
    const author = ownElements(article, '[data-testid="User-Name"]')[0] || article.querySelector('[data-testid="User-Name"]');
    for (const anchor of author?.querySelectorAll('a[href]') || []) {
      const parsed = parsePostUrl(anchor.href);
      if (parsed) return parsed;
    }
    // Detail views place the main timestamp below quoted content. Exclude quote/card wrappers
    // (div[role="link"]), NOT the timestamp <a role="link"> anchor itself!
    for (const time of ownElements(article, 'time')) {
      if (time.closest('[data-testid="card.wrapper"], [data-testid="quoteTweet"], div[role="link"]')) continue;
      const parsed = parsePostUrl(time.closest('a[href]')?.href);
      if (parsed) return parsed;
    }
    // A detail page's own focal post may have a timestamp without a status anchor.
    const route = parsePostUrl(location.href);
    const profilePath = author?.querySelector('a[href]')?.getAttribute('href') || '';
    if (route && !ownElements(article, 'time').some(t => !t.closest('[data-testid="card.wrapper"], [data-testid="quoteTweet"], div[role="link"]') && t.closest('a[href]')) &&
        profilePath.replace(/^https:\/\/(?:www\.)?(?:x|twitter)\.com/, '').replace(/\/$/, '') === `/${route.username}`) return route;
    return null;
  }

  function attachToolbar(row, slot, button, selectBtn) {
    if (button._xsToolbar && button._xsToolbar !== row) delete button._xsToolbar.dataset.xsToolbar;
    if (!row.hasAttribute('data-xs-toolbar')) row.dataset.xsToolbar = '';
    button._xsToolbar = row;
    if (button.hasAttribute('data-xs-floating')) {
      delete button.dataset.xsFloating;
      button.style.removeProperty('top');
      button.style.removeProperty('left');
    }
    if (button.parentElement !== row || button.nextElementSibling !== slot) row.insertBefore(button, slot);
    if (selectBtn) {
      if (selectBtn.hasAttribute('data-xs-floating')) {
        delete selectBtn.dataset.xsFloating;
        selectBtn.style.removeProperty('top');
        selectBtn.style.removeProperty('left');
      }
      if (selectBtn.parentElement !== row || selectBtn.nextElementSibling !== button) row.insertBefore(selectBtn, button);
    }
  }

  function placeExportButton(article, button, selectBtn) {
    const author = ownElements(article, '[data-testid="User-Name"]')[0];
    if (!author) return false;
    const authorBox = author.getBoundingClientRect();
    if (!authorBox.width || !authorBox.height) return false;
    // X's header actions no longer always carry data-testid="caret". Find the
    // first visible header control so the camera goes before Grok AND More.
    const controls = ownElements(article, 'button, [role="button"], [data-testid="caret"]')
      .filter(node => !author.contains(node) && !node.closest('[data-xs-export], [data-xs-select], [data-testid="quoteTweet"], [data-testid="card.wrapper"]'))
      .map(node => ({ node, box: node.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0 &&
        box.left >= authorBox.left &&
        Math.abs(box.top + box.height / 2 - (authorBox.top + Math.min(authorBox.height, 34) / 2)) <= 20)
      .sort((a, b) => a.box.left - b.box.left);
    const first = controls[0];

    if (first) {
      // Join the native action group itself. Placing the camera before a
      // stretching action-group container leaves a large empty gap and aligns
      // it with a two-line author block instead of the other buttons.
      for (let row = first.node.parentElement; row && row !== article; row = row.parentElement) {
        if (row.contains(author)) break;
        const style = getComputedStyle(row);
        if (style.display.includes('flex') && style.flexDirection === 'row' &&
            row.contains(controls.at(-1).node) &&
            !row.matches('button, [role="button"], a') &&
            !row.querySelector('[data-testid="tweetText"], [data-testid="tweetPhoto"], [data-testid="quoteTweet"], [data-testid="reply"]')) {
          let slot = first.node;
          while (slot.parentElement !== row) slot = slot.parentElement;
          attachToolbar(row, slot, button, selectBtn);
          return true;
        }
      }
      // Single-control comment headers (e.g., only caret "..." without Grok) wrap
      // the button in a column-flex View. Convert that wrapper into a row toolbar
      // instead of falling back to absolute floating coordinates.
      if (controls.length === 1) {
        const singleWrap = first.node.parentElement;
        if (singleWrap && singleWrap !== article && !singleWrap.contains(author) &&
            !singleWrap.matches('button, [role="button"], a') &&
            !singleWrap.querySelector('[data-testid="tweetText"], [data-testid="tweetPhoto"], [data-testid="quoteTweet"], [data-testid="reply"]')) {
          attachToolbar(singleWrap, first.node, button, selectBtn);
          return true;
        }
      }
    }

    // Keep a top-right button even while native actions are absent or use a
    // different layout. Never fall back to the bottom interaction bar.
    const box = article.getBoundingClientRect();
    if (button._xsToolbar) {
      delete button._xsToolbar.dataset.xsToolbar;
      button._xsToolbar = null;
    }
    if (getComputedStyle(article).position === 'static') article.dataset.xsPositioned = '';
    const left = first ? first.box.left - box.left - 38 : box.width - 50;
    const top = first ? first.box.top + first.box.height / 2 - box.top - 17 : authorBox.top - box.top;
    button.dataset.xsFloating = '';
    button.style.setProperty('left', `${Math.max(0, left - article.clientLeft)}px`, 'important');
    button.style.setProperty('top', `${Math.max(0, top - article.clientTop)}px`, 'important');
    if (button.parentElement !== article) article.append(button);
    if (selectBtn) {
      selectBtn.dataset.xsFloating = '';
      selectBtn.style.setProperty('left', `${Math.max(0, left - 34 - article.clientLeft)}px`, 'important');
      selectBtn.style.setProperty('top', `${Math.max(0, top + 3 - article.clientTop)}px`, 'important');
      if (selectBtn.parentElement !== article) article.append(selectBtn);
    }
    return true;
  }

  function stopCardEvent(event) {
    event.stopPropagation();
  }

  function addButtons(forceRelayout = false) {
    document.querySelectorAll(TWEET).forEach(article => {
      let button = ownElements(article, '[data-xs-export]')[0];
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.dataset.xsExport = '';
        button.title = '用 Xshots 复制帖子截图';
        button.setAttribute('aria-label', '复制帖子截图');
        button.innerHTML = ICON;
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
          button.addEventListener(type, stopCardEvent);
        }
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          exportPost(article, button);
        });
      }
      let selectBtn = ownElements(article, '[data-xs-select]')[0];
      if (!selectBtn) {
        selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.dataset.xsSelect = '';
        selectBtn.title = '加入多选合并截图';
        selectBtn.setAttribute('aria-label', '加入多选合并截图');
        selectBtn.innerHTML = `${SELECT_ICON}<span data-xs-badge></span>`;
        selectBtn._xsBadge = selectBtn.querySelector('[data-xs-badge]');
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
          selectBtn.addEventListener(type, stopCardEvent);
        }
        selectBtn.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          toggleSelect(article);
        });
      }
      // Fast-path: skip expensive layout measurements if buttons are already
      // mounted inside this tweet's live header toolbar.
      if (!forceRelayout &&
          !button.hasAttribute('data-xs-floating') &&
          button._xsToolbar?.isConnected &&
          button.parentElement === button._xsToolbar &&
          selectBtn.parentElement === button._xsToolbar &&
          selectBtn.nextElementSibling === button) {
        return;
      }
      placeExportButton(article, button, selectBtn);
    });
    syncSelectionUI();
  }

  function effectiveBackground(element) {
    for (let node = element; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      // Ignore translucent hover overlays; using them as the render backdrop
      // composites the tint twice and creates a muddy, hard-edged card.
      if (color && color !== 'transparent' && !/^rgba\(/.test(color)) return color;
    }
    return '#ffffff';
  }

  function imageUrls(value) {
    return [...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => match[1]);
  }

  function imageSource(img) {
    // img.src resolves an empty src attribute to the page URL. That URL is not
    // an image and must never be sent to the CDN image reader.
    return img.currentSrc || (img.getAttribute('src')?.trim() ? img.src : '');
  }

  function readableImage(img) {
    if (!img?.complete || !img.naturalWidth || !img.naturalHeight ||
        img.naturalWidth * img.naturalHeight > 24000000 ||
        img.naturalWidth > 16384 || img.naturalHeight > 16384) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      return canvas.toDataURL('image/webp', 0.96);
    } catch { return null; } // Respect canvas cross-origin protection.
  }

  async function collectAssets(article, cleanup) {
    const nodes = [article, ...article.querySelectorAll('*')];
    const entries = [];
    const assets = new Map();
    const imageNodes = new Map();
    const assetKinds = new Map();
    const videoFrames = new Map();
    const avatars = [];
    const token = `xs${Date.now().toString(36)}`;
    // X avatars use several overlapping circular layers. Flatten those layers in
    // the capture clone so html2canvas cannot paint a misplaced white mask.
    for (const root of article.querySelectorAll('[data-testid="Tweet-User-Avatar"], [data-testid^="UserAvatar-Container-"]')) {
      const img = root.querySelector('img');
      if (!img || !img.clientWidth || !img.clientHeight || !imageSource(img)) continue;
      if (getComputedStyle(img).opacity !== '0' && ![...root.querySelectorAll('*')].some(node => getComputedStyle(node).backgroundImage !== 'none')) continue;
      let surface = img;
      let radius = getComputedStyle(img).borderTopLeftRadius;
      for (let parent = img.parentElement; parent && root.contains(parent); parent = parent.parentElement) {
        const box = parent.getBoundingClientRect();
        if (Math.abs(box.width - img.clientWidth) > 4 || Math.abs(box.height - img.clientHeight) > 4) break;
        surface = parent;
        const value = getComputedStyle(parent).borderTopLeftRadius;
        if (parseFloat(value) > 0) radius = value;
        if (parent === root) break;
      }
      const id = `${token}-avatar-${avatars.length}`;
      surface.dataset.xsAvatar = id;
      cleanup.push(() => { if (surface.dataset.xsAvatar === id) delete surface.dataset.xsAvatar; });
      const src = imageSource(img);
      assets.set(src, null);
      imageNodes.set(src, img);
      assetKinds.set(src, '头像');
      avatars.push({ id, src, width: img.clientWidth, height: img.clientHeight, radius, fit: 'cover', objectPosition: '50% 50%' });
    }
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      if (node.closest('[data-xs-export], [data-xs-select]')) continue;
      const computed = getComputedStyle(node);
      if (computed.display === 'none' || computed.visibility === 'hidden' ||
          !node.getClientRects().length) continue;
      const entry = { id: `${token}-${index}` };
      if (node instanceof HTMLImageElement) {
        const rect = node.getBoundingClientRect();
        entry.src = imageSource(node);
        entry.fit = computed.objectFit;
        entry.objectPosition = computed.objectPosition;
        entry.width = node.clientWidth || Math.round(rect.width);
        entry.height = node.clientHeight || Math.round(rect.height);
        if (entry.src) {
          assets.set(entry.src, null);
          imageNodes.set(entry.src, node);
          if (!assetKinds.has(entry.src)) assetKinds.set(entry.src,
            node.closest('[data-testid="Tweet-User-Avatar"], [data-testid^="UserAvatar-Container-"]') ? '头像' :
            node.closest('[data-testid="User-Name"], [data-testid="tweetText"]') && entry.width <= 40 && entry.height <= 40 ? '表情' : '配图');
        }
      }
      const background = computed.backgroundImage;
      if (background !== 'none') {
        const urls = imageUrls(background);
        if (urls.length) {
          entry.background = background;
          urls.forEach(url => { assets.set(url, null); if (!assetKinds.has(url)) assetKinds.set(url, '背景图片'); });
        }
      }
      if (node instanceof HTMLVideoElement) {
        entry.video = true;
        entry.width = node.clientWidth;
        entry.height = node.clientHeight;
                entry.videoStyle = [...computed].map(key => `${key}:${computed.getPropertyValue(key)};`).join('');
        entry.fit = computed.objectFit || 'contain';
        entry.objectPosition = computed.objectPosition || '50% 50%';
        // html2canvas replaces videos with canvases without preserving attributes.
        const marker = document.createElement('span');
        marker.dataset.xsVideo = entry.id;
        marker.style.setProperty('display', 'none', 'important');
        node.before(marker);
        cleanup.push(() => marker.remove());
        if (node.readyState >= 2 && node.videoWidth) {
          try {
            const canvas = document.createElement('canvas');
            const ratio = Math.min(1, 1600 / node.videoWidth);
            canvas.width = Math.round(node.videoWidth * ratio);
            canvas.height = Math.round(node.videoHeight * ratio);
            canvas.getContext('2d').drawImage(node, 0, 0, canvas.width, canvas.height);
            videoFrames.set(entry.id, canvas.toDataURL('image/png'));
          } catch { /* Cross-origin video pixels are protected; the poster is used instead. */ }
        }
        if (!videoFrames.has(entry.id) && node.poster) {
          entry.poster = node.poster;
          assets.set(node.poster, null);
          assetKinds.set(node.poster, '视频封面');
        }
      }
      if (entry.src || entry.background || entry.video) {
        node.dataset.xsAsset = entry.id;
        cleanup.push(() => { if (node.dataset.xsAsset === entry.id) delete node.dataset.xsAsset; });
        entries.push(entry);
      }
    }
    const queue = [...assets.keys()];
    let failure;
    await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
      while (queue.length && !failure) {
        const url = queue.shift();
        if (/^data:image\/(?:png|jpeg|jpg|gif|webp|avif|svg\+xml)[;,]/i.test(url)) { assets.set(url, url); continue; }
        const img = imageNodes.get(url);
        // Prefer reading already-decoded pixels from the page when origin-clean;
        // fall back to background fetch for cross-origin assets or SVGs.
        const local = !/\.svg(?:$|\?)/i.test(url) ? readableImage(img) : null;
        if (local) { assets.set(url, local); continue; }
        try {
          const response = await message({ type: 'XS_FETCH_IMAGE', url });
          assets.set(url, response.dataUrl);
        } catch (error) {
          // A displayed, origin-clean image can still be copied when the CDN
          // refetch fails. Do not bypass CORS or silently omit visible assets.
          const cached = readableImage(img);
          if (cached) { assets.set(url, cached); continue; }
          let reason = error.message;
          if (error.code === 'XS_IMAGE_SOURCE') {
            let host = '';
            try { host = new URL(url).hostname; } catch { /* Invalid source. */ }
            reason = url.startsWith('blob:') ? '本地图片尚未加载完成或无法读取，请刷新页面后重试' :
              `图片来源暂不支持${host ? `（${host}）` : ''}`;
          }
          reason = reason.replace(/[。.!！]+$/, '');
          if (!failure) failure = Object.assign(new Error(`${assetKinds.get(url) || '图片'}读取失败：${reason}。`),
            { code: error.code, assetUrl: url, assetKind: assetKinds.get(url) });
        }
      }
    }));
    if (failure) throw failure;
    return { entries, assets, videoFrames, avatars };
  }

  async function fittedImage(dataUrl, entry, scale) {
    if (!entry.width || !entry.height) return dataUrl;
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(entry.width * scale));
    output.height = Math.max(1, Math.round(entry.height * scale));
    const ctx = output.getContext('2d');
    if (!['cover', 'contain', 'scale-down', 'none'].includes(entry.fit)) {
      ctx.drawImage(img, 0, 0, output.width, output.height);
      return output.toDataURL('image/webp', 0.96);
    }
    const contain = Math.min(entry.width / img.naturalWidth, entry.height / img.naturalHeight);
    const ratio = entry.fit === 'cover' ? Math.max(entry.width / img.naturalWidth, entry.height / img.naturalHeight) : entry.fit === 'scale-down' ? Math.min(1, contain) : entry.fit === 'none' ? 1 : contain;
    const width = img.naturalWidth * ratio * scale;
    const height = img.naturalHeight * ratio * scale;
    const positions = entry.objectPosition.split(/\s+/);
    const offset = (value, spare) => value?.endsWith('%') ? spare * parseFloat(value) / 100 : value?.endsWith('px') ? parseFloat(value) * scale : spare / 2;
    ctx.drawImage(img, offset(positions[0], output.width - width), offset(positions[1], output.height - height), width, height);
    return output.toDataURL('image/webp', 0.96);
  }

  async function renderArticle(article, settings, forcedScale) {
    if (!article.isConnected) throw new Error('帖子已移出页面，请滚动回这条帖子后重试。');
    const width = Math.ceil(article.getBoundingClientRect().width);
    const height = Math.ceil(article.getBoundingClientRect().height);
    if (width < 100 || height < 30) throw new Error('帖子还未显示完整，请加载后重试。');
    const padding = settings.background === 'plain' ? 0 : FRAME_PADDING;
    const scale = forcedScale || captureScale(width + padding * 2, height + padding * 2 + 48, settings.scale);
    const background = effectiveBackground(article);
    const articleStyle = getComputedStyle(article);
    const color = articleStyle.color;
    const font = articleStyle.fontFamily;
    const articlePadding = {
      top: Math.max(parseFloat(articleStyle.paddingTop) || 0, 20),
      right: Math.max(parseFloat(articleStyle.paddingRight) || 0, 22),
      bottom: Math.max(parseFloat(articleStyle.paddingBottom) || 0, 20),
      left: Math.max(parseFloat(articleStyle.paddingLeft) || 0, 22)
    };
    const cleanup = [];
    try {
    const resources = await collectAssets(article, cleanup);
    if (!article.isConnected) throw new Error('帖子已移出页面，请滚动回这条帖子后重试。');
    const canvas = await html2canvas(article, {
      backgroundColor: background,
      scale,
      logging: false,
      useCORS: false,
      allowTaint: false,
      imageTimeout: 15000,
      removeContainer: true,
      ignoreElements: node => {
        const tag = (node.tagName || '').toUpperCase();
        if (tag === 'SCRIPT' || tag === 'NOSCRIPT' || tag === 'IFRAME' || tag === 'OBJECT' || tag === 'EMBED') return true;
        if (tag === 'LINK') {
          const rel = (node.getAttribute?.('rel') || '').trim().toLowerCase();
          const asAttr = (node.getAttribute?.('as') || '').trim().toLowerCase();
          const href = node.getAttribute?.('href') || '';
          if (rel !== 'stylesheet' || asAttr === 'script' || /\.m?js(?:[?#]|$)/i.test(href)) return true;
        }
        return !node.contains(article) && !article.contains(node) && tag !== 'HEAD' && tag !== 'STYLE' && tag !== 'LINK';
      },
      onclone: async (doc, clone) => {
        await Promise.all(resources.entries.map(async entry => {
          const marker = entry.video ? clone.querySelector(`[data-xs-video="${entry.id}"]`) : null;
          const node = entry.video ? marker?.nextElementSibling : clone.dataset.xsAsset === entry.id ? clone : clone.querySelector(`[data-xs-asset="${entry.id}"]`);
          if (!node) return;
          if (entry.src) {
            node.removeAttribute('srcset');
            node.removeAttribute('crossorigin');
            node.loading = 'eager';
            node.src = await fittedImage(resources.assets.get(entry.src), entry, scale);
            if (entry.width && entry.height) {
              node.style.setProperty('width', `${entry.width}px`, 'important');
              node.style.setProperty('height', `${entry.height}px`, 'important');
              node.style.setProperty('max-width', '100%', 'important');
              node.style.setProperty('min-width', '0', 'important');
              node.style.setProperty('flex-shrink', '0', 'important');
              node.style.setProperty('object-fit', 'fill', 'important');
            }
          }
          if (entry.background) {
            let value = entry.background;
            for (const url of imageUrls(value)) value = value.split(url).join(resources.assets.get(url));
            node.style.setProperty('background-image', value, 'important');
          }
          if (entry.video) {
            const src = resources.videoFrames.get(entry.id) || resources.assets.get(entry.poster);
            const replacement = doc.createElement('div');
            replacement.style.cssText = entry.videoStyle;
            replacement.style.width = `${entry.width || width - 32}px`;
            replacement.style.height = `${entry.height || 240}px`;
            replacement.style.objectFit = 'contain';
            replacement.style.background = '#111';
            replacement.style.display = 'block';
            if (src) {
              replacement.style.backgroundImage = `url("${await fittedImage(src, entry, scale)}")`;
              replacement.style.backgroundSize = '100% 100%';
              replacement.style.backgroundPosition = 'center';
              replacement.style.backgroundRepeat = 'no-repeat';
            }
            else {
              replacement.textContent = '视频 · 无可用封面';
              replacement.style.cssText += ';color:#fff;text-align:center;padding:32px;box-sizing:border-box;';
            }
            node.replaceWith(replacement);
            marker.remove();
          }
        }));
        await Promise.all(resources.avatars.map(async avatar => {
          const surface = clone.querySelector(`[data-xs-avatar="${avatar.id}"]`);
          if (!surface) return;
          const bitmap = new Image();
          bitmap.src = await fittedImage(resources.assets.get(avatar.src), avatar, scale);
          await bitmap.decode();
          const flat = doc.createElement('canvas');
          flat.width = bitmap.naturalWidth;
          flat.height = bitmap.naturalHeight;
          flat.style.cssText = `display:block;width:${avatar.width}px;height:${avatar.height}px;`;
          const context = flat.getContext('2d');
          const radius = avatar.radius.endsWith('%') ? parseFloat(avatar.radius) / 100 * Math.min(flat.width, flat.height) : parseFloat(avatar.radius) * scale;
          context.beginPath();
          context.roundRect(0, 0, flat.width, flat.height, Math.min(radius || 0, flat.width / 2, flat.height / 2));
          context.clip();
          context.drawImage(bitmap, 0, 0);
          if (surface.tagName === 'IMG') {
            // Retain its layout styles, while the bitmap already contains its mask.
            flat.style.cssText = surface.style.cssText + `;display:block;width:${avatar.width}px;height:${avatar.height}px;`;
            flat.className = surface.className;
            surface.replaceWith(flat);
          } else {
            surface.replaceChildren(flat);
            for (const [key, value] of Object.entries({ width: `${avatar.width}px`, height: `${avatar.height}px`, 'min-width': `${avatar.width}px`, 'min-height': `${avatar.height}px`, padding: '0', background: 'transparent', 'border-radius': '0', overflow: 'visible', 'box-shadow': 'none' })) {
              surface.style.setProperty(key, value, 'important');
            }
          }
        }));
        clone.querySelectorAll('[data-xs-export], [data-xs-select], [data-testid="caret"], [data-testid="videoControls"], [data-testid="videoPlayerControls"], button[aria-label*="Grok"], [role="button"][aria-label*="Grok"]').forEach(node => node.remove());
        clone.querySelectorAll('[data-xs-toolbar]').forEach(node => delete node.dataset.xsToolbar);
        if (!settings.showMetrics) {
          const group = clone.querySelector('[data-testid="reply"]')?.closest('[role="group"]');
          group?.remove();
          clone.querySelectorAll('a[href$="/analytics"]').forEach(node => node.remove());
        }
        const stage = doc.createElement('div');
        stage.dataset.xsStage = '';
        stage.style.cssText = `display:block;position:absolute;left:0;top:0;width:${width}px;margin:0;padding:0;`;
        clone.style.setProperty('width', `${width}px`, 'important');
        clone.style.setProperty('max-width', `${width}px`, 'important');
        clone.style.setProperty('height', 'auto', 'important');
        clone.style.setProperty('margin', '0', 'important');
        clone.style.setProperty('padding-top', `${articlePadding.top}px`, 'important');
        clone.style.setProperty('padding-right', `${articlePadding.right}px`, 'important');
        clone.style.setProperty('padding-bottom', `${articlePadding.bottom}px`, 'important');
        clone.style.setProperty('padding-left', `${articlePadding.left}px`, 'important');
        clone.style.setProperty('position', 'relative', 'important');
        clone.style.setProperty('transform', 'none', 'important');
        clone.style.setProperty('border', '0', 'important');
        clone.style.setProperty('overflow', 'hidden', 'important');
        clone.style.setProperty('background-color', background, 'important');
        clone.style.setProperty('color', color, 'important');
        clone.style.setProperty('font-family', font, 'important');
        clone.style.setProperty('box-sizing', 'border-box', 'important');
        stage.append(clone);
        doc.body.replaceChildren(stage);
        doc.body.style.cssText = `margin:0;padding:0;overflow:visible;background:${background};`;
        const style = doc.createElement('style');
        style.textContent = '[data-xs-stage] * {animation:none!important;transition:none!important;caret-color:transparent!important;} [data-xs-stage] [data-testid="tweetPhoto"], [data-xs-stage] [data-testid="card.wrapper"], [data-xs-stage] [data-testid="quoteTweet"] {max-width:100%!important;overflow:hidden!important;} [data-xs-stage] [role="group"] {max-width:100%!important;box-sizing:border-box!important;}';
        doc.head.append(style);
        await Promise.all([...clone.querySelectorAll('img')]
          .filter(img => imageSource(img) && img.getClientRects().length && doc.defaultView.getComputedStyle(img).visibility !== 'hidden')
          .map(img => img.decode().catch(() => {})));
      }
    });
    if (!canvas.width || !canvas.height) throw new Error('图片生成失败，请刷新后重试。');
    return { canvas, scale, background, color };
    } finally { cleanup.forEach(clean => clean()); }
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  function drawXMark(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = color;
    ctx.fill(new Path2D('M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-5-7.6L5.2 22H2l7.4-8.5L1.8 2h6.5l4.5 6.9L18.9 2Zm-1.1 18h1.7L7.3 3.9H5.5L17.8 20Z'));
    ctx.restore();
  }

  function frameImage(capture, settings, post) {
    const { canvas: card, scale, background } = capture;
    const padding = settings.background === 'plain' ? 0 : Math.round(FRAME_PADDING * scale);
    const footer = settings.showSource ? Math.round((padding ? 48 : 44) * scale) : 0;
    const output = document.createElement('canvas');
    output.width = card.width + padding * 2;
    output.height = card.height + padding * 2 + footer;
    // Check final dimensions too, since clone layout may differ from its source.
    if (output.width > 16384 || output.height > 16384 || output.width * output.height > 27000000) {
      throw new Error('截图尺寸过大，请选择 1× 清晰度或分段导出。');
    }
    const ctx = output.getContext('2d');
    if (!ctx) throw new Error('浏览器无法创建图片，请关闭部分标签页后重试。');
    if (settings.background === 'plain') ctx.fillStyle = background;
    else {
      const gradient = ctx.createLinearGradient(0, 0, output.width, output.height);
      gradient.addColorStop(0, settings.background === 'mist' ? '#faf3ed' : '#253049');
      gradient.addColorStop(0.52, settings.background === 'mist' ? '#f2eef5' : '#1a2237');
      gradient.addColorStop(1, settings.background === 'mist' ? '#e8eef8' : '#111727');
      ctx.fillStyle = gradient;
    }
    ctx.fillRect(0, 0, output.width, output.height);
    const radius = padding ? 18 * scale : 0;
    if (padding) {
      // Broad radial light keeps the backdrop smooth around every card edge.
      const glow = ctx.createRadialGradient(output.width * 0.16, 0, 0,
        output.width * 0.16, 0, Math.max(output.width, output.height) * 0.85);
      glow.addColorStop(0, settings.background === 'mist' ? '#ffffffb8' : '#8da3dc24');
      glow.addColorStop(1, '#ffffff00');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, output.width, output.height);
      const secondaryGlow = ctx.createRadialGradient(output.width * 0.88, output.height, 0,
        output.width * 0.88, output.height, Math.max(output.width, output.height) * 0.65);
      secondaryGlow.addColorStop(0, settings.background === 'mist' ? '#dce7ff55' : '#4a68b81a');
      secondaryGlow.addColorStop(1, '#ffffff00');
      ctx.fillStyle = secondaryGlow;
      ctx.fillRect(0, 0, output.width, output.height);
      ctx.save();
      ctx.shadowColor = settings.background === 'mist' ? '#4a506824' : '#05091470';
      ctx.shadowBlur = 34 * scale;
      ctx.shadowOffsetY = 12 * scale;
      roundedRect(ctx, padding, padding, card.width, card.height, radius);
      ctx.fillStyle = background;
      ctx.fill();
      // A second low-opacity halo softens the immediate edge without blurring text.
      ctx.shadowColor = settings.background === 'mist' ? '#4a506810' : '#0509142e';
      ctx.shadowBlur = 8 * scale;
      ctx.shadowOffsetY = 2 * scale;
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    roundedRect(ctx, padding, padding, card.width, card.height, radius);
    ctx.clip();
    ctx.drawImage(card, padding, padding);
    ctx.restore();
    if (padding) {
      ctx.save();
      roundedRect(ctx, padding, padding, card.width, card.height, radius);
      ctx.lineWidth = Math.max(1, scale);
      ctx.strokeStyle = settings.background === 'midnight' ? 'rgba(255, 255, 255, 0.10)' : 'rgba(24, 30, 48, 0.06)';
      ctx.stroke();
      ctx.restore();
    }
    if (footer) {
      const footerY = padding + card.height + footer / 2 + (padding ? 4 * scale : 0);
      const insetX = padding ? padding + 4 * scale : 22 * scale;
      if (!padding) {
        ctx.save();
        ctx.strokeStyle = 'rgba(128, 128, 128, 0.16)';
        ctx.lineWidth = Math.max(1, scale);
        ctx.beginPath();
        ctx.moveTo(insetX, padding + card.height + Math.max(1, scale) * 0.5);
        ctx.lineTo(output.width - insetX, padding + card.height + Math.max(1, scale) * 0.5);
        ctx.stroke();
        ctx.restore();
      }
      const ink = settings.background === 'midnight' ? 'rgba(208, 216, 236, 0.78)'
        : settings.background === 'plain' ? capture.color : 'rgba(92, 86, 84, 0.82)';
      const iconSize = 11.5 * scale;
      ctx.save();
      if (settings.background === 'plain') ctx.globalAlpha = 0.58;
      drawXMark(ctx, insetX, footerY - iconSize / 2, iconSize, ink);
      ctx.fillStyle = ink;
      ctx.font = `500 ${11.5 * scale}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.textBaseline = 'middle';
      const source = post ? post.url.replace('https://', '') : '来源：X · 当前页面';
      const textX = insetX + iconSize + 7 * scale;
      const watermark = card.width >= 340 * scale ? (settings.watermark || '').trim() : '';
      let watermarkWidth = 0;
      if (watermark) {
        ctx.font = `500 ${11 * scale}px system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif`;
        watermarkWidth = Math.min(ctx.measureText(watermark).width, card.width * 0.42);
      }
      ctx.font = `500 ${11.5 * scale}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      const rightEdge = padding ? padding + card.width - 4 * scale : output.width - insetX;
      const maxSourceWidth = rightEdge - textX - (watermarkWidth ? watermarkWidth + 16 * scale : 0);
      ctx.fillText(source, textX, footerY, Math.max(80 * scale, maxSourceWidth));
      if (watermark) {
        ctx.globalAlpha = settings.background === 'midnight' ? 0.56 : settings.background === 'plain' ? 0.52 : 0.62;
        ctx.font = `500 ${11 * scale}px system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(watermark, rightEdge, footerY, card.width * 0.42);
      }
      ctx.restore();
    }
    return output;
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('图片编码失败，请关闭部分标签页后重试。'));
      }, 'image/png');
    });
  }

  async function copyPngToClipboard(blob) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('截图数据读取失败，请重试。'));
      reader.readAsDataURL(blob);
    });
    await message({ type: 'XS_COPY_PNG', dataUrl });
  }

  async function exportPost(article, button) {
    if (busy) { toast('正在生成截图，请稍候。'); return; }
    busy = true;
    button?.setAttribute('aria-busy', 'true');
    try {
      const collapsed = article.querySelector('[data-testid="tweet-text-show-more-link"]');
      if (collapsed) throw new Error('请先点「显示更多」展开帖子，再复制完整截图。');
      const stored = await chrome.storage.local.get('settings');
      const settings = normalizeSettings(stored.settings);
      const post = getPost(article);
      if (!post) throw new Error('暂时无法识别这条帖子的来源，请打开帖子详情后重试。');
      toast('正在生成高清截图…', false, 60000);
      const capture = await renderArticle(article, settings);
      const canvas = frameImage(capture, settings, post);
      await copyPngToClipboard(await canvasToPngBlob(canvas));
      toast(capture.scale < settings.scale ? '已复制到剪切板 · 长图已自动调整清晰度' : '已复制到剪切板，可直接粘贴');
    } catch (error) {
      console.warn('[Xshots]', error, error.assetUrl ? { kind: error.assetKind, url: error.assetUrl, code: error.code } : '');
      const text = /Extension context invalidated|Receiving end does not exist/i.test(error?.message)
        ? '插件已更新，请刷新 X 页面后再试。'
        : (error?.message || '截图失败，请刷新页面后重试。');
      toast(text, true, 8000);
    } finally {
      busy = false;
      button?.removeAttribute('aria-busy');
      syncSelectionUI();
    }
  }

  function mergeCaptures(captures) {
    if (captures.length === 1) return captures[0];
    const scale = captures[0].scale;
    const background = captures[0].background;
    const color = captures[0].color;
    const width = Math.max(...captures.map(item => item.canvas.width));
    const height = captures.reduce((sum, item) => sum + item.canvas.height, 0);
    const merged = document.createElement('canvas');
    merged.width = width;
    merged.height = height;
    const ctx = merged.getContext('2d');
    if (!ctx) throw new Error('浏览器无法创建图片，请关闭部分标签页后重试。');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    let y = 0;
    const inset = Math.round(22 * scale);
    const lineHeight = Math.max(1, Math.round(scale));
    captures.forEach((item, index) => {
      ctx.drawImage(item.canvas, 0, y);
      if (index > 0) {
        ctx.fillStyle = 'rgba(128, 128, 128, 0.16)';
        ctx.fillRect(inset, y, Math.max(1, width - inset * 2), lineHeight);
      }
      y += item.canvas.height;
    });
    return { canvas: merged, scale, background, color };
  }

  async function renderSnapshot(entry, settings, scale) {
    if (!entry.snapshot) throw new Error('部分已选帖子已滑出页面，请滑回该帖子位置后重试。');
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-99999px;top:0;width:${entry.width}px;background:${entry.background};pointer-events:none;z-index:-1;`;
    host.append(entry.snapshot);
    document.body.append(host);
    try {
      await Promise.all([...entry.snapshot.querySelectorAll('img')].map(img =>
        img.complete ? Promise.resolve() : new Promise(resolve => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
          setTimeout(resolve, 4000);
        })
      ));
      return await renderArticle(entry.snapshot, settings, scale);
    } finally {
      host.remove();
    }
  }

  async function exportSelectedPosts() {
    if (busy) { toast('正在生成截图，请稍候。'); return; }
    const entries = orderedSelected();
    if (!entries.length) { toast('请先点击帖子右上角的「+」选择要合并的帖子或评论。'); return; }
    if (entries.length === 1 && entries[0].article?.isConnected) {
      await exportPost(entries[0].article, entries[0].article.querySelector('[data-xs-export]'));
      clearSelection();
      return;
    }
    busy = true;
    syncSelectionUI();
    try {
      const stored = await chrome.storage.local.get('settings');
      const settings = normalizeSettings(stored.settings);
      let maxWidth = 0;
      let totalHeight = 0;
      for (const entry of entries) {
        const target = entry.article?.isConnected ? entry.article : entry.snapshot;
        if (target?.querySelector('[data-testid="tweet-text-show-more-link"]')) {
          throw new Error('请先点「显示更多」展开所有已选帖子，再合并截图。');
        }
        if (entry.article?.isConnected) {
          const rect = entry.article.getBoundingClientRect();
          entry.width = Math.ceil(rect.width);
          entry.height = Math.ceil(rect.height);
        }
        maxWidth = Math.max(maxWidth, entry.width);
        totalHeight += entry.height;
      }
      const padding = settings.background === 'plain' ? 0 : FRAME_PADDING;
      const scale = captureScale(maxWidth + padding * 2, totalHeight + padding * 2 + 48, settings.scale);
      const post = entries.map(entry => entry.post).find(Boolean);
      if (!post) throw new Error('暂时无法识别帖子来源，请打开帖子详情后重试。');
      toast(`正在合并生成 ${entries.length} 条帖子截图…`, false, 60000);
      const captures = [];
      for (const entry of entries) {
        if (entry.article?.isConnected) {
          captures.push(await renderArticle(entry.article, settings, scale));
        } else {
          captures.push(await renderSnapshot(entry, settings, scale));
        }
      }
      const merged = mergeCaptures(captures);
      const canvas = frameImage(merged, settings, post);
      await copyPngToClipboard(await canvasToPngBlob(canvas));
      const count = entries.length;
      clearSelection();
      toast(scale < settings.scale
        ? `已复制 ${count} 条帖子的合并截图 · 长图已自动调整清晰度`
        : `已复制 ${count} 条帖子的合并截图，可直接粘贴`);
    } catch (error) {
      console.warn('[Xshots]', error, error.assetUrl ? { kind: error.assetKind, url: error.assetUrl, code: error.code } : '');
      const text = /Extension context invalidated|Receiving end does not exist/i.test(error?.message)
        ? '插件已更新，请刷新 X 页面后再试。'
        : (error?.message || '合并截图失败，请刷新页面后重试。');
      toast(text, true, 8000);
    } finally {
      busy = false;
      syncSelectionUI();
    }
  }

  function visiblePost() {
    return [...document.querySelectorAll(TWEET)].map(article => {
      const rect = article.getBoundingClientRect();
      const visible = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      return { article, score: visible && rect.right > 0 && rect.left < innerWidth ? visible / Math.min(rect.height, innerHeight) - Math.abs(rect.top) / 100000 : 0 };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score)[0]?.article;
  }

  chrome.runtime.onMessage.addListener((payload, _sender, respond) => {
    if (payload?.type === 'XS_STATUS') {
      respond({
        ok: true,
        count: document.querySelectorAll(TWEET).length,
        selectedCount: selectedPosts.size,
        busy
      });
    } else if (payload?.type === 'XS_EXPORT_VISIBLE') {
      if (busy) { respond({ ok: false, error: '正在生成截图，请稍候。' }); return; }
      if (selectedPosts.size > 1) {
        respond({ ok: true });
        void exportSelectedPosts();
        return;
      }
      const article = visiblePost();
      if (!article) { respond({ ok: false, error: '当前画面没有帖子，请滚动到帖子位置。' }); return; }
      respond({ ok: true });
      void exportPost(article, article.querySelector('[data-xs-export]'));
    }
  });
  let scheduled = false;
  let pendingRelayout = false;
  function scheduleAddButtons(delay = 200, forceRelayout = false) {
    if (forceRelayout) pendingRelayout = true;
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      const relayout = pendingRelayout;
      pendingRelayout = false;
      addButtons(relayout);
    }, delay);
  }
  function isOwnUiNode(node) {
    return node?.nodeType === 1 && (node.hasAttribute('data-xs-toast-host') || node.hasAttribute('data-xs-dock-host'));
  }
  const observer = new MutationObserver(records => {
    if (!records.some(record =>
      [...record.addedNodes, ...record.removedNodes].some(node => !isOwnUiNode(node))
    )) return;
    scheduleAddButtons(200);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', () => scheduleAddButtons(200, true));
  window.addEventListener('scroll', () => scheduleAddButtons(250), { passive: true });
  addButtons();
})();
