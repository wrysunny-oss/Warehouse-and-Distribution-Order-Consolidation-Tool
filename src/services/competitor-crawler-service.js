'use strict';

/**
 * 桌面端一体化：模式 B - Electron 内置自动化浏览器竞品采集服务
 * 
 * 架构特性：
 * 1. 采用独立持久分区 (persist:taobao_crawler)，永久记住买家登录态 Cookie，免反复扫码；
 * 2. 剥离 CSP 与防嵌入响应头，注入反自动化检测掩蔽 (Stealth)；
 * 3. 智能滑块过盾感知：当出现阿里验证码滑块时，常驻醒目提示并等待用户手动拖动过盾，绝不过早超时关闭；
 * 4. 高精度 DOM 实体卡片提取：优先提取真实商品图片与完整规范标题，彻底绝缘店铺广告位与乱码干扰；
 * 5. 严格解耦搜索抓取与商详追评提取：搜索完成前绝不切换路由，彻底消除生命周期递归冲突。
 */

let electron = null;
try {
  electron = require('electron');
} catch {
  // 兼容纯 Node 单元测试环境
}

let activeCrawlerWindow = null;
let isCrawlRunning = false;
const { detectVerification, createContinueGate } = require('./crawler-verification');
const { extractDetailSnapshot, mergeDetailSnapshot, isRiceProductTitle, readCardPrice } = require('./competitor-detail-extractor');
const { collectAllReviews } = require('./competitor-review-service');
const { createProductResponseCollector } = require('./competitor-response-collector');
let continueGate = null;

function continueBrowserCrawler() {
  if (!continueGate) return { ok: false, message: '当前没有等待确认的采集任务' };
  continueGate.resume();
  return { ok: true };
}

/**
 * 检查当前是否有运行中的采集器窗口
 */
function isCrawlerActive() {
  return isCrawlRunning && activeCrawlerWindow && !activeCrawlerWindow.isDestroyed();
}

/**
 * 停止并关闭当前运行中的采集器
 */
function stopBrowserCrawler() {
  isCrawlRunning = false;
  continueGate?.cancel();
  if (activeCrawlerWindow && !activeCrawlerWindow.isDestroyed()) {
    try {
      activeCrawlerWindow.close();
    } catch {}
  }
  activeCrawlerWindow = null;
}

/**
 * 安全执行页面 JavaScript 代码，绝不向上抛出未捕获异常导致控制台报错
 */
async function safeExecute(win, code) {
  if (!win || win.isDestroyed()) return null;
  try {
    const wrappedCode = `(() => {
      try {
        ${code}
      } catch (err) {
        return { __tf_error: err ? String(err.message || err) : 'unknown' };
      }
    })()`;
    return await win.webContents.executeJavaScript(wrappedCode);
  } catch {
    return null;
  }
}

/**
 * 启动内置浏览器自动化采集任务
 * @param {Object} options
 * @param {string} options.keyword 搜索关键词或天猫/淘宝搜索链接
 * @param {number} options.limit 目标抓取数量，默认 20
 * @param {number} options.deepReviewLimit 读取全部评价的商品数量，默认覆盖全部商品
 * @param {string} options.sort 排序规则，默认 'sale-desc'
 * @param {boolean} options.showWindow 是否显示浏览器窗口（建议 true，方便过滑块）
 * @param {Function} options.onProgress 进度回调函数
 * @returns {Promise<Array>} 抓取到的原始竞品数组
 */
async function startBrowserCrawler(options = {}) {
  const {
    keyword = 'https://tmai.tmall.com/search.htm?keyword=%B4%F3%C3%D7+&spm=a21xtw.29978516.0.0',
    limit: requestedLimit = 20,
    deepReviewLimit: requestedReviewLimit = 50,
    sort = 'sale-desc',
    showWindow = true,
    onProgress = () => {},
    mock = false
  } = options;
  const seedItems = Array.isArray(options.seedItems) && options.seedItems.length ? options.seedItems.map(item => ({ ...item })) : null;
  if (seedItems && (seedItems.length > 50 || seedItems.some(item => !item.title || !/^https?:\/\//i.test(item.link || '')))) {
    throw new Error('补采支持 1–50 款带有效商品链接的数据');
  }
  const limit = seedItems ? seedItems.length : Number(requestedLimit);
  const deepReviewLimit = Number(requestedReviewLimit);
  if (!Number.isInteger(limit) || limit < (seedItems ? 1 : 5) || limit > 50) throw new Error('采集数量必须为 5–50 的整数');
  if (!Number.isInteger(deepReviewLimit) || deepReviewLimit < 0 || deepReviewLimit > 50) throw new Error('评价采集数量必须为 0–50 的整数');
  if (typeof keyword !== 'string') throw new Error('请输入搜索关键词或商品搜索链接');

  // 单元测试或 Mock 模式快速返回
  if (mock || process.env.EXCEL_TOOL_MOCK_CRAWLER === '1') {
    onProgress({ stage: 'started', message: '正在初始化采集环境 (Mock)...' });
    await new Promise((r) => setTimeout(r, 100));
    onProgress({ stage: 'scrolling', message: '模拟自动化页面滚动中...' });
    await new Promise((r) => setTimeout(r, 100));
    onProgress({ stage: 'extracting', message: '提取 Top 20 竞品字段...' });

    const sampleRealReviews = [
      '【真实买家】“分量真的太少了，买来试吃只有一小捧，单斤折算太贵了”',
      '【真实买家】“收到的时候编织袋破了个小洞，漏得箱子里到处都是米，碎米偏多”',
      '【真实买家】“淘米水特别浑浊，碎米多，米饭煮出来发柴不软糯”',
      '【真实买家】“真空包装运来已经漏气变软了，没有米香味，怀疑是掺了陈米”',
      '【真实买家】“米粒小且圆，放凉之后特别干硬，家里老人咬不动，焖饭得稍微多放水”',
      '【真实买家】“扫码防伪验证延迟了好久，大米香味比较一般，性价比不如超市散装”',
      '【真实买家】“粘性严重不足，煮稀饭完全水米分离，米质很硬发干”',
      '【真实买家】“10kg大包装搬运磕碰有撒漏，淘米淘出来不少碎米渣和糠皮”',
      '【真实买家】“说是富硒米但包装上没有任何第三方检测标识，米香味很淡”',
      '【真实买家】“煮饭水份控制要求极高，新陈米疑似混掺，口感偏柴”'
    ];

    const mockList = [];
    for (let i = 1; i <= limit; i++) {
      const realReview = (i <= deepReviewLimit) ? sampleRealReviews[(i - 1) % sampleRealReviews.length] : '';
      mockList.push({
        rank: i,
        title: `【淘工厂直营】优质东北五常大米 优质稻花香米 规格${i === 1 ? '1kg' : '2.5kg'}`,
        itemId: `mock_item_${i}`,
        link: `https://detail.tmall.com/item.htm?id=mock_${i}`,
        imageUrl: '',
        finalPrice: i === 1 ? 0.8 : (9.9 + i * 0.5),
        originalPrice: i === 1 ? 21.9 : (29.9 + i),
        sales: `${10 - i * 0.2}w+人付款`,
        freeShipping: '未采集',
        shippingTime: '未采集',
        negativeReviews: realReview,
        source: 'sample',
        isRealReview: false,
        remark: i === 1 ? '引流款' : '主推款'
      });
    }
    if (deepReviewLimit > 0) {
      onProgress({
        stage: 'real_reviews',
        current: Math.min(deepReviewLimit, limit),
        total: Math.min(deepReviewLimit, limit),
        message: `已提取前 ${Math.min(deepReviewLimit, limit)} 款商品商详页真实买家差评`
      });
    }
    onProgress({ stage: 'completed', count: mockList.length, message: `采集完成，已抓取 ${mockList.length} 款大米竞品` });
    return mockList;
  }

  if (!electron?.BrowserWindow) throw new Error('内置采集仅支持 Electron 桌面端');

  if (isCrawlerActive()) {
    stopBrowserCrawler();
    await new Promise((r) => setTimeout(r, 300));
  }

  isCrawlRunning = true;
  const { BrowserWindow, session } = electron;

  // 使用独立的持久化 session，保持用户的登录态 Cookie
  const crawlSession = session.fromPartition('persist:taobao_crawler', { cache: true });
  crawlSession.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );

  // 伪装标准浏览器请求头与语言，降低被拦截率
  try {
    crawlSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const requestHeaders = { ...details.requestHeaders };
      requestHeaders['Accept-Language'] = 'zh-CN,zh;q=0.9,en;q=0.8';
      requestHeaders['sec-ch-ua'] = '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"';
      requestHeaders['sec-ch-ua-mobile'] = '?0';
      requestHeaders['sec-ch-ua-platform'] = '"Windows"';
      requestHeaders['Upgrade-Insecure-Requests'] = '1';
      callback({ requestHeaders });
    });
  } catch {}

  // 移除 CSP 拦截限制，确保注入脚本与 DOM 访问自由
  try {
    crawlSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      delete responseHeaders['content-security-policy'];
      delete responseHeaders['Content-Security-Policy'];
      delete responseHeaders['x-frame-options'];
      callback({ responseHeaders });
    });
  } catch {}

  return new Promise((resolve, reject) => {
    let hasResolved = false;
    let isSearchComplete = false;
    let crawlInterval = null;
    let pageGeneration = 0;
    let pollBusy = false;
    let started = false;
    let responseCollector = null;
    const gate = createContinueGate();
    continueGate = gate;

    const finish = (err, data) => {
      if (hasResolved) return;
      hasResolved = true;
      gate.cancel();
      if (continueGate === gate) continueGate = null;
      isCrawlRunning = false;
      if (crawlInterval) clearInterval(crawlInterval);
      responseCollector?.close();
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    };

    try {
      activeCrawlerWindow = new BrowserWindow({
        width: 1220,
        height: 860,
        title: '淘工厂大米 竞品自动采集窗口 (模式 B)',
        autoHideMenuBar: true,
        show: showWindow,
        webPreferences: {
          session: crawlSession,
          nodeIntegration: false,
          contextIsolation: false,
          webSecurity: false,
          sandbox: false
        }
      });

      const win = activeCrawlerWindow;
      responseCollector = createProductResponseCollector(win.webContents);
      const readDetail = async (item, skuId) => {
        await responseCollector.flush();
        const records = responseCollector.forItem(item.itemId);
        const responseData = records.filter(record => !record.ret.length || record.ret.some(ret => ret.startsWith('SUCCESS'))).map(record => record.data);
        const snapshot = await safeExecute(win, `return (${extractDetailSnapshot.toString()})(${JSON.stringify({ itemId: item.itemId, skuId, responseData })});`);
        if (snapshot) {
          snapshot.responseCount = records.length;
          snapshot.responseStatus = records.length ? [...new Set(records.flatMap(record => record.ret.map(ret => ret.split('::')[0])))].join('、') : (responseCollector.status.error || '未收到商品详情响应');
        }
        return snapshot;
      };
      const checkVerification = () => safeExecute(win, `return (${detectVerification.toString()})();`);
      const waitForVerification = async () => {
        let waitingSince = null;
        while (!hasResolved && !win.isDestroyed() && isCrawlRunning) {
          const state = await checkVerification();
          if (state?.restricted) {
            const error = new Error('平台提示访问受限，已停止后续采集并保存已读结果，请稍后手动重试');
            error.code = 'COMPETITOR_RATE_LIMITED';
            throw error;
          }
          if (state?.ready && !state.blocked) return true;
          if (state?.blocked) {
            if (waitingSince === null) { waitingSince = Date.now(); win.show(); win.focus(); }
            onProgress({ stage: state.login ? 'login_needed' : 'captcha_needed', seconds: Math.floor((Date.now() - waitingSince) / 1000), message: '采集已暂停，请在浏览器中手动完成登录或滑块验证。不会因等待验证而自动关闭窗口。' });
          }
          await new Promise(resolve => setTimeout(resolve, 750));
        }
        return false;
      };

      win.on('closed', () => {
        if (activeCrawlerWindow === win) activeCrawlerWindow = null;
        if (!hasResolved) {
          finish(new Error('采集窗口已被关闭，任务中断。'));
        }
      });

      let searchUrl = '';
      const trimmedKeyword = seedItems ? seedItems[0].link : String(keyword || '').trim();
      if (trimmedKeyword.startsWith('http://') || trimmedKeyword.startsWith('https://')) {
        searchUrl = trimmedKeyword;
        onProgress({ stage: 'loading', message: `正在进入指定搜索页面：${searchUrl.slice(0, 50)}...` });
      } else if (trimmedKeyword.includes('tmai') || options.shopMode === 'tmai') {
        searchUrl = 'https://tmai.tmall.com/search.htm?keyword=%B4%F3%C3%D7+&spm=a21xtw.29978516.0.0';
        onProgress({ stage: 'loading', message: '正在进入淘工厂天猫直营店大米搜索...' });
      } else {
        searchUrl = `https://s.taobao.com/search?q=${encodeURIComponent(trimmedKeyword || '淘工厂 大米')}&sort=${encodeURIComponent(sort)}`;
        onProgress({ stage: 'loading', message: `正在进入淘宝全网搜索：${trimmedKeyword || '淘工厂 大米'} ...` });
      }

      win.loadURL(searchUrl).catch((err) => {
        if (!hasResolved && err.code !== 'ERR_ABORTED') finish(err);
      });

      // 搜索页加载完成后的主处理流程
      const onSearchPageLoaded = async () => {
        if (isSearchComplete || hasResolved) return;
        const generation = ++pageGeneration;
        if (crawlInterval) clearInterval(crawlInterval);

        try {
          const currentUrl = win.webContents.getURL();

          // 1. 登录页拦截判断
          if (currentUrl.includes('login.taobao.com') || currentUrl.includes('login.tmall.com')) {
            onProgress({
              stage: 'login_needed',
              message: '检测到未登录，请在弹出的窗口中扫码或短信登录。登录后将自动进入搜索采集。'
            });
            win.show();
            win.focus();
            return;
          }

          // 2. 注入自动化提取与状态通知脚本
          const injectionScript = `
            (() => {
              try {
                if (window.__TF_CRAWLER_INJECTED) return;
                window.__TF_CRAWLER_INJECTED = true;

                // 注入防自动化属性隐藏
                try {
                  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                  window.chrome = { runtime: {} };
                } catch (e) {}

                // 创建顶部常驻状态条
                const banner = document.createElement('div');
                banner.id = '__tf_crawler_banner';
                banner.style.cssText = \`
                  position: fixed;
                  top: 0;
                  left: 0;
                  right: 0;
                  z-index: 99999999;
                  background: #1e293b;
                  color: #ffffff;
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                  font-size: 13px;
                  font-weight: 500;
                  padding: 10px 20px;
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  box-shadow: 0 4px 14px rgba(0,0,0,0.3);
                  border-bottom: 2px solid #3b82f6;
                  transition: background 0.3s;
                \`;
                banner.innerHTML = \`
                  <div id="__tf_banner_text" style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px;">🌾</span>
                    <span><strong>请先完成登录和安全验证</strong>：完成后回到桌面工具点击「我已完成验证，开始采集」。等待期间不会滚动或切换页面。</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span id="__tf_crawl_count_badge" style="background: rgba(255,255,255,0.18); padding: 3px 10px; border-radius: 4px; font-size: 12px; font-weight: bold;">已发现 0 款</span>
                    <button id="__tf_manual_extract_btn" style="background: #3b82f6; color: #ffffff; border: none; padding: 5px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer;">
                      立即提取当前结果
                    </button>
                  </div>
                \`;
                if (document.body) {
                  document.body.prepend(banner);
                }

                // 检测是否出现滑块验证盾
                window.__tfCheckCaptcha = function() {
                  const title = document.title || '';
                  const bodyText = (document.body ? document.body.innerText : '') || '';
                  const hasNcSlider = Boolean(
                    document.getElementById('nc_1_n1z') ||
                    document.querySelector('.nc_scale') ||
                    document.querySelector('.nc_iconfont') ||
                    document.querySelector('#bx-feedback-btn') ||
                    document.querySelector('.baxia-dialog')
                  );
                  const isPunishTitle = title.includes('验证') || title.includes('拦截') || title.includes('Punish');
                  const isPunishText = bodyText.includes('拖动下方滑块') || bodyText.includes('完成验证') || bodyText.includes('通过验证');
                  return hasNcSlider || isPunishTitle || isPunishText;
                };

                // 核心提取引擎：专精淘工厂店铺搜索页及淘宝全网搜索
                window.__tfReadCardPrice = ${readCardPrice.toString()};
                window.__tfIsRiceProduct = ${isRiceProductTitle.toString()};
                window.__tfExtractItems = function() {
                  try {
                    const items = [];
                    const seenIds = new Set();

                    // 1. 优先尝试从淘宝页面结构化 JSON 中提取
                    try {
                      const initData = window.__INITIAL_DATA__;
                      const auctions = initData?.itemResults?.items || 
                                       initData?.mods?.itemlist?.data?.auctions || 
                                       window.g_page_config?.mods?.itemlist?.data?.auctions || [];
                      if (Array.isArray(auctions) && auctions.length > 0) {
                        for (const raw of auctions) {
                          if (items.length >= ${limit}) break;
                          const itemId = String(raw.item_id || raw.nid || raw.id || '');
                          if (!itemId || seenIds.has(itemId)) continue;
                          seenIds.add(itemId);

                          const title = String(raw.title || raw.raw_title || '').replace(/<[^>]+>/g, '').trim();
                          if (!window.__tfIsRiceProduct(title)) continue;

                          let img = String(raw.pic_path || raw.pic_url || raw.img || '');
                          if (img.startsWith('//')) img = 'https:' + img;

                          const price = parseFloat(raw.price || raw.view_price || raw.price_info?.price) || null;
                          const sales = String(raw.realSales || raw.view_sales || raw.sales || '').trim();
                          const link = raw.detail_url 
                            ? (raw.detail_url.startsWith('//') ? 'https:' + raw.detail_url : raw.detail_url) 
                            : ('https://detail.tmall.com/item.htm?id=' + itemId);

                          items.push({
                            rank: items.length + 1,
                            title,
                            itemId,
                            link,
                            imageUrl: img,
                            finalPrice: price,
                            originalPrice: null,
                            sales,
                            freeShipping: '未采集',
                            shippingTime: '未采集',
                            negativeReviews: '',
                            remark: ''
                          });
                        }
                      }
                    } catch (e) {}

                    if (items.length >= ${limit}) return items;

                    // 2. DOM 高精度独立卡片提取
                    // 检索所有详情链接
                    const rawLinks = Array.from(document.querySelectorAll('a[href*="id="], a[href*="item.htm"]'));
                    const validLinkEntries = [];
                    const linkIds = new Set();

                    for (const a of rawLinks) {
                      const href = a.href || a.getAttribute('href') || '';
                      const idMatch = href.match(/[?&]id=(\\d+)/);
                      if (idMatch && idMatch[1]) {
                        const itemId = idMatch[1];
                        if (!seenIds.has(itemId) && !linkIds.has(itemId)) {
                          linkIds.add(itemId);
                          validLinkEntries.push({ linkEl: a, itemId, href: href.startsWith('//') ? ('https:' + href) : href });
                        }
                      }
                    }



                    // 精准卡片隔离算法：优先查找专用卡片元素，再向上回溯
                    function findCardContainer(link) {
                      const direct = link.closest('dl.item, div.item, div.product, dl, [class*="Card--"], [class*="item--"]');
                      if (direct && direct !== document.body && direct.id !== '__tf_crawler_banner') {
                        return direct;
                      }
                      let curr = link;
                      while (curr && curr !== document.body && curr.parentElement && curr.parentElement !== document.body) {
                        const parent = curr.parentElement;
                        const subLinks = parent.querySelectorAll('a[href*="id="], a[href*="item.htm"]');
                        const diffIds = new Set();
                        for (const sl of subLinks) {
                          const m = (sl.href || sl.getAttribute('href') || '').match(/[?&]id=(\\d+)/);
                          if (m && m[1]) diffIds.add(m[1]);
                        }
                        if (diffIds.size > 1) {
                          return curr;
                        }
                        curr = parent;
                      }
                      return link.closest('div') || link;
                    }

                    function getCardPrice(c) {
                      return window.__tfReadCardPrice(c);
                    }

                    function getCardOriginalPrice(c, fPrice) {
                      try {
                        const lineEls = c.querySelectorAll('[class*="linePrice" i], [class*="LinePrice" i], del, s, [style*="line-through"]');
                        for (const el of lineEls) {
                          const text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ');
                          const m = text.match(/[¥￥]?\\s*(\\d+(?:\\.\\d{1,2})?)/);
                          if (m && m[1]) {
                            const val = parseFloat(m[1]);
                            if (!isNaN(val) && val > fPrice) return val;
                          }
                        }
                      } catch (e) {}

                      return null;
                    }

                    for (const entry of validLinkEntries) {
                      if (items.length >= ${limit}) break;
                      try {
                        const { linkEl, itemId, href } = entry;
                        if (seenIds.has(itemId)) continue;
                        seenIds.add(itemId);

                        const card = findCardContainer(linkEl);
                        if (!card) continue;

                        // 1. 提取标题 (首选主图 alt 与商品专属 a.item-name，彻底过滤店铺乱码与按钮文字)
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
                          continue;
                        }

                        if (!window.__tfIsRiceProduct(title)) continue;

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
                          // 过滤店铺 LOGO 与阿里通用占位图
                          if (s.includes('tb1mal') || s.includes('tfs/tb') || s.includes('shop-logo') || s.includes('avatar') || s.includes('feedback')) {
                            continue;
                          }
                          if (src.includes('alicdn') || src.includes('taobaocdn') || src.startsWith('http') || src.startsWith('//')) {
                            imageUrl = src.startsWith('//') ? ('https:' + src) : src;
                            break;
                          }
                        }

                        // 3. 提取价格
                        let price = getCardPrice(card);
                        
                        const originalPrice = getCardOriginalPrice(card, price);

                        // 4. 提取销量
                        let sales = '';
                        const cardText = card.innerText || card.textContent || '';
                        const salesMatch = cardText.match(/(\\d+(?:\\.\\d+)?(?:万|w|\\+)?\\s*(?:人付款|笔|人收货|已售))/i);
                        if (salesMatch) {
                          sales = salesMatch[0].trim();
                        } else {
                          const salesEl = card.querySelector('.sale-num, dd.sale-num, [class*="sale-num" i], [class*="saleNum" i], span[class*="realSales"], span[class*="dealCnt"], span[class*="sale"], .deal-cnt');
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
                          freeShipping: '未采集',
                          shippingTime: '未采集',
                          negativeReviews: '',
                          remark: ''
                        });
                      } catch (e) {
                        continue;
                      }
                    }

                    return items;
                  } catch (err) {
                    return [];
                  }
                };

                // 绑定手动立即提取按钮
                document.getElementById('__tf_manual_extract_btn')?.addEventListener('click', function() {
                  window.__tfManualTrigger = true;
                });
              } catch (e) {}
            })();
          `;
          await safeExecute(win, injectionScript);
          if (!started) {
            onProgress({ stage: 'waiting_ready', message: '请先在浏览器中完成登录和滑块验证，再回到工具点击「我已完成验证，开始采集」。确认前不会滚动或跳转。' });
            win.show();
            if (!await gate.promise) return;
            if (generation !== pageGeneration || hasResolved) return;
            started = true;
          }
          if (generation !== pageGeneration || hasResolved) return;

          // 3. 轮询监控与平滑滚动加载循环
          let scrollRounds = 0;
          let captchaStartedAt = null;
          const maxScrollRounds = 22; // 允许滚动 22 次，确保充分触发懒加载

          crawlInterval = setInterval(async () => {
            if (win.isDestroyed() || isSearchComplete || hasResolved || generation !== pageGeneration || pollBusy) return;
            pollBusy = true;

            try {
              // 步骤 A: 检查是否存在滑块安全验证拦截
              const checkState = await checkVerification();
              if (generation !== pageGeneration || hasResolved || !checkState?.ready) return;
              if (checkState.restricted) {
                onProgress({ stage: 'rate_limited', message: '平台拒绝访问，已停止本轮采集；请稍后手动重试' });
                finish(new Error('平台拒绝访问，已停止采集；请稍后手动重试'));
                return;
              }

              if (checkState.blocked) {
                if (captchaStartedAt === null) {
                  captchaStartedAt = Date.now();
                  win.show();
                  win.focus();
                }
                const captchaWaitSeconds = Math.floor((Date.now() - captchaStartedAt) / 1000);
                // 突出提示滑块过盾
                await safeExecute(win, `
                  try {
                    const banner = document.getElementById('__tf_crawler_banner');
                    const textEl = document.getElementById('__tf_banner_text');
                    if (banner && textEl) {
                      banner.style.background = '#b91c1c';
                      textEl.innerHTML = '<span style="font-size:16px;">⚠️</span><span><strong>【请拖动滑块完成验证】</strong> 检测到阿里安全滑块，请在下方窗口中手动用鼠标向右拖动滑块过盾！验证后将自动开始抓取大米商品数据。</span>';
                    }
                  } catch (e) {}
                `);

                onProgress({
                  stage: checkState.login ? 'login_needed' : 'captcha_needed',
                  seconds: captchaWaitSeconds,
                  message: `采集已暂停，请在浏览器中完成登录或滑块验证。已等待 ${captchaWaitSeconds} 秒，不会自动超时关闭。`
                });
                return; // 滑块未过，不推进滚动轮次
              }
              if (captchaStartedAt !== null) {
                captchaStartedAt = null;
                scrollRounds = 0;
                // Let the verified page settle before any scrolling/navigation.
                await new Promise(resolve => setTimeout(resolve, 1500));
                return;
              }

              // 步骤 B: 滑块已通过或无滑块，正常执行平滑滚动与提取
              const stepResult = seedItems ? { isManual: true, count: seedItems.length, items: seedItems } : await safeExecute(win, `
                try {
                  window.scrollBy({ top: 580, behavior: 'smooth' });
                  const isManual = Boolean(window.__tfManualTrigger);
                  const items = (typeof window.__tfExtractItems === 'function') ? window.__tfExtractItems() : [];
                  const badge = document.getElementById('__tf_crawl_count_badge');
                  if (badge) badge.innerText = '已发现 ' + items.length + ' 款';
                  const textEl = document.getElementById('__tf_banner_text');
                  const banner = document.getElementById('__tf_crawler_banner');
                  if (banner && textEl) {
                    banner.style.background = '#1e293b';
                    textEl.innerHTML = '<span style="font-size:16px;">🌾</span><span><strong>模式 B 自动化采集进行中</strong>：正在向下滚动检索商品... (若遇到滑块请手动拖动过盾)</span>';
                  }
                  return { isManual, count: items.length, items };
                } catch (e) {
                  return { isManual: false, count: 0, items: [] };
                }
              `);
              if (generation !== pageGeneration || hasResolved || !stepResult || stepResult.__tf_error) return;

              scrollRounds++;
              const count = stepResult?.count || 0;
              const isManual = Boolean(stepResult?.isManual);
              const currentItems = stepResult?.items || [];

              onProgress({
                stage: 'scrolling',
                round: scrollRounds,
                maxRounds: maxScrollRounds,
                count,
                message: `正在自动滚动加载商品中 (已检索第 ${scrollRounds}/${maxScrollRounds} 屏，已发现 ${count} 款)...`
              });

              // 达到目标数量、滚动达到上限，或用户点击了立即提取当前结果
              if (count >= limit || scrollRounds >= maxScrollRounds || (isManual && count > 0)) {
                clearInterval(crawlInterval);
                isSearchComplete = true;

                // 移除 did-finish-load 监听器，彻底杜绝后续详情页导航产生递归死循环！
                win.webContents.removeAllListeners('did-finish-load');

                if (currentItems.length === 0) {
                  finish(new Error('未能检索到大米竞品商品，可能是未登录或页面结构已变动。'));
                  return;
                }

                onProgress({
                  stage: 'extracting',
                  message: `已成功捕获 ${currentItems.length} 款大米竞品！准备进入商详页提取真实买家差评...`
                });

                // Every product gets a detail pass; review depth only controls reviews.
                const targetDeepReviews = Math.min(deepReviewLimit, currentItems.length);
                let accessRestricted = false;
                for (let i = 0; i < currentItems.length; i++) {
                  if (hasResolved || win.isDestroyed()) return;
                  const item = currentItems[i];
                  if (!isRiceProductTitle(item.title)) {
                    currentItems[i] = { ...item, source: 'crawler', spec: '未识别', detailStatus: '需核对品类', detailMessage: '标题疑似非食用大米商品，本次不自动补采', priceBasis: '品类未确认' };
                    continue;
                  }
                  const reviewAttempted = i < targetDeepReviews;
                  const detailUrl = item.link || ('https://detail.tmall.com/item.htm?id=' + item.itemId);
                  let skuId = item.skuId || '';
                  try { skuId ||= new URL(detailUrl).searchParams.get('skuId') || ''; } catch {}
                  item.skuId = skuId;
                  onProgress({ stage: 'details', current: i + 1, total: currentItems.length,
                    message: `[${i + 1}/${currentItems.length}] 正在补采对应 SKU、价格、包装和物流${reviewAttempted ? '及评价' : ''}：${item.title.slice(0, 14)}…` });
                  try {
                    if (i > 0 && targetDeepReviews > 0) {
                      for (let remaining = 30; remaining > 0; remaining--) {
                        if (hasResolved || win.isDestroyed() || !isCrawlRunning) return;
                        onProgress({ stage: 'cooling_down', current: i + 1, total: currentItems.length, seconds: remaining, message: `商品间休息${remaining}秒，随后继续第${i + 1}款` });
                        await new Promise(resolve => setTimeout(resolve, 1000));
                      }
                    }
                    if (!await waitForVerification()) return;
                    if (win.webContents.getURL() !== detailUrl) await win.loadURL(detailUrl);
                    let snapshot = null;
                    for (let attempt = 0; attempt < 24; attempt++) {
                      if (!await waitForVerification()) return;
                      snapshot = await readDetail(item, skuId);
                      if (snapshot?.error || ((snapshot?.finalPrice || snapshot?.priceUnavailableReason) && snapshot.attributes?.length && snapshot.shippingTime)) break;
                      await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    // Bring product parameters/review tabs into view to trigger lazy loading.
                    await safeExecute(win, `window.scrollTo({ top: 850, behavior: 'instant' });`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    if (!await waitForVerification()) return;
                    const latest = await readDetail(item, skuId);
                    if (latest && !latest.error) snapshot = { ...snapshot, ...latest };
                    if (reviewAttempted) {
                      const reviewSnapshot = await collectAllReviews({
                        itemId: item.itemId, collector: responseCollector,
                        execute: script => safeExecute(win, `return ${script};`),
                        click: async point => {
                          win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
                          win.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
                        },
                        waitForVerification, isCancelled: () => hasResolved || win.isDestroyed() || !isCrawlRunning,
                        pause: ms => new Promise(resolve => setTimeout(resolve, ms)),
                        onProgress: progress => onProgress({ ...progress, stage: 'all_reviews', current: i + 1, total: currentItems.length,
                          message: `[${i + 1}/${currentItems.length}] ${item.title.slice(0, 12)}… ${progress.message}` })
                      });
                      snapshot = { ...snapshot, ...reviewSnapshot };
                    }
                    currentItems[i] = mergeDetailSnapshot(item, snapshot, { reviewAttempted });
                    onProgress({ stage: 'item_completed', item: currentItems[i], current: i + 1, total: currentItems.length,
                      message: `已保存第${i + 1}款商品的详情与评价结果` });
                    if (snapshot?.reviewRateLimited) { accessRestricted = true; break; }
                  } catch (error) {
                    currentItems[i] = mergeDetailSnapshot(item, { error: `详情加载失败：${error.message}` }, { reviewAttempted });
                    if (error.code === 'COMPETITOR_RATE_LIMITED') {
                      currentItems[i] = { ...currentItems[i], reviewRateLimited: true, detailStatus: '访问受限', detailMessage: error.message };
                      onProgress({ stage: 'item_completed', item: currentItems[i], current: i + 1, total: currentItems.length, message: error.message });
                      accessRestricted = true; break;
                    }
                  }
                }

                if (!accessRestricted && !await waitForVerification()) return;

                // 顶部横幅更新为完成状态
                await safeExecute(win, `
                  try {
                    const banner = document.getElementById('__tf_crawler_banner');
                    if (banner) {
                      banner.style.background = '#15803d';
                      banner.innerHTML = '<strong>详情补采已结束</strong>：正在载入结果，缺失字段与评价读取状态请查看逐款说明。';
                    }
                  } catch (e) {}
                `);

                onProgress({
                  stage: accessRestricted ? 'rate_limited' : 'completed',
                  count: currentItems.length,
                  message: accessRestricted ? '平台限制访问，已停止本轮后续请求并保存读取结果；请稍后手动重试' : `模式 B 采集结束，共载入 ${currentItems.length} 款商品；部分缺失字段请查看逐款采集说明`
                });

                // 稍作延时后优雅关闭窗口
                if (!accessRestricted) setTimeout(() => {
                  try {
                    if (win && !win.isDestroyed()) win.close();
                  } catch {}
                }, 1600);

                finish(null, currentItems);
              }
            } catch (stepErr) {
              if (stepErr.code === 'COMPETITOR_RATE_LIMITED') {
                onProgress({ stage: 'rate_limited', message: stepErr.message });
                finish(stepErr);
              }
              // 安全静默，不向终端吐出无关报错
            } finally {
              pollBusy = false;
            }
          }, 750);
        } catch (didFinishErr) {
          console.error('did-finish-load 处理异常:', didFinishErr);
        }
      };

      // 绑定首次加载完成事件
      win.webContents.on('did-finish-load', onSearchPageLoaded);
    } catch (err) {
      finish(err);
    }
  });
}

module.exports = {
  startBrowserCrawler,
  stopBrowserCrawler,
  continueBrowserCrawler,
  isCrawlerActive
};
