'use strict';

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

module.exports = { normalizeReview, reviewKey, negativeReviewText, createReviewAccumulator, parseReviewResponse, reviewPageAction, collectAllReviews };
