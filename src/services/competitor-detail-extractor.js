'use strict';

// Self-contained: executed in the store page, with no Node access or private API calls.
function extractDetailSnapshot({ itemId = '', skuId = '', responseData = [] } = {}) {
  const text = el => String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
  const visible = el => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const nodes = selector => [...document.querySelectorAll(selector)].filter(visible);
  const read = selector => nodes(selector).map(text).filter(Boolean);
  const money = value => {
    if (value && typeof value === 'object' && (String(value.fuzzyPrice) === 'true' || String(value.hiddenPrice) === 'true')) return null;
    if (value && typeof value === 'object') value = value.priceText ?? value.price ?? value.value;
    const match = String(value ?? '').replace(/,/g, '').match(/^(?:[¥￥]\s*)?(\d+(?:\s*\.\s*\d{1,2})?)(?:元)?$/);
    const number = match ? Number(match[1].replace(/\s/g, '')) : 0;
    return number > 0 && number < 100000 ? number : null;
  };
  const splitPrice = el => {
    const integer = el.querySelector('[class*="priceInt" i], [class*="price-int" i]');
    const fraction = el.querySelector('[class*="priceFloat" i], [class*="price-float" i], [class*="priceDecimal" i]');
    if (integer && fraction) {
      const a = text(integer).replace(/[^\d]/g, ''), b = text(fraction).replace(/[^\d]/g, '');
      if (a && b) return money(`${a}.${b}`);
    }
    return money(text(el));
  };
  const result = { matchedSku: false, attributes: [], negativeReviews: '', reviewCount: 0 };
  const reviewTexts = [], shippingParts = [];
  const addAttribute = (name, value) => {
    if (name && value != null) result.attributes.push(`${name}：${Array.isArray(value) ? value.join(' ') : value}`);
  };
  const readSkuInfo = info => {
    const beforeDiscount = /优惠前|原价|划线价/.test(info?.price?.priceTitle || '');
    result.finalPrice = money(info?.subPrice) || (!beforeDiscount ? money(info?.price) : null);
    result.originalPrice = money(info?.originalPrice) || money(info?.originPrice) || money(info?.linePrice)
      || (beforeDiscount ? money(info?.price) : null);
    if (beforeDiscount && !result.finalPrice) result.priceUnavailableReason = '页面优惠后价格被遮挡或未展示（未确认）';
    if (info?.logisticsTime) result.shippingTime = String(info.logisticsTime);
  };
  const currentId = new URL(location.href).searchParams.get('id');
  if (itemId && currentId && currentId !== String(itemId)) return { error: '详情页商品 ID 不匹配' };

  // Read only this page's product branch. Never use recommendation/ad prices.
  const roots = [...responseData, window.__INITIAL_DATA__, window.__INIT_DATA__, window.__INITIAL_STATE__, window.__ICE_APP_CONTEXT__, window.g_config];
  const queue = roots.filter(Boolean), seen = new Set();
  let visited = 0;
  while (queue.length && visited++ < 6000) {
    let data = queue.shift();
    if (typeof data === 'string' && data.startsWith('{')) { try { data = JSON.parse(data); } catch { continue; } }
    if (!data || typeof data !== 'object' || seen.has(data)) continue;
    seen.add(data);
    const item = data.item || data.itemDO || data.itemInfo;
    const id = item?.itemId ?? item?.itemNumId ?? item?.id;
    const sameItem = id != null && String(id) === String(itemId);
    const skuBase = data.skuBase;
    const skuCore = data.skuCore;
    const matchingSku = skuId && skuBase?.skus?.find(s => String(s.skuId) === String(skuId));
    if (sameItem || matchingSku) {
      if (item?.title) result.title = String(item.title);
      const images = item?.images || item?.pics;
      if (images?.[0]) result.imageUrl = String(images[0]);
      if (matchingSku) {
        const values = new Map();
        for (const prop of skuBase.props || []) for (const val of prop.values || []) values.set(`${prop.pid}:${val.vid}`, val.name);
        result.skuName = String(matchingSku.propPath || '').split(';').map(key => values.get(key)).filter(Boolean).join(' ');
        result.matchedSku = true;
        result.skuId = String(skuId);
        const info = skuCore?.sku2info?.[skuId];
        readSkuInfo(info);
        result.priceBasis = '详情页对应 SKU 展示价';
      } else if (!skuId && skuBase?.skus?.length === 1) {
        const onlySku = skuBase.skus[0];
        result.skuId = String(onlySku.skuId);
        const info = skuCore?.sku2info?.[onlySku.skuId];
        readSkuInfo(info);
        result.matchedSku = true;
        result.priceBasis = '详情页唯一 SKU 展示价';
      }
      if (item?.sellCount || item?.vagueSellCount) result.sales = String(item.sellCount || item.vagueSellCount);
      const components = data.componentsVO || {};
      if (components.titleVO?.salesDesc) result.sales = String(components.titleVO.salesDesc);
      const delivery = components.deliveryVO;
      if (delivery?.freight) shippingParts.push(String(delivery.freight));
      if (!result.shippingTime && delivery?.agingDesc) result.shippingTime = String(delivery.agingDesc);
      for (const prop of data.plusViewVO?.industryParamVO?.enhanceParamList || []) addAttribute(prop.propertyName, prop.valueName);
      for (const group of components.extensionInfoVO?.infos || []) {
        if (group.type === 'BASE_PROPS') for (const prop of group.items || []) addAttribute(prop.title, prop.text);
      }
      for (const review of components.rateVO?.group?.items || []) if (typeof review.content === 'string') reviewTexts.push(review.content);
      const properties = data.props?.groupProps || data.props?.props || [];
      for (const group of Array.isArray(properties) ? properties : []) {
        if (group && typeof group === 'object') {
          if (group.name && group.value != null) result.attributes.push(`${group.name}：${group.value}`);
          for (const value of Object.values(group)) {
            if (Array.isArray(value)) for (const entry of value) {
              if (entry && typeof entry === 'object') for (const [key, val] of Object.entries(entry)) if (typeof val === 'string') result.attributes.push(`${key}：${val}`);
            }
          }
        }
      }
    }
    for (const [key, value] of Object.entries(data)) {
      if (!/recommend|related|advert|guess|shopItems/i.test(key) && value && (typeof value === 'object' || (key === 'value' && typeof value === 'string'))) queue.push(value);
    }
  }

  result.title ||= read('h1, #J_Title h3, [class*="ItemTitle"], [class*="itemTitle"]').find(t => t.length >= 6);
  const selected = read('[class*="sku"] [aria-checked="true"], [class*="Sku"] [aria-checked="true"], [class*="sku"] [class*="selected"], [class*="Sku"] [class*="selected"]');
  if (!result.skuName && selected.length) result.skuName = selected.join(' ');
  result.attributes.push(...read('#J_AttrUL li, [class*="attributes"] li, [class*="attrItem"], [class*="parameter"] li'));
  for (const row of nodes('[class*="generalParamsInfoItem--"], [class*="emphasisParamsInfoItem--"]')) {
    const title = row.querySelector('[class*="emphasisParamsInfoItemSubTitle--"], [class*="generalParamsInfoItemTitle--"]');
    if (title) addAttribute(text(title), text(row).replace(text(title), '').trim());
  }
  result.attributes = [...new Set(result.attributes)];
  // An unconfirmed SKU must not inherit a product's minimum price and weight.
  if ((!skuId || result.matchedSku) && !result.priceUnavailableReason) {
    for (const el of nodes('#J_PromoPrice .tm-price, #J_StrPrice .tb-rmb-num, [class*="highlightPrice"], [class*="Price--price"], [class*="price--price"]')) {
      const price = splitPrice(el);
      if (price && !result.finalPrice) { result.finalPrice = price; result.priceBasis = result.matchedSku ? '详情页对应 SKU 展示价' : '详情页展示价（SKU 未确认）'; }
    }
    for (const el of nodes('#J_StrPrice .tm-price, del, [class*="linePrice"], [class*="originalPrice"]')) result.originalPrice ||= splitPrice(el);
  }
  const shipping = read('[class*="delivery" i], [class*="freight" i], [class*="shipping" i], #J_Postage, [class*="ServiceInfo"]');
  const shippingText = [...shippingParts, ...shipping].join(' ');
  if (/不包邮|运费\s*[¥￥]?\s*[1-9]\d*(?:\.\d+)?/.test(shippingText)) result.freeShipping = false;
  else if (/包邮|免运费|快递[：:]?\s*0(?:\.00)?元|运费[：:]?\s*0(?:\.00)?元/.test(shippingText)) result.freeShipping = true;
  const dispatch = shippingText.match(/(?:预计)?(?:今天|明天|后天|当天|当日|次日)发货(?:[，,][^。;；]{0,20}必赔)?|\d+\s*(?:小时|天)(?:内|之内)?\s*(?:发货|发出)/);
  if (dispatch && !result.shippingTime) result.shippingTime = dispatch[0];
  const sales = read('[class*="sellCount" i], [class*="salesCount" i], #J_SellCounter').find(t => /\d/.test(t));
  if (sales) result.sales = sales;
  // Scope hashed content classes to review containers; shipping and guarantees
  // also use content-- classes and must never become buyer feedback.
  const reviews = [...new Set([...reviewTexts, ...read('.tm-rate-fulltxt, [class*="review-content"], [class*="review-text"], [class*="rate-content"], [class*="Comment--content"], [class*="rateItem"] [class*="content--"], [class*="RateItem"] [class*="content--"], [class*="commentItem"] [class*="content--"]')])]
    .filter(t => t.length >= 8 && t.length <= 500 && !/此用户没有填写|评价方未及时/.test(t));
  result.reviewCount = reviews.length;
  const negative = reviews.filter(t => {
    // “没有破损”“无虫” describe a positive experience, not a complaint.
    const complaints = t.replace(/(?:没有|没|无|未|不是|不)(?:任何|其他|发现|出现|发生){0,2}(?:(?:漏气|漏洒|破损|碎米|发霉|虫子?|陈米|异味|质量问题)[、和及或]?)+/g, '');
    return /漏气|破损|碎米|发霉|虫|陈米|难吃|不新鲜|退货|不好吃|口感.{0,4}硬|发柴|没有.{0,3}香|不推荐|差评/.test(complaints);
  });
  result.negativeReviews = negative.slice(0, 3).join('；');
  result.reviewStatus = reviews.length ? `已读取${reviews.length}条页面评价，${negative.length ? '发现负面反馈' : '已读样本未发现负面反馈'}（非全量）` : '页面未展示可读取的评价';
  if (result.priceUnavailableReason) result.priceBasis = result.priceUnavailableReason;
  return result;
}

function mergeDetailSnapshot(item, snapshot, { reviewAttempted = false } = {}) {
  const merged = { ...item, source: 'crawler', collectedAt: new Date().toISOString() };
  if (!snapshot || snapshot.error || snapshot.__tf_error) return { ...merged, detailStatus: '详情失败', detailMessage: snapshot?.error || snapshot?.__tf_error || '详情页面未返回可读取数据' };
  const { extractSpec, extractPackaging, extractRiceVariety } = require('./competitor-service');
  if (snapshot.title) merged.title = snapshot.title;
  if (snapshot.imageUrl) merged.imageUrl = snapshot.imageUrl.startsWith('//') ? `https:${snapshot.imageUrl}` : snapshot.imageUrl;
  const attributes = (snapshot.attributes || []).join(' ');
  const skuText = snapshot.matchedSku ? snapshot.skuName || '' : '';
  const spec = extractSpec('', skuText || attributes.match(/(?:净含量|净重|规格)[：:]\s*([^;；]+)/)?.[1] || '');
  if (spec !== '未识别') merged.spec = spec;
  if (item.skuId && !snapshot.matchedSku) merged.spec = '未识别';
  const packagingAttribute = (snapshot.attributes || []).find(value => /^包装方式[：:]/.test(value))?.replace(/^包装方式[：:]\s*/, '') || '';
  const skuPackaging = extractPackaging('', skuText);
  const packaging = skuPackaging !== '未识别' ? skuPackaging : extractPackaging(packagingAttribute);
  if (packaging !== '未识别') merged.packaging = packaging;
  else {
    const disclosed = packagingAttribute;
    if (disclosed) merged.packaging = disclosed === '包装' ? '包装（未细分）' : disclosed;
  }
  merged.variety = extractRiceVariety(merged.title, skuText);
  if (snapshot.skuId) merged.skuId = snapshot.skuId;
  if (snapshot.finalPrice > 0) {
    merged.finalPrice = snapshot.finalPrice;
    merged.priceBasis = snapshot.priceBasis;
  } else {
    merged.priceBasis = snapshot.priceUnavailableReason || '详情页未展示可确认的价格（未确认）';
    merged.finalPrice = null;
  }
  merged.originalPrice = snapshot.originalPrice > 0 ? snapshot.originalPrice : null;
  if (typeof snapshot.freeShipping === 'boolean') merged.freeShipping = snapshot.freeShipping;
  if (snapshot.shippingTime) merged.shippingTime = snapshot.shippingTime;
  if (snapshot.sales) merged.sales = snapshot.sales;
  if (!item.remarkManual && ['引流款', '主推款', '待判断'].includes(item.remark)) merged.remark = '';
  if (reviewAttempted && snapshot.reviewCount > 0 && item.reviewSource !== 'manual') {
    merged.negativeReviews = snapshot.negativeReviews || '';
    merged.isRealReview = Boolean(snapshot.negativeReviews);
    merged.reviewSource = 'collected';
  }
  merged.reviewStatus = reviewAttempted ? snapshot.reviewStatus : '本次未选择采集评价';
  if (reviewAttempted) {
    merged.reviewCount = snapshot.reviewCount || 0;
    merged.reviews = snapshot.reviews || [];
    merged.reviewScope = snapshot.reviewScope || 'preview';
    merged.reviewComplete = snapshot.reviewComplete === true;
    merged.reviewListExhausted = snapshot.reviewListExhausted === true;
    merged.reviewExcludedCount = snapshot.reviewExcludedCount || 0;
    merged.reviewTotal = snapshot.reviewTotal || '';
    merged.reviewRateLimited = snapshot.reviewRateLimited === true;
    merged.reviewStopReason = snapshot.reviewStopReason || '';
    if (snapshot.reviewRateLimited && !snapshot.reviewCount && item.reviews?.length) {
      merged.reviews = item.reviews;
      merged.reviewCount = item.reviews.length;
      merged.reviewStatus = `${snapshot.reviewStatus}；保留上次已保存的${item.reviews.length}条评价`;
    }
    if (merged.reviewCount > 0 && item.reviewSource !== 'manual') merged.reviewSource = 'collected';
  }
  const known = value => value != null && value !== '' && value !== '未识别' && value !== '未采集';
  const missing = [['spec', '对应规格'], ['packaging', '包装'], ['originalPrice', '标价'], ['finalPrice', '优惠后价格'], ['freeShipping', '运费'], ['shippingTime', '发货时效']]
    .filter(([field]) => !known(merged[field])).map(([, label]) => label);
  merged.detailStatus = missing.length ? '部分采集' : '详情已读取';
  merged.detailMessage = [missing.length ? `页面未读取到：${missing.join('、')}` : '商品详情字段已读取', merged.reviewStatus, item.skuId && !snapshot.matchedSku ? '链接 SKU 未匹配，暂不计算重量单价' : '', snapshot.responseStatus ? `详情响应：${snapshot.responseStatus}` : ''].filter(Boolean).join('；');
  return merged;
}

function isRiceProductTitle(title) {
  return /大米|稻米|粳米|籼米|香米|丝苗|珍珠米|长粒香|稻花香|五常米|小町米/.test(title)
    && !/饲料|喂(?:鸡|鸭|鹅|狗|猪|牛|羊)|米桶|储米|收纳|防潮桶|钓鱼|打窝/.test(title);
}

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

module.exports = { extractDetailSnapshot, mergeDetailSnapshot, isRiceProductTitle, readCardPrice };
