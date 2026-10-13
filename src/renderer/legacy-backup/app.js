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
  backfillPreview: null,
  inventoryUpdate: {
    table3: null,
    inventories: [],
    transit: null,
    analysis: null
  },
  mappingRows: [],
  mappingDraft: {},
  workflow: 'summary',
  demand: {
    rows: [],
    warehouses: [],
    presetFactories: [],
    warehouseConfigs: {},
    sourceMeta: ''
  },
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
  },
  invoice: {
    filePaths: [],
    files: [],
    rawRows: [],
    availableFeeTypes: [],
    availableInvoiceDirs: [],
    selectedFeeTypes: new Set(),
    selectedInvoiceDirs: new Set(),
    summaryResult: null,
    searchKeyword: '',
    config: {
      applicant: (function() {
        const saved = localStorage.getItem('invoiceApplicant');
        return (!saved || saved === '刘雯') ? '丁锐杰' : saved;
      })(),
      date: '',
      platform: '国宝猫超',
      warehouse: '',
      invoiceType: '专用发票',
      companyTitle: '浙江昊超网络科技有限公司',
      taxId: '91330110MA2GK1DN85',
      address: '杭州市余杭区五常街道文一西路969号3幢5层551室',
      phone: '0571-85022088',
      bank: '招商银行股份有限公司杭州高新支行',
      account: '571913080610506',
      mailRecipient: '武汉营销中心1293737582@qq.com'
    }
  }
};

const el = (id) => document.getElementById(id);
const refs = {
  summaryTab: el('summaryTab'), inventoryTab: el('inventoryTab'), deliveryTab: el('deliveryTab'), invoiceTab: el('invoiceTab'),
  summaryView: el('summaryView'), inventoryView: el('inventoryView'), deliveryView: el('deliveryView'), invoiceView: el('invoiceView'),
  summaryTopActions: el('summaryTopActions'), inventoryTopActions: el('inventoryTopActions'), deliveryTopActions: el('deliveryTopActions'), invoiceTopActions: el('invoiceTopActions'),
  invoiceModeBadge: el('invoiceModeBadge'), invoiceConfigModalBtn: el('invoiceConfigModalBtn'), exportInvoiceBtn: el('exportInvoiceBtn'),
  invoiceFilesBtn: el('invoiceFilesBtn'), invoiceFilesSlot: el('invoiceFilesSlot'), invoiceFilesMeta: el('invoiceFilesMeta'),
  invoiceDateInput: el('invoiceDateInput'), invoiceApplicantInput: el('invoiceApplicantInput'), invoicePlatformInput: el('invoicePlatformInput'), invoiceWarehouseInput: el('invoiceWarehouseInput'),
  invoiceFilterSection: el('invoiceFilterSection'), invoiceFeeTypeChips: el('invoiceFeeTypeChips'), invoiceDirChips: el('invoiceDirChips'),
  invoiceFileListSection: el('invoiceFileListSection'), invoiceFileCount: el('invoiceFileCount'), invoiceClearFilesBtn: el('invoiceClearFilesBtn'), invoiceFileChips: el('invoiceFileChips'),
  invoiceNotice: el('invoiceNotice'), invoiceBillCountMetric: el('invoiceBillCountMetric'), invoiceProductCountMetric: el('invoiceProductCountMetric'),
  invoiceRowCountMetric: el('invoiceRowCountMetric'), invoiceQtyMetric: el('invoiceQtyMetric'), invoiceAmountMetric: el('invoiceAmountMetric'),
  invoicePreviewHelp: el('invoicePreviewHelp'), invoiceEmptyState: el('invoiceEmptyState'), invoiceTableWrap: el('invoiceTableWrap'),
  invoiceTableBody: el('invoiceTableBody'), invoiceFootQty: el('invoiceFootQty'), invoiceFootAmount: el('invoiceFootAmount'), invoiceSearchInput: el('invoiceSearchInput'),
  invoiceConfigDialog: el('invoiceConfigDialog'), closeInvoiceConfigXBtn: el('closeInvoiceConfigXBtn'), resetInvoiceConfigBtn: el('resetInvoiceConfigBtn'), saveInvoiceConfigBtn: el('saveInvoiceConfigBtn'),
  cfgInvoiceType: el('cfgInvoiceType'), cfgCompanyTitle: el('cfgCompanyTitle'), cfgTaxId: el('cfgTaxId'), cfgPhone: el('cfgPhone'), cfgAddress: el('cfgAddress'), cfgBank: el('cfgBank'), cfgAccount: el('cfgAccount'), cfgMailRecipient: el('cfgMailRecipient'),
  table1Btn: el('table1Btn'), table2Btn: el('table2Btn'), exportBtn: el('exportBtn'), backfillBtn: el('backfillBtn'), demandBtn: el('demandBtn'),
  demandDialog: el('demandDialog'), demandTaskMeta: el('demandTaskMeta'), demandTitleInput: el('demandTitleInput'), demandBaseDateInput: el('demandBaseDateInput'),
  demandImportReceiptBtn: el('demandImportReceiptBtn'), demandImportTable3Btn: el('demandImportTable3Btn'),
  demandWarehouseList: el('demandWarehouseList'), confirmDemandBtn: el('confirmDemandBtn'),
  table1Meta: el('table1Meta'), table2Meta: el('table2Meta'), table1Slot: el('table1Slot'), table2Slot: el('table2Slot'),
  brandSelect: el('brandSelect'), mappingBtn: el('mappingBtn'), mappingCount: el('mappingCount'), modeBadge: el('modeBadge'),
  productCatalogBtn: el('productCatalogBtn'), productCatalogCount: el('productCatalogCount'),
  notice: el('notice'), emptyState: el('emptyState'), tableWrap: el('tableWrap'), resultBody: el('resultBody'), searchInput: el('searchInput'),
  warehouseMetric: el('warehouseMetric'), productMetric: el('productMetric'), rowMetric: el('rowMetric'), orderMetric: el('orderMetric'), weightMetric: el('weightMetric'),
  mappingDialog: el('mappingDialog'), mappingList: el('mappingList'), mappingSearch: el('mappingSearch'), mappingSummary: el('mappingSummary'), saveMappingBtn: el('saveMappingBtn'),
  productCatalogDialog: el('productCatalogDialog'), productCatalogBrand: el('productCatalogBrand'), productCatalogTextarea: el('productCatalogTextarea'),
  productCatalogStatus: el('productCatalogStatus'), saveProductCatalogBtn: el('saveProductCatalogBtn'), restoreProductCatalogBtn: el('restoreProductCatalogBtn'),
  backfillDialog: el('backfillDialog'), backfillTaskMeta: el('backfillTaskMeta'), backfillSummary: el('backfillSummary'),
  backfillWarehouseList: el('backfillWarehouseList'), backfillFootnote: el('backfillFootnote'), confirmBackfillBtn: el('confirmBackfillBtn'),
  productBtn: el('productBtn'), receiptBtn: el('receiptBtn'), productMeta: el('productMeta'), receiptMeta: el('receiptMeta'), productSlot: el('productSlot'), receiptSlot: el('receiptSlot'),
  deliveryNotice: el('deliveryNotice'), deliveryBrands: el('deliveryBrands'), deliveryWarehouses: el('deliveryWarehouses'), deliverySourceSummary: el('deliverySourceSummary'),
  supplierNameInput: el('supplierNameInput'), shelfLifeInput: el('shelfLifeInput'), contactInput: el('contactInput'), splitByWarehouseInput: el('splitByWarehouseInput'),
  deliveryProductSearch: el('deliveryProductSearch'), productSuggestions: el('productSuggestions'), deliveryProductList: el('deliveryProductList'),
  selectVisibleProductsBtn: el('selectVisibleProductsBtn'), clearProductSelectionBtn: el('clearProductSelectionBtn'),
  productionDateInput: el('productionDateInput'), applyProductionDateBtn: el('applyProductionDateBtn'), datedProductCount: el('datedProductCount'),
  deliveryMetrics: el('deliveryMetrics'), deliveryExportHint: el('deliveryExportHint'), deliveryReadiness: el('deliveryReadiness'), deliveryModeBadge: el('deliveryModeBadge'),
  generateDeliveryBtn: el('generateDeliveryBtn'),
  inventoryModeBadge: el('inventoryModeBadge'), exportInventoryBtn: el('exportInventoryBtn'), inventoryReadiness: el('inventoryReadiness'),
  inventoryTable3Btn: el('inventoryTable3Btn'), liveInventoryBtn: el('liveInventoryBtn'), transitBtn: el('transitBtn'),
  inventoryTable3Slot: el('inventoryTable3Slot'), liveInventorySlot: el('liveInventorySlot'), transitSlot: el('transitSlot'),
  inventoryTable3Meta: el('inventoryTable3Meta'), liveInventoryMeta: el('liveInventoryMeta'), transitMeta: el('transitMeta'), inventoryNotice: el('inventoryNotice'),
  inventoryTargetMetric: el('inventoryTargetMetric'), inventoryMatchedMetric: el('inventoryMatchedMetric'), inventoryPreservedMetric: el('inventoryPreservedMetric'), inventoryIgnoredMetric: el('inventoryIgnoredMetric'), transitMetric: el('transitMetric'),
  inventoryPreviewHelp: el('inventoryPreviewHelp'), inventorySourceSummary: el('inventorySourceSummary'), inventoryEmptyState: el('inventoryEmptyState'),
  inventoryPreviewWrap: el('inventoryPreviewWrap'), inventoryUpdateList: el('inventoryUpdateList'), toast: el('toast'),
  deliveryDemandBtn: el('deliveryDemandBtn'),
  manageProductPresetBtn: el('manageProductPresetBtn'),
  importProductPresetBtn: el('importProductPresetBtn'),
  productPresetDialog: el('productPresetDialog'),
  closePresetDialogBtn: el('closePresetDialogBtn'),
  closePresetBtn: el('closePresetBtn'),
  presetSearchInput: el('presetSearchInput'),
  presetCountBadge: el('presetCountBadge'),
  toggleAddProductBtn: el('toggleAddProductBtn'),
  importPresetExcelBtn: el('importPresetExcelBtn'),
  resetPresetBtn: el('resetPresetBtn'),
  addProductForm: el('addProductForm'),
  newProductBrand: el('newProductBrand'),
  newProductBarcode: el('newProductBarcode'),
  newProductShortName: el('newProductShortName'),
  newProductSpec: el('newProductSpec'),
  newProductBoxSpec: el('newProductBoxSpec'),
  newProductNote: el('newProductNote'),
  newProductFullName: el('newProductFullName'),
  cancelAddProductBtn: el('cancelAddProductBtn'),
  saveNewProductBtn: el('saveNewProductBtn'),
  presetTableBody: el('presetTableBody'),
  warehousePresetSlot: el('warehousePresetSlot'),
  warehousePresetMeta: el('warehousePresetMeta'),
  manageWarehousePresetBtn: el('manageWarehousePresetBtn'),
  importWarehousePresetBtn: el('importWarehousePresetBtn'),
  demandManageWarehousePresetBtn: el('demandManageWarehousePresetBtn'),
  warehousePresetDialog: el('warehousePresetDialog'),
  closeWarehousePresetDialogBtn: el('closeWarehousePresetDialogBtn'),
  closeWarehousePresetBtn: el('closeWarehousePresetBtn'),
  warehousePresetSearchInput: el('warehousePresetSearchInput'),
  warehousePresetCountBadge: el('warehousePresetCountBadge'),
  toggleAddWarehouseBtn: el('toggleAddWarehouseBtn'),
  importWarehousePresetExcelBtn: el('importWarehousePresetExcelBtn'),
  resetWarehousePresetBtn: el('resetWarehousePresetBtn'),
  addWarehouseForm: el('addWarehouseForm'),
  newWarehouseRegion: el('newWarehouseRegion'),
  newWarehouseCode: el('newWarehouseCode'),
  newWarehouseName: el('newWarehouseName'),
  newLogicWarehouseName: el('newLogicWarehouseName'),
  newWarehouseFactory: el('newWarehouseFactory'),
  newWarehouseNote: el('newWarehouseNote'),
  cancelAddWarehouseBtn: el('cancelAddWarehouseBtn'),
  saveNewWarehouseBtn: el('saveNewWarehouseBtn'),
  warehousePresetTableBody: el('warehousePresetTableBody')
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
  refs.notice.classList.remove('hidden', 'error', 'success');
  if (type !== 'warning') refs.notice.classList.add(type);
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
  const isInventory = workflow === 'inventory';
  const isDelivery = workflow === 'delivery';
  const isInvoice = workflow === 'invoice';
  refs.summaryTab.classList.toggle('active', isSummary);
  refs.inventoryTab.classList.toggle('active', isInventory);
  refs.deliveryTab.classList.toggle('active', isDelivery);
  refs.invoiceTab.classList.toggle('active', isInvoice);
  refs.summaryTab.toggleAttribute('aria-current', isSummary);
  refs.inventoryTab.toggleAttribute('aria-current', isInventory);
  refs.deliveryTab.toggleAttribute('aria-current', isDelivery);
  refs.invoiceTab.toggleAttribute('aria-current', isInvoice);
  refs.summaryView.classList.toggle('hidden', !isSummary);
  refs.inventoryView.classList.toggle('hidden', !isInventory);
  refs.deliveryView.classList.toggle('hidden', !isDelivery);
  refs.invoiceView.classList.toggle('hidden', !isInvoice);
  refs.summaryTopActions.classList.toggle('hidden', !isSummary);
  refs.inventoryTopActions.classList.toggle('hidden', !isInventory);
  refs.deliveryTopActions.classList.toggle('hidden', !isDelivery);
  refs.invoiceTopActions.classList.toggle('hidden', !isInvoice);
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
      input.type = 'number'; input.min = '0'; input.step = String(row.boxSpec); input.value = String(row.actualOrder ?? 0);
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
    const exported = await window.excelTool.exportExcel({
      ...state.result,
      brand: state.brand,
      orderHeader: state.table1?.resultOrderHeader || '系统订单',
      sourceOrderFilePath: state.table1?.filePath || '',
      sourceOrderSheetName: state.table1?.sheetName || '',
      sourceOrderHeader: state.table1?.orderHeader || '采购数量'
    });
    if (exported) {
      const taskCopy = exported.backfillTask ? '，可在实际订单确认后回填订单原表' : '；当前未导入订单原表，本文件不包含回填任务';
      showNotice(`表三已导出${taskCopy}。`, exported.backfillTask ? 'success' : 'warning');
      showToast(`已导出：${exported.filePath}`);
    }
  } catch (error) {
    showNotice(error.message || '导出失败，请检查文件是否被占用。', 'error');
  } finally {
    refs.exportBtn.disabled = false;
    refs.exportBtn.textContent = '导出表三';
  }
}


function openDemandModal(rows = [], sourceMeta = '') {
  state.demand.rows = rows.length ? rows : (state.rows || []);
  state.demand.sourceMeta = sourceMeta;
  if (!state.demand.rows.length) {
    showNotice('当前没有汇总数据，可直接点击弹窗内的“导入入库/发货单”或“导入外部表三”。', 'info');
  }
  refreshDemandConfig();
}

async function refreshDemandConfig() {
  if (refs.demandBtn) refs.demandBtn.disabled = true;
  if (refs.deliveryDemandBtn) refs.deliveryDemandBtn.disabled = true;
  try {
    const config = await window.excelTool.getProcurementConfig({ rows: state.demand.rows });
    state.demand.warehouses = config.warehouses || [];
    state.demand.presetFactories = config.presetFactories || [];
    if (!refs.demandBaseDateInput.value) {
      refs.demandBaseDateInput.value = config.defaultPickupDate || '';
    }
    if (refs.demandTaskMeta) {
      if (state.demand.sourceMeta) {
        refs.demandTaskMeta.textContent = state.demand.sourceMeta;
      } else {
        refs.demandTaskMeta.textContent = `基于当前补货汇总（包含 ${state.demand.warehouses.length} 个有发货需求的仓库）`;
      }
    }

    state.demand.warehouseConfigs = {};
    state.demand.warehouses.forEach((wh) => {
      state.demand.warehouseConfigs[wh.warehouse] = {
        factory: wh.factory,
        pickupDate: wh.pickupDate || refs.demandBaseDateInput.value,
        inboundDate: wh.inboundDate || ''
      };
    });

    renderDemandWarehouseList();
    refs.confirmDemandBtn.disabled = state.demand.warehouses.length === 0;
    refs.demandDialog.showModal();
  } catch (err) {
    const msg = err.message || '获取采购需求配置失败';
    if (state.workflow === 'delivery') {
      showDeliveryNotice(msg, 'error');
    } else {
      showNotice(msg, 'error');
    }
    showToast(msg);
  } finally {
    if (refs.demandBtn) refs.demandBtn.disabled = false;
    if (refs.deliveryDemandBtn) refs.deliveryDemandBtn.disabled = false;
  }
}

function renderDemandWarehouseList() {
  refs.demandWarehouseList.replaceChildren();
  if (!state.demand.warehouses.length) {
    const emptyRow = document.createElement('div');
    emptyRow.style.padding = '36px 20px';
    emptyRow.style.textAlign = 'center';
    emptyRow.style.color = 'var(--muted)';
    emptyRow.textContent = '暂无需求数量大于 0 的仓库明细，可点击右上角导入入库单或表三。';
    refs.demandWarehouseList.append(emptyRow);
    return;
  }

  const fragment = document.createDocumentFragment();

  const head = document.createElement('div');
  head.className = 'demand-row demand-row-head';
  head.innerHTML = `
    <div>需求平台/仓</div>
    <div style="text-align:right">品项数</div>
    <div style="text-align:right">需求件数</div>
    <div style="text-align:right">总重量(吨)</div>
    <div>发货地址(米厂)</div>
    <div>提货时间</div>
    <div>入仓时间</div>
  `;
  fragment.append(head);

  state.demand.warehouses.forEach((wh) => {
    const cfg = state.demand.warehouseConfigs[wh.warehouse] || {
      factory: wh.factory,
      pickupDate: wh.pickupDate,
      inboundDate: wh.inboundDate
    };

    const row = document.createElement('div');
    row.className = 'demand-row';

    const name = document.createElement('div');
    name.className = 'demand-wh-name';
    name.textContent = wh.warehouse;
    name.title = wh.warehouse;

    const count = document.createElement('div');
    count.className = 'demand-num';
    count.textContent = `${wh.itemCount} 项`;

    const qty = document.createElement('div');
    qty.className = 'demand-num';
    qty.textContent = formatNumber(wh.totalQty);

    const weight = document.createElement('div');
    weight.className = 'demand-num';
    weight.textContent = Number(wh.estimatedWeight).toFixed(3);

    const factoryCell = document.createElement('div');
    const factorySelect = document.createElement('select');
    factorySelect.className = 'demand-row-select';
    state.demand.presetFactories.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      if (f === cfg.factory) opt.selected = true;
      factorySelect.append(opt);
    });
    factorySelect.addEventListener('change', () => {
      cfg.factory = factorySelect.value;
    });
    factoryCell.append(factorySelect);

    const pickupCell = document.createElement('div');
    const pickupInput = document.createElement('input');
    pickupInput.type = 'date';
    pickupInput.className = 'demand-row-date';
    pickupInput.value = cfg.pickupDate || '';
    pickupInput.addEventListener('change', () => {
      cfg.pickupDate = pickupInput.value;
      if (cfg.pickupDate) {
        const next = new Date(cfg.pickupDate);
        next.setDate(next.getDate() + 1);
        const y = next.getFullYear();
        const m = String(next.getMonth() + 1).padStart(2, '0');
        const d = String(next.getDate()).padStart(2, '0');
        cfg.inboundDate = `${y}-${m}-${d}`;
        inboundInput.value = cfg.inboundDate;
      }
    });
    pickupCell.append(pickupInput);

    const inboundCell = document.createElement('div');
    const inboundInput = document.createElement('input');
    inboundInput.type = 'date';
    inboundInput.className = 'demand-row-date';
    inboundInput.value = cfg.inboundDate || '';
    inboundInput.addEventListener('change', () => {
      cfg.inboundDate = inboundInput.value;
    });
    inboundCell.append(inboundInput);

    row.append(name, count, qty, weight, factoryCell, pickupCell, inboundCell);
    fragment.append(row);
  });

  refs.demandWarehouseList.append(fragment);
}

function handleDemandBaseDateChange() {
  const baseDate = refs.demandBaseDateInput.value;
  if (!baseDate) return;
  const next = new Date(baseDate);
  next.setDate(next.getDate() + 1);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const d = String(next.getDate()).padStart(2, '0');
  const defaultInbound = `${y}-${m}-${d}`;

  Object.values(state.demand.warehouseConfigs).forEach((cfg) => {
    cfg.pickupDate = baseDate;
    cfg.inboundDate = defaultInbound;
  });
  renderDemandWarehouseList();
}

async function handleImportDemand(type) {
  clearNotice();
  try {
    const res = await window.excelTool.importProcurementFile(type);
    if (!res) return;
    const isReceipt = type === 'receipt';
    const label = isReceipt ? `已导入发货单：${res.fileName}` : `已导入表三：${res.fileName}`;
    showNotice(`${label}，包含 ${res.rows.length} 条发货明细。`, 'success');
    openDemandModal(res.rows, label);
  } catch (err) {
    showNotice(err.message || '导入失败，请检查文件格式。', 'error');
  }
}

async function handleExportDemand() {
  if (!state.demand.warehouses.length) return;
  refs.confirmDemandBtn.disabled = true;
  refs.confirmDemandBtn.textContent = '正在生成';
  try {
    const title = refs.demandTitleInput.value.trim() || '国宝 采购需求一览表2026年';
    const res = await window.excelTool.exportProcurementDemand({
      rows: state.demand.rows,
      warehouseConfigs: state.demand.warehouseConfigs,
      title
    });
    if (!res) return;
    refs.demandDialog.close();
    const successMsg = `已成功导出《${title}》（覆盖 ${res.warehouseCount} 个仓库、${res.itemCount} 条发货明细）。`;
    if (state.workflow === 'delivery') {
      showDeliveryNotice(successMsg, 'success');
    } else {
      showNotice(successMsg, 'success');
    }
    showToast(`采购需求一览表已保存至：${res.filePath}`);
  } catch (err) {
    const errorMsg = err.message || '导出采购需求表失败。';
    if (state.workflow === 'delivery') {
      showDeliveryNotice(errorMsg, 'error');
    } else {
      showNotice(errorMsg, 'error');
    }
    showToast(errorMsg);
  } finally {
    refs.confirmDemandBtn.disabled = false;
    refs.confirmDemandBtn.textContent = '生成采购需求表';
  }
}

function backfillMetric(label, value, className = '') {
  const item = document.createElement('div');
  item.className = `backfill-summary-item${className ? ` ${className}` : ''}`;
  const name = document.createElement('span'); name.textContent = label;
  const number = document.createElement('strong'); number.textContent = value;
  item.append(name, number);
  return item;
}

function renderBackfillPreview() {
  const preview = state.backfillPreview;
  refs.backfillFootnote.style.color = '';
  const versionCopy = preview.legacy ? '旧版表三 · 外部订单原表' : '内置回填任务';
  refs.backfillTaskMeta.textContent = `${preview.fileName} · ${preview.brand || '未标注品牌'} · ${versionCopy}：${preview.sourceFileName}`;
  refs.backfillSummary.replaceChildren(
    backfillMetric('识别仓库', formatNumber(preview.warehouses.length)),
    backfillMetric('可以生成', formatNumber(preview.readyWarehouseCount), 'ready'),
    backfillMetric('异常项目', formatNumber(preview.errorCount), preview.errorCount ? 'error' : '')
  );
  refs.backfillWarehouseList.replaceChildren();
  const fragment = document.createDocumentFragment();
  preview.warehouses.forEach((item) => {
    const row = document.createElement('div');
    row.className = `backfill-row${item.ready ? '' : ' has-error'}`;
    const warehouse = document.createElement('div'); warehouse.className = 'backfill-warehouse'; warehouse.textContent = item.warehouse; warehouse.title = item.warehouse;
    const groups = document.createElement('div'); groups.className = 'backfill-number'; groups.textContent = `${formatNumber(item.groupCount)} 个货品`;
    const total = document.createElement('div'); total.className = 'backfill-number'; total.textContent = `${formatNumber(item.actualTotal)} 件`;
    const status = document.createElement('div'); status.className = `backfill-status${item.ready ? '' : ' error'}`; status.textContent = item.ready ? '可生成' : '需处理';
    row.append(warehouse, groups, total, status);
    if (item.errors.length) {
      const errors = document.createElement('div');
      errors.className = 'backfill-errors';
      item.errors.forEach((message) => {
        const errItem = document.createElement('div');
        errItem.className = 'backfill-error-item';
        errItem.textContent = message;
        errors.append(errItem);
      });
      row.append(errors);
    }
    fragment.append(row);
  });
  refs.backfillWarehouseList.append(fragment);
  refs.confirmBackfillBtn.disabled = preview.readyWarehouseCount === 0;
  refs.backfillFootnote.textContent = preview.errorCount
    ? '有异常的仓库不会生成；其余仓库仍可正常导出。请修正表三后可再次回导。'
    : '数量将按订单原表的行顺序依次分配，每行不超过采购数量。';
}

async function openBackfill() {
  const original = refs.backfillBtn.textContent;
  refs.backfillBtn.disabled = true;
  refs.backfillBtn.textContent = '正在读取';
  clearNotice();
  try {
    const preview = await window.excelTool.openBackfillExcel();
    if (!preview) return;
    state.backfillPreview = preview;
    renderBackfillPreview();
    refs.backfillDialog.showModal();
  } catch (error) {
    showNotice(error.message || '回传表三读取失败，请确认文件来自当前版本工具。', 'error');
  } finally {
    refs.backfillBtn.disabled = false;
    refs.backfillBtn.textContent = original;
  }
}

async function exportBackfill() {
  if (!state.backfillPreview) return;
  refs.confirmBackfillBtn.disabled = true;
  refs.confirmBackfillBtn.textContent = '正在生成';
  try {
    const result = await window.excelTool.exportBackfill({
      filePath: state.backfillPreview.filePath,
      sourceFilePath: state.backfillPreview.sourceFilePath || ''
    });
    if (!result) return;
    refs.backfillDialog.close();
    const skipped = result.skipped.length ? `，另有 ${result.skipped.length} 个异常仓库未生成` : '';
    showNotice(`已生成 ${result.files.length} 个分仓补货单${skipped}。`, 'success');
    showToast(`分仓文件已保存到：${result.directory}`);
  } catch (error) {
    refs.backfillFootnote.textContent = error.message || '生成失败，请检查文件是否被占用。';
    refs.backfillFootnote.style.color = 'var(--danger)';
  } finally {
    refs.confirmBackfillBtn.textContent = '生成分仓文件';
    refs.confirmBackfillBtn.disabled = !state.backfillPreview?.readyWarehouseCount;
  }
}

function showInventoryNotice(message, type = 'warning') {
  refs.inventoryNotice.textContent = message;
  refs.inventoryNotice.classList.remove('hidden', 'error', 'success');
  if (type !== 'warning') refs.inventoryNotice.classList.add(type);
}

function clearInventoryNotice() {
  refs.inventoryNotice.classList.add('hidden');
  refs.inventoryNotice.textContent = '';
}

function renderInventoryUpdate() {
  const analysis = state.inventoryUpdate.analysis;
  const hasFiles = Boolean(state.inventoryUpdate.table3 && (state.inventoryUpdate.inventories.length || state.inventoryUpdate.transit));
  refs.inventoryTargetMetric.textContent = formatNumber(analysis?.targetRows || 0);
  refs.inventoryMatchedMetric.textContent = formatNumber(analysis?.matchedRows || 0);
  refs.inventoryPreservedMetric.textContent = formatNumber(analysis?.preservedRows || 0);
  refs.inventoryIgnoredMetric.textContent = formatNumber(analysis?.ignoredInventoryRows || 0);
  refs.transitMetric.textContent = analysis?.hasTransit ? formatNumber(analysis.transitTotal) : '—';
  refs.inventoryReadiness.classList.remove('ready', 'warning');
  refs.exportInventoryBtn.disabled = !analysis?.canExport;
  refs.inventoryEmptyState.classList.toggle('hidden', Boolean(analysis));
  refs.inventoryPreviewWrap.classList.toggle('hidden', !analysis);

  if (!hasFiles) {
    refs.inventoryModeBadge.textContent = '等待导入文件';
    refs.inventoryReadiness.lastElementChild.textContent = '等待旧表三和数据文件';
    refs.inventorySourceSummary.textContent = '尚未分析数据';
    refs.inventoryPreviewHelp.textContent = '导入旧表三，再从实时库存和在途明细中至少选择一种。';
    return;
  }
  if (!analysis) {
    refs.inventoryModeBadge.textContent = '正在分析';
    refs.inventoryReadiness.lastElementChild.textContent = '正在分析文件';
    return;
  }

  const sourceParts = [];
  if (analysis.inventoryFileCount) sourceParts.push(`${analysis.inventoryFileCount} 份库存 · ${analysis.matchedRows} 条匹配`);
  if (analysis.hasTransit) sourceParts.push(`在途 ${analysis.matchedTransitRows} 条 / ${formatNumber(analysis.transitTotal)} 件`);
  refs.inventorySourceSummary.textContent = sourceParts.join(' · ');
  refs.inventoryPreviewHelp.textContent = `显示 ${formatNumber(analysis.previewRows.length)} 条库存或在途匹配明细。`;
  refs.inventoryUpdateList.replaceChildren();
  const fragment = document.createDocumentFragment();
  analysis.previewRows.forEach((item) => {
    const row = document.createElement('div');
    row.className = `inventory-update-row${Number(item.oldValue) === item.newValue ? ' unchanged' : ''}`;
    const warehouse = document.createElement('span'); warehouse.className = 'inventory-warehouse'; warehouse.textContent = item.warehouse; warehouse.title = item.warehouse;
    const product = document.createElement('span'); product.className = 'inventory-product'; product.textContent = item.product; product.title = item.product;
    const oldValue = document.createElement('span'); oldValue.className = 'inventory-number'; oldValue.textContent = formatNumber(item.oldValue);
    const newValue = document.createElement('strong'); newValue.className = 'inventory-number inventory-new-value'; newValue.textContent = formatNumber(item.newValue);
    const difference = document.createElement('span'); difference.className = `inventory-difference${item.difference > 0 ? ' positive' : item.difference < 0 ? ' negative' : ''}`;
    difference.textContent = item.difference === null ? '—' : `${item.difference > 0 ? '+' : ''}${formatNumber(item.difference)}`;
    const transit = document.createElement('strong'); transit.className = 'inventory-number inventory-transit-value'; transit.textContent = analysis.hasTransit ? formatNumber(item.transitValue) : '—';
    row.append(warehouse, product, oldValue, newValue, difference, transit);
    fragment.append(row);
  });
  refs.inventoryUpdateList.append(fragment);

  if (analysis.errors.length) {
    refs.inventoryReadiness.classList.add('warning');
    refs.inventoryReadiness.lastElementChild.textContent = '存在数据冲突';
    refs.inventoryModeBadge.textContent = `${analysis.errors.length} 个问题待处理`;
    const firstErrors = analysis.errors.slice(0, 3).join('；');
    showInventoryNotice(`${firstErrors}${analysis.errors.length > 3 ? `；另有 ${analysis.errors.length - 3} 个问题` : ''}。`, 'error');
  } else if (!analysis.matchedRows && !analysis.matchedTransitRows) {
    refs.inventoryReadiness.classList.add('warning');
    refs.inventoryReadiness.lastElementChild.textContent = '没有匹配数据';
    refs.inventoryModeBadge.textContent = '无法导出';
    showInventoryNotice('没有找到仓库名称和货品名称都相同的明细，请检查所选文件是否属于表三中的仓库和货品。', 'error');
  } else {
    refs.inventoryReadiness.classList.add('ready');
    refs.inventoryReadiness.lastElementChild.textContent = '可以导出';
    refs.inventoryModeBadge.textContent = `${analysis.matchedRows} 条库存 · ${analysis.matchedTransitRows} 条在途`;
    const duplicateCopy = analysis.duplicateInventoryGroups ? `；${analysis.duplicateInventoryGroups} 组同文件重复库存已合计` : '';
    const transitPreserveCopy = analysis.hasExistingTransitColumn && analysis.preservedTransitWarehouses.length
      ? `，${analysis.preservedTransitWarehouses.length} 个未出现在文件中的仓库保留原值`
      : '';
    const transitCopy = analysis.hasTransit
      ? `；在途匹配 ${analysis.matchedTransitRows} 条、合计 ${formatNumber(analysis.transitTotal)} 件，仅覆盖文件中的 ${analysis.sourceTransitWarehouses.length} 个仓库${transitPreserveCopy}${analysis.duplicateTransitGroups ? `，${analysis.duplicateTransitGroups} 组多业务单已合计` : ''}`
      : '';
    showInventoryNotice(`将更新 ${analysis.changedRows} 条良品可用，${analysis.unchangedRows} 条数值不变，${analysis.preservedRows} 条未匹配明细保留原值${duplicateCopy}${transitCopy}。`, 'success');
  }
}

async function analyzeInventoryFiles() {
  if (!state.inventoryUpdate.table3 || (!state.inventoryUpdate.inventories.length && !state.inventoryUpdate.transit)) return renderInventoryUpdate();
  clearInventoryNotice();
  state.inventoryUpdate.analysis = null;
  renderInventoryUpdate();
  try {
    state.inventoryUpdate.analysis = await window.excelTool.analyzeInventoryUpdate({
      table3Path: state.inventoryUpdate.table3.filePath,
      inventoryPaths: state.inventoryUpdate.inventories.map((file) => file.filePath),
      transitPath: state.inventoryUpdate.transit?.filePath || ''
    });
  } catch (error) {
    showInventoryNotice(error.message || '分析失败，请检查 Excel 文件格式。', 'error');
  }
  renderInventoryUpdate();
}

async function importInventoryUpdateFile(type) {
  const isTable3 = type === 'table3';
  const isTransit = type === 'transit';
  const button = isTable3 ? refs.inventoryTable3Btn : isTransit ? refs.transitBtn : refs.liveInventoryBtn;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '正在读取';
  clearInventoryNotice();
  try {
    const payload = await window.excelTool.openInventoryUpdateExcel(type);
    if (!payload) return;
    state.inventoryUpdate.analysis = null;
    if (isTable3) {
      state.inventoryUpdate.table3 = payload;
      refs.inventoryTable3Slot.classList.add('loaded');
      refs.inventoryTable3Meta.textContent = `${payload.fileName} · ${payload.sheetName} · ${payload.rowCount} 条明细`;
    } else if (isTransit) {
      state.inventoryUpdate.transit = payload;
      refs.transitSlot.classList.add('loaded');
      refs.transitMeta.textContent = `${payload.fileName} · ${payload.sheetName} · ${payload.rowCount} 条明细`;
    } else {
      state.inventoryUpdate.inventories = payload;
      refs.liveInventorySlot.classList.add('loaded');
      const totalRows = payload.reduce((sum, file) => sum + file.rowCount, 0);
      refs.liveInventoryMeta.textContent = `${payload.length} 个文件 · ${totalRows} 条商品明细`;
    }
    button.textContent = '重新选择';
    await analyzeInventoryFiles();
    showToast(`${isTable3 ? '旧表三' : isTransit ? '库存在途明细' : `${payload.length} 份实时库存`}导入成功`);
  } catch (error) {
    showInventoryNotice(error.message || '文件读取失败，请检查 Excel 格式。', 'error');
  } finally {
    button.disabled = false;
    if (button.textContent === '正在读取') button.textContent = original;
  }
}

async function exportInventoryUpdate() {
  const analysis = state.inventoryUpdate.analysis;
  if (!analysis?.canExport) return;
  refs.exportInventoryBtn.disabled = true;
  refs.exportInventoryBtn.textContent = '正在导出';
  clearInventoryNotice();
  try {
    const result = await window.excelTool.exportInventoryUpdate({
      table3Path: state.inventoryUpdate.table3.filePath,
      inventoryPaths: state.inventoryUpdate.inventories.map((file) => file.filePath),
      transitPath: state.inventoryUpdate.transit?.filePath || ''
    });
    if (!result) return;
    const transitCopy = result.hasTransit ? `，并写入 ${result.matchedTransitRows} 条在途订单、合计 ${formatNumber(result.transitTotal)} 件` : '';
    showInventoryNotice(`已更新 ${result.changedRows} 条良品可用${transitCopy}；${result.preservedRows} 条未匹配库存明细保留原值。`, 'success');
    showToast(`更新后的表三已保存到：${result.filePath}`);
  } catch (error) {
    showInventoryNotice(error.message || '导出失败，请检查文件是否被占用。', 'error');
  } finally {
    refs.exportInventoryBtn.textContent = '导出更新表三';
    refs.exportInventoryBtn.disabled = !state.inventoryUpdate.analysis?.canExport;
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
  if (refs.deliveryDemandBtn) refs.deliveryDemandBtn.disabled = !status.sourceReady || !status.warehouseCount;
  refs.datedProductCount.textContent = `${status.dated} / ${status.products.length}`;
  refs.deliveryMetrics.innerHTML = `<span><strong>${status.brands}</strong> 个品牌</span><span><strong>${status.warehouseCount}</strong> 个仓库</span><span><strong>${status.rows}</strong> 条明细</span><span><strong>${status.fractionalBoxes}</strong> 个小数箱</span>`;
  refs.deliveryReadiness.classList.remove('ready', 'warning');
  if (!status.sourceReady) {
    refs.deliveryReadiness.lastElementChild.textContent = '等待导入入库明细';
    refs.deliveryModeBadge.textContent = '等待导入入库明细';
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



async function initWarehousePreset() {
  try {
    const preset = await window.excelTool.getWarehousePreset();
    state.presetWarehouses = preset?.rows || [];
    updateWarehousePresetMeta();
  } catch (err) {
    console.error('Failed to load warehouse preset:', err);
  }
}

function updateWarehousePresetMeta() {
  const count = state.presetWarehouses.length;
  const factories = [...new Set(state.presetWarehouses.map((w) => w.factory).filter(Boolean))];
  if (refs.warehousePresetMeta) {
    refs.warehousePresetMeta.textContent = `已预设 ${count} 个仓库对应关系（${factories.slice(0, 4).join('、')}${factories.length > 4 ? '等' : ''}）`;
  }
}

function openWarehousePresetDialog() {
  if (refs.addWarehouseForm) refs.addWarehouseForm.classList.add('hidden');
  if (refs.warehousePresetSearchInput) refs.warehousePresetSearchInput.value = '';
  state.warehousePresetSearch = '';
  renderWarehousePresetTable();
  refs.warehousePresetDialog.showModal();
}

function renderWarehousePresetTable() {
  const query = (state.warehousePresetSearch || '').trim().toLowerCase();
  const rows = state.presetWarehouses;
  const filtered = rows.filter((r) => {
    if (!query) return true;
    return (
      String(r.warehouseName || '').toLowerCase().includes(query) ||
      String(r.warehouseCode || '').toLowerCase().includes(query) ||
      String(r.factory || '').toLowerCase().includes(query) ||
      String(r.region || '').toLowerCase().includes(query) ||
      String(r.logicName || '').toLowerCase().includes(query) ||
      String(r.note || '').toLowerCase().includes(query)
    );
  });

  if (refs.warehousePresetCountBadge) {
    refs.warehousePresetCountBadge.textContent = `共 ${rows.length} 个仓库${query ? `（匹配 ${filtered.length} 个）` : ''}`;
  }
  if (!refs.warehousePresetTableBody) return;
  refs.warehousePresetTableBody.replaceChildren();

  filtered.forEach((r, idx) => {
    const tr = document.createElement('tr');

    const tdIdx = document.createElement('td');
    tdIdx.className = 'wh-col-idx';
    tdIdx.textContent = r.id || idx + 1;

    const tdReg = document.createElement('td');
    tdReg.className = 'wh-col-reg';
    tdReg.textContent = r.region || '';

    const tdCode = document.createElement('td');
    tdCode.className = 'wh-col-code';
    tdCode.textContent = r.warehouseCode || '';

    const tdName = document.createElement('td');
    tdName.textContent = r.warehouseName || '';
    tdName.className = 'wh-col-name td-wh-name';

    const tdLogic = document.createElement('td');
    tdLogic.className = 'wh-col-logic';
    tdLogic.textContent = r.logicName || '';

    const tdFac = document.createElement('td');
    tdFac.textContent = r.factory || '';
    tdFac.className = 'wh-col-fac td-wh-fac';

    const tdNote = document.createElement('td');
    tdNote.className = 'wh-col-note';
    tdNote.textContent = r.note || '';

    const tdAction = document.createElement('td');
    tdAction.className = 'wh-col-action';
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-product-btn';
    delBtn.type = 'button';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => handleDeleteWarehousePreset(r));
    tdAction.append(delBtn);

    tr.append(tdIdx, tdReg, tdCode, tdName, tdLogic, tdFac, tdNote, tdAction);
    refs.warehousePresetTableBody.append(tr);
  });
}

function toggleAddWarehouseForm(show) {
  const isHidden = refs.addWarehouseForm.classList.contains('hidden');
  const shouldShow = typeof show === 'boolean' ? show : isHidden;
  refs.addWarehouseForm.classList.toggle('hidden', !shouldShow);
  if (shouldShow && refs.newWarehouseName) refs.newWarehouseName.focus();
}

async function handleSaveNewWarehouse(event) {
  event.preventDefault();
  const name = refs.newWarehouseName.value.trim();
  const factory = refs.newWarehouseFactory.value.trim();
  if (!name || !factory) return showToast('请填写仓库名称和发货米厂');

  const newRow = {
    id: state.presetWarehouses.length + 1,
    region: refs.newWarehouseRegion.value.trim(),
    warehouseCode: refs.newWarehouseCode.value.trim(),
    warehouseName: name,
    logicCode: '',
    logicName: refs.newLogicWarehouseName.value.trim(),
    factory: factory.endsWith('米厂') || factory.endsWith('工厂') ? factory : `${factory}米厂`,
    note: refs.newWarehouseNote.value.trim()
  };

  state.presetWarehouses.push(newRow);
  await window.excelTool.saveWarehousePreset(state.presetWarehouses);
  updateWarehousePresetMeta();
  refs.addWarehouseForm.reset();
  refs.addWarehouseForm.classList.add('hidden');
  renderWarehousePresetTable();
  showToast(`已新增仓库对应：${name} -> ${newRow.factory}`);
}

async function handleDeleteWarehousePreset(target) {
  if (!confirm(`确定要删除“${target.warehouseName}”与“${target.factory}”的对应关系吗？`)) return;
  state.presetWarehouses = state.presetWarehouses.filter((r) => r !== target);
  state.presetWarehouses.forEach((r, i) => { r.id = i + 1; });
  await window.excelTool.saveWarehousePreset(state.presetWarehouses);
  updateWarehousePresetMeta();
  renderWarehousePresetTable();
  showToast(`已删除仓库对应：${target.warehouseName}`);
}

async function handleImportWarehousePreset() {
  try {
    const result = await window.excelTool.importWarehousePreset();
    if (!result) return;
    state.presetWarehouses = result.rows;
    updateWarehousePresetMeta();
    renderWarehousePresetTable();
    showToast(`成功导入并覆盖仓库对应表，共 ${result.count} 个仓库`);
  } catch (err) {
    showToast(err.message || '导入失败，请检查文件格式');
  }
}

async function handleResetWarehousePreset() {
  if (!confirm('确定要恢复为内置默认仓库米厂对应表吗？自定义配置将被重置。')) return;
  try {
    const result = await window.excelTool.resetWarehousePreset();
    state.presetWarehouses = result.rows;
    updateWarehousePresetMeta();
    renderWarehousePresetTable();
    showToast(`已恢复为默认仓库米厂对应表（共 ${result.count} 个仓库）`);
  } catch (err) {
    showToast(err.message || '恢复失败');
  }
}

async function initProductPreset() {
  try {
    const preset = await window.excelTool.getProductPreset();
    state.presetProducts = preset?.rows || [];
    applyPresetToDelivery(state.presetProducts);
  } catch (err) {
    console.error('Failed to load product preset:', err);
  }
}

function applyPresetToDelivery(rows) {
  state.delivery.product = {
    fileName: '全局预设',
    sheetName: '商品主数据',
    headers: ['序号', '货品名称（带空格）', '条码', '品牌名称', '备注', '规格kg', '采购规格(箱规数)', '订单简称', '企业微信申报订单简称'],
    rows
  };
  refs.productSlot.classList.add('loaded');
  const brands = [...new Set(rows.map((r) => r['品牌名称']).filter(Boolean))];
  refs.productMeta.textContent = `已预设 ${rows.length} 个商品 · 涵盖 ${brands.slice(0, 3).join('、')}${brands.length > 3 ? '等' : ''}`;
}

function openProductPresetDialog() {
  refs.addProductForm.classList.add('hidden');
  refs.presetSearchInput.value = '';
  state.presetSearch = '';
  renderPresetTable();
  refs.productPresetDialog.showModal();
}

function renderPresetTable() {
  const query = state.presetSearch.trim().toLowerCase();
  const rows = state.presetProducts;
  const filtered = rows.filter((r) => {
    if (!query) return true;
    return (
      String(r['订单简称'] || '').toLowerCase().includes(query) ||
      String(r['条码'] || '').toLowerCase().includes(query) ||
      String(r['品牌名称'] || '').toLowerCase().includes(query) ||
      String(r['货品名称（带空格）'] || '').toLowerCase().includes(query)
    );
  });

  refs.presetCountBadge.textContent = `共 ${rows.length} 个商品${query ? `（匹配 ${filtered.length} 个）` : ''}`;
  refs.presetTableBody.replaceChildren();

  filtered.forEach((r, idx) => {
    const tr = document.createElement('tr');

    const tdIdx = document.createElement('td');
    tdIdx.textContent = r['序号'] || idx + 1;

    const tdBrand = document.createElement('td');
    tdBrand.textContent = r['品牌名称'] || '';

    const tdBarcode = document.createElement('td');
    tdBarcode.textContent = r['条码'] || '';

    const tdShortName = document.createElement('td');
    tdShortName.textContent = r['订单简称'] || '';

    const tdSpec = document.createElement('td');
    tdSpec.textContent = r['规格kg'] ?? '';

    const tdBox = document.createElement('td');
    tdBox.textContent = r['采购规格(箱规数)'] ?? '';

    const tdFullName = document.createElement('td');
    tdFullName.textContent = r['货品名称（带空格）'] || '';

    const tdAction = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-product-btn';
    delBtn.type = 'button';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => handleDeletePresetProduct(r));
    tdAction.append(delBtn);

    tr.append(tdIdx, tdBrand, tdBarcode, tdShortName, tdSpec, tdBox, tdFullName, tdAction);
    refs.presetTableBody.append(tr);
  });
}

function toggleAddProductForm(show) {
  const isHidden = refs.addProductForm.classList.contains('hidden');
  const shouldShow = typeof show === 'boolean' ? show : isHidden;
  refs.addProductForm.classList.toggle('hidden', !shouldShow);
  if (shouldShow) refs.newProductBrand.focus();
}

async function handleSaveNewProduct(event) {
  event.preventDefault();
  const brand = refs.newProductBrand.value.trim();
  const barcode = refs.newProductBarcode.value.trim();
  const shortName = refs.newProductShortName.value.trim();
  const spec = Number(refs.newProductSpec.value) || 0;
  const boxSpec = Number(refs.newProductBoxSpec.value) || 1;
  const note = refs.newProductNote.value.trim();
  const fullName = refs.newProductFullName.value.trim();

  if (!brand || !barcode || !shortName || !fullName) {
    return showToast('请填写所有必填字段');
  }

  const newRow = {
    '序号': state.presetProducts.length + 1,
    '货品名称（带空格）': fullName,
    '条码': barcode,
    '品牌名称': brand,
    '备注': note,
    '规格kg': spec,
    '采购规格(箱规数)': boxSpec,
    '订单简称': shortName,
    '企业微信申报订单简称': shortName
  };

  state.presetProducts.push(newRow);
  await window.excelTool.saveProductPreset(state.presetProducts);
  applyPresetToDelivery(state.presetProducts);

  refs.addProductForm.reset();
  refs.addProductForm.classList.add('hidden');
  renderPresetTable();
  if (state.delivery.receipt) await analyzeDelivery();
  showToast(`已新增商品：${shortName}`);
}

async function handleDeletePresetProduct(target) {
  const name = target['订单简称'] || target['货品名称（带空格）'];
  if (!confirm(`确定要从全局预设中删除商品“${name}”吗？`)) return;

  state.presetProducts = state.presetProducts.filter((r) => r !== target);
  state.presetProducts.forEach((r, i) => { r['序号'] = i + 1; });
  await window.excelTool.saveProductPreset(state.presetProducts);
  applyPresetToDelivery(state.presetProducts);

  renderPresetTable();
  if (state.delivery.receipt) await analyzeDelivery();
  showToast(`已删除商品：${name}`);
}

async function handleImportPresetExcel() {
  try {
    const result = await window.excelTool.importProductPreset();
    if (!result) return;
    state.presetProducts = result.rows;
    applyPresetToDelivery(state.presetProducts);
    renderPresetTable();
    if (state.delivery.receipt) await analyzeDelivery();
    showToast(`成功导入并覆盖全局预设，共 ${result.count} 个商品`);
  } catch (err) {
    showToast(err.message || '导入失败，请检查文件格式');
  }
}

async function handleResetPreset() {
  if (!confirm('确定要恢复为内置默认商品主数据吗？自定义添加的商品将被重置。')) return;
  try {
    const result = await window.excelTool.resetProductPreset();
    state.presetProducts = result.rows;
    applyPresetToDelivery(state.presetProducts);
    renderPresetTable();
    if (state.delivery.receipt) await analyzeDelivery();
    showToast(`已恢复为内置默认商品主数据（共 ${result.count} 个商品）`);
  } catch (err) {
    showToast(err.message || '恢复失败');
  }
}

function handleDeliveryDemand() {
  if (!state.delivery.receipt || !state.delivery.analysis) {
    return showDeliveryNotice('请先导入 ReceiptNote 入库明细。', 'error');
  }
  const selectedBrands = state.delivery.selectedBrands;
  const selectedWarehouses = state.delivery.selectedWarehouses;
  const selectedReceiptRows = state.delivery.receipt.rows.filter((r) =>
    selectedWarehouses.has(String(r['仓库名称'] || '').trim()) &&
    selectedBrands.has(String(r['品牌名称'] || '').trim())
  );
  if (!selectedReceiptRows.length) {
    return showDeliveryNotice('请至少选择一个包含有效明细的品牌与仓库。', 'error');
  }
  const sourceMeta = `基于送货单选中的 ${selectedWarehouses.size} 个仓库、${selectedBrands.size} 个品牌明细（共 ${selectedReceiptRows.length} 条数据）`;
  openDemandModal(selectedReceiptRows, sourceMeta);
}

refs.table1Btn.addEventListener('click', () => importFile('table1'));
refs.table2Btn.addEventListener('click', () => importFile('table2'));
refs.exportBtn.addEventListener('click', exportResult);
refs.backfillBtn.addEventListener('click', openBackfill);
refs.confirmBackfillBtn.addEventListener('click', exportBackfill);
refs.demandBtn.addEventListener('click', () => openDemandModal());
refs.demandBaseDateInput.addEventListener('change', handleDemandBaseDateChange);
refs.demandImportReceiptBtn.addEventListener('click', () => handleImportDemand('receipt'));
refs.demandImportTable3Btn.addEventListener('click', () => handleImportDemand('table3'));
refs.confirmDemandBtn.addEventListener('click', handleExportDemand);
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
refs.inventoryTab.addEventListener('click', () => switchWorkflow('inventory'));
refs.deliveryTab.addEventListener('click', () => switchWorkflow('delivery'));
refs.inventoryTable3Btn.addEventListener('click', () => importInventoryUpdateFile('table3'));
refs.liveInventoryBtn.addEventListener('click', () => importInventoryUpdateFile('inventory'));
refs.transitBtn.addEventListener('click', () => importInventoryUpdateFile('transit'));
refs.exportInventoryBtn.addEventListener('click', exportInventoryUpdate);
if (refs.productBtn) refs.productBtn.addEventListener('click', () => importDeliveryFile('product'));
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

if (refs.deliveryDemandBtn) refs.deliveryDemandBtn.addEventListener('click', handleDeliveryDemand);

if (refs.manageWarehousePresetBtn) refs.manageWarehousePresetBtn.addEventListener('click', openWarehousePresetDialog);
if (refs.importWarehousePresetBtn) refs.importWarehousePresetBtn.addEventListener('click', handleImportWarehousePreset);
if (refs.demandManageWarehousePresetBtn) refs.demandManageWarehousePresetBtn.addEventListener('click', openWarehousePresetDialog);
if (refs.closeWarehousePresetDialogBtn) refs.closeWarehousePresetDialogBtn.addEventListener('click', () => refs.warehousePresetDialog.close());
if (refs.closeWarehousePresetBtn) refs.closeWarehousePresetBtn.addEventListener('click', () => refs.warehousePresetDialog.close());
if (refs.toggleAddWarehouseBtn) refs.toggleAddWarehouseBtn.addEventListener('click', () => toggleAddWarehouseForm());
if (refs.cancelAddWarehouseBtn) refs.cancelAddWarehouseBtn.addEventListener('click', () => toggleAddWarehouseForm(false));
if (refs.addWarehouseForm) refs.addWarehouseForm.addEventListener('submit', handleSaveNewWarehouse);
if (refs.importWarehousePresetExcelBtn) refs.importWarehousePresetExcelBtn.addEventListener('click', handleImportWarehousePreset);
if (refs.resetWarehousePresetBtn) refs.resetWarehousePresetBtn.addEventListener('click', handleResetWarehousePreset);
if (refs.warehousePresetSearchInput) refs.warehousePresetSearchInput.addEventListener('input', (e) => { state.warehousePresetSearch = e.target.value; renderWarehousePresetTable(); });

if (refs.manageProductPresetBtn) refs.manageProductPresetBtn.addEventListener('click', openProductPresetDialog);
if (refs.importProductPresetBtn) refs.importProductPresetBtn.addEventListener('click', handleImportPresetExcel);
if (refs.closePresetDialogBtn) refs.closePresetDialogBtn.addEventListener('click', () => refs.productPresetDialog.close());
if (refs.closePresetBtn) refs.closePresetBtn.addEventListener('click', () => refs.productPresetDialog.close());
if (refs.toggleAddProductBtn) refs.toggleAddProductBtn.addEventListener('click', () => toggleAddProductForm());
if (refs.cancelAddProductBtn) refs.cancelAddProductBtn.addEventListener('click', () => toggleAddProductForm(false));
if (refs.addProductForm) refs.addProductForm.addEventListener('submit', handleSaveNewProduct);
if (refs.importPresetExcelBtn) refs.importPresetExcelBtn.addEventListener('click', handleImportPresetExcel);
if (refs.resetPresetBtn) refs.resetPresetBtn.addEventListener('click', handleResetPreset);
if (refs.presetSearchInput) refs.presetSearchInput.addEventListener('input', (e) => { state.presetSearch = e.target.value; renderPresetTable(); });


refs.supplierNameInput.value = state.delivery.supplierName;
refs.shelfLifeInput.value = state.delivery.shelfLife;
refs.contactInput.value = state.delivery.contact;
refs.splitByWarehouseInput.checked = state.delivery.splitByWarehouse;
renderEmpty();
renderInventoryUpdate();
renderDeliveryState();
switchWorkflow('summary');
initProductPreset();
initWarehousePreset();

// ==========================================
// 猫超开票通知单业务逻辑
// ==========================================

function showInvoiceNotice(message, type = 'warning') {
  if (!refs.invoiceNotice) return;
  refs.invoiceNotice.textContent = message;
  refs.invoiceNotice.classList.remove('hidden', 'error', 'success');
  if (type !== 'warning') refs.invoiceNotice.classList.add(type);
}

function clearInvoiceNotice() {
  if (!refs.invoiceNotice) return;
  refs.invoiceNotice.classList.add('hidden');
  refs.invoiceNotice.textContent = '';
}

function formatCurrentDate() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

async function initInvoiceModule() {
  if (!refs.invoiceTab) return;

  // 1. 加载持久化配置
  try {
    const storedCfg = await window.excelTool.getInvoiceConfig();
    if (storedCfg) {
      state.invoice.config = { ...state.invoice.config, ...storedCfg };
    }
  } catch (err) {
    console.error('Failed to load invoice config:', err);
  }

  // 2. 填充表单字段
  if (refs.invoiceDateInput) {
    refs.invoiceDateInput.value = state.invoice.config.date || formatCurrentDate();
  }
  if (refs.invoiceApplicantInput) {
    if (!state.invoice.config.applicant || state.invoice.config.applicant === '刘雯') {
      state.invoice.config.applicant = '丁锐杰';
      localStorage.setItem('invoiceApplicant', '丁锐杰');
    }
    refs.invoiceApplicantInput.value = state.invoice.config.applicant;
  }
  if (refs.invoicePlatformInput) {
    refs.invoicePlatformInput.value = state.invoice.config.platform || '国宝猫超';
  }
  if (refs.invoiceWarehouseInput) {
    refs.invoiceWarehouseInput.value = state.invoice.config.warehouse || '';
  }

  // 3. 监听输入框变化并持久化
  if (refs.invoiceApplicantInput) {
    refs.invoiceApplicantInput.addEventListener('change', () => {
      state.invoice.config.applicant = refs.invoiceApplicantInput.value.trim();
      localStorage.setItem('invoiceApplicant', state.invoice.config.applicant);
      window.excelTool.saveInvoiceConfig(state.invoice.config);
    });
  }
  if (refs.invoiceDateInput) {
    refs.invoiceDateInput.addEventListener('change', () => {
      state.invoice.config.date = refs.invoiceDateInput.value.trim();
    });
  }
  if (refs.invoicePlatformInput) {
    refs.invoicePlatformInput.addEventListener('change', () => {
      state.invoice.config.platform = refs.invoicePlatformInput.value.trim();
      window.excelTool.saveInvoiceConfig(state.invoice.config);
    });
  }
  if (refs.invoiceWarehouseInput) {
    refs.invoiceWarehouseInput.addEventListener('change', () => {
      state.invoice.config.warehouse = refs.invoiceWarehouseInput.value.trim();
      window.excelTool.saveInvoiceConfig(state.invoice.config);
    });
  }

  // 4. 按钮事件绑定
  if (refs.invoiceTab) {
    refs.invoiceTab.addEventListener('click', () => switchWorkflow('invoice'));
  }
  if (refs.invoiceFilesBtn) {
    refs.invoiceFilesBtn.addEventListener('click', handleSelectInvoiceFiles);
  }
  if (refs.invoiceClearFilesBtn) {
    refs.invoiceClearFilesBtn.addEventListener('click', handleClearInvoiceFiles);
  }
  if (refs.exportInvoiceBtn) {
    refs.exportInvoiceBtn.addEventListener('click', handleExportInvoice);
  }
  if (refs.invoiceSearchInput) {
    refs.invoiceSearchInput.addEventListener('input', (e) => {
      state.invoice.searchKeyword = e.target.value.trim().toLowerCase();
      renderInvoiceTable();
    });
  }

  // 5. 开票资料弹窗
  if (refs.invoiceConfigModalBtn) {
    refs.invoiceConfigModalBtn.addEventListener('click', openInvoiceConfigDialog);
  }
  if (refs.closeInvoiceConfigXBtn) {
    refs.closeInvoiceConfigXBtn.addEventListener('click', closeInvoiceConfigDialog);
  }
  if (refs.saveInvoiceConfigBtn) {
    refs.saveInvoiceConfigBtn.addEventListener('click', handleSaveInvoiceConfig);
  }
  if (refs.resetInvoiceConfigBtn) {
    refs.resetInvoiceConfigBtn.addEventListener('click', handleResetInvoiceConfig);
  }
}

async function handleSelectInvoiceFiles() {
  clearInvoiceNotice();
  try {
    const filePaths = await window.excelTool.openInvoiceFiles();
    if (!filePaths || !filePaths.length) return;

    // 追加并去重已选文件
    const currentPaths = new Set(state.invoice.filePaths);
    filePaths.forEach(fp => currentPaths.add(fp));
    state.invoice.filePaths = Array.from(currentPaths);

    refs.invoiceFilesBtn.disabled = true;
    refs.invoiceFilesBtn.textContent = '正在解析...';

    const parseResult = await window.excelTool.parseInvoiceFiles(state.invoice.filePaths);
    state.invoice.files = parseResult.files || [];
    state.invoice.rawRows = parseResult.rows || [];
    state.invoice.availableFeeTypes = parseResult.availableFeeTypes || [];
    state.invoice.availableInvoiceDirs = parseResult.availableInvoiceDirs || [];

    // 默认全选
    state.invoice.selectedFeeTypes = new Set(state.invoice.availableFeeTypes);
    state.invoice.selectedInvoiceDirs = new Set(state.invoice.availableInvoiceDirs);

    // 更新槽位状态
    refs.invoiceFilesSlot.classList.add('loaded');
    refs.invoiceFilesMeta.textContent = `已导入 ${state.invoice.files.length} 个文件 · 共 ${state.invoice.rawRows.length} 条明细`;
    refs.invoiceFilesBtn.textContent = '+ 继续追加';

    // 渲染文件列表与筛选芯片
    renderInvoiceFileChips();
    renderInvoiceFilterChips();

    // 运行汇总计算
    await runInvoiceCalculation();
    showToast(`成功解析 ${state.invoice.files.length} 个对账单，共 ${state.invoice.rawRows.length} 条明细`);
  } catch (err) {
    showInvoiceNotice(err.message || '对账单读取失败，请检查文件格式。', 'error');
  } finally {
    refs.invoiceFilesBtn.disabled = false;
    if (refs.invoiceFilesBtn.textContent === '正在解析...') {
      refs.invoiceFilesBtn.textContent = state.invoice.files.length ? '+ 继续追加' : '选择对账单';
    }
  }
}

function handleRemoveInvoiceFile(filePath) {
  state.invoice.filePaths = state.invoice.filePaths.filter(fp => fp !== filePath);
  if (!state.invoice.filePaths.length) {
    handleClearInvoiceFiles();
    return;
  }
  window.excelTool.parseInvoiceFiles(state.invoice.filePaths).then(parseResult => {
    state.invoice.files = parseResult.files || [];
    state.invoice.rawRows = parseResult.rows || [];
    state.invoice.availableFeeTypes = parseResult.availableFeeTypes || [];
    state.invoice.availableInvoiceDirs = parseResult.availableInvoiceDirs || [];

    state.invoice.selectedFeeTypes = new Set(
      Array.from(state.invoice.selectedFeeTypes).filter(t => state.invoice.availableFeeTypes.includes(t))
    );
    if (!state.invoice.selectedFeeTypes.size) {
      state.invoice.selectedFeeTypes = new Set(state.invoice.availableFeeTypes);
    }
    state.invoice.selectedInvoiceDirs = new Set(
      Array.from(state.invoice.selectedInvoiceDirs).filter(d => state.invoice.availableInvoiceDirs.includes(d))
    );
    if (!state.invoice.selectedInvoiceDirs.size) {
      state.invoice.selectedInvoiceDirs = new Set(state.invoice.availableInvoiceDirs);
    }

    renderInvoiceFileChips();
    renderInvoiceFilterChips();
    runInvoiceCalculation();
  }).catch(err => {
    showInvoiceNotice(err.message, 'error');
  });
}

function handleClearInvoiceFiles() {
  state.invoice.filePaths = [];
  state.invoice.files = [];
  state.invoice.rawRows = [];
  state.invoice.availableFeeTypes = [];
  state.invoice.availableInvoiceDirs = [];
  state.invoice.selectedFeeTypes.clear();
  state.invoice.selectedInvoiceDirs.clear();
  state.invoice.summaryResult = null;

  refs.invoiceFilesSlot.classList.remove('loaded');
  refs.invoiceFilesMeta.textContent = '支持多选或多次追加多个对账单 Excel';
  refs.invoiceFilesBtn.textContent = '选择对账单';

  refs.invoiceFileListSection.classList.add('hidden');
  refs.invoiceFilterSection.classList.add('hidden');
  refs.invoiceTableWrap.classList.add('hidden');
  refs.invoiceEmptyState.classList.remove('hidden');

  refs.invoiceBillCountMetric.textContent = '0';
  refs.invoiceProductCountMetric.textContent = '0';
  refs.invoiceRowCountMetric.textContent = '0';
  refs.invoiceQtyMetric.textContent = '0';
  refs.invoiceAmountMetric.textContent = '0.00';

  refs.invoiceModeBadge.textContent = '等待导入对账单';
  refs.exportInvoiceBtn.disabled = true;
  refs.invoiceSearchInput.disabled = true;
  refs.invoiceSearchInput.value = '';
  clearInvoiceNotice();
}

function renderInvoiceFileChips() {
  if (!state.invoice.files.length) {
    refs.invoiceFileListSection.classList.add('hidden');
    return;
  }
  refs.invoiceFileListSection.classList.remove('hidden');
  refs.invoiceFileCount.textContent = state.invoice.files.length;
  refs.invoiceFileChips.replaceChildren();

  state.invoice.files.forEach(f => {
    const chip = document.createElement('div');
    chip.className = 'invoice-file-chip';
    chip.innerHTML = `
      <span>📄 <strong>${f.fileName}</strong> <small style="color:var(--muted)">(${f.rowCount}行${f.timeRange ? ' · ' + f.timeRange : ''})</small></span>
      <button type="button" class="remove-file-btn" title="移除此文件">×</button>
    `;
    chip.querySelector('.remove-file-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      handleRemoveInvoiceFile(f.filePath);
    });
    refs.invoiceFileChips.appendChild(chip);
  });
}

function renderInvoiceFilterChips() {
  if (!state.invoice.rawRows.length) {
    refs.invoiceFilterSection.classList.add('hidden');
    return;
  }
  refs.invoiceFilterSection.classList.remove('hidden');

  // 1. 费用类型
  refs.invoiceFeeTypeChips.replaceChildren();
  state.invoice.availableFeeTypes.forEach(feeType => {
    const isChecked = state.invoice.selectedFeeTypes.has(feeType);
    const chip = document.createElement('label');
    chip.className = `filter-chip ${isChecked ? 'active' : ''}`;
    chip.innerHTML = `
      <input type="checkbox" ${isChecked ? 'checked' : ''}>
      <span>${feeType}</span>
    `;
    const input = chip.querySelector('input');
    input.addEventListener('change', () => {
      if (input.checked) {
        state.invoice.selectedFeeTypes.add(feeType);
        chip.classList.add('active');
      } else {
        state.invoice.selectedFeeTypes.delete(feeType);
        chip.classList.remove('active');
      }
      runInvoiceCalculation();
    });
    refs.invoiceFeeTypeChips.appendChild(chip);
  });

  // 2. 发票方向
  refs.invoiceDirChips.replaceChildren();
  state.invoice.availableInvoiceDirs.forEach(dir => {
    const isChecked = state.invoice.selectedInvoiceDirs.has(dir);
    const chip = document.createElement('label');
    chip.className = `filter-chip ${isChecked ? 'active' : ''}`;
    chip.innerHTML = `
      <input type="checkbox" ${isChecked ? 'checked' : ''}>
      <span>${dir}</span>
    `;
    const input = chip.querySelector('input');
    input.addEventListener('change', () => {
      if (input.checked) {
        state.invoice.selectedInvoiceDirs.add(dir);
        chip.classList.add('active');
      } else {
        state.invoice.selectedInvoiceDirs.delete(dir);
        chip.classList.remove('active');
      }
      runInvoiceCalculation();
    });
    refs.invoiceDirChips.appendChild(chip);
  });
}

async function runInvoiceCalculation() {
  if (!state.invoice.rawRows.length) return;

  const result = await window.excelTool.calculateInvoice({
    rows: state.invoice.rawRows,
    selectedFeeTypes: Array.from(state.invoice.selectedFeeTypes),
    selectedInvoiceDirs: Array.from(state.invoice.selectedInvoiceDirs)
  });

  state.invoice.summaryResult = result;

  const billCount = new Set(state.invoice.rawRows.map(r => r.billNo).filter(Boolean)).size;
  refs.invoiceBillCountMetric.textContent = billCount;
  refs.invoiceProductCountMetric.textContent = result.productCount;
  refs.invoiceRowCountMetric.textContent = result.matchedRowCount;
  refs.invoiceQtyMetric.textContent = result.totalQty.toLocaleString();
  refs.invoiceAmountMetric.textContent = result.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (result.items.length > 0) {
    refs.invoiceEmptyState.classList.add('hidden');
    refs.invoiceTableWrap.classList.remove('hidden');
    refs.exportInvoiceBtn.disabled = false;
    refs.invoiceSearchInput.disabled = false;
    refs.invoiceModeBadge.textContent = `就绪 · ${result.productCount} 种商品 · ${result.totalQty} 袋`;
  } else {
    refs.invoiceEmptyState.classList.remove('hidden');
    refs.invoiceTableWrap.classList.add('hidden');
    refs.exportInvoiceBtn.disabled = true;
    refs.invoiceSearchInput.disabled = true;
    refs.invoiceModeBadge.textContent = '当前筛选条件下无结算商品';
  }

  renderInvoiceTable();
}

function renderInvoiceTable() {
  if (!state.invoice.summaryResult) return;
  const items = state.invoice.summaryResult.items || [];
  const keyword = state.invoice.searchKeyword;

  const filtered = keyword
    ? items.filter(it => it.shortName.toLowerCase().includes(keyword) || (it.spec && it.spec.toLowerCase().includes(keyword)))
    : items;

  refs.invoiceTableBody.replaceChildren();

  let visibleQty = 0;
  let visibleAmount = 0;

  filtered.forEach((item, index) => {
    visibleQty += item.qty;
    visibleAmount += item.amount;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-num">${index + 1}</td>
      <td class="col-product">${item.shortName}</td>
      <td class="col-spec">${item.spec || '-'}</td>
      <td class="col-qty">${item.qty.toLocaleString()}</td>
      <td class="col-price">${item.unitPrice.toFixed(4)}</td>
      <td class="col-amount">${item.amount.toFixed(2)}</td>
      <td class="col-match">
        <span class="match-badge ${item.matched ? 'ok' : 'warn'}">
          ${item.matched ? '已匹配' : '未在预设'}
        </span>
      </td>
      <td class="col-remark">来源 ${item.detailCount} 行</td>
    `;
    refs.invoiceTableBody.appendChild(tr);
  });

  refs.invoiceFootQty.textContent = visibleQty.toLocaleString();
  refs.invoiceFootAmount.textContent = visibleAmount.toFixed(2);
}

async function handleExportInvoice() {
  if (!state.invoice.summaryResult || !state.invoice.summaryResult.items.length) {
    showNotice('没有可导出的开票商品。', 'error');
    return;
  }

  refs.exportInvoiceBtn.disabled = true;
  refs.exportInvoiceBtn.textContent = '正在导出...';

  try {
    const dateVal = refs.invoiceDateInput.value.trim() || formatCurrentDate();
    const applicantVal = refs.invoiceApplicantInput.value.trim() || '丁锐杰';
    const platformVal = refs.invoicePlatformInput.value.trim() || '国宝猫超';
    const warehouseVal = refs.invoiceWarehouseInput.value.trim() || '';

    const exportConfig = {
      ...state.invoice.config,
      date: dateVal,
      applicant: applicantVal,
      platform: platformVal,
      warehouse: warehouseVal
    };

    const defaultFileName = `开票通知单_${platformVal}_${dateVal}.xlsx`;

    const res = await window.excelTool.exportInvoice({
      items: state.invoice.summaryResult.items,
      config: exportConfig,
      defaultFileName
    });

    if (res && res.ok) {
      showToast(`开票通知单导出成功！共 ${res.itemCount} 种商品`);
    }
  } catch (err) {
    showInvoiceNotice(err.message || '导出开票通知单失败。', 'error');
  } finally {
    refs.exportInvoiceBtn.disabled = false;
    refs.exportInvoiceBtn.textContent = '导出开票通知单';
  }
}

function openInvoiceConfigDialog() {
  const cfg = state.invoice.config;
  refs.cfgInvoiceType.value = cfg.invoiceType || '专用发票';
  refs.cfgCompanyTitle.value = cfg.companyTitle || '浙江昊超网络科技有限公司';
  refs.cfgTaxId.value = cfg.taxId || '91330110MA2GK1DN85';
  refs.cfgAddress.value = cfg.address || '杭州市余杭区五常街道文一西路969号3幢5层551室';
  refs.cfgPhone.value = cfg.phone || '0571-85022088';
  refs.cfgBank.value = cfg.bank || '招商银行股份有限公司杭州高新支行';
  refs.cfgAccount.value = cfg.account || '571913080610506';
  refs.cfgMailRecipient.value = cfg.mailRecipient || '武汉营销中心1293737582@qq.com';
  refs.invoiceConfigDialog.showModal();
}

function closeInvoiceConfigDialog() {
  refs.invoiceConfigDialog.close();
}

async function handleSaveInvoiceConfig() {
  state.invoice.config.invoiceType = refs.cfgInvoiceType.value.trim();
  state.invoice.config.companyTitle = refs.cfgCompanyTitle.value.trim();
  state.invoice.config.taxId = refs.cfgTaxId.value.trim();
  state.invoice.config.address = refs.cfgAddress.value.trim();
  state.invoice.config.phone = refs.cfgPhone.value.trim();
  state.invoice.config.bank = refs.cfgBank.value.trim();
  state.invoice.config.account = refs.cfgAccount.value.trim();
  state.invoice.config.mailRecipient = refs.cfgMailRecipient.value.trim();

  await window.excelTool.saveInvoiceConfig(state.invoice.config);
  closeInvoiceConfigDialog();
  showToast('开票资料保存成功');
}

async function handleResetInvoiceConfig() {
  const defaultCfg = {
    invoiceType: '专用发票',
    companyTitle: '浙江昊超网络科技有限公司',
    taxId: '91330110MA2GK1DN85',
    address: '杭州市余杭区五常街道文一西路969号3幢5层551室',
    phone: '0571-85022088',
    bank: '招商银行股份有限公司杭州高新支行',
    account: '571913080610506',
    mailRecipient: '武汉营销中心1293737582@qq.com'
  };
  refs.cfgInvoiceType.value = defaultCfg.invoiceType;
  refs.cfgCompanyTitle.value = defaultCfg.companyTitle;
  refs.cfgTaxId.value = defaultCfg.taxId;
  refs.cfgAddress.value = defaultCfg.address;
  refs.cfgPhone.value = defaultCfg.phone;
  refs.cfgBank.value = defaultCfg.bank;
  refs.cfgAccount.value = defaultCfg.account;
  refs.cfgMailRecipient.value = defaultCfg.mailRecipient;

  state.invoice.config = { ...state.invoice.config, ...defaultCfg };
  await window.excelTool.saveInvoiceConfig(state.invoice.config);
  showToast('已恢复默认开票资料');
}

initInvoiceModule();
