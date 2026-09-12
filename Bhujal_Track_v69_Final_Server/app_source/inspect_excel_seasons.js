const fs = require('fs');
const XLSX = require('xlsx');

const filePath = '../GWLDATA_DistrictWise.xlsx';
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets['ALL_DISTRICTS'];

const refVal = ws['!ref'] || 'A1:O15';
const range = XLSX.utils.decode_range(refVal);

console.log('--- Printing all columns in Row 0 ---');
for (let c = 0; c <= range.e.c; c++) {
  const cellRef = XLSX.utils.encode_cell({ r: 0, c });
  const cell = ws[cellRef];
  if (cell && cell.v !== undefined) {
    console.log(`Col ${c} (${XLSX.utils.encode_col(c)}): "${cell.v}"`);
  }
}
