'use strict';

const state = {
  table1: null,
  table2: null,
  brand: '',
  mapping: loadJson('warehouseMapping', {}),
  actualOrders: {},
  warehouseStatus: {},
  result: null,
  mappingRows: [],
  mappingDraft: {}
};

const el = (id) => document.getElementById(id);
const refs = {
  table1Btn: el('table1Btn'), table2Btn: el('table2Btn'), exportBtn: el('exportBtn'),
  table1Meta: el('table1Meta'), table2Meta: el('table2Meta'), table1Slot: el('table1Slot'), table2Slot: el('table2Slot'),
  brandSelect: el('brandSelect'), mappingBtn: el('mappingBtn'), mappingCount: el('mappingCount'), modeBadge: el('modeBadge'),
  notice: el('notice'), emptyState: el('emptyState'), tableWrap: el('tableWrap'), resultBody: el('resultBody'), searchInput: el('searchInput'),
  warehouseMetric: el('warehouseMetric'), productMetric: el('productMetric'), rowMetric: el('rowMetric'), orderMetric: el('orderMetric'), weightMetric: el('weightMetric'),
  mappingDialog: el('mappingDialog'), mappingList: el('mappingList'), mappingSearch: el('mappingSearch'), mappingSummary: el('mappingSummary'), saveMappingBtn: el('saveMappingBtn'),
  toast: el('toast')
};

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value) || 0);
}

function showToast(message) {
  refs.toast.textContent = message;
  refs.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => refs.toast.classList.remove('show'), 2600);
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
    warehouseStatus: state.warehouseStatus
  });
  renderMetrics();
  renderTable();
  updateMode();
  const unresolvedCount = state.mappingRows.filter((row) => row.orders && !state.mapping[row.source]).length;
  refs.mappingCount.textContent = state.table1 ? `(${unresolvedCount} 待处理)` : '';
  refs.mappingBtn.disabled = !state.table1;
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
  ['warehouseMetric', 'productMetric', 'rowMetric', 'orderMetric'].forEach((key) => refs[key].textContent = '0');
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
      input.type = 'number'; input.min = '0'; input.max = String(row.systemOrder); input.step = String(row.boxSpec); input.value = row.actualOrder || '';
      input.disabled = row.systemOrder === 0;
      input.title = `系统建议 ${formatNumber(row.suggestedActual)} 件，箱规 ${formatNumber(row.boxSpec)}`;
      input.className = 'cell-input'; input.dataset.index = index; input.setAttribute('aria-label', `${row.warehouse} ${row.product} 实际订单安排`);
      input.addEventListener('change', async (event) => {
        const current = state.result.rows[Number(event.target.dataset.index)];
        state.actualOrders[current.id] = Math.max(0, Number(event.target.value) || 0);
        await rebuild();
      });
      actualCell.append(input); tr.append(actualCell);
      tr.append(td(formatNumber(row.actualWeight, 4)));
      const statusCell = document.createElement('td');
      statusCell.textContent = row.arrangement;
      tr.append(statusCell);
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

refs.table1Btn.addEventListener('click', () => importFile('table1'));
refs.table2Btn.addEventListener('click', () => importFile('table2'));
refs.exportBtn.addEventListener('click', exportResult);
refs.mappingBtn.addEventListener('click', openMappingDialog);
refs.saveMappingBtn.addEventListener('click', saveMapping);
refs.mappingSearch.addEventListener('input', renderMappingList);
refs.searchInput.addEventListener('input', renderTable);
refs.brandSelect.addEventListener('change', async (event) => {
  state.brand = event.target.value;
  state.actualOrders = {};
  state.warehouseStatus = {};
  await rebuild();
});

renderEmpty();
