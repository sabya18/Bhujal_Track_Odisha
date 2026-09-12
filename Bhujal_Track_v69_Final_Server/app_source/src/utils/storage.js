import AsyncStorage from '@react-native-async-storage/async-storage';
import initialWellsData from '../data/wells.json';
import preloadedWttoData from '../data/wtto_preloaded.json';


const CACHE_KEY = 'gw_wells_cache';
const VERSION_KEY = 'gw_wells_cache_version';
const CURRENT_VERSION = 'v7'; // Increment version to force reset cache

export const normalizeBlockName = (blockName) => {
  if (!blockName) return '';
  const trimmed = blockName.trim();
  const lower = trimmed.toLowerCase();
  
  if (lower === 'aul') return 'Aul';
  if (lower === 'derbish' || lower === 'derabish') return 'Derabish';
  if (lower === 'kendrapara') return 'Kendrapara';
  if (lower === 'marsaghai' || lower === 'marsaghal' || lower === 'marsaghau' || lower === 'marshaghai') return 'Marsaghai';
  if (lower === 'garadapur' || lower === 'garadpur' || lower === 'gardapur') return 'Garadpur';
  
  // Default: Title case first letter
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

export const getDistrictFromSheet = (sheet) => {
  if (!sheet) return 'Other';
  const c = sheet.toLowerCase().replace(/[\s_\.\-]+/g, '');
  if (c.includes('kendrapara')) return sheet.toLowerCase().includes('urban') ? 'Kendrapara Urban' : 'Kendrapara';
  if (c.includes('cuttack')) return sheet.toLowerCase().includes('urban') ? 'Cuttack Urban' : 'Cuttack';
  if (c.includes('jajpur')) return sheet.toLowerCase().includes('urban') ? 'Jajpur Urban' : 'Jajpur';
  if (c.includes('jagatsinghpur') || c.includes('jspur')) return 'Jagatsinghpur';
  if (c.includes('bolangir') || c.includes('balangir')) return 'Balangir';
  if (c.includes('bhubaneswar') || c.includes('khurda') || c.includes('khordha')) return 'Khordha';
  if (c.includes('nawarangapur') || c.includes('nabarangpur')) return 'Nabarangpur';
  if (c.includes('debagarh') || c.includes('deogarh')) return 'Deogarh';
  if (c.includes('baleshwar') || c.includes('balasore')) return 'Balasore';
  if (c.includes('kendujhar') || c.includes('keonjhar')) return 'Keonjhar';
  
  const cleaned = sheet.trim().replace(/_blocks/i, '').replace(/_urban/i, '');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

export const loadWells = async () => {
  try {
    const cachedVersion = await AsyncStorage.getItem(VERSION_KEY).catch(() => null);
    let cachedData = null;
    try {
      cachedData = await AsyncStorage.getItem(CACHE_KEY);
    } catch (e) {
      console.warn("AsyncStorage getItem failed (blob too big), clearing cache key:", e);
      await AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
    }
    let data;
    if (cachedData !== null && cachedVersion === CURRENT_VERSION) {
      data = JSON.parse(cachedData);
      const hasOldWell = data.some(well => well.well_number === '17M02DW048' || well.well_number === '17BR07DW048');
      if (hasOldWell) {
        data = initialWellsData;
      }
    } else {
      data = initialWellsData;
    }
    // Normalize block names and attach district on load
    return data.map(well => ({
      ...well,
      district: well.district || getDistrictFromSheet(well.sheet),
      block: normalizeBlockName(well.block)
    }));
  } catch (error) {
    console.error('Failed to load wells from AsyncStorage:', error);
    return initialWellsData.map(well => ({
      ...well,
      district: well.district || getDistrictFromSheet(well.sheet),
      block: normalizeBlockName(well.block)
    }));
  }
};

export const saveWells = async (wellsData) => {
  try {
    // Normalize block names on save
    const normalized = wellsData.map(well => ({
      ...well,
      block: normalizeBlockName(well.block)
    }));
    // Only attempt save if payload is reasonable, or catch SQLiteBlobTooBigException safely
    const jsonStr = JSON.stringify(normalized);
    if (jsonStr.length < 1800000) {
      await AsyncStorage.setItem(CACHE_KEY, jsonStr);
    }
    return true;
  } catch (error) {
    console.error('Failed to save wells to AsyncStorage (ignoring oversized cache):', error);
    return true;
  }
};

export const getCustomTemplate = async (division) => {
  try {
    const key = `gw_custom_excel_template_${division}`;
    return await AsyncStorage.getItem(key);
  } catch (error) {
    console.error('Failed to get custom template:', error);
    return null;
  }
};

export const saveCustomTemplate = async (division, b64) => {
  try {
    const key = `gw_custom_excel_template_${division}`;
    await AsyncStorage.setItem(key, b64);
    return true;
  } catch (error) {
    console.error('Failed to save custom template:', error);
    return false;
  }
};

export const clearAllCustomTemplates = async () => {
  const divisions = [
    'CUTTACK DIVISION',
    'SAMBALPUR DIVISION',
    'BERHAMPUR DIVISION',
    'BALASORE DIVISION',
    'BOLANGIR DIVISION',
    'KORAPUT DIVISION',
    'BHAWANIPATNA DIVISION',
    'ANGUL DIVISION'
  ];
  for (const div of divisions) {
    try {
      const key = `gw_custom_excel_template_${div}`;
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.warn(`Failed to clear template for ${div}:`, e);
    }
  }
};

const VISITS_HISTORY_KEY = 'gw_visits_history';
const WTTO_CACHE_KEY = 'gw_wtto_cache';

export const loadWttoData = async () => {
  try {
    const listStr = await AsyncStorage.getItem(`${WTTO_CACHE_KEY}_sheets_list`);
    if (!listStr) {
      try {
        const cachedData = await AsyncStorage.getItem(WTTO_CACHE_KEY);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          await saveWttoData(parsed);
          return parsed;
        }
      } catch (innerError) {
        console.warn("[storage] Failed to load/migrate old WTTO cache key (likely too large), removing old key:", innerError);
        try {
          await AsyncStorage.removeItem(WTTO_CACHE_KEY);
        } catch (rmErr) {}
      }
      return preloadedWttoData;
    }
    const sheetNames = JSON.parse(listStr);
    if (!sheetNames || sheetNames.length === 0) return preloadedWttoData;

    const keys = sheetNames.map(name => `${WTTO_CACHE_KEY}_sheet_${name}`);
    const pairs = await AsyncStorage.multiGet(keys);
    
    // Group preloaded data by normalized sheet name to allow individual overrides
    const mergedMap = {};
    preloadedWttoData.forEach(well => {
      const sheetKey = (well.sheet || '').toLowerCase().trim();
      if (!mergedMap[sheetKey]) {
        mergedMap[sheetKey] = [];
      }
      mergedMap[sheetKey].push(well);
    });

    // Override or add cached sheets from user imports
    pairs.forEach(([key, val]) => {
      if (val) {
        const parsedWells = JSON.parse(val);
        if (parsedWells.length > 0) {
          const sheetName = parsedWells[0].sheet || '';
          const sheetKey = sheetName.toLowerCase().trim();
          mergedMap[sheetKey] = parsedWells;
        }
      }
    });

    // Flatten and return the merged array
    const mergedList = [];
    Object.values(mergedMap).forEach(list => {
      mergedList.push(...list);
    });

    return mergedList;
  } catch (error) {
    console.error('Failed to load WTTO data from AsyncStorage:', error);
    return preloadedWttoData;
  }
};

export const saveWttoData = async (wttoData) => {
  try {
    if (!wttoData || wttoData.length === 0) {
      await resetWttoData();
      return true;
    }
    
    // Group by sheet name
    const grouped = {};
    wttoData.forEach(well => {
      const sheet = well.sheet || 'Other';
      if (!grouped[sheet]) grouped[sheet] = [];
      grouped[sheet].push(well);
    });

    const sheetNames = Object.keys(grouped);
    
    // MultiSet individual sheets
    const pairs = sheetNames.map(name => [
      `${WTTO_CACHE_KEY}_sheet_${name}`,
      JSON.stringify(grouped[name])
    ]);
    
    await AsyncStorage.multiSet(pairs);
    await AsyncStorage.setItem(`${WTTO_CACHE_KEY}_sheets_list`, JSON.stringify(sheetNames));
    
    // Clean up old main key to save space
    await AsyncStorage.removeItem(WTTO_CACHE_KEY);
    return true;
  } catch (error) {
    console.error('Failed to save WTTO data to AsyncStorage:', error);
    return false;
  }
};

export const resetWttoData = async () => {
  try {
    const listStr = await AsyncStorage.getItem(`${WTTO_CACHE_KEY}_sheets_list`);
    if (listStr) {
      const sheetNames = JSON.parse(listStr);
      if (sheetNames && sheetNames.length > 0) {
        const keys = sheetNames.map(name => `${WTTO_CACHE_KEY}_sheet_${name}`);
        await AsyncStorage.multiRemove(keys);
      }
    }
    await AsyncStorage.removeItem(`${WTTO_CACHE_KEY}_sheets_list`);
    await AsyncStorage.removeItem(WTTO_CACHE_KEY);
    return true;
  } catch (error) {
    console.error('Failed to reset WTTO data:', error);
    return false;
  }
};

export const resetWells = async () => {
  try {
    const normalized = initialWellsData.map(well => ({
      ...well,
      block: normalizeBlockName(well.block)
    }));
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(normalized));
    await clearAllCustomTemplates();
    
    // Reset visits history split keys
    const listStr = await AsyncStorage.getItem(`${VISITS_HISTORY_KEY}_wells_list`);
    if (listStr) {
      const wellNumbers = JSON.parse(listStr);
      if (wellNumbers && wellNumbers.length > 0) {
        const keys = wellNumbers.map(wn => `${VISITS_HISTORY_KEY}_well_${wn}`);
        await AsyncStorage.multiRemove(keys);
      }
    }
    await AsyncStorage.removeItem(`${VISITS_HISTORY_KEY}_wells_list`);
    await AsyncStorage.removeItem(VISITS_HISTORY_KEY);

    await resetWttoData();
    return normalized;
  } catch (error) {
    console.error('Failed to reset wells cache:', error);
    return initialWellsData.map(well => ({
      ...well,
      block: normalizeBlockName(well.block)
    }));
  }
};

export const loadVisitsHistory = async () => {
  try {
    const listStr = await AsyncStorage.getItem(`${VISITS_HISTORY_KEY}_wells_list`);
    if (!listStr) {
      try {
        const cached = await AsyncStorage.getItem(VISITS_HISTORY_KEY);
        if (cached) {
          const history = JSON.parse(cached);
          // Migrate old keys to new keys if present
          let migrated = false;
          if (history['17M02DW048']) {
            history['17M02TW048'] = { ...history['17M02TW048'], ...history['17M02DW048'] };
            delete history['17M02DW048'];
            migrated = true;
          }
          if (history['17BR07DW048']) {
            history['17M02TW048'] = { ...history['17M02TW048'], ...history['17BR07DW048'] };
            delete history['17BR07DW048'];
            migrated = true;
          }
          
          // Save to new structure
          const wellNumbers = Object.keys(history);
          if (wellNumbers.length > 0) {
            const pairs = wellNumbers.map(wn => [
              `${VISITS_HISTORY_KEY}_well_${wn}`,
              JSON.stringify(history[wn])
            ]);
            await AsyncStorage.multiSet(pairs);
            await AsyncStorage.setItem(`${VISITS_HISTORY_KEY}_wells_list`, JSON.stringify(wellNumbers));
          }
          await AsyncStorage.removeItem(VISITS_HISTORY_KEY);
          return history;
        }
      } catch (innerError) {
        console.warn("[storage] Failed to load/migrate old visits history key (likely too large), removing old key:", innerError);
        try {
          await AsyncStorage.removeItem(VISITS_HISTORY_KEY);
        } catch (rmErr) {}
      }
      return {};
    }

    const wellNumbers = JSON.parse(listStr);
    if (!wellNumbers || wellNumbers.length === 0) return {};

    const keys = wellNumbers.map(wn => `${VISITS_HISTORY_KEY}_well_${wn}`);
    const pairs = await AsyncStorage.multiGet(keys);
    
    const history = {};
    pairs.forEach(([key, val]) => {
      if (val) {
        const wellNum = key.replace(`${VISITS_HISTORY_KEY}_well_`, '');
        history[wellNum] = JSON.parse(val);
      }
    });

    return history;
  } catch (error) {
    console.error('Failed to load visits history:', error);
    return {};
  }
};

export const saveVisitToHistory = async (wellNumber, seasonKey, date, value) => {
  try {
    const key = `${VISITS_HISTORY_KEY}_well_${wellNumber}`;
    const cached = await AsyncStorage.getItem(key);
    const wellHistory = cached ? JSON.parse(cached) : {};

    wellHistory[seasonKey] = {
      date: date || '',
      value: value != null ? parseFloat(value) : null
    };

    await AsyncStorage.setItem(key, JSON.stringify(wellHistory));

    const listStr = await AsyncStorage.getItem(`${VISITS_HISTORY_KEY}_wells_list`);
    const wellNumbers = listStr ? JSON.parse(listStr) : [];
    if (!wellNumbers.includes(wellNumber)) {
      wellNumbers.push(wellNumber);
      await AsyncStorage.setItem(`${VISITS_HISTORY_KEY}_wells_list`, JSON.stringify(wellNumbers));
    }

    return true;
  } catch (error) {
    console.error('Failed to save visit to history:', error);
    return false;
  }
};

export const saveMultipleVisitsToHistory = async (visitsList) => {
  try {
    if (!visitsList || visitsList.length === 0) return true;

    const listStr = await AsyncStorage.getItem(`${VISITS_HISTORY_KEY}_wells_list`);
    const wellNumbers = new Set(listStr ? JSON.parse(listStr) : []);

    const uniqueWells = Array.from(new Set(visitsList.map(v => v.wellNumber)));
    const keys = uniqueWells.map(wn => `${VISITS_HISTORY_KEY}_well_${wn}`);
    const pairs = await AsyncStorage.multiGet(keys);
    const currentHistories = {};
    pairs.forEach(([key, val]) => {
      const wn = key.replace(`${VISITS_HISTORY_KEY}_well_`, '');
      currentHistories[wn] = val ? JSON.parse(val) : {};
    });

    visitsList.forEach(({ wellNumber, seasonKey, date, value }) => {
      if (!currentHistories[wellNumber]) {
        currentHistories[wellNumber] = {};
      }
      currentHistories[wellNumber][seasonKey] = {
        date: date || '',
        value: value != null ? parseFloat(value) : null
      };
      wellNumbers.add(wellNumber);
    });

    const savePairs = Object.keys(currentHistories).map(wn => [
      `${VISITS_HISTORY_KEY}_well_${wn}`,
      JSON.stringify(currentHistories[wn])
    ]);
    
    await AsyncStorage.multiSet(savePairs);
    await AsyncStorage.setItem(`${VISITS_HISTORY_KEY}_wells_list`, JSON.stringify(Array.from(wellNumbers)));

    return true;
  } catch (error) {
    console.error('Failed to save multiple visits to history:', error);
    return false;
  }
};


