'use strict';

const state = {
  table1: null,
  table2: null,
  brand: '',
  mapping: loadJson('warehouseMapping', {}),
  productCatalogs: loadJson('summaryProductCatalogs', {}),
  actualOrders: {},
  warehouseStatus: {},
  result: null,
  mappingRows: [],
  mappingDraft: {},
  workflow: 'summary',
  delivery: {
    product: null,
    receipt: null,
    analysis: null,
    selectedBrands: new Set(),
    selectedWarehouses: new Set(),
    selectedProducts: new Set(),
    productionDates: {},
    supplierName: localStorage.getItem('deliverySupplierName') || '湖北国宝桥米有限公司',
    shelfLife: '360',
    contact: '17771571056',
    splitByWarehouse: false
  }
};

const el = (id) => document.getElementById(id);
const refs = {
  summaryTab: el('summaryTab'), deliveryTab: el('deliveryTab'), summaryView: el('summaryView'), deliveryView: el('deliveryView'),
  summaryTopActions: el('summaryTopActions'), deliveryTopActions: el('deliveryTopActions'),
  table1Btn: el('table1Btn'), table2Btn: el('table2Btn'), exportBtn: el('exportBtn'),
  table1Meta: el('table1Meta'), table2Meta: el('table2Meta'), table1Slot: el('table1Slot'), table2Slot: el('table2Slot'),
  brandSelect: el('brandSelect'), mappingBtn: el('mappingBtn'), mappingCount: el('mappingCount'), modeBadge: el('modeBadge'),
  productCatalogBtn: el('productCatalogBtn'), productCatalogCount: el('productCatalogCount'),
  notice: el('notice'), emptyState: el('emptyState'), tableWrap: el('tableWrap'), resultBody: el('resultBody'), searchInput: el('searchInput'),
  warehouseMetric: el('warehouseMetric'), productMetric: el('productMetric'), rowMetric: el('rowMetric'), orderMetric: el('orderMetric'), weightMetric: el('weightMetric'),
  mappingDialog: el('mappingDialog'), mappingList: el('mappingList'), mappingSearch: el('mappingSearch'), mappingSummary: el('mappingSummary'), saveMappingBtn: el('saveMappingBtn'),
  productCatalogDialog: el('productCatalogDialog'), productCatalogBrand: el('productCatalogBrand'), productCatalogTextarea: el('productCatalogTextarea'),
  productCatalogStatus: el('productCatalogStatus'), saveProductCatalogBtn: el('saveProductCatalogBtn'), restoreProductCatalogBtn: el('restoreProductCatalogBtn'),
  productBtn: el('productBtn'), receiptBtn: el('receiptBtn'), productMeta: el('productMeta'), receiptMeta: el('receiptMeta'), productSlot: el('productSlot'), receiptSlot: el('receiptSlot'),
  deliveryNotice: el('deliveryNotice'), deliveryBrands: el('deliveryBrands'), deliveryWarehouses: el('deliveryWarehouses'), deliverySourceSummary: el('deliverySourceSummary'),
  supplierNameInput: el('supplierNameInput'), shelfLifeInput: el('shelfLifeInput'), contactInput: el('contactInput'), splitByWarehouseInput: el('splitByWarehouseInput'),
  deliveryProductSearch: el('deliveryProductSearch'), productSuggestions: el('productSuggestions'), deliveryProductList: el('deliveryProductList'),
  selectVisibleProductsBtn: el('selectVisibleProductsBtn'), clearProductSelectionBtn: el('clearProductSelectionBtn'),
  productionDateInput: el('productionDateInput'), applyProductionDateBtn: el('applyProductionDateBtn'), datedProductCount: el('datedProductCount'),
  deliveryMetrics: el('deliveryMetrics'), deliveryExportHint: el('deliveryExportHint'), deliveryReadiness: el('deliveryReadiness'), deliveryModeBadge: el('deliveryModeBadge'),
  generateDeliveryBtn: el('generateDeliveryBtn'), toast: el('toast')
};

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeProductNames(values) {
  const seen = new Set();
  const products = [];
  for (const value of values || []) {
    const product = String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const token = product.toLowerCase();
    if (!product || seen.has(token)) continue;
    seen.add(token);
    products.push(product);
  }
  return products;
}

function defaultSummaryProducts() {
  const fromTable1 = normalizeProductNames((state.table1?.rows || [])
    .filter((row) => String(row['品牌名称'] ?? '').trim() === state.brand)
    .map((row) => row['货品名称']));
  if (fromTable1.length) return fromTable1;
  return normalizeProductNames((state.table2?.rows || [])
    .filter((row) => String(row['品牌名称'] ?? '').trim() === state.brand)
    .map((row) => row['货品名称']));
}

function activeSummaryProducts() {
  const configured = state.productCatalogs[state.brand];
  return Array.isArray(configured) && configured.length ? normalizeProductNames(configured) : defaultSummaryProducts();
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value) || 0);
}

function showToast(message) {
  refs.toast.textContent = message;
  refs.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => refs.toast.classList.remove('show'), 3000);
}

function showNotice(message, type = 'warning') {
  refs.notice.textContent = message;
  refs.notice.classList.remove('hidden', 'error');
  if (type === 'error') refs.notice.classList.add('error');
}

function clearNotice() {
  refs.notice.classList.add('hidden');
  refs.notice.textContent = '';
}

function showDeliveryNotice(message, type = 'warning') {
  refs.deliveryNotice.textContent = message;
  refs.deliveryNotice.classList.remove('hidden', 'error', 'success');
  if (type !== 'warning') refs.deliveryNotice.classList.add(type);
}

function clearDeliveryNotice() {
  refs.deliveryNotice.classList.add('hidden');
  refs.deliveryNotice.textContent = '';
}

function switchWorkflow(workflow) {
  state.workflow = workflow;
  const isSummary = workflow === 'summary';
  refs.summaryTab.classList.toggle('active', isSummary);
  refs.deliveryTab.classList.toggle('active', !isSummary);
  refs.summaryTab.toggleAttribute('aria-current', isSummary);
  refs.deliveryTab.toggleAttribute('aria-current', !isSummary);
  refs.summaryView.classList.toggle('hidden', !isSummary);
  refs.deliveryView.classList.toggle('hidden', isSummary);
  refs.summaryTopActions.classList.toggle('hidden', !isSummary);
  refs.deliveryTopActions.classList.toggle('hidden', isSummary);
}

async function importFile(type) {
  const button = type === 'table1' ? refs.table1Btn : refs.table2Btn;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '正在读取';
  clearNotice();
  try {
    const payload = await window.excelTool.openExcel(type);
    if (!payload) return;
    state[type] = payload;
    const slot = type === 'table1' ? refs.table1Slot : refs.table2Slot;
    const meta = type === 'table1' ? refs.table1Meta : refs.table2Meta;
    slot.classList.add('loaded');
    meta.textContent = `${payload.fileName} · ${payload.sheetName} · ${payload.rows.length} 行`;
    button.textContent = '重新选择';
    if (type === 'table2') await refreshBrands();
    else if (state.table2) await rebuild();
    updateMode();
    showToast(`${type === 'table1' ? '表一' : '表二'}导入成功`);
  } catch (error) {
    showNotice(error.message || '文件读取失败，请检查 Excel 格式。', 'error');
  } finally {
    button.disabled = false;
    if (button.textContent === '正在读取') button.textContent = original;
  }
}

async function refreshBrands() {
  const analyzed = await window.excelTool.analyze({ table2Rows: state.table2.rows, brand: state.brand });
  const previous = state.brand;
  refs.brandSelect.replaceChildren();
  analyzed.brands.forEach((brand) => {
    const option = document.createElement('option');
    option.value = brand;
    option.textContent = brand;
    refs.brandSelect.append(option);
  });
  state.brand = analyzed.brands.includes(previous) ? previous : (analyzed.brands.includes('稻花翁') ? '稻花翁' : analyzed.brands[0] || '');
  refs.brandSelect.value = state.brand;
  refs.brandSelect.disabled = !state.brand;
  state.actualOrders = {};
  state.warehouseStatus = {};
  await rebuild();
}

async function analyzeMapping() {
  if (!state.table1 || !state.table2 || !state.brand) {
    state.mappingRows = [];
    return;
  }
  const analyzed = await window.excelTool.analyze({
    table1Rows: state.table1.rows,
    table2Rows: state.table2.rows,
    brand: state.brand,
    mapping: state.mapping
  });
  state.mappingRows = analyzed.mappingRows;
  for (const row of state.mappingRows) {
    if (!state.mapping[row.source] && row.target) state.mapping[row.source] = row.target;
  }
}

async function rebuild() {
  if (!state.table2 || !state.brand) return renderEmpty();
  clearNotice();
  await analyzeMapping();
  state.result = await window.excelTool.compute({
    table2Rows: state.table2.rows,
    table1Rows: state.table1?.rows || [],
    brand: state.brand,
    mapping: state.mapping,
    actualOrders: state.actualOrders,
    warehouseStatus: state.warehouseStatus,
    configuredProducts: state.productCatalogs[state.brand] || []
  });
  renderMetrics();
  renderTable();
  updateMode();
  const unresolvedCount = state.mappingRows.filter((row) => row.orders && !state.mapping[row.source]).length;
  refs.mappingCount.textContent = state.table1 ? `(${unresolvedCount} 待处理)` : '';
  refs.mappingBtn.disabled = !state.table1;
  refs.productCatalogBtn.disabled = !state.brand;
  refs.productCatalogCount.textContent = state.brand ? `(${activeSummaryProducts().length})` : '';
  refs.exportBtn.disabled = !state.result.rows.length;
  refs.searchInput.disabled = false;
  const notices = [];
  if (state.result.stats.unresolvedOrders > 0) notices.push(`还有 ${unresolvedCount} 个有订单的仓库未映射，共 ${formatNumber(state.result.stats.unresolvedOrders)} 件订单暂未计入表三。`);
  if (notices.length) showNotice(notices.join(' '));
}

function updateMode() {
  if (!state.table2) {
    refs.modeBadge.textContent = '等待导入表二';
    return;
  }
  if (state.table1) {
    const unresolved = state.mappingRows.filter((row) => row.orders && !state.mapping[row.source]).length;
    refs.modeBadge.textContent = unresolved ? `完整模式 · ${unresolved} 个映射待处理` : '完整订单模式';
  } else {
    refs.modeBadge.textContent = '库存模式';
  }
}

function renderEmpty() {
  state.result = null;
  refs.emptyState.classList.remove('hidden');
  refs.tableWrap.classList.add('hidden');
  refs.exportBtn.disabled = true;
  refs.searchInput.disabled = true;
  refs.productCatalogBtn.disabled = true;
  refs.productCatalogCount.textContent = '';
  ['warehouseMetric', 'productMetric', 'rowMetric', 'orderMetric'].forEach((key) => { refs[key].textContent = '0'; });
  refs.weightMetric.textContent = '0.000';
}

function renderMetrics() {
  const stats = state.result.stats;
  refs.warehouseMetric.textContent = formatNumber(stats.warehouseCount);
  refs.productMetric.textContent = formatNumber(stats.productCount);
  refs.rowMetric.textContent = formatNumber(stats.detailRows);
  refs.orderMetric.textContent = formatNumber(stats.systemOrders);
  refs.weightMetric.textContent = formatNumber(stats.weight, 3);
}

function td(text, className = '') {
  const cell = document.createElement('td');
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

function renderTable() {
  const query = refs.searchInput.value.trim().toLowerCase();
  refs.resultBody.replaceChildren();
  refs.emptyState.classList.add('hidden');
  refs.tableWrap.classList.remove('hidden');
  const fragment = document.createDocumentFragment();
  let rendered = 0;

  state.result.summaries.forEach((summary) => {
    const groupRows = state.result.rows.filter((row) => row.warehouse === summary.warehouse && (!query || row.warehouse.toLowerCase().includes(query) || row.product.toLowerCase().includes(query)));
    if (!groupRows.length) return;
    groupRows.forEach((row) => {
      const index = state.result.rows.indexOf(row);
      const tr = document.createElement('tr');
      tr.append(td(row.warehouse, 'col-warehouse'));
      tr.append(td(row.product, 'col-product'));
      tr.append(td(row.status));
      ['spec', 'boxSpec', 'aged', 'turnover', 'availableGood', 'nonLocked', 'out1', 'out7', 'out14', 'out30', 'systemOrder'].forEach((key) => tr.append(td(formatNumber(row[key], Number.isInteger(row[key]) ? 0 : 2))));
      tr.append(td(formatNumber(row.weight, 4)));
      const actualCell = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number'; input.min = '0'; input.step = String(row.boxSpec); input.value = row.actualOrder || '';
      if (row.hasOrderLimit) input.max = String(row.systemOrder);
      input.disabled = row.hasOrderLimit && row.systemOrder === 0;
      input.title = `系统建议 ${formatNumber(row.suggestedActual)} 件，箱规 ${formatNumber(row.boxSpec)}`;
      input.className = 'cell-input'; input.dataset.index = index; input.setAttribute('aria-label', `${row.warehouse} ${row.product} 实际订单安排`);
      input.addEventListener('change', async (event) => {
        const current = state.result.rows[Number(event.target.dataset.index)];
        state.actualOrders[current.id] = Math.max(0, Number(event.target.value) || 0);
        await rebuild();
      });
      actualCell.append(input); tr.append(actualCell);
      tr.append(td(formatNumber(row.actualWeight, 4)));
      tr.append(td(row.arrangement));
      fragment.append(tr); rendered += 1;
    });

    const subtotal = state.result.summaries.find((item) => item.warehouse === summary.warehouse);
    const tr = document.createElement('tr'); tr.className = 'subtotal';
    tr.append(td(`${summary.warehouse} 汇总`, 'col-warehouse'));
    tr.append(td('', 'col-product'));
    for (let i = 0; i < 11; i += 1) tr.append(td(''));
    tr.append(td(formatNumber(subtotal.systemOrder)));
    tr.append(td(formatNumber(subtotal.weight, 4)));
    tr.append(td(formatNumber(subtotal.actualOrder)));
    tr.append(td(formatNumber(subtotal.actualWeight, 4)));
    tr.append(td(subtotal.arrangement));
    fragment.append(tr);
  });
  refs.resultBody.append(fragment);
  if (!rendered) {
    const tr = document.createElement('tr'); const cell = td('没有符合筛选条件的数据'); cell.colSpan = 18; cell.style.textAlign = 'center'; cell.style.height = '120px'; tr.append(cell); refs.resultBody.append(tr);
  }
}

function openMappingDialog() {
  state.mappingDraft = { ...state.mapping };
  refs.mappingSearch.value = '';
  renderMappingList();
  refs.mappingDialog.showModal();
}

function renderMappingList() {
  const query = refs.mappingSearch.value.trim().toLowerCase();
  refs.mappingList.replaceChildren();
  const fragment = document.createDocumentFragment();
  const rows = state.mappingRows.filter((row) => !query || row.source.toLowerCase().includes(query));
  const targetWarehouses = state.result?.warehouses || [];
  rows.forEach((row) => {
    const line = document.createElement('div'); line.className = `mapping-row${state.mappingDraft[row.source] ? '' : ' unresolved'}`;
    const source = document.createElement('div'); source.className = 'mapping-source'; source.textContent = row.source; source.title = row.source;
    const orders = document.createElement('div'); orders.className = 'mapping-orders'; orders.textContent = `${formatNumber(row.orders)} 件`;
    const select = document.createElement('select'); select.dataset.source = row.source;
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = '请选择直营仓'; select.append(empty);
    targetWarehouses.forEach((warehouse) => { const option = document.createElement('option'); option.value = warehouse; option.textContent = warehouse; select.append(option); });
    select.value = state.mappingDraft[row.source] || '';
    select.addEventListener('change', (event) => { state.mappingDraft[event.target.dataset.source] = event.target.value; renderMappingList(); });
    line.append(source, orders, select); fragment.append(line);
  });
  refs.mappingList.append(fragment);
  const unresolved = state.mappingRows.filter((row) => row.orders && !state.mappingDraft[row.source]).length;
  refs.mappingSummary.textContent = `${state.mappingRows.length} 个前置仓，${unresolved} 个有订单的仓库待处理`;
}

async function saveMapping() {
  state.mapping = { ...state.mappingDraft };
  saveJson('warehouseMapping', state.mapping);
  refs.mappingDialog.close();
  await rebuild();
  showToast('仓库映射已保存');
}

function openProductCatalogDialog() {
  const products = activeSummaryProducts();
  const isCustom = Array.isArray(state.productCatalogs[state.brand]) && state.productCatalogs[state.brand].length > 0;
  refs.productCatalogBrand.textContent = state.brand;
  refs.productCatalogTextarea.value = products.join('\n');
  refs.productCatalogStatus.textContent = `${products.length} 个商品 · ${isCustom ? '当前使用自定义配置' : `默认来自${state.table1 ? '表一' : '表二'}`}`;
  refs.productCatalogDialog.showModal();
  refs.productCatalogTextarea.focus();
}

async function saveProductCatalog() {
  const products = normalizeProductNames(refs.productCatalogTextarea.value.split(/\r?\n/));
  if (!products.length) {
    refs.productCatalogStatus.textContent = '至少保留一个商品；如需重置，请点击“恢复默认”。';
    return;
  }
  state.productCatalogs[state.brand] = products;
  saveJson('summaryProductCatalogs', state.productCatalogs);
  state.actualOrders = {};
  state.warehouseStatus = {};
  refs.productCatalogDialog.close();
  await rebuild();
  showToast(`已保存 ${state.brand} 的商品清单`);
}

async function restoreProductCatalog() {
  delete state.productCatalogs[state.brand];
  saveJson('summaryProductCatalogs', state.productCatalogs);
  state.actualOrders = {};
  state.warehouseStatus = {};
  refs.productCatalogDialog.close();
  await rebuild();
  showToast(`已恢复 ${state.brand} 的默认商品清单`);
}

async function exportResult() {
  if (!state.result) return;
  refs.exportBtn.disabled = true;
  refs.exportBtn.textContent = '正在导出';
  try {
    const filePath = await window.excelTool.exportExcel({
      ...state.result,
      brand: state.brand,
      orderHeader: state.table1?.resultOrderHeader || '系统订单'
    });
    if (filePath) showToast(`已导出：${filePath}`);
  } catch (error) {
    showNotice(error.message || '导出失败，请检查文件是否被占用。', 'error');
  } finally {
    refs.exportBtn.disabled = false;
    refs.exportBtn.textContent = '导出表三';
  }
}

async function importDeliveryFile(type) {
  const isProduct = type === 'product';
  const button = isProduct ? refs.productBtn : refs.receiptBtn;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '正在读取';
  clearDeliveryNotice();
  try {
    const payload = await window.excelTool.openDeliveryExcel(type);
    if (!payload) return;
    state.delivery[type] = payload;
    state.delivery.analysis = null;
    state.delivery.selectedProducts.clear();
    state.delivery.selectedWarehouses.clear();
    state.delivery.productionDates = {};
    const slot = isProduct ? refs.productSlot : refs.receiptSlot;
    const meta = isProduct ? refs.productMeta : refs.receiptMeta;
    slot.classList.add('loaded');
    meta.textContent = `${payload.fileName} · ${payload.sheetName} · ${payload.rows.length} 行`;
    button.textContent = '重新选择';
    if (state.delivery.product && state.delivery.receipt) await analyzeDelivery();
    else renderDeliveryState();
    showToast(`${isProduct ? 'product 商品表' : 'ReceiptNote'}导入成功`);
  } catch (error) {
    showDeliveryNotice(error.message || '文件读取失败，请检查 Excel 格式。', 'error');
  } finally {
    button.disabled = false;
    if (button.textContent === '正在读取') button.textContent = original;
  }
}

async function analyzeDelivery() {
  clearDeliveryNotice();
  const analysis = await window.excelTool.analyzeDelivery({
    productRows: state.delivery.product.rows,
    receiptRows: state.delivery.receipt.rows
  });
  state.delivery.analysis = analysis;
  state.delivery.selectedBrands = new Set(analysis.brands.filter((item) => item.rowCount > 0).map((item) => item.name));
  state.delivery.selectedWarehouses = new Set(analysis.warehouses.filter((item) => item.rowCount > 0).map((item) => item.name));
  renderDeliveryState();
  refreshDeliveryDataNotice();
}

function availableDeliveryWarehouses() {
  if (!state.delivery.analysis) return [];
  return state.delivery.analysis.warehouses.filter((warehouse) =>
    warehouse.brands.some((item) => state.delivery.selectedBrands.has(item.name))
  );
}

function selectedDeliveryProducts() {
  if (!state.delivery.analysis) return [];
  return state.delivery.analysis.products.filter((product) =>
    state.delivery.selectedBrands.has(product.brand) &&
    product.warehouses.some((warehouse) => state.delivery.selectedWarehouses.has(warehouse))
  );
}

function visibleDeliveryProducts() {
  const query = refs.deliveryProductSearch.value.trim().toLowerCase();
  return selectedDeliveryProducts().filter((product) => !query || product.name.toLowerCase().includes(query) || product.barcode.toLowerCase().includes(query) || product.brand.toLowerCase().includes(query));
}

function renderDeliveryBrands() {
  refs.deliveryBrands.replaceChildren();
  if (!state.delivery.analysis) {
    const empty = document.createElement('span'); empty.className = 'muted-copy'; empty.textContent = '导入两份文件后显示品牌'; refs.deliveryBrands.append(empty); return;
  }
  const fragment = document.createDocumentFragment();
  state.delivery.analysis.brands.forEach((brand) => {
    const label = document.createElement('label'); label.className = 'brand-option';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = state.delivery.selectedBrands.has(brand.name); input.disabled = brand.rowCount === 0;
    input.addEventListener('change', () => {
      if (input.checked) state.delivery.selectedBrands.add(brand.name); else state.delivery.selectedBrands.delete(brand.name);
      if (input.checked) {
        state.delivery.analysis.warehouses.filter((warehouse) => warehouse.brands.some((item) => item.name === brand.name)).forEach((warehouse) => state.delivery.selectedWarehouses.add(warehouse.name));
      } else {
        const availableNames = new Set(availableDeliveryWarehouses().map((warehouse) => warehouse.name));
        for (const warehouse of [...state.delivery.selectedWarehouses]) if (!availableNames.has(warehouse)) state.delivery.selectedWarehouses.delete(warehouse);
      }
      const availableProductKeys = new Set(selectedDeliveryProducts().map((product) => product.key));
      for (const key of [...state.delivery.selectedProducts]) if (!availableProductKeys.has(key)) state.delivery.selectedProducts.delete(key);
      renderDeliveryState();
      refreshDeliveryDataNotice();
    });
    const name = document.createElement('span'); name.textContent = brand.name;
    const count = document.createElement('small'); count.textContent = `${brand.rowCount} 条`;
    label.append(input, name, count); fragment.append(label);
  });
  refs.deliveryBrands.append(fragment);
}

function renderDeliveryWarehouses() {
  refs.deliveryWarehouses.replaceChildren();
  if (!state.delivery.analysis) {
    const empty = document.createElement('span'); empty.className = 'muted-copy'; empty.textContent = '导入两份文件后显示仓库'; refs.deliveryWarehouses.append(empty); return;
  }
  const warehouses = availableDeliveryWarehouses();
  const fragment = document.createDocumentFragment();
  warehouses.forEach((warehouse) => {
    const label = document.createElement('label'); label.className = 'brand-option';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = state.delivery.selectedWarehouses.has(warehouse.name);
    input.addEventListener('change', () => {
      if (input.checked) state.delivery.selectedWarehouses.add(warehouse.name); else state.delivery.selectedWarehouses.delete(warehouse.name);
      const availableProductKeys = new Set(selectedDeliveryProducts().map((product) => product.key));
      for (const key of [...state.delivery.selectedProducts]) if (!availableProductKeys.has(key)) state.delivery.selectedProducts.delete(key);
      renderDeliveryState();
      refreshDeliveryDataNotice();
    });
    const name = document.createElement('span'); name.textContent = warehouse.name;
    const count = document.createElement('small');
    count.textContent = warehouse.brands.filter((item) => state.delivery.selectedBrands.has(item.name)).reduce((sum, item) => sum + item.rowCount, 0) + ' 条';
    label.append(input, name, count); fragment.append(label);
  });
  refs.deliveryWarehouses.append(fragment);
}


function renderProductSuggestions() {
  refs.productSuggestions.replaceChildren();
  const fragment = document.createDocumentFragment();
  selectedDeliveryProducts().forEach((product) => {
    const option = document.createElement('option');
    option.value = product.name;
    option.label = `${product.brand} · ${product.barcode}`;
    fragment.append(option);
  });
  refs.productSuggestions.append(fragment);
}

function renderDeliveryProducts() {
  refs.deliveryProductList.replaceChildren();
  const products = visibleDeliveryProducts();
  if (!state.delivery.analysis) {
    const empty = document.createElement('div'); empty.className = 'product-list-empty'; empty.textContent = '导入两份源文件后，在这里配置生产日期。'; refs.deliveryProductList.append(empty); return;
  }
  if (!products.length) {
    const empty = document.createElement('div'); empty.className = 'product-list-empty'; empty.textContent = selectedDeliveryProducts().length ? '没有符合搜索条件的商品。' : '请选择至少一个有明细的品牌。'; refs.deliveryProductList.append(empty); return;
  }
  const fragment = document.createDocumentFragment();
  products.forEach((product) => {
    const row = document.createElement('div'); row.className = `product-row${state.delivery.selectedProducts.has(product.key) ? ' selected' : ''}`;
    const checkWrap = document.createElement('label'); checkWrap.className = 'product-check';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = state.delivery.selectedProducts.has(product.key); checkbox.setAttribute('aria-label', `选择 ${product.name}`);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.delivery.selectedProducts.add(product.key); else state.delivery.selectedProducts.delete(product.key);
      row.classList.toggle('selected', checkbox.checked);
      updateDeliveryControls();
    });
    checkWrap.append(checkbox);
    const brand = document.createElement('span'); brand.className = 'product-brand'; brand.textContent = product.brand;
    const name = document.createElement('span'); name.className = 'product-name'; name.textContent = product.name; name.title = product.name;
    const code = document.createElement('span'); code.className = 'product-code'; code.textContent = product.barcode;
    const date = document.createElement('span'); date.className = `date-status${state.delivery.productionDates[product.key] ? ' complete' : ''}`; date.textContent = state.delivery.productionDates[product.key] || '选填';
    row.append(checkWrap, brand, name, code, date); fragment.append(row);
  });
  refs.deliveryProductList.append(fragment);
}

function deliveryStatus() {
  const products = selectedDeliveryProducts();
  const dated = products.filter((product) => state.delivery.productionDates[product.key]).length;
  const brands = state.delivery.selectedBrands.size;
  const selectedBrands = [...state.delivery.selectedBrands];
  const selectedWarehouses = [...state.delivery.selectedWarehouses];
  const analysis = state.delivery.analysis;
  const warehouseItems = analysis?.warehouses.filter((warehouse) => state.delivery.selectedWarehouses.has(warehouse.name)) || [];
  const rows = warehouseItems.reduce((sum, warehouse) => sum + warehouse.brands.filter((item) => state.delivery.selectedBrands.has(item.name)).reduce((brandSum, item) => brandSum + item.rowCount, 0), 0);
  const shelfLife = Number(refs.shelfLifeInput.value);
  const configReady = refs.supplierNameInput.value.trim() && Number.isInteger(shelfLife) && shelfLife > 0 && refs.contactInput.value.trim();
  const sourceReady = Boolean(state.delivery.product && state.delivery.receipt && analysis);
  const unmatched = analysis?.unmatched.filter((item) => selectedBrands.includes(item.brand) && selectedWarehouses.includes(item.warehouse)) || [];
  const selectedProductBarcodes = new Set(products.flatMap((product) => product.barcodes));
  const conflicts = analysis?.barcodeConflicts.filter((item) => selectedProductBarcodes.has(item.barcode) && (item.brands || []).some((brand) => selectedBrands.includes(brand))) || [];
  const dataIssues = analysis?.dataIssues.filter((item) => selectedBrands.includes(item.brand) && selectedWarehouses.includes(item.warehouse)) || [];
  const fractionalBoxes = analysis?.fractionalRows.filter((item) => selectedBrands.includes(item.brand) && selectedWarehouses.includes(item.warehouse)).length || 0;
  const dataClean = unmatched.length === 0 && conflicts.length === 0 && dataIssues.length === 0;
  const ready = sourceReady && brands > 0 && selectedWarehouses.length > 0 && products.length > 0 && configReady && dataClean;
  return { products, dated, brands, warehouseCount: selectedWarehouses.length, rows, sourceReady, dataClean, ready, unmatched, conflicts, dataIssues, fractionalBoxes };
}


function refreshDeliveryDataNotice() {
  if (!state.delivery.analysis) return clearDeliveryNotice();
  const status = deliveryStatus();
  const warnings = [];
  if (status.unmatched.length) warnings.push(`${status.unmatched.length} 条 ReceiptNote 商品无法通过条码匹配 product。`);
  if (status.conflicts.length) warnings.push(`${status.conflicts.length} 个条码在 product 中对应多个商品。`);
  if (status.dataIssues.length) warnings.push(`${status.dataIssues.length} 条 ReceiptNote 明细的箱规或实际发货数量无效。`);
  if (warnings.length) showDeliveryNotice(warnings.join(' '), 'error');
  else clearDeliveryNotice();
}

function updateDeliveryControls() {
  const status = deliveryStatus();
  const outputDescription = refs.splitByWarehouseInput.checked ? '按仓库分别生成 Excel' : '按品牌生成多工作表 Excel';
  refs.deliveryProductSearch.disabled = !state.delivery.analysis;
  refs.selectVisibleProductsBtn.disabled = !visibleDeliveryProducts().length;
  refs.clearProductSelectionBtn.disabled = !state.delivery.selectedProducts.size;
  refs.productionDateInput.disabled = !state.delivery.analysis;
  refs.applyProductionDateBtn.disabled = !state.delivery.selectedProducts.size;
  refs.generateDeliveryBtn.disabled = !status.ready;
  refs.datedProductCount.textContent = `${status.dated} / ${status.products.length}`;
  refs.deliveryMetrics.innerHTML = `<span><strong>${status.brands}</strong> 个品牌</span><span><strong>${status.warehouseCount}</strong> 个仓库</span><span><strong>${status.rows}</strong> 条明细</span><span><strong>${status.fractionalBoxes}</strong> 个小数箱</span>`;
  refs.deliveryReadiness.classList.remove('ready', 'warning');
  if (!status.sourceReady) {
    refs.deliveryReadiness.lastElementChild.textContent = '等待两份源文件';
    refs.deliveryModeBadge.textContent = '等待导入文件';
    refs.deliveryExportHint.textContent = '完成文件导入并选择品牌、仓库后即可生成；生产日期可留空。';
    refs.deliveryExportHint.classList.remove('error-copy');
  } else if (!status.dataClean) {
    refs.deliveryReadiness.classList.add('warning');
    refs.deliveryReadiness.lastElementChild.textContent = '存在源数据问题';
    refs.deliveryModeBadge.textContent = '需要处理源数据';
    refs.deliveryExportHint.textContent = `选中范围中有 ${status.unmatched.length} 条未匹配、${status.conflicts.length} 个条码冲突、${status.dataIssues.length} 条数量异常。`;
    refs.deliveryExportHint.classList.add('error-copy');
  } else if (status.ready) {
    refs.deliveryReadiness.classList.add('ready');
    refs.deliveryReadiness.lastElementChild.textContent = '可以生成';
    refs.deliveryModeBadge.textContent = `${status.brands} 个品牌 · ${status.rows} 条明细`;
    refs.deliveryExportHint.textContent = status.fractionalBoxes ? '配置完整；将' + outputDescription + '，' + status.fractionalBoxes + ' 个小数箱会标红。' : '配置完整；将' + outputDescription + '。';
    refs.deliveryExportHint.classList.remove('error-copy');
  } else {
    refs.deliveryReadiness.classList.add('warning');
    refs.deliveryReadiness.lastElementChild.textContent = '请完善生成配置';
    refs.deliveryModeBadge.textContent = '配置未完成';
    refs.deliveryExportHint.textContent = '请选择至少一个品牌和仓库，并填写完整的全局配置。生产日期可留空。';
    refs.deliveryExportHint.classList.add('error-copy');
  }
}

function renderDeliveryState() {
  renderDeliveryBrands();
  renderDeliveryWarehouses();
  renderProductSuggestions();
  renderDeliveryProducts();
  const analysis = state.delivery.analysis;
  refs.deliverySourceSummary.textContent = analysis ? `${analysis.stats.productRows} 个商品 · ${analysis.stats.receiptRows} 条明细 · ${analysis.stats.warehouses} 个仓库` : '尚未分析数据';
  updateDeliveryControls();
}

function applyProductionDate() {
  const selected = [...state.delivery.selectedProducts];
  if (!selected.length) return showDeliveryNotice('请至少选择一个商品。', 'error');
  const date = refs.productionDateInput.value;
  selected.forEach((key) => {
    if (date) state.delivery.productionDates[key] = date;
    else delete state.delivery.productionDates[key];
  });
  state.delivery.selectedProducts.clear();
  clearDeliveryNotice();
  renderDeliveryState();
  showToast(date ? `已为 ${selected.length} 个商品设置生产日期` : `已清除 ${selected.length} 个商品的生产日期`);
}


async function exportDelivery() {
  const status = deliveryStatus();
  if (!status.ready) return;
  refs.generateDeliveryBtn.disabled = true;
  refs.generateDeliveryBtn.textContent = '正在生成';
  clearDeliveryNotice();
  try {
    const result = await window.excelTool.exportDelivery({
      productRows: state.delivery.product.rows,
      receiptRows: state.delivery.receipt.rows,
      brands: [...state.delivery.selectedBrands],
      warehouses: [...state.delivery.selectedWarehouses],
      productionDates: state.delivery.productionDates,
      shelfLife: refs.shelfLifeInput.value,
      contact: refs.contactInput.value,
      supplierName: refs.supplierNameInput.value,
      splitByWarehouse: refs.splitByWarehouseInput.checked
    });
    if (!result) return;
    const fractional = result.files.reduce((sum, file) => sum + file.fractionalBoxes, 0);
    const totalRows = result.files.reduce((sum, file) => sum + file.detailRows, 0);
    const detail = result.splitByWarehouse ? '共 ' + totalRows + ' 条明细' : result.files.map((file) => file.brand + '：' + file.warehouseCount + ' 个仓库、' + file.detailRows + ' 条明细').join('；');
    showDeliveryNotice('已生成 ' + result.files.length + ' 个文件。' + detail + (fractional ? '；' + fractional + ' 个小数箱数已标红' : '') + '。', 'success');
    showToast(`送货单已保存到 ${result.directory}`);
  } catch (error) {
    showDeliveryNotice(error.message || '生成失败，请检查文件是否被占用。', 'error');
  } finally {
    refs.generateDeliveryBtn.textContent = '生成送货单';
    updateDeliveryControls();
  }
}

refs.table1Btn.addEventListener('click', () => importFile('table1'));
refs.table2Btn.addEventListener('click', () => importFile('table2'));
refs.exportBtn.addEventListener('click', exportResult);
refs.mappingBtn.addEventListener('click', openMappingDialog);
refs.productCatalogBtn.addEventListener('click', openProductCatalogDialog);
refs.saveProductCatalogBtn.addEventListener('click', saveProductCatalog);
refs.restoreProductCatalogBtn.addEventListener('click', restoreProductCatalog);
refs.saveMappingBtn.addEventListener('click', saveMapping);
refs.mappingSearch.addEventListener('input', renderMappingList);
refs.searchInput.addEventListener('input', renderTable);
refs.brandSelect.addEventListener('change', async (event) => {
  state.brand = event.target.value;
  state.actualOrders = {};
  state.warehouseStatus = {};
  await rebuild();
});
refs.summaryTab.addEventListener('click', () => switchWorkflow('summary'));
refs.deliveryTab.addEventListener('click', () => switchWorkflow('delivery'));
refs.productBtn.addEventListener('click', () => importDeliveryFile('product'));
refs.receiptBtn.addEventListener('click', () => importDeliveryFile('receipt'));
refs.deliveryProductSearch.addEventListener('input', () => { renderDeliveryProducts(); updateDeliveryControls(); });
refs.selectVisibleProductsBtn.addEventListener('click', () => {
  visibleDeliveryProducts().forEach((product) => state.delivery.selectedProducts.add(product.key));
  renderDeliveryProducts(); updateDeliveryControls();
});
refs.clearProductSelectionBtn.addEventListener('click', () => { state.delivery.selectedProducts.clear(); renderDeliveryProducts(); updateDeliveryControls(); });
refs.productionDateInput.addEventListener('change', updateDeliveryControls);
refs.applyProductionDateBtn.addEventListener('click', applyProductionDate);
refs.generateDeliveryBtn.addEventListener('click', exportDelivery);
refs.supplierNameInput.addEventListener('input', () => {
  state.delivery.supplierName = refs.supplierNameInput.value;
  localStorage.setItem('deliverySupplierName', state.delivery.supplierName);
  updateDeliveryControls();
});
refs.shelfLifeInput.addEventListener('input', () => { state.delivery.shelfLife = refs.shelfLifeInput.value; updateDeliveryControls(); });
refs.contactInput.addEventListener('input', () => { state.delivery.contact = refs.contactInput.value; updateDeliveryControls(); });
refs.splitByWarehouseInput.addEventListener('change', () => { state.delivery.splitByWarehouse = refs.splitByWarehouseInput.checked; updateDeliveryControls(); });

refs.supplierNameInput.value = state.delivery.supplierName;
refs.shelfLifeInput.value = state.delivery.shelfLife;
refs.contactInput.value = state.delivery.contact;
refs.splitByWarehouseInput.checked = state.delivery.splitByWarehouse;
renderEmpty();
renderDeliveryState();
switchWorkflow('summary');
