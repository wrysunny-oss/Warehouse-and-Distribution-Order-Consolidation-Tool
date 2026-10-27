'use strict';

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

module.exports = { installBrowserReviewObserver };
