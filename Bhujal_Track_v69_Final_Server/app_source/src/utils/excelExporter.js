import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { EXCEL_TEMPLATE_B64 } from '../data/excelTemplate';
import { getCustomTemplate, loadVisitsHistory } from './storage';

const getDistrictFromSheetLocal = (sheet) => {
  if (!sheet) return 'Other';
  const s = sheet.toLowerCase().trim();
  if (s.includes('kendrapara') || s.includes('kdp')) {
    return s.includes('urban') ? 'Kendrapara Urban' : 'Kendrapara';
  }
  if (s.includes('cuttack')) {
    return s.includes('urban') ? 'Cuttack Urban' : 'Cuttack';
  }
  if (s.includes('jajpur')) {
    return s.includes('urban') ? 'Jajpur Urban' : 'Jajpur';
  }
  if (s.includes('jspur') || s.includes('jagatsinghpur')) return 'Jagatsinghpur';
  const clean = s.replace('_blocks', '').replace('_urban', '');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

const getDivisionForDistrictLocal = (district) => {
  const d = (district || '').toLowerCase().trim();
  if (['cuttack', 'cuttack urban', 'kendrapara', 'kendrapara urban', 'jajpur', 'jajpur urban', 'jagatsinghpur', 'jspur', 'khordha', 'puri', 'nayagarh'].some(x => d.includes(x))) return 'CUTTACK DIVISION';
  if (['sambalpur', 'jharsuguda', 'sundargarh', 'deogarh'].includes(d)) return 'SAMBALPUR DIVISION';
  if (['ganjam', 'gajapati', 'kandhamal', 'boudh'].includes(d)) return 'BERHAMPUR DIVISION';
  if (['balasore', 'bhadrak', 'mayurbhanj'].includes(d)) return 'BALASORE DIVISION';
  if (['balangir', 'bolangir', 'subarnapur', 'bargarh'].includes(d)) return 'BOLANGIR DIVISION';
  if (['koraput', 'nabarangpur', 'malkangiri'].includes(d)) return 'KORAPUT DIVISION';
  if (['kalahandi', 'nuapada', 'rayagada'].includes(d)) return 'BHAWANIPATNA DIVISION';
  if (['angul', 'dhenkanal', 'keonjhar'].includes(d)) return 'ANGUL DIVISION';
  return 'CUTTACK DIVISION';
};

const districtSheetsMap = {
  'Kendrapara': ['KDP_BLOCK', 'Kendrapara_Blocks'],
  'Kendrapara Urban': ['KENDRAPADA_URBAN', 'Kendrapara_urban'],
  'Cuttack': ['Cuttack_Blocks'],
  'Cuttack Urban': ['Cuttack_Urban'],
  'Jajpur': ['Jajpur_Blocks'],
  'Jajpur Urban': ['Jajpur_Urban'],
  'Jagatsinghpur': ['Jspur_Blocks']
};

const parseSeasonKey = (seasonKey) => {
  const parts = seasonKey.split('_');
  if (parts.length !== 2) return null;
  const year = parseInt(parts[0], 10);
  const type = parts[1]; // Winter, PreMon, MidMon, PostMon
  return { year, type };
};

const seasonTypes = ['Winter', 'PreMon', 'MidMon', 'PostMon'];

const getOrderedSeasonsBefore = (seasonKey, count = 40) => {
  const parsed = parseSeasonKey(seasonKey);
  if (!parsed) return [];
  const list = [];
  let curYear = parsed.year;
  let curTypeIdx = seasonTypes.indexOf(parsed.type);
  
  for (let i = 0; i < count; i++) {
    curTypeIdx--;
    if (curTypeIdx < 0) {
      curTypeIdx = 3;
      curYear--;
    }
    list.push(`${curYear}_${seasonTypes[curTypeIdx]}`);
  }
  return list;
};

const getOrderedSeasonsAfter = (seasonKey, count = 40) => {
  const parsed = parseSeasonKey(seasonKey);
  if (!parsed) return [];
  const list = [];
  let curYear = parsed.year;
  let curTypeIdx = seasonTypes.indexOf(parsed.type);
  
  for (let i = 0; i < count; i++) {
    curTypeIdx++;
    if (curTypeIdx > 3) {
      curTypeIdx = 0;
      curYear++;
    }
    list.push(`${curYear}_${seasonTypes[curTypeIdx]}`);
  }
  return list;
};

// Helper to update a cell safely while preserving existing formatting
const updateCell = (ws, r, c, val) => {
  const cellRef = XLSX.utils.encode_cell({ r, c });
  if (val === null || val === undefined || val === '') {
    if (ws[cellRef]) {
      ws[cellRef].v = "";
      ws[cellRef].t = "s";
    }
  } else {
    // Check if the value is a number or can be parsed as a number
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

export const exportToExcelClientSide = async (wellsData, divisionOrDistrictName = null) => {
  try {
    // 1. Load the original workbook template from base64
    let templateB64 = EXCEL_TEMPLATE_B64;
    if (divisionOrDistrictName) {
      let division = divisionOrDistrictName;
      if (!divisionOrDistrictName.toUpperCase().includes('DIVISION')) {
        division = getDivisionForDistrictLocal(divisionOrDistrictName);
      }
      const customB64 = await getCustomTemplate(division);
      if (customB64) {
        templateB64 = customB64;
      }
    }
    const wb = XLSX.read(templateB64, { type: 'base64', cellStyles: true });


    // 2. Determine which sheets to keep if filtering
    let sheetsToUpdate = [];
    if (divisionOrDistrictName) {
      const isDivision = divisionOrDistrictName.toUpperCase().includes('DIVISION');
      if (isDivision) {
        sheetsToUpdate = wb.SheetNames.filter(sName => {
          const dist = getDistrictFromSheetLocal(sName);
          const div = getDivisionForDistrictLocal(dist);
          return div.toLowerCase() === divisionOrDistrictName.toLowerCase();
        });
      } else {
        sheetsToUpdate = districtSheetsMap[divisionOrDistrictName] || [];
      }
      
      // Remove other sheets from the workbook to only export the selected division/district
      wb.SheetNames.forEach(sName => {
        if (!sheetsToUpdate.includes(sName)) {
          delete wb.Sheets[sName];
        }
      });
      wb.SheetNames = wb.SheetNames.filter(sName => sheetsToUpdate.includes(sName));
    } else {
      // Keep all sheets
      sheetsToUpdate = wb.SheetNames;
    }

    if (sheetsToUpdate.length === 0) {
      Alert.alert("Export Error", "No sheets found to export.");
      return;
    }

    // 3. Update the sheets with our local database modifications
    sheetsToUpdate.forEach(sheetName => {
      const ws = wb.Sheets[sheetName];
      if (!ws) return;

      // Filter wells data for this sheet
      const sheetWells = wellsData.filter(w => w.sheet === sheetName);

      // Separate existing wells and new wells
      const existingWells = sheetWells.filter(w => w.row_idx && w.row_idx < 100000000000);
      const newWells = sheetWells.filter(w => !w.row_idx || w.row_idx >= 100000000000);

      // Expand sheet range to include Column O (index 14) for Comments
      let range = XLSX.utils.decode_range(ws['!ref'] || 'A1:O1');
      if (range.e.c < 14) {
        range.e.c = 14;
      }
      ws['!ref'] = XLSX.utils.encode_range(range);

      // A. Update existing wells in place
      existingWells.forEach(well => {
        const r = well.row_idx - 1; // Convert 1-based row index to 0-based for SheetJS

        // Compile Remarks prefix containing Season, MSL, and RL values
        let remarksText = well.remarks || "";
        const prefixParts = [];
        if (well.season && well.season !== 'Winter') {
          prefixParts.push(`Season: ${well.season}`);
        }
        if (well.msl !== undefined && well.msl !== null && well.msl !== '') {
          prefixParts.push(`MSL: ${well.msl}m`);
        }
        if (well.rl !== undefined && well.rl !== null && well.rl !== '') {
          prefixParts.push(`RL: ${well.rl}m`);
        }
        if (prefixParts.length > 0) {
          remarksText = `[${prefixParts.join(' | ')}] ${remarksText}`.trim();
        }

        updateCell(ws, r, 0, well.sl_no);          // Col A: Sl No
        updateCell(ws, r, 1, well.block);          // Col B: Block
        updateCell(ws, r, 2, well.location);       // Col C: Location
        updateCell(ws, r, 3, well.well_type);      // Col D: Well Type
        updateCell(ws, r, 4, well.well_number);    // Col E: Well Number
        updateCell(ws, r, 7, well.date);           // Col H: Visit Date
        updateCell(ws, r, 8, well.depth);          // Col I: Total Depth
        updateCell(ws, r, 9, well.parapet_height);  // Col J: Parapet Height
        updateCell(ws, r, 10, well.dtgwl_bmp);     // Col K: DTGWL BMP
        updateCell(ws, r, 13, remarksText);        // Col N: Remarks
        updateCell(ws, r, 14, well.comment || ""); // Col O: Comments
      });

      // B. Append new wells at the bottom
      if (newWells.length > 0) {
        let nextRow = range.e.r + 1;

        newWells.forEach(well => {
          let remarksText = well.remarks || "";
          const prefixParts = [];
          if (well.season && well.season !== 'Winter') {
            prefixParts.push(`Season: ${well.season}`);
          }
          if (well.msl !== undefined && well.msl !== null && well.msl !== '') {
            prefixParts.push(`MSL: ${well.msl}m`);
          }
          if (well.rl !== undefined && well.rl !== null && well.rl !== '') {
            prefixParts.push(`RL: ${well.rl}m`);
          }
          if (prefixParts.length > 0) {
            remarksText = `[${prefixParts.join(' | ')}] ${remarksText}`.trim();
          }

          updateCell(ws, nextRow, 0, well.sl_no || (nextRow - 2)); // Auto sl_no if missing
          updateCell(ws, nextRow, 1, well.block);
          updateCell(ws, nextRow, 2, well.location);
          updateCell(ws, nextRow, 3, well.well_type);
          updateCell(ws, nextRow, 4, well.well_number);
          updateCell(ws, nextRow, 5, well.lat_raw || (well.lat ? well.lat.toString() : "")); // Col F: Lat
          updateCell(ws, nextRow, 6, well.lon_raw || (well.lon ? well.lon.toString() : "")); // Col G: Lon
          updateCell(ws, nextRow, 7, well.date);
          updateCell(ws, nextRow, 8, well.depth);
          updateCell(ws, nextRow, 9, well.parapet_height);
          updateCell(ws, nextRow, 10, well.dtgwl_bmp);
          updateCell(ws, nextRow, 13, remarksText);
          updateCell(ws, nextRow, 14, well.comment || ""); // Col O: Comments

          nextRow++;
        });

        // Update sheet range boundary
        range.e.r = nextRow - 1;
        ws['!ref'] = XLSX.utils.encode_range(range);
      }
    });

    // 4. Generate the modified base64 file output
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

    // 5. Create filename based on search/filter context
    const filename = divisionOrDistrictName 
      ? `${divisionOrDistrictName.replace(/\s+/g, '_')}_Report_${new Date().toISOString().split('T')[0]}.xlsx`
      : `Groundwater_Field_Book_Full_${new Date().toISOString().split('T')[0]}.xlsx`;
      
    const fileUri = `${FileSystem.externalCacheDirectory || FileSystem.documentDirectory}${filename}`;
    
    // 6. Write the file locally
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: 'base64'
    });
    try {
      await FileSystem.writeAsStringAsync(`file:///sdcard/Download/${filename}`, base64, { encoding: 'base64' });
    } catch (e) {
      console.warn("Failed to write to public download folder:", e);
    }
    
    // 7. Share the file natively
    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (isSharingAvailable) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: filename,
        UTI: 'com.microsoft.excel.xlsx'
      });
    } else {
      Alert.alert("Export Success", `Excel workbook saved locally at:\n${fileUri}`);
    }
  } catch (err) {
    console.error("Client-side template export failed:", err);
    Alert.alert("Export Failed", err.message);
  }
};

export const exportForGrasp = async (wellsData, districtName) => {
  try {
    const getDistrictFromSheetLocal = (sheet) => {
      if (!sheet) return 'Other';
      const s = sheet.toLowerCase();
      if (s.includes('kendrapara') || s.includes('kdp')) return 'Kendrapara';
      if (s.includes('cuttack')) return 'Cuttack';
      if (s.includes('jajpur')) return 'Jajpur';
      if (s.includes('jspur') || s.includes('jagatsinghpur')) return 'Jagatsinghpur';
      
      // Generic parser
      const clean = s.replace('_blocks', '').replace('_urban', '');
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    };

    // 1. Filter wells by district name
    const districtWells = wellsData.filter(w => {
      const dist = getDistrictFromSheetLocal(w.sheet);
      return dist.toLowerCase() === districtName.toLowerCase();
    });

    // 2. Filter wells that have a valid visit date and mbgl reading
    const validWells = districtWells.filter(w => w.date && w.dtgwl_mbgl !== null && w.dtgwl_mbgl !== undefined);

    if (validWells.length === 0) {
      Alert.alert("GRASP Export", `No monitored stations found with water level readings in district ${districtName}.`);
      return;
    }

    // Helper to format date to DD-MM-YYYY
    const formatGraspDate = (dateStr) => {
      if (!dateStr) return '';
      
      // Check if it's an Excel serial date number
      const num = Number(dateStr);
      if (!isNaN(num) && num > 30000 && num < 60000) {
        const date = new Date(Math.round((num - 25569) * 86400 * 1000));
        const d = String(date.getUTCDate()).padStart(2, '0');
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const y = date.getUTCFullYear();
        return `${d}-${m}-${y}`;
      }

      const cleaned = String(dateStr).replace(/[\.\/]/g, '-');
      const parts = cleaned.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD -> DD-MM-YYYY
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return `${parts[0]}-${parts[1]}-${parts[2]}`;
      }
      return cleaned;
    };

    // 3. Generate CSV rows
    const csvContent = validWells.map(w => {
      const wellId = w.well_number || '';
      const dateVal = formatGraspDate(w.date);
      const timeVal = '08:00';
      const mbglVal = w.dtgwl_mbgl !== null && w.dtgwl_mbgl !== undefined ? Number(w.dtgwl_mbgl).toFixed(2) : '';
      return `${wellId},${dateVal},${timeVal},${mbglVal}`;
    }).join('\r\n'); // Windows CRLF

    // 4. File details
    const filename = `GRASP_${districtName.toUpperCase()}_${new Date().toISOString().split('T')[0]}.csv`;
    const fileUri = `${FileSystem.externalCacheDirectory || FileSystem.documentDirectory}${filename}`;

    // 5. Write the file
    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: 'utf8'
    });
    try {
      await FileSystem.writeAsStringAsync(`file:///sdcard/Download/${filename}`, csvContent, { encoding: 'utf8' });
    } catch (e) {
      console.warn("Failed to write to public download folder:", e);
    }

    // 6. Share
    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (isSharingAvailable) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: `Export GRASP CSV for ${districtName}`,
        UTI: 'public.comma-separated-values-text'
      });
    } else {
      Alert.alert("Export Success", `GRASP CSV saved locally at:\n${fileUri}`);
    }
  } catch (err) {
    console.error("GRASP Export failed:", err);
    Alert.alert("Export Failed", err.message);
  }
};

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

export const exportToWTTOExcel = async (wellsData, districtName, seasonName, sheetOption = 'all') => {
  try {
    const division = getDivisionForDistrictLocal(districtName);
    const customB64 = await getCustomTemplate(districtName) || await getCustomTemplate(division);
    if (!customB64) {
      Alert.alert(
        "Template Required", 
        "Please import the raw WTTO Excel template workbook first (e.g., WTTO file NF Kendrapara.xlsx) before exporting in WTTO BGL format."
      );
      return;
    }
    
    const wb = XLSX.read(customB64, { type: 'base64', cellStyles: true });
    
    const allDistrictSheets = districtSheetsMap[districtName] || [];
    let sheetsToUpdate = [];
    if (sheetOption === 'blocks') {
      sheetsToUpdate = allDistrictSheets.filter(sName => sName.toLowerCase().includes('block'));
    } else if (sheetOption === 'urban') {
      sheetsToUpdate = allDistrictSheets.filter(sName => sName.toLowerCase().includes('urban'));
    } else {
      sheetsToUpdate = allDistrictSheets;
    }
    sheetsToUpdate = sheetsToUpdate.filter(sheetName => !!wb.Sheets[sheetName]);
    
    if (sheetsToUpdate.length === 0) {
      Alert.alert(
        "Export Error",
        `The uploaded WTTO workbook does not contain ${districtName} ${sheetOption} sheet(s). Please import the WTTO template for that district before exporting.`
      );
      return;
    }
    
    const history = await loadVisitsHistory();
    
    sheetsToUpdate.forEach(sheetName => {
      const ws = wb.Sheets[sheetName];
      if (!ws) return;
      
      const sheetWells = wellsData.filter(w => w.sheet === sheetName);
      
      let range = XLSX.utils.decode_range(ws['!ref'] || 'A1:O1');
      const maxCol = range.e.c;
      
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
      
      // Build a column map and locate parapet/depth columns
      const colMap = {};
      let parapetCol = null;
      let depthCol = null;
      let lastSeasonCol = -1;
      let oldWellIdCol = null;
      let newWellIdCol = null;
      
      for (let c = 0; c <= maxCol; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
        if (cell && cell.v !== undefined) {
          const sKey = getNormalizedSeasonKey(String(cell.v));
          if (sKey) {
            colMap[sKey] = c;
            if (c > lastSeasonCol) {
              lastSeasonCol = c;
            }
          }
          
          const valStr = String(cell.v).toLowerCase().trim();
          if (valStr.includes("parapet")) {
            parapetCol = c;
          } else if (valStr.includes("depth") && valStr.includes(String(new Date().getFullYear()))) {
            depthCol = c;
          } else if (depthCol === null && valStr.includes("depth")) {
            depthCol = c;
          } else if (valStr.includes("old well id") || valStr.includes("old well number") || valStr.includes("old_well")) {
            oldWellIdCol = c;
          } else if (valStr.includes("new well id") || valStr.includes("new well number") || valStr.includes("new_well") || valStr.includes("well number") || valStr.includes("well_number")) {
            newWellIdCol = c;
          }
        }
      }

      // Build wellRowMap from New/Old Well ID columns
      const wellRowMap = {};
      for (let r = headerRow + 1; r <= range.e.r; r++) {
        let oldId = '';
        let newId = '';
        if (oldWellIdCol !== null) {
          const cell = ws[XLSX.utils.encode_cell({ r, c: oldWellIdCol })];
          if (cell && cell.v !== undefined) oldId = String(cell.v).trim();
        }
        if (newWellIdCol !== null) {
          const cell = ws[XLSX.utils.encode_cell({ r, c: newWellIdCol })];
          if (cell && cell.v !== undefined) newId = String(cell.v).trim();
        }
        
        if (newId) wellRowMap[newId.toLowerCase()] = r;
        if (oldId) wellRowMap[oldId.toLowerCase()] = r;
      }
      
      // Dynamic insertion of active season column if not present in the sheet
      if (colMap[seasonName] === undefined) {
        let insertColIdx = -1;
        
        // 1. Look for closest predecessor that exists in colMap
        const predecessors = getOrderedSeasonsBefore(seasonName, 40);
        for (const pred of predecessors) {
          if (colMap[pred] !== undefined) {
            insertColIdx = colMap[pred] + 1;
            break;
          }
        }
        
        // 2. If no predecessor found, look for closest successor and insert to its left
        if (insertColIdx === -1) {
          const successors = getOrderedSeasonsAfter(seasonName, 40);
          for (const succ of successors) {
            if (colMap[succ] !== undefined) {
              insertColIdx = colMap[succ];
              break;
            }
          }
        }
        
        // 3. Fallback to placing it right after the last season column
        if (insertColIdx === -1) {
          insertColIdx = lastSeasonCol !== -1 ? lastSeasonCol + 1 : range.e.c + 1;
        }
        
        // Shift columns to the right by 1 starting from insertColIdx in ws
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
        
        // Shift column widths if present
        if (ws['!cols']) {
          ws['!cols'].splice(insertColIdx, 0, ws['!cols'][insertColIdx] || { wch: 12 });
        }
        
        // Update range
        range.e.c += 1;
        ws['!ref'] = XLSX.utils.encode_range(range);
        
        // Adjust column indices in colMap, parapetCol, and depthCol
        Object.keys(colMap).forEach(key => {
          if (colMap[key] >= insertColIdx) {
            colMap[key] += 1;
          }
        });
        if (parapetCol !== null && parapetCol >= insertColIdx) parapetCol += 1;
        if (depthCol !== null && depthCol >= insertColIdx) depthCol += 1;
        
        // Write the header of the inserted column
        const newHeader = formatSeasonKeyToHeader(seasonName);
        updateCell(ws, headerRow, insertColIdx, newHeader);
        
        // Set column mapping
        colMap[seasonName] = insertColIdx;
      }
      
      sheetWells.forEach(well => {
        let r = -1;
        if (well.well_number) {
          const wNum = well.well_number.toLowerCase().trim();
          if (wellRowMap[wNum] !== undefined) {
            r = wellRowMap[wNum];
          }
        }
        if (r === -1 && well.row_idx) {
          r = well.row_idx - 1; // Fallback to original row_idx
        }
        if (r === -1 || r > range.e.r) return;
        
        // A. Write active season value to the target column if it matches
        const activeBglVal = well.dtgwl_mbgl !== null && well.dtgwl_mbgl !== undefined ? well.dtgwl_mbgl : '';
        const activeTargetCol = colMap[seasonName];
        if (activeTargetCol !== undefined && activeBglVal !== '') {
          updateCell(ws, r, activeTargetCol, activeBglVal);
        }
        
        // B. Write all historical values from history
        const wellHistory = history[well.well_number];
        if (wellHistory) {
          Object.keys(wellHistory).forEach(sKey => {
            const record = wellHistory[sKey];
            if (record && record.value !== null && record.value !== undefined) {
              const targetCol = colMap[sKey];
              if (targetCol !== undefined) {
                updateCell(ws, r, targetCol, record.value);
              }
            }
          });
        }
        
        // C. Update parapet and depth in their dedicated columns if they exist
        if (parapetCol !== null && well.parapet_height !== null && well.parapet_height !== undefined) {
          updateCell(ws, r, parapetCol, well.parapet_height);
        }
        if (depthCol !== null && well.depth !== null && well.depth !== undefined && well.depth !== '') {
          updateCell(ws, r, depthCol, well.depth);
        }
      });
    });
    
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const filename = `WTTO_${districtName}_${seasonName}_${new Date().toISOString().split('T')[0]}.xlsx`;
    const fileUri = `${FileSystem.externalCacheDirectory || FileSystem.documentDirectory}${filename}`;
    const fileUriBackup = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUriBackup, base64, { encoding: 'base64' });
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
    try {
      await FileSystem.writeAsStringAsync(`file:///sdcard/Download/${filename}`, base64, { encoding: 'base64' });
    } catch (e) {
      console.warn("Failed to write to public download folder:", e);
    }
    
    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (isSharingAvailable) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: filename,
        UTI: 'com.microsoft.excel.xlsx'
      });
    } else {
      Alert.alert("Export Success", `WTTO workbook saved locally at:\n${fileUri}`);
    }
  } catch (err) {
    console.error("WTTO Export failed:", err);
    Alert.alert("Export Failed", err.message);
  }
};

const parseSeasonAndYear = (seasonStr) => {
  if (!seasonStr) return { season: 'Winter', year: new Date().getFullYear() };
  const lower = seasonStr.toLowerCase();
  let season = 'Winter';
  if (lower.includes('pre')) season = 'Pre-Monsoon';
  else if (lower.includes('mid') || lower.includes('mon')) {
    if (lower.includes('mid')) season = 'Mid-Monsoon';
    else if (lower.includes('post')) season = 'Post-Monsoon';
  } else if (lower.includes('win')) {
    season = 'Winter';
  }
  
  const match = seasonStr.match(/\d{4}/);
  const year = match ? parseInt(match[0], 10) : new Date().getFullYear();
  return { season, year };
};

const checkDateInSeasonRangeLocal = (dateStr, targetSeasonStr) => {
  if (!dateStr || !targetSeasonStr) return false;
  
  let day = 1, month = 1, year = new Date().getFullYear();
  if (dateStr.includes('.')) {
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    }
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
      } else {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
      }
    }
  }
  
  if (isNaN(month) || isNaN(day) || isNaN(year)) return false;
  
  const { season: targetSeason, year: targetYear } = parseSeasonAndYear(targetSeasonStr);
  
  const val = month * 100 + day;
  let wellSeason = 'Winter';
  let wellSeasonYear = year;
  
  if (val >= 201 && val <= 315) {
    wellSeason = 'Winter';
  } else if (val >= 420 && val <= 610) {
    wellSeason = 'Pre-Monsoon';
  } else if (val >= 801 && val <= 1010) {
    wellSeason = 'Mid-Monsoon';
  } else if (val >= 1101 && val <= 1231) {
    wellSeason = 'Post-Monsoon';
  } else if (val >= 101 && val <= 110) {
    wellSeason = 'Post-Monsoon';
    wellSeasonYear = year - 1;
  } else {
    // Fallbacks
    if (val > 110 && val < 201) wellSeason = 'Winter';
    else if (val > 315 && val < 420) wellSeason = 'Pre-Monsoon';
    else if (val > 610 && val < 801) wellSeason = 'Mid-Monsoon';
    else {
      wellSeason = 'Post-Monsoon';
      if (val <= 100) wellSeasonYear = year - 1;
    }
  }
  
  return wellSeason === targetSeason && wellSeasonYear === targetYear;
};

export const exportNotMonitoredReport = async (wellsData, currentSeasonStr) => {
  try {
    const notMonitoredWells = wellsData.filter(w => {
      // Check if inactive (closed/cemented/dumped)
      const rem = (w.remarks || '').toLowerCase();
      const isActive = !rem.includes('closed') && !rem.includes('cemented') && !rem.includes('dumped');
      if (!isActive) return false;
      
      const hasDate = w.date !== null && w.date !== undefined && w.date !== '';
      const hasBmp = w.dtgwl_bmp !== null && w.dtgwl_bmp !== undefined && w.dtgwl_bmp !== '' && !isNaN(Number(w.dtgwl_bmp));
      
      let dateInRange = false;
      if (hasDate) {
        dateInRange = checkDateInSeasonRangeLocal(w.date, currentSeasonStr);
      }
      
      return !hasDate || !hasBmp || !dateInRange;
    });

    if (notMonitoredWells.length === 0) {
      Alert.alert("No Stations Found", "All active stations are successfully monitored for this season!");
      return;
    }

    // Build worksheet data
    const wsData = [
      ["Sl. No.", "District", "Block", "Location", "Well Type", "Well Number", "Date of Visit", "DTGWL (bmp) Raw", "Remarks", "Comments"]
    ];

    notMonitoredWells.forEach((well, idx) => {
      const dist = getDistrictFromSheetLocal(well.sheet);
      wsData.push([
        idx + 1,
        dist,
        well.block || "",
        well.location || "",
        well.well_type || "",
        well.well_number || "",
        well.date || "",
        (well.dtgwl_bmp_raw !== undefined && well.dtgwl_bmp_raw !== null) ? well.dtgwl_bmp_raw : (well.dtgwl_bmp !== null && well.dtgwl_bmp !== undefined ? String(well.dtgwl_bmp) : ""),
        well.remarks || "",
        well.comment || ""
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Auto-fit column widths
    const maxLens = wsData[0].map((_, colIdx) => 
      Math.max(...wsData.map(row => String(row[colIdx] || '').length))
    );
    ws['!cols'] = maxLens.map(len => ({ wch: len + 3 }));

    XLSX.utils.book_append_sheet(wb, ws, "Not Monitored");

    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const filename = `Not_Monitored_Stations_${currentSeasonStr.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    const fileUri = `${FileSystem.externalCacheDirectory || FileSystem.documentDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
    
    try {
      await FileSystem.writeAsStringAsync(`file:///sdcard/Download/${filename}`, base64, { encoding: 'base64' });
    } catch (e) {
      console.warn("Failed to write to public download folder:", e);
    }

    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (isSharingAvailable) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: filename,
        UTI: 'com.microsoft.excel.xlsx'
      });
    } else {
      Alert.alert("Export Success", `Not Monitored report saved locally at:\n${fileUri}`);
    }
  } catch (err) {
    console.error("Not Monitored export failed:", err);
    Alert.alert("Export Failed", err.message);
  }
};

export const exportTelemetryToExcel = async (telemetryRecords) => {
  if (!telemetryRecords || telemetryRecords.length === 0) {
    Alert.alert("No Data", "No telemetry data available to export.");
    return;
  }

  try {
    const rows = telemetryRecords.map(item => ({
      "Station": item["Station"] || '',
      "Agency": item["Agency"] || '',
      "State": item["State"] || '',
      "District": item["District"] || '',
      "Latitude": parseFloat(item["Latitude"]) || 0.0,
      "Longitude": parseFloat(item["Longitude"]) || 0.0,
      "Water Level (m)": parseFloat(item["Groundwater Level Telemetry 6 Hourly (meter)"]) || 0.0,
      "Acquisition Time": item["Data Acquisition Time"] || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    
    // Auto-fit column widths
    const maxLens = {};
    rows.forEach(row => {
      Object.keys(row).forEach(key => {
        const val = String(row[key]);
        maxLens[key] = Math.max(maxLens[key] || key.length, val.length);
      });
    });
    ws['!cols'] = Object.keys(maxLens).map(key => ({ wch: maxLens[key] + 3 }));

    XLSX.utils.book_append_sheet(wb, ws, "Telemetry Data");

    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const filename = `Telemetry_Data_${Date.now()}.xlsx`;
    const fileUri = `${FileSystem.externalCacheDirectory || FileSystem.documentDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });

    try {
      await FileSystem.writeAsStringAsync(`file:///sdcard/Download/${filename}`, base64, { encoding: 'base64' });
    } catch (e) {
      console.warn("Failed to write to public download folder:", e);
    }

    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (isSharingAvailable) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: filename,
        UTI: 'com.microsoft.excel.xlsx'
      });
    } else {
      Alert.alert("Export Success", `Telemetry data saved locally at:\n${fileUri}`);
    }
  } catch (err) {
    console.error("Telemetry export failed:", err);
    Alert.alert("Export Failed", err.message);
  }
};
