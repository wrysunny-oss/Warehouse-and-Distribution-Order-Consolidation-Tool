'use strict';

function detailFormulaValues(rowNumber, row) {
  const n = Number(rowNumber);
  const replenishmentFormula = `ROUNDUP(MAX(0,(N${n}*0.5+(L${n}/7*30)*0.3+(K${n}*30)*0.2)*0.8-I${n})/F${n},0)*F${n}`;
  const actualOrderFormula = row.hasOrderLimit === false
    ? replenishmentFormula
    : `MIN(INT(O${n}/F${n})*F${n},${replenishmentFormula})`;
  return {
    weight: { formula: `O${n}*E${n}/1000`, result: row.weight },
    actualOrder: { formula: actualOrderFormula, result: row.actualOrder },
    actualWeight: { formula: `Q${n}*E${n}/1000`, result: row.actualWeight }
  };
}

function summaryFormulaValues(startRow, endRow, summary) {
  const start = Number(startRow);
  const end = Number(endRow);
  return {
    systemOrder: { formula: `SUM(O${start}:O${end})`, result: summary.systemOrder },
    weight: { formula: `SUM(P${start}:P${end})`, result: summary.weight },
    actualOrder: { formula: `SUM(Q${start}:Q${end})`, result: summary.actualOrder },
    actualWeight: { formula: `SUM(R${start}:R${end})`, result: summary.actualWeight }
  };
}

module.exports = { detailFormulaValues, summaryFormulaValues };