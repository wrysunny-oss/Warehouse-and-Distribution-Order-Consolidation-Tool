'use strict';

const TABLE1_NEW_REQUIRED = ['仓库名称', '货品名称', '品牌名称', '采购数量'];
const TABLE1_OLD_REQUIRED = ['物理仓名称', '货品名称', '品牌名称'];
const TABLE2_REQUIRED = ['货品名称', '物理仓名称', '品牌名称', '在库良品库存件数'];

const KNOWN_PRODUCTS = new Map([
  ['稻花翁臻选丝苗米2.5kg 2.5kg', [2.5, 1]],
  ['国宝桥米大米稻花翁金泰南白兰香米10kg*1袋籼米新鲜大米 10kg×1袋', [10, 1]],
  ['国宝桥米稻花翁大米油粘米5kg大米2023新米南方籼米10斤 5kg×1袋', [5, 1]],
  ['国宝桥米稻花翁东北珍珠米煮粥圆粒粳米10KG饭粥皆宜当季新米20斤', [10, 1]],
  ['国宝桥米稻花翁精选丝苗米南方籼米10KG粒粒分明当季新米20斤', [10, 1]],
  ['国宝桥米稻花翁精选丝苗米南方籼米5KG真空粒粒分明当季新米10斤', [5, 1]],
  ['国宝桥米稻花翁软香贡米25kg 25kg', [25, 1]],
  ['国宝桥米稻花翁丝苗米10kg湖北长粒大米20斤南方籼米 10kg×1袋', [10, 1]],
  ['国宝桥米稻花翁泰玉京香大米5kg籼米南方大米5kg籼米南方大米 5kg×1袋', [5, 5]],
  ['国宝桥米稻花翁珍珠香米2.5kg大米粳米东北米 2.5kg', [2.5, 1]],
  ['国宝桥米稻花翁珍珠香米东北大米煮粥圆粒粳米5KG真空包装10斤', [5, 1]]
]);
const FIXED_PRODUCTS = [...KNOWN_PRODUCTS.keys()];


function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function numberValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedProduct(value) {
  return cleanText(value).toLowerCase();
}

function dedupeProducts(rows, brand) {
  const selectedBrand = cleanText(brand);
  const seen = new Set();
  const products = [];
  for (const row of rows || []) {
    if (selectedBrand && cleanText(row['品牌名称']) !== selectedBrand) continue;
    const product = cleanText(row['货品名称']);
    const token = normalizedProduct(product);
    if (!product || seen.has(token)) continue;
    seen.add(token);
    products.push(product);
  }
  return products;
}

function productCatalogForBrand({ table1Rows = [], table2Rows = [], brand, configuredProducts = [] }) {
  const configuredRows = (configuredProducts || []).map((product) => ({ '货品名称': product }));
  const configured = dedupeProducts(configuredRows, '');
  if (configured.length) return configured;
  const fromTable1 = dedupeProducts(table1Rows, brand);
  return fromTable1.length ? fromTable1 : dedupeProducts(table2Rows, brand);
}

function table1Warehouse(row) {
  return cleanText(row['仓库名称'] || row['物理仓名称']);
}

function table1Order(row) {
  return numberValue(row.__systemOrder ?? row['采购数量']);
}

function parseSpec(productName) {
  const clean = cleanText(productName);
  const known = KNOWN_PRODUCTS.get(clean);
  if (known) return known[0];
  const matches = [...clean.matchAll(/(\d+(?:\.\d+)?)\s*(?:kg|千克|公斤)/gi)];
  if (matches.length) return numberValue(matches[matches.length - 1][1]);
  const jin = clean.match(/(\d+(?:\.\d+)?)\s*斤/i);
  return jin ? numberValue(jin[1]) / 2 : 0;
}

function parseBoxSpec(productName) {
  const clean = cleanText(productName);
  const known = KNOWN_PRODUCTS.get(clean);
  if (known) return known[1];
  const box = clean.match(/[×x*]\s*(\d+)\s*(?:袋|包|盒|瓶|罐|件)/i);
  return box ? numberValue(box[1]) : 1;
}

function orderHeader(headers) {
  if (headers.includes('采购数量')) return '采购数量';
  return headers.find((header) => /系统订单\s*$/.test(cleanText(header))) || '';
}

function validateTable(payload, type) {
  const headers = payload?.headers || [];
  if (type === 'table1') {
    const isNew = TABLE1_NEW_REQUIRED.every((name) => headers.includes(name));
    const isOld = TABLE1_OLD_REQUIRED.every((name) => headers.includes(name)) && Boolean(orderHeader(headers));
    return { valid: isNew || isOld, missing: isNew || isOld ? [] : TABLE1_NEW_REQUIRED.filter((name) => !headers.includes(name)) };
  }
  const missing = TABLE2_REQUIRED.filter((name) => !headers.includes(name));
  return { valid: missing.length === 0, missing };
}

function getBrands(table2Rows) {
  return [...new Set((table2Rows || []).map((row) => cleanText(row['品牌名称'])).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function targetToken(warehouse) {
  return cleanText(warehouse)
    .replace(/^(华东|华南|华西|华中|华北)/, '')
    .replace(/(直营)?(商超)?A?仓$/, '')
    .replace(/猫超/g, '')
    .replace(/RDC仓?$/i, '')
    .trim();
}

function suggestWarehouse(sourceWarehouse, targetWarehouses) {
  const source = cleanText(sourceWarehouse);
  if (!source) return '';
  if ((targetWarehouses || []).includes(source)) return source;
  const candidates = (targetWarehouses || [])
    .map((target) => ({ target, token: targetToken(target) }))
    .filter(({ token }) => token.length >= 2 && source.includes(token));
  return candidates.length === 1 ? candidates[0].target : '';
}

function collectMappingRows(table1Rows, brand, targets, currentMapping = {}) {
  const seen = new Map();
  for (const row of table1Rows || []) {
    if (cleanText(row['品牌名称']) !== cleanText(brand)) continue;
    const source = table1Warehouse(row);
    if (!source) continue;
    seen.set(source, (seen.get(source) || 0) + table1Order(row));
  }
  return [...seen.entries()]
    .map(([source, orders]) => ({ source, orders, target: currentMapping[source] || suggestWarehouse(source, targets) }))
    .sort((a, b) => a.source.localeCompare(b.source, 'zh-CN'));
}

function aggregate({ table2Rows = [], table1Rows = [], brand, mapping = {}, actualOrders = {}, configuredProducts = [] }) {
  const selectedBrand = cleanText(brand);
  const brandedInventoryRows = table2Rows.filter((row) => cleanText(row['品牌名称']) === selectedBrand);
  const hasWarehouseRole = brandedInventoryRows.some((row) => cleanText(row['仓角色名称']));
  const inventoryRows = hasWarehouseRole
    ? brandedInventoryRows.filter((row) => ['RDC', 'MRDC'].includes(cleanText(row['仓角色名称']).toUpperCase()))
    : brandedInventoryRows;
  const orderRows = table1Rows.filter((row) => cleanText(row['品牌名称']) === selectedBrand);
  const hasOrderLimit = orderRows.length > 0;
  const warehouses = [...new Set(inventoryRows.map((row) => cleanText(row['物理仓名称'])).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const products = productCatalogForBrand({ table1Rows, table2Rows, brand: selectedBrand, configuredProducts });

  const inventory = new Map();
  for (const source of inventoryRows) {
    const warehouse = cleanText(source['物理仓名称']);
    const product = cleanText(source['货品名称']);
    const key = `${warehouse}\u0000${normalizedProduct(product)}`;
    if (!inventory.has(key)) inventory.set(key, []);
    inventory.get(key).push(source);
  }

  const unresolved = new Map();
  const outputGroups = new Map();

  if (orderRows.length) {
    const productCatalog = new Map(products.map((product) => [normalizedProduct(product), { product, boxSpec: Math.max(1, parseBoxSpec(product)) }]));
    const warehouseTargets = new Map();
    const orderTotals = new Map();
    for (const source of orderRows) {
      const sourceWarehouse = table1Warehouse(source);
      const product = cleanText(source['货品名称']);
      if (!sourceWarehouse || !product) continue;
      const productToken = normalizedProduct(product);
      const amount = table1Order(source);
      const targetWarehouse = mapping[sourceWarehouse] || suggestWarehouse(sourceWarehouse, warehouses);
      if (!targetWarehouse) {
        if (amount) unresolved.set(sourceWarehouse, (unresolved.get(sourceWarehouse) || 0) + amount);
        continue;
      }
      warehouseTargets.set(sourceWarehouse, targetWarehouse);
      const catalogItem = productCatalog.get(productToken);
      if (!catalogItem) continue;
      const sourceBoxSpec = numberValue(source['箱规']);
      if (sourceBoxSpec > 0) catalogItem.boxSpec = Math.max(1, sourceBoxSpec);
      const orderKey = `${sourceWarehouse}\u0000${productToken}`;
      orderTotals.set(orderKey, (orderTotals.get(orderKey) || 0) + amount);
    }

    const catalog = products.map((product) => [normalizedProduct(product), productCatalog.get(normalizedProduct(product))]);
    for (const [sourceWarehouse, targetWarehouse] of [...warehouseTargets].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))) {
      outputGroups.set(sourceWarehouse, catalog.map(([productToken, item]) => ({
        id: `${sourceWarehouse}\u0000${productToken}`,
        warehouse: sourceWarehouse,
        inventoryWarehouse: targetWarehouse,
        product: item.product,
        systemOrder: orderTotals.get(`${sourceWarehouse}\u0000${productToken}`) || 0,
        boxSpec: item.boxSpec
      })));
    }
  } else {
    for (const warehouse of warehouses) {
      outputGroups.set(warehouse, products.map((product) => ({
        id: `${warehouse}\u0000${normalizedProduct(product)}`,
        warehouse,
        inventoryWarehouse: warehouse,
        product,
        systemOrder: 0,
        boxSpec: Math.max(1, parseBoxSpec(product))
      })));
    }
  }

  const outputWarehouses = [...outputGroups.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const rows = [];
  const summaries = [];
  for (const warehouse of outputWarehouses) {
    const warehouseRows = [];
    for (const descriptor of outputGroups.get(warehouse) || []) {
      const { id, inventoryWarehouse, product, systemOrder, boxSpec } = descriptor;
      const inventoryKey = `${inventoryWarehouse}\u0000${normalizedProduct(product)}`;
      const sources = inventory.get(inventoryKey) || [];
      const first = sources[0] || {};
      const sum = (field) => sources.reduce((total, row) => total + numberValue(row[field]), 0);
      const spec = parseSpec(product);
      const availableGood = sum('在库良品库存件数');
      const nonLocked = sum('在库良品非锁定库存件数');
      const out1 = sum('最近1天出库件数');
      const out7 = sum('最近7天出库件数');
      const out14 = sum('最近14天出库件数');
      const out30 = sum('最近30天出库件数');
      const forecast30 = out30 * 0.5 + (out7 / 7 * 30) * 0.3 + (out1 * 30) * 0.2;
      const targetStock = forecast30 * 0.8;
      const replenishmentNeed = Math.max(0, targetStock - availableGood);
      const roundedNeed = replenishmentNeed > 0 ? Math.ceil(replenishmentNeed / boxSpec) * boxSpec : 0;
      const orderCapacity = Math.floor(systemOrder / boxSpec) * boxSpec;
      const suggestedActual = hasOrderLimit ? Math.min(orderCapacity, roundedNeed) : roundedNeed;
      const hasOverride = Object.prototype.hasOwnProperty.call(actualOrders, id);
      const overridden = Math.floor(Math.max(0, numberValue(actualOrders[id])) / boxSpec) * boxSpec;
      const actualOrder = hasOverride ? (hasOrderLimit ? Math.min(orderCapacity, overridden) : overridden) : suggestedActual;
      const manualRequest = hasOrderLimit ? (systemOrder === 0 ? roundedNeed : Math.max(0, roundedNeed - orderCapacity)) : 0;
      const row = {
        id,
        warehouse,
        product,
        brand: selectedBrand,
        status: sources.length ? cleanText(first['货品状态']) || '正常' : '未入仓',
        spec,
        boxSpec,
        aged: sum('高库龄件数'),
        turnover: sum('高周转件数'),
        availableGood,
        nonLocked,
        out1,
        out7,
        out14,
        out30,
        forecast30,
        targetStock,
        replenishmentNeed,
        roundedNeed,
        systemOrder,
        hasOrderLimit,
        weight: systemOrder * spec / 1000,
        suggestedActual,
        actualOrder,
        actualWeight: actualOrder * spec / 1000,
        manualRequest,
        arrangement: ''
      };
      warehouseRows.push(row);
      rows.push(row);
    }

    const summaryActual = warehouseRows.reduce((sum, row) => sum + row.actualOrder, 0);
    summaries.push({
      warehouse,
      systemOrder: warehouseRows.reduce((sum, row) => sum + row.systemOrder, 0),
      weight: warehouseRows.reduce((sum, row) => sum + row.weight, 0),
      actualOrder: summaryActual,
      actualWeight: warehouseRows.reduce((sum, row) => sum + row.actualWeight, 0),
      arrangement: ''
    });
  }
  return {
    rows,
    summaries,
    warehouses: outputWarehouses,
    products,
    unresolved: [...unresolved.entries()].map(([warehouse, ordersValue]) => ({ warehouse, orders: ordersValue })),
    stats: {
      detailRows: rows.length,
      warehouseCount: outputWarehouses.length,
      productCount: products.length,
      systemOrders: rows.reduce((sum, row) => sum + row.systemOrder, 0),
      weight: rows.reduce((sum, row) => sum + row.weight, 0),
      actualOrders: rows.reduce((sum, row) => sum + row.actualOrder, 0),
      manualRequestRows: rows.filter((row) => row.systemOrder === 0 && row.roundedNeed > 0).length,
      manualRequestQuantity: rows.filter((row) => row.systemOrder === 0).reduce((sum, row) => sum + row.manualRequest, 0),
      insufficientQuantity: rows.filter((row) => row.systemOrder > 0).reduce((sum, row) => sum + row.manualRequest, 0),
      unresolvedOrders: [...unresolved.values()].reduce((sum, value) => sum + value, 0)
    }
  };
}

module.exports = {
  TABLE1_NEW_REQUIRED, TABLE1_OLD_REQUIRED, TABLE2_REQUIRED, FIXED_PRODUCTS, cleanText, numberValue, parseSpec, parseBoxSpec,
  orderHeader, validateTable, getBrands, suggestWarehouse, collectMappingRows, productCatalogForBrand, aggregate
};
