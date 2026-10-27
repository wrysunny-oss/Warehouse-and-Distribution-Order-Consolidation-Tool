'use strict';

// Observe responses the user's browser already requested. This does not replay
// requests, generate signatures, change headers or bypass login/verification.
function createProductResponseCollector(webContents) {
  const debuggerClient = webContents.debugger;
  const requests = new Map(), responses = new Map(), records = [], pending = new Set();
  const listeners = new Set();
  const publish = record => {
    const index = records.findIndex(r => r.api === record.api && r.itemId === record.itemId && r.page === record.page && r.filterKey === record.filterKey);
    if (index >= 0) records[index] = record; else records.push(record);
    while (records.length > 100) records.shift();
    for (const listener of listeners) listener(record);
  };
  let ownsDebugger = false, closed = false;
  const status = { available: false, error: '' };
  const requestItem = request => {
    try {
      const url = new URL(request.url);
      const params = new URLSearchParams(request.postData || '');
      const data = JSON.parse(url.searchParams.get('data') || params.get('data') || '{}');
      return { itemId: String(data.itemId || data.itemNumId || data.auctionNumId || data.id || ''),
        page: Number(data.pageNo || data.pageNum || data.page) || 1,
        reviewAll: !data.expression && !data.skuVids && (!data.searchImpr || data.searchImpr === '-8') && ['', '-8', 'all'].includes(String(data.rateType ?? '')),
        filterKey: JSON.stringify([data.rateType || '', data.expression || '', data.searchImpr || '', data.skuVids || '']) };
    } catch { return { itemId: '' }; }
  };
  const relevant = url => {
    try {
      const u = new URL(url);
      return /(^|\.)(taobao|tmall)\.com$/i.test(u.hostname)
        && /\/h5\/mtop\.[^/]*(?:detail|rate|review|comment)[^/]*\//i.test(u.pathname);
    } catch { return false; }
  };
  const onMessage = (_event, method, params) => {
    if (closed) return;
    if (method === 'Network.requestWillBeSent' && relevant(params.request.url)) {
      requests.set(params.requestId, { ...requestItem(params.request), api: new URL(params.request.url).pathname });
    }
    if (method === 'Network.responseReceived' && relevant(params.response.url)) {
      const info = requests.get(params.requestId) || { itemId: '', api: new URL(params.response.url).pathname };
      responses.set(params.requestId, info);
      if ([403, 429].includes(params.response.status)) publish({ ...info, ret: [`HTTP_${params.response.status}::访问受限`], data: {}, capturedAt: Date.now() });
    }
    if (method === 'Network.loadingFailed') {
      requests.delete(params.requestId); responses.delete(params.requestId);
    }
    if (method !== 'Network.loadingFinished' || !responses.has(params.requestId)) return;
    const info = responses.get(params.requestId);
    responses.delete(params.requestId); requests.delete(params.requestId);
    if (params.encodedDataLength > 8 * 1024 * 1024 || pending.size >= 12) return;
    const task = (async () => {
      try {
        const response = await debuggerClient.sendCommand('Network.getResponseBody', { requestId: params.requestId });
        if (closed) return;
        const body = response.base64Encoded ? Buffer.from(response.body, 'base64').toString('utf8') : response.body;
        if (body.length > 8 * 1024 * 1024) return;
        const begin = body.indexOf('{'), end = body.lastIndexOf('}');
        if (begin < 0 || end <= begin) return;
        const envelope = JSON.parse(body.slice(begin, end + 1));
        if (!envelope || typeof envelope !== 'object') return;
        const record = { ...info, ret: Array.isArray(envelope.ret) ? envelope.ret.map(String) : [], data: envelope.data || {}, capturedAt: Date.now() };
        publish(record);
      } catch (error) { status.error = `读取商品响应失败：${error.message}`; }
    })();
    pending.add(task); task.finally(() => pending.delete(task));
  };
  try {
    if (!debuggerClient || debuggerClient.isAttached()) {
      status.error = '浏览器调试通道已占用，未连接响应采集';
    } else {
      debuggerClient.attach('1.3'); ownsDebugger = true;
      debuggerClient.on('message', onMessage);
      // Do not await before navigation: Electron can defer this command until
      // the target has navigated. Waiting here would deadlock page loading.
      debuggerClient.sendCommand('Network.enable', { maxResourceBufferSize: 8 * 1024 * 1024 })
        .then(() => { status.available = true; })
        .catch(error => { status.error = `无法监听商品响应：${error.message}`; });
    }
  } catch (error) { status.error = error.message; }
  return {
    status,
    forItem(itemId) { return records.filter(r => r.itemId === String(itemId)); },
    onRecord(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async flush() { await Promise.allSettled([...pending]); },
    close() {
      if (closed) return;
      closed = true; listeners.clear(); records.length = 0; requests.clear(); responses.clear();
      if (ownsDebugger) {
        debuggerClient.removeListener('message', onMessage);
        try { debuggerClient.detach(); } catch {}
      }
    }
  };
}

module.exports = { createProductResponseCollector };
