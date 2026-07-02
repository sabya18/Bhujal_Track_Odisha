// --- Application State ---
let wellsData = [];
let wttoData = [];
let odishaDistrictsGeoJSON = null;
let odishaBlocksGeoJSON = null;
let historicalTrends = null;
let rainfallData = null;
let gwraData = null;
let gwraHistorical = null;
let visitsHistory = {};

// Global Filters (Synced with header selectors)
let selectedYear = '2026';
let selectedSeason = 'Mid-Monsoon';
let activeTab = 'dashboard';
let theme = 'dark'; // default theme

// Map & Table state
let mainMap = null;
let miniMap = null;
let boundaryLayer = null;
let miniBoundaryLayer = null;
let mainMarkersGroup = null;
let selectedWell = null;
let cameraStream = null;

// Pagination
let currentPage = 1;
const rowsPerPage = 15;
let filteredWells = [];

// Charts State
let chartHistorical = null;
let chartRainfall = null;

// Standalone vs Server detection
const isStandaloneMode = window.location.protocol === 'file:' || window.location.hostname === '';

// --- News Database ---
const newsArticles = [
  {
    id: 1,
    title: "Odisha State Water Policy Guidelines 2026",
    badge: "Policy Guidelines",
    date: "June 2026",
    author: "Water Resources Department",
    snippet: "The Government of Odisha announces strict new measures for groundwater abstraction. All commercial dug wells and borewells must install digital flow meters. This policy prioritizes drinking water safety and agricultural sustainability across coastal saline zones.",
    link: "#"
  },
  {
    id: 2,
    title: "Salinity Intrusion Monitoring in Coastal Aquifers",
    badge: "Research Brief",
    date: "May 2026",
    author: "National Institute of Hydrology",
    snippet: "Recent monitoring records show elevated Electrical Conductivity (EC) values in the second and third aquifer layers of Kendrapara and Jagatsinghpur. Researchers suggest regulated pumping during high-tide phases to prevent marine saltwater intrusion.",
    link: "#"
  },
  {
    id: 3,
    title: "Groundwater Recharge Structures in Mahanadi Basin",
    badge: "Technical Brief",
    date: "April 2026",
    author: "Groundwater Development Director",
    snippet: "Technical specifications released for rooftop rainwater harvesting systems and percolation tanks. Implementation in alluvial zones shows a significant recovery of local shallow water table depth by 0.5 to 1.2 meters over a 3-year observation window.",
    link: "#"
  },
  {
    id: 4,
    title: "Understanding Mann-Kendall Trend Statistics",
    badge: "Data Tutorial",
    date: "March 2026",
    author: "Central Ground Water Board",
    snippet: "A detailed guide on interpreting S-statistic and Z-score in hydrological datasets. The tutorial outlines how to separate seasonal noise from long-term monotonic trends to detect depletion rates accurately.",
    link: "#"
  }
];

// --- Helpers ---
function getDistrictFromSheet(sheet) {
  if (!sheet) return 'Other';
  const s = sheet.toLowerCase().replace(/[\s_\.\-]+/g, '');
  if (s.includes('kendrapara')) return 'Kendrapara';
  if (s.includes('cuttack')) return 'Cuttack';
  if (s.includes('jajpur')) return 'Jajpur';
  if (s.includes('jspur') || s.includes('jagatsingh')) return 'Jagatsinghpur';
  if (s.includes('balasore') || s.includes('baleshwar')) return 'Balasore';
  if (s.includes('bhadrak')) return 'Bhadrak';
  if (s.includes('mayurbhanj')) return 'Mayurbhanj';
  if (s.includes('bolangir') || s.includes('balangir')) return 'Bolangir';
  if (s.includes('deogarh') || s.includes('debagarh')) return 'Deogarh';
  if (s.includes('dhenkanal')) return 'Dhenkanal';
  if (s.includes('ganjam')) return 'Ganjam';
  if (s.includes('gajapati')) return 'Gajapati';
  if (s.includes('jharsuguda')) return 'Jharsuguda';
  if (s.includes('kalahandi')) return 'Kalahandi';
  if (s.includes('kandhamal')) return 'Kandhamal';
  if (s.includes('keonjhar') || s.includes('kendujhar')) return 'Keonjhar';
  if (s.includes('khurda') || s.includes('khordha')) return 'Khordha';
  if (s.includes('koraput')) return 'Koraput';
  if (s.includes('malkangiri')) return 'Malkangiri';
  if (s.includes('nabarangpur') || s.includes('nawarangpur')) return 'Nabarangpur';
  if (s.includes('nayagarh')) return 'Nayagarh';
  if (s.includes('nuapada')) return 'Nuapada';
  if (s.includes('puri')) return 'Puri';
  if (s.includes('rayagada')) return 'Rayagada';
  if (s.includes('sambalpur')) return 'Sambalpur';
  if (s.includes('subarnapur') || s.includes('sonepur')) return 'Subarnapur';
  if (s.includes('sundargarh')) return 'Sundargarh';
  return 'Other';
}

function normalizeGeoJSONDistrict(distName) {
  if (!distName) return '';
  const d = distName.toLowerCase().replace(/[\s_\.\-]+/g, '');
  if (d.includes('kendrapara')) return d.includes('urban') ? 'kendrapara urban' : 'kendrapara';
  if (d.includes('cuttack')) return d.includes('urban') ? 'cuttack urban' : 'cuttack';
  if (d.includes('jajpur')) return d.includes('urban') ? 'jajpur urban' : 'jajpur';
  if (d.includes('jagatsinghpur') || d.includes('jagatsinghapur') || d.includes('jspur') || d.includes('jagatsingpur')) return 'jagatsinghpur';
  if (d.includes('bolangir') || d.includes('balangir')) return 'balangir';
  if (d.includes('bhubaneswar') || d.includes('khurda') || d.includes('khordha')) return 'khordha';
  if (d.includes('nawarangapur') || d.includes('nabarangapur') || d.includes('nabarangpur')) return 'nabarangpur';
  if (d.includes('debagarh') || d.includes('deogarh')) return 'deogarh';
  if (d.includes('baleshwar') || d.includes('balasore') || d.includes('balesore') || d.includes('baleswar')) return 'balasore';
  if (d.includes('kendujhar') || d.includes('keonjhar')) return 'keonjhar';
  return distName.toLowerCase().replace(/_blocks/g, '').replace(/_urban/g, '').trim();
}

function normalizeBlockName(blockName) {
  if (!blockName) return '';
  const trimmed = blockName.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'aul') return 'Aul';
  if (lower === 'derbish' || lower === 'derabish') return 'Derabish';
  if (lower === 'kendrapara') return 'Kendrapara';
  if (lower === 'marsaghai' || lower === 'marsaghal' || lower === 'marsaghau' || lower === 'marshaghai') return 'Marsaghai';
  if (lower === 'garadapur' || lower === 'garadpur' || lower === 'gardapur') return 'Garadpur';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function checkDateInSeasonRange(dateStr, targetSeasonStr) {
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

  const lower = targetSeasonStr.toLowerCase();
  let targetSeason = 'Winter';
  if (lower.includes('pre')) targetSeason = 'Pre-Monsoon';
  else if (lower.includes('mid')) targetSeason = 'Mid-Monsoon';
  else if (lower.includes('post')) targetSeason = 'Post-Monsoon';

  const match = targetSeasonStr.match(/\d{4}/);
  const targetYear = match ? parseInt(match[0], 10) : 2026;

  const val = month * 100 + day;
  let wellSeason = 'Winter';
  let wellSeasonYear = year;

  if (val >= 201 && val <= 315) wellSeason = 'Winter';
  else if (val >= 420 && val <= 610) wellSeason = 'Pre-Monsoon';
  else if (val >= 801 && val <= 1010) wellSeason = 'Mid-Monsoon';
  else if (val >= 1101 && val <= 1231) wellSeason = 'Post-Monsoon';
  else if (val >= 101 && val <= 110) {
    wellSeason = 'Post-Monsoon';
    wellSeasonYear = year - 1;
  } else {
    if (val > 110 && val < 201) wellSeason = 'Winter';
    if (val > 315 && val < 420) wellSeason = 'Pre-Monsoon';
    if (val > 610 && val < 801) wellSeason = 'Mid-Monsoon';
    wellSeasonYear = year;
  }

  return wellSeason === targetSeason && wellSeasonYear === targetYear;
}

function getWellDataForSeason(well, seasonName, year, history = {}) {
  let seasonCode = 'Winter';
  if (seasonName.includes('Pre')) seasonCode = 'PreMon';
  else if (seasonName.includes('Mid')) seasonCode = 'MidMon';
  else if (seasonName.includes('Post')) seasonCode = 'PostMon';

  const seasonKey = `${year}_${seasonCode}`;
  let defaultDate = '15.02.' + year;
  if (seasonName === 'Pre-Monsoon') defaultDate = '15.05.' + year;
  else if (seasonName === 'Mid-Monsoon') defaultDate = '15.09.' + year;
  else if (seasonName === 'Post-Monsoon') defaultDate = '15.11.' + year;

  // 1. User recorded visit history
  const hist = history[well.well_number]?.[seasonKey];
  if (hist && hist.value !== undefined && hist.value !== null) {
    return {
      date: hist.date || defaultDate,
      dtgwl_mbgl: hist.value,
      dtgwl_bmp: hist.value + (well.parapet_height || 0)
    };
  }

  // 2. Direct well date matching
  if (well.date && checkDateInSeasonRange(well.date, `${seasonName} ${year}`)) {
    return {
      date: well.date,
      dtgwl_mbgl: well.dtgwl_mbgl,
      dtgwl_bmp: well.dtgwl_bmp
    };
  }

  // 3. Preloaded WTTO history
  if (well.history && well.history[seasonKey] !== undefined && well.history[seasonKey] !== null) {
    const val = parseFloat(well.history[seasonKey]);
    if (!isNaN(val)) {
      return {
        date: defaultDate,
        dtgwl_mbgl: val,
        dtgwl_bmp: val + (well.parapet_height || 0)
      };
    }
  }

  return { date: null, dtgwl_mbgl: null, dtgwl_bmp: null };
}

// Color codes for map
function getCompletionColor(percent) {
  if (percent >= 90) return '#10b981'; // green
  if (percent >= 50) return '#f59e0b'; // orange
  return '#ef4444'; // red
}

function getDepthColor(avgMbgl) {
  if (avgMbgl === null || avgMbgl === undefined || avgMbgl === 'N/A' || avgMbgl === 0) return '#64748b';
  const val = parseFloat(avgMbgl);
  if (val < 2.5) return '#3b82f6'; // Light Blue (<2.5m)
  if (val < 4.5) return '#10b981'; // Green (2.5-4.5m)
  if (val < 6.5) return '#f59e0b'; // Amber (4.5-6.5m)
  if (val < 8.5) return '#f97316'; // Orange (6.5-8.5m)
  return '#ef4444'; // Red (>8.5m)
}

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupThemeToggle();
  setupGlobalFilters();
  setupActionButtons();
  setupModalEventListeners();
  setupFilterEventListeners();
  
  // Show Loading state
  setConnectionStatus('loading', 'Loading Map Boundaries & Databases...');
  
  await loadAllData();
  
  setConnectionStatus('connected', 'Connected');
  
  // Render initially
  renderDashboard();
  populateFilterDropdowns();
  applyFilters();
  renderNews();
  populateTrendsDropdown();
});

// --- Load Databases ---
async function loadAllData() {
  try {
    // 1. Fetch wells from server API or static wells fallback
    let fetchedWells = [];
    if (!isStandaloneMode) {
      const res = await fetch('/api/wells');
      if (res.ok) fetchedWells = await res.json();
    }
    
    if (fetchedWells.length === 0) {
      const wellsRes = await fetch('data/wells.json');
      fetchedWells = await wellsRes.json();
    }
    wellsData = fetchedWells;
    
    // Load local storage custom visit history
    const storedHistory = localStorage.getItem('gw_visits_history');
    if (storedHistory) {
      visitsHistory = JSON.parse(storedHistory);
    }
    
    // 2. Fetch GeoJSON boundaries
    const distRes = await fetch('data/odisha_districts_complete.json');
    odishaDistrictsGeoJSON = await distRes.json();
    
    const blockRes = await fetch('data/odisha_blocks_filtered.json');
    odishaBlocksGeoJSON = await blockRes.json();
    
    // 3. Fetch Trend datasets
    const trendsRes = await fetch('data/historical_trends.json');
    historicalTrends = await trendsRes.json();
    
    const rainRes = await fetch('data/rainfall_data.json');
    rainfallData = await rainRes.json();
    
    const gwraRes = await fetch('data/gwra_data.json');
    gwraData = await gwraRes.json();
    
    const gwraHistRes = await fetch('data/gwra_historical.json');
    gwraHistorical = await gwraHistRes.json();
    
    // 4. Fetch WTTO preloaded data
    const wttoRes = await fetch('data/wtto_preloaded.json');
    wttoData = await wttoRes.json();
    
    console.log("All data assets fetched and initialized successfully!");
  } catch (err) {
    console.error("Failed to load databases. Falling back to preloaded caches:", err);
    // If local caches exist, load them
    if (typeof initialWellsData !== 'undefined') {
      wellsData = initialWellsData;
    }
  }
}

// --- Theme Switcher ---
function setupThemeToggle() {
  const toggleBtn = document.getElementById('btn-toggle-theme');
  toggleBtn.addEventListener('click', () => {
    if (theme === 'dark') {
      document.body.className = 'light-theme';
      theme = 'light';
      toggleBtn.textContent = '☀️ Light Theme';
    } else {
      document.body.className = 'dark-theme';
      theme = 'dark';
      toggleBtn.textContent = '🌙 Dark Theme';
    }
    // Redraw maps and charts if active to adjust theme colors
    if (activeTab === 'dashboard') {
      renderDashboard();
    } else if (activeTab === 'map-view') {
      initMap();
    } else if (activeTab === 'trends-view') {
      updateTrendsTab();
    }
  });
}

// --- Global Selectors ---
function setupGlobalFilters() {
  const yearSelect = document.getElementById('global-filter-year');
  const seasonSelect = document.getElementById('global-filter-season');
  
  yearSelect.addEventListener('change', (e) => {
    selectedYear = e.target.value;
    updateGlobalBanner();
    onDataUpdated();
  });
  
  seasonSelect.addEventListener('change', (e) => {
    selectedSeason = e.target.value;
    updateGlobalBanner();
    onDataUpdated();
  });
}

function updateGlobalBanner() {
  const bannerSeason = document.getElementById('banner-season-value');
  const bannerIcon = document.getElementById('banner-season-icon');
  
  bannerSeason.textContent = `${selectedSeason} ${selectedYear}`;
  
  let icon = '❄️';
  if (selectedSeason.includes('Pre')) icon = '☀️';
  else if (selectedSeason.includes('Mid')) icon = '🌧️';
  else if (selectedSeason.includes('Post')) icon = '⛅';
  bannerIcon.textContent = icon;
}

function onDataUpdated() {
  if (activeTab === 'dashboard') {
    renderDashboard();
  } else if (activeTab === 'map-view') {
    initMap();
  } else if (activeTab === 'directory') {
    applyFilters();
  } else if (activeTab === 'trends-view') {
    updateTrendsTab();
  }
}

// --- Connection Indicator ---
function setConnectionStatus(status, text) {
  const indicator = document.getElementById('connection-indicator');
  const statusText = indicator.querySelector('.status-text');
  
  indicator.className = 'connection-status ' + status;
  statusText.textContent = text;
}

// --- Navigation Tabs ---
function setupTabs() {
  const navItems = document.querySelectorAll('.nav-item');
  const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
  const tabs = document.querySelectorAll('.tab-content');
  
  function switchTab(targetTab, labelText) {
    navItems.forEach(n => {
      if (n.getAttribute('data-tab') === targetTab) n.classList.add('active');
      else n.classList.remove('active');
    });
    mobileNavItems.forEach(n => {
      if (n.getAttribute('data-tab') === targetTab) n.classList.add('active');
      else n.classList.remove('active');
    });
    
    tabs.forEach(t => t.classList.remove('active-tab'));
    
    const panelId = targetTab.endsWith('-view') ? targetTab : `${targetTab}-view`;
    const targetPanel = document.getElementById(`tab-${targetTab}`);
    if (targetPanel) {
      targetPanel.classList.add('active-tab');
    }
    
    document.getElementById('page-title').textContent = labelText;
    activeTab = targetTab;
    
    // Auto-init maps or charts
    if (activeTab === 'dashboard') {
      setTimeout(() => renderDashboardMap(), 100);
    } else if (activeTab === 'map-view') {
      setTimeout(() => initMap(), 100);
    } else if (activeTab === 'trends-view') {
      updateTrendsTab();
    }
  }
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      switchTab(item.getAttribute('data-tab'), item.textContent.trim());
    });
  });
  
  mobileNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-tab');
      let label = 'Dashboard';
      if (target.includes('map')) label = 'Station Map';
      else if (target.includes('directory')) label = 'Wells Directory';
      else if (target.includes('trends')) label = 'Trends Analysis';
      else if (target.includes('news')) label = 'Groundwater News';
      switchTab(target, label);
    });
  });
}

// --- Dashboard Logic ---
const getDivisionForDistrict = (district) => {
  const lower = (district || '').toLowerCase();
  if (lower.includes('cuttack')) return 'Cuttack';
  if (lower.includes('jajpur')) return 'Jajpur';
  if (lower.includes('kendrapara')) return 'Kendrapara';
  if (lower.includes('jagatsinghpur') || lower.includes('jspur')) return 'Jagatsinghpur';
  return 'Other';
};

function renderDashboard() {
  // Calculate Stats
  let total = 0;
  let active = 0;
  let monitored = 0;
  let pending = 0;
  
  const statsByDistrict = {};
  
  wellsData.forEach(well => {
    const dist = getDistrictFromSheet(well.sheet);
    if (!statsByDistrict[dist]) {
      statsByDistrict[dist] = { total: 0, active: 0, monitored: 0, sumMbgl: 0, countMbgl: 0 };
    }
    
    total++;
    statsByDistrict[dist].total++;
    
    const isAct = isActiveWell(well);
    if (isAct) {
      active++;
      statsByDistrict[dist].active++;
      
      const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
      if (seasonal.dtgwl_mbgl !== null) {
        monitored++;
        statsByDistrict[dist].monitored++;
        statsByDistrict[dist].sumMbgl += seasonal.dtgwl_mbgl;
        statsByDistrict[dist].countMbgl++;
      } else {
        pending++;
      }
    }
  });
  
  document.getElementById('val-total-wells').textContent = total;
  document.getElementById('val-active-wells').textContent = active;
  document.getElementById('val-monitored-wells').textContent = monitored;
  document.getElementById('val-pending-wells').textContent = pending;
  
  const percent = active > 0 ? Math.round((monitored / active) * 100) : 0;
  document.getElementById('val-monitored-percent').textContent = `${percent}% of active wells completed`;
  
  // Render scrollable block monitoring list
  const breakdownList = document.getElementById('district-breakdown-list');
  breakdownList.innerHTML = '';
  
  const sortedDistricts = Object.keys(statsByDistrict).sort();
  sortedDistricts.forEach(dist => {
    const d = statsByDistrict[dist];
    if (d.active === 0) return;
    
    const pct = Math.round((d.monitored / d.active) * 100);
    const avg = d.countMbgl > 0 ? (d.sumMbgl / d.countMbgl).toFixed(2) + ' m' : 'No Data';
    
    const rowHtml = `
      <div class="district-row">
        <div class="district-label-row">
          <span style="font-weight:600;">${dist}</span>
          <span style="font-size:0.8rem; color:var(--text-muted);">Avg Level: <strong>${avg}</strong></span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">
          <span>Completion: ${d.monitored} / ${d.active} wells</span>
          <span>${pct}%</span>
        </div>
        <div style="width:100%; height:6px; background:var(--border-color); border-radius:3px; overflow:hidden;">
          <div style="width:${pct}%; height:100%; background:${getCompletionColor(pct)}; border-radius:3px;"></div>
        </div>
      </div>
    `;
    breakdownList.innerHTML += rowHtml;
  });
  
  renderDashboardMap(statsByDistrict);
}

// Mini Odisha Leaflet Map
let dashboardMapMode = 'progress'; // 'progress' or 'depth'

function renderDashboardMap(statsByDistrict) {
  if (!odishaDistrictsGeoJSON) return;
  
  if (miniMap) {
    miniMap.remove();
  }
  
  const isDark = theme === 'dark';
  const background = isDark ? '#0b0f19' : '#f8fafc';
  const border = isDark ? '#475569' : '#cbd5e1';
  
  miniMap = L.map('mini-leaflet-map', {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false,
    dragging: true
  }).setView([20.4, 84.5], 6.5);
  
  const mapStats = {};
  Object.entries(statsByDistrict || {}).forEach(([district, data]) => {
    const key = normalizeGeoJSONDistrict(district);
    const pct = data.active > 0 ? Math.round((data.monitored / data.active) * 100) : 0;
    const avg = data.countMbgl > 0 ? (data.sumMbgl / data.countMbgl) : 0;
    mapStats[key] = {
      ...data,
      percent: pct,
      avgMbgl: avg,
      color: dashboardMapMode === 'progress' ? getCompletionColor(pct) : getDepthColor(avg)
    };
  });
  
  miniBoundaryLayer = L.geoJSON(odishaDistrictsGeoJSON, {
    style: feature => {
      const rawName = feature.properties.Dist_Name || feature.properties.dtname || '';
      const key = normalizeGeoJSONDistrict(rawName);
      const data = mapStats[key];
      
      return {
        color: border,
        weight: 1,
        fillColor: data ? data.color : (isDark ? '#1e293b' : '#e2e8f0'),
        fillOpacity: data ? 0.75 : 0.25
      };
    },
    onEachFeature: (feature, layer) => {
      const rawName = feature.properties.Dist_Name || feature.properties.dtname || 'Unknown';
      const key = normalizeGeoJSONDistrict(rawName);
      const data = mapStats[key];
      
      let tooltipContent = `<strong>${rawName}</strong>`;
      if (data) {
        if (dashboardMapMode === 'progress') {
          tooltipContent += `<br/>Progress: ${data.percent}% (${data.monitored}/${data.active})`;
        } else {
          tooltipContent += `<br/>Avg Water Level: ${data.avgMbgl > 0 ? data.avgMbgl.toFixed(2) + ' m BGL' : 'No Data'}`;
        }
      } else {
        tooltipContent += '<br/>No active stations';
      }
      
      layer.bindTooltip(tooltipContent, { sticky: true });
      
      layer.on('click', () => {
        // Zoom dashboard list to district
        const detailsTitle = document.getElementById('lbl-block-details-title');
        detailsTitle.textContent = `Block Details (${rawName})`;
        filterDashboardBlocks(rawName);
      });
    }
  }).addTo(miniMap);
  
  // Set Map mode button listeners
  const progressBtn = document.getElementById('btn-mode-progress');
  const depthBtn = document.getElementById('btn-mode-depth');
  
  progressBtn.onclick = () => {
    dashboardMapMode = 'progress';
    progressBtn.className = 'btn btn-sm btn-primary active';
    depthBtn.className = 'btn btn-sm btn-secondary';
    renderDashboard();
  };
  
  depthBtn.onclick = () => {
    dashboardMapMode = 'depth';
    progressBtn.className = 'btn btn-sm btn-secondary';
    depthBtn.className = 'btn btn-sm btn-primary active';
    renderDashboard();
  };
}

function filterDashboardBlocks(districtName) {
  const breakdownList = document.getElementById('district-breakdown-list');
  breakdownList.innerHTML = '';
  
  const blocksMap = {};
  wellsData.forEach(well => {
    const dist = getDistrictFromSheet(well.sheet);
    if (dist === districtName && well.block) {
      if (!blocksMap[well.block]) {
        blocksMap[well.block] = { total: 0, active: 0, monitored: 0, sumMbgl: 0, countMbgl: 0 };
      }
      blocksMap[well.block].total++;
      if (isActiveWell(well)) {
        blocksMap[well.block].active++;
        const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
        if (seasonal.dtgwl_mbgl !== null) {
          blocksMap[well.block].monitored++;
          blocksMap[well.block].sumMbgl += seasonal.dtgwl_mbgl;
          blocksMap[well.block].countMbgl++;
        }
      }
    }
  });
  
  const sortedBlocks = Object.keys(blocksMap).sort();
  if (sortedBlocks.length === 0) {
    breakdownList.innerHTML = '<p class="text-muted p-3">No active blocks found for this district.</p>';
    return;
  }
  
  // Add Reset button
  breakdownList.innerHTML += `
    <button class="btn btn-secondary btn-sm mb-3" onclick="renderDashboard()">
      ◀ Reset to All Division
    </button>
  `;
  
  sortedBlocks.forEach(block => {
    const b = blocksMap[block];
    if (b.active === 0) return;
    
    const pct = Math.round((b.monitored / b.active) * 100);
    const avg = b.countMbgl > 0 ? (b.sumMbgl / b.countMbgl).toFixed(2) + ' m' : 'No Data';
    
    const rowHtml = `
      <div class="district-row">
        <div class="district-label-row">
          <span style="font-weight:600;">${block} Block</span>
          <span style="font-size:0.8rem; color:var(--text-muted);">Avg: <strong>${avg}</strong></span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">
          <span>Completion: ${b.monitored} / ${b.active} wells</span>
          <span>${pct}%</span>
        </div>
        <div style="width:100%; height:6px; background:var(--border-color); border-radius:3px; overflow:hidden;">
          <div style="width:${pct}%; height:100%; background:${getCompletionColor(pct)}; border-radius:3px;"></div>
        </div>
      </div>
    `;
    breakdownList.innerHTML += rowHtml;
  });
}

// --- Station Map Logic ---
let isPresentationMode = false;
let showWaterDepthMap = true;
let showBlocksOverlay = false;

function initMap() {
  const mapElement = document.getElementById('leaflet-map-element');
  if (!mapElement || !odishaDistrictsGeoJSON) return;
  
  if (mainMap) {
    mainMap.remove();
  }
  
  const isDark = theme === 'dark';
  const background = isDark ? '#0b0f19' : '#f8fafc';
  const border = isDark ? '#475569' : '#cbd5e1';
  
  mainMap = L.map('leaflet-map-element', {
    zoomControl: true,
    attributionControl: false
  }).setView([20.4, 84.5], 7);
  
  // Calculate average water levels per district for the current selection
  const districtAverages = {};
  wellsData.forEach(well => {
    if (isActiveWell(well)) {
      const dist = getDistrictFromSheet(well.sheet);
      const key = normalizeGeoJSONDistrict(dist);
      if (!districtAverages[key]) {
        districtAverages[key] = { sum: 0, count: 0 };
      }
      const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
      if (seasonal.dtgwl_mbgl !== null) {
        districtAverages[key].sum += seasonal.dtgwl_mbgl;
        districtAverages[key].count++;
      }
    }
  });
  
  // 1. Draw district choropleth water level map
  if (showWaterDepthMap) {
    L.geoJSON(odishaDistrictsGeoJSON, {
      style: feature => {
        const rawName = feature.properties.Dist_Name || feature.properties.dtname || '';
        const key = normalizeGeoJSONDistrict(rawName);
        const data = districtAverages[key];
        const avg = data && data.count > 0 ? (data.sum / data.count) : null;
        
        return {
          color: border,
          weight: 1.5,
          fillColor: avg !== null ? getDepthColor(avg) : (isDark ? '#1e293b' : '#cbd5e1'),
          fillOpacity: avg !== null ? 0.75 : 0.15
        };
      },
      onEachFeature: (feature, layer) => {
        const rawName = feature.properties.Dist_Name || feature.properties.dtname || 'Unknown';
        const key = normalizeGeoJSONDistrict(rawName);
        const data = districtAverages[key];
        const avg = data && data.count > 0 ? (data.sum / data.count).toFixed(2) : null;
        
        layer.bindTooltip(`District: ${rawName}<br/>Water level: ${avg ? avg + ' m BGL' : 'No Data'}`, { sticky: true });
        
        layer.on('click', () => {
          // Highlight and zoom to district
          mainMap.fitBounds(layer.getBounds());
          // Set filters
          const distFilter = document.getElementById('map-filter-district');
          const matchedOption = Array.from(distFilter.options).find(o => normalizeGeoJSONDistrict(o.value) === key);
          if (matchedOption) {
            distFilter.value = matchedOption.value;
            distFilter.dispatchEvent(new Event('change'));
          }
        });
      }
    }).addTo(mainMap);
  } else {
    // Normal baseline boundaries
    L.geoJSON(odishaDistrictsGeoJSON, {
      style: {
        color: border,
        weight: 1.2,
        fillColor: 'transparent',
        fillOpacity: 0
      }
    }).addTo(mainMap);
  }
  
  // 2. Draw blocks overlay if enabled
  if (showBlocksOverlay && odishaBlocksGeoJSON) {
    boundaryLayer = L.geoJSON(odishaBlocksGeoJSON, {
      style: {
        color: isDark ? '#38bdf8' : '#0284c7',
        weight: 1,
        dashArray: '3, 3',
        fillColor: 'transparent',
        fillOpacity: 0
      }
    }).addTo(mainMap);
  }
  
  // 3. Draw Station Well markers
  mainMarkersGroup = L.layerGroup().addTo(mainMap);
  plotMarkersOnMap();
}

function plotMarkersOnMap() {
  if (!mainMarkersGroup) return;
  mainMarkersGroup.clearLayers();
  
  const districtFilter = document.getElementById('map-filter-district').value;
  const blockFilter = document.getElementById('map-filter-block').value;
  const statusFilter = document.getElementById('map-filter-status').value;
  const query = document.getElementById('map-search-input').value.toLowerCase();
  
  wellsData.forEach(well => {
    const dist = getDistrictFromSheet(well.sheet);
    const isAct = isActiveWell(well);
    const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
    const isMon = seasonal.dtgwl_mbgl !== null;
    
    // Filter matching
    if (districtFilter !== 'ALL' && dist !== districtFilter) return;
    if (blockFilter !== 'ALL' && well.block !== blockFilter) return;
    
    if (statusFilter === 'ACTIVE_PENDING' && (!isAct || isMon)) return;
    if (statusFilter === 'ACTIVE_ALL' && !isAct) return;
    if (statusFilter === 'MONITORED' && !isMon) return;
    if (statusFilter === 'CLOSED' && isAct) return;
    
    if (query) {
      const idMatch = (well.well_number || '').toLowerCase().includes(query);
      const locMatch = (well.location || '').toLowerCase().includes(query);
      if (!idMatch && !locMatch) return;
    }
    
    if (well.latitude && well.longitude) {
      // Determine pin color
      let color = '#94a3b8'; // Grey (Closed)
      if (isAct) {
        color = isMon ? '#10b981' : '#ef4444'; // Green if Monitored, Red if Pending
      }
      
      const marker = L.circleMarker([well.latitude, well.longitude], {
        radius: 6,
        fillColor: color,
        color: '#fff',
        weight: 1,
        fillOpacity: 0.95
      });
      
      marker.bindTooltip(`Well: ${well.well_number}<br/>Location: ${well.location}<br/>Remarks: ${well.remarks || 'Active'}`, { sticky: true });
      
      marker.on('click', () => {
        // Open edit/visit modal
        openVisitEditModal(well);
      });
      
      mainMarkersGroup.addLayer(marker);
    }
  });
}

function setupActionButtons() {
  // Map overlays toggles
  const chkWater = document.getElementById('chk-toggle-water-map');
  const chkBlocks = document.getElementById('chk-toggle-blocks');
  const btnPres = document.getElementById('btn-toggle-presentation');
  
  chkWater.onchange = (e) => {
    showWaterDepthMap = e.target.checked;
    initMap();
  };
  
  chkBlocks.onchange = (e) => {
    showBlocksOverlay = e.target.checked;
    initMap();
  };
  
  btnPres.onclick = () => {
    isPresentationMode = !isPresentationMode;
    if (isPresentationMode) {
      document.body.classList.add('presentation-mode');
      btnPres.textContent = '🎥 Normal View';
    } else {
      document.body.classList.remove('presentation-mode');
      btnPres.textContent = '🎥 Presentation Mode';
    }
    setTimeout(() => {
      if (mainMap) mainMap.invalidateSize();
    }, 200);
  };
  
  // Reload Button
  document.getElementById('btn-reload-data').onclick = async () => {
    setConnectionStatus('loading', 'Syncing and Reloading Excel Database...');
    if (!isStandaloneMode) {
      const res = await fetch('/api/wells/reload', { method: 'POST' });
      if (res.ok) {
        showToast("Excel spreadsheet successfully synced and reloaded!");
      }
    }
    await loadAllData();
    renderDashboard();
    applyFilters();
    showToast("Database successfully updated!");
  };
  
  // Sidebar Excel download
  document.getElementById('btn-export-sidebar').onclick = () => downloadFullExcel();
  document.getElementById('btn-export-dashboard').onclick = () => downloadFullExcel();
  
  // District Excel downloads
  document.querySelectorAll('.btn-export-dist').forEach(btn => {
    btn.onclick = () => {
      const dist = btn.getAttribute('data-district');
      downloadDistrictExcel(dist);
    };
  });
}

function downloadFullExcel() {
  if (isStandaloneMode) {
    showToast("Direct exports not supported in offline standalone mode.", "warning");
    return;
  }
  window.open('/api/export');
}

function downloadDistrictExcel(districtName) {
  if (isStandaloneMode) {
    showToast("Direct exports not supported in offline standalone mode.", "warning");
    return;
  }
  window.open(`/api/export/district?name=${districtName}`);
}

// --- Directory & Table Filters ---
function setupFilterEventListeners() {
  const tableSearch = document.getElementById('table-search-input');
  const tableDist = document.getElementById('table-filter-district');
  const tableBlock = document.getElementById('table-filter-block');
  const tableType = document.getElementById('table-filter-type');
  const tableStatus = document.getElementById('table-filter-status');
  
  const mapSearch = document.getElementById('map-search-input');
  const mapDist = document.getElementById('map-filter-district');
  const mapBlock = document.getElementById('map-filter-block');
  const mapStatus = document.getElementById('map-filter-status');
  
  const triggerTableChange = () => {
    currentPage = 1;
    applyFilters();
  };
  
  tableSearch.addEventListener('input', triggerTableChange);
  tableDist.addEventListener('change', (e) => {
    updateBlockDropdowns(e.target.value);
    triggerTableChange();
  });
  tableBlock.addEventListener('change', triggerTableChange);
  tableType.addEventListener('change', triggerTableChange);
  tableStatus.addEventListener('change', triggerTableChange);
  
  mapSearch.addEventListener('input', plotMarkersOnMap);
  mapDist.addEventListener('change', (e) => {
    updateBlockDropdowns(e.target.value);
    plotMarkersOnMap();
  });
  mapBlock.addEventListener('change', plotMarkersOnMap);
  mapStatus.addEventListener('change', plotMarkersOnMap);
  
  // Setup pagination buttons
  document.getElementById('btn-pagination-prev').onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  };
  
  document.getElementById('btn-pagination-next').onclick = () => {
    const totalPages = Math.ceil(filteredWells.length / rowsPerPage);
    if (currentPage < totalPages) {
      currentPage++;
      renderTable();
    }
  };
}

function populateFilterDropdowns() {
  const districts = new Set();
  const blocksByDistrict = {};
  
  wellsData.forEach(well => {
    const dist = getDistrictFromSheet(well.sheet);
    districts.add(dist);
    if (!blocksByDistrict[dist]) {
      blocksByDistrict[dist] = new Set();
    }
    if (well.block) {
      blocksByDistrict[dist].add(well.block);
    }
  });
  
  const mapDist = document.getElementById('map-filter-district');
  const tableDist = document.getElementById('table-filter-district');
  
  mapDist.innerHTML = '<option value="ALL">All Districts</option>';
  tableDist.innerHTML = '<option value="ALL">All Districts</option>';
  
  Array.from(districts).sort().forEach(d => {
    const opt = `<option value="${d}">${d}</option>`;
    mapDist.innerHTML += opt;
    tableDist.innerHTML += opt;
  });
  
  window.updateBlockDropdowns = (selectedDist) => {
    const mapBlock = document.getElementById('map-filter-block');
    const tableBlock = document.getElementById('table-filter-block');
    
    mapBlock.innerHTML = '<option value="ALL">All Blocks</option>';
    tableBlock.innerHTML = '<option value="ALL">All Blocks</option>';
    
    let blocks = [];
    if (selectedDist === 'ALL') {
      const allBlocks = new Set();
      Object.values(blocksByDistrict).forEach(set => {
        set.forEach(b => allBlocks.add(b));
      });
      blocks = Array.from(allBlocks);
    } else if (blocksByDistrict[selectedDist]) {
      blocks = Array.from(blocksByDistrict[selectedDist]);
    }
    
    blocks.sort().forEach(b => {
      const opt = `<option value="${b}">${b}</option>`;
      mapBlock.innerHTML += opt;
      tableBlock.innerHTML += opt;
    });
  };
  
  updateBlockDropdowns('ALL');
}

function applyFilters() {
  const search = document.getElementById('table-search-input').value.toLowerCase();
  const district = document.getElementById('table-filter-district').value;
  const block = document.getElementById('table-filter-block').value;
  const type = document.getElementById('table-filter-type').value;
  const status = document.getElementById('table-filter-status').value;
  
  filteredWells = wellsData.filter(well => {
    const dist = getDistrictFromSheet(well.sheet);
    const isAct = isActiveWell(well);
    
    if (district !== 'ALL' && dist !== district) return false;
    if (block !== 'ALL' && well.block !== block) return false;
    if (type !== 'ALL' && well.well_type !== type) return false;
    if (status === 'ACTIVE' && !isAct) return false;
    if (status === 'CLOSED' && isAct) return false;
    
    if (search) {
      const idMatch = (well.well_number || '').toLowerCase().includes(search);
      const locMatch = (well.location || '').toLowerCase().includes(search);
      const blockMatch = (well.block || '').toLowerCase().includes(search);
      if (!idMatch && !locMatch && !blockMatch) return false;
    }
    
    return true;
  });
  
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('wells-table-body');
  tbody.innerHTML = '';
  
  const totalEntries = filteredWells.length;
  const totalPages = Math.ceil(totalEntries / rowsPerPage);
  
  if (totalEntries === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="text-center py-5">No matching stations found.</td></tr>';
    document.getElementById('pagination-info-text').textContent = 'Showing 0 to 0 of 0 entries';
    document.getElementById('btn-pagination-prev').disabled = true;
    document.getElementById('btn-pagination-next').disabled = true;
    return;
  }
  
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalEntries);
  const pageWells = filteredWells.slice(startIndex, endIndex);
  
  pageWells.forEach(well => {
    const dist = getDistrictFromSheet(well.sheet);
    const isAct = isActiveWell(well);
    const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
    
    // Status text / Action button style
    let actionBtn = `<button class="btn btn-primary btn-sm btn-record-row">Record Visit</button>`;
    if (!isAct) {
      actionBtn = `<span class="badge badge-grey">Closed</span>`;
    } else if (seasonal.dtgwl_mbgl !== null) {
      actionBtn = `<button class="btn btn-success btn-sm btn-record-row">Update (Monitored)</button>`;
    }
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Well No/ID" class="text-highlight"><strong>${well.well_number}</strong></td>
      <td data-label="District">${dist}</td>
      <td data-label="Block">${well.block || '-'}</td>
      <td data-label="Location">${well.location || '-'}</td>
      <td data-label="Type">${well.well_type || 'DW'}</td>
      <td data-label="Parapet">${well.parapet_height !== null ? well.parapet_height.toFixed(2) : '-'}</td>
      <td data-label="Visit Date">${seasonal.date || '-'}</td>
      <td data-label="DTGWL (BMP)">${seasonal.dtgwl_bmp !== null ? seasonal.dtgwl_bmp.toFixed(2) + ' m' : '-'}</td>
      <td data-label="DTGWL (MBGL)" class="text-highlight"><strong>${seasonal.dtgwl_mbgl !== null ? seasonal.dtgwl_mbgl.toFixed(2) + ' m' : '-'}</strong></td>
      <td data-label="Remarks" class="text-muted"><small>${well.remarks || '-'}</small></td>
      <td data-label="Photo">${well.photoUrl ? '🖼️ Yes' : '❌ No'}</td>
      <td style="text-align: center;">${actionBtn}</td>
    `;
    
    const recordBtn = row.querySelector('.btn-record-row');
    if (recordBtn) {
      recordBtn.onclick = () => openVisitEditModal(well);
    }
    
    tbody.appendChild(row);
  });
  
  document.getElementById('pagination-info-text').textContent = `Showing ${startIndex + 1} to ${endIndex} of ${totalEntries} entries`;
  document.getElementById('btn-pagination-prev').disabled = currentPage === 1;
  document.getElementById('btn-pagination-next').disabled = currentPage === totalPages;
}

// --- Visit Recording Modal ---
function setupModalEventListeners() {
  const modal = document.getElementById('edit-well-modal');
  const closeBtn = document.getElementById('btn-close-modal');
  const cancelBtn = document.getElementById('btn-cancel-modal');
  const form = document.getElementById('frm-record-visit');
  
  const hideModal = () => {
    modal.classList.remove('show-modal');
    stopCamera();
  };
  
  closeBtn.onclick = hideModal;
  cancelBtn.onclick = hideModal;
  
  // Math auto-calculation logic: BMP - Parapet = MBGL
  const inputBmp = document.getElementById('input-dtgwl-bmp');
  const inputParapet = document.getElementById('input-parapet-height');
  const inputMbgl = document.getElementById('input-dtgwl-mbgl');
  
  const recalculateMbgl = () => {
    const bmpVal = parseFloat(inputBmp.value);
    const parapetVal = parseFloat(inputParapet.value);
    if (!isNaN(bmpVal) && !isNaN(parapetVal)) {
      inputMbgl.value = (bmpVal - parapetVal).toFixed(2);
    }
  };
  
  inputBmp.oninput = recalculateMbgl;
  inputParapet.oninput = recalculateMbgl;
  
  // Handle Camera activation
  const camBtn = document.getElementById('btn-toggle-camera');
  camBtn.onclick = toggleCamera;
  
  const snapBtn = document.getElementById('btn-snap-photo');
  snapBtn.onclick = snapPhoto;
  
  // Save visit form submission
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!selectedWell) return;
    
    const visitDate = document.getElementById('input-visit-date').value;
    const parapetVal = parseFloat(document.getElementById('input-parapet-height').value);
    const bmpVal = parseFloat(document.getElementById('input-dtgwl-bmp').value);
    const mbglVal = parseFloat(document.getElementById('input-dtgwl-mbgl').value);
    
    // Reformat date from YYYY-MM-DD to DD.MM.YYYY
    let formattedDate = '';
    if (visitDate) {
      const parts = visitDate.split('-');
      if (parts.length === 3) {
        formattedDate = `${parts[2]}.${parts[1]}.${parts[0]}`;
      }
    }
    
    // Save to local visitsHistory mapping
    let seasonCode = 'Winter';
    if (selectedSeason.includes('Pre')) seasonCode = 'PreMon';
    else if (selectedSeason.includes('Mid')) seasonCode = 'MidMon';
    else if (selectedSeason.includes('Post')) seasonCode = 'PostMon';
    
    const seasonKey = `${selectedYear}_${seasonCode}`;
    
    if (!visitsHistory[selectedWell.well_number]) {
      visitsHistory[selectedWell.well_number] = {};
    }
    visitsHistory[selectedWell.well_number][seasonKey] = {
      date: formattedDate,
      value: mbglVal
    };
    
    // Persist local storage cache
    localStorage.setItem('gw_visits_history', JSON.stringify(visitsHistory));
    
    // Sync to backend if online
    if (!isStandaloneMode && navigator.onLine) {
      setConnectionStatus('loading', 'Syncing visits to server...');
      try {
        const updateRes = await fetch('/api/wells/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheet: selectedWell.sheet,
            row_idx: selectedWell.row_idx,
            date: formattedDate,
            bmp: bmpVal,
            mbgl: mbglVal,
            parapet: parapetVal,
            well_number: selectedWell.well_number
          })
        });
        
        if (updateRes.ok) {
          showToast("Field visit data synced and saved successfully!");
        } else {
          showToast("Saved locally, failed to sync with Excel book.", "warning");
        }
      } catch (err) {
        showToast("Saved locally, failed to sync with Excel book.", "warning");
      }
    } else {
      showToast("Measurements saved locally (Offline Mode).");
    }
    
    // Update local cache
    const wellIdx = wellsData.findIndex(w => w.well_number === selectedWell.well_number);
    if (wellIdx !== -1) {
      wellsData[wellIdx].parapet_height = parapetVal;
      wellsData[wellIdx].date = formattedDate;
      wellsData[wellIdx].dtgwl_bmp = bmpVal;
      wellsData[wellIdx].dtgwl_mbgl = mbglVal;
    }
    
    hideModal();
    renderDashboard();
    applyFilters();
    plotMarkersOnMap();
  };
}

function openVisitEditModal(well) {
  selectedWell = well;
  
  const modal = document.getElementById('edit-well-modal');
  modal.classList.add('show-modal');
  
  // Set UI labels
  document.getElementById('lbl-well-number').textContent = well.well_number;
  document.getElementById('lbl-well-block').textContent = well.block || 'ALL';
  document.getElementById('lbl-well-coords').textContent = well.latitude ? `${well.latitude.toFixed(4)}, ${well.longitude.toFixed(4)}` : 'N/A';
  document.getElementById('lbl-well-parapet').textContent = well.parapet_height ? `${well.parapet_height.toFixed(2)} m` : '-';
  document.getElementById('lbl-well-remarks').textContent = well.remarks || 'Active';
  
  // Set form values
  document.getElementById('form-well-sheet').value = well.sheet;
  document.getElementById('form-well-row').value = well.row_idx;
  document.getElementById('form-well-number').value = well.well_number;
  
  const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
  
  // Set inputs
  const inputDate = document.getElementById('input-visit-date');
  const inputParapet = document.getElementById('input-parapet-height');
  const inputBmp = document.getElementById('input-dtgwl-bmp');
  const inputMbgl = document.getElementById('input-dtgwl-mbgl');
  
  // Format DD.MM.YYYY to YYYY-MM-DD for native HTML date input
  let formDate = '';
  if (seasonal.date) {
    const parts = seasonal.date.split('.');
    if (parts.length === 3) {
      formDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  } else {
    // default to today
    formDate = new Date().toISOString().split('T')[0];
  }
  
  inputDate.value = formDate;
  inputParapet.value = well.parapet_height !== null ? well.parapet_height : 0.45;
  inputBmp.value = seasonal.dtgwl_bmp !== null ? seasonal.dtgwl_bmp : '';
  inputMbgl.value = seasonal.dtgwl_mbgl !== null ? seasonal.dtgwl_mbgl : '';
  
  // Setup photo preview
  const imgPreview = document.getElementById('img-captured-preview');
  const photoPlaceholder = document.getElementById('photo-placeholder');
  
  if (well.photoUrl) {
    imgPreview.src = well.photoUrl;
    imgPreview.style.display = 'block';
    photoPlaceholder.style.display = 'none';
  } else {
    imgPreview.src = '';
    imgPreview.style.display = 'none';
    photoPlaceholder.style.display = 'flex';
  }
}

// Camera Web Stream handlers
async function toggleCamera() {
  const video = document.getElementById('webcam-feed');
  const streamBox = document.getElementById('camera-stream-box');
  const previewBox = document.getElementById('photo-preview-box');
  const camBtn = document.getElementById('btn-toggle-camera');
  
  if (cameraStream) {
    stopCamera();
  } else {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = cameraStream;
      streamBox.style.display = 'block';
      previewBox.style.display = 'none';
      camBtn.textContent = 'Deactivate Site Camera';
    } catch (err) {
      showToast("Could not access camera feed.", "error");
    }
  }
}

function stopCamera() {
  const streamBox = document.getElementById('camera-stream-box');
  const previewBox = document.getElementById('photo-preview-box');
  const camBtn = document.getElementById('btn-toggle-camera');
  
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  streamBox.style.display = 'none';
  previewBox.style.display = 'block';
  camBtn.textContent = 'Activate Site Camera';
}

function snapPhoto() {
  const video = document.getElementById('webcam-feed');
  const canvas = document.getElementById('canvas-capture');
  const imgPreview = document.getElementById('img-captured-preview');
  const photoPlaceholder = document.getElementById('photo-placeholder');
  
  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg');
  
  // Show in preview
  imgPreview.src = dataUrl;
  imgPreview.style.display = 'block';
  photoPlaceholder.style.display = 'none';
  
  stopCamera();
  showToast("Photo captured successfully!");
  
  // Upload to server if not standalone
  if (!isStandaloneMode) {
    canvas.toBlob(async (blob) => {
      const formData = new FormData();
      formData.append('photo', blob, `${selectedWell.well_number}.jpg`);
      formData.append('well_number', selectedWell.well_number);
      
      try {
        const uploadRes = await fetch('/api/wells/upload-photo', {
          method: 'POST',
          body: formData
        });
        if (uploadRes.ok) {
          const result = await uploadRes.json();
          // Update local cached URL
          selectedWell.photoUrl = result.url;
        }
      } catch (err) {
        console.error("Photo upload failed:", err);
      }
    }, 'image/jpeg');
  }
}

// --- Trends & Chart.js Integration ---
function populateTrendsDropdown() {
  const trendsSelect = document.getElementById('trends-well-select');
  trendsSelect.innerHTML = '<option value="">-- Choose Well Number --</option>';
  
  wellsData.forEach(well => {
    trendsSelect.innerHTML += `<option value="${well.well_number}">${well.well_number} - ${well.location || 'Unknown'}</option>`;
  });
  
  trendsSelect.addEventListener('change', (e) => {
    const wellNo = e.target.value;
    if (wellNo) {
      const well = wellsData.find(w => w.well_number === wellNo);
      selectedWell = well;
      updateTrendsTab();
    } else {
      selectedWell = null;
      document.getElementById('trends-well-card').style.display = 'none';
      document.getElementById('trends-content-box').style.display = 'none';
    }
  });
}

// Mann-Kendall statistics calculator in JS
function calculateMannKendallAndSensSlope(valuesList) {
  const validData = valuesList.filter(v => v !== null && v !== undefined && !isNaN(v));
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

  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const diff = validData[j] - validData[i];
      if (diff > 0) s += 1;
      if (diff < 0) s -= 1;
    }
  }

  const valueCounts = {};
  validData.forEach(v => { valueCounts[v] = (valueCounts[v] || 0) + 1; });
  let tieSum = 0;
  Object.values(valueCounts).forEach(count => {
    if (count > 1) {
      tieSum += count * (count - 1) * (2 * count + 5);
    }
  });

  const varS = (n * (n - 1) * (2 * n + 5) - tieSum) / 18;
  let z = 0;
  if (varS > 0) {
    if (s > 0) z = (s - 1) / Math.sqrt(varS);
    else if (s < 0) z = (s + 1) / Math.sqrt(varS);
  }

  const normCDF = (val) => {
    const t = 1 / (1 + 0.2316419 * Math.abs(val));
    const d = 0.3989423 * Math.exp(-val * val / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return val >= 0 ? 1 - p : p;
  };

  const pValue = 2 * (1 - normCDF(Math.abs(z)));

  const slopes = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      slopes.push((validData[j] - validData[i]) / (j - i));
    }
  }
  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  const sensSlope = slopes.length % 2 !== 0 ? slopes[mid] : (slopes[mid - 1] + slopes[mid]) / 2;

  const isSignificant = Math.abs(z) >= 1.96;
  let trendText = 'Stable (No Monotonic Trend)';
  let trendColor = '#64748b';

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
      trendColor = '#f59e0b'; // orange
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
}

function updateTrendsTab() {
  if (!selectedWell) return;
  
  const dist = getDistrictFromSheet(selectedWell.sheet);
  
  // Show details panel
  document.getElementById('trends-well-card').style.display = 'flex';
  document.getElementById('trends-content-box').style.display = 'grid';
  
  document.getElementById('trends-well-id').textContent = selectedWell.well_number;
  document.getElementById('trends-well-desc').textContent = selectedWell.location || 'Observation Well';
  document.getElementById('trends-well-dist').textContent = dist;
  document.getElementById('trends-well-block').textContent = selectedWell.block || 'ALL';
  document.getElementById('trends-well-aquifer').textContent = selectedWell.well_type || 'DW';
  
  // Calculate trends lists
  const historicalList = [];
  const years = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const seasons = ['PreMon', 'MidMon', 'PostMon', 'Winter'];
  
  years.forEach(yr => {
    seasons.forEach(sea => {
      const key = `${yr}_${sea}`;
      
      // Look up in user visit history
      let val = null;
      if (visitsHistory[selectedWell.well_number]?.[key]) {
        val = visitsHistory[selectedWell.well_number][key].value;
      }
      
      // Fallback to preloaded history
      if (val === null && selectedWell.history && selectedWell.history[key] !== undefined) {
        val = parseFloat(selectedWell.history[key]);
      }
      
      // Fallback to historical_trends block average
      if (val === null && historicalTrends && historicalTrends.blocks && selectedWell.block) {
        const blockNorm = normalizeBlockName(selectedWell.block);
        const blockStats = historicalTrends.blocks[blockNorm];
        if (blockStats && blockStats[key] !== undefined) {
          val = parseFloat(blockStats[key]);
        }
      }
      
      if (val !== null && !isNaN(val)) {
        historicalList.push({ season: key, value: val });
      }
    });
  });
  
  // 1. Calculate Mann-Kendall statistics
  const mkValues = historicalList.map(h => h.value);
  const mkStats = calculateMannKendallAndSensSlope(mkValues);
  
  document.getElementById('mk-s-val').textContent = mkStats.s;
  document.getElementById('mk-z-score').textContent = mkStats.z;
  document.getElementById('mk-p-val').textContent = mkStats.pValue;
  document.getElementById('mk-sens-slope').textContent = mkStats.sensSlope + ' m/year';
  
  const statusBox = document.getElementById('mk-trend-status');
  statusBox.textContent = mkStats.trendText;
  statusBox.style.backgroundColor = mkStats.trendColor;
  statusBox.style.color = '#fff';
  
  // 2. Generate Linear Projections
  const annualAverages = [];
  const yrSums = {};
  historicalList.forEach(item => {
    const yr = item.season.split('_')[0];
    if (!yrSums[yr]) yrSums[yr] = { sum: 0, count: 0 };
    yrSums[yr].sum += item.value;
    yrSums[yr].count++;
  });
  
  Object.entries(yrSums).forEach(([yr, s]) => {
    annualAverages.push({ year: parseInt(yr), value: s.sum / s.count });
  });
  annualAverages.sort((a,b) => a.year - b.year);
  
  const avgVals = annualAverages.map(a => a.value);
  
  // Linear Regression: Least Squares Fit
  const n = avgVals.length;
  let forecastHTML = '';
  let warningActive = false;
  
  if (n >= 2) {
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += avgVals[i];
      sumXY += i * avgVals[i];
      sumXX += i * i;
    }
    const m = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const c = (sumY - m * sumX) / n;
    
    // Project next 5 years (2027 to 2031)
    for (let yr = 2027; yr <= 2031; yr++) {
      const idx = yr - 2027 + n;
      const proj = m * idx + c;
      if (proj > 8.5) warningActive = true;
      
      forecastHTML += `
        <div class="forecast-row">
          <span class="forecast-year">${yr} Forecast</span>
          <span class="forecast-val" style="color: ${proj > 8.5 ? 'var(--danger)' : 'var(--text-main)'}">${proj.toFixed(2)} m</span>
        </div>
      `;
    }
  } else {
    forecastHTML = '<p class="text-muted text-center p-3">Insufficient historical average data to run projections.</p>';
  }
  
  document.getElementById('forecast-years-list').innerHTML = forecastHTML;
  const warningBox = document.getElementById('forecast-warning-box');
  if (warningActive) {
    warningBox.className = 'forecast-warning-box warning-active';
    warningBox.textContent = '⚠️ CRITICAL WARNING: Groundwater table depth is projected to deplete beyond safety threshold of 8.5 meters BGL within the next 5 years. Immediate regulation of extraction is recommended.';
  } else {
    warningBox.className = 'forecast-warning-box';
    warningBox.textContent = '✅ Stable Projections: Water table levels are forecasted to remain within stable and safe depths (<8.5m BGL).';
  }
  
  // 3. Render Chart.js Level Trends
  const labelColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  
  if (chartHistorical) {
    chartHistorical.destroy();
  }
  
  const ctxHist = document.getElementById('chart-historical-trends').getContext('2d');
  chartHistorical = new Chart(ctxHist, {
    type: 'line',
    data: {
      labels: historicalList.map(h => h.season.replace('_', ' ')),
      datasets: [{
        label: 'Depth to Water Table (m BGL)',
        data: historicalList.map(h => h.value),
        borderColor: '#0284c7',
        backgroundColor: 'rgba(2, 132, 199, 0.1)',
        borderWidth: 2,
        tension: 0.25,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: labelColor } },
        y: { reverse: true, grid: { color: gridColor }, ticks: { color: labelColor } }
      },
      plugins: {
        legend: { labels: { color: labelColor } }
      }
    }
  });
  
  // 4. Render Rainfall correlation dual-axis chart
  if (chartRainfall) {
    chartRainfall.destroy();
  }
  
  // Grab block rainfall data
  let rainList = [];
  if (rainfallData && rainfallData.blocks && selectedWell.block) {
    const blockNorm = normalizeBlockName(selectedWell.block);
    const blockRain = rainfallData.blocks[blockNorm];
    if (blockRain) {
      Object.entries(blockRain).forEach(([yr, val]) => {
        rainList.push({ year: parseInt(yr), rainfall: val });
      });
    }
  }
  rainList.sort((a,b) => a.year - b.year);
  
  const ctxRain = document.getElementById('chart-rainfall-correlation').getContext('2d');
  chartRainfall = new Chart(ctxRain, {
    type: 'bar',
    data: {
      labels: annualAverages.map(a => a.year),
      datasets: [
        {
          type: 'line',
          label: 'Avg Water Level (m BGL)',
          data: annualAverages.map(a => a.value),
          borderColor: '#ef4444',
          yAxisID: 'yLevel',
          borderWidth: 2,
          tension: 0.15
        },
        {
          type: 'bar',
          label: 'Annual Rainfall (mm)',
          data: annualAverages.map(a => {
            const match = rainList.find(r => r.year === a.year);
            return match ? match.rainfall : null;
          }),
          backgroundColor: 'rgba(56, 189, 248, 0.3)',
          yAxisID: 'yRain'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: labelColor } },
        yLevel: {
          type: 'linear',
          position: 'left',
          reverse: true,
          grid: { color: gridColor },
          ticks: { color: labelColor },
          title: { display: true, text: 'Water Level (m BGL)', color: labelColor }
        },
        yRain: {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: labelColor },
          title: { display: true, text: 'Rainfall (mm)', color: labelColor }
        }
      },
      plugins: {
        legend: { labels: { color: labelColor } }
      }
    }
  });
}

// --- News Feed rendering ---
function renderNews() {
  const container = document.getElementById('news-grid-container');
  container.innerHTML = '';
  
  newsArticles.forEach(art => {
    const card = document.createElement('article');
    card.className = 'news-card';
    card.innerHTML = `
      <div class="news-body">
        <span class="news-badge">${art.badge}</span>
        <h3>${art.title}</h3>
        <div class="news-meta">
          <span>By ${art.author}</span>
          <span>${art.date}</span>
        </div>
        <p class="news-snippet">${art.snippet}</p>
        <button class="news-btn">Read Article Brief ➔</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// --- Toast Messages ---
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast-message-box');
  const card = document.getElementById('toast-card-element');
  const txt = document.getElementById('toast-text-content');
  const icon = document.getElementById('toast-icon-svg');
  
  txt.textContent = message;
  card.className = 'toast-card ' + type;
  
  if (type === 'success') icon.textContent = '✅';
  else if (type === 'warning') icon.textContent = '⚠️';
  else icon.textContent = '❌';
  
  toast.classList.add('show-toast');
  setTimeout(() => {
    toast.classList.remove('show-toast');
  }, 4000);
}
