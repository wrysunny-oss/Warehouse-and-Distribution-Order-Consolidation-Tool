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

  /*__REVIEW_ENGINE__*/

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
