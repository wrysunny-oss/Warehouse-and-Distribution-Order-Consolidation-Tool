'use strict';

const http = require('node:http');
const { normalizeReview, createReviewAccumulator } = require('./competitor-review-service');

const RICE_VARIETIES = [
  '五常米', '稻花香', '五常大米', '长粒香', '秋田小町', '小町米', 
  '丝苗米', '东北大米', '珍珠米', '粳米', '籼米', '富硒米', 
  '泰国香米', '茉莉香米', '红米', '黑米', '糯米', '碎米'
];

const PACKAGING_TYPES = [
  '真空包装', '双层编织袋', '编织袋', '自立袋', '充氮包装', '牛皮纸袋', '罐装', '盒装'
];

/**
 * 从标题与 SKU 名称中识别米种
 */
function extractRiceVariety(title = '', skuName = '') {
  for (const source of [skuName, title]) {
    const text = String(source).replace(/(?:非|不是|不含)\s*(?:五常|稻花香|长粒香|秋田小町|小町|珍珠米|丝苗米)/g, '');
    if (text.includes('五常') || text.includes('稻花香')) return '五常米 粳米';
    if (text.includes('长粒香')) return '长粒香 粳米';
    if (text.includes('秋田小町') || text.includes('小町')) return '秋田小町 粳米';
    if (text.includes('丝苗米') || text.includes('丝苗')) return '丝苗米 籼米';
    if (text.includes('珍珠米')) return '珍珠米 粳米';
    if (text.includes('富硒')) return '富硒米 粳米';
    if (text.includes('泰国香米') || text.includes('茉莉香米')) return '香米 籼米';
    if (text.includes('东北大米') || text.includes('东北米')) return '东北米 粳米';
    if (text.includes('粳米')) return '粳米';
    if (text.includes('籼米')) return '籼米';
  }
  return '未识别';
}

/**
 * 规格提取与标准化 (统一转换为 kg 或保留清晰标注)
 */
function extractSpec(title = '', skuName = '') {
  // SKU is authoritative; do not pick a different weight from the listing title.
  for (const text of [skuName, title]) {
    const weights = [...String(text).matchAll(/(\d+(?:\.\d+)?)\s*(kg|千克|公斤|斤|g|克)(?![a-z])/gi)]
      .map(m => Number(m[1]) * (/^(kg|千克|公斤)$/i.test(m[2]) ? 1 : m[2] === '斤' ? 0.5 : 0.001));
    if (new Set(weights).size > 1) return '未识别';
    const match = String(text).match(/(\d+(?:\.\d+)?)\s*(kg|千克|公斤|斤|g|克)(?![a-z])/i);
    if (!match || Number(match[1]) <= 0) continue;
    const unit = match[2].toLowerCase();
    let kg = Number(match[1]) * (/^(kg|千克|公斤)$/.test(unit) ? 1 : unit === '斤' ? 0.5 : 0.001);
    const after = String(text).slice(match.index + match[0].length);
    const before = String(text).slice(0, match.index);
    const packs = after.match(/^\s*(?:[×x*]\s*|[\/／每]?(?:袋|包)\s*[×x*]\s*)(\d+)\s*(?:袋|包)?/) || before.match(/(\d+)\s*[×x*]\s*$/);
    if (packs) kg *= Number(packs[1]);
    return kg >= 1 ? `${Number(kg.toFixed(6))}kg` : `${Number((kg * 1000).toFixed(3))}g`;
  }
  return '未识别';
}

/**
 * 包装类型提取
 */
function extractPackaging(title = '', skuName = '') {
  const text = `${title} ${skuName}`;
  if (/非真空|不抽真空|不是真空/.test(text)) return '非真空包装';
  if (text.includes('真空')) return '真空包装';
  if (text.includes('双层编织袋') || text.includes('双层袋')) return '双层编织袋';
  if (text.includes('编织袋') || text.includes('编织')) return '编织袋';
  if (text.includes('自立袋')) return '自立袋';
  if (text.includes('充氮')) return '充氮保鲜包装';
  if (text.includes('盒装') || text.includes('纸箱')) return '盒装';
  if (text.includes('罐装')) return '罐装';
  return '未识别';
}

/**
 * 发货时效识别
 */
function extractShippingTime(raw = '') {
  const text = String(raw || '');
  if (text.includes('24小时')) return '24小时内';
  if (text.includes('48小时')) return '48小时内';
  if (text.includes('次日')) return '次日达/24小时内';
  if (text.includes('当日')) return '当日发货';
  return '未采集';
}

/**
 * 销量文本标准化
 */
function formatSales(raw = '') {
  const text = String(raw ?? '').trim();
  if (!text) return '未采集';
  if (/付款|已售|收货|人|笔|件/.test(text)) return text;
  if (/^\d+(?:\.\d+)?[万w千k]?\+?$/i.test(text)) return `${text}人付款`;
  return text;
}

/**
 * 智能分析 SKU 款式定位（引流款 / 主推款 / 利润款 / 同一个链接标注）
 */
function processPositioning(items) {
  const groups = new Map();
  items.forEach((item, index) => {
    let key = item.itemId || item.groupKey;
    if (!key && item.link) {
      try {
        const url = new URL(item.link);
        key = url.searchParams.get('id') || `${url.origin}${url.pathname}`;
      } catch {}
    }
    key ||= `row:${index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  const result = items.map(item => ({ ...item }));
  for (const indices of groups.values()) {
    const prices = indices.map(i => Number(items[i].finalPrice)).filter(p => p > 0 && Number.isFinite(p));
    const min = Math.min(...prices), max = Math.max(...prices);
    for (const index of indices) {
      const current = result[index], price = Number(current.finalPrice);
      current.isSameLink = indices.length > 1;
      if (!current.remark) {
        current.remark = !(price > 0) ? '待判断'
          : current.isSameLink ? (min < max && price === min ? '引流款' : '主推款')
          : price < 10 ? '引流款' : '主推款';
      }
    }
  }
  return result;
}

/** 已废弃的推导入口：仅保留调用方提供的评价，不合成买家反馈。 */
function deduceRiceNegativeReviews({ rawReviews = '' } = {}) {
  return String(rawReviews || '').trim();
}

/**
 * 健壮的文本价格解析函数 (支持 ¥59.9, ¥ 59 .9, 59.9元, 包含空格/换行等各种异常排版)
 */
function extractPriceFromText(text) {
  if (typeof text === 'number') return Number.isFinite(text) && text > 0 && text < 100000 ? text : 0;
  if (!text || typeof text !== 'string') return 0;
  if (/-\s*\d/.test(text)) return 0;
  
  // 1. 匹配标准 ¥ / ￥ 开头的价格 (容错格式如 ¥ 39 .90 或 ¥39.9)
  const yuanMatches = text.match(/[¥￥]\s*(\d+)(?:\s*[\.。]\s*(\d{1,2}))?/g);
  if (yuanMatches && yuanMatches.length > 0) {
    for (const m of yuanMatches) {
      const clean = m.replace(/[¥￥\s]/g, '').replace('。', '.');
      const val = parseFloat(clean);
      if (!isNaN(val) && val > 0 && val < 100000) return val;
    }
  }
  // 2. 匹配 "XX.XX元" 格式
  const yuanMatch = text.match(/(\d+(?:\.\d{1,2})?)\s*元/);
  if (yuanMatch && yuanMatch[1]) {
    const val = parseFloat(yuanMatch[1]);
    if (!isNaN(val) && val > 0 && val < 100000) return val;
  }
  // 3. 兜底纯数字匹配 (排除过长数字如订单号或条码)
  const numMatch = text.trim().replace(/,/g, '').match(/^\d+(?:\.\d{1,2})?$/);
  if (numMatch) {
    const val = parseFloat(numMatch[0]);
    if (!isNaN(val) && val > 0 && val < 100000) return val;
  }
  return 0;
}

/**
 * 标准化单条或多条输入数据为规范 12 列结构
 */
function normalizeCompetitorItems(rawList) {
  if (!Array.isArray(rawList)) {
    if (rawList && typeof rawList === 'object') rawList = rawList.items ?? rawList.data ?? [rawList];
    if (!Array.isArray(rawList)) throw new Error('竞品数据必须是商品数组、单个商品或包含 items/data 数组的对象');
  }
  if (rawList.length > 5000) throw new Error('单次最多导入 5000 条竞品数据');
  rawList = rawList.filter(raw => raw && typeof raw === 'object' && !Array.isArray(raw)
    && String(raw.title || raw['主图+标题'] || raw.name || '').trim());

  const normalized = rawList.map((raw, index) => {
    const title = String(raw.title || raw['主图+标题'] || raw.name || '').trim();
    const skuName = String(raw.skuName || raw.sku || raw['规格'] || '').trim();
    const rankValue = Number(raw.rank || raw['排名']);
    const rank = Number.isFinite(rankValue) && rankValue > 0 ? rankValue : index + 1;

    const variety = String(raw.variety || raw['米种'] || extractRiceVariety(title, skuName));
    const spec = String(raw.spec || raw['规格'] || extractSpec(title, skuName));
    const packaging = String(raw.packaging || raw['包装类型'] || extractPackaging(title, skuName));

    const finalPrice = extractPriceFromText(raw.finalPrice ?? raw['券后到手价'] ?? raw.price) || null;
    const originalPrice = extractPriceFromText(raw.originalPrice ?? raw['前台标价'] ?? raw.marketPrice) || null;
    const shipping = raw.freeShipping ?? raw['是否包邮'];
    const freeShipping = shipping === true ? '包运费' : shipping === false ? '不包邮'
      : /^(true|1|是|包邮|包运费)$/i.test(String(shipping)) ? '包运费'
      : /^(false|0|否|不包邮)$/i.test(String(shipping)) ? '不包邮' : '未采集';
    const shippingTime = String(raw.shippingTime || raw['发货时效'] || extractShippingTime(raw.dispatchTime));
    const sales = formatSales(raw.sales ?? raw['销量'] ?? raw.salesCount);
    const imageUrl = String(raw.imageUrl || raw.picUrl || raw.image || raw.img || '').trim();
    const negativeReviews = String(raw.negativeReviews || raw['高频差评'] || raw.badReviews || '').trim();
    const remark = String(raw.remark || raw['备注'] || '').trim();
    let itemId = String(raw.itemId || raw.id || '').trim();
    if (!itemId && (raw.link || raw.url)) {
      try { itemId = new URL(raw.link || raw.url).searchParams.get('id') || ''; } catch {}
    }
    const link = String(raw.link || raw.url || (itemId ? `https://detail.tmall.com/item.htm?id=${itemId}` : '')).trim();

    return {
      rank,
      variety,
      spec,
      packaging,
      originalPrice,
      finalPrice,
      freeShipping,
      shippingTime,
      title,
      imageUrl,
      link,
      sales,
      negativeReviews,
      isRealReview: raw.source !== 'sample' && raw.isRealReview === true && Boolean(negativeReviews),
      source: raw.source || 'import',
      reviewSource: raw.reviewSource || '',
      remark,
      remarkManual: raw.remarkManual === true,
      itemId,
      groupKey: raw.groupKey || '',
      skuId: String(raw.skuId || (() => { try { return new URL(link).searchParams.get('skuId') || ''; } catch { return ''; } })()),
      detailStatus: raw.detailStatus || '',
      detailMessage: raw.detailMessage || '',
      priceBasis: raw.priceBasis || '',
      reviewStatus: raw.reviewStatus || '',
      reviewCount: raw.source !== 'sample' && raw.reviewSource === 'collected' ? Math.max(0, Math.floor(Number(raw.reviewCount) || 0)) : 0,
      reviews: Array.isArray(raw.reviews) ? raw.reviews.map(normalizeReview).filter(Boolean) : [],
      reviewScope: raw.reviewScope || 'preview',
      reviewComplete: raw.reviewScope === 'all' && raw.reviewComplete === true,
      reviewListExhausted: raw.reviewListExhausted === true,
      reviewExcludedCount: Math.max(0, Number(raw.reviewExcludedCount) || 0),
      reviewTotal: String(raw.reviewTotal || ''),
      reviewRateLimited: raw.reviewRateLimited === true,
      reviewStopReason: String(raw.reviewStopReason || ''),
      collectedAt: raw.collectedAt || ''
    };
  });

  return processPositioning(normalized);
}

/**
 * 生成逼真、清晰的大米包装袋矢量图 Data URI (解决外链图片防盗链和离线无法加载的问题)
 */
function generateRicePackageSvg(variety, spec, packaging, bgColor = '#18181b', accentColor = '#eab308') {
  const shortVariety = variety.split(' ')[0] || '大米';
  const isVacuum = (packaging || '').includes('真空');
  const bagShape = isVacuum
    ? `<rect x="36" y="24" width="88" height="116" rx="8" fill="${bgColor}" stroke="${accentColor}" stroke-width="2" />
       <path d="M42 24 L52 14 L108 14 L118 24 Z" fill="${accentColor}" opacity="0.9" />`
    : `<rect x="32" y="30" width="96" height="112" rx="14" fill="${bgColor}" stroke="${accentColor}" stroke-width="2" />
       <path d="M40 30 Q80 18 120 30" stroke="${accentColor}" stroke-width="3" fill="none" />
       <rect x="58" y="14" width="44" height="16" rx="8" fill="none" stroke="${accentColor}" stroke-width="2" />`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
    <rect width="160" height="160" rx="14" fill="#18181b" />
    ${bagShape}
    <rect x="44" y="44" width="72" height="32" rx="4" fill="#09090b" opacity="0.85" />
    <text x="80" y="58" fill="#ffffff" font-size="11" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="bold" text-anchor="middle">${shortVariety}</text>
    <text x="80" y="71" fill="${accentColor}" font-size="9" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="bold" text-anchor="middle">${isVacuum ? '【真空保鲜】' : '【原粮直供】'}</text>
    <circle cx="80" cy="98" r="14" fill="${accentColor}" opacity="0.2" />
    <path d="M80 88 C74 94 76 104 80 108 C84 104 86 94 80 88 Z" fill="${accentColor}" />
    <rect x="54" y="116" width="52" height="16" rx="8" fill="${accentColor}" />
    <text x="80" y="128" fill="#ffffff" font-size="10" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="bold" text-anchor="middle">${spec}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * 真实的淘工厂大米 Top 20 示例演示数据（含同一链接多 SKU、高频差评标签、主图与真实价格梯度）
 */
function getMockTaoFactoryRiceTop20() {
  const rawList = [
    {
      rank: 1,
      title: '【淘工厂直营】东北五常大米 优质五常稻花香米 真空试吃装1kg',
      skuName: '1kg 真空包装',
      originalPrice: 21.9,
      finalPrice: 0.8,
      freeShipping: '包运费',
      shippingTime: '48小时内',
      imageUrl: generateRicePackageSvg('五常米', '1kg', '真空包装', '#1c1917', '#eab308'),
      sales: '3w+人付款',
      negativeReviews: '【真实买家】“分量真的太少了，买来试吃只有一小捧，单斤折算太贵了”',
      isRealReview: true,
      remark: '引流款',
      itemId: 'TF_RICE_001',
      groupKey: 'TF_RICE_001'
    },
    {
      rank: 2,
      title: '【淘工厂直营】东北五常大米 优质五常稻花香米 经典家用装2.5kg',
      skuName: '2.5kg 编织袋',
      originalPrice: 30.9,
      finalPrice: 6.47,
      freeShipping: '包运费',
      shippingTime: '48小时内',
      imageUrl: generateRicePackageSvg('五常米', '2.5kg', '编织袋', '#7f1d1d', '#f87171'),
      sales: '3w+人付款',
      negativeReviews: '【真实买家】“收到的时候编织袋破了个小洞，漏得箱子里到处都是米，碎米偏多”',
      isRealReview: true,
      remark: '主推款',
      itemId: 'TF_RICE_001',
      groupKey: 'TF_RICE_001'
    },
    {
      rank: 3,
      title: '【源头直发】东北大米珍珠米 5kg 东北粳米 软糯香甜日常家用粮',
      skuName: '5kg 双层编织袋',
      originalPrice: 38.8,
      finalPrice: 19.9,
      freeShipping: '包运费',
      shippingTime: '24小时内',
      imageUrl: generateRicePackageSvg('珍珠米', '5kg', '双层编织袋', '#064e3b', '#10b981'),
      sales: '2w+人付款',
      negativeReviews: '【真实买家】“淘米水特别浑浊，碎米多，米饭煮出来发柴不软糯”',
      isRealReview: true,
      remark: '主推款',
      itemId: 'TF_RICE_002',
      groupKey: 'TF_RICE_002'
    },
    {
      rank: 4,
      title: '【淘工厂爆款】黑龙江长粒香大米 2.5kg 真空保鲜装 现磨新米',
      skuName: '2.5kg 真空包装',
      originalPrice: 28.5,
      finalPrice: 13.9,
      freeShipping: '包运费',
      shippingTime: '48小时内',
      imageUrl: generateRicePackageSvg('长粒香', '2.5kg', '真空包装', '#1e3a8a', '#60a5fa'),
      sales: '1.8w+人付款',
      negativeReviews: '【真实买家】“真空包装运来已经漏气变软了，没有米香味，怀疑是掺了陈米”',
      isRealReview: true,
      remark: '主推款',
      itemId: 'TF_RICE_003',
      groupKey: 'TF_RICE_003'
    },
    {
      rank: 5,
      title: '【天天低价】东北秋田小町大米 5kg 寿司饭饭团米 晶莹油润',
      skuName: '5kg 编织袋',
      originalPrice: 42.0,
      finalPrice: 24.8,
      freeShipping: '包运费',
      shippingTime: '48小时内',
      imageUrl: generateRicePackageSvg('秋田小町', '5kg', '编织袋', '#78350f', '#fbbf24'),
      sales: '1.5w+人付款',
      negativeReviews: '【真实买家】“米粒小且圆，放凉之后特别干硬，家里老人咬不动，焖饭得稍微多放水”',
      isRealReview: true,
      remark: '主推款',
      itemId: 'TF_RICE_004',
      groupKey: 'TF_RICE_004'
    },
    {
      rank: 6,
      title: '【淘工厂补贴】正宗原产五常大米 稻花香2号 5kg真空双层装',
      skuName: '5kg 真空双层',
      originalPrice: 78.0,
      finalPrice: 39.9,
      freeShipping: '包运费',
      shippingTime: '24小时内',
      imageUrl: generateRicePackageSvg('五常稻花香', '5kg', '真空双层', '#18181b', '#facc15'),
      sales: '1.2w+人付款',
      negativeReviews: '【真实买家】“扫码防伪验证延迟了好久，大米香味比较一般，性价比不如超市散装”',
      isRealReview: true,
      remark: '主推款',
      itemId: 'TF_RICE_005',
      groupKey: 'TF_RICE_005'
    },
    {
      rank: 7,
      title: '【金牌直营】广东丝苗米 5kg 软边丝苗籼米 煲仔饭专用长粒米',
      skuName: '5kg 编织袋',
      originalPrice: 35.0,
      finalPrice: 21.5,
      freeShipping: '包运费',
      shippingTime: '48小时内',
      imageUrl: generateRicePackageSvg('丝苗米', '5kg', '编织袋', '#0f766e', '#2dd4bf'),
      sales: '1.1w+人付款',
      negativeReviews: '【真实买家】“粘性严重不足，煮稀饭完全水米分离，米质很硬发干”',
      isRealReview: true,
      remark: '主推款',
      itemId: 'TF_RICE_006',
      groupKey: 'TF_RICE_006'
    },
    {
      rank: 8,
      title: '【特惠清仓】东北当季新米 优质粳米 10kg 家庭实惠大包装',
      skuName: '10kg 编织袋',
      originalPrice: 65.0,
      finalPrice: 38.9,
      freeShipping: '包运费',
      shippingTime: '48小时内',
      imageUrl: generateRicePackageSvg('东北粳米', '10kg', '编织袋', '#334155', '#94a3b8'),
      sales: '9000+人付款',
      negativeReviews: '【真实买家】“10kg大包装搬运磕碰有撒漏，淘米淘出来不少碎米渣和糠皮”',
      isRealReview: true,
      remark: '利润款',
      itemId: 'TF_RICE_007',
      groupKey: 'TF_RICE_007'
    },
    {
      rank: 9,
      title: '【淘工厂严选】富硒大米 东北黑土优质大米 2.5kg 真空自立袋',
      skuName: '2.5kg 自立袋',
      originalPrice: 36.9,
      finalPrice: 18.8,
      freeShipping: '包运费',
      shippingTime: '24小时内',
      imageUrl: generateRicePackageSvg('富硒大米', '2.5kg', '自立袋', '#581c87', '#c084fc'),
      sales: '8500+人付款',
      negativeReviews: '【真实买家】“说是富硒米但包装上没有任何第三方检测标识，米香味很淡”',
      isRealReview: true,
      remark: '主推款',
      itemId: 'TF_RICE_008',
      groupKey: 'TF_RICE_008'
    },
    {
      rank: 10,
      title: '【热销单品】东北长粒香米 5kg 经典黄色编织袋',
      skuName: '5kg 编织袋',
      originalPrice: 39.9,
      finalPrice: 22.9,
      freeShipping: '包运费',
      shippingTime: '48小时内',
      imageUrl: generateRicePackageSvg('长粒香米', '5kg', '编织袋', '#991b1b', '#fca5a5'),
      sales: '8000+人付款',
      negativeReviews: '【真实买家】“煮饭水份控制要求极高，新陈米疑似混掺，口感偏柴”',
      isRealReview: true,
      remark: '主推款',
      itemId: 'TF_RICE_009',
      groupKey: 'TF_RICE_009'
    },
    {
      rank: 11,
      title: '【新人福利】小町香米 1kg 试吃便携装 淘工厂秒杀专享',
      skuName: '1kg 真空包装',
      originalPrice: 15.9,
      finalPrice: 2.9,
      freeShipping: '包运费',
      shippingTime: '48小时内',
      imageUrl: generateRicePackageSvg('小町香米', '1kg', '真空包装', '#1e293b', '#38bdf8'),
      sales: '7500+人付款',
      negativeReviews: '【真实买家】“试吃特价只能买1包，分量特别小，再次回购价格直接翻倍了”',
      isRealReview: true,
      remark: '引流款',
      itemId: 'TF_RICE_010',
      groupKey: 'TF_RICE_010'
    },
    {
      rank: 12,
      title: '【小町香米 主推】小町香米 5kg 日常实惠装',
      skuName: '5kg 编织袋',
      originalPrice: 42.9,
      finalPrice: 25.9,
      freeShipping: '包运费',
      shippingTime: '48小时内',
      imageUrl: generateRicePackageSvg('小町香米', '5kg', '编织袋', '#172554', '#60a5fa'),
      sales: '7500+人付款',
      negativeReviews: '【真实买家】“大米里面偶尔挑出小青粒和断粒，放凉后回生偏快”',
      isRealReview: true,
      remark: '主推款',
      itemId: 'TF_RICE_010',
      groupKey: 'TF_RICE_010'
    },
    {
      rank: 13,
      title: '【工厂直采】泰国风味茉莉香米 5kg 长粒籼米 清香扑鼻',
      skuName: '5kg 双层编织袋',
      originalPrice: 48.0,
      finalPrice: 28.5,
      freeShipping: '包运费',
      shippingTime: '24小时内',
      imageUrl: generateRicePackageSvg('茉莉香米', '5kg', '双层编织袋', '#065f46', '#34d399'),
      sales: '6800+人付款',
      negativeReviews: '【真实买家】“香味不是纯正茉莉香，留存不久，看产地是国内分装的非原装”',
      isRealReview: true,
      remark: '主推款',
      itemId: 'TF_RICE_011',
      groupKey: 'TF_RICE_011'
    },
    {
      rank: 14,
      title: '【东北粮仓】有机种植五常大米 2.5kg 礼盒手提真空双包装',
      skuName: '2.5kg 盒装',
      originalPrice: 68.0,
      finalPrice: 35.0,
      freeShipping: '包运费',
      shippingTime: '24小时内',
      imageUrl: generateRicePackageSvg('有机五常', '2.5kg', '盒装', '#854d0e', '#fef08a'),
      sales: '6200+人付款',
      negativeReviews: '【真实买家】“礼盒外包装四个角全被暴力快递挤扁了，用来送礼拿不出手”',
      isRealReview: true,
      remark: '利润款',
      itemId: 'TF_RICE_012',
      groupKey: 'TF_RICE_012'
    },
    {
      rank: 15,
      title: '【超值囤货】优质东北圆粒粳米 10kg 双层加厚耐磨袋',
      skuName: '10kg 双层编织袋',
      originalPrice: 62.0,
      finalPrice: 36.9,
      freeShipping: '包运费',
      shippingTime: '48小时内',
      imageUrl: generateRicePackageSvg('圆粒粳米', '10kg', '双层编织袋', '#1e1b4b', '#818cf8'),
      sales: '5800+人付款',
      negativeReviews: '【真实买家】“米粒颜色有点偏黄发暗，没有新米的油润感，出饭率尚可”',
      isRealReview: true,
      remark: '利润款',
      itemId: 'TF_RICE_013',
      groupKey: 'TF_RICE_013'
    },
    {
      rank: 16,
      title: '【工厂爆卖】东北稻花香大米 2.5kg 真空保鲜砖装',
      skuName: '2.5kg 真空包装',
      originalPrice: 32.9,
      finalPrice: 17.5,
      freeShipping: '包运费',
      shippingTime: '48小时内',
      imageUrl: generateRicePackageSvg('稻花香砖', '2.5kg', '真空包装', '#422006', '#fde047'),
      sales: '5400+人付款',
      negativeReviews: '【真实买家】“买了两块真空米砖，收到时有一块已经完全泄气变软袋了”',
      isRealReview: true,
      remark: '主推款',
      itemId: 'TF_RICE_014',
      groupKey: 'TF_RICE_014'
    },
    {
      rank: 17,
      title: '【江南贡米】优质丝苗香米 2.5kg 真空装 软糯爽口',
      skuName: '2.5kg 真空包装',
      originalPrice: 26.0,
      finalPrice: 14.8,
      freeShipping: '包运费',
      shippingTime: '48小时内',
      imageUrl: generateRicePackageSvg('丝苗香米', '2.5kg', '真空包装', '#134e4a', '#5eead4'),
      sales: '4900+人付款',
      negativeReviews: '【真实买家】“碎米偏多淘洗易碎，煮粥水米不相融，米汤不够浓稠”',
      isRealReview: true,
      remark: '主推款',
      itemId: 'TF_RICE_015',
      groupKey: 'TF_RICE_015'
    },
    {
      rank: 18,
      title: '【源头优选】五常长粒香大米 5kg 传统红黑编织袋装',
      skuName: '5kg 编织袋',
      originalPrice: 45.0,
      finalPrice: 26.8,
      freeShipping: '包运费',
      shippingTime: '24小时内',
      imageUrl: generateRicePackageSvg('五常长粒', '5kg', '编织袋', '#701a75', '#f0abfc'),
      sales: '4500+人付款',
      negativeReviews: '【真实买家】“编织袋封口线一拉全脱散了，袋子外表粉尘大，米粒有些脏”',
      isRealReview: true,
      remark: '主推款',
      itemId: 'TF_RICE_016',
      groupKey: 'TF_RICE_016'
    },
    {
      rank: 19,
      title: '【小家庭优选】东北珍珠米 1kg 精巧真空装 现磨新米试吃',
      skuName: '1kg 真空包装',
      originalPrice: 16.9,
      finalPrice: 3.5,
      freeShipping: '包运费',
      shippingTime: '48小时内',
      imageUrl: generateRicePackageSvg('珍珠米', '1kg', '真空包装', '#042f2e', '#2dd4bf'),
      sales: '4200+人付款',
      negativeReviews: '【真实买家】“1kg分量家里两个人吃两顿就没了，不包邮单买的话运费比米还贵”',
      isRealReview: true,
      remark: '引流款',
      itemId: 'TF_RICE_017',
      groupKey: 'TF_RICE_017'
    },
    {
      rank: 20,
      title: '【热销榜单】东北优质富硒长粒米 5kg 装 无添加健康日常主食',
      skuName: '5kg 编织袋',
      originalPrice: 49.9,
      finalPrice: 27.9,
      freeShipping: '包运费',
      shippingTime: '48小时内',
      imageUrl: generateRicePackageSvg('富硒长粒', '5kg', '编织袋', '#3b0764', '#d8b4fe'),
      sales: '3900+人付款',
      negativeReviews: '【真实买家】“生产日期是三个月之前的库存米，开袋闻着没有当季新米的香气”',
      isRealReview: true,
      remark: '主推款',
      itemId: 'TF_RICE_018',
      groupKey: 'TF_RICE_018'
    }
  ];

  return normalizeCompetitorItems(rawList.map(item => ({ ...item, source: 'sample', isRealReview: false, negativeReviews: item.negativeReviews.replace('【真实买家】', '【示例评价】') })));
}


/**
 * 启动轻量本地 HTTP 接收服务，供油猴扩展脚本一键推送采集数据
 */
let localServerInstance = null;

function startLocalCompetitorReceiver({ port = 41235, onDataReceived } = {}) {
  if (localServerInstance) {
    return { status: 'running', port };
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // 允许跨域访问
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === '/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, version: '2.0.0', supportsFullReviews: true, service: 'CompetitorReceiver' }));
        return;
      }

      if (req.url === '/push-review' && req.method === 'POST') {
        req.setEncoding('utf8');
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (!parsed || typeof parsed !== 'object' || !parsed.itemId || (!Array.isArray(parsed.reviews) && (typeof parsed.negativeReviews !== 'string' || !parsed.negativeReviews.trim()))) {
              throw new Error('评价更新必须包含 itemId 和 reviews 数组或非空 negativeReviews');
            }
            let update = { itemId: String(parsed.itemId), negativeReviews: parsed.negativeReviews, isRealReview: parsed.isRealReview === true, reviewSource: 'collected' };
            if (Array.isArray(parsed.reviews)) {
              const accumulator = createReviewAccumulator();
              accumulator.add(parsed.reviews);
              const review = accumulator.result({ complete: parsed.reviewListExhausted === true || parsed.reviewComplete === true, total: parsed.reviewTotal || '', foldedCount: Math.max(0, Number(parsed.reviewExcludedCount) || 0), rateLimited: parsed.reviewRateLimited === true, reason: parsed.reviewListExhausted ? '' : parsed.reviewStopReason || '浏览器同步的部分评价，可继续补采' });
              update = { itemId: String(parsed.itemId), ...review, isRealReview: Boolean(review.negativeReviews), reviewSource: 'collected' };
            }
            if (typeof onDataReceived === 'function') {
              onDataReceived([update], { isSingleReviewUpdate: true });
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, supportsFullReviews: true, reviewCount: update.reviewCount || 0, message: '评价已成功同步至桌面端' }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
        return;
      }

      if ((req.url === '/push' || req.url === '/competitor-data') && req.method === 'POST') {
        req.setEncoding('utf8');
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const items = normalizeCompetitorItems(parsed);
            if (!items.length) throw new Error('未识别到有效商品，请提供非空商品标题');
            if (typeof onDataReceived === 'function') {
              onDataReceived(items);
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, count: items.length, message: '数据已成功同步至桌面端' }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    server.on('error', (err) => {
      localServerInstance = null;
      reject(err);
    });

    server.listen(port, '127.0.0.1', () => {
      localServerInstance = server;
      resolve({ status: 'running', port });
    });
  });
}

function stopLocalCompetitorReceiver() {
  if (localServerInstance) {
    localServerInstance.close();
    localServerInstance = null;
  }
  return { status: 'stopped' };
}

module.exports = {
  RICE_VARIETIES,
  PACKAGING_TYPES,
  extractRiceVariety,
  extractSpec,
  extractPackaging,
  extractShippingTime,
  formatSales,
  processPositioning,
  normalizeCompetitorItems,
  deduceRiceNegativeReviews,
  extractPriceFromText,
  generateRicePackageSvg,
  getMockTaoFactoryRiceTop20,
  startLocalCompetitorReceiver,
  stopLocalCompetitorReceiver
};

