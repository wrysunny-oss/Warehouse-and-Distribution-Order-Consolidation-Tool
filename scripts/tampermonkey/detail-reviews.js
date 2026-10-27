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
