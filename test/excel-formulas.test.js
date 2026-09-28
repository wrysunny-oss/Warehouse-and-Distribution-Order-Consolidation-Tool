'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detailFormulaValues, summaryFormulaValues } = require('../src/excel-formulas');

test('导出明细保留重量、实际订单安排和实际重量公式', () => {
  const formulas = detailFormulaValues(2, { weight: 1, actualOrder: 20, actualWeight: 0.2 });
  assert.equal(formulas.weight.formula, 'O2*E2/1000');
  assert.equal(formulas.actualOrder.formula.startsWith('MIN(INT(O2/F2)*F2,ROUNDUP('), true);
  assert.match(formulas.actualOrder.formula, /N2\*0\.5/);
  assert.doesNotMatch(formulas.actualOrder.formula, /FLOOR\.MATH|CEILING\.MATH/);
  assert.equal(formulas.actualWeight.formula, 'Q2*E2/1000');
});

test('导出仓库汇总保留SUM公式且实际订单安排不取整', () => {
  const formulas = summaryFormulaValues(2, 8, { systemOrder: 100, weight: 1, actualOrder: 318, actualWeight: 3.18 });
  assert.equal(formulas.systemOrder.formula, 'SUM(O2:O8)');
  assert.equal(formulas.weight.formula, 'SUM(P2:P8)');
  assert.equal(formulas.actualOrder.formula, 'SUM(Q2:Q8)');
  assert.equal(formulas.actualOrder.result, 318);
  assert.equal(formulas.actualWeight.formula, 'SUM(R2:R8)');
});
