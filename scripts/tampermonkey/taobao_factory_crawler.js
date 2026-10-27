// ==UserScript==
// @name         淘工厂大米竞品分析采集助手
// @namespace    http://excel-tool.supplychain/
// @version      2.1.0
// @description  一键采集淘宝/淘工厂大米销量前20商品及SKU数据，支持全部评价分页采集、追评与全文同步，直连本地桌面工具
// @author       Excel Tool
// @match        *://s.taobao.com/*
// @match        *://item.taobao.com/*
// @match        *://detail.tmall.com/*
// @match        *://*.tmall.com/*
// @match        *://tmai.tmall.com/*
// @match        *://*.taobao.com/*
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_notification
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(function () {
  'use strict';

  const DESKTOP_RECEIVER_URL = 'http://127.0.0.1:41235/push';
  const DESKTOP_REVIEW_URL = 'http://127.0.0.1:41235/push-review';

  // 避免在 iframe 中重复渲染
  if (window.top !== window.self) return;

  const isDetailPage = (location.href.includes('detail.tmall.com/item.htm') || 
                        location.href.includes('item.taobao.com/item.htm')) && 
                       !location.href.includes('search.htm');

  // 创建悬浮工具栏
  const panel = document.createElement('div');
  panel.id = 'tf-rice-crawler-panel';
  panel.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999999;
    background: #18181b;
    color: #f4f4f5;
    padding: 14px 18px;
    border-radius: 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    border: 1px solid #27272a;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 260px;
    backdrop-filter: blur(8px);
  `;

  if (isDetailPage) {
    // 商详页专属面板：真实评价与差评标签提取
    panel.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #27272a; padding-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: #fff;">
          <span style="font-size: 16px;">🌾</span> 全部评价采集 · v2.1.0
        </div>
        <span id="tf-status-badge" style="font-size: 11px; background: #0284c7; color: #fff; padding: 2px 6px; border-radius: 4px;">商详页</span>
      </div>
      <div id="tf-crawler-msg" style="color: #a1a1aa; font-size: 12px; line-height: 1.4;">
        慢速读取全部评价：翻页间隔至少10秒，每20页休息60秒；访问受限即停止并保存已读结果。
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="tf-btn-extract-detail" style="flex: 1; background: #15803d; color: #fff; border: none; padding: 7px 12px; border-radius: 6px; font-weight: 500; cursor: pointer; transition: 0.15s;">
          读取全部评价并同步
        </button>
      </div>
    `;
  } else {
    // 搜索列表页面板：Top 20 抓取
    panel.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #27272a; padding-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: #fff;">
          <span style="font-size: 16px;">🌾</span> 淘工厂竞品采集
        </div>
        <span id="tf-status-badge" style="font-size: 11px; background: #27272a; color: #a1a1aa; padding: 2px 6px; border-radius: 4px;">待命</span>
      </div>
      <div id="tf-crawler-msg" style="color: #a1a1aa; font-size: 12px; line-height: 1.4;">
        在搜索页（如“淘工厂 大米”）按销量排序后，点击采集前20款。
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="tf-btn-scrape" style="flex: 1; background: #15803d; color: #fff; border: none; padding: 7px 12px; border-radius: 6px; font-weight: 500; cursor: pointer; transition: 0.15s;">
          一键采集Top20
        </button>
        <button id="tf-btn-push" style="background: #3f3f46; color: #f4f4f5; border: none; padding: 7px 12px; border-radius: 6px; cursor: pointer; display: none;">
          推送桌面端
        </button>
      </div>
      <div id="tf-copy-tip" style="font-size: 11px; color: #71717a; text-align: center; cursor: pointer; display: none;">
        点此复制 JSON 数据
      </div>
    `;
  }

  document.body.appendChild(panel);

  const statusBadge = document.getElementById('tf-status-badge');
  const msgEl = document.getElementById('tf-crawler-msg');

  function setStatus(badgeText, badgeBg, message) {
    if (statusBadge) {
      statusBadge.innerText = badgeText;
      statusBadge.style.background = badgeBg;
    }
    if (msgEl && message) msgEl.innerText = message;
  }

  // Only retain review text and product context, never buyer identities.
function normalizeReview(raw = {}) {
  const plain = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const content = plain(raw.content || raw.rateContent || raw.feedback || raw.reviewContent);
  const appendContent = plain(raw.appendContent || raw.appendComment?.content || raw.append?.content || raw.appendedFeed?.appendedFeedback);
  if (!content && !appendContent) return null;
  if (/^(此用户没有填写评价|评价方未及时做出评价|系统默认好评)[。！!\s]*$/.test(content) && !appendContent) return null;
  return {
    id: plain(raw.feedId || raw.rateId || raw.id), content, appendContent,
    date: plain(raw.dateTime || raw.rateDate || raw.date || raw.feedbackDate),
    sku: plain(raw.skuInfo || raw.auctionSku || raw.sku) || Object.values(raw.skuMap || {}).map(plain).filter(Boolean).join(' / ')
  };
}

function reviewKey(review) {
  return review.id ? `id:${review.id}` : `text:${review.content}\n${review.appendContent}\n${review.date}\n${review.sku}`;
}

function negativeReviewText(reviews) {
  return reviews.map(r => [r.content, r.appendContent].filter(Boolean).join('；')).filter(t => {
    const complaints = t.replace(/(?:没有|没|无|未|不是|不)(?:任何|其他|发现|出现|发生){0,2}(?:(?:漏气|漏洒|破损|碎米|发霉|虫子?|陈米|异味|质量问题)[、和及或]?)+/g, '');
    return /漏气|破损|碎米|发霉|虫|陈米|难吃|不新鲜|退货|不好吃|口感.{0,4}硬|发柴|没有.{0,3}香|不推荐|差评/.test(complaints);
  }).slice(0, 3).join('；');
}

function createReviewAccumulator() {
  const records = new Map();
  return {
    add(rows) {
      for (const raw of rows || []) {
        const review = normalizeReview(raw);
        if (!review) continue;
        const key = reviewKey(review), old = records.get(key);
        if (review.id) for (const [existingKey, existing] of records) {
          if (!existing.id && existing.content === review.content && existing.appendContent === review.appendContent) records.delete(existingKey);
        }
        records.set(key, old ? { ...old, ...Object.fromEntries(Object.entries(review).filter(([, v]) => v !== '')) } : review);
      }
    },
    get size() { return records.size; },
    result({ complete = false, total = '', reason = '', foldedCount = 0, rateLimited = false } = {}) {
      const reviews = [...records.values()];
      return {
        reviews, reviewCount: reviews.length, reviewTotal: String(total || ''), reviewComplete: complete && !foldedCount,
        reviewListExhausted: complete, reviewExcludedCount: foldedCount,
        reviewRateLimited: rateLimited, reviewStopReason: reason,
        reviewScope: 'all', negativeReviews: negativeReviewText(reviews),
        reviewStatus: `${complete ? '可见评价列表已读完' : '全部评价未读完'}：已读${reviews.length}条${total ? ` / 页面标示${total}条` : ''}${foldedCount ? `；平台折叠${foldedCount}条，未展示全文` : ''}${reason ? `；${reason}` : ''}`
      };
    }
  };
}

// Called only for responses already associated with the current product.
function parseReviewResponse(data = {}) {
  const detail = data.rateDetail || data;
  const list = detail.rateList || detail.reviewList || detail.feedbacks || detail.group?.items;
  if (!Array.isArray(list)) return null;
  const paginator = detail.paginator || data.paginator || {};
  const page = Number(paginator.page || paginator.currentPage || detail.pageNum || data.pageNum);
  const lastPage = Number(paginator.lastPage || paginator.totalPage || detail.totalPage);
  const explicitEnd = detail.hasNext === false || detail.hasNext === 'false' || detail.hasMore === false || detail.hasMore === 'false'
    || (page > 0 && lastPage > 0 && page >= lastPage);
  return { rows: list, total: detail.totalFuzzy || detail.total || detail.totalCount || detail.rateCount || paginator.items || '', page: page || null, lastPage: lastPage || null, end: explicitEnd, foldedCount: Number(detail.foldCount) || 0 };
}

// Serialized into the normal product page. The drawer and comments container
// names below were verified against the site's actual rendered review list.
function reviewPageAction({ action = 'read', itemId = '' } = {}) {
  const text = el => String(el?.innerText || el?.textContent || '').trim();
  const visible = el => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const all = (root, selector) => [...root.querySelectorAll(selector)].filter(visible);
  const current = new URL(location.href).searchParams.get('id');
  if (itemId && current && current !== String(itemId)) return { error: '商品已切换，停止读取评价' };
  const point = el => {
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const rect = el.getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  };
  const drawer = all(document, '[class*="Drawer--"], [role="dialog"], .next-dialog').find(el => el.querySelector('[class*="Comments--"], .tm-rate-list, .rate-grid'));
  if (!drawer) {
    const button = all(document, '[class*="ShowButton--"], button, a, [role="button"]').find(el => /^查看全部评价$/.test(text(el)));
    return { opened: false, point: action === 'open' ? point(button) : null, rows: [] };
  }
  if (action === 'close') return { opened: true, point: point(drawer.querySelector('[class*="closeWrap--"], [aria-label="关闭"], .next-dialog-close')) };
  const allFilter = all(drawer, '[class*="expressionWrap--"] [class*="imprItem--"], [role="tab"], button').find(el => text(el) === '全部');
  if (action === 'all' && allFilter && !/isSelected|active/i.test(allFilter.className) && allFilter.getAttribute('aria-selected') !== 'true') return { opened: true, point: point(allFilter), rows: [] };
  const rows = all(drawer, '[class*="Comment--"], .tm-rate-list > li, .rate-grid tr').map(row => {
    const contents = all(row, '[class*="contentWrapper--"] > [class*="content--"], .tm-rate-fulltxt, .tm-rate-content');
    return { content: text(contents[0]), appendContent: contents.slice(1).map(text).join('\n'), date: text(row.querySelector('[class*="date--"], .tm-rate-date')), sku: text(row.querySelector('[class*="sku--"], .tm-rate-sku')) };
  });
  const scroll = drawer.querySelector('[class*="comments--"], .tm-rate-list, .rate-grid');
  const loading = all(drawer, '[class*="loadingWrapper--"], [class*="loadingSkeletonWrapper--"], [aria-busy="true"]').length > 0;
  const folded = text(drawer.querySelector('[class*="foldInfoContent--"]')).match(/折叠\s*(\d+)\s*条/);
  const total = text(drawer.querySelector('[class*="titleWrapper--"]')).match(/(?:评价|评论)[^\d]{0,5}([\d万千+.]+)/)?.[1] || '';
  const end = all(drawer, '[class*="emptyTip--"], [class*="moreText--"], [class*="noMore" i]').some(el => /没有更多评价|已显示全部评价|暂时还没有评价|暂无评价/.test(text(el)));
  if (action === 'advance' && !loading) {
    const next = all(drawer, 'button, a, [class*="nextBtn--"]').find(el => /^(下一页|加载更多)$/.test(text(el)) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
    if (next) return { opened: true, rows, point: point(next), loading, end, total, foldedCount: Number(folded?.[1]) || 0 };
    if (scroll) {
      scroll.scrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      scroll.dispatchEvent(new Event('scroll', { bubbles: false }));
    }
  }
  return { opened: true, rows, loading, end, total, foldedCount: Number(folded?.[1]) || 0, scrollHeight: scroll?.scrollHeight || 0 };
}

async function collectAllReviews({ itemId, execute, pageAction, click, collector, waitForVerification, isCancelled = () => false, onProgress = () => {}, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => Date.now(), pacing = {} }) {
  const accumulator = createReviewAccumulator(), pages = new Set();
  const interval = pacing.pageIntervalMs ?? 10000, batchSize = pacing.batchSize ?? 20, batchRest = pacing.batchRestMs ?? 60000;
  let total = '', foldedCount = 0, finalPage = null, responseCount = 0, lastActivity = now(), responseError = '', rateLimited = false;
  let nextAdvanceAt = now() + interval, requestedAt = null, requestedVersion = '', restedThrough = 0;
  const startedAt = Date.now();
  const onRecord = record => {
    if (record.itemId !== String(itemId) || record.capturedAt < startedAt || !/rate|review|comment/i.test(record.api) || record.reviewAll === false) return;
    if (record.ret?.some(ret => !ret.startsWith('SUCCESS'))) {
      rateLimited = record.ret.some(ret => /LIMIT|FREQ|TRAFFIC|ACCESS_DENIED|HTTP_429|HTTP_403|RGV|USER_VALIDATE|频繁|拒绝|受限/i.test(ret));
      responseError = rateLimited ? '平台限制访问，已停止请求并保存已读评价；请稍后手动重试' : '评价请求失败，已停止翻页并保留读取结果';
      return;
    }
    const parsed = parseReviewResponse(record.data);
    if (!parsed) return;
    responseCount++;
    accumulator.add(parsed.rows);
    total = parsed.total || total; foldedCount = Math.max(foldedCount, parsed.foldedCount);
    const page = parsed.page || record.page;
    const newPage = page && !pages.has(page);
    if (page) pages.add(page);
    if (newPage) nextAdvanceAt = Math.max(nextAdvanceAt, now() + interval);
    if (parsed.end && page) finalPage = page;
    if (newPage || accumulator.size > previousSize) lastActivity = now();
  };
  const unsubscribe = collector?.onRecord(onRecord) || (() => {});
  const act = async action => {
    const state = pageAction ? await pageAction({ action, itemId }) : await execute(`(${reviewPageAction.toString()})(${JSON.stringify({ action, itemId })})`);
    if (state?.point) await click(state.point);
    return state;
  };
  let opened = false, reason = '', complete = false, previousSize = 0;
  try {
    if (!await waitForVerification()) return accumulator.result({ reason: '采集已停止' });
    // Reopen to page one, so reaching the final page proves contiguous coverage.
    const existing = await act('read');
    if (existing?.opened) { await act('close'); await pause(400); }
    await act('open');
    for (let attempt = 0; attempt < 20 && !isCancelled(); attempt++) {
      if (!await waitForVerification()) break;
      if (responseError) return accumulator.result({ total, foldedCount, reason: responseError, rateLimited });
      const state = await act('read');
      if (state?.opened) { opened = true; break; }
      await pause(500);
    }
    if (!opened) return accumulator.result({ reason: '未能打开全部评价列表，请重试或在采集窗口打开评价' });
    await act('all'); await pause(500);
    while (!isCancelled()) {
      const verificationStarted = now();
      if (!await waitForVerification()) break;
      // Time spent waiting for a person's verification is not a loading stall.
      const verificationTime = now() - verificationStarted;
      lastActivity = Math.min(now(), lastActivity + verificationTime);
      if (requestedAt != null) requestedAt += verificationTime;
      await collector?.flush();
      if (responseError) { reason = responseError; break; }
      const state = await act('read');
      if (!state || state.error || state.__tf_error || !state.opened) { reason = state?.error || '评价列表已关闭或读取失败'; break; }
      if (!responseCount) accumulator.add(state.rows);
      total ||= state.total || ''; foldedCount = Math.max(foldedCount, state.foldedCount || 0);
      if (accumulator.size > previousSize) { lastActivity = now(); previousSize = accumulator.size; }
      onProgress({ count: accumulator.size, total, pages: pages.size, message: `全部评价：已读${accumulator.size}条，已读取${pages.size}页${total ? `，页面标示${total}条` : ''}` });
      const contiguous = finalPage && pages.size >= finalPage && Array.from({ length: finalPage }, (_, i) => i + 1).every(page => pages.has(page));
      if (!state.loading && (contiguous || (!responseCount && state.end))) { complete = true; break; }
      if (!responseCount && !accumulator.size && now() - lastActivity > 45000) { reason = '评价列表45秒未加载，已停止请求，请稍后重试'; break; }
      const version = `${pages.size}:${accumulator.size}`;
      if (requestedAt != null && version !== requestedVersion) { requestedAt = null; nextAdvanceAt = now() + interval; }
      if (requestedAt != null && now() - requestedAt > 45000) { reason = '本页45秒未返回新评价，已停止请求并保存结果，请稍后重试'; break; }
      if (requestedAt == null && pages.size > 0 && pages.size % batchSize === 0 && pages.size > restedThrough) {
        restedThrough = pages.size; nextAdvanceAt = Math.max(nextAdvanceAt, now() + batchRest);
      }
      if (!state.loading && requestedAt == null && now() >= nextAdvanceAt) {
        requestedAt = now(); requestedVersion = version;
        await act('advance');
      } else if (requestedAt == null && nextAdvanceAt > now()) {
        onProgress({ count: accumulator.size, total, pages: pages.size, coolingDown: true, seconds: Math.ceil((nextAdvanceAt - now()) / 1000), message: `已读${accumulator.size}条，休息${Math.ceil((nextAdvanceAt - now()) / 1000)}秒后读取下一页` });
      }
      await pause(500);
    }
    if (isCancelled()) reason = '采集已停止，已保留当前读取结果';
    return accumulator.result({ complete, total, reason, foldedCount, rateLimited });
  } catch (error) {
    rateLimited ||= error.code === 'COMPETITOR_RATE_LIMITED';
    return accumulator.result({ total, foldedCount, rateLimited, reason: `评价读取中断：${error.message}` });
  } finally {
    unsubscribe();
    if (!isCancelled() && !rateLimited) { try { await act('close'); } catch {} }
  }
}


// Observe only review requests the store page itself makes. Supports its JSONP,
// fetch and XHR transports without replaying requests or modifying responses.
function installBrowserReviewObserver(pageWindow) {
  const listeners = new Set(), restorers = [];
  let closed = false;
  const status = { available: true, error: '' };
  const infoFor = value => {
    try {
      const url = new URL(value, pageWindow.location.href);
      if (!/(^|\.)(taobao|tmall)\.com$/i.test(url.hostname) || !/\/h5\/mtop\.[^/]*(?:rate|review|comment)[^/]*\//i.test(url.pathname)) return null;
      const data = JSON.parse(url.searchParams.get('data') || '{}');
      return { api: url.pathname, itemId: String(data.auctionNumId || data.itemId || data.itemNumId || data.id || ''),
        page: Number(data.pageNo || data.pageNum || data.page) || 1,
        reviewAll: !data.expression && !data.skuVids && (!data.searchImpr || data.searchImpr === '-8') && ['', '-8', 'all'].includes(String(data.rateType ?? '')),
        callback: url.searchParams.get('callback') || '' };
    } catch { return null; }
  };
  const emit = (info, envelope) => {
    if (closed || !info) return;
    try {
      if (typeof envelope === 'string') {
        if (envelope.length > 8 * 1024 * 1024) return;
        const first = envelope.indexOf('{'), last = envelope.lastIndexOf('}');
        if (first < 0 || last <= first) return;
        envelope = JSON.parse(envelope.slice(first, last + 1));
      }
      if (!envelope || typeof envelope !== 'object') return;
      const { callback, ...metadata } = info;
      const record = { ...metadata, capturedAt: Date.now(), ret: Array.isArray(envelope.ret) ? envelope.ret.map(String) : [], data: envelope.data || {} };
      for (const listener of listeners) { try { listener(record); } catch {} }
    } catch { /* Never break the store's own response handler. */ }
  };
  const wrapJsonp = script => {
    const info = infoFor(script.src);
    if (!info || !/^[\w$]+$/.test(info.callback)) return;
    const original = pageWindow[info.callback];
    if (typeof original !== 'function' || original.__competitorReviewObserver) return;
    const wrapped = function (...args) { emit(info, args[0]); return original.apply(this, args); };
    wrapped.__competitorReviewObserver = true;
    pageWindow[info.callback] = wrapped;
    restorers.push(() => { if (pageWindow[info.callback] === wrapped) pageWindow[info.callback] = original; });
  };
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.tagName === 'SCRIPT') wrapJsonp(node);
      for (const script of node.querySelectorAll?.('script[src]') || []) wrapJsonp(script);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  restorers.push(() => observer.disconnect());
  try {
    const originalFetch = pageWindow.fetch;
    if (typeof originalFetch === 'function') {
      const wrappedFetch = function (...args) {
        const info = infoFor(args[0]?.url || args[0]);
        return originalFetch.apply(this, args).then(response => {
          if (info && [403, 429].includes(response.status)) emit(info, { ret: [`HTTP_${response.status}::访问受限`] });
          else if (info) response.clone().text().then(body => emit(info, body)).catch(() => {});
          return response;
        });
      };
      pageWindow.fetch = wrappedFetch;
      restorers.push(() => { if (pageWindow.fetch === wrappedFetch) pageWindow.fetch = originalFetch; });
    }
    const proto = pageWindow.XMLHttpRequest?.prototype;
    if (proto) {
      const open = proto.open, send = proto.send, requests = new WeakMap();
      const wrappedOpen = function (method, url, ...args) { requests.set(this, infoFor(url)); return open.call(this, method, url, ...args); };
      const wrappedSend = function (...args) {
        const info = requests.get(this);
        if (info) this.addEventListener('load', () => { try { emit(info, [403, 429].includes(this.status) ? { ret: [`HTTP_${this.status}::访问受限`] } : this.responseType === 'json' ? this.response : this.responseText); } catch {} }, { once: true });
        return send.apply(this, args);
      };
      proto.open = wrappedOpen; proto.send = wrappedSend;
      restorers.push(() => { if (proto.open === wrappedOpen) proto.open = open; if (proto.send === wrappedSend) proto.send = send; });
    }
  } catch (error) { status.error = error.message; }
  return {
    status, async flush() {},
    onRecord(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { if (closed) return; closed = true; listeners.clear(); for (const restore of restorers.reverse()) { try { restore(); } catch {} } }
  };
}


function detectVerification() {
  const visible = el => {
    if (!el || !el.getClientRects().length) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  const banner = document.getElementById('__tf_crawler_banner');
  const userscriptPanel = document.getElementById('tf-rice-crawler-panel');
  const text = (document.body?.innerText || '').replace(banner?.innerText || '\u0000', '').replace(userscriptPanel?.innerText || '\u0000', '');
  const title = document.title || '';
  const url = location.href;
  const selectors = '#nc_1_n1z, .nc_scale, .nc_wrapper, .baxia-dialog, #baxia-dialog, #nocaptcha, [id^="nc_"][id$="_n1z"]';
  const slider = [...document.querySelectorAll(selectors)].some(visible);
  const frame = [...document.querySelectorAll('iframe')].some(el => visible(el)
    && /captcha|punish|baxia|nocaptcha|verify|login\.(taobao|tmall)/i.test(el.src || ''));
  const login = /login\.(taobao|tmall)\.com/i.test(url);
  const denial = /访问被拒绝|访问受限|操作过于频繁|访问过于频繁|请求过于频繁|访问频繁|请求频繁|Too Many Requests|Access Denied/i;
  const restricted = denial.test(title) || [...document.querySelectorAll('div, span, p, [role="dialog"]')].some(el => {
    if (!visible(el) || banner?.contains?.(el) || userscriptPanel?.contains?.(el) || el.closest?.('[class*="Comment--"], .tm-rate-list, .rate-grid')) return false;
    const value = String(el.innerText || el.textContent || '').trim();
    return value.length < 100 && denial.test(value);
  });
  const captcha = slider || frame || /punish|captcha|baxia/i.test(url)
    || /安全验证|访问验证|滑动验证|Punish/i.test(title)
    || /拖动.{0,15}滑块|向右滑动.{0,15}验证|请.{0,6}完成.{0,6}验证/.test(text);
  return { blocked: login || captcha || restricted, restricted, login, captcha, ready: document.readyState !== 'loading' };
}

// Included by build-tampermonkey.cjs in the standalone userscript.
function setupDetailReviewSync() {
  const button = document.getElementById('tf-btn-extract-detail');
  let running = false, cancelled = false, lastResult = null;
  button?.addEventListener('click', async () => {
    if (running) { cancelled = true; setStatus('正在停止', '#ca8a04', '正在保存已读取的评价全文…'); return; }
    running = true; cancelled = false; lastResult = null;
    button.textContent = '停止并同步已读结果';
    const collector = installBrowserReviewObserver(typeof unsafeWindow === 'undefined' ? window : unsafeWindow);
    const itemId = new URL(location.href).searchParams.get('id') || '';
    try {
      if (!itemId) throw new Error('当前链接缺少商品 ID');
      const title = (document.querySelector('h1, [class*="ItemTitle"], [class*="itemTitle"]')?.innerText || document.title).trim();
      setStatus('读取全部评价', '#ca8a04', '正在打开全部评价列表，随后逐页读取好评、中评、差评与追评。');
      const result = await collectAllReviews({
        itemId, collector, pageAction: reviewPageAction,
        click: async point => {
          const target = document.elementFromPoint(point.x, point.y);
          if (target && !panel.contains(target)) target.click();
        },
        waitForVerification: async () => {
          while (!cancelled) {
            const state = detectVerification();
            if (state.restricted) {
              const error = new Error('平台拒绝访问，已停止请求并保存已读结果，请稍后手动重试');
              error.code = 'COMPETITOR_RATE_LIMITED'; throw error;
            }
            if (state.ready && !state.blocked) return true;
            setStatus('等待手动验证', '#ca8a04', '请在当前浏览器完成登录或滑块验证，采集会保持等待。');
            await new Promise(resolve => setTimeout(resolve, 800));
          }
          return false;
        },
        isCancelled: () => cancelled,
        onProgress: progress => setStatus(`已读 ${progress.count} 条`, '#0284c7', progress.message)
      });
      lastResult = { itemId, title, ...result, reviewSource: 'collected', source: 'crawler', isRealReview: Boolean(result.negativeReviews) };
      if (!result.reviewCount && !result.reviewListExhausted && !result.reviewRateLimited) { setStatus('未读到评价', '#ca8a04', result.reviewStatus); return; }
      await new Promise((resolve, reject) => GM_xmlhttpRequest({
        method: 'POST', url: DESKTOP_REVIEW_URL, headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(lastResult), timeout: 30000,
        onload: response => {
          let data; try { data = JSON.parse(response.responseText); } catch {}
          if (response.status === 200 && data?.ok && data.supportsFullReviews && data.reviewCount === lastResult.reviewCount) resolve();
          else if (response.status === 200 && data?.ok && !data.supportsFullReviews) reject(new Error('桌面端仍是旧版接收接口，请更新并重启应用'));
          else reject(new Error(data?.error || `桌面端响应 ${response.status}，请更新并启动桌面工具`));
        },
        onerror: () => reject(new Error('无法连接桌面端，请启动模式 A 监听')),
        ontimeout: () => reject(new Error('同步超时，请复制已读取的评价 JSON 备份'))
      }));
      setStatus(result.reviewRateLimited ? '访问受限，已保存' : '同步成功', result.reviewRateLimited ? '#ca8a04' : '#15803d', `${result.reviewStatus}。全文已保存至桌面端。`);
    } catch (error) {
      setStatus('同步未完成', '#ef4444', `${error.message}${lastResult ? '；可在油猴菜单选择“复制已读评价 JSON”备份全文。' : ''}`);
    } finally {
      collector.close(); running = false; button.textContent = '读取全部评价并同步';
    }
  });
  // Reuse the panel's existing copy action, preserving results when offline.
  GM_registerMenuCommand('复制已读评价 JSON', () => {
    if (!lastResult) { setStatus('暂无结果', '#ca8a04', '请先读取评价'); return; }
    GM_setClipboard(JSON.stringify({ items: [lastResult] }, null, 2));
    setStatus('已复制', '#15803d', '已复制评价全文 JSON，可在桌面端粘贴导入。');
  });
}


  if (isDetailPage) { setupDetailReviewSync(); return; }

  // 2. 搜索列表页 Top 20 提取逻辑
  const btnScrape = document.getElementById('tf-btn-scrape');
  const btnPush = document.getElementById('tf-btn-push');
  const copyTip = document.getElementById('tf-copy-tip');

  let scrapedData = [];

  function extractItemsFromSearchPage() {
    const items = [];
    const seenIds = new Set();

    // 1. 全文检索所有包含真实商品 ID 的详情链接
    const rawLinks = Array.from(document.querySelectorAll('a[href*="id="], a[href*="item.htm"]'));
    const validLinkEntries = [];

    for (const a of rawLinks) {
      const href = a.href || a.getAttribute('href') || '';
      const idMatch = href.match(/[?&]id=(\d+)/);
      if (idMatch && idMatch[1]) {
        const itemId = idMatch[1];
        if (!seenIds.has(itemId)) {
          seenIds.add(itemId);
          validLinkEntries.push({ linkEl: a, itemId, href: href.startsWith('//') ? ('https:' + href) : href });
        }
      }
    }

    seenIds.clear();

    // 2. 向上回溯每个链接找到其对应的独立商品卡片 (DOM 树向上寻找直到父节点包含多个不同商品)
    function findCardContainer(link) {
      const direct = link.closest('dl.item, div.item, div.product, dl, [class*="Card--"], [class*="item--"]');
      if (direct && direct !== document.body && direct.id !== 'tf-rice-crawler-panel') {
        return direct;
      }
      let curr = link;
      while (curr && curr !== document.body && curr.parentElement && curr.parentElement !== document.body) {
        const parent = curr.parentElement;
        const subLinks = parent.querySelectorAll('a[href*="id="], a[href*="item.htm"]');
        const diffIds = new Set();
        for (const sl of subLinks) {
          const m = (sl.href || sl.getAttribute('href') || '').match(/[?&]id=(\d+)/);
          if (m && m[1]) diffIds.add(m[1]);
        }
        if (diffIds.size > 1) {
          return curr;
        }
        curr = parent;
      }
      return link.closest('div') || link;
    }

    // 多层次鲁棒价格提取
function readCardPrice(card) {
  const clean = el => String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
  const parse = value => {
    const match = value.match(/^[¥￥]?\s*(\d+)(?:\s*[.。]\s*(\d{1,2}))?\s*(?:元|起)?$/);
    const number = match ? Number(`${match[1]}.${match[2] || '0'}`) : 0;
    return number > 0 && number < 100000 ? number : null;
  };
  for (const integer of card.querySelectorAll('[class*="priceInt" i], [class*="price-int" i]')) {
    const fraction = integer.parentElement?.querySelector('[class*="priceFloat" i], [class*="price-float" i], [class*="priceDecimal" i]');
    if (fraction) {
      const a = clean(integer).replace(/[^\d]/g, ''), b = clean(fraction).replace(/[^\d]/g, '');
      if (a && b) return parse(`${a}.${b}`);
    }
    const full = parse(clean(integer.parentElement));
    if (full) return full;
  }
  for (const el of card.querySelectorAll('.c-price, .item-price, [class*="shop-price" i], [class*="salePrice" i], .price:not([class*="line" i]):not([class*="origin" i])')) {
    const price = parse(clean(el));
    if (price) return price;
  }
  return null;
}
function isRiceProductTitle(title) {
  return /大米|稻米|粳米|籼米|香米|丝苗|珍珠米|长粒香|稻花香|五常米|小町米/.test(title)
    && !/饲料|喂(?:鸡|鸭|鹅|狗|猪|牛|羊)|米桶|储米|收纳|防潮桶|钓鱼|打窝/.test(title);
}
    function getCardPrice(c) { return readCardPrice(c); }

    function getCardOriginalPrice(c, fPrice) {
      try {
        const lineEls = c.querySelectorAll(
          '[class*="linePrice" i], [class*="LinePrice" i], [class*="originalPrice" i], [class*="originPrice" i], [class*="oldPrice" i], del, s, [style*="line-through"]'
        );
        for (const el of lineEls) {
          const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ');
          const m = text.match(/[¥￥]?\s*(\d+(?:\.\d{1,2})?)/);
          if (m && m[1]) {
            const val = parseFloat(m[1]);
            if (!isNaN(val) && val > fPrice) return val;
          }
        }

        const cardText = c.innerText || c.textContent || '';
        const regexMatches = cardText.match(/[¥￥]\s*(\d+(?:[.\s]\d{1,2})?)/g);
        if (regexMatches) {
          for (const mStr of regexMatches) {
            const clean = mStr.replace(/[¥￥\s]/g, '').replace('。', '.');
            const val = parseFloat(clean);
            if (!isNaN(val) && val > fPrice && val < 100000) return val;
          }
        }
      } catch (e) {}

      return null;
    }

    // 3. 逐款解析商品信息
    for (const entry of validLinkEntries) {
      if (items.length >= 20) break;
      const { linkEl, itemId, href } = entry;
      if (seenIds.has(itemId)) continue;
      seenIds.add(itemId);

      const card = findCardContainer(linkEl);
      if (!card) continue;

      // 1. 提取标题 (优先取主图 alt 与商品专属链接标题 a.item-name，彻底过滤店铺乱码与按钮文字)
      let title = '';
      const photoImg = card.querySelector('dt.photo img[alt], .photo img[alt], a[href*="id="] img[alt], img[alt]');
      if (photoImg && photoImg.getAttribute('alt')) {
        const altText = photoImg.getAttribute('alt').trim();
        if (altText.length >= 6 && !altText.includes('logo') && !altText.includes('淘工厂') && !altText.startsWith('鎵')) {
          title = altText;
        }
      }

      if (!title) {
        const itemNameEl = card.querySelector('a.item-name, dd.detail a, [class*="title--"], [class*="item-title"], h3, h4');
        if (itemNameEl) {
          const t = (itemNameEl.innerText || itemNameEl.textContent || itemNameEl.title || '').trim();
          if (t.length >= 4 && !t.startsWith('鎵')) {
            title = t;
          }
        }
      }

      if (!title) {
        const titleCandidates = Array.from(card.querySelectorAll('a, span, p'));
        for (const el of titleCandidates) {
          const t = (el.innerText || el.textContent || el.title || '').trim();
          if (t.length > title.length && (t.includes('米') || t.includes('粮')) && !t.includes('¥') && !t.includes('￥') && !t.startsWith('鎵')) {
            title = t;
          }
        }
      }

      if (!title || title.startsWith('鎵')) {
        title = linkEl.innerText?.trim() || linkEl.title || `淘工厂大米 优质大米款 ${items.length + 1}`;
      }

      if (!isRiceProductTitle(title)) continue;

      // 2. 提取真实主图 (排除店铺 LOGO 与阿里通用背景图标)
      let imageUrl = '';
      const imgEls = Array.from(card.querySelectorAll('dt.photo img, .photo img, a[href*="id="] img, img'));
      for (const img of imgEls) {
        const src = img.getAttribute('data-ks-lazyload') || 
                    img.getAttribute('data-src') || 
                    img.src || 
                    img.getAttribute('data-original') || '';
        if (!src) continue;
        const s = src.toLowerCase();
        // 排除掉店铺 LOGO、淘工厂通用标牌、阿里盾牌、反馈图标等
        if (s.includes('tb1mal') || s.includes('tfs/tb') || s.includes('shop-logo') || s.includes('avatar') || s.includes('feedback')) {
          continue;
        }
        if (src.includes('alicdn') || src.includes('taobaocdn') || src.startsWith('http') || src.startsWith('//')) {
          imageUrl = src.startsWith('//') ? ('https:' + src) : src;
          break;
        }
      }

      // 提取价格
      let price = getCardPrice(card);
      
      const originalPrice = getCardOriginalPrice(card, price);

      // 提取销量
      let sales = '';
      const cardText = card.innerText || card.textContent || '';
      const salesMatch = cardText.match(/(\d+(?:\.\d+)?(?:万|w|\+)?\s*(?:人付款|笔|人收货|已售))/i);
      if (salesMatch) {
        sales = salesMatch[0].trim();
      } else {
        const salesEl = card.querySelector('.sale-num, [class*="sale-num" i], [class*="saleNum" i], span[class*="realSales"], span[class*="dealCnt"], span[class*="sale"], .deal-cnt');
        sales = salesEl ? (salesEl.innerText || salesEl.textContent || '').trim() : '';
      }
      if (sales && !sales.includes('人') && !sales.includes('笔') && !sales.includes('付款') && !sales.includes('售')) {
        sales = sales + '人付款';
      }

      items.push({
        rank: items.length + 1,
        title,
        itemId,
        link: href,
        imageUrl,
        finalPrice: price,
        originalPrice,
        sales,
        source: 'crawler',
        priceBasis: '搜索列表展示价（详情未确认）',
        detailStatus: '尚未补采详情',
        detailMessage: '模式 A 仅采集当前搜索页，请在桌面端使用补采当前列表详情读取更多字段',
        freeShipping: '未采集',
        shippingTime: '未采集',
        negativeReviews: '',
        remark: ''
      });
    }

    return items;
  }

  btnScrape?.addEventListener('click', async () => {
    setStatus('采集解析中', '#ca8a04', '正在智能检索页面中的热销大米商品...');
    
    // 若当前可见商品不足 20 款，轻度模拟平滑向下滚动触发图片与卡片加载
    let items = extractItemsFromSearchPage();
    if (items.length < 20) {
      window.scrollBy({ top: 800, behavior: 'smooth' });
      await new Promise(r => setTimeout(r, 600));
      window.scrollBy({ top: 800, behavior: 'smooth' });
      await new Promise(r => setTimeout(r, 600));
      items = extractItemsFromSearchPage();
    }

    scrapedData = items;

    if (scrapedData.length === 0) {
      setStatus('未检测到', '#ef4444', '未能解析到商品列表，请确认当前处于淘宝/淘工厂大米搜索结果页并向下滑动加载。');
      return;
    }

    setStatus(`已采集 ${scrapedData.length} 款`, '#15803d', `成功提取 ${scrapedData.length} 款竞品。可一键推送到桌面端。`);
    if (btnPush) btnPush.style.display = 'block';
    if (copyTip) copyTip.style.display = 'block';
  });

  btnPush?.addEventListener('click', () => {
    if (!scrapedData.length) return;
    setStatus('推送中...', '#2563eb', '正在连接桌面端本地服务 (127.0.0.1:41235)...');

    GM_xmlhttpRequest({
      method: 'POST',
      url: DESKTOP_RECEIVER_URL,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(scrapedData),
      onload: (res) => {
        if (res.status === 200) {
          setStatus('推送成功', '#15803d', '已成功传输至桌面端工具！请切换至软件查看。');
        } else {
          setStatus('推送异常', '#ef4444', `服务端响应错误(${res.status})，请确认桌面工具已打开。`);
        }
      },
      onerror: () => {
        setStatus('连接失败', '#ef4444', '无法连接 127.0.0.1:41235，请在桌面工具中点击“启动助手监听”。');
      }
    });
  });

  copyTip?.addEventListener('click', () => {
    if (!scrapedData.length) return;
    GM_setClipboard(JSON.stringify(scrapedData, null, 2));
    alert('已复制 20 款竞品 JSON 数据至剪贴板，可在桌面端点击“导入数据”直接粘贴！');
  });

})();
