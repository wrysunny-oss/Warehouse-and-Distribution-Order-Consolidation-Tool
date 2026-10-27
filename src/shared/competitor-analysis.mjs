// Shared by the renderer and Excel export so comparisons use the same units.
export function weightKg(spec = '') {
  const text = String(spec).toLowerCase();
  const match = text.match(/(\d+(?:\.\d+)?)\s*(kg|千克|公斤|斤|g|克)(?![a-z])/i);
  if (!match) return null;
  const factor = /^(kg|千克|公斤)$/.test(match[2]) ? 1 : match[2] === '斤' ? 0.5 : 0.001;
  const after = text.slice(match.index + match[0].length);
  const before = text.slice(0, match.index);
  const packs = after.match(/^\s*(?:[×x*]\s*|[\/／每]?(?:袋|包|瓶|箱)\s*[×x*]\s*)(\d+)\s*(?:袋|包|瓶|箱)?/) || before.match(/(\d+)\s*[×x*]\s*$/);
  const total = Number(match[1]) * factor * (packs ? Number(packs[1]) : 1);
  return total > 0 && Number.isFinite(total) ? total : null;
}

export function unitPrice(item) {
  if (item.source === 'crawler' && /未确认/.test(item.priceBasis || '')) return null;
  const kg = weightKg(item.spec);
  const price = Number(item.finalPrice);
  return kg && price > 0 && Number.isFinite(price) ? price / kg : null;
}

export function salesNumber(value) {
  const match = String(value ?? '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(亿|万|w|千|k)?/i);
  if (!match) return null;
  return Number(match[1]) * ({ 亿: 1e8, 万: 1e4, w: 1e4, 千: 1e3, k: 1e3 }[match[2]?.toLowerCase()] || 1);
}

export function linkKey(item, index = 0) {
  if (item.itemId) return String(item.itemId);
  try {
    const url = new URL(item.link);
    return url.searchParams.get('id') || `${url.origin}${url.pathname}`;
  } catch {
    return item.groupKey || `row:${index}`;
  }
}

export function reviewKind(item) {
  if (item.source === 'sample') return '示例评价';
  if (item.reviewSource === 'manual') return '人工记录';
  if ((item.isRealReview && item.negativeReviews) || (item.reviewSource === 'collected' && item.reviewCount > 0)) return '采集评价';
  return item.negativeReviews && item.negativeReviews !== '暂无评价数据' ? '待核实' : '未采集';
}

export function selectItems(items, { query = '', type = 'all', variety = 'all', review = 'all', sort = 'rank', min = '', max = '' } = {}) {
  const q = query.trim().toLowerCase();
  const selected = items.filter(item => {
    const price = Number(item.finalPrice);
    return (type === 'all' || item.remark === type)
      && (variety === 'all' || item.variety === variety)
      && (review === 'all' || (review === 'collected' ? reviewKind(item) === '采集评价' : reviewKind(item) !== '采集评价'))
      && (min === '' || (price > 0 && price >= Number(min)))
      && (max === '' || (price > 0 && price <= Number(max)))
      && (!q || [item.title, item.spec, item.variety, item.packaging, item.negativeReviews, item.itemId].join(' ').toLowerCase().includes(q));
  });
  const read = item => sort.startsWith('unit') ? unitPrice(item)
    : sort.startsWith('price') ? (Number(item.finalPrice) > 0 ? Number(item.finalPrice) : null)
    : sort === 'sales' ? salesNumber(item.sales) : Number(item.rank) || 0;
  return selected.sort((a, b) => {
    const av = read(a), bv = read(b);
    if (av == null) return bv == null ? 0 : 1;
    if (bv == null) return -1;
    return (av - bv) * (sort.endsWith('desc') || sort === 'sales' ? -1 : 1);
  });
}

export function summarize(items) {
  const prices = items.map(i => Number(i.finalPrice)).filter(p => p > 0 && Number.isFinite(p));
  const units = items.map(unitPrice).filter(p => p != null).sort((a, b) => a - b);
  const distribution = field => {
    const counts = new Map();
    for (const item of items) {
      const name = item[field] || '未识别';
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts].map(([name, count]) => ({ name, count, percent: Math.round(count / items.length * 100) })).sort((a, b) => b.count - a.count);
  };
  const topics = new Map();
  const collected = items.filter(i => reviewKind(i) === '采集评价');
  // Count products, not repeated words within one product.
  for (const item of collected) {
    for (const tag of new Set(String(item.negativeReviews || '').replace(/【[^】]*】/g, '').split(/[,，、;；|。]+/).map(t => t.trim()).filter(Boolean))) {
      topics.set(tag, (topics.get(tag) || 0) + 1);
    }
  }
  return {
    totalCount: items.length,
    uniqueLinks: new Set(items.map(linkKey)).size,
    avgPrice: prices.length ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : '—',
    minPrice: prices.length ? Math.min(...prices).toFixed(2) : '—',
    medianUnit: units.length ? ((units[Math.floor((units.length - 1) / 2)] + units[Math.floor(units.length / 2)]) / 2).toFixed(2) : '—',
    comparableCount: units.length,
    missingPrices: items.length - prices.length,
    collectedReviews: collected.length,
    negativeReviewProducts: collected.filter(item => item.isRealReview && item.negativeReviews).length,
    sampleCount: items.filter(i => i.source === 'sample').length,
    specStats: distribution('spec'), packagingStats: distribution('packaging'),
    topNegativeTopics: [...topics].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 4)
  };
}
