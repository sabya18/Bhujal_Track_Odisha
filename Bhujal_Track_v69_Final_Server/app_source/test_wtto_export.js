const fs = require('fs');
const XLSX = require('xlsx');

// 1. Copy our helper functions from excelExporter
const getNormalizedSeasonKey = (headerStr) => {
  if (!headerStr) return null;
  const lower = headerStr.toLowerCase().trim();
  const yearMatch = lower.match(/(19\d{2}|20\d{2})/);
  if (!yearMatch) {
    const shortYearMatch = lower.match(/\b(\d{2})\b/);
    if (!shortYearMatch) return null;
    const shortYear = parseInt(shortYearMatch[1]);
    const year = shortYear >= 80 ? 1900 + shortYear : 2000 + shortYear;
    return getSeasonKeyWithYear(lower, year);
  }
  const year = parseInt(yearMatch[1]);
  return getSeasonKeyWithYear(lower, year);
};

const getSeasonKeyWithYear = (lower, year) => {
  let season = null;
  if (lower.includes('win')) {
    season = 'Winter';
  } else if (lower.includes('pre')) {
    season = 'PreMon';
  } else if (lower.includes('post')) {
    season = 'PostMon';
  } else if (lower.includes('mon') || lower.includes('mid')) {
    season = 'MidMon';
  }
  if (season) {
    return `${year}_${season}`;
  }
  return null;
};

const formatSeasonKeyToHeader = (seasonKey) => {
  const parts = seasonKey.split('_');
  if (parts.length === 2) {
    return `${parts[1]}_${parts[0]}`;
  }
  return seasonKey;
};

const updateCell = (ws, r, c, val) => {
  const cellRef = XLSX.utils.encode_cell({ r, c });
  if (val === null || val === undefined || val === '') {
    if (ws[cellRef]) {
      ws[cellRef].v = "";
      ws[cellRef].t = "s";
    }
  } else {
    const num = Number(val);
    const isNum = !isNaN(num) && typeof val !== 'boolean' && val !== '';
    const finalVal = isNum ? num : val.toString();
    const type = isNum ? 'n' : 's';
    if (ws[cellRef]) {
      ws[cellRef].v = finalVal;
      ws[cellRef].t = type;
    } else {
      ws[cellRef] = { t: type, v: finalVal };
    }
  }
};

// 2. Load the actual workbook template
console.log("Loading WTTO template...");
const wb = XLSX.readFile('../WTTO file NF Kendrapara.xlsx');
const ws = wb.Sheets['KDP_BLOCK'];
let range = XLSX.utils.decode_range(ws['!ref'] || 'A1:O1');

console.log("Initial sheet range:", ws['!ref']);
console.log("Initial column count:", range.e.c + 1);

// Find header row
let headerRow = null;
for (let r = 0; r <= 15; r++) {
  const cellA = ws[XLSX.utils.encode_cell({ r, c: 0 })];
  const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })];
  const valA = cellA && cellA.v ? String(cellA.v).toLowerCase() : '';
  const valB = cellB && cellB.v ? String(cellB.v).toLowerCase() : '';
  if (valA.includes("sl") || valA.includes("gwd") || valB.includes("location") || valB.includes("block")) {
    headerRow = r;
    break;
  }
}
if (headerRow === null) headerRow = 0;
console.log("Detected Header Row:", headerRow + 1);

// Map columns
const colMap = {};
let lastSeasonCol = -1;
for (let c = 0; c <= range.e.c; c++) {
  const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
  if (cell && cell.v !== undefined) {
    const sKey = getNormalizedSeasonKey(String(cell.v));
    if (sKey) {
      colMap[sKey] = c;
      if (c > lastSeasonCol) {
        lastSeasonCol = c;
      }
    }
  }
}

console.log("Last existing season column index:", lastSeasonCol);
console.log("Last existing season header:", ws[XLSX.utils.encode_cell({ r: headerRow, c: lastSeasonCol })].v);

// We want to insert '2026_MidMon' which is not present in the template
const targetSeason = '2026_MidMon';
console.log(`\nInserting new season column for: ${targetSeason}...`);

if (colMap[targetSeason] === undefined) {
  const insertColIdx = lastSeasonCol !== -1 ? lastSeasonCol + 1 : range.e.c + 1;
  console.log("Inserting at column index:", insertColIdx);

  // Shift columns to the right by 1
  for (let c = range.e.c; c >= insertColIdx; c--) {
    for (let r = range.s.r; r <= range.e.r; r++) {
      const oldRef = XLSX.utils.encode_cell({ r, c });
      const newRef = XLSX.utils.encode_cell({ r, c: c + 1 });
      if (ws[oldRef]) {
        ws[newRef] = ws[oldRef];
        delete ws[oldRef];
      }
    }
  }

  // Update range
  range.e.c += 1;
  ws['!ref'] = XLSX.utils.encode_range(range);

  // Adjust column map
  Object.keys(colMap).forEach(key => {
    if (colMap[key] >= insertColIdx) {
      colMap[key] += 1;
    }
  });

  // Write new header
  const newHeader = formatSeasonKeyToHeader(targetSeason);
  updateCell(ws, headerRow, insertColIdx, newHeader);
  colMap[targetSeason] = insertColIdx;
}

console.log("New sheet range:", ws['!ref']);
console.log("New column count:", range.e.c + 1);

// Verify new column header is written correctly
const insertedHeaderRef = XLSX.utils.encode_cell({ r: headerRow, c: lastSeasonCol + 1 });
console.log("Header at inserted index:", ws[insertedHeaderRef] ? ws[insertedHeaderRef].v : "NULL");

// Verify that the subsequent column (which was shifted) has its header intact
const shiftedHeaderRef = XLSX.utils.encode_cell({ r: headerRow, c: lastSeasonCol + 2 });
console.log("Header at shifted index (was last index + 1):", ws[shiftedHeaderRef] ? ws[shiftedHeaderRef].v : "NULL");

const pass = ws[insertedHeaderRef] && ws[insertedHeaderRef].v === 'MidMon_2026';
console.log("\nWTTO column insertion test:", pass ? "PASS" : "FAIL");

// Save test output file
XLSX.writeFile(wb, 'test_wtto_output.xlsx');
console.log("Saved test output to: test_wtto_output.xlsx");
