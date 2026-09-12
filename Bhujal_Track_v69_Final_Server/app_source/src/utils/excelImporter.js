import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { Alert } from 'react-native';
import { normalizeBlockName } from './storage';

const dmsToDd = (dmsVal) => {
  if (dmsVal === null || dmsVal === undefined) return null;
  const dmsStr = String(dmsVal).trim();
  if (!dmsStr) return null;
  
  if (/[_\-\s°'":]/.test(dmsStr)) {
    const cleaned = dmsStr.replace(/[_\-°'":]/g, ' ');
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 1) {
      try {
        const d = parseFloat(parts[0]);
        const m = parts.length > 1 ? parseFloat(parts[1]) : 0.0;
        const s = parts.length > 2 ? parseFloat(parts[2]) : 0.0;
        
        let direction = 1;
        for (const p of parts) {
          if (p.toUpperCase() === 'S' || p.toUpperCase() === 'W') {
            direction = -1;
          }
        }
        const dd = d + m / 60.0 + s / 3600.0;
        return parseFloat((dd * direction).toFixed(6));
      } catch (e) {}
    }
  }
  try {
    const val = parseFloat(dmsStr);
    return isNaN(val) ? null : val;
  } catch (e) {}
  return null;
};

const formatDate = (val) => {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const y = val.getFullYear();
    return `${d}.${m}.${y}`;
  }

  // Handle Excel date serial number fallback (numbers)
  const num = Number(val);
  if (typeof val !== 'string' && !isNaN(num) && num > 30000 && num < 60000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    const d = String(date.getUTCDate()).padStart(2, '0');
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const y = date.getUTCFullYear();
    return `${d}.${m}.${y}`;
  }

  const valStr = String(val).trim();
  if (!valStr || valStr.toLowerCase() === 'nan' || valStr.toLowerCase() === 'none') {
    return null;
  }

  // Handle Excel date serial number fallback (numeric strings)
  const parsedNumStr = Number(valStr);
  if (!isNaN(parsedNumStr) && parsedNumStr > 30000 && parsedNumStr < 60000) {
    const date = new Date(Math.round((parsedNumStr - 25569) * 86400 * 1000));
    const d = String(date.getUTCDate()).padStart(2, '0');
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const y = date.getUTCFullYear();
    return `${d}.${m}.${y}`;
  }

  // Check if it matches a typical date pattern (e.g., DD.MM.YYYY, DD-MM-YYYY, YYYY-MM-DD, or with slashes)
  const datePattern = /^\d{1,4}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4}$/;
  if (datePattern.test(valStr)) {
    const normalizedStr = valStr.replace(/[\.\/]/g, '-');
    if (normalizedStr.includes('-')) {
      const parts = normalizedStr.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[2]}.${parts[1]}.${parts[0]}`;
        }
        return `${parts[0]}.${parts[1]}.${parts[2]}`;
      }
    }
  }

  // Generic fallback if it has space and could be a timestamp (e.g. "2026-06-15 00:00:00")
  if (valStr.includes(' ')) {
    try {
      const parsedD = new Date(valStr);
      if (!isNaN(parsedD.getTime())) {
        return formatDate(parsedD);
      }
    } catch (e) {}
    // If it's something like "15.06.2026 10:30", extract the date part and check it
    const datePart = valStr.split(' ')[0];
    if (datePattern.test(datePart)) {
      return formatDate(datePart);
    }
  }

  // Final fallback parse check (e.g. ISO string)
  try {
    const parsedD = new Date(valStr);
    if (!isNaN(parsedD.getTime()) && valStr.length >= 8 && /\d/.test(valStr)) {
      return formatDate(parsedD);
    }
  } catch (e) {}

  return null;
};

export const inferSeasonNameFromDate = (dateStr) => {
  if (!dateStr) return 'Winter';
  let month = 1;
  let day = 1;
  if (dateStr.includes('.')) {
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
    }
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) { // YYYY-MM-DD
        day = parseInt(parts[2], 10);
        month = parseInt(parts[1], 10);
      } else { // DD-MM-YYYY
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
      }
    }
  }
  if (isNaN(month) || isNaN(day)) return 'Winter';

  if ((month === 2 && day >= 1) || (month === 3 && day <= 31)) {
    return 'Winter';
  } else if ((month === 5 && day >= 1) || (month === 6 && day <= 30)) {
    return 'Pre-Monsoon';
  } else if ((month === 8 && day >= 1) || (month === 9 && day <= 30)) {
    return 'Mid-Monsoon';
  } else if ((month === 11 && day >= 1) || (month === 12 && day <= 31)) {
    return 'Post-Monsoon';
  } else {
    if (month === 1) return 'Winter';
    if (month === 4) return 'Pre-Monsoon';
    if (month === 7) return 'Mid-Monsoon';
    if (month === 10) return 'Post-Monsoon';
  }
  return 'Winter';
};

const detectSeasonHeader = (headerStr) => {
  if (!headerStr) return null;
  const lower = headerStr.toLowerCase().trim();
  const yearMatch = lower.match(/(19\d{2}|20\d{2})/);
  if (!yearMatch) return null;
  
  const year = yearMatch[1];
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

export const detectAppSheetFormat = (wb) => {
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    
    const refVal = ws['!ref'] || 'A1:T1';
    let range;
    try {
      range = XLSX.utils.decode_range(refVal);
    } catch (e) {
      range = { s: { r: 0, c: 0 }, e: { r: 5, c: 20 } };
    }
    
    for (let r = range.s.r; r <= Math.min(range.s.r + 20, range.e.r); r++) {
      const rowVals = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v !== undefined) {
          rowVals.push(String(cell.v).toLowerCase().trim());
        }
      }
      
      const hasWellId = rowVals.some(v => v === 'well id' || v === 'well_id');
      const hasWaterLvl = rowVals.some(v => v.includes('water level') || v.includes('bmp'));
      
      if (hasWellId && hasWaterLvl) {
        return { sheetName, headerRow: r };
      }
    }
  }
  return null;
};

export const parseAppSheetData = (wb, base64Data, name, detection) => {
  const { sheetName, headerRow } = detection;
  const ws = wb.Sheets[sheetName];
  
  const refVal = ws['!ref'] || 'A1:T1';
  const range = XLSX.utils.decode_range(refVal);
  const maxRow = range.e.r;
  const maxCol = range.e.c;
  
  const colMap = {};
  for (let c = range.s.c; c <= maxCol; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
    if (cell && cell.v !== undefined) {
      const label = String(cell.v).trim().toLowerCase();
      colMap[label] = c;
    }
  }
  
  const getColIndex = (aliases) => {
    for (const alias of aliases) {
      if (colMap[alias] !== undefined) return colMap[alias];
    }
    return -1;
  };
  
  const idxId = getColIndex(['id']);
  const idxDistrict = getColIndex(['district']);
  const idxBlock = getColIndex(['block']);
  const idxWellLoc = getColIndex(['location of observation wells', 'well location', 'location']);
  const idxWellType = getColIndex(['well type']);
  const idxWellId = getColIndex(['well number', 'well id', 'well_id']);
  const idxTotDepth = getColIndex(['total depth in mtr', 'tot_depth [mtr]', 'tot_depth', 'total depth']);
  const idxRL = getColIndex(['rl [mtr]', 'rl']);
  const idxParapet = getColIndex(['height of parapet in mtr', 'parapet height [mtr]', 'parapet height', 'parapet_height']);
  const idxWellStatus = getColIndex(['well status']);
  const idxLat = getColIndex(['lat(dd)', 'lat', 'latitude']);
  const idxLon = getColIndex(['long(dd)', 'lon', 'longitude']);
  const idxLocation = getColIndex(['location']);
  const idxDate = getColIndex(['dt_site visit [dd/mm/yy]', 'dt_site visit', 'date']);
  const idxYear = getColIndex(['year of measurement', 'year']);
  const idxSeason = getColIndex(['season of measurement', 'season']);
  const idxWaterLvl = getColIndex(['dtgwl [bmp]', 'water level (bmp)', 'water level bmp', 'water_level_bmp', 'water level']);
  const idxRemarks = getColIndex(['remarks']);
  
  const parsedWellsMap = {};
  const parsedVisits = [];
  
  let syncedCount = 0;
  let skippedCount = 0;
  
  for (let r = headerRow + 1; r <= maxRow; r++) {
    const getCellVal = (cIdx) => {
      if (cIdx === -1) return null;
      const cell = ws[XLSX.utils.encode_cell({ r, c: cIdx })];
      return cell && cell.v !== undefined ? cell.v : null;
    };
    
    const wellNum = getCellVal(idxWellId);
    if (!wellNum) {
      skippedCount++;
      continue;
    }
    const wNumStr = String(wellNum).trim().toUpperCase();
    
    // Check validation: date and water level must be present to count as a valid visit.
    const dateRaw = getCellVal(idxDate);
    const waterLvlVal = getCellVal(idxWaterLvl);
    if (dateRaw === null || dateRaw === '' || waterLvlVal === null || waterLvlVal === '') {
      skippedCount++;
      continue;
    }
    
    let lat = null;
    let lon = null;
    
    // Try separate Lat/Lon columns first (Lat(DD) / Long(DD))
    const latVal = getCellVal(idxLat);
    const lonVal = getCellVal(idxLon);
    if (latVal !== null && lonVal !== null) {
      const parsedLat = parseFloat(latVal);
      const parsedLon = parseFloat(lonVal);
      if (!isNaN(parsedLat) && !isNaN(parsedLon)) {
        lat = parsedLat;
        lon = parsedLon;
      }
    }
    
    // Fallback to combined Location column if separate ones are missing
    if (lat === null || lon === null) {
      const locVal = getCellVal(idxLocation);
      if (locVal) {
        const parts = String(locVal).split(',');
        if (parts.length === 2) {
          const parsedLat = parseFloat(parts[0]);
          const parsedLon = parseFloat(parts[1]);
          if (!isNaN(parsedLat) && !isNaN(parsedLon)) {
            lat = parsedLat;
            lon = parsedLon;
          }
        }
      }
    }
    
    const parapet = parseFloat(getCellVal(idxParapet)) || 0.0;
    const dateFormatted = formatDate(dateRaw);
    
    const yearVal = getCellVal(idxYear);
    const yearStr = yearVal ? String(yearVal).trim() : (dateFormatted ? dateFormatted.split('.')[2] : new Date().getFullYear().toString());
    
    const seasonVal = getCellVal(idxSeason);
    const seasonRaw = seasonVal ? String(seasonVal).trim() : (dateFormatted ? inferSeasonNameFromDate(dateFormatted) : 'Winter');
    
    let seasonKeyPart = 'Winter';
    const sLower = seasonRaw.toLowerCase();
    if (sLower.includes('pre')) seasonKeyPart = 'PreMon';
    else if (sLower.includes('post')) seasonKeyPart = 'PostMon';
    else if (sLower.includes('mid') || sLower.includes('mon')) seasonKeyPart = 'MidMon';
    
    const seasonKey = `${yearStr}_${seasonKeyPart}`;
    
    let mbglVal = null;
    let bmpNum = null;
    if (waterLvlVal !== null && !isNaN(parseFloat(waterLvlVal))) {
      mbglVal = parseFloat(waterLvlVal);
      bmpNum = Number((mbglVal + parapet).toFixed(2));
    }
    
    const sheetName = getCellVal(idxDistrict) ? String(getCellVal(idxDistrict)).trim() + '_Blocks' : 'Other';
    
    if (!parsedWellsMap[wNumStr]) {
      parsedWellsMap[wNumStr] = {
        sheet: sheetName,
        sl_no: getCellVal(idxId) ? String(getCellVal(idxId)).trim() : "",
        block: getCellVal(idxBlock) ? normalizeBlockName(String(getCellVal(idxBlock))) : "",
        location: getCellVal(idxWellLoc) ? String(getCellVal(idxWellLoc)).trim() : "",
        well_type: getCellVal(idxWellType) ? String(getCellVal(idxWellType)).trim() : "",
        well_number: wNumStr,
        lat_raw: lat ? lat.toFixed(6) : "",
        lon_raw: lon ? lon.toFixed(6) : "",
        lat: lat,
        lon: lon,
        depth: getCellVal(idxTotDepth) ? String(getCellVal(idxTotDepth)).trim() : "",
        parapet_height: parapet,
        dtgwl_bmp: bmpNum || 0.0,
        dtgwl_mbgl: mbglVal || 0.0,
        remarks: getCellVal(idxRemarks) ? String(getCellVal(idxRemarks)).trim() : "",
        date: dateFormatted,
        season: seasonRaw
      };
    }
    
    if (mbglVal !== null) {
      parsedVisits.push({
        wellNumber: wNumStr,
        seasonKey: seasonKey,
        date: dateFormatted || "",
        value: mbglVal,
        remarks: getCellVal(idxRemarks) ? String(getCellVal(idxRemarks)).trim() : ""
      });
      syncedCount++;
    }
  }
  
  return {
    isAppSheet: true,
    wells: Object.values(parsedWellsMap),
    visits: parsedVisits,
    base64: base64Data,
    fileName: name,
    diagnostics: {
      sheetName,
      headerRow,
      recordsSynced: syncedCount,
      recordsSkipped: skippedCount,
      colsMatched: {
        wellId: idxWellId !== -1,
        date: idxDate !== -1,
        season: idxSeason !== -1,
        waterLevel: idxWaterLvl !== -1,
        parapet: idxParapet !== -1
      }
    }
  };
};

export const parseWorkbookData = (wb, base64Data, name) => {
  const allWells = [];

  // Parse sheets
  for (const sheetName of wb.SheetNames) {
    const normalizedSheet = sheetName.toUpperCase().trim();
    if (normalizedSheet === 'ALL_DISTRICTS' || normalizedSheet === 'ALL DISTRICTS' || normalizedSheet === 'ALL') {
      continue;
    }
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    // Convert worksheet to 2D array of raw values to locate headers
    const refVal = ws['!ref'] || 'A1:O1';
    let range;
    try {
      range = XLSX.utils.decode_range(refVal);
    } catch (e) {
      range = { s: { r: 0, c: 0 }, e: { r: 100, c: 15 } };
    }
    const maxRow = range.e.r;
    const maxCol = range.e.c;

    // Heuristic search for header row
    let headerRow = null;
    let colMap = {};

    for (let r = 0; r <= Math.min(15, maxRow); r++) {
      const rowVals = [];
      for (let c = 0; c <= maxCol; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        const cell = ws[cellRef];
        rowVals.push(cell && cell.v !== undefined ? String(cell.v).toLowerCase().trim() : '');
      }

      const hasWell = rowVals.some(v => v.includes("well number") || v.includes("well no") || v.includes("well id") || v.includes("well_id"));
      const hasLoc = rowVals.some(v => v.includes("location of") || v.includes("location"));
      
      if (hasWell && hasLoc) {
        headerRow = r;
        // Map columns
        rowVals.forEach((val, c) => {
          if (val.includes("sl") && val.includes("no")) colMap["sl_no"] = c;
          else if (val === "district" || val.includes("district")) colMap["district"] = c;
          else if (val.includes("block") || val.includes("urban area") || val.includes("urban_area")) colMap["block"] = c;
          else if (val.includes("location")) colMap["location"] = c;
          else if (val.includes("well type") || val.includes("well_type")) colMap["well_type"] = c;
          else if (val.includes("well number") || val.includes("well no") || val.includes("well id") || val.includes("well_id")) colMap["well_number"] = c;
          else if (val.includes("lat") && !val.includes("date")) colMap["lat"] = c;
          else if ((val.includes("long") || val.includes("lon")) && !val.includes("date")) colMap["lon"] = c;
          else if ((val.includes("dt_site") || val.includes("dt_sitevisit") || val.includes("date of site") || val.includes("dt_sitevist") || val.includes("date")) && !val.includes("installation") && !val.includes("start") && !val.includes("end")) colMap["date"] = c;
          else if (val.includes("total depth") || val.includes("tot_ depth") || val.includes("total_depth") || val.includes("depth")) {
            if (!val.includes("parapet")) colMap["depth"] = c;
          }
          else if (val.includes("parapet")) colMap["parapet"] = c;
          else if (val.includes("dtgwl") && val.includes("bmp")) colMap["dtgwl_bmp"] = c;
          else if (val.includes("dtgwl") && val.includes("mbgl")) colMap["dtgwl_mbgl"] = c;
          else if (val.includes("remark")) colMap["remarks"] = c;
        });
        break;
      }
    }

    // Secondary fallback search if header row wasn't found
    if (headerRow === null) {
      for (let r = 0; r <= Math.min(10, maxRow); r++) {
        const rowVals = [];
        for (let c = 0; c <= maxCol; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = ws[cellRef];
          rowVals.push(cell && cell.v !== undefined ? String(cell.v).toLowerCase().trim() : '');
        }
        if (rowVals.some(v => v.includes("location")) && (rowVals.some(v => v.includes("block")) || rowVals.some(v => v.includes("sl")))) {
          headerRow = r;
          rowVals.forEach((val, c) => {
            if (val.includes("sl") && val.includes("no")) colMap["sl_no"] = c;
            else if (val === "district" || val.includes("district")) colMap["district"] = c;
            else if (val.includes("block") || val.includes("urban area") || val.includes("urban_area")) colMap["block"] = c;
            else if (val.includes("location")) colMap["location"] = c;
            else if (val.includes("well type") || val.includes("well_type")) colMap["well_type"] = c;
            else if (val.includes("well number") || val.includes("well no") || val.includes("well id") || val.includes("well_id")) colMap["well_number"] = c;
            else if (val.includes("lat") && !val.includes("date")) colMap["lat"] = c;
            else if ((val.includes("long") || val.includes("lon")) && !val.includes("date")) colMap["lon"] = c;
            else if ((val.includes("dt_site") || val.includes("dt_sitevisit") || val.includes("date of site") || val.includes("dt_sitevist") || val.includes("date")) && !val.includes("installation") && !val.includes("start") && !val.includes("end")) colMap["date"] = c;
            else if (val.includes("depth")) colMap["depth"] = c;
            else if (val.includes("parapet")) colMap["parapet"] = c;
            else if (val.includes("dtgwl")) colMap["dtgwl_bmp"] = c;
            else if (val.includes("remark")) colMap["remarks"] = c;
          });
          break;
        }
      }
    }

    // Tertiary fallback search for headerless files (data starts directly on row 1 or 2)
    if (headerRow === null) {
      for (let r = 0; r <= Math.min(5, maxRow); r++) {
        const rowVals = [];
        for (let c = 0; c <= maxCol; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = ws[cellRef];
          rowVals.push(cell && cell.v !== undefined ? String(cell.v).trim() : '');
        }
        
        const hasWellId = rowVals.some(v => /[0-9]{2}[A-Z]+[0-9]+/.test(v));
        if (hasWellId) {
          headerRow = r - 1; // Headerless mode starting at row r
          rowVals.forEach((val, c) => {
            const str = String(val).trim();
            if (/[0-9]{2}[A-Z]+[0-9]+/.test(str)) colMap["well_number"] = c;
            else if (!isNaN(Number(str)) && Number(str) >= 17.0 && Number(str) <= 23.5) colMap["lat"] = c;
            else if (!isNaN(Number(str)) && Number(str) >= 81.0 && Number(str) <= 88.5) colMap["lon"] = c;
            else if (['BW', 'DW', 'TW', 'PZ', 'OB'].includes(str.toUpperCase())) colMap["well_type"] = c;
          });
          if (colMap["district"] === undefined) colMap["district"] = 0;
          if (colMap["block"] === undefined) colMap["block"] = 1;
          if (colMap["location"] === undefined) colMap["location"] = 3;
          break;
        }
      }
    }

    if (headerRow === null) {
      continue;
    }

    // Set fallback default indices if not found
    if (colMap["sl_no"] === undefined) colMap["sl_no"] = 0;
    if (colMap["block"] === undefined) colMap["block"] = 1;
    if (colMap["location"] === undefined) colMap["location"] = 2;
    if (colMap["well_type"] === undefined) colMap["well_type"] = 3;
    if (colMap["well_number"] === undefined) colMap["well_number"] = 4;
    if (colMap["lat"] === undefined) colMap["lat"] = 5;
    if (colMap["lon"] === undefined) colMap["lon"] = 6;
    if (colMap["date"] === undefined) colMap["date"] = 7;
    if (colMap["depth"] === undefined) colMap["depth"] = 8;
    if (colMap["parapet"] === undefined) colMap["parapet"] = 9;
    if (colMap["dtgwl_bmp"] === undefined) colMap["dtgwl_bmp"] = 10;
    if (colMap["remarks"] === undefined) colMap["remarks"] = 13;

    // Scan header row to map season columns
    const seasonColMap = {};
    for (let c = 0; c <= maxCol; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: headerRow, c });
      const cell = ws[cellRef];
      if (cell && cell.v !== undefined) {
        const seasonKey = detectSeasonHeader(String(cell.v));
        if (seasonKey) {
          seasonColMap[seasonKey] = c;
        }
      }
    }

    // Extract rows
    for (let r = headerRow + 1; r <= maxRow; r++) {
      // Skip secondary header rows if they are labeled "sl no" and "block" again
      const cellA = ws[XLSX.utils.encode_cell({ r, c: 0 })];
      const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })];
      if (cellA && cellB && String(cellA.v) === '1' && String(cellB.v) === '2') {
        continue;
      }

      const getCellVal = (cIdx) => {
        if (cIdx === undefined || cIdx < 0) return null;
        const cell = ws[XLSX.utils.encode_cell({ r, c: cIdx })];
        if (cell === undefined || cell.v === undefined || cell.v === null) return null;
        return cell.v;
      };

      const wNum = getCellVal(colMap["well_number"]);
      if (!wNum) continue;

      const wNumStr = String(wNum).trim();
      // Skip rows that don't have letters in well number (just indexes or empty spacer cells)
      if (!/[a-zA-Z]/.test(wNumStr)) {
        continue;
      }

      const latRaw = getCellVal(colMap["lat"]);
      const lonRaw = getCellVal(colMap["lon"]);
      const latDD = dmsToDd(latRaw);
      const lonDD = dmsToDd(lonRaw);

      let pHeight = getCellVal(colMap["parapet"]);
      pHeight = pHeight !== null && !isNaN(Number(pHeight)) ? Number(pHeight) : 0.0;

      const rawBmp = getCellVal(colMap["dtgwl_bmp"]);
      const bmpValRaw = rawBmp !== null ? String(rawBmp).trim() : "";
      let bmpVal = rawBmp !== null && !isNaN(Number(rawBmp)) ? Number(rawBmp) : null;
      if (bmpVal !== null && (bmpVal > 150 || bmpVal < 0)) {
        bmpVal = null;
      }

      let mbglVal = colMap["dtgwl_mbgl"] !== undefined ? getCellVal(colMap["dtgwl_mbgl"]) : null;
      mbglVal = mbglVal !== null && !isNaN(Number(mbglVal)) ? Number(mbglVal) : null;
      if (mbglVal !== null && (mbglVal > 150 || mbglVal < 0)) {
        mbglVal = null;
      }

      if (mbglVal === null && bmpVal !== null) {
        mbglVal = Number((bmpVal - pHeight).toFixed(2));
      }

      const remarksVal = getCellVal(colMap["remarks"]);
      const remarksStr = remarksVal !== null ? String(remarksVal).trim() : "";

      // Parse date
      const dateRaw = getCellVal(colMap["date"]);
      const dateFormatted = formatDate(dateRaw);

      // Extract historical seasons for this well
      const wellHistory = {};
      Object.keys(seasonColMap).forEach(sKey => {
        const cIdx = seasonColMap[sKey];
        const val = getCellVal(cIdx);
        if (val !== null && val !== undefined && val !== '') {
          const numVal = Number(val);
          wellHistory[sKey] = !isNaN(numVal) ? numVal : val;
        }
      });

      let resolvedSheet = sheetName;
      if (colMap["district"] !== undefined) {
        const distVal = getCellVal(colMap["district"]);
        if (distVal && String(distVal).trim()) {
          resolvedSheet = String(distVal).trim() + '_Blocks';
        }
      }

      allWells.push({
        sheet: resolvedSheet,
        row_idx: r + 1, // Store 1-based index
        sl_no: getCellVal(colMap["sl_no"]) !== null ? String(getCellVal(colMap["sl_no"])).trim() : "",
        block: getCellVal(colMap["block"]) !== null ? normalizeBlockName(String(getCellVal(colMap["block"]))) : "",
        location: getCellVal(colMap["location"]) !== null ? String(getCellVal(colMap["location"])).trim() : "",
        well_type: getCellVal(colMap["well_type"]) !== null ? String(getCellVal(colMap["well_type"])).trim() : "",
        well_number: wNumStr,
        lat_raw: latRaw !== null ? String(latRaw).trim() : "",
        lon_raw: lonRaw !== null ? String(lonRaw).trim() : "",
        lat: latDD,
        lon: lonDD,
        date: dateFormatted,
        depth: getCellVal(colMap["depth"]) !== null ? String(getCellVal(colMap["depth"])).trim() : "",
        parapet_height: pHeight,
        dtgwl_bmp: bmpVal,
        dtgwl_bmp_raw: bmpValRaw,
        dtgwl_mbgl: mbglVal,
        remarks: remarksStr,
        season: inferSeasonNameFromDate(dateFormatted),
        history: wellHistory
      });
    }
  }

  return {
    wells: allWells,
    base64: base64Data,
    fileName: name
  };
};

export const importExcelDataClientSide = async () => {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      copyToCacheDirectory: true
    });

    if (res.canceled || !res.assets || res.assets.length === 0) {
      return null;
    }

    const { uri, name } = res.assets[0];
    
    // Read the file as base64 string
    const base64Data = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64
    });

    // Parse the base64 workbook
    const wb = XLSX.read(base64Data, { type: 'base64', cellStyles: true, cellDates: true });

    const appSheetDetection = detectAppSheetFormat(wb);
    if (appSheetDetection) {
      return parseAppSheetData(wb, base64Data, name, appSheetDetection);
    }

    return parseWorkbookData(wb, base64Data, name);
  } catch (err) {
    console.error("Excel import error:", err);
    Alert.alert("Import Failed", "Could not parse Excel spreadsheet: " + err.message);
    return null;
  }
};

export const extractSpreadsheetId = (url) => {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  if (/^[a-zA-Z0-9-_]+$/.test(url.trim())) {
    return url.trim();
  }
  return null;
};

export const importGoogleSheetData = async (sheetUrl) => {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) {
    throw new Error("Invalid Google Sheets URL. Please enter a valid URL containing the spreadsheet ID.");
  }
  
  const downloadUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
  const localUri = FileSystem.cacheDirectory + 'google_sheet_temp.xlsx';
  
  try {
    const downloadRes = await FileSystem.downloadAsync(downloadUrl, localUri);
    if (downloadRes.status !== 200) {
      throw new Error("HTTP Status " + downloadRes.status + ". Ensure the spreadsheet link is shared publicly.");
    }
    
    const base64Data = await FileSystem.readAsStringAsync(downloadRes.uri, {
      encoding: FileSystem.EncodingType.Base64
    });
    
    // Clean up temp file
    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch (e) {}

    // Verify it is a valid spreadsheet zip structure (XLSX.read will throw if it is a login redirect HTML page)
    let wb;
    try {
      wb = XLSX.read(base64Data, { type: 'base64', cellStyles: true, cellDates: true });
    } catch (err) {
      throw new Error("Failed to parse document. Ensure the Google Sheet is shared with 'Anyone with the link can view' settings.");
    }
    
    const appSheetDetection = detectAppSheetFormat(wb);
    const docName = "Google_Sheet_" + spreadsheetId + ".xlsx";
    if (appSheetDetection) {
      return parseAppSheetData(wb, base64Data, docName, appSheetDetection);
    }

    return parseWorkbookData(wb, base64Data, docName);
  } catch (err) {
    // Clean up temp file in case of error
    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch (e) {}
    throw err;
  }
};

export const importExcelDataDirectly = async (filePath) => {
  try {
    let base64Data;
    try {
      base64Data = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64
      });
    } catch (readErr) {
      if (filePath.includes('/sdcard/Download/')) {
        const filename = filePath.split('/').pop();
        const fallbackPath = FileSystem.cacheDirectory + filename;
        console.log("Direct import failed from SDCard, trying fallback cache path:", fallbackPath);
        base64Data = await FileSystem.readAsStringAsync(fallbackPath, {
          encoding: FileSystem.EncodingType.Base64
        });
      } else {
        throw readErr;
      }
    }
    const wb = XLSX.read(base64Data, { type: 'base64', cellStyles: true, cellDates: true });
    const name = filePath.split('/').pop();
    return parseWorkbookData(wb, base64Data, name);
  } catch (err) {
    console.error("Direct Excel import error:", err);
    throw err;
  }
};

