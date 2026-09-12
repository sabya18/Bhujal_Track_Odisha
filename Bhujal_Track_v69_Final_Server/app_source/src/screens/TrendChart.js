import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Platform
} from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { loadVisitsHistory } from '../utils/storage';

// Local assets
import { CHART_JS_SRC } from '../data/chartjs';
import historicalTrends from '../data/historical_trends.json';
import rainfallData from '../data/rainfall_data.json';
import gwraData from '../data/gwra_data.json';

const standardizeSeasonKey = (seasonKey) => {
  if (!seasonKey) return '';
  const parts = seasonKey.replace('_', ' ').trim().split(/\s+/);
  if (parts.length < 2) return seasonKey;
  const year = parts[0];
  const rest = parts.slice(1).join('').toLowerCase();
  
  let season = '';
  if (rest.includes('winter')) {
    season = 'Winter';
  } else if (rest.includes('pre')) {
    season = 'PreMon';
  } else if (rest.includes('mid')) {
    season = 'MidMon';
  } else if (rest.includes('post')) {
    season = 'PostMon';
  } else {
    season = parts.slice(1).join('');
  }
  return `${year}_${season}`;
};

const getSeasonOrder = (seasonStr) => {
  const lower = seasonStr.toLowerCase();
  if (lower.includes('winter')) return 1;
  if (lower.includes('pre')) return 2;
  if (lower.includes('mid')) return 3;
  if (lower.includes('post')) return 4;
  return 9;
};

// Helper retained for old experiments, but no longer used for production charts.
// Historical values must come from imported WTTO sheets or user-recorded visits.
const generateMockTrends = (wellNumber, blockName, districtName, baselineBgl = 4.0) => {
  const trends = [];
  const startYear = 2016;
  const endYear = 2026;
  
  // Use well number hash as seed for minor random variation
  let seed = 0;
  for (let i = 0; i < wellNumber.length; i++) {
    seed += wellNumber.charCodeAt(i);
  }
  
  const pseudoRandom = (step) => {
    const x = Math.sin(seed + step) * 10000;
    return x - Math.floor(x);
  };

  let currentBaseline = baselineBgl > 0 ? baselineBgl : 3.5;
  const seasons = ['Winter', 'PreMon', 'MidMon', 'PostMon'];
  
  // Seasonal offsets (PreMon is deepest/largest BGL, MidMon is shallowest/smallest BGL)
  const seasonalOffsets = {
    'PreMon': 1.1,  // Deepest (dry summer)
    'MidMon': -1.2, // Shallowest (monsoon rains replenish)
    'PostMon': -0.5,// Moderate replenishment
    'Winter': 0.4   // Moderate depletion
  };

  let step = 0;
  for (let y = startYear; y <= endYear; y++) {
    // Add minor year-over-year drift (random walk)
    currentBaseline += (pseudoRandom(step++) - 0.5) * 0.3;
    if (currentBaseline < 1.0) currentBaseline = 1.0;
    if (currentBaseline > 12.0) currentBaseline = 12.0;

    for (const season of seasons) {
      if (y === endYear && season !== 'Winter' && season !== 'PreMon') {
        continue; // Don't exceed current season limit
      }
      
      const offset = seasonalOffsets[season];
      // Add small seasonal noise
      const noise = (pseudoRandom(step++) - 0.5) * 0.2;
      const val = Number((currentBaseline + offset + noise).toFixed(2));
      
      trends.push({
        season: `${y}_${season}`,
        value: val < 0.2 ? 0.2 : val
      });
    }
  }
  return trends;
};

// Mann-Kendall and Sen's Slope trend calculation
const calculateMannKendallAndSensSlope = (data) => {
  const validData = data.filter(v => v !== null && v !== undefined && !isNaN(v));
  const n = validData.length;
  if (n < 4) {
    return {
      s: 0,
      z: 0,
      pValue: 1.0,
      sensSlope: 0.0,
      trendText: 'N/A (Need >= 4 points)',
      trendColor: '#64748b',
      isSignificant: false
    };
  }

  // 1. Compute S Statistic
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const diff = validData[j] - validData[i];
      if (diff > 0) s += 1;
      if (diff < 0) s -= 1;
    }
  }

  // 2. Compute Var(S) with tie adjustments
  const valueCounts = {};
  validData.forEach(v => {
    valueCounts[v] = (valueCounts[v] || 0) + 1;
  });

  let tieSum = 0;
  Object.values(valueCounts).forEach(count => {
    if (count > 1) {
      tieSum += count * (count - 1) * (2 * count + 5);
    }
  });

  const varS = (n * (n - 1) * (2 * n + 5) - tieSum) / 18;

  // 3. Compute Z-Score and P-Value (Normal CDF Approximation)
  let z = 0;
  if (varS > 0) {
    if (s > 0) z = (s - 1) / Math.sqrt(varS);
    else if (s < 0) z = (s + 1) / Math.sqrt(varS);
  }

  const normCDF = (val) => {
    // Abramowitz & Stegun approximation
    const t = 1 / (1 + 0.2316419 * Math.abs(val));
    const d = 0.3989423 * Math.exp(-val * val / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return val >= 0 ? 1 - p : p;
  };

  const pValue = 2 * (1 - normCDF(Math.abs(z)));

  // 4. Compute Sen's Slope
  const slopes = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dy = validData[j] - validData[i];
      const dx = j - i;
      slopes.push(dy / dx);
    }
  }
  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  const sensSlope = slopes.length % 2 !== 0 ? slopes[mid] : (slopes[mid - 1] + slopes[mid]) / 2;

  // Threshold: alpha = 0.05 (Z-critical = 1.96)
  const isSignificant = Math.abs(z) >= 1.96;
  let trendText = 'Stable (No Monotonic Trend)';
  let trendColor = '#64748b'; // slate gray

  if (isSignificant) {
    if (s > 0) {
      trendText = 'Depleting (Increasing BGL)';
      trendColor = '#ef4444'; // red
    } else {
      trendText = 'Recovering (Decreasing BGL)';
      trendColor = '#10b981'; // green
    }
  } else {
    if (s > 0) {
      trendText = 'Slight Depletion (Non-Sig.)';
      trendColor = '#f59e0b'; // amber
    } else if (s < 0) {
      trendText = 'Slight Recovery (Non-Sig.)';
      trendColor = '#3b82f6'; // blue
    }
  }

  return {
    s,
    z: Number(z.toFixed(3)),
    pValue: Number(pValue.toFixed(4)),
    sensSlope: Number(sensSlope.toFixed(4)),
    trendText,
    trendColor,
    isSignificant
  };
};
// Normalise block name spelling variations
const normalizeBlockName = (blockName) => {
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

// Normalize-safe lookup in historical trends blocks
const getHistoricalBlockTrends = (blockName) => {
  const norm = normalizeBlockName(blockName);
  for (const key of Object.keys(historicalTrends.blocks)) {
    if (normalizeBlockName(key) === norm) {
      return historicalTrends.blocks[key];
    }
  }
  return null;
};

// Normalize-safe lookup in block rainfall data
const getRainfallBlockData = (blockName) => {
  const norm = normalizeBlockName(blockName);
  for (const key of Object.keys(rainfallData.blocks)) {
    if (normalizeBlockName(key) === norm) {
      return rainfallData.blocks[key];
    }
  }
  return null;
};

// Helper to calculate annual fluctuation (PreMon - PostMon)
const computeFluctuation = (trendsList) => {
  const yearData = {};
  trendsList.forEach(t => {
    const parts = t.season.split('_');
    if (parts.length < 2) return;
    const year = parts[0];
    const season = parts[1];
    if (!yearData[year]) {
      yearData[year] = {};
    }
    yearData[year][season] = t.value;
  });

  const fluctuations = [];
  const sortedYears = Object.keys(yearData).sort((a, b) => parseInt(a) - parseInt(b));
  
  sortedYears.forEach(y => {
    const pre = yearData[y]['PreMon'];
    const post = yearData[y]['PostMon'];
    if (pre !== undefined && post !== undefined) {
      // Fluctuation = PreMon - PostMon (water table rise is positive)
      const diff = Number((pre - post).toFixed(2));
      fluctuations.push({
        year: y,
        value: diff,
        pre: pre,
        post: post
      });
    }
  });
  return fluctuations;
};

// Helper to calculate annual average BGL (grouped by hydrological year)
const computeAnnualAverage = (trendsList) => {
  const yearData = {};
  trendsList.forEach(t => {
    const parts = t.season.split('_');
    if (parts.length < 2) return;
    const year = parseInt(parts[0]);
    const season = parts[1];
    
    // Group by calendar year directly
    const hydroYear = year;
    
    if (!yearData[hydroYear]) {
      yearData[hydroYear] = [];
    }
    yearData[hydroYear].push(t.value);
  });

  const averages = [];
  const sortedYears = Object.keys(yearData).sort((a, b) => parseInt(a) - parseInt(b));
  
  sortedYears.forEach(y => {
    const vals = yearData[y];
    if (vals.length > 0) {
      const avg = Number((vals.reduce((sum, v) => sum + v, 0) / vals.length).toFixed(2));
      averages.push({
        year: y.toString(),
        value: avg
      });
    }
  });
  return averages;
};

// Helper to calculate linear regression trendline (least-squares fit)
const calculateRegressionLine = (values) => {
  const n = values.length;
  if (n < 2) return values.map(() => null);
  
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let count = 0;
  
  for (let i = 0; i < n; i++) {
    const y = values[i];
    if (y !== undefined && y !== null && !isNaN(y)) {
      const x = i;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
      count++;
    }
  }
  
  if (count < 2) return values.map(() => null);
  
  const m = (count * sumXY - sumX * sumY) / (count * sumXX - sumX * sumX);
  const c = (sumY - m * sumX) / count;
  
  return values.map((_, i) => Number((m * i + c).toFixed(2)));
};

// Helper to project linear regression into the future
const calculateExtendedRegressionLine = (values, totalLength) => {
  const n = values.length;
  if (n < 2) return Array(totalLength).fill(null);
  
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let count = 0;
  
  for (let i = 0; i < n; i++) {
    const y = values[i];
    if (y !== undefined && y !== null && !isNaN(y)) {
      const x = i;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
      count++;
    }
  }
  
  if (count < 2) return Array(totalLength).fill(null);
  
  const m = (count * sumXY - sumX * sumY) / (count * sumXX - sumX * sumX);
  const c = (sumY - m * sumX) / count;
  
  const result = [];
  for (let i = 0; i < totalLength; i++) {
    result.push(Number((m * i + c).toFixed(2)));
  }
  return result;
};

// Helper to compute descriptive statistics
const calculateDescriptiveStats = (values) => {
  const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
  const n = validValues.length;
  if (n === 0) return { mean: 'N/A', median: 'N/A', stdDev: 'N/A' };

  // 1. Mean
  const sum = validValues.reduce((acc, val) => acc + val, 0);
  const mean = sum / n;

  // 2. Median
  const sorted = [...validValues].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // 3. Standard Deviation (Sample)
  let varianceSum = 0;
  validValues.forEach(val => {
    varianceSum += Math.pow(val - mean, 2);
  });
  const variance = n > 1 ? varianceSum / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);

  return {
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2))
  };
};

const inferSeasonFromDateLocal = (dateStr) => {
  if (!dateStr) return null;
  let day = 1;
  let month = 1;
  let year = new Date().getFullYear();
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
  if (isNaN(month) || isNaN(year) || isNaN(day)) return null;

  let season = 'Winter';
  if ((month === 2 && day >= 1) || (month === 3 && day <= 31)) {
    season = 'Winter';
  } else if ((month === 5 && day >= 1) || (month === 6 && day <= 30)) {
    season = 'PreMon';
  } else if ((month === 8 && day >= 1) || (month === 9 && day <= 30)) {
    season = 'MidMon';
  } else if ((month === 11 && day >= 1) || (month === 12 && day <= 31)) {
    season = 'PostMon';
  } else {
    if (month === 1) season = 'Winter';
    else if (month === 4) season = 'PreMon';
    else if (month === 7) season = 'MidMon';
    else if (month === 10) season = 'PostMon';
  }

  return `${year}_${season}`;
};

export default function TrendChart({ wellsData, wttoData = [], preselectedWell, onClose, theme, toggleTheme }) {
  const isDark = theme === 'dark';
  const styles = getStyles(theme);
  const webviewRef = useRef(null);

  // 1. Selector States
  const [selectedDist, setSelectedDist] = useState('Kendrapara');
  const [selectedBlock, setSelectedBlock] = useState('All Blocks');
  const [selectedStation, setSelectedStation] = useState('All Stations');
  
  const [showDistPicker, setShowDistPicker] = useState(false);
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [showStationPicker, setShowStationPicker] = useState(false);

  const [timeRange, setTimeRange] = useState('10'); // '5', '10', or 'all'
  const [chartType, setChartType] = useState('line'); // 'line' or 'bar'
  const [displayMode, setDisplayMode] = useState('depth'); // 'depth', 'annual', or 'fluctuation'
  const [showRainfall, setShowRainfall] = useState(true);
  const [forecastMode, setForecastMode] = useState('none'); // 'none', '2036', or '2047'
  const [showReportModal, setShowReportModal] = useState(false);
  const [statsOverlayMode, setStatsOverlayMode] = useState('none'); // 'none', 'mean', 'median', 'all'
  const [showChartOptions, setShowChartOptions] = useState(true);

  // Custom visits history and comparison states
  const [visitsHistory, setVisitsHistory] = useState({});
  const [compareYearA, setCompareYearA] = useState('2016');
  const [compareYearB, setCompareYearB] = useState('2026');
  const [showYearAPicker, setShowYearAPicker] = useState(false);
  const [showYearBPicker, setShowYearBPicker] = useState(false);

  // Load persistent visits history
  useEffect(() => {
    const fetchHistory = async () => {
      const hist = await loadVisitsHistory();
      setVisitsHistory(hist || {});
    };
    fetchHistory();
  }, [wellsData]);

  // Pre-load station if passed from Map modal
  useEffect(() => {
    if (preselectedWell) {
      const dist = getDistrictFromSheetLocal(preselectedWell.sheet);
      setSelectedDist(dist);
      setSelectedBlock(normalizeBlockName(preselectedWell.block) || 'All Blocks');
      setSelectedStation(preselectedWell.well_number);
    }
  }, [preselectedWell]);

  const getDistrictFromSheetLocal = (sheet) => {
    if (!sheet) return 'Other';
    const c = sheet.toLowerCase().replace(/[\s_\.\-]+/g, '');
    
    if (c.includes('kendrapara') || c.includes('kdp')) {
      return (sheet.toLowerCase().includes('urban') || c.includes('urban')) ? 'Kendrapara Urban' : 'Kendrapara';
    }
    if (c.includes('cuttack') || c.includes('ctc')) {
      return (sheet.toLowerCase().includes('urban') || c.includes('urban')) ? 'Cuttack Urban' : 'Cuttack';
    }
    if (c.includes('jajpur') || c.includes('jjp')) {
      return (sheet.toLowerCase().includes('urban') || c.includes('urban')) ? 'Jajpur Urban' : 'Jajpur';
    }
    if (c.includes('jagatsinghpur') || c.includes('jagatsinghapur') || c.includes('jspur') || c.includes('jagatsingpur')) {
      return 'Jagatsinghpur';
    }
    if (c.includes('bolangir') || c.includes('balangir') || c.includes('blgr')) {
      return 'Balangir';
    }
    if (c.includes('bhubaneswar') || c.includes('khurda') || c.includes('khordha') || c.includes('bbsr')) {
      return 'Khordha';
    }
    if (c.includes('nawarangapur') || c.includes('nabarangapur') || c.includes('nabarangpur') || c.includes('nbrg')) {
      return 'Nabarangpur';
    }
    if (c.includes('debagarh') || c.includes('deogarh') || c.includes('dgr')) {
      return 'Deogarh';
    }
    if (c.includes('baleshwar') || c.includes('balasore') || c.includes('balesore') || c.includes('baleswar') || c.includes('bls')) {
      return 'Balasore';
    }
    if (c.includes('kendujhar') || c.includes('keonjhar') || c.includes('kjr')) {
      return 'Keonjhar';
    }
    if (c.includes('angul') || c.includes('angl')) return 'Angul';
    if (c.includes('bhadrak') || c.includes('bdrk')) return 'Bhadrak';
    if (c.includes('bargarh') || c.includes('brgh')) return 'Bargarh';
    if (c.includes('boudh') || c.includes('bdh')) return 'Boudh';
    if (c.includes('gajapati') || c.includes('gjpt')) return 'Gajapati';
    if (c.includes('ganjam') || c.includes('gnjm')) return 'Ganjam';
    if (c.includes('jharsuguda') || c.includes('jsgd')) return 'Jharsuguda';
    if (c.includes('kalahandi') || c.includes('klhd')) return 'Kalahandi';
    if (c.includes('kandhamal') || c.includes('kndh')) return 'Kandhamal';
    if (c.includes('koraput') || c.includes('krpt')) return 'Koraput';
    if (c.includes('malkangiri') || c.includes('mkgri')) return 'Malkangiri';
    if (c.includes('mayurbhanj') || c.includes('mybh')) return 'Mayurbhanj';
    if (c.includes('nayagarh') || c.includes('nygh')) return 'Nayagarh';
    if (c.includes('nuapada') || c.includes('npda')) return 'Nuapada';
    if (c.includes('puri')) return 'Puri';
    if (c.includes('rayagada') || c.includes('rygd')) return 'Rayagada';
    if (c.includes('sambalpur') || c.includes('sbpr')) return 'Sambalpur';
    if (c.includes('subarnapur') || c.includes('subrn') || c.includes('sonepur')) return 'Subarnapur';
    if (c.includes('sundargarh') || c.includes('sndg')) return 'Sundargarh';

    const cleaned = sheet.trim().replace(/_blocks/i, '').replace(/_urban/i, '');
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  };

  const getLatestWaterLevel = (well, histObj) => {
    // 1. Check user recorded visits in histObj
    const userHistory = histObj[well.well_number];
    if (userHistory) {
      const sortedKeys = Object.keys(userHistory).sort((a, b) => b.localeCompare(a));
      for (const key of sortedKeys) {
        if (userHistory[key] && userHistory[key].value !== null && userHistory[key].value !== undefined) {
          return parseFloat(userHistory[key].value);
        }
      }
    }

    // 2. Check well's preloaded history
    if (well.history) {
      const sortedKeys = Object.keys(well.history).sort((a, b) => b.localeCompare(a));
      for (const key of sortedKeys) {
        if (well.history[key] !== null && well.history[key] !== undefined && well.history[key] !== '') {
          return parseFloat(well.history[key]);
        }
      }
    }

    // 3. Check corresponding entry in wttoData
    const wttoWell = wttoData.find(wt => wt.well_number === well.well_number);
    if (wttoWell && wttoWell.history) {
      const sortedKeys = Object.keys(wttoWell.history).sort((a, b) => b.localeCompare(a));
      for (const key of sortedKeys) {
        if (wttoWell.history[key] !== null && wttoWell.history[key] !== undefined && wttoWell.history[key] !== '') {
          return parseFloat(wttoWell.history[key]);
        }
      }
    }

    // 4. Check well's base/default values
    if (well.dtgwl_mbgl !== null && well.dtgwl_mbgl !== undefined && well.dtgwl_mbgl !== '') {
      const val = parseFloat(well.dtgwl_mbgl);
      if (!isNaN(val)) return val;
    }

    return null;
  };

  // 2. Compute dropdown lists based on loaded Excel wellsData and wttoData
  const districts = useMemo(() => {
    const list = new Set();
    wellsData.forEach(w => {
      const d = getDistrictFromSheetLocal(w.sheet);
      list.add(d);
    });
    wttoData.forEach(w => {
      const d = getDistrictFromSheetLocal(w.sheet);
      list.add(d);
    });
    return sortedList(list);
  }, [wellsData, wttoData]);

  const blocks = useMemo(() => {
    const list = new Set();
    wellsData.forEach(w => {
      const d = getDistrictFromSheetLocal(w.sheet);
      if (d === selectedDist && w.block) {
        list.add(normalizeBlockName(w.block));
      }
    });
    wttoData.forEach(w => {
      const d = getDistrictFromSheetLocal(w.sheet);
      if (d === selectedDist && w.block) {
        list.add(normalizeBlockName(w.block));
      }
    });
    return sortedList(list);
  }, [wellsData, wttoData, selectedDist]);

  const stations = useMemo(() => {
    const list = [];
    const addedNumbers = new Set();
    
    wellsData.forEach(w => {
      const d = getDistrictFromSheetLocal(w.sheet);
      if (d === selectedDist && (selectedBlock === 'All Blocks' || normalizeBlockName(w.block) === normalizeBlockName(selectedBlock))) {
        if (!addedNumbers.has(w.well_number)) {
          list.push(w);
          addedNumbers.add(w.well_number);
        }
      }
    });
    
    wttoData.forEach(w => {
      const d = getDistrictFromSheetLocal(w.sheet);
      if (d === selectedDist && (selectedBlock === 'All Blocks' || normalizeBlockName(w.block) === normalizeBlockName(selectedBlock))) {
        if (!addedNumbers.has(w.well_number)) {
          list.push(w);
          addedNumbers.add(w.well_number);
        }
      }
    });
    
    return list.sort((a, b) => a.well_number.localeCompare(b.well_number));
  }, [wellsData, wttoData, selectedDist, selectedBlock]);

  function sortedList(setObj) {
    return Array.from(setObj).sort((a, b) => a.localeCompare(b));
  }

  // If selection goes out of bounds, reset sub-filters (guard if preselectedWell matches)
  useEffect(() => {
    if (preselectedWell && getDistrictFromSheetLocal(preselectedWell.sheet) === selectedDist) {
      return;
    }
    setSelectedBlock('All Blocks');
    setSelectedStation('All Stations');
  }, [selectedDist]);

  useEffect(() => {
    if (preselectedWell && (
      normalizeBlockName(preselectedWell.block) === normalizeBlockName(selectedBlock) ||
      selectedStation === preselectedWell.well_number
    )) {
      return;
    }
    setSelectedStation('All Stations');
  }, [selectedBlock]);

  // 3. Compute target trends to plot
  const chartData = useMemo(() => {
    let rawTrends = [];
    let title = '';

    const normSelBlock = selectedBlock !== 'All Blocks' ? normalizeBlockName(selectedBlock) : 'All Blocks';

    if (selectedStation !== 'All Stations') {
      title = `Station: ${selectedStation}`;
      
      const wttoObj = wttoData.find(w => w.well_number === selectedStation);
      const activeObj = wellsData.find(w => w.well_number === selectedStation);
      const stationObj = wttoObj ? { 
        ...wttoObj, 
        ...activeObj, 
        history: { ...wttoObj.history, ...((activeObj && activeObj.history) || {}) } 
      } : activeObj;
      
      let baseTrends = [];
      if (stationObj && stationObj.history) {
        Object.keys(stationObj.history).forEach(seasonKey => {
          const val = stationObj.history[seasonKey];
          if (val !== null && val !== undefined && val !== '') {
            const valFloat = parseFloat(val);
            if (!isNaN(valFloat) && valFloat <= 150 && valFloat >= 0) {
              baseTrends.push({
                season: standardizeSeasonKey(seasonKey),
                value: valFloat
              });
            }
          }
        });
      }

      // Merge active visit from wellsData directly
      const mergedTrends = [...baseTrends];
      if (stationObj && stationObj.dtgwl_mbgl !== null && stationObj.dtgwl_mbgl !== undefined) {
        const activeVal = parseFloat(stationObj.dtgwl_mbgl);
        if (!isNaN(activeVal) && activeVal <= 150 && activeVal >= 0) {
          let activeSeasonKey = null;
          if (stationObj.season) {
            let seasonCode = 'Winter';
            const lowerSeason = stationObj.season.toLowerCase();
            if (lowerSeason.includes('pre')) seasonCode = 'PreMon';
            else if (lowerSeason.includes('mid')) seasonCode = 'MidMon';
            else if (lowerSeason.includes('post')) seasonCode = 'PostMon';
            else seasonCode = 'Winter';
            
            let yearVal = new Date().getFullYear();
            if (stationObj.date) {
              const inferred = inferSeasonFromDateLocal(stationObj.date);
              if (inferred) {
                yearVal = parseInt(inferred.split('_')[0]);
              }
            }
            activeSeasonKey = `${yearVal}_${seasonCode}`;
          } else if (stationObj.date) {
            activeSeasonKey = inferSeasonFromDateLocal(stationObj.date);
          }
          
          if (activeSeasonKey) {
            const normActiveKey = standardizeSeasonKey(activeSeasonKey);
            const existingIdx = mergedTrends.findIndex(t => standardizeSeasonKey(t.season) === normActiveKey);
            if (existingIdx !== -1) {
              mergedTrends[existingIdx] = {
                ...mergedTrends[existingIdx],
                value: activeVal,
                date: stationObj.date || ''
              };
            } else {
              mergedTrends.push({
                season: normActiveKey,
                value: activeVal,
                date: stationObj.date || ''
              });
            }
          }
        }
      }

      // Merge user recorded visits from visitsHistory
      const stationHistory = visitsHistory[selectedStation] || {};
      Object.keys(stationHistory).forEach(seasonKey => {
        const historyItem = stationHistory[seasonKey];
        if (historyItem && historyItem.value !== null && historyItem.value !== undefined) {
          const val = parseFloat(historyItem.value);
          if (!isNaN(val) && val <= 150 && val >= 0) {
            const normSeasonKey = standardizeSeasonKey(seasonKey);
            const existingIdx = mergedTrends.findIndex(t => standardizeSeasonKey(t.season) === normSeasonKey);
            if (existingIdx !== -1) {
              mergedTrends[existingIdx] = {
                ...mergedTrends[existingIdx],
                value: val,
                date: historyItem.date
              };
            } else {
              mergedTrends.push({
                season: normSeasonKey,
                value: val,
                date: historyItem.date
              });
            }
          }
        }
      });

      // Sort seasons chronologically using calendar year ordering: Winter -> PreMon -> MidMon -> PostMon
      rawTrends = mergedTrends.sort((a, b) => {
        const yrA = parseInt(a.season.split('_')[0]) || 0;
        const yrB = parseInt(b.season.split('_')[0]) || 0;
        if (yrA !== yrB) return yrA - yrB;
        return getSeasonOrder(a.season) - getSeasonOrder(b.season);
      });
    } else if (selectedBlock !== 'All Blocks') {
      title = `Block: ${normSelBlock}`;
      const blockTrends = getHistoricalBlockTrends(selectedBlock);
      if (false && blockTrends) {
        rawTrends = blockTrends.trends.map(t => ({
          ...t,
          season: standardizeSeasonKey(t.season)
        }));
      } else {
        // Build block average trend dynamically
        const mergedMap = {};
        wttoData.forEach(w => {
          if (getDistrictFromSheetLocal(w.sheet) === selectedDist && normalizeBlockName(w.block) === normSelBlock) {
            mergedMap[w.well_number] = { ...w };
          }
        });
        wellsData.forEach(w => {
          if (getDistrictFromSheetLocal(w.sheet) === selectedDist && normalizeBlockName(w.block) === normSelBlock) {
            if (mergedMap[w.well_number]) {
              mergedMap[w.well_number] = {
                ...mergedMap[w.well_number],
                dtgwl_mbgl: w.dtgwl_mbgl !== undefined && w.dtgwl_mbgl !== null ? w.dtgwl_mbgl : mergedMap[w.well_number].dtgwl_mbgl,
                date: w.date || mergedMap[w.well_number].date,
                season: w.season || mergedMap[w.well_number].season
              };
            } else {
              mergedMap[w.well_number] = { ...w };
            }
          }
        });
        const blockStations = Object.values(mergedMap);
        rawTrends = averageMultipleTrends(blockStations);
      }
    } else {
      title = `District: ${selectedDist}`;
      if (false && historicalTrends.districts[selectedDist]) {
        rawTrends = historicalTrends.districts[selectedDist].trends.map(t => ({
          ...t,
          season: standardizeSeasonKey(t.season)
        }));
      } else {
        // Build district average trend dynamically
        const mergedMap = {};
        wttoData.forEach(w => {
          if (getDistrictFromSheetLocal(w.sheet) === selectedDist) {
            mergedMap[w.well_number] = { ...w };
          }
        });
        wellsData.forEach(w => {
          if (getDistrictFromSheetLocal(w.sheet) === selectedDist) {
            if (mergedMap[w.well_number]) {
              mergedMap[w.well_number] = {
                ...mergedMap[w.well_number],
                dtgwl_mbgl: w.dtgwl_mbgl !== undefined && w.dtgwl_mbgl !== null ? w.dtgwl_mbgl : mergedMap[w.well_number].dtgwl_mbgl,
                date: w.date || mergedMap[w.well_number].date,
                season: w.season || mergedMap[w.well_number].season
              };
            } else {
              mergedMap[w.well_number] = { ...w };
            }
          }
        });
        const distStations = Object.values(mergedMap);
        rawTrends = averageMultipleTrends(distStations);
      }
    }

    // Filter out unmonitored future seasons (2026 MidMon, 2026 PostMon, or future years) from historical trends
    rawTrends = rawTrends.filter(t => {
      if (!t || !t.season) return false;
      const parts = t.season.split('_');
      const yr = parseInt(parts[0], 10);
      const sType = parts[1] || '';
      if (isNaN(yr)) return true;
      if (yr > 2026) return false;
      if (yr === 2026 && (sType === 'MidMon' || sType === 'PostMon')) return false;
      return true;
    });

    // Filter by time range selection ('5', '10', 'all', or '1997')
    if (timeRange !== 'all' && timeRange !== '1997' && rawTrends.length > 0) {
      const limitYears = parseInt(timeRange);
      const currentYear = new Date().getFullYear();
      const cutoffYear = currentYear - limitYears;
      rawTrends = rawTrends.filter(t => {
        const yr = parseInt(t.season.split('_')[0]);
        return yr >= cutoffYear;
      });
    }

    const isBlockLookup = (selectedBlock !== 'All Blocks');

    if (displayMode === 'fluctuation') {
      const fluctuations = computeFluctuation(rawTrends);
      const historicalValues = fluctuations.map(f => f.value);
      const historicalPre = fluctuations.map(f => f.pre);
      const historicalPost = fluctuations.map(f => f.post);
      const historicalLabels = fluctuations.map(f => f.year);

      // Calculate historical rainfall
      const historicalRainfall = fluctuations.map(f => {
        const year = f.year;
        let totalRain = 0;
        const seasonsList = ['Winter', 'PreMon', 'MidMon', 'PostMon'];
        seasonsList.forEach(s => {
          const calendarYear = parseInt(year);
          const seasonKey = `${calendarYear}_${s}`;
          let rVal = 0;
          const blockRain = isBlockLookup ? getRainfallBlockData(selectedBlock) : null;
          if (isBlockLookup && blockRain) {
            rVal = blockRain[seasonKey] || 0;
          } else {
            rVal = (rainfallData.districts[selectedDist] && rainfallData.districts[selectedDist][seasonKey]) || 0;
          }
          totalRain += rVal;
        });
        return totalRain > 0 ? totalRain : null;
      });

      // Extend for Forecast if needed
      let extendedLabels = [...historicalLabels];
      let extendedValues = [...historicalValues];
      let extendedPre = [...historicalPre];
      let extendedPost = [...historicalPost];
      let extendedRainfall = [...historicalRainfall];

      if (forecastMode !== 'none') {
        const targetYear = parseInt(forecastMode);
        let lastYear = new Date().getFullYear();
        if (fluctuations.length > 0) {
          lastYear = parseInt(fluctuations[fluctuations.length - 1].year);
        }
        for (let y = lastYear + 1; y <= targetYear; y++) {
          extendedLabels.push(y.toString());
          extendedValues.push(null);
          extendedPre.push(null);
          extendedPost.push(null);
          extendedRainfall.push(null);
        }
      }

      const trendLine = calculateExtendedRegressionLine(historicalValues, extendedLabels.length);

      return {
        title: `${title} - Annual Fluctuation`,
        labels: extendedLabels,
        values: extendedValues,
        historicalValues: historicalValues,
        preValues: extendedPre,
        postValues: extendedPost,
        trendLine: trendLine,
        rawTrends: rawTrends,
        rainfall: extendedRainfall
      };
    } else if (displayMode === 'annual') {
      const annualAveraged = computeAnnualAverage(rawTrends);
      const historicalValues = annualAveraged.map(a => a.value);
      const historicalLabels = annualAveraged.map(a => a.year);

      // Calculate historical rainfall
      const historicalRainfall = annualAveraged.map(a => {
        const year = a.year;
        let totalRain = 0;
        const seasonsList = ['Winter', 'PreMon', 'MidMon', 'PostMon'];
        seasonsList.forEach(s => {
          const calendarYear = parseInt(year);
          const seasonKey = `${calendarYear}_${s}`;
          let rVal = 0;
          const blockRain = isBlockLookup ? getRainfallBlockData(selectedBlock) : null;
          if (isBlockLookup && blockRain) {
            rVal = blockRain[seasonKey] || 0;
          } else {
            rVal = (rainfallData.districts[selectedDist] && rainfallData.districts[selectedDist][seasonKey]) || 0;
          }
          totalRain += rVal;
        });
        return totalRain > 0 ? totalRain : null;
      });

      // Extend for Forecast if needed
      let extendedLabels = [...historicalLabels];
      let extendedValues = [...historicalValues];
      let extendedRainfall = [...historicalRainfall];

      if (forecastMode !== 'none') {
        const targetYear = parseInt(forecastMode);
        let lastYear = new Date().getFullYear();
        if (annualAveraged.length > 0) {
          lastYear = parseInt(annualAveraged[annualAveraged.length - 1].year);
        }
        for (let y = lastYear + 1; y <= targetYear; y++) {
          extendedLabels.push(y.toString());
          extendedValues.push(null);
          extendedRainfall.push(null);
        }
      }

      const trendLine = calculateExtendedRegressionLine(historicalValues, extendedLabels.length);

      return {
        title: `${title} - Annual Average BGL`,
        labels: extendedLabels,
        values: extendedValues,
        historicalValues: historicalValues,
        trendLine: trendLine,
        rawTrends: rawTrends,
        rainfall: extendedRainfall
      };
    } else if (displayMode === 'pre_vs_post') {
      const yearData = {};
      rawTrends.forEach(t => {
        const parts = t.season.split('_');
        if (parts.length < 2) return;
        const year = parts[0];
        const season = parts[1];
        if (!yearData[year]) {
          yearData[year] = {};
        }
        yearData[year][season] = t.value;
      });

      const sortedYears = Object.keys(yearData).sort((a, b) => parseInt(a) - parseInt(b));
      
      const preValues = [];
      const postValues = [];
      const labels = [];

      sortedYears.forEach(y => {
        const pre = yearData[y]['PreMon'];
        const post = yearData[y]['PostMon'];
        if (pre !== undefined || post !== undefined) {
          labels.push(y);
          preValues.push(pre !== undefined ? pre : null);
          postValues.push(post !== undefined ? post : null);
        }
      });

      return {
        title: `${title} - Pre-Monsoon vs Post-Monsoon Comparison`,
        labels: labels,
        preValues: preValues,
        postValues: postValues,
        values: preValues, // fallback / main values
        historicalValues: preValues.concat(postValues).filter(v => v !== null),
        rawTrends: rawTrends
      };
    } else if (displayMode === 'elevation' || displayMode === 'elevation_3d') {
      const targetStations = [];
      const addedIds = new Set();
      
      console.log("[Elevation Debug] starting filter. wellsData length:", wellsData.length);
      console.log("[Elevation Debug] selectedDist:", selectedDist, "selectedBlock:", selectedBlock, "normSelBlock:", normSelBlock);
      
      wellsData.forEach(w => {
        const dist = getDistrictFromSheetLocal(w.sheet);
        const blockName = normalizeBlockName(w.block);
        const matchDist = dist === selectedDist;
        const matchBlock = selectedBlock === 'All Blocks' || blockName === normSelBlock;
        
        if (matchDist && matchBlock) {
          if (w.lat == null || w.lon == null || w.msl == null) {
            // Log a sample of mismatch coordinates/msl
            if (targetStations.length < 3) {
              console.log("[Elevation Debug] match name but missing coords/msl:", w.well_number, "lat:", w.lat, "lon:", w.lon, "msl:", w.msl);
            }
          } else {
            if (!addedIds.has(w.well_number)) {
              targetStations.push(w);
              addedIds.add(w.well_number);
            }
          }
        }
      });
      
      console.log("[Elevation Debug] targetStations length:", targetStations.length);
      const sortedStations = targetStations.sort((a, b) => a.lon - b.lon);
      
      const validStations = [];
      sortedStations.forEach(w => {
        const wl = getLatestWaterLevel(w, visitsHistory);
        if (wl !== null) {
          validStations.push({
            ...w,
            resolved_dtgwl: wl
          });
        } else {
          if (validStations.length < 3) {
            console.log("[Elevation Debug] resolved water level is null for well:", w.well_number, "dtgwl_mbgl:", w.dtgwl_mbgl);
          }
        }
      });
      
      console.log("[Elevation Debug] validStations length:", validStations.length);
      
      if (validStations.length === 0) {
        const mslCount = targetStations.filter(w => w.msl != null).length;
        const totalKdp = targetStations.length;
        return {
          title: `Geological Cross-Section Profile (No Data Available: Kdp=${totalKdp}, MSL=${mslCount})`,
          labels: [],
          mslValues: [],
          rlValues: [],
          lonValues: [],
          latValues: [],
          wellIds: [],
          fullNames: [],
          wellTypes: [],
          depths: [],
          values: [],
          historicalValues: [],
          rawTrends: []
        };
      }

      const labels = validStations.map(w => w.location.split(':')[0].trim() || w.well_number);
      const mslValues = validStations.map(w => parseFloat(w.msl));
      const rlValues = validStations.map(w => {
        const m = parseFloat(w.msl);
        const d = w.resolved_dtgwl;
        return parseFloat((m - d).toFixed(2));
      });
      const ids = validStations.map(w => w.well_number);
      const fullNames = validStations.map(w => w.location || w.well_number);
      const lonValues = validStations.map(w => parseFloat(w.lon));
      const latValues = validStations.map(w => parseFloat(w.lat));
      const wellTypes = validStations.map(w => w.well_type || '');
      const depths = validStations.map(w => w.depth || '');

      return {
        title: `${displayMode === 'elevation_3d' ? '3D' : 'Geological'} Cross-Section Profile - ${selectedBlock === 'All Blocks' ? selectedDist : normSelBlock} (${validStations.length} Stations, West ➔ East)`,
        labels: labels,
        mslValues: mslValues,
        rlValues: rlValues,
        lonValues: lonValues,
        latValues: latValues,
        wellIds: ids,
        fullNames: fullNames,
        wellTypes: wellTypes,
        depths: depths,
        values: rlValues,
        historicalValues: rlValues.concat(mslValues),
        rawTrends: []
      };
    } else {
      // 1. Pad rawTrends to ensure ALL seasons for every year are shown on the graph
      let paddedTrends = [];
      if (rawTrends.length > 0) {
        let startYear, endYear;
        const seasonsList = ['Winter', 'PreMon', 'MidMon', 'PostMon'];
        
        // Find min and max years in the rawTrends
        let minDataYear = new Date().getFullYear();
        let maxDataYear = new Date().getFullYear();
        let years = rawTrends.map(t => parseInt(t.season.split('_')[0])).filter(y => !isNaN(y));
        if (years.length > 0) {
          minDataYear = Math.min(...years);
          maxDataYear = Math.max(...years);
        }
        
        if (timeRange === '1997') {
          startYear = 1997;
          endYear = maxDataYear;
        } else if (timeRange === 'all') {
          startYear = minDataYear;
          endYear = maxDataYear;
        } else {
          const limitYears = parseInt(timeRange);
          startYear = new Date().getFullYear() - limitYears;
          endYear = maxDataYear;
          if (startYear > endYear) {
            endYear = startYear;
          }
        }
        
        for (let y = startYear; y <= endYear; y++) {
          (seasonsList || []).forEach(s => {
            if (y > 2026 || (y === 2026 && (s === 'MidMon' || s === 'PostMon'))) {
              return;
            }
            const seasonKey = `${y}_${s}`;
            const actualPoint = rawTrends.find(t => t.season === seasonKey);
            if (actualPoint) {
              paddedTrends.push({
                season: seasonKey,
                value: actualPoint.value,
                date: actualPoint.date || ''
              });
            } else {
              paddedTrends.push({
                season: seasonKey,
                value: null,
                date: ''
              });
            }
          });
        }
        
        // Trim tail nulls to avoid drawing empty values past the last actual data point
        // (Unless forecast mode is active, which handles its own extension)
        if (forecastMode === 'none') {
          let lastActualIdx = -1;
          for (let i = paddedTrends.length - 1; i >= 0; i--) {
            if (paddedTrends[i].value !== null) {
              lastActualIdx = i;
              break;
            }
          }
          if (lastActualIdx !== -1) {
            paddedTrends = paddedTrends.slice(0, lastActualIdx + 1);
          }
        }
      } else {
        paddedTrends = rawTrends;
      }

      const historicalValues = paddedTrends.map(t => t.value);
      const historicalLabels = paddedTrends.map(t => t.season.replace('_', ' '));

      // Seasonal rainfall
      const historicalRainfall = paddedTrends.map(t => {
        let rVal = 0;
        const blockRain = isBlockLookup ? getRainfallBlockData(selectedBlock) : null;
        if (isBlockLookup && blockRain) {
          rVal = blockRain[t.season] || 0;
        } else {
          rVal = (rainfallData.districts[selectedDist] && rainfallData.districts[selectedDist][t.season]) || 0;
        }
        return rVal > 0 ? rVal : null;
      });

      // Extend for Forecast if needed
      let extendedLabels = [...historicalLabels];
      let extendedValues = [...historicalValues];
      let extendedRainfall = [...historicalRainfall];

      if (forecastMode !== 'none') {
        const targetYear = parseInt(forecastMode);
        let lastYear = new Date().getFullYear();
        if (paddedTrends.length > 0) {
          lastYear = parseInt(paddedTrends[paddedTrends.length - 1].season.split('_')[0]);
        }
        const seasonsList = ['Winter', 'PreMon', 'MidMon', 'PostMon'];
        for (let y = lastYear + 1; y <= targetYear; y++) {
          seasonsList.forEach(s => {
            extendedLabels.push(`${y} ${s}`);
            extendedValues.push(null);
            extendedRainfall.push(null);
          });
        }
      }

      const trendLine = calculateExtendedRegressionLine(historicalValues, extendedLabels.length);

      return {
        title: `${title} - Depth to Water Table`,
        labels: extendedLabels,
        values: extendedValues,
        historicalValues: historicalValues,
        trendLine: trendLine,
        rawTrends: rawTrends,
        rainfall: extendedRainfall
      };
    }
  }, [selectedDist, selectedBlock, selectedStation, wellsData, wttoData, timeRange, stations, displayMode, forecastMode, visitsHistory]);

  const stats = useMemo(() => {
    return calculateDescriptiveStats(chartData.historicalValues);
  }, [chartData.historicalValues]);

  const mkResult = useMemo(() => {
    return calculateMannKendallAndSensSlope(chartData.historicalValues);
  }, [chartData]);

  const fluctuationTableData = useMemo(() => {
    if (displayMode !== 'fluctuation' && displayMode !== 'pre_vs_post') return [];
    
    const yearData = {};
    chartData.rawTrends.forEach(t => {
      const parts = t.season.split('_');
      if (parts.length < 2) return;
      const year = parts[0];
      const season = parts[1];
      if (!yearData[year]) {
        yearData[year] = {};
      }
      yearData[year][season] = t.value;
    });

    const list = [];
    const sortedYears = Object.keys(yearData).sort((a, b) => parseInt(a) - parseInt(b));
    
    sortedYears.forEach(y => {
      const pre = yearData[y]['PreMon'];
      const post = yearData[y]['PostMon'];
      if (pre !== undefined || post !== undefined) {
        const diff = (pre !== undefined && post !== undefined) ? Number((pre - post).toFixed(2)) : null;
        list.push({
          year: y,
          pre: pre,
          post: post,
          fluctuation: diff
        });
      }
    });
    return list;
  }, [chartData, displayMode]);

  const availableYears = useMemo(() => {
    const years = new Set();
    chartData.rawTrends.forEach(t => {
      const parts = t.season.split('_');
      if (parts.length > 0) {
        years.add(parts[0]);
      }
    });
    return Array.from(years).sort((a, b) => parseInt(a) - parseInt(b));
  }, [chartData.rawTrends]);

  useEffect(() => {
    if (availableYears.length > 1) {
      if (!availableYears.includes(compareYearA)) {
        setCompareYearA(availableYears[0]);
      }
      if (!availableYears.includes(compareYearB)) {
        setCompareYearB(availableYears[availableYears.length - 1]);
      }
    }
  }, [availableYears]);

  const comparisonResult = useMemo(() => {
    if (!compareYearA || !compareYearB) return null;
    
    const yearAData = fluctuationTableData.find(d => d.year === compareYearA);
    const yearBData = fluctuationTableData.find(d => d.year === compareYearB);
    
    const preA = yearAData ? yearAData.pre : null;
    const postA = yearAData ? yearAData.post : null;
    const preB = yearBData ? yearBData.pre : null;
    const postB = yearBData ? yearBData.post : null;
    
    let preDiff = null;
    let preDirection = '';
    let preColor = '#64748b';
    if (preA !== null && preA !== undefined && preB !== null && preB !== undefined) {
      preDiff = Number((preB - preA).toFixed(2));
      if (preDiff > 0) {
        preDirection = `Depletion of +${preDiff}m`;
        preColor = '#ef4444';
      } else if (preDiff < 0) {
        preDirection = `Recovery of ${preDiff}m`;
        preColor = '#10b981';
      } else {
        preDirection = 'No Change (0.00m)';
        preColor = '#f59e0b';
      }
    }
    
    let postDiff = null;
    let postDirection = '';
    let postColor = '#64748b';
    if (postA !== null && postA !== undefined && postB !== null && postB !== undefined) {
      postDiff = Number((postB - postA).toFixed(2));
      if (postDiff > 0) {
        postDirection = `Depletion of +${postDiff}m`;
        postColor = '#ef4444';
      } else if (postDiff < 0) {
        postDirection = `Recovery of ${postDiff}m`;
        postColor = '#10b981';
      } else {
        postDirection = 'No Change (0.00m)';
        postColor = '#f59e0b';
      }
    }
    
    return {
      preA,
      preB,
      postA,
      postB,
      preDiff,
      preDirection,
      preColor,
      postDiff,
      postDirection,
      postColor
    };
  }, [compareYearA, compareYearB, fluctuationTableData]);


  // Utility to average trends for block/district
  function averageMultipleTrends(stationsList) {
    const seasonsMap = {};
    stationsList.forEach(s => {
      let baseTrends = [];
      if (s && s.history) {
        Object.keys(s.history).forEach(seasonKey => {
          const val = s.history[seasonKey];
          if (val !== null && val !== undefined && val !== '') {
            const valFloat = parseFloat(val);
            if (!isNaN(valFloat) && valFloat <= 150 && valFloat >= 0) {
              baseTrends.push({
                season: standardizeSeasonKey(seasonKey),
                value: valFloat
              });
            }
          }
        });
      }
      
      const mergedTrends = [...baseTrends];
      
      // Merge active visit from wellsData
      if (s && s.dtgwl_mbgl !== null && s.dtgwl_mbgl !== undefined) {
        const activeVal = parseFloat(s.dtgwl_mbgl);
        if (!isNaN(activeVal) && activeVal <= 150 && activeVal >= 0) {
          let activeSeasonKey = null;
          if (s.season) {
            let seasonCode = 'Winter';
            const lowerSeason = s.season.toLowerCase();
            if (lowerSeason.includes('pre')) seasonCode = 'PreMon';
            else if (lowerSeason.includes('mid')) seasonCode = 'MidMon';
            else if (lowerSeason.includes('post')) seasonCode = 'PostMon';
            else seasonCode = 'Winter';
            
            let yearVal = new Date().getFullYear();
            if (s.date) {
              const inferred = inferSeasonFromDateLocal(s.date);
              if (inferred) {
                yearVal = parseInt(inferred.split('_')[0]);
              }
            }
            activeSeasonKey = `${yearVal}_${seasonCode}`;
          } else if (s.date) {
            activeSeasonKey = inferSeasonFromDateLocal(s.date);
          }
          
          if (activeSeasonKey) {
            const existingIdx = mergedTrends.findIndex(t => t.season === activeSeasonKey);
            if (existingIdx !== -1) {
              mergedTrends[existingIdx] = {
                ...mergedTrends[existingIdx],
                value: activeVal,
                date: s.date || ''
              };
            } else {
              mergedTrends.push({
                season: activeSeasonKey,
                value: activeVal,
                date: s.date || ''
              });
            }
          }
        }
      }

      // Merge user recorded visits from visitsHistory
      const stationHistory = visitsHistory[s.well_number] || {};
      Object.keys(stationHistory).forEach(seasonKey => {
        const historyItem = stationHistory[seasonKey];
        if (historyItem && historyItem.value !== null && historyItem.value !== undefined) {
          const histVal = parseFloat(historyItem.value);
          if (!isNaN(histVal) && histVal <= 150 && histVal >= 0) {
            const existingIdx = mergedTrends.findIndex(t => t.season === seasonKey);
            if (existingIdx !== -1) {
              mergedTrends[existingIdx] = {
                ...mergedTrends[existingIdx],
                value: histVal,
                date: historyItem.date
              };
            } else {
              mergedTrends.push({
                season: seasonKey,
                value: histVal,
                date: historyItem.date
              });
            }
          }
        }
      });
      
      mergedTrends.forEach(t => {
        const normSeason = standardizeSeasonKey(t.season);
        if (!seasonsMap[normSeason]) {
          seasonsMap[normSeason] = [];
        }
        seasonsMap[normSeason].push(t.value);
      });
    });

    const averaged = [];
    const sortedSeasons = Object.keys(seasonsMap).sort((a, b) => {
      const yrA = parseInt(a.split('_')[0]) || 0;
      const yrB = parseInt(b.split('_')[0]) || 0;
      if (yrA !== yrB) return yrA - yrB;
      return getSeasonOrder(a) - getSeasonOrder(b);
    });

    sortedSeasons.forEach(s => {
      const vals = seasonsMap[s];
      if (vals.length > 0) {
        averaged.push({
          season: s,
          value: Number((vals.reduce((sum, v) => sum + v, 0) / vals.length).toFixed(2))
        });
      }
    });
    return averaged;
  }

  // Export active trend data to CSV
  const handleExportCSV = async () => {
    try {
      const header = 'Season,Water Level (m BGL)\n';
      const rows = chartData.labels.map((label, idx) => `${label},${chartData.values[idx] || ''}`).join('\n');
      const csvContent = header + rows;
      
      const cleanStationName = selectedStation.replace(/\s+/g, '_');
      const filename = `Trend_${selectedDist}_${selectedBlock.replace(/\s+/g, '_')}_${cleanStationName}_${new Date().toISOString().split('T')[0]}.csv`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });
      
      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (isSharingAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: `Export Trend Data for ${selectedStation}`,
          UTI: 'public.comma-separated-values-text'
        });
      } else {
        Alert.alert("Export Success", `Trend data saved at:\n${fileUri}`);
      }
    } catch (err) {
      Alert.alert("Export Failed", err.message);
    }
  };

  // Export Chart Canvas as Image
  const handleExportImage = () => {
    if (webviewRef.current) {
      webviewRef.current.injectJavaScript(`
        if (window.chart) {
          const base64 = window.chart.toBase64Image();
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'EXPORT_IMAGE', payload: base64 }));
          } else if (window.parent) {
            window.parent.postMessage(JSON.stringify({ type: 'EXPORT_IMAGE', payload: base64 }), '*');
          }
        }
        true;
      `);
    }
  };

  const handleWebViewMessage = async (event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'EXPORT_IMAGE') {
        const base64Data = msg.payload.replace(/^data:image\/png;base64,/, '');
        const cleanStationName = selectedStation.replace(/\s+/g, '_');
        const filename = `Chart_${selectedDist}_${selectedBlock.replace(/\s+/g, '_')}_${cleanStationName}_${new Date().toISOString().split('T')[0]}.png`;
        const fileUri = `${FileSystem.documentDirectory}${filename}`;
        
        await FileSystem.writeAsStringAsync(fileUri, base64Data, { encoding: 'base64' });
        
        const isSharingAvailable = await Sharing.isAvailableAsync();
        if (isSharingAvailable) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'image/png',
            dialogTitle: `Share Chart for ${selectedStation}`,
            UTI: 'public.png'
          });
        }
      } else if (msg.type === 'FALLBACK_2D') {
        setDisplayMode('elevation');
      } else if (msg.type === 'CONSOLE_LOG') {
        console.warn("[WebView Trends]:", msg.payload);
      }
    } catch (err) {
      console.warn("Error handling WebView message:", err);
    }
  };

  // 4. Build HTML5 WebView containing injected local Chart.js code
  const chartHtml = useMemo(() => {
    const dataLabels = JSON.stringify(chartData.labels);
    const dataValues = JSON.stringify(chartData.values);
    const preValues = JSON.stringify((displayMode === 'fluctuation' || displayMode === 'pre_vs_post') ? (chartData.preValues || []) : []);
    const postValues = JSON.stringify((displayMode === 'fluctuation' || displayMode === 'pre_vs_post') ? (chartData.postValues || []) : []);
    const trendValues = JSON.stringify(chartData.trendLine || []);
    const rainfallValues = JSON.stringify(showRainfall ? (chartData.rainfall || []) : []);
    const mslValues = JSON.stringify(chartData.mslValues || []);
    const rlValues = JSON.stringify(chartData.rlValues || []);
    const lonValues = JSON.stringify(chartData.lonValues || []);
    const latValues = JSON.stringify(chartData.latValues || []);
    const fullNames = JSON.stringify(chartData.fullNames || []);
    const wellTypes = JSON.stringify(chartData.wellTypes || []);
    const depths = JSON.stringify(chartData.depths || []);
    const is3D = displayMode === 'elevation_3d';
    const gridColor = isDark ? '#1e293b' : '#cbd5e1';
    const textColor = isDark ? '#94a3b8' : '#475569';

    // Histogram Calculation
    let histogramDataJson = '[]';
    let maxFrequency = 1;
    const isHistogram = (chartType === 'histogram');

    const dataLength = (chartData.labels || []).length;
    const dynamicWidth = (!isHistogram && dataLength > 10) ? `${dataLength * 55}px` : '95vw';

    if (isHistogram && chartData.historicalValues.length > 0) {
      const vals = chartData.historicalValues.filter(v => v !== null && v !== undefined && !isNaN(v));
      if (vals.length > 0) {
        const minVal = Math.min(...vals);
        const maxVal = Math.max(...vals);
        const range = maxVal - minVal;
        
        // Determine number of bins (Sturges formula or square root choice)
        const numBins = Math.max(5, Math.min(10, Math.ceil(Math.sqrt(vals.length))));
        const binWidth = range === 0 ? 0.5 : range / numBins;
        
        const bins = Array(numBins).fill(0).map((_, i) => {
          const start = minVal + i * binWidth;
          const end = start + binWidth;
          const center = Number((start + binWidth / 2).toFixed(2));
          return { start, end, center, count: 0 };
        });
        
        vals.forEach(v => {
          let placed = false;
          for (let i = 0; i < numBins; i++) {
            if (v >= bins[i].start && v < bins[i].end) {
              bins[i].count++;
              placed = true;
              break;
            }
          }
          if (!placed && numBins > 0) {
            bins[numBins - 1].count++;
          }
        });
        
        maxFrequency = Math.max(...bins.map(b => b.count), 1);
        
        // Format for Chart.js: list of {x: center, y: count}
        const points = bins.map(b => ({
          x: b.center,
          y: b.count
        }));
        
        histogramDataJson = JSON.stringify(points);
      }
    }

    // Horizontal statistics line values (for standard line/bar chart)
    const meanValues = !isHistogram && stats.mean !== 'N/A' && (statsOverlayMode === 'mean' || statsOverlayMode === 'all')
      ? JSON.stringify(Array(chartData.labels.length).fill(stats.mean))
      : '[]';
    const medianValues = !isHistogram && stats.median !== 'N/A' && (statsOverlayMode === 'median' || statsOverlayMode === 'all')
      ? JSON.stringify(Array(chartData.labels.length).fill(stats.median))
      : '[]';
    const sdUpperValues = !isHistogram && stats.mean !== 'N/A' && stats.stdDev !== 'N/A' && statsOverlayMode === 'all'
      ? JSON.stringify(Array(chartData.labels.length).fill(Number((stats.mean + stats.stdDev).toFixed(2))))
      : '[]';
    const sdLowerValues = !isHistogram && stats.mean !== 'N/A' && stats.stdDev !== 'N/A' && statsOverlayMode === 'all'
      ? JSON.stringify(Array(chartData.labels.length).fill(Number((stats.mean - stats.stdDev).toFixed(2))))
      : '[]';

    // Vertical statistics line points (for histogram mode)
    const meanLinePoints = isHistogram && stats.mean !== 'N/A' && (statsOverlayMode === 'mean' || statsOverlayMode === 'all')
      ? JSON.stringify([{ x: stats.mean, y: 0 }, { x: stats.mean, y: maxFrequency }])
      : '[]';
    const medianLinePoints = isHistogram && stats.median !== 'N/A' && (statsOverlayMode === 'median' || statsOverlayMode === 'all')
      ? JSON.stringify([{ x: stats.median, y: 0 }, { x: stats.median, y: maxFrequency }])
      : '[]';
    const sdUpperLinePoints = isHistogram && stats.mean !== 'N/A' && stats.stdDev !== 'N/A' && statsOverlayMode === 'all'
      ? JSON.stringify([{ x: Number((stats.mean + stats.stdDev).toFixed(2)), y: 0 }, { x: Number((stats.mean + stats.stdDev).toFixed(2)), y: maxFrequency }])
      : '[]';
    const sdLowerLinePoints = isHistogram && stats.mean !== 'N/A' && stats.stdDev !== 'N/A' && statsOverlayMode === 'all'
      ? JSON.stringify([{ x: Number((stats.mean - stats.stdDev).toFixed(2)), y: 0 }, { x: Number((stats.mean - stats.stdDev).toFixed(2)), y: maxFrequency }])
      : '[]';

    const meanValuesStr = stats.mean !== 'N/A' ? stats.mean.toString() : '';
    const medianValuesStr = stats.median !== 'N/A' ? stats.median.toString() : '';
    const sdUpperStr = (stats.mean !== 'N/A' && stats.stdDev !== 'N/A') ? (stats.mean + stats.stdDev).toFixed(2) : '';
    const sdLowerStr = (stats.mean !== 'N/A' && stats.stdDev !== 'N/A') ? (stats.mean - stats.stdDev).toFixed(2) : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          body, html {
            margin: 0;
            padding: 0;
            height: 100%;
            width: 100%;
            background-color: ${isDark ? '#0f172a' : '#f1f5f9'};
            overflow: hidden;
            user-select: none;
            -webkit-user-select: none;
          }
          .scroll-wrapper {
            width: 100%;
            height: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
          }
          .chart-container {
            position: relative;
            height: 95vh;
            width: ${dynamicWidth};
            padding-right: 20px;
            box-sizing: border-box;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <script>
          function sendPostMessage(msgObj) {
            var msgStr = typeof msgObj === 'string' ? msgObj : JSON.stringify(msgObj);
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              window.ReactNativeWebView.postMessage(msgStr);
            } else if (window.parent) {
              window.parent.postMessage(msgStr, '*');
            }
          }
          window.onerror = function(message, source, lineno, colno, error) {
            sendPostMessage({
              type: 'CONSOLE_LOG',
              payload: 'ERROR: ' + message + ' at ' + source + ':' + lineno
            });
          };
          function fallbackTo2D() {
            sendPostMessage({type: 'FALLBACK_2D'});
          }
        </script>

        <div id="chart2dContainer" class="scroll-wrapper" style="display: ${is3D ? 'none' : 'block'};">
          <div class="chart-container">
            <canvas id="trendsChart"></canvas>
          </div>
        </div>

        <div id="chart3dContainer" style="display: ${is3D ? 'block' : 'none'}; width: 100vw; height: 95vh; position: relative;">
          <div id="loader3d" style="position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%); color: ${isDark ? '#e2e8f0' : '#0f172a'}; font-family: sans-serif; font-size: 13px; font-weight: bold; text-align: center; width: 85%;">
            <div style="border: 4px solid rgba(0,0,0,0.1); border-left-color: #38bdf8; width: 36px; height: 36px; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 12px;"></div>
            Loading 3D Geological Model...
          </div>
          <div id="canvas3dContainer" style="width: 100%; height: 100%;"></div>
          
          <!-- 3D Geological Legend -->
          <div id="legend3d" style="position: absolute; top: 8px; left: 8px; right: 8px; background: ${isDark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(255, 255, 255, 0.85)'}; color: ${isDark ? '#f8fafc' : '#0f172a'}; border: 1px solid ${isDark ? '#334155' : '#cbd5e1'}; padding: 6px 10px; border-radius: 6px; font-family: sans-serif; font-size: 8px; pointer-events: none; z-index: 9999; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; flex-direction: row; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px; transform: translate3d(0,0,0); -webkit-transform: translate3d(0,0,0);">
            <div style="font-weight: bold; text-transform: uppercase; font-size: 8px; letter-spacing: 0.5px; color: ${isDark ? '#94a3b8' : '#64748b'}; margin-right: 4px;">Legend:</div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 10px; height: 6px; background: ${isDark ? '#92400e' : '#b45309'}; border-radius: 1px; display: inline-block;"></span>
              <span>Soil</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 10px; height: 6px; background: rgba(56, 189, 248, 0.75); border-radius: 1px; display: inline-block;"></span>
              <span>Aquifer</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 10px; height: 1.5px; background: #ef4444; display: inline-block; vertical-align: middle;"></span>
              <span>GL (MSL)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 10px; height: 1.5px; background: #0ea5e9; display: inline-block; vertical-align: middle;"></span>
              <span>Water Table (RL)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 12px; height: 6px; background: #c0c0c0; border: 0.5px solid #7c7c7c; border-radius: 1px; display: inline-block;"></span>
              <span>Dug Well</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 6px; height: 6px; background: #475569; border-radius: 1px; display: inline-block;"></span>
              <span>Tube/Bore Well</span>
            </div>
          </div>

          <div id="tooltip3d" style="position: absolute; display: none; background: ${isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)'}; color: ${isDark ? '#f8fafc' : '#0f172a'}; border: 1px solid ${isDark ? '#334155' : '#cbd5e1'}; padding: 12px; border-radius: 8px; font-family: sans-serif; font-size: 12px; pointer-events: none; box-shadow: 0 4px 10px rgba(0,0,0,0.25); z-index: 1000; min-width: 180px; transition: opacity 0.15s ease-in-out;"></div>
        </div>

        <script>
          ${CHART_JS_SRC}
        </script>
        <script>
          if (!${is3D}) {
            const ctx = document.getElementById('trendsChart').getContext('2d');
            let rainfallData = [];
            
            // Visual vertical depth gradient (matches mapping classification colors)
            const lineGradient = ctx.createLinearGradient(0, 0, 0, 320);
            lineGradient.addColorStop(0, '#2563eb');   // Shallow (<2m) is blue
            lineGradient.addColorStop(0.3, '#059669'); // Moderate (2-4m) is green
            lineGradient.addColorStop(0.6, '#eab308'); // Medium (4-6m) is yellow
            lineGradient.addColorStop(0.8, '#ea580c'); // Deep (6-8m) is orange
            lineGradient.addColorStop(1, '#dc2626');   // Depleted (>8m) is red
  
            const fillGradient = ctx.createLinearGradient(0, 0, 0, 320);
            fillGradient.addColorStop(0, 'rgba(37, 99, 235, 0.18)');
            fillGradient.addColorStop(0.3, 'rgba(5, 150, 105, 0.14)');
            fillGradient.addColorStop(0.6, 'rgba(234, 179, 8, 0.1)');
            fillGradient.addColorStop(0.8, 'rgba(234, 88, 12, 0.08)');
            fillGradient.addColorStop(1, 'rgba(220, 38, 38, 0.05)');
  
            // Determine main dataset
            const mainDataset = ${isHistogram} ? {
              label: 'Frequency (Count)',
              data: ${histogramDataJson},
              type: 'bar',
              backgroundColor: function(context) {
                const val = context.raw || context.dataset.data[context.dataIndex];
                if (!val) return '${isDark ? 'rgba(56, 189, 248, 0.55)' : 'rgba(2, 132, 199, 0.55)'}';
                const x = typeof val === 'object' ? val.x : val;
                const isFluctuation = ${displayMode === 'fluctuation'};
                if (isFluctuation) {
                  if (x < 0) return '${isDark ? 'rgba(239, 68, 68, 0.65)' : 'rgba(220, 38, 38, 0.55)'}';
                  if (x < 0.5) return '${isDark ? 'rgba(245, 158, 11, 0.65)' : 'rgba(217, 119, 6, 0.55)'}';
                  if (x < 2.0) return '${isDark ? 'rgba(16, 185, 129, 0.65)' : 'rgba(5, 150, 105, 0.55)'}';
                  return '${isDark ? 'rgba(37, 99, 235, 0.65)' : 'rgba(29, 78, 216, 0.55)'}';
                } else {
                  if (x < 2.0) return '${isDark ? 'rgba(37, 99, 235, 0.65)' : 'rgba(29, 78, 216, 0.55)'}';
                  if (x < 4.0) return '${isDark ? 'rgba(16, 185, 129, 0.65)' : 'rgba(5, 150, 105, 0.55)'}';
                  if (x < 6.0) return '${isDark ? 'rgba(245, 158, 11, 0.65)' : 'rgba(217, 119, 6, 0.55)'}';
                  if (x < 8.0) return '${isDark ? 'rgba(249, 115, 22, 0.65)' : 'rgba(234, 88, 12, 0.55)'}';
                  return '${isDark ? 'rgba(239, 68, 68, 0.65)' : 'rgba(220, 38, 38, 0.55)'}';
                }
              },
              borderColor: function(context) {
                const val = context.raw || context.dataset.data[context.dataIndex];
                if (!val) return '${isDark ? '#38bdf8' : '#0284c7'}';
                const x = typeof val === 'object' ? val.x : val;
                const isFluctuation = ${displayMode === 'fluctuation'};
                if (isFluctuation) {
                  if (x < 0) return '#dc2626';
                  if (x < 0.5) return '#d97706';
                  if (x < 2.0) return '#059669';
                  return '#2563eb';
                } else {
                  if (x < 2.0) return '#2563eb';
                  if (x < 4.0) return '#059669';
                  if (x < 6.0) return '#d97706';
                  if (x < 8.0) return '#ea580c';
                  return '#dc2626';
                }
              },
              borderWidth: 1.8,
              borderRadius: 5,
              barPercentage: 0.95,
              categoryPercentage: 0.95,
              yAxisID: 'y'
            } : {
              label: '${displayMode === 'depth' ? 'Depth (m BGL)' : displayMode === 'annual' ? 'Avg Depth (m BGL)' : 'Fluctuation (m)'}',
              data: ${dataValues},
              borderColor: lineGradient,
              backgroundColor: ${chartType === 'line' ? 'fillGradient' : 'lineGradient'},
              borderWidth: ${chartType === 'line' ? 3 : 1},
              fill: ${chartType === 'line' ? 'true' : 'false'},
              tension: 0.35,
              pointRadius: ${chartType === 'line' ? 4 : 0},
              pointHoverRadius: 7,
              pointBackgroundColor: lineGradient,
              pointBorderColor: '${isDark ? '#0f172a' : '#ffffff'}',
              pointBorderWidth: 1.5,
              yAxisID: 'y'
            };
  
            let datasets = [];
            if ('${displayMode}' === 'pre_vs_post') {
              datasets = [
                {
                  label: 'Pre-Monsoon Depth (m BGL)',
                  data: ${preValues},
                  type: '${chartType === 'line' ? 'line' : 'bar'}',
                  borderColor: '${isDark ? '#fbbf24' : '#d97706'}',
                  backgroundColor: '${chartType === 'line' ? 'rgba(251, 191, 36, 0.15)' : (isDark ? 'rgba(251, 191, 36, 0.6)' : 'rgba(217, 119, 6, 0.75)')}',
                  borderWidth: ${chartType === 'line' ? 3 : 1.5},
                  fill: ${chartType === 'line' ? 'true' : 'false'},
                  tension: 0.35,
                  pointRadius: ${chartType === 'line' ? 4 : 0},
                  pointHoverRadius: 6,
                  pointBackgroundColor: '${isDark ? '#fbbf24' : '#d97706'}',
                  pointBorderColor: '${isDark ? '#0f172a' : '#ffffff'}',
                  pointBorderWidth: 1.5,
                  yAxisID: 'y'
                },
                {
                  label: 'Post-Monsoon Depth (m BGL)',
                  data: ${postValues},
                  type: '${chartType === 'line' ? 'line' : 'bar'}',
                  borderColor: '${isDark ? '#10b981' : '#059669'}',
                  backgroundColor: '${chartType === 'line' ? 'rgba(16, 185, 129, 0.15)' : (isDark ? 'rgba(16, 185, 129, 0.6)' : 'rgba(5, 150, 105, 0.75)')}',
                  borderWidth: ${chartType === 'line' ? 3 : 1.5},
                  fill: ${chartType === 'line' ? 'true' : 'false'},
                  tension: 0.35,
                  pointRadius: ${chartType === 'line' ? 4 : 0},
                  pointHoverRadius: 6,
                  pointBackgroundColor: '${isDark ? '#10b981' : '#059669'}',
                  pointBorderColor: '${isDark ? '#0f172a' : '#ffffff'}',
                  pointBorderWidth: 1.5,
                  yAxisID: 'y'
                }
              ];
            } else if ('${displayMode}' === 'elevation') {
              datasets = [
                {
                  label: 'Ground Surface (MSL Elevation)',
                  data: ${mslValues},
                  type: 'line',
                  borderColor: '${isDark ? '#e11d48' : '#be123c'}',
                  backgroundColor: '${isDark ? 'rgba(180, 130, 90, 0.18)' : 'rgba(180, 130, 90, 0.12)'}',
                  borderWidth: 3,
                  fill: 1,
                  tension: 0.25,
                  pointRadius: 5,
                  pointHoverRadius: 7,
                  pointBackgroundColor: '${isDark ? '#e11d48' : '#be123c'}',
                  pointBorderColor: '${isDark ? '#0f172a' : '#ffffff'}',
                  pointBorderWidth: 1.5,
                  yAxisID: 'y'
                },
                {
                  label: 'Water Table Level (Reduced Level - RL)',
                  data: ${rlValues},
                  type: 'line',
                  borderColor: '${isDark ? '#38bdf8' : '#0284c7'}',
                  backgroundColor: '${isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.3)'}',
                  borderWidth: 3,
                  fill: 'origin',
                  tension: 0.25,
                  pointRadius: 5,
                  pointHoverRadius: 7,
                  pointBackgroundColor: '${isDark ? '#38bdf8' : '#0284c7'}',
                  pointBorderColor: '${isDark ? '#0f172a' : '#ffffff'}',
                  pointBorderWidth: 1.5,
                  yAxisID: 'y'
                }
              ];
            } else {
              datasets = [mainDataset];
              // Pre-Monsoon and Post-Monsoon overlays for Fluctuation Mode
              if (${displayMode === 'fluctuation'} && !${isHistogram}) {
                const preData = ${preValues};
                const postData = ${postValues};
                if (preData && preData.length > 0) {
                  datasets.push({
                    label: 'Pre-Monsoon Depth (m BGL)',
                    data: preData,
                    type: 'line',
                    borderColor: '${isDark ? '#fbbf24' : '#d97706'}',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.35,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    yAxisID: 'y'
                  });
                }
                if (postData && postData.length > 0) {
                  datasets.push({
                    label: 'Post-Monsoon Depth (m BGL)',
                    data: postData,
                    type: 'line',
                    borderColor: '${isDark ? '#10b981' : '#059669'}',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.35,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    yAxisID: 'y'
                  });
                }
              }
            }
  
            // Rainfall overlay (only for non-histogram, non-comparison charts)
            if (!${isHistogram} && '${displayMode}' !== 'pre_vs_post' && '${displayMode}' !== 'elevation') {
              rainfallData = ${rainfallValues};
              if (rainfallData && rainfallData.length > 0) {
                datasets.push({
                  label: 'Rainfall (mm)',
                  data: rainfallData,
                  type: 'bar',
                  yAxisID: 'y1',
                  backgroundColor: '${isDark ? 'rgba(56, 189, 248, 0.22)' : 'rgba(2, 132, 199, 0.22)'}',
                  borderColor: '${isDark ? '#38bdf8' : '#0284c7'}',
                  borderWidth: 1.5,
                  order: 2
                });
              }
            }
  
            // Trendline regression (only for non-histogram, non-comparison charts)
            if (!${isHistogram} && '${displayMode}' !== 'pre_vs_post' && '${displayMode}' !== 'elevation') {
              const trendData = ${trendValues};
              if (trendData && trendData.length > 0) {
                datasets.push({
                  label: 'Trend Line (Regression) (${displayMode === 'fluctuation' ? 'm' : 'm BGL'})',
                  data: trendData,
                  type: 'line',
                  borderColor: '${isDark ? '#f43f5e' : '#e11d48'}',
                  borderWidth: 2,
                  borderDash: [5, 5],
                  fill: false,
                  pointRadius: 0,
                  pointHoverRadius: 0,
                  tension: 0,
                  yAxisID: 'y'
                });
              }
            }
  
            // Horizontal Stats Lines (only for non-histogram, non-comparison charts)
            if (!${isHistogram} && '${displayMode}' !== 'pre_vs_post' && '${displayMode}' !== 'elevation') {
              const meanData = ${meanValues};
              if (meanData && meanData.length > 0) {
                datasets.push({
                  label: 'Mean (${meanValuesStr} ${displayMode === 'fluctuation' ? 'm' : 'm BGL'})',
                  data: meanData,
                  type: 'line',
                  borderColor: '${isDark ? '#10b981' : '#059669'}',
                  borderWidth: 2,
                  borderDash: [3, 3],
                  fill: false,
                  pointRadius: 0,
                  pointHoverRadius: 0,
                  tension: 0,
                  yAxisID: 'y'
                });
              }
  
              const medianData = ${medianValues};
              if (medianData && medianData.length > 0) {
                datasets.push({
                  label: 'Median (${medianValuesStr} ${displayMode === 'fluctuation' ? 'm' : 'm BGL'})',
                  data: medianData,
                  type: 'line',
                  borderColor: '${isDark ? '#fbbf24' : '#d97706'}',
                  borderWidth: 2,
                  borderDash: [4, 4],
                  fill: false,
                  pointRadius: 0,
                  pointHoverRadius: 0,
                  tension: 0,
                  yAxisID: 'y'
                });
              }
  
              const sdUpperData = ${sdUpperValues};
              const sdLowerData = ${sdLowerValues};
              if (sdUpperData && sdUpperData.length > 0) {
                datasets.push({
                  label: 'Mean + SD (${sdUpperStr} ${displayMode === 'fluctuation' ? 'm' : 'm BGL'})',
                  data: sdUpperData,
                  type: 'line',
                  borderColor: '${isDark ? '#c084fc' : '#7c3aed'}',
                  borderWidth: 1.5,
                  borderDash: [2, 4],
                  fill: false,
                  pointRadius: 0,
                  pointHoverRadius: 0,
                  tension: 0,
                  yAxisID: 'y'
                });
                datasets.push({
                  label: 'Mean - SD (${sdLowerStr} ${displayMode === 'fluctuation' ? 'm' : 'm BGL'})',
                  data: sdLowerData,
                  type: 'line',
                  borderColor: '${isDark ? '#c084fc' : '#7c3aed'}',
                  borderWidth: 1.5,
                  borderDash: [2, 4],
                  fill: false,
                  pointRadius: 0,
                  pointHoverRadius: 0,
                  tension: 0,
                  yAxisID: 'y'
                });
              }
            }
  
            // Vertical Stats Lines (only for histogram mode)
            if (${isHistogram}) {
              const meanPts = ${meanLinePoints};
              if (meanPts && meanPts.length > 0) {
                datasets.push({
                  label: 'Mean (${meanValuesStr} m)',
                  data: meanPts,
                  type: 'line',
                  borderColor: '${isDark ? '#10b981' : '#059669'}',
                  borderWidth: 2,
                  borderDash: [3, 3],
                  fill: false,
                  pointRadius: 0,
                  pointHoverRadius: 0,
                  tension: 0,
                  yAxisID: 'y'
                });
              }
  
              const medianPts = ${medianLinePoints};
              if (medianPts && medianPts.length > 0) {
                datasets.push({
                  label: 'Median (${medianValuesStr} m)',
                  data: medianPts,
                  type: 'line',
                  borderColor: '${isDark ? '#fbbf24' : '#d97706'}',
                  borderWidth: 2,
                  borderDash: [4, 4],
                  fill: false,
                  pointRadius: 0,
                  pointHoverRadius: 0,
                  tension: 0,
                  yAxisID: 'y'
                });
              }
  
              const sdUpperPts = ${sdUpperLinePoints};
              const sdLowerPts = ${sdLowerLinePoints};
              if (sdUpperPts && sdUpperPts.length > 0) {
                datasets.push({
                  label: 'Mean + SD (${sdUpperStr} m)',
                  data: sdUpperPts,
                  type: 'line',
                  borderColor: '${isDark ? '#c084fc' : '#7c3aed'}',
                  borderWidth: 1.5,
                  borderDash: [2, 4],
                  fill: false,
                  pointRadius: 0,
                  pointHoverRadius: 0,
                  tension: 0,
                  yAxisID: 'y'
                });
                datasets.push({
                  label: 'Mean - SD (${sdLowerStr} m)',
                  data: sdLowerPts,
                  type: 'line',
                  borderColor: '${isDark ? '#c084fc' : '#7c3aed'}',
                  borderWidth: 1.5,
                  borderDash: [2, 4],
                  fill: false,
                  pointRadius: 0,
                  pointHoverRadius: 0,
                  tension: 0,
                  yAxisID: 'y'
                });
              }
            }
  
            window.chart = new Chart(ctx, {
              type: ${isHistogram} ? 'bar' : '${chartType}',
              data: {
                labels: ${isHistogram} ? [] : ${dataLabels},
                datasets: datasets
              },
              plugins: [{
                id: 'crosshair',
                afterDraw: (chart) => {
                  if (chart.config.type !== 'line') return;
                  if (chart.tooltip && chart.tooltip._active && chart.tooltip._active.length) {
                    const activePoint = chart.tooltip._active[0];
                    const ctx = chart.ctx;
                    ctx.save();
                    const x = activePoint.element.x;
                    const y = activePoint.element.y;
                    
                    // Draw vertical line
                    ctx.beginPath();
                    ctx.moveTo(x, chart.chartArea.top);
                    ctx.lineTo(x, chart.chartArea.bottom);
                    ctx.lineWidth = 1.2;
                    ctx.strokeStyle = '${isDark ? 'rgba(148, 163, 184, 0.45)' : 'rgba(71, 85, 105, 0.45)'}';
                    ctx.setLineDash([3, 3]);
                    ctx.stroke();
                    
                    // Draw horizontal line
                    ctx.beginPath();
                    ctx.moveTo(chart.chartArea.left, y);
                    ctx.lineTo(chart.chartArea.right, y);
                    ctx.lineWidth = 1.2;
                    ctx.strokeStyle = '${isDark ? 'rgba(148, 163, 184, 0.45)' : 'rgba(71, 85, 105, 0.45)'}';
                    ctx.setLineDash([3, 3]);
                    ctx.stroke();
                    
                    ctx.restore();
                  }
                }
              }],
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: true,
                    position: 'top',
                    labels: {
                      color: '${textColor}',
                      boxWidth: 15,
                      font: { size: 10 },
                      generateLabels: function(chart) {
                        const datasets = chart.data.datasets;
                        const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                        original.forEach(label => {
                          // If it's the main dataset (dataset index 0) and not histogram, override gradient styling with solid color
                          if (label.datasetIndex === 0 && !${isHistogram} && '${displayMode}' !== 'pre_vs_post' && '${displayMode}' !== 'elevation') {
                            label.fillStyle = '${isDark ? '#38bdf8' : '#0284c7'}';
                            label.strokeStyle = '${isDark ? '#38bdf8' : '#0284c7'}';
                          }
                        });
                        return original;
                      }
                    }
                  },
                  tooltip: {
                    backgroundColor: '${isDark ? '#1e293b' : '#ffffff'}',
                    titleColor: '${isDark ? '#f8fafc' : '#0f172a'}',
                    bodyColor: '${isDark ? '#38bdf8' : '#0284c7'}',
                    borderColor: '${gridColor}',
                    borderWidth: 1,
                    displayColors: false,
                    callbacks: {
                      title: function(context) {
                        if ('${displayMode}' === 'elevation') {
                          const fullNames = ${fullNames};
                          const idx = context[0].dataIndex;
                          return fullNames[idx] || context[0].label;
                        }
                        return context[0].label;
                      },
                      label: function(context) {
                        if ('${displayMode}' === 'elevation') {
                          return context.dataset.label + ': ' + context.parsed.y + ' m';
                        }
                        if (context.dataset.label.includes('Mean') || context.dataset.label.includes('Median') || context.dataset.label.includes('SD')) {
                          return context.dataset.label;
                        }
                        if (context.dataset.label.includes('Rainfall')) {
                          return 'Rainfall: ' + context.parsed.y + ' mm';
                        }
                        if (${isHistogram}) {
                          return 'Bin Center: ' + context.parsed.x + ' m | Frequency: ' + context.parsed.y;
                        }
                        const modeLabel = '${displayMode === 'depth' || displayMode === 'pre_vs_post' ? 'Depth: ' : displayMode === 'annual' ? 'Avg Depth: ' : 'Fluctuation: '}';
                        const bglSuffix = '${displayMode === 'depth' || displayMode === 'annual' || displayMode === 'pre_vs_post' ? ' BGL' : ''}';
                        return modeLabel + context.parsed.y + ' m' + bglSuffix;
                      }
                    }
                  }
                },
                scales: {
                  y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    reverse: ${!isHistogram && (displayMode === 'depth' || displayMode === 'annual' || displayMode === 'pre_vs_post') ? 'true' : 'false'},
                    grid: {
                      color: '${gridColor}',
                      lineWidth: 1
                    },
                    ticks: {
                      color: '${textColor}',
                      font: { size: 10 },
                      stepSize: ${isHistogram} ? 1 : undefined
                    },
                    title: {
                      display: true,
                      text: '${isHistogram ? 'Frequency (Count of Records)' : (displayMode === 'elevation' ? 'Elevation (meters above MSL)' : (displayMode === 'depth' || displayMode === 'pre_vs_post' ? 'Depth to Water Table (meters BGL)' : displayMode === 'annual' ? 'Annual Average BGL (meters)' : 'Annual Water Table Fluctuation (meters)'))}',
                      color: '${textColor}',
                      font: { weight: 'bold', size: 11 }
                    }
                  },
                  y1: {
                    type: 'linear',
                    display: !${isHistogram} && '${displayMode}' !== 'elevation' && rainfallData && rainfallData.length > 0,
                    position: 'right',
                    grid: {
                      drawOnChartArea: false
                    },
                    ticks: {
                      color: '${textColor}',
                      font: { size: 10 }
                    },
                    title: {
                      display: true,
                      text: 'Rainfall (mm)',
                      color: '${textColor}',
                      font: { weight: 'bold', size: 11 }
                    }
                  },
                  x: {
                    type: ${isHistogram} ? 'linear' : 'category',
                    grid: {
                      color: '${gridColor}',
                      lineWidth: 1
                    },
                    ticks: {
                      color: '${textColor}',
                      font: { size: 9 },
                      maxRotation: 45,
                      minRotation: 45,
                      autoSkip: false
                    },
                    title: {
                      display: ${isHistogram},
                      text: '${displayMode === 'depth' ? 'Depth (meters BGL)' : displayMode === 'annual' ? 'Avg Depth (meters)' : 'Fluctuation (meters)'}',
                      color: '${textColor}',
                      font: { weight: 'bold', size: 11 }
                    }
                  }
                }
              }
            });
          }
        </script>

        <script>
          if (${is3D}) {
            const localScripts = [
              "file:///android_asset/three.min.js",
              "file:///android_asset/OrbitControls.js"
            ];
            const cdnScripts = [
              "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js",
              "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"
            ];
            
            let loadedCount = 0;
            function loadNextScript() {
              if (loadedCount < localScripts.length) {
                const script = document.createElement('script');
                script.src = localScripts[loadedCount];
                script.onload = () => {
                  loadedCount++;
                  loadNextScript();
                };
                script.onerror = () => {
                  // Fallback to CDN script if local asset fails
                  const fallback = document.createElement('script');
                  fallback.src = cdnScripts[loadedCount];
                  fallback.onload = () => {
                    loadedCount++;
                    loadNextScript();
                  };
                  fallback.onerror = (err) => {
                    document.getElementById('loader3d').innerHTML = '<div style="color: #ef4444; margin-bottom: 10px; font-size: 14px;">⚠️ Script Loading Failed</div>' +
                      '<div style="font-size: 11px; font-weight: normal; color: #94a3b8; line-height: 1.4; margin: 0 auto 12px;">WebGL 3D views require downloading the engine library. Please check your internet connection.</div>' +
                      '<button onclick="fallbackTo2D()" style="background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">Go to 2D Cross-Section</button>';
                  };
                  document.body.appendChild(fallback);
                };
                document.body.appendChild(script);
              } else {
                init3D();
              }
            }
            loadNextScript();
            
            function init3D() {
              const container = document.getElementById('canvas3dContainer');
              const loader = document.getElementById('loader3d');
              loader.style.display = 'none';

              const labels = ${dataLabels};
              const msls = ${mslValues};
              const rls = ${rlValues};
              const lons = ${lonValues};
              const lats = ${latValues};
              const fullNames = ${fullNames};
              const wellTypes = ${wellTypes};
              const depths = ${depths};
              
              const N = msls.length;
              if (N < 2) {
                container.innerHTML = '<div style="color: #eab308; text-align: center; padding-top: 100px; font-family: sans-serif; font-size: 14px;">⚠️ Need at least 2 stations to construct a 3D cross section.</div>';
                return;
              }

              const scene = new THREE.Scene();
              scene.background = new THREE.Color(${isDark ? 0x0f172a : 0xf1f5f9});

              const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
              camera.position.set(0, 15, 30);

              const renderer = new THREE.WebGLRenderer({ antialias: true });
              renderer.setSize(container.clientWidth, container.clientHeight);
              renderer.setPixelRatio(window.devicePixelRatio || 1);
              renderer.shadowMap.enabled = true;
              container.appendChild(renderer.domElement);

              const controls = new THREE.OrbitControls(camera, renderer.domElement);
              controls.enableDamping = true;
              controls.dampingFactor = 0.05;
              controls.maxPolarAngle = Math.PI / 2 - 0.05;
              controls.minDistance = 5;
              controls.maxDistance = 150;

              const ambientLight = new THREE.AmbientLight(0xffffff, ${isDark ? 0.45 : 0.6});
              scene.add(ambientLight);

              const dirLight = new THREE.DirectionalLight(0xffffff, ${isDark ? 0.7 : 0.9});
              dirLight.position.set(20, 40, 20);
              dirLight.castShadow = true;
              scene.add(dirLight);
              
              const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.35);
              dirLight2.position.set(-20, -10, -20);
              scene.add(dirLight2);

              const minLon = Math.min(...lons);
              const maxLon = Math.max(...lons);
              const minLat = Math.min(...lats);
              const maxLat = Math.max(...lats);
              
              const lonRange = maxLon - minLon || 0.0001;
              const latRange = maxLat - minLat || 0.0001;
              
              const minRL = Math.min(...rls);
              const maxMSL = Math.max(...msls);
              const elevRange = maxMSL - minRL || 10;
              
              const modelBottomElev = minRL - (elevRange * 0.4 || 10);
              const lowestYLimit = modelBottomElev;
              const highestYLimit = maxMSL;
              const yRange = highestYLimit - lowestYLimit || 10;

              function getX(lon) {
                return ((lon - minLon) / lonRange) * 28 - 14;
              }
              
              function getZ(lat) {
                return -(((lat - minLat) / latRange) * 16 - 8);
              }
              
              function getY(elev) {
                return ((elev - lowestYLimit) / yRange) * 12 - 6;
              }

              const baseNormalizedY = getY(modelBottomElev);

              const stations3D = [];
              for (let i = 0; i < N; i++) {
                stations3D.push({
                  id: i,
                  name: labels[i],
                  fullName: fullNames[i],
                  x: getX(lons[i]),
                  z: getZ(lats[i]),
                  yGround: getY(msls[i]),
                  yWater: getY(rls[i]),
                  rawMsl: msls[i],
                  rawRl: rls[i],
                  rawDtgwl: msls[i] - rls[i],
                  wellType: wellTypes[i] || '',
                  rawDepth: depths[i] || ''
                });
              }

              const thickness = 1.6;
              const leftPoints = [];
              const rightPoints = [];

              for (let i = 0; i < N; i++) {
                let nx = 0, nz = -1;
                
                if (i === 0) {
                  const dx = stations3D[1].x - stations3D[0].x;
                  const dz = stations3D[1].z - stations3D[0].z;
                  const len = Math.sqrt(dx*dx + dz*dz) || 1;
                  nx = -dz / len;
                  nz = dx / len;
                } else if (i === N - 1) {
                  const dx = stations3D[N-1].x - stations3D[N-2].x;
                  const dz = stations3D[N-1].z - stations3D[N-2].z;
                  const len = Math.sqrt(dx*dx + dz*dz) || 1;
                  nx = -dz / len;
                  nz = dx / len;
                } else {
                  const dx1 = stations3D[i].x - stations3D[i-1].x;
                  const dz1 = stations3D[i].z - stations3D[i-1].z;
                  const len1 = Math.sqrt(dx1*dx1 + dz1*dz1) || 1;
                  
                  const dx2 = stations3D[i+1].x - stations3D[i].x;
                  const dz2 = stations3D[i+1].z - stations3D[i].z;
                  const len2 = Math.sqrt(dx2*dx2 + dz2*dz2) || 1;
                  
                  nx = -(dz1/len1 + dz2/len2) / 2;
                  nz = (dx1/len1 + dx2/len2) / 2;
                  const nlen = Math.sqrt(nx*nx + nz*nz) || 1;
                  nx /= nlen;
                  nz /= nlen;
                }

                const halfT = thickness / 2;
                leftPoints.push({
                  x: stations3D[i].x + nx * halfT,
                  z: stations3D[i].z + nz * halfT
                });
                rightPoints.push({
                  x: stations3D[i].x - nx * halfT,
                  z: stations3D[i].z - nz * halfT
                });
              }

              function addQuad(geom, v1, v2, v3, v4) {
                const posAttr = geom.getAttribute('position');
                const arr = posAttr ? Array.from(posAttr.array) : [];
                arr.push(v1.x, v1.y, v1.z);
                arr.push(v2.x, v2.y, v2.z);
                arr.push(v3.x, v3.y, v3.z);
                arr.push(v1.x, v1.y, v1.z);
                arr.push(v3.x, v3.y, v3.z);
                arr.push(v4.x, v4.y, v4.z);
                geom.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
              }

              const unsatGeometry = new THREE.BufferGeometry();
              const satGeometry = new THREE.BufferGeometry();

              for (let i = 0; i < N - 1; i++) {
                const s1 = stations3D[i];
                const s2 = stations3D[i+1];
                
                const lp1 = leftPoints[i];
                const lp2 = leftPoints[i+1];
                const rp1 = rightPoints[i];
                const rp2 = rightPoints[i+1];

                const LG1 = new THREE.Vector3(lp1.x, s1.yGround, lp1.z);
                const LG2 = new THREE.Vector3(lp2.x, s2.yGround, lp2.z);
                const RG1 = new THREE.Vector3(rp1.x, s1.yGround, rp1.z);
                const RG2 = new THREE.Vector3(rp2.x, s2.yGround, rp2.z);
                
                const LW1 = new THREE.Vector3(lp1.x, s1.yWater, lp1.z);
                const LW2 = new THREE.Vector3(lp2.x, s2.yWater, lp2.z);
                const RW1 = new THREE.Vector3(rp1.x, s1.yWater, rp1.z);
                const RW2 = new THREE.Vector3(rp2.x, s2.yWater, rp2.z);

                const LB1 = new THREE.Vector3(lp1.x, baseNormalizedY, lp1.z);
                const LB2 = new THREE.Vector3(lp2.x, baseNormalizedY, lp2.z);
                const RB1 = new THREE.Vector3(rp1.x, baseNormalizedY, rp1.z);
                const RB2 = new THREE.Vector3(rp2.x, baseNormalizedY, rp2.z);

                addQuad(unsatGeometry, RG1, LG1, LG2, RG2);
                addQuad(unsatGeometry, LW1, RW1, RW2, LW2);
                addQuad(unsatGeometry, LG1, LW1, LW2, LG2);
                addQuad(unsatGeometry, RW1, RG1, RG2, RW2);

                addQuad(satGeometry, RW1, LW1, LW2, RW2);
                addQuad(satGeometry, LB1, RB1, RB2, LB2);
                addQuad(satGeometry, LW1, LB1, LB2, LW2);
                addQuad(satGeometry, RB1, RW1, RW2, RB2);

                if (i === 0) {
                  addQuad(unsatGeometry, LG1, RG1, RW1, LW1);
                  addQuad(satGeometry, LW1, RW1, RB1, LB1);
                }
                if (i === N - 2) {
                  addQuad(unsatGeometry, RG2, LG2, LW2, RW2);
                  addQuad(satGeometry, RW2, LW2, LB2, RB2);
                }
              }

              unsatGeometry.computeVertexNormals();
              satGeometry.computeVertexNormals();

              const unsatMaterial = new THREE.MeshStandardMaterial({
                color: ${isDark ? 0x92400e : 0xb45309},
                roughness: 0.85,
                metalness: 0.1,
                side: THREE.DoubleSide
              });

              const satMaterial = new THREE.MeshStandardMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.65,
                roughness: 0.3,
                metalness: 0.05,
                side: THREE.DoubleSide
              });

              const unsatMesh = new THREE.Mesh(unsatGeometry, unsatMaterial);
              unsatMesh.castShadow = true;
              unsatMesh.receiveShadow = true;
              scene.add(unsatMesh);

              const satMesh = new THREE.Mesh(satGeometry, satMaterial);
              satMesh.castShadow = true;
              satMesh.receiveShadow = true;
              scene.add(satMesh);

              const mslPointsList = [];
              const wtPointsList = [];
              const basePointsList = [];

              for (let i = 0; i < N; i++) {
                mslPointsList.push(new THREE.Vector3(stations3D[i].x, stations3D[i].yGround + 0.02, stations3D[i].z));
                wtPointsList.push(new THREE.Vector3(stations3D[i].x, stations3D[i].yWater + 0.02, stations3D[i].z));
                basePointsList.push(new THREE.Vector3(stations3D[i].x, baseNormalizedY - 0.02, stations3D[i].z));
              }

              const mslLineGeo = new THREE.BufferGeometry().setFromPoints(mslPointsList);
              const mslLineMat = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 3 });
              const mslLine = new THREE.Line(mslLineGeo, mslLineMat);
              scene.add(mslLine);

              const wtLineGeo = new THREE.BufferGeometry().setFromPoints(wtPointsList);
              const wtLineMat = new THREE.LineBasicMaterial({ color: 0x0ea5e9, linewidth: 3 });
              const wtLine = new THREE.Line(wtLineGeo, wtLineMat);
              scene.add(wtLine);

              const baseLineGeo = new THREE.BufferGeometry().setFromPoints(basePointsList);
              const baseLineMat = new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 2 });
              const baseLine = new THREE.Line(baseLineGeo, baseLineMat);
              scene.add(baseLine);

              const wellRadius = 0.18;
              const casingMaterial = new THREE.MeshStandardMaterial({
                color: 0x94a3b8,
                metalness: 0.8,
                roughness: 0.2
              });

              const waterMaterial = new THREE.MeshStandardMaterial({
                color: 0x0284c7,
                metalness: 0.1,
                roughness: 0.1,
                emissive: 0x0284c7,
                emissiveIntensity: 0.1
              });

              const wellGroup = new THREE.Group();
              const interactableObjects = [];

              for (let i = 0; i < N; i++) {
                const s = stations3D[i];
                
                // Parse well type and physical depth
                const isDW = s.wellType === 'DW';
                const isTW = s.wellType === 'TW';
                const isBW = s.wellType === 'BW';
                
                const rawDepthVal = parseFloat(s.rawDepth);
                const physicalDepth = !isNaN(rawDepthVal) && rawDepthVal > 0 
                  ? rawDepthVal 
                  : (isDW ? 10 : (isTW ? 30 : (isBW ? 50 : 20)));

                // Calculate bottom Y normalized
                const wellBottomElev = Math.max(modelBottomElev, s.rawMsl - physicalDepth);
                const yWellBottom = getY(wellBottomElev);
                
                // Shaft dimensions and materials based on type
                let activeRadius = 0.18;
                let activeCasingMaterial = casingMaterial;
                
                if (isDW) {
                  // Dug Well: wider, concrete style
                  activeRadius = 0.32;
                  activeCasingMaterial = new THREE.MeshStandardMaterial({
                    color: 0xc0c0c0,
                    roughness: 0.9,
                    metalness: 0.0
                  });
                } else if (isTW || isBW) {
                  // Tube/Bore Well: narrower, steel style
                  activeRadius = 0.12;
                  activeCasingMaterial = new THREE.MeshStandardMaterial({
                    color: 0x475569,
                    roughness: 0.2,
                    metalness: 0.8
                  });
                }

                const height = s.yGround - yWellBottom;
                const casingGeo = new THREE.CylinderGeometry(activeRadius, activeRadius, height, 8);
                const casingMesh = new THREE.Mesh(casingGeo, activeCasingMaterial);
                casingMesh.position.set(s.x, yWellBottom + height / 2, s.z);
                casingMesh.castShadow = true;
                casingMesh.receiveShadow = true;
                wellGroup.add(casingMesh);

                const waterHeight = s.yWater - yWellBottom;
                if (waterHeight > 0.05) {
                  const waterRadius = activeRadius * 0.9;
                  const waterGeo = new THREE.CylinderGeometry(waterRadius, waterRadius, waterHeight, 8);
                  const waterMesh = new THREE.Mesh(waterGeo, waterMaterial);
                  waterMesh.position.set(s.x, yWellBottom + waterHeight / 2, s.z);
                  wellGroup.add(waterMesh);
                }

                const sphereRadius = 0.35;
                const sphereGeo = new THREE.SphereGeometry(sphereRadius, 16, 16);
                const sphereMat = new THREE.MeshStandardMaterial({
                  color: 0xef4444,
                  roughness: 0.3,
                  metalness: 0.5,
                  emissive: 0x991b1b,
                  emissiveIntensity: 0.2
                });
                const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
                sphereMesh.position.set(s.x, s.yGround + sphereRadius, s.z);
                sphereMesh.userData = {
                  name: s.fullName || s.name,
                  msl: s.rawMsl,
                  rl: s.rawRl,
                  dtgwl: s.rawDtgwl,
                  wellType: s.wellType,
                  depth: physicalDepth,
                  hasActualDepth: !isNaN(rawDepthVal) && rawDepthVal > 0
                };
                
                wellGroup.add(sphereMesh);
                interactableObjects.push(sphereMesh);
              }
              scene.add(wellGroup);

              const gridHelper = new THREE.GridHelper(40, 20, 0x94a3b8, ${isDark ? 0x1e293b : 0xe2e8f0});
              gridHelper.position.y = baseNormalizedY;
              scene.add(gridHelper);

              const labelContainer = document.createElement('div');
              labelContainer.style.position = 'absolute';
              labelContainer.style.top = '0';
              labelContainer.style.left = '0';
              labelContainer.style.width = '100%';
              labelContainer.style.height = '100%';
              labelContainer.style.pointerEvents = 'none';
              labelContainer.style.zIndex = '500';
              container.appendChild(labelContainer);

              const labelElements = [];
              for (let i = 0; i < N; i++) {
                const s = stations3D[i];
                const el = document.createElement('div');
                el.style.position = 'absolute';
                el.style.transform = 'translate(-50%, -100%)';
                el.style.background = '${isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.85)'}';
                el.style.color = '${isDark ? '#e2e8f0' : '#1e293b'}';
                el.style.border = '1px solid ' + '${isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(71, 85, 105, 0.2)'}';
                el.style.padding = '2px 6px';
                el.style.borderRadius = '4px';
                el.style.fontSize = '9px';
                el.style.fontWeight = 'bold';
                el.style.whiteSpace = 'nowrap';
                el.innerText = s.name;
                labelContainer.appendChild(el);
                
                labelElements.push({
                  element: el,
                  pos: new THREE.Vector3(s.x, s.yGround + 0.6, s.z)
                });
              }

              function updateLabels() {
                const tempV = new THREE.Vector3();
                labelElements.forEach(item => {
                  tempV.copy(item.pos);
                  tempV.project(camera);
                  if (tempV.z > 1) {
                    item.element.style.display = 'none';
                    return;
                  }
                  const x = (tempV.x * 0.5 + 0.5) * container.clientWidth;
                  const y = (tempV.y * -0.5 + 0.5) * container.clientHeight;
                  item.element.style.display = 'block';
                  item.element.style.left = x + 'px';
                  item.element.style.top = y + 'px';
                });
              }

              const raycaster = new THREE.Raycaster();
              const mouse = new THREE.Vector2();
              const tooltip = document.getElementById('tooltip3d');
              
              let touchStartTime = 0;
              let startX = 0, startY = 0;

              renderer.domElement.addEventListener('touchstart', (e) => {
                touchStartTime = Date.now();
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
              }, { passive: true });

              renderer.domElement.addEventListener('touchend', (e) => {
                const duration = Date.now() - touchStartTime;
                const endX = e.changedTouches[0].clientX;
                const endY = e.changedTouches[0].clientY;
                const dx = endX - startX;
                const dy = endY - startY;
                const dist = Math.sqrt(dx*dx + dy*dy);

                if (duration < 300 && dist < 10) {
                  const rect = renderer.domElement.getBoundingClientRect();
                  mouse.x = ((endX - rect.left) / rect.width) * 2 - 1;
                  mouse.y = -((endY - rect.top) / rect.height) * 2 + 1;

                  raycaster.setFromCamera(mouse, camera);
                  const intersects = raycaster.intersectObjects(interactableObjects);

                  if (intersects.length > 0) {
                    const hit = intersects[0].object;
                    const d = hit.userData;
                    
                    tooltip.style.display = 'block';
                    tooltip.style.left = Math.min(rect.width - 200, Math.max(10, endX - rect.left - 90)) + 'px';
                    tooltip.style.top = Math.max(10, endY - rect.top - 120) + 'px';
                    
                    const typeStr = d.wellType === 'DW' ? 'Dug Well' : (d.wellType === 'TW' ? 'Tube Well' : (d.wellType === 'BW' ? 'Bore Well' : 'Observation Well'));
                    const depthStr = d.depth.toFixed(1) + ' m' + (d.hasActualDepth ? '' : ' (Est.)');

                    tooltip.innerHTML = '<strong>📍 ' + d.name + '</strong>' +
                      '<div style="margin-top: 6px; height: 1px; background: ' + '${isDark ? '#334155' : '#cbd5e1'}' + ';"></div>' +
                      '<div style="margin-top:6px; display:flex; justify-content:space-between; font-size:11px;"><span>Well Type:</span><strong>' + typeStr + '</strong></div>' +
                      '<div style="display:flex; justify-content:space-between; font-size:11px;"><span>Well Depth:</span><strong>' + depthStr + '</strong></div>' +
                      '<div style="display:flex; justify-content:space-between; font-size:11px;"><span>GL Elevation:</span><strong>' + d.msl.toFixed(2) + ' m MSL</strong></div>' +
                      '<div style="display:flex; justify-content:space-between; font-size:11px; color:#38bdf8;"><span>Water Table:</span><strong>' + d.rl.toFixed(2) + ' m RL</strong></div>' +
                      '<div style="display:flex; justify-content:space-between; font-size:11px;"><span>Water Depth:</span><strong>' + d.dtgwl.toFixed(2) + ' m BGL</strong></div>';
                      
                    interactableObjects.forEach(obj => {
                      obj.material.emissive.setHex(0x991b1b);
                      obj.material.emissiveIntensity = 0.2;
                    });
                    hit.material.emissive.setHex(0x38bdf8);
                    hit.material.emissiveIntensity = 0.5;
                  } else {
                    tooltip.style.display = 'none';
                    interactableObjects.forEach(obj => {
                      obj.material.emissive.setHex(0x991b1b);
                      obj.material.emissiveIntensity = 0.2;
                    });
                  }
                }
              }, { passive: true });

              let autoRotate = true;
              let rotationTime = 0;
              
              controls.addEventListener('start', () => {
                autoRotate = false;
              });

              function animate() {
                requestAnimationFrame(animate);
                if (autoRotate) {
                  rotationTime += 0.003;
                  const radius = 33;
                  camera.position.x = Math.sin(rotationTime) * radius;
                  camera.position.z = Math.cos(rotationTime) * radius;
                  camera.position.y = 12 + Math.sin(rotationTime * 0.5) * 4;
                  camera.lookAt(0, -1, 0);
                }
                controls.update();
                updateLabels();
                renderer.render(scene, camera);
              }
              animate();

              window.addEventListener('resize', () => {
                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(container.clientWidth, container.clientHeight);
              });
            }
          }
        </script>
      </body>
      </html>
    `;
  }, [chartData, isDark, chartType, displayMode, showRainfall, forecastMode, stats, statsOverlayMode]);


  const renderDescriptiveStatsCard = () => {
    return (
      <View style={styles.analysisCard}>
        <Text style={styles.analysisTitle}>📊 Descriptive Statistics</Text>
        <View style={styles.analysisRow}>
          <View style={styles.analysisCol}>
            <Text style={styles.statLabel}>Mean (Average)</Text>
            <Text style={styles.statValue}>
              {stats.mean !== 'N/A' ? `${stats.mean} m` : 'N/A'}
            </Text>
          </View>
          <View style={styles.analysisCol}>
            <Text style={styles.statLabel}>Median</Text>
            <Text style={styles.statValue}>
              {stats.median !== 'N/A' ? `${stats.median} m` : 'N/A'}
            </Text>
          </View>
          <View style={styles.analysisCol}>
            <Text style={styles.statLabel}>Std Deviation</Text>
            <Text style={styles.statValue}>
              {stats.stdDev !== 'N/A' ? `${stats.stdDev} m` : 'N/A'}
            </Text>
          </View>
        </View>
        <Text style={styles.analysisNote}>
          * Note: Computed using valid historical values (excluding future forecast projections).
        </Text>
      </View>
    );
  };

  const renderAquiferContextCard = () => {
    // Determine active block key and details
    const blockKey = selectedBlock !== 'All Blocks' 
      ? selectedBlock.toUpperCase().replace(/[^A-Z]/g, '') 
      : null;
    const blockGwra = blockKey ? gwraData[blockKey] : null;

    // District level aggregation if All Blocks is selected
    const districtSummary = useMemo(() => {
      if (selectedBlock !== 'All Blocks') return null;
      
      const blocksInDist = Object.values(gwraData).filter(
        b => b.district === selectedDist.toUpperCase()
      );
      
      if (blocksInDist.length === 0) return null;
      
      const aquifersCount = {};
      let sumYield = 0;
      let sumRif = 0;
      
      blocksInDist.forEach(b => {
        aquifersCount[b.aquifer] = (aquifersCount[b.aquifer] || 0) + 1;
        sumYield += b.specificYield;
        sumRif += b.rainfallInfiltrationFactor;
      });
      
      const sortedAquifers = Object.entries(aquifersCount)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `${name} (${count})`)
        .join(', ');
        
      return {
        aquiferList: sortedAquifers || 'N/A',
        avgYield: Number((sumYield / blocksInDist.length).toFixed(2)),
        avgRif: Number((sumRif / blocksInDist.length).toFixed(2)),
        totalBlocks: blocksInDist.length
      };
    }, [selectedDist, selectedBlock]);

    // Render nothing if no data exists
    if (!blockGwra && !districtSummary) return null;

    // Extract values
    const isBlockScope = selectedBlock !== 'All Blocks';
    const aquifer = isBlockScope ? (blockGwra ? blockGwra.aquifer : 'N/A') : (districtSummary ? districtSummary.aquiferList : 'N/A');
    const specificYield = isBlockScope ? (blockGwra ? blockGwra.specificYield : 0) : (districtSummary ? districtSummary.avgYield : 0);
    const rif = isBlockScope ? (blockGwra ? blockGwra.rainfallInfiltrationFactor : 0) : (districtSummary ? districtSummary.avgRif : 0);

    // Color code aquifer type dynamically
    let aquiferColor = '#0ea5e9'; // default blue
    let aquiferBg = 'rgba(14, 165, 233, 0.12)';
    const aqLower = aquifer.toLowerCase();
    
    if (aqLower.includes('alluvium')) {
      aquiferColor = '#3b82f6'; // blue
      aquiferBg = 'rgba(59, 130, 246, 0.15)';
    } else if (aqLower.includes('sandstone')) {
      aquiferColor = '#eab308'; // yellow/amber
      aquiferBg = 'rgba(234, 179, 8, 0.15)';
    } else if (aqLower.includes('charnokite') || aqLower.includes('gneiss') || aqLower.includes('banded')) {
      aquiferColor = '#a855f7'; // purple
      aquiferBg = 'rgba(168, 85, 247, 0.15)';
    } else if (aqLower.includes('laterite')) {
      aquiferColor = '#ef4444'; // red
      aquiferBg = 'rgba(239, 68, 68, 0.15)';
    } else if (aqLower.includes('granite') || aqLower.includes('basement') || aqLower.includes('intrusive')) {
      aquiferColor = '#64748b'; // grey
      aquiferBg = 'rgba(100, 116, 139, 0.15)';
    } else if (aqLower.includes('khondalite')) {
      aquiferColor = '#ec4899'; // pink
      aquiferBg = 'rgba(236, 72, 153, 0.15)';
    }

    // Determine Recharge Potential rating
    let potentialText = 'Moderate';
    let potentialColor = '#d97706';
    let potentialBg = 'rgba(217, 119, 6, 0.15)';
    
    if (specificYield >= 5.0 || rif >= 15.0) {
      potentialText = 'High Recharge Potential';
      potentialColor = '#10b981';
      potentialBg = 'rgba(16, 185, 129, 0.15)';
    } else if (specificYield < 2.0 || rif < 8.0) {
      potentialText = 'Low Recharge Potential';
      potentialColor = '#ef4444';
      potentialBg = 'rgba(239, 68, 68, 0.15)';
    } else {
      potentialText = 'Moderate Recharge Potential';
      potentialColor = '#f59e0b';
      potentialBg = 'rgba(245, 158, 11, 0.15)';
    }

    return (
      <View style={styles.analysisCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={styles.analysisTitle}>🪨 Geological & Aquifer Context</Text>
          <View style={{ backgroundColor: potentialBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
            <Text style={{ color: potentialColor, fontSize: 11, fontWeight: '700' }}>{potentialText}</Text>
          </View>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 }}>
            {isBlockScope ? 'Principal Aquifer' : `Predominant Aquifers (${districtSummary ? districtSummary.totalBlocks : 0} Blocks)`}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
            <View style={{ backgroundColor: aquiferBg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: aquiferColor + '30' }}>
              <Text style={{ color: aquiferColor, fontSize: 13, fontWeight: '700' }}>{aquifer}</Text>
            </View>
          </View>
        </View>

        <View style={styles.analysisRow}>
          <View style={styles.analysisCol}>
            <Text style={styles.statLabel}>{isBlockScope ? 'Specific Yield' : 'Avg Specific Yield'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
              <Text style={[styles.statValue, { color: specificYield >= 5.0 ? '#10b981' : specificYield < 2.0 ? '#ef4444' : '#f59e0b' }]}>
                {specificYield}%
              </Text>
            </View>
            <View style={{ height: 4, backgroundColor: isDark ? '#334155' : '#e2e8f0', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, (specificYield / 15) * 100)}%`, height: '100%', backgroundColor: specificYield >= 5.0 ? '#10b981' : specificYield < 2.0 ? '#ef4444' : '#f59e0b' }} />
            </View>
          </View>
          
          <View style={styles.analysisCol}>
            <Text style={styles.statLabel}>{isBlockScope ? 'Rainfall Infil. Factor' : 'Avg Rainfall Infil. Factor'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
              <Text style={[styles.statValue, { color: rif >= 15.0 ? '#10b981' : rif < 8.0 ? '#ef4444' : '#f59e0b' }]}>
                {rif}%
              </Text>
            </View>
            <View style={{ height: 4, backgroundColor: isDark ? '#334155' : '#e2e8f0', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, (rif / 25) * 100)}%`, height: '100%', backgroundColor: rif >= 15.0 ? '#10b981' : rif < 8.0 ? '#ef4444' : '#f59e0b' }} />
            </View>
          </View>
        </View>

        <Text style={styles.analysisNote}>
          * Reference: Data sourced from CGWB GWRA Assessment Report (Odisha, 2025). Specific Yield determines dynamic storage release; RIF is the fraction of rainfall recharging the aquifer.
        </Text>
      </View>
    );
  };

  const renderAreaWiseAnalysisCard = () => {
    const { mslValues, rlValues, labels, wellTypes, depths } = chartData;
    if (!mslValues || mslValues.length === 0) return null;

    // 1. Calculate Topography min/max/average
    const minMsl = Math.min(...mslValues);
    const maxMsl = Math.max(...mslValues);
    const avgMsl = mslValues.reduce((sum, v) => sum + v, 0) / mslValues.length;

    // Determine slope trend (West is index 0, East is last index)
    const midIdx = Math.floor(mslValues.length / 2);
    const westAvgMsl = mslValues.slice(0, Math.max(1, midIdx)).reduce((sum, v) => sum + v, 0) / Math.max(1, midIdx);
    const eastAvgMsl = mslValues.slice(midIdx).reduce((sum, v) => sum + v, 0) / Math.max(1, mslValues.length - midIdx);
    const mslDiff = westAvgMsl - eastAvgMsl;
    let topoTrendText = 'is relatively flat';
    if (mslDiff > 1.5) {
      topoTrendText = 'slopes downward towards the East';
    } else if (mslDiff < -1.5) {
      topoTrendText = 'slopes upward towards the East';
    }

    // 2. Calculate Water Table (RL) average and depths BGL
    const avgRl = rlValues.reduce((sum, v) => sum + v, 0) / rlValues.length;
    
    // Depth BGL values for each station
    const bglDepths = mslValues.map((msl, i) => msl - rlValues[i]);
    const avgBgl = bglDepths.reduce((sum, v) => sum + v, 0) / bglDepths.length;

    // 3. Est. Flow Direction (based on water table Reduced Level - RL)
    const westAvgRl = rlValues.slice(0, Math.max(1, midIdx)).reduce((sum, v) => sum + v, 0) / Math.max(1, midIdx);
    const eastAvgRl = rlValues.slice(midIdx).reduce((sum, v) => sum + v, 0) / Math.max(1, rlValues.length - midIdx);
    const rlDiff = westAvgRl - eastAvgRl;
    let flowDirText = 'Stable / Indeterminate (flat water table)';
    if (rlDiff > 0.3) {
      flowDirText = 'Directed towards the East (West-to-East flow)';
    } else if (rlDiff < -0.3) {
      flowDirText = 'Directed towards the West (East-to-West flow)';
    }

    // 4. Aquifer Vulnerability Index
    let totalDugWells = 0;
    let vulnerableDugWells = 0;
    
    wellTypes.forEach((type, i) => {
      const isDW = (type || '').toLowerCase().trim() === 'dw';
      if (isDW) {
        totalDugWells++;
        const depthVal = parseFloat(depths[i]);
        const currentBgl = bglDepths[i];
        
        // If well bottom is close to or above water table depth
        if (!isNaN(depthVal)) {
          if (depthVal - currentBgl < 2.0) {
            vulnerableDugWells++;
          }
        } else {
          // Fallback dug well depth is 10m
          if (10.0 - currentBgl < 2.0) {
            vulnerableDugWells++;
          }
        }
      }
    });

    let vulnStatus = 'LOW';
    let vulnColor = '#10b981'; // green
    let vulnDesc = 'Active wells are well below the current water table.';
    
    if (totalDugWells > 0) {
      const ratio = vulnerableDugWells / totalDugWells;
      if (ratio > 0.5) {
        vulnStatus = 'HIGH';
        vulnColor = '#ef4444'; // red
        vulnDesc = `${vulnerableDugWells} of ${totalDugWells} dug wells are at high risk of seasonal dry-up.`;
      } else if (ratio > 0) {
        vulnStatus = 'MODERATE';
        vulnColor = '#f59e0b'; // amber
        vulnDesc = `${vulnerableDugWells} of ${totalDugWells} dug wells have water levels near the casing bottom.`;
      } else {
        vulnDesc = `All ${totalDugWells} dug wells are securely penetrating the saturated aquifer.`;
      }
    }

    // 5. Recommendations based on average depth
    let recommendation = '';
    let recommendationIcon = '💡';
    if (avgBgl > 6.0) {
      recommendation = 'Deep unsaturated zone. Ideal for Managed Aquifer Recharge (MAR). Priority zone for constructing recharge shafts, percolation tanks, and rainwater harvesting to capture surface run-off and reverse depletion trends.';
    } else if (avgBgl > 3.0) {
      recommendation = 'Moderate water table depth. Suitable for check dams, contour bunding, and agro-forestry to improve soil moisture retention and prevent erosion while slowly recharging the aquifer.';
      recommendationIcon = '🌱';
    } else {
      recommendation = 'Shallow water table. High risk of localized waterlogging during monsoons. Focus on protecting shallow drinking water sources from surface agricultural/sanitary run-off and monitor for water quality contamination.';
      recommendationIcon = '⚠️';
    }

    return (
      <View style={styles.analysisCard}>
        <Text style={styles.analysisTitle}>📑 Geological & Hydrogeological Analysis</Text>
        
        {/* Topography Section */}
        <View style={styles.analysisRowBorder}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>🏔️ Topography (Ground Level)</Text>
            <Text style={styles.statValue}>
              {minMsl.toFixed(1)}m – {maxMsl.toFixed(1)}m
              <Text style={{ fontSize: 11, fontWeight: 'normal', color: isDark ? '#94a3b8' : '#475569' }}> (Avg: {avgMsl.toFixed(1)}m)</Text>
            </Text>
            <Text style={styles.analysisNote}>Terrain {topoTrendText}.</Text>
          </View>
        </View>

        {/* Aquifer Status Section */}
        <View style={styles.analysisRowBorder}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>💧 Saturated Aquifer & Water Table</Text>
            <Text style={styles.statValue}>
              {avgRl.toFixed(2)}m RL
              <Text style={{ fontSize: 11, fontWeight: 'normal', color: isDark ? '#94a3b8' : '#475569' }}> (Avg Depth: {avgBgl.toFixed(2)}m BGL)</Text>
            </Text>
            <Text style={styles.analysisNote}>Est. Flow: {flowDirText}.</Text>
          </View>
        </View>

        {/* Vulnerability Section */}
        <View style={styles.analysisRowBorder}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>🛡️ Well Vulnerability Risk</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <View style={[styles.statusBadge, { backgroundColor: vulnColor + '20', marginRight: 8, minWidth: 60 }]}>
                <Text style={[styles.statusBadgeText, { color: vulnColor }]}>{vulnStatus}</Text>
              </View>
              <Text style={[styles.statValue, { fontSize: 13, flex: 1 }]} numberOfLines={2}>
                {vulnDesc}
              </Text>
            </View>
          </View>
        </View>

        {/* Actionable Recommendations Section */}
        <View style={styles.analysisRowBorder}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>{recommendationIcon} Research Recommendation</Text>
            <Text style={[styles.tableCell, { fontSize: 12, lineHeight: 16, marginTop: 4, color: isDark ? '#cbd5e1' : '#334155' }]}>
              {recommendation}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderYoYComparisonCard = () => {
    if (availableYears.length < 2) return null;
    const res = comparisonResult;
    if (!res) return null;

    return (
      <View style={styles.analysisCard}>
        <Text style={styles.analysisTitle}>⚖️ Year-over-Year (YoY) Comparison Tool</Text>
        
        {/* Dropdowns row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, marginTop: 8 }}>
          <TouchableOpacity 
            style={[styles.pickerBox, { flex: 1, marginRight: 8, height: 48, justifyContent: 'center' }]} 
            onPress={() => setShowYearAPicker(true)}
          >
            <Text style={styles.pickerLabel}>Year A (Baseline)</Text>
            <Text style={styles.pickerValue}>{compareYearA} ▾</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.pickerBox, { flex: 1, marginLeft: 8, height: 48, justifyContent: 'center' }]} 
            onPress={() => setShowYearBPicker(true)}
          >
            <Text style={styles.pickerLabel}>Year B (Comparison)</Text>
            <Text style={styles.pickerValue}>{compareYearB} ▾</Text>
          </TouchableOpacity>
        </View>

        {/* Results layout */}
        <View style={{ gap: 12 }}>
          {/* Pre-Monsoon comparison */}
          <View style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#334155' : '#cbd5e1' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#fbbf24' : '#b45309', marginBottom: 6 }}>
              ☀️ Pre-Monsoon comparison
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ fontSize: 12, color: isDark ? '#cbd5e1' : '#475569' }}>
                  {compareYearA}: {res.preA !== null && res.preA !== undefined ? `${res.preA.toFixed(2)} m BGL` : 'N/A'}
                </Text>
                <Text style={{ fontSize: 12, color: isDark ? '#cbd5e1' : '#475569' }}>
                  {compareYearB}: {res.preB !== null && res.preB !== undefined ? `${res.preB.toFixed(2)} m BGL` : 'N/A'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 10, color: isDark ? '#94a3b8' : '#64748b' }}>Change</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: res.preColor }}>
                  {res.preDirection || 'N/A'}
                </Text>
              </View>
            </View>
          </View>

          {/* Post-Monsoon comparison */}
          <View style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#334155' : '#cbd5e1' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#10b981' : '#047857', marginBottom: 6 }}>
              🌧️ Post-Monsoon comparison
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ fontSize: 12, color: isDark ? '#cbd5e1' : '#475569' }}>
                  {compareYearA}: {res.postA !== null && res.postA !== undefined ? `${res.postA.toFixed(2)} m BGL` : 'N/A'}
                </Text>
                <Text style={{ fontSize: 12, color: isDark ? '#cbd5e1' : '#475569' }}>
                  {compareYearB}: {res.postB !== null && res.postB !== undefined ? `${res.postB.toFixed(2)} m BGL` : 'N/A'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 10, color: isDark ? '#94a3b8' : '#64748b' }}>Change</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: res.postColor }}>
                  {res.postDirection || 'N/A'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.analysisNote}>
          * Note: Water level depths are measured in meters BGL. Sinking levels (increase in depth) represent depletion, while rising levels (decrease in depth) represent recovery.
        </Text>
      </View>
    );
  };

  const renderMannKendallCard = () => {
    const { s, z, pValue, sensSlope, trendText, trendColor, isSignificant } = mkResult;

    return (
      <View style={styles.analysisCard}>
        <Text style={styles.analysisTitle}>📉 Mann-Kendall & Sen's Slope Analysis</Text>
        <View style={styles.analysisRow}>
          <View style={styles.analysisCol}>
            <Text style={styles.statLabel}>Trend Direction</Text>
            <Text style={[styles.statValue, { color: trendColor }]}>{trendText}</Text>
          </View>
          <View style={styles.analysisCol}>
            <Text style={styles.statLabel}>Sen's Slope</Text>
            <Text style={styles.statValue}>
              {sensSlope > 0 ? `+${sensSlope.toFixed(3)}` : sensSlope.toFixed(3)} m/step
            </Text>
          </View>
        </View>
        <View style={styles.analysisRowBorder}>
          <View style={styles.analysisSubCol}>
            <Text style={styles.subStatLabel}>S-Stat</Text>
            <Text style={styles.subStatValue}>{s > 0 ? `+${s}` : s}</Text>
          </View>
          <View style={styles.analysisSubCol}>
            <Text style={styles.subStatLabel}>Z-Score</Text>
            <Text style={styles.subStatValue}>{z > 0 ? `+${z}` : z}</Text>
          </View>
          <View style={styles.analysisSubCol}>
            <Text style={styles.subStatLabel}>P-Value</Text>
            <Text style={styles.subStatValue}>{pValue}</Text>
          </View>
          <View style={styles.analysisSubCol}>
            <Text style={styles.subStatLabel}>Confidence</Text>
            <Text style={[styles.subStatValue, { color: isSignificant ? '#059669' : '#64748b' }]}>
              {isSignificant ? 'Significant' : 'Not Sig.'}
            </Text>
          </View>
        </View>
        <Text style={styles.analysisNote}>
          * Note: A positive slope indicates groundwater levels are deepening (depletion), whereas a negative slope indicates water levels are rising (recovery).
        </Text>
      </View>
    );
  };

  const generateTextReport = () => {
    const normBlock = selectedBlock !== 'All Blocks' ? normalizeBlockName(selectedBlock) : 'All Blocks';
    const { s, z, pValue, sensSlope, trendText, isSignificant } = mkResult;

    // Calculate forecast values for 2036 and 2047
    let proj2036 = 'N/A';
    let proj2047 = 'N/A';

    const labels = chartData.labels;
    const trendValues = chartData.trendLine || [];

    if (displayMode === 'fluctuation' || displayMode === 'annual') {
      const idx2036 = labels.indexOf('2036');
      const idx2047 = labels.indexOf('2047');
      if (idx2036 !== -1 && trendValues[idx2036] !== undefined && trendValues[idx2036] !== null) proj2036 = `${trendValues[idx2036]} m`;
      if (idx2047 !== -1 && trendValues[idx2047] !== undefined && trendValues[idx2047] !== null) proj2047 = `${trendValues[idx2047]} m`;
    } else {
      // Depth BGL mode (seasonal): find the winter season of 2036 and 2047
      const idx2036 = labels.findIndex(l => l.includes('2036'));
      const idx2047 = labels.findIndex(l => l.includes('2047'));
      if (idx2036 !== -1 && trendValues[idx2036] !== undefined && trendValues[idx2036] !== null) proj2036 = `${trendValues[idx2036]} m`;
      if (idx2047 !== -1 && trendValues[idx2047] !== undefined && trendValues[idx2047] !== null) proj2047 = `${trendValues[idx2047]} m`;
    }

    // Determine Outlook Guidance based on Sen's Slope
    let outlookTitle = 'Stable';
    let outlookText = 'Aquifer levels are balanced with current recharge and extraction. Current usage levels are sustainable.';
    
    if (sensSlope > 0) {
      outlookTitle = 'Critical (Depleting)';
      outlookText = 'Groundwater table is deepening. Sustainable groundwater management, artificial recharge structures (like check dams, ponds, or recharge shafts), and monitored extraction are strongly recommended.';
    } else if (sensSlope < 0) {
      outlookTitle = 'Positive (Recovering)';
      outlookText = 'Groundwater table is rising closer to the surface. Aquifer recharge rates exceed extraction rates, representing healthy groundwater accumulation.';
    }

    const modeTitle = displayMode === 'depth' 
      ? 'Depth to Water Table (Seasonal)' 
      : displayMode === 'annual' 
        ? 'Annual Average Water Level' 
        : 'Annual Seasonal Fluctuation';

    // Find the latest valid historical data point (excluding forecast years)
    let latestValue = 'N/A';
    let latestLabel = 'N/A';
    const rawVals = chartData.values || [];
    const rawLabels = chartData.labels || [];
    
    for (let i = rawVals.length - 1; i >= 0; i--) {
      const val = rawVals[i];
      const label = rawLabels[i] || '';
      const isForecast = label.includes('2036') || label.includes('2047');
      if (val !== null && val !== undefined && !isNaN(val) && !isForecast) {
        latestValue = `${val.toFixed(2)} meters`;
        latestLabel = label;
        break;
      }
    }

    // Classify current water level status
    let statusClass = 'N/A';
    if (latestValue !== 'N/A') {
      const numVal = parseFloat(latestValue);
      if (displayMode === 'fluctuation') {
        if (numVal < 0) statusClass = 'Decline (Negative Recharge)';
        else if (numVal < 0.5) statusClass = 'Low Fluctuation (Stable)';
        else if (numVal < 2.0) statusClass = 'Moderate Recharge (Good)';
        else statusClass = 'High Recharge (Excellent)';
      } else {
        if (numVal < 2.0) statusClass = 'Shallow Level (Excellent)';
        else if (numVal < 4.0) statusClass = 'Moderate Depth (Stable)';
        else if (numVal < 6.0) statusClass = 'Medium Depth (Watch)';
        else if (numVal < 8.0) statusClass = 'Deep Water Level (Alert)';
        else statusClass = 'Very Deep / Depleted (Critical)';
      }
    }

    // Build customized summary text
    let executiveSummary = '';
    if (selectedStation !== 'All Stations') {
      executiveSummary = `This report analyzes the groundwater level trends at Station "${selectedStation}" located in Block "${normBlock}" of District "${selectedDist}". The latest seasonal water level recorded is ${latestValue} during ${latestLabel}, classified as ${statusClass}.`;
    } else if (selectedBlock !== 'All Blocks') {
      executiveSummary = `This report analyzes the combined average groundwater levels across Block "${normBlock}" in District "${selectedDist}". The latest combined block-level average is ${latestValue} during ${latestLabel}, classified as ${statusClass}.`;
    } else {
      executiveSummary = `This report analyzes the division-level combined average groundwater levels across all blocks in District "${selectedDist}". The latest district-level combined average is ${latestValue} during ${latestLabel}, classified as ${statusClass}.`;
    }

    // Lookup GWRA geological parameters
    const blockKey = selectedBlock !== 'All Blocks' 
      ? selectedBlock.toUpperCase().replace(/[^A-Z]/g, '') 
      : null;
    const blockGwra = blockKey ? gwraData[blockKey] : null;

    let gwraSummaryText = '';
    if (selectedBlock === 'All Blocks') {
      const blocksInDist = Object.values(gwraData).filter(
        b => b.district === selectedDist.toUpperCase()
      );
      if (blocksInDist.length > 0) {
        const sumYield = blocksInDist.reduce((acc, curr) => acc + curr.specificYield, 0);
        const sumRif = blocksInDist.reduce((acc, curr) => acc + curr.rainfallInfiltrationFactor, 0);
        const avgYield = (sumYield / blocksInDist.length).toFixed(2);
        const avgRif = (sumRif / blocksInDist.length).toFixed(2);
        const aquifersCount = {};
        blocksInDist.forEach(b => {
          aquifersCount[b.aquifer] = (aquifersCount[b.aquifer] || 0) + 1;
        });
        const sortedAquifers = Object.entries(aquifersCount)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => `${name} (${count})`)
          .join(', ');
        
        gwraSummaryText = `- Predominant Aquifers   : ${sortedAquifers}
- Avg Specific Yield     : ${avgYield}%
- Avg Rainfall Infil. Ftr : ${avgRif}%`;
      } else {
        gwraSummaryText = `- Geological Data        : N/A (No records found for ${selectedDist})`;
      }
    } else if (blockGwra) {
      gwraSummaryText = `- Principal Aquifer Type : ${blockGwra.aquifer}
- Specific Yield (%)     : ${blockGwra.specificYield}%
- Rainfall Infil. Factor  : ${blockGwra.rainfallInfiltrationFactor}%`;
    } else {
      gwraSummaryText = `- Geological Data        : N/A (No block records found for ${normBlock})`;
    }

    return `================================================
GROUNDWATER STATUS & FORECAST REPORT
================================================
Generated On : ${new Date().toLocaleDateString('en-GB')}
Target Level : ${selectedStation !== 'All Stations' ? `Station ${selectedStation}` : selectedBlock !== 'All Blocks' ? `Block ${normBlock}` : `District ${selectedDist}`}
District     : ${selectedDist}
Block        : ${normBlock}
Analysis Mode: ${modeTitle}
------------------------------------------------

1. EXECUTIVE WATER LEVEL SUMMARY
* ${executiveSummary}

- Latest Observed Value    : ${latestValue !== 'N/A' ? `${latestValue} (${latestLabel})` : 'N/A'}
- Current Classification   : ${statusClass}
- Selection Average (Mean) : ${stats.mean !== 'N/A' ? `${stats.mean} meters` : 'N/A'}

* Interpretation: The selection average represents the overall baseline water level. Comparing the latest observed value to the historical average shows whether water levels are currently above or below normal baseline levels.

------------------------------------------------

2. GEOLOGICAL & AQUIFER DATA (CGWB GWRA 2025)
${gwraSummaryText}

* Interpretation: Specific Yield (%) indicates the percentage of volume of water that can be drained from a saturated aquifer rock. Rainfall Infiltration Factor (%) is the proportion of rainfall that penetrates the soil to recharge the groundwater.

------------------------------------------------

3. DESCRIPTIVE STATISTICS
- Mean (Average) Level    : ${stats.mean !== 'N/A' ? `${stats.mean} meters` : 'N/A'}
- Median Level            : ${stats.median !== 'N/A' ? `${stats.median} meters` : 'N/A'}
- Std Deviation           : ${stats.stdDev !== 'N/A' ? `${stats.stdDev} meters` : 'N/A'}

* Interpretation: Mean shows central water level. Standard Deviation represents water table variability; higher values indicate strong seasonal fluctuations between monsoon and summer.

------------------------------------------------

4. TREND ANALYSIS (MANN-KENDALL TEST)
- Trend Direction    : ${trendText}
- Sen's Slope        : ${sensSlope > 0 ? `+${sensSlope.toFixed(4)}` : sensSlope.toFixed(4)} m/step
- S-Statistic        : ${s > 0 ? `+${s}` : s}
- Z-Score            : ${z > 0 ? `+${z}` : z}
- P-Value            : ${pValue}
- Significance       : ${isSignificant ? 'Statistically Significant (alpha = 0.05)' : 'Not Statistically Significant'}

* Interpretation: A positive Sen's Slope indicates water levels are sinking deeper (depletion), while a negative slope indicates water levels are rising (recovery). Significance confirms whether the trend is strong and consistent.

------------------------------------------------

5. FUTURE TREND PROJECTION (REGRESSION)
- 2036 Projection    : ${proj2036} BGL
- 2047 Projection    : ${proj2047} BGL

- Outlook Guidance   : ${outlookTitle}
  ${outlookText}

================================================
Developed by ssd_dev | GWD Cuttack Division
================================================`;
  };

  const handleShareReport = async () => {
    try {
      const content = generateTextReport();
      const cleanTarget = selectedStation !== 'All Stations' 
        ? selectedStation 
        : selectedBlock !== 'All Blocks' 
          ? selectedBlock.replace(/\s+/g, '_') 
          : selectedDist;
      const filename = `GW_Report_${cleanTarget}_${new Date().toISOString().split('T')[0]}.txt`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, content, { encoding: 'utf8' });
      
      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (isSharingAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/plain',
          dialogTitle: `Share Groundwater Report for ${cleanTarget}`,
          UTI: 'public.text'
        });
      } else {
        Alert.alert("Report Exported", `Report saved successfully at:\n${fileUri}`);
      }
    } catch (err) {
      Alert.alert("Share Failed", err.message);
    }
  };

  const renderReportModal = () => {
    const reportText = generateTextReport();
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 120, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }]}>
        <View style={{
          width: '90%',
          height: '80%',
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#cbd5e1',
          overflow: 'hidden'
        }}>
          {/* Modal Header */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? '#334155' : '#cbd5e1',
            backgroundColor: isDark ? '#0f172a' : '#f8fafc'
          }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: isDark ? '#f8fafc' : '#0f172a' }}>
              📝 Groundwater Status & Forecast Report
            </Text>
            <TouchableOpacity onPress={() => setShowReportModal(false)}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#ef4444' }}>Close</Text>
            </TouchableOpacity>
          </View>
          
          {/* Scrollable Report content */}
          <ScrollView style={{ flex: 1, padding: 16 }}>
            <Text style={{
              fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
              fontSize: 12,
              color: isDark ? '#cbd5e1' : '#1e293b',
              lineHeight: 18
            }}>
              {reportText}
            </Text>
          </ScrollView>

          {/* Modal Footer actions */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: isDark ? '#334155' : '#cbd5e1',
            backgroundColor: isDark ? '#0f172a' : '#f8fafc'
          }}>
            <TouchableOpacity 
              style={{
                flex: 1,
                backgroundColor: isDark ? '#334155' : '#e2e8f0',
                paddingVertical: 12,
                borderRadius: 8,
                alignItems: 'center',
                marginRight: 8
              }}
              onPress={() => setShowReportModal(false)}
            >
              <Text style={{ color: isDark ? '#f8fafc' : '#0f172a', fontWeight: '700', fontSize: 13 }}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={{
                flex: 1.5,
                backgroundColor: '#0284c7',
                paddingVertical: 12,
                borderRadius: 8,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center'
              }}
              onPress={handleShareReport}
            >
              <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>
                📤 Share Report
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {onClose && (
            <TouchableOpacity style={styles.backBtn} onPress={onClose}>
              <Text style={styles.backBtnText}>✕ Close</Text>
            </TouchableOpacity>
          )}
          <View style={{ marginLeft: onClose ? 12 : 0 }}>
            <Text style={styles.title}>Groundwater Trends</Text>
            <Text style={styles.subtitle}>Historical BGL data analysis</Text>
          </View>
        </View>
        {!onClose && (
          <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
            <Text style={styles.themeToggleIcon}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Selectors Panel */}
      <View style={styles.selectorsCard}>
        <View style={styles.selectorRow}>
          {/* District Selector */}
          <TouchableOpacity 
            style={styles.pickerBox} 
            onPress={() => setShowDistPicker(true)}
            accessibilityRole="combobox"
            accessibilityLabel={`District select, currently set to ${selectedDist}`}
          >
            <Text style={styles.pickerLabel}>District/ULB</Text>
            <Text style={styles.pickerValue} numberOfLines={1}>{selectedDist} ▾</Text>
          </TouchableOpacity>

          {/* Block Selector */}
          <TouchableOpacity 
            style={styles.pickerBox} 
            onPress={() => setShowBlockPicker(true)}
            accessibilityRole="combobox"
            accessibilityLabel={`Block select, currently set to ${selectedBlock}`}
          >
            <Text style={styles.pickerLabel}>Block</Text>
            <Text style={styles.pickerValue} numberOfLines={1}>{selectedBlock} ▾</Text>
          </TouchableOpacity>

          {/* Station Selector */}
          <TouchableOpacity 
            style={styles.pickerBox} 
            onPress={() => setShowStationPicker(true)}
            accessibilityRole="combobox"
            accessibilityLabel={`Station select, currently set to ${selectedStation}`}
          >
            <Text style={styles.pickerLabel}>Station</Text>
            <Text style={styles.pickerValue} numberOfLines={1}>
              {selectedStation === 'All Stations' ? 'All Stations' : selectedStation} ▾
            </Text>
          </TouchableOpacity>
        </View>

        {/* Toggle Button for Options */}
        <TouchableOpacity 
          style={styles.toggleOptionsBtn} 
          onPress={() => setShowChartOptions(!showChartOptions)}
          accessibilityRole="button"
          accessibilityLabel={showChartOptions ? 'Hide chart configuration options' : 'Show chart configuration options'}
        >
          <Text style={styles.toggleOptionsBtnText}>
            {showChartOptions ? 'Hide Chart Options ▴' : 'Show Chart Options ▾'}
          </Text>
        </TouchableOpacity>

        {showChartOptions && (
          <View style={{ marginTop: 6, paddingBottom: 6 }}>
            {/* Time range selection */}
            <View style={styles.optionSection}>
              <Text style={styles.optionLabel}>Historical View</Text>
              <View style={styles.optionBtnRow}>
                {[
                  ['5', 'Last 5Y'],
                  ['10', 'Last 10Y'],
                  ['all', 'All Years'],
                  ['1997', 'From 1997']
                ].map(([val, label]) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.optionBtn, timeRange === val && styles.optionBtnActive]}
                    onPress={() => setTimeRange(val)}
                    accessibilityRole="button"
                    accessibilityLabel={`Set historical view to ${label}`}
                    accessibilityState={{ selected: timeRange === val }}
                  >
                    <Text style={[styles.optionBtnText, timeRange === val && styles.optionBtnTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Display Mode selection */}
            <View style={styles.optionSection}>
              <Text style={styles.optionLabel}>Display Mode</Text>
              <View style={styles.optionBtnRow}>
                {[
                  ['depth', 'Seasonal BGL'],
                  ['annual', 'Annual Avg'],
                  ['fluctuation', 'Fluctuation'],
                  ['pre_vs_post', 'Pre vs Post'],
                  ['elevation', 'Cross-Section'],
                  ['elevation_3d', '3D Section']
                ].map(([val, label]) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.optionBtn, displayMode === val && styles.optionBtnActive]}
                    onPress={() => {
                      if (val === 'elevation' || val === 'elevation_3d') {
                        setSelectedStation('All Stations');
                      }
                      setDisplayMode(val);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Set display mode to ${label}`}
                    accessibilityState={{ selected: displayMode === val }}
                  >
                    <Text style={[styles.optionBtnText, displayMode === val && styles.optionBtnTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Future Projection selection */}
            <View style={styles.optionSection}>
              <Text style={styles.optionLabel}>Future Projection</Text>
              <View style={styles.optionBtnRow}>
                {[
                  ['none', 'None'],
                  ['2036', '2036 Forecast'],
                  ['2047', '2047 Forecast']
                ].map(([val, label]) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.optionBtn, forecastMode === val && styles.optionBtnActive]}
                    onPress={() => setForecastMode(val)}
                    accessibilityRole="button"
                    accessibilityLabel={`Set future projection to ${label}`}
                    accessibilityState={{ selected: forecastMode === val }}
                  >
                    <Text style={[styles.optionBtnText, forecastMode === val && styles.optionBtnTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Chart style selection */}
            <View style={styles.optionSection}>
              <Text style={styles.optionLabel}>Chart Type</Text>
              <View style={styles.optionBtnRow}>
                {[
                  ['line', 'Line'],
                  ['bar', 'Bar'],
                  ['histogram', 'Histogram']
                ].map(([val, label]) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.optionBtn, chartType === val && styles.optionBtnActive]}
                    onPress={() => setChartType(val)}
                    accessibilityRole="button"
                    accessibilityLabel={`Set chart type to ${label}`}
                    accessibilityState={{ selected: chartType === val }}
                  >
                    <Text style={[styles.optionBtnText, chartType === val && styles.optionBtnTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Rainfall toggle */}
            <View style={styles.optionSection}>
              <Text style={styles.optionLabel}>Rainfall Overlay</Text>
              <View style={styles.optionBtnRow}>
                {[[true, 'Enabled'], [false, 'Disabled']].map(([val, label]) => (
                  <TouchableOpacity
                    key={val.toString()}
                    style={[styles.optionBtn, showRainfall === val && styles.optionBtnActive]}
                    onPress={() => setShowRainfall(val)}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} rainfall overlay`}
                    accessibilityState={{ selected: showRainfall === val }}
                  >
                    <Text style={[styles.optionBtnText, showRainfall === val && styles.optionBtnTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

          </View>
        )}
      </View>

      {/* Scrollable Content Area */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Chart Canvas Area */}
        <View style={styles.chartFrame}>
          <View style={{ marginBottom: 12, paddingHorizontal: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <Text style={[styles.chartTitle, { flex: 1, marginRight: 8 }]} numberOfLines={2}>
                {chartData.title}
              </Text>
              {(displayMode === 'depth' || displayMode === 'annual') && (
                <Text style={styles.invertedBadge}>Inverted Axis ⇵</Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' }}>
              <TouchableOpacity style={styles.exportIconBtn} onPress={handleExportCSV}>
                <Text style={styles.exportIconBtnText}>📄 CSV Export</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.exportIconBtn, { marginLeft: 6 }]} onPress={handleExportImage}>
                <Text style={styles.exportIconBtnText}>📸 Save Image</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.exportIconBtn, { marginLeft: 6, backgroundColor: '#0284c7', borderColor: '#0284c7' }]} onPress={() => setShowReportModal(true)}>
                <Text style={[styles.exportIconBtnText, { color: '#ffffff' }]}>📝 Generate Report</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 350, borderRadius: 12, overflow: 'hidden' }}>
            <WebView
              ref={webviewRef}
              originWhitelist={['*']}
              source={{ html: chartHtml }}
              style={styles.webview}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              allowFileAccess={true}
              allowUniversalAccessFromFileURLs={true}
              allowFileAccessFromFileURLs={true}
              onMessage={handleWebViewMessage}
            />
          </View>
        </View>

        {/* Mann-Kendall Statistical Analysis */}
        {displayMode !== 'elevation' && displayMode !== 'elevation_3d' && renderMannKendallCard()}

        {/* Descriptive Statistics */}
        {displayMode !== 'elevation' && displayMode !== 'elevation_3d' && renderDescriptiveStatsCard()}

        {/* Geological & Aquifer Context */}
        {renderAquiferContextCard()}

        {/* Structured Data Table */}
        {displayMode === 'fluctuation' ? (
          <View style={styles.tableCard}>
            <Text style={styles.tableTitle}>📋 Annual Fluctuation Table</Text>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>Year</Text>
              <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Pre-Mon</Text>
              <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Post-Mon</Text>
              <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Fluct. (m)</Text>
              <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.4, textAlign: 'center' }]}>Recharge</Text>
            </View>
            {fluctuationTableData.map((row, idx) => {
              const val = row.fluctuation;
              let statusText = 'N/A';
              let statusColor = '#94a3b8';
              let statusBg = 'rgba(148,163,184,0.1)';
              
              if (val !== null && val !== undefined) {
                if (val > 2.0) {
                  statusText = 'High';
                  statusColor = '#10b981';
                  statusBg = 'rgba(16,185,129,0.15)';
                } else if (val > 0.5) {
                  statusText = 'Moderate';
                  statusColor = '#3b82f6';
                  statusBg = 'rgba(59,130,246,0.15)';
                } else if (val >= 0.0) {
                  statusText = 'Low';
                  statusColor = '#eab308';
                  statusBg = 'rgba(234,179,8,0.15)';
                } else {
                  statusText = 'Negative';
                  statusColor = '#ef4444';
                  statusBg = 'rgba(239,68,68,0.15)';
                }
              }
              
              return (
                <View key={idx} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{row.year}</Text>
                  <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'right', color: isDark ? '#f8fafc' : '#0f172a' }]}>
                    {row.pre !== undefined ? `${row.pre.toFixed(2)}` : '-'}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'right', color: isDark ? '#f8fafc' : '#0f172a' }]}>
                    {row.post !== undefined ? `${row.post.toFixed(2)}` : '-'}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'right', fontWeight: '700', color: isDark ? '#f8fafc' : '#0f172a' }]}>
                    {val !== null ? `${val > 0 ? '+' : ''}${val.toFixed(2)} m` : '-'}
                  </Text>
                  <View style={{ flex: 1.4, alignItems: 'center' }}>
                    <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusText}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : displayMode === 'annual' ? (
          <View style={styles.tableCard}>
            <Text style={styles.tableTitle}>📋 Annual Averages Table</Text>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>Year</Text>
              <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Average BGL Depth</Text>
              <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.5, textAlign: 'center' }]}>Status</Text>
            </View>
            {chartData.labels.map((year, idx) => {
              const val = chartData.values[idx];
              if (val === null || val === undefined) return null; // hide future forecast projections from table
              let statusText = 'Unknown';
              let statusColor = '#94a3b8';
              let statusBg = 'rgba(148,163,184,0.1)';
              
              if (val !== undefined && val !== null) {
                if (val < 2.0) {
                  statusText = 'Shallow';
                  statusColor = '#3b82f6';
                  statusBg = 'rgba(59,130,246,0.15)';
                } else if (val < 4.0) {
                  statusText = 'Moderate';
                  statusColor = '#10b981';
                  statusBg = 'rgba(16,185,129,0.15)';
                } else if (val < 6.0) {
                  statusText = 'Medium';
                  statusColor = '#eab308';
                  statusBg = 'rgba(234,179,8,0.15)';
                } else if (val < 8.0) {
                  statusText = 'Deep';
                  statusColor = '#ea580c';
                  statusBg = 'rgba(234,88,12,0.15)';
                } else {
                  statusText = 'Depleted';
                  statusColor = '#ef4444';
                  statusBg = 'rgba(239,68,68,0.15)';
                }
              }
              
              return (
                <View key={idx} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{year}</Text>
                  <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right', fontWeight: '700', color: isDark ? '#f8fafc' : '#0f172a' }]}>
                    {val !== undefined && val !== null ? `${val.toFixed(2)} m` : '-'}
                  </Text>
                  <View style={{ flex: 1.5, alignItems: 'center' }}>
                    <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusText}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : displayMode === 'pre_vs_post' ? (
          <View style={{ width: '100%' }}>
            <View style={styles.tableCard}>
              <Text style={styles.tableTitle}>⚖️ Pre vs Post-Monsoon Table</Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>Year</Text>
                <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Pre-Mon</Text>
                <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Post-Mon</Text>
                <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Fluctuation</Text>
              </View>
              {fluctuationTableData.map((row, idx) => {
                const val = row.fluctuation;
                return (
                  <View key={idx} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={[styles.tableCell, { flex: 1 }]}>{row.year}</Text>
                    <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'right', color: isDark ? '#f8fafc' : '#0f172a' }]}>
                      {row.pre !== undefined && row.pre !== null ? `${row.pre.toFixed(2)} m` : '-'}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'right', color: isDark ? '#f8fafc' : '#0f172a' }]}>
                      {row.post !== undefined && row.post !== null ? `${row.post.toFixed(2)} m` : '-'}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right', fontWeight: '700', color: val === null ? '#64748b' : (val < 0 ? '#ef4444' : '#10b981') }]}>
                      {val !== null ? `${val > 0 ? '+' : ''}${val.toFixed(2)} m` : '-'}
                    </Text>
                  </View>
                );
              })}
            </View>
            {renderYoYComparisonCard()}
          </View>
        ) : (displayMode === 'elevation' || displayMode === 'elevation_3d') ? (
          <View style={{ width: '100%' }}>
            {renderAreaWiseAnalysisCard()}
            <View style={styles.tableCard}>
              <Text style={styles.tableTitle}>⛰️ Topography & Water Table Elevation Table</Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 2 }]}>Station</Text>
                <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>GL (MSL)</Text>
                <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>WT (RL)</Text>
                <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Depth (BGL)</Text>
              </View>
              {(chartData.wellIds || []).map((id, idx) => {
                const mslVal = chartData.mslValues[idx];
                const rlVal = chartData.rlValues[idx];
                const name = chartData.labels[idx];
                const well = wellsData.find(w => w.well_number === id);
                const bglVal = well ? getLatestWaterLevel(well, visitsHistory) : null;
                
                return (
                  <View key={id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1} ellipsizeMode="tail">
                      {name}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'right', color: isDark ? '#f8fafc' : '#0f172a' }]}>
                      {mslVal != null ? `${mslVal.toFixed(2)} m` : '-'}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'right', color: '#38bdf8', fontWeight: '600' }]}>
                      {rlVal != null ? `${rlVal.toFixed(2)} m` : '-'}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'right', color: isDark ? '#f8fafc' : '#0f172a' }]}>
                      {bglVal != null ? `${bglVal.toFixed(2)} m` : '-'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.tableCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.tableTitle}>📋 Historical Records Table</Text>
            </View>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.5 }]}>Season</Text>
              <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Depth (BGL)</Text>
              <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1.5, textAlign: 'center' }]}>Status</Text>
            </View>
            {chartData.labels.map((label, idx) => {
              const val = chartData.values[idx];
              if (val === null || val === undefined) return null; // hide future forecast projections from table
              let statusText = 'Unknown';
              let statusColor = '#94a3b8';
              let statusBg = 'rgba(148,163,184,0.1)';
              
              if (val !== undefined && val !== null) {
                if (val < 2.0) {
                  statusText = 'Shallow';
                  statusColor = '#3b82f6';
                  statusBg = 'rgba(59,130,246,0.15)';
                } else if (val < 4.0) {
                  statusText = 'Moderate';
                  statusColor = '#10b981';
                  statusBg = 'rgba(16,185,129,0.15)';
                } else if (val < 6.0) {
                  statusText = 'Medium';
                  statusColor = '#eab308';
                  statusBg = 'rgba(234,179,8,0.15)';
                } else if (val < 8.0) {
                  statusText = 'Deep';
                  statusColor = '#ea580c';
                  statusBg = 'rgba(234,88,12,0.15)';
                } else {
                  statusText = 'Depleted';
                  statusColor = '#ef4444';
                  statusBg = 'rgba(239,68,68,0.15)';
                }
              }

              return (
                <View key={idx} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                  <Text style={[styles.tableCell, { flex: 1.5 }]}>{label}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontWeight: '700', color: isDark ? '#f8fafc' : '#0f172a' }]}>
                    {val !== undefined && val !== null ? `${val.toFixed(2)} m` : '-'}
                  </Text>
                  <View style={{ flex: 1.5, alignItems: 'center' }}>
                    <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusText}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Report Modal */}
      {showReportModal && renderReportModal()}

      {/* pickers overlays */}
      {/* 1. District Picker Modal */}
      {showDistPicker && renderModalPicker("Select District/ULB", districts, selectedDist, (val) => {
        setSelectedDist(val);
        setShowDistPicker(false);
      }, () => setShowDistPicker(false))}

      {/* 2. Block Picker Modal */}
      {showBlockPicker && renderModalPicker("Select Block", ['All Blocks', ...blocks], selectedBlock, (val) => {
        setSelectedBlock(val);
        setShowBlockPicker(false);
      }, () => setShowBlockPicker(false))}

      {/* 3. Station Picker Modal */}
      {showStationPicker && renderModalPicker(
        "Select Station ID", 
        ['All Stations', ...stations.map(s => s.well_number)], 
        selectedStation, 
        (val) => {
          setSelectedStation(val);
          setShowStationPicker(false);
        }, 
        () => setShowStationPicker(false)
      )}

      {/* 4. YoY Year A Picker Modal */}
      {showYearAPicker && renderModalPicker("Select Year A", availableYears, compareYearA, (val) => {
        setCompareYearA(val);
        setShowYearAPicker(false);
      }, () => setShowYearAPicker(false))}

      {/* 5. YoY Year B Picker Modal */}
      {showYearBPicker && renderModalPicker("Select Year B", availableYears, compareYearB, (val) => {
        setCompareYearB(val);
        setShowYearBPicker(false);
      }, () => setShowYearBPicker(false))}
    </SafeAreaView>
  );

  function renderModalPicker(title, itemsList, selectedVal, onSelect, onHide) {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 100, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }]}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onHide} />
        <View style={styles.pickerModalContainer}>
          <View style={styles.pickerModalHeader}>
            <Text style={styles.pickerModalTitle}>{title}</Text>
            <TouchableOpacity onPress={onHide}>
              <Text style={styles.pickerModalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
            {itemsList.map(item => {
              const isSelected = item === selectedVal;
              return (
                <TouchableOpacity
                  key={item}
                  style={[styles.pickerModalRow, isSelected && styles.pickerModalRowActive]}
                  onPress={() => onSelect(item)}
                >
                  <Text style={[styles.pickerModalRowText, isSelected && styles.pickerModalRowTextActive]}>
                    {item}
                  </Text>
                  {isSelected && <Text style={{ color: '#38bdf8', fontWeight: 'bold' }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    );
  }
}

const getStyles = (theme) => {
  const isDark = theme === 'dark';
  const colors = {
    bgApp: isDark ? '#0f172a' : '#f1f5f9',
    bgCard: isDark ? '#1e293b' : '#ffffff',
    borderColor: isDark ? '#334155' : '#cbd5e1',
    textPrimary: isDark ? '#f8fafc' : '#0f172a',
    textSecondary: isDark ? '#94a3b8' : '#475569',
    accent: '#38bdf8',
    cardInner: isDark ? '#0f172a' : '#f8fafc'
  };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgApp,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
    },
    backBtn: {
      backgroundColor: isDark ? '#334155' : '#e2e8f0',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
    },
    backBtnText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '700',
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
      marginTop: 2,
    },
    themeToggle: {
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 20,
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    themeToggleIcon: {
      fontSize: 16,
    },
    selectorsCard: {
      backgroundColor: colors.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
      padding: 14,
    },
    selectorRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    pickerBox: {
      flex: 1,
      backgroundColor: colors.cardInner,
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 8,
      minHeight: 52,
      justifyContent: 'center',
      marginHorizontal: 4,
    },
    toggleOptionsBtn: {
      backgroundColor: colors.cardInner,
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 8,
      minHeight: 48,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 10,
      marginHorizontal: 4,
    },
    toggleOptionsBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#38bdf8',
    },
    pickerLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    pickerValue: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    timeRangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      paddingHorizontal: 4,
    },
    timeRangeLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    timeRangeBtns: {
      flexDirection: 'row',
    },
    timeBtn: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.borderColor,
      marginLeft: 6,
      backgroundColor: colors.cardInner,
    },
    timeBtnActive: {
      backgroundColor: '#1d4ed8',
      borderColor: '#3b82f6',
    },
    timeBtnText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    timeBtnTextActive: {
      color: '#ffffff',
    },
    optionSection: {
      marginTop: 14,
      paddingHorizontal: 4,
    },
    optionLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    optionBtnRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    optionBtn: {
      minHeight: 48,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.borderColor,
      marginRight: 8,
      marginBottom: 8,
      backgroundColor: colors.cardInner,
    },
    optionBtnActive: {
      backgroundColor: '#1d4ed8',
      borderColor: '#3b82f6',
    },
    optionBtnText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    optionBtnTextActive: {
      color: '#ffffff',
      fontWeight: '700',
    },
    chartFrame: {
      flex: 1,
      padding: 12,
    },
    chartTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    chartTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    invertedBadge: {
      fontSize: 10,
      fontWeight: '700',
      color: '#059669',
      backgroundColor: isDark ? 'rgba(5, 150, 105, 0.15)' : 'rgba(5, 150, 105, 0.1)',
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 4,
    },
    webview: {
      flex: 1,
      backgroundColor: 'transparent',
      borderRadius: 12,
      overflow: 'hidden',
    },
    exportIconBtn: {
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 6,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    exportIconBtnText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    analysisCard: {
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 12,
      marginHorizontal: 16,
      marginTop: 16,
      padding: 14,
    },
    analysisTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    analysisRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    analysisCol: {
      flex: 1,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    statValue: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    analysisRowBorder: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: colors.borderColor,
      paddingTop: 10,
      marginBottom: 8,
    },
    analysisSubCol: {
      flex: 1,
      alignItems: 'center',
    },
    subStatLabel: {
      fontSize: 9,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    subStatValue: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    analysisNote: {
      fontSize: 9,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginTop: 4,
    },
    tableCard: {
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 12,
      marginHorizontal: 16,
      marginTop: 16,
      padding: 14,
    },
    tableTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    tableHeaderRow: {
      flexDirection: 'row',
      borderBottomWidth: 1.5,
      borderBottomColor: colors.borderColor,
      paddingBottom: 8,
      marginBottom: 4,
    },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.borderColor,
    },
    tableRowAlt: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.01)',
    },
    tableCell: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    tableHeaderCell: {
      fontWeight: '800',
      color: colors.textPrimary,
    },
    statusBadge: {
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 6,
      minWidth: 75,
      alignItems: 'center',
    },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    pickerModalContainer: {
      backgroundColor: colors.bgCard,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 16,
      paddingBottom: 24,
      borderTopWidth: 1,
      borderTopColor: colors.borderColor,
    },
    pickerModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
    },
    pickerModalTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    pickerModalClose: {
      fontSize: 14,
      fontWeight: '700',
      color: '#38bdf8',
    },
    pickerModalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 22,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.borderColor,
    },
    pickerModalRowActive: {
      backgroundColor: isDark ? 'rgba(56,189,248,0.05)' : 'rgba(2,132,199,0.03)',
    },
    pickerModalRowText: {
      fontSize: 14,
      color: colors.textPrimary,
      fontWeight: '500',
    },
    pickerModalRowTextActive: {
      color: '#38bdf8',
      fontWeight: '700',
    }
  });
};
