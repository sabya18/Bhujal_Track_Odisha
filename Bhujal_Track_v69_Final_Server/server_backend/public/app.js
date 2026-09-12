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
let selectedSeason = 'Pre-Monsoon';
let activeTab = 'dashboard';
let theme = localStorage.getItem('gw_theme') || 'dark'; // theme state

// Map & Table state
let mainMap = null;
let miniMap = null;
let boundaryLayer = null;
let miniBoundaryLayer = null;
let mainMarkersGroup = null;
let mapLabelsGroup = null;
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
  if (s.includes('angul')) return 'Angul';
  if (s.includes('balasore') || s.includes('baleshwar') || s.includes('balesore')) return 'Balasore';
  if (s.includes('bargarh')) return 'Bargarh';
  if (s.includes('bhadrak')) return 'Bhadrak';
  if (s.includes('bolangir') || s.includes('balangir')) return 'Bolangir';
  if (s.includes('boudh')) return 'Boudh';
  if (s.includes('cuttack')) return 'Cuttack';
  if (s.includes('deogarh') || s.includes('debagarh')) return 'Deogarh';
  if (s.includes('dhenkanal')) return 'Dhenkanal';
  if (s.includes('gajapati')) return 'Gajapati';
  if (s.includes('ganjam')) return 'Ganjam';
  if (s.includes('jagatsingh') || s.includes('jspur')) return 'Jagatsinghpur';
  if (s.includes('jajpur')) return 'Jajpur';
  if (s.includes('jharsug')) return 'Jharsuguda';
  if (s.includes('kalahandi')) return 'Kalahandi';
  if (s.includes('kandhamal')) return 'Kandhamal';
  if (s.includes('kendrapara')) return 'Kendrapara';
  if (s.includes('keonjhar') || s.includes('kendujhar')) return 'Keonjhar';
  if (s.includes('khurda') || s.includes('khordha')) return 'Khordha';
  if (s.includes('koraput')) return 'Koraput';
  if (s.includes('malkangiri')) return 'Malkangiri';
  if (s.includes('mayurbhanj')) return 'Mayurbhanj';
  if (s.includes('nabarang') || s.includes('nawarang')) return 'Nabarangpur';
  if (s.includes('nayagarh')) return 'Nayagarh';
  if (s.includes('nuapada')) return 'Nuapada';
  if (s.includes('puri')) return 'Puri';
  if (s.includes('rayagada')) return 'Rayagada';
  if (s.includes('sambal')) return 'Sambalpur';
  if (s.includes('subarnapur') || s.includes('sonepur')) return 'Subarnapur';
  if (s.includes('sundar') || s.includes('sunder')) return 'Sundargarh';
  return 'Other';
}

function getDistrictFromWell(well) {
  if (!well) return 'Other';
  if (well.district && typeof well.district === 'string' && well.district.trim()) {
    const raw = well.district.trim();
    const s = raw.toLowerCase().replace(/[\s_\.\-]+/g, '');
    if (s.includes('angul')) return 'Angul';
    if (s.includes('balasore') || s.includes('baleshwar') || s.includes('balesore')) return 'Balasore';
    if (s.includes('bargarh')) return 'Bargarh';
    if (s.includes('bhadrak')) return 'Bhadrak';
    if (s.includes('bolangir') || s.includes('balangir')) return 'Bolangir';
    if (s.includes('boudh') || s.includes('baudh')) return 'Boudh';
    if (s.includes('cuttack')) return 'Cuttack';
    if (s.includes('deogarh') || s.includes('debagarh')) return 'Deogarh';
    if (s.includes('dhenkanal')) return 'Dhenkanal';
    if (s.includes('gajapati')) return 'Gajapati';
    if (s.includes('ganjam')) return 'Ganjam';
    if (s.includes('jagatsingh') || s.includes('jspur')) return 'Jagatsinghpur';
    if (s.includes('jajpur')) return 'Jajpur';
    if (s.includes('jharsug')) return 'Jharsuguda';
    if (s.includes('kalahandi')) return 'Kalahandi';
    if (s.includes('kandhamal') || s.includes('phulbani')) return 'Kandhamal';
    if (s.includes('kendrapara')) return 'Kendrapara';
    if (s.includes('keonjhar') || s.includes('kendujhar')) return 'Keonjhar';
    if (s.includes('khurda') || s.includes('khordha')) return 'Khordha';
    if (s.includes('koraput')) return 'Koraput';
    if (s.includes('malkangiri')) return 'Malkangiri';
    if (s.includes('mayurbhanj')) return 'Mayurbhanj';
    if (s.includes('nabarang') || s.includes('nawarang')) return 'Nabarangpur';
    if (s.includes('nayagarh')) return 'Nayagarh';
    if (s.includes('nuapada')) return 'Nuapada';
    if (s.includes('puri')) return 'Puri';
    if (s.includes('rayagada')) return 'Rayagada';
    if (s.includes('sambal')) return 'Sambalpur';
    if (s.includes('subarnapur') || s.includes('sonepur')) return 'Subarnapur';
    if (s.includes('sundar') || s.includes('sunder')) return 'Sundargarh';
    return raw;
  }
  return getDistrictFromSheet(well.sheet);
}

function normalizeGeoJSONDistrict(distName) {
  if (!distName) return '';
  const d = distName.toLowerCase().replace(/[\s_\.\-]+/g, '');
  if (d.includes('angul') || d.includes('angl')) return 'angul';
  if (d.includes('balasore') || d.includes('baleshwar') || d.includes('balesore') || d.includes('baleswar') || d.includes('bls')) return 'balasore';
  if (d.includes('bargarh') || d.includes('brgh')) return 'bargarh';
  if (d.includes('bhadrak') || d.includes('bdrk')) return 'bhadrak';
  if (d.includes('bolangir') || d.includes('balangir') || d.includes('blgr')) return 'bolangir';
  if (d.includes('boudh') || d.includes('baudh') || d.includes('bdh')) return 'boudh';
  if (d.includes('cuttack') || d.includes('ctc')) return 'cuttack';
  if (d.includes('deogarh') || d.includes('debagarh') || d.includes('dgr')) return 'deogarh';
  if (d.includes('dhenkanal')) return 'dhenkanal';
  if (d.includes('gajapati') || d.includes('gjpt')) return 'gajapati';
  if (d.includes('ganjam') || d.includes('gnjm')) return 'ganjam';
  if (d.includes('jagatsingh') || d.includes('jspur') || d.includes('jtsgp')) return 'jagatsinghpur';
  if (d.includes('jajpur') || d.includes('jjp')) return 'jajpur';
  if (d.includes('jharsug') || d.includes('jsgd')) return 'jharsuguda';
  if (d.includes('kalahandi') || d.includes('klhd')) return 'kalahandi';
  if (d.includes('kandhamal') || d.includes('phulbani') || d.includes('kndh')) return 'kandhamal';
  if (d.includes('kendrapara') || d.includes('kdp')) return 'kendrapara';
  if (d.includes('keonjhar') || d.includes('kendujhar') || d.includes('kjr')) return 'keonjhar';
  if (d.includes('khurda') || d.includes('khordha') || d.includes('hordha') || d.includes('bhubaneswar') || d.includes('bbsr')) return 'khordha';
  if (d.includes('koraput') || d.includes('krpt')) return 'koraput';
  if (d.includes('malkangiri') || d.includes('mkgri')) return 'malkangiri';
  if (d.includes('mayurbhanj') || d.includes('mybh')) return 'mayurbhanj';
  if (d.includes('nabarang') || d.includes('nawarang') || d.includes('nbrg')) return 'nabarangpur';
  if (d.includes('nayagarh') || d.includes('nygh')) return 'nayagarh';
  if (d.includes('nuapada') || d.includes('npda')) return 'nuapada';
  if (d.includes('puri')) return 'puri';
  if (d.includes('rayagada') || d.includes('rygd')) return 'rayagada';
  if (d.includes('sambal') || d.includes('sbpr')) return 'sambalpur';
  if (d.includes('subarnapur') || d.includes('sonepur') || d.includes('subrn')) return 'subarnapur';
  if (d.includes('sundar') || d.includes('sunder') || d.includes('sndg')) return 'sundargarh';
  return d.replace(/_blocks/g, '').replace(/_urban/g, '').trim();
}

const BLOCK_ALIASES = {
  'ambabhona': 'ambabhana',
  'athagad': 'athgarh',
  'athmallik': 'athamallik',
  'balangir': 'bolangir',
  'baleswar': 'balasore',
  'baneigarh': 'boneigarh',
  'bangiriposhi': 'bangriposi',
  'bangiriposi': 'bangriposi',
  'bankidampara': 'banki',
  'banspal': 'bansapal',
  'bant': 'bonth',
  'bonth': 'bonth',
  'baragaon': 'bargaon',
  'barang': 'baranga',
  'barkot': 'barkote',
  'barpali': 'barpalli',
  'barapali': 'barpalli',
  'barsahi': 'badasahi',
  'basudebpur': 'basudevpur',
  'beguniapada': 'kodalabeguniapada',
  'bellaguntha': 'belaguntha',
  'belpara': 'belpada',
  'betanati': 'betnoti',
  'bhograi': 'bhogarai',
  'bijatola': 'bijatala',
  'binjharpur': 'binjharapur',
  'biramaharajpur': 'biramaharajapur',
  'boipariguda': 'baipariguda',
  'bolagad': 'bolagarh',
  'borigumma': 'boriguma',
  'bramhagiri': 'brahmagiri',
  'chakapad': 'chakapada',
  'chhatrapur': 'chatrapur',
  'cuttacksadar': 'cuttack',
  'dabugan': 'dabugaon',
  'daringbadi': 'daringibadi',
  'dasamantapur': 'dusmantapur',
  'derabisi': 'derabish',
  'derbish': 'derabish',
  'dhamanagar': 'dhamnagar',
  'dharamgarh': 'dharmagarh',
  'dunguripali': 'dunguripalli',
  'ersama': 'erasama',
  'gandia': 'goundia',
  'garadpur': 'garadapur',
  'ghatgaon': 'ghatagaon',
  'gopabandhunagar': 'gbnagar',
  'hemgiri': 'hemagiri',
  'jagannathprasad': 'jaganathprasad',
  'jagatsinghapurp': 'jagatsinghpur',
  'jajapur': 'jajpur',
  'jashipur': 'joshipur',
  'jayapatna': 'jaipatna',
  'jharigan': 'jharigaon',
  'jujomura': 'jujumura',
  'kalyanasingpur': 'kalyansinghpur',
  'kankadahad': 'kankadahada',
  'kashipur': 'kasipur',
  'kasinagar': 'kashinagar',
  'kendujhar': 'keonjhar',
  'khairput': 'khairaput',
  'khallikote': 'khalikote',
  'khordha': 'khurda',
  'koida': 'koira',
  'kokasara': 'koksara',
  'kolabira': 'kulabira',
  'korkunda': 'korukonda',
  'kosagumuda': 'kasagumuda',
  'kotagarh': 'kotgarh',
  'kotagadh': 'kotgarh',
  'kuanrmunda': 'kuarmunda',
  'kudumulguma': 'chitrakonda',
  'chitrkonda': 'chitrakonda',
  'kujang': 'kujanga',
  'lahunipara': 'lahunipada',
  'lakshmipur': 'laxmipur',
  'lephripara': 'lephripada',
  'loisinga': 'loisingha',
  'madanpurrampur': 'mrampur',
  'marsaghai': 'marshaghai',
  'marsaghal': 'marshaghai',
  'marsaghau': 'marshaghai',
  'muruda': 'morada',
  'naktideul': 'naktideol',
  'narasinghpur': 'narsinghpur',
  'nilagiri': 'nilgiri',
  'odapada': 'odopada',
  'paikmal': 'paikamal',
  'palalahada': 'pallahara',
  'paparahandi': 'papadahandi',
  'parajang': 'parjanga',
  'paralakhemundi': 'gosani',
  'patana': 'patna',
  'puri': 'purisadar',
  'rudaygiri': 'rudayagiri',
  'raighar': 'raigar',
  'rairangpur': 'rairangapur',
  'rajagangapur': 'rajgangapur',
  'rajborasambar': 'padampur',
  'rajkanika': 'rajakanika',
  'ramanguda': 'ramanaguda',
  'rasagovindpur': 'rasgovindpur',
  'reamal': 'riamal',
  'saraskana': 'sarasakana',
  'seragad': 'sheragada',
  'shamakhunta': 'samakhunta',
  'sohella': 'sohela',
  'sonepur': 'sonpur',
  'sundargarh': 'sundergarh',
  'tangarapali': 'tangarapalli',
  'tarbha': 'tarabha',
  'tentulikhuntigudvella': 'gudvella',
  'thuamulrampur': 'thrampur',
  'titilagarh': 'titlagarh',
  'turekela': 'tureikella',
  'ulunda': 'ullunda',
  'umarkote': 'umerkote'
};

function normalizeGeoJSONBlock(raw) {
  if (!raw) return '';
  const s = raw.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  return BLOCK_ALIASES[s] || s;
}
window.normalizeGeoJSONBlock = normalizeGeoJSONBlock;

function normalizeBlockName(blockName) {
  if (!blockName) return '';
  return normalizeGeoJSONBlock(blockName);
}

function isActiveWell(well) {
  if (!well) return false;
  const status = (well.remarks || '').toLowerCase().trim();
  if (status === 'active') return true;
  if (status === 'inactive' || status === 'closed') return false;
  return well.sl_no ? well.sl_no <= 1535 : true;
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
  initAdvancedExportFeatures();
  
  // Set up User profile display
  const loggedUser = document.getElementById('lbl-logged-user');
  if (loggedUser) {
    loggedUser.textContent = sessionStorage.getItem('gwd_username') || 'GWD Officer';
  }
  
  // Set up Logout button handler
  const logoutBtn = document.getElementById('btn-logout-sidebar');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      sessionStorage.clear();
      try {
        await fetch('api/logout', { method: 'POST' });
      } catch (e) {}
      window.location.href = 'login.html';
    };
  }
  
  // Show Loading state
  setConnectionStatus('loading', 'Loading Map Boundaries & Databases...');
  
  await loadAllData();
  
  setConnectionStatus('connected', 'Connected');
  
  // Render initially
  renderDashboard();
  populateFilterDropdowns();
  applyFilters();
  renderNews();
  window.populateTrendsDropdown = function() {
    if (typeof initTrendsView === 'function') initTrendsView();
  };
  populateTrendsDropdown();
});

// --- Load Databases ---
async function loadAllData() {
  try {
    // 1. Fetch wells from server API or static wells fallback
    let fetchedWells = [];
    if (!isStandaloneMode) {
      const res = await fetch('api/wells');
      if (res.status === 401) {
        sessionStorage.clear();
        window.location.href = 'login.html';
        return;
      }
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
    
    // Fetch central visits history from PostgreSQL server
    if (!isStandaloneMode) {
      try {
        const historyRes = await fetch('api/visits/history');
        if (historyRes.ok) {
          const serverHistory = await historyRes.json();
          visitsHistory = { ...visitsHistory, ...serverHistory };
        }
      } catch (err) {
        console.log("Could not fetch visits history from Postgres, using local memory:", err);
      }
    }
    
    // 2. Fetch GeoJSON boundaries
    const distRes = await fetch('data/odisha_districts_complete.json');
    odishaDistrictsGeoJSON = await distRes.json();
    
    const blockRes = await fetch('data/ODISHA_BLOCK_BOUNDARY.geojson');
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

    // Merge WTTO preloaded history & stations into wellsData for 100% data parity
    if (wttoData && Array.isArray(wttoData)) {
      const wttoMap = new Map();
      wttoData.forEach(w => {
        if (w && w.well_number) wttoMap.set(w.well_number, w);
      });
      
      if (!wellsData || wellsData.length === 0) {
        wellsData = wttoData;
      } else {
        wellsData.forEach(w => {
          if (w && w.well_number && wttoMap.has(w.well_number)) {
            const wttoItem = wttoMap.get(w.well_number);
            if (!w.history && wttoItem.history) {
              w.history = wttoItem.history;
            }
          }
        });
        const existingSet = new Set((wellsData || []).map(w => w.well_number));
        wttoData.forEach(w => {
          if (w && w.well_number && !existingSet.has(w.well_number)) {
            wellsData.push(w);
          }
        });
      }
    }

    console.log("All data assets fetched and initialized successfully!");
  } catch (err) {
    console.error("Failed to load databases. Falling back to preloaded caches:", err);
    // If local caches exist, load them
    if (typeof initialWellsData !== 'undefined') {
      wellsData = initialWellsData;
    }
  }
  
  // Normalize lat/lon to latitude/longitude
  if (wellsData && Array.isArray(wellsData)) {
    wellsData.forEach(w => {
      if (w.lat !== undefined && w.latitude === undefined) w.latitude = w.lat;
      if (w.lon !== undefined && w.longitude === undefined) w.longitude = w.lon;
    });
  }
}

// --- Theme Switcher ---
function setupThemeToggle() {
  const toggleBtn = document.getElementById('btn-toggle-theme');
  
  // Apply saved theme state on load
  if (theme === 'light') {
    document.body.className = 'light-theme';
    if (toggleBtn) toggleBtn.textContent = '☀️ Light Theme';
  } else {
    document.body.className = 'dark-theme';
    if (toggleBtn) toggleBtn.textContent = '🌙 Dark Theme';
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (theme === 'dark') {
        document.body.className = 'light-theme';
        theme = 'light';
        localStorage.setItem('gw_theme', 'light');
        toggleBtn.textContent = '☀️ Light Theme';
      } else {
        document.body.className = 'dark-theme';
        theme = 'dark';
        localStorage.setItem('gw_theme', 'dark');
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
    } else if (activeTab === 'telemetry-view') {
      setTimeout(() => initTelemetryMap(), 100);
      populateTelemetryFilters();
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
function getUserDivision() {
  return sessionStorage.getItem('gwd_user_division') || 'ALL';
}

function updateDivisionBadge() {
  const userDiv = getUserDivision();
  const badgeText = document.getElementById('lbl-user-division-name');
  const badgeContainer = document.getElementById('val-user-division-badge');
  const subTitle = document.getElementById('lbl-sidebar-subtitle');

  if (subTitle) {
    if (userDiv === 'ALL') {
      subTitle.textContent = 'GWD Odisha';
    } else {
      subTitle.textContent = `GWD Odisha (${userDiv.replace(' DIVISION', '')})`;
    }
  }

  if (badgeText) {
    if (userDiv === 'ALL') {
      badgeText.textContent = 'Statewide Scope (ALL)';
      if (badgeContainer) {
        const iconSpan = badgeContainer.querySelector('span');
        if (iconSpan) iconSpan.textContent = '🌐';
      }
    } else {
      badgeText.textContent = userDiv;
      if (badgeContainer) {
        const iconSpan = badgeContainer.querySelector('span');
        if (iconSpan) iconSpan.textContent = '🏢';
      }
    }
  }
}

const getDivisionForDistrict = (district) => {
  if (!district) return null;
  const d = district.toLowerCase().replace(/[\s_\.\-]+/g, '');
  if (d.includes('cuttack') || d.includes('jajpur') || d.includes('kendrapara') || d.includes('jagatsingh') || d.includes('jspur')) return 'CUTTACK DIVISION';
  if (d.includes('balasore') || d.includes('baleshwar') || d.includes('balesore') || d.includes('bhadrak') || d.includes('mayurbhanj') || d.includes('keonjhar') || d.includes('kendujhar')) return 'BARIPADA DIVISION';
  if (d.includes('ganjam') || d.includes('gajapati')) return 'BERHAMPUR DIVISION';
  if (d.includes('sambal') || d.includes('jharsug') || d.includes('sundar') || d.includes('sunder') || d.includes('deogarh') || d.includes('debagarh')) return 'SAMBALPUR DIVISION';
  if (d.includes('bolangir') || d.includes('balangir') || d.includes('bargarh') || d.includes('subarnapur') || d.includes('sonepur')) return 'BOLANGIR DIVISION';
  if (d.includes('koraput') || d.includes('malkangiri')) return 'KORAPUT DIVISION';
  if (d.includes('kalahandi') || d.includes('nuapada') || d.includes('nabarang') || d.includes('nawarang')) return 'BHAWANIPATNA DIVISION';
  if (d.includes('angul') || d.includes('dhenkanal')) return 'ANGUL DIVISION';
  if (d.includes('puri') || d.includes('nayagarh')) return 'RS DIVISION';
  if (d.includes('khordha') || d.includes('khurda')) return 'AD HP DIVISION';
  if (d.includes('phulbani') || d.includes('kandhamal') || d.includes('boudh') || d.includes('baudh')) return 'PHULBANI DIVISION';
  if (d.includes('rayagada')) return 'RAYAGADA DIVISION';
  return null;
};

function getScopedWellsData() {
  const userDiv = getUserDivision();
  if (userDiv === 'ALL') return wellsData;
  return wellsData.filter(well => {
    const dist = getDistrictFromWell(well);
    const div = getDivisionForDistrictLocal(dist);
    if (userDiv === div) return true;
    if ((userDiv === 'BARIPADA DIVISION' || userDiv === 'BALASORE DIVISION') && (div === 'BARIPADA DIVISION' || div === 'BALASORE DIVISION')) return true;
    return false;
  });
}

function renderDashboard() {
  updateDivisionBadge();
  const targetWells = getScopedWellsData();

  // Calculate Stats
  let total = 0;
  let active = 0;
  let monitored = 0;
  let pending = 0;
  
  const statsByDistrict = {};
  
  targetWells.forEach(well => {
    const dist = getDistrictFromWell(well);
    if (!statsByDistrict[dist]) {
      statsByDistrict[dist] = { total: 0, active: 0, monitored: 0, sumMbgl: 0, countMbgl: 0 };
    }
    
    total++;
    statsByDistrict[dist].total++;
    
    // Active monitoring network wells based on status column (remarks == 'Active')
    const isPrimaryActive = isActiveWell(well);
    if (isPrimaryActive) {
      active++;
      statsByDistrict[dist].active++;
    }

    const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
    if (seasonal.dtgwl_mbgl !== null) {
      monitored++;
      statsByDistrict[dist].monitored++;
      statsByDistrict[dist].sumMbgl += seasonal.dtgwl_mbgl;
      statsByDistrict[dist].countMbgl++;
    }
  });
  
  // Pending visits are remaining primary active wells requiring completion
  pending = Math.max(0, active - monitored);

  document.getElementById('val-total-wells').textContent = total;
  document.getElementById('val-active-wells').textContent = active;
  document.getElementById('val-monitored-wells').textContent = monitored;
  document.getElementById('val-pending-wells').textContent = pending;
  
  const percent = active > 0 ? Math.round((monitored / active) * 100) : 0;
  document.getElementById('val-monitored-percent').textContent = `${percent}% of active wells completed`;
  
  // Render district breakdown list or selected block list
  if (selectedDashboardDistrict) {
    filterDashboardBlocks(selectedDashboardDistrict);
  } else {
    renderDistrictBreakdown(statsByDistrict);
  }
  
  renderDashboardMap(statsByDistrict);
}

let selectedDashboardDistrict = null;

function resetDashboardDistrict() {
  selectedDashboardDistrict = null;
  renderDashboard();
}

function selectDashboardDistrict(distName) {
  selectedDashboardDistrict = distName;
  filterDashboardBlocks(distName);
}

function renderDistrictBreakdown(statsByDistrict) {
  const detailsTitle = document.getElementById('lbl-block-details-title');
  if (detailsTitle) detailsTitle.textContent = 'District Details (All Division)';
  
  const breakdownList = document.getElementById('district-breakdown-list');
  if (!breakdownList) return;
  breakdownList.innerHTML = '';
  
  const sortedDistricts = Object.keys(statsByDistrict).sort();
  sortedDistricts.forEach(dist => {
    const d = statsByDistrict[dist];
    if (d.active === 0) return;
    
    const pct = Math.round((d.monitored / d.active) * 100);
    const avgVal = d.countMbgl > 0 ? (d.sumMbgl / d.countMbgl) : null;
    const avgStr = avgVal !== null ? avgVal.toFixed(2) + ' m' : 'No Data';
    
    let barColor = getCompletionColor(pct);
    let primaryHeader = `<span style="font-weight:600;">${dist}</span><span style="font-size:0.8rem; color:var(--text-muted);">Avg Level: <strong>${avgStr}</strong></span>`;
    let subHeader = `<span>Completion: ${d.monitored} / ${d.active} wells</span><span>${pct}%</span>`;
    
    if (dashboardMapMode === 'depth') {
      barColor = avgVal !== null ? getDepthColor(avgVal) : (theme === 'dark' ? '#334155' : '#cbd5e1');
      primaryHeader = `<span style="font-weight:600;">${dist}</span><span style="font-size:0.85rem; color:${barColor}; font-weight:700;">Avg: ${avgStr}</span>`;
      subHeader = `<span>Completion: ${d.monitored} / ${d.active} wells (${pct}%)</span><span>Depth BGL</span>`;
    }
    
    const rowHtml = `
      <div class="district-row" onclick="selectDashboardDistrict('${dist}')" style="cursor:pointer;" title="Click to view ${dist} block breakdown">
        <div class="district-label-row">
          ${primaryHeader}
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">
          ${subHeader}
        </div>
        <div style="width:100%; height:6px; background:var(--border-color); border-radius:3px; overflow:hidden;">
          <div style="width:${dashboardMapMode === 'depth' ? Math.max(8, Math.min(100, (avgVal || 0) * 10)) : pct}%; height:100%; background:${barColor}; border-radius:3px;"></div>
        </div>
      </div>
    `;
    breakdownList.innerHTML += rowHtml;
  });
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
    scrollWheelZoom: true,
    dragging: true
  }).setView([20.4, 84.5], 6.5);

  // Baselayers
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 });
  const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
  const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17 });

  if (isDark) {
    darkLayer.addTo(miniMap);
  } else {
    osmLayer.addTo(miniMap);
  }

  const baseMaps = {
    "🌐 Streets": osmLayer,
    "🛰️ Satellite": satelliteLayer,
    "🌙 Dark": darkLayer,
    "🏔️ Terrain": topoLayer
  };
  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(miniMap);
  
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
        weight: 1.5,
        fillColor: data ? data.color : (isDark ? '#1e293b' : '#e2e8f0'),
        fillOpacity: data ? 0.45 : 0.20
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

      layer.on('mouseover', function() {
        this.setStyle({ fillOpacity: 0.75, weight: 2.5 });
      });
      layer.on('mouseout', function() {
        miniBoundaryLayer.resetStyle(this);
      });
      
      layer.on('click', () => {
        selectDashboardDistrict(rawName);
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
  const normTarget = normalizeGeoJSONDistrict(districtName);
  const detailsTitle = document.getElementById('lbl-block-details-title');
  if (detailsTitle) detailsTitle.textContent = `Block Details (${districtName})`;

  const breakdownList = document.getElementById('district-breakdown-list');
  if (!breakdownList) return;
  breakdownList.innerHTML = '';
  
  const blocksMap = {};
  getScopedWellsData().forEach(well => {
    const dist = getDistrictFromWell(well);
    if (normalizeGeoJSONDistrict(dist) === normTarget && well.block) {
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
    breakdownList.innerHTML = `
      <button class="btn btn-secondary btn-sm mb-3" onclick="resetDashboardDistrict()">
        ◀ Reset to All Division
      </button>
      <p class="text-muted p-3">No active blocks found for ${districtName}.</p>
    `;
    return;
  }
  
  // Add Reset button
  breakdownList.innerHTML += `
    <button class="btn btn-secondary btn-sm mb-3" onclick="resetDashboardDistrict()">
      ◀ Reset to All Division
    </button>
  `;
  
  sortedBlocks.forEach(block => {
    const b = blocksMap[block];
    if (b.active === 0) return;
    
    const pct = Math.round((b.monitored / b.active) * 100);
    const avgVal = b.countMbgl > 0 ? (b.sumMbgl / b.countMbgl) : null;
    const avgStr = avgVal !== null ? avgVal.toFixed(2) + ' m' : 'No Data';

    let barColor = getCompletionColor(pct);
    let primaryHeader = `<span style="font-weight:600;">${block} Block</span><span style="font-size:0.8rem; color:var(--text-muted);">Avg: <strong>${avgStr}</strong></span>`;
    let subHeader = `<span>Completion: ${b.monitored} / ${b.active} wells</span><span>${pct}%</span>`;
    
    if (dashboardMapMode === 'depth') {
      barColor = avgVal !== null ? getDepthColor(avgVal) : (theme === 'dark' ? '#334155' : '#cbd5e1');
      primaryHeader = `<span style="font-weight:600;">${block} Block</span><span style="font-size:0.85rem; color:${barColor}; font-weight:700;">Avg: ${avgStr}</span>`;
      subHeader = `<span>Completion: ${b.monitored} / ${b.active} wells (${pct}%)</span><span>Depth BGL</span>`;
    }
    
    const rowHtml = `
      <div class="district-row">
        <div class="district-label-row">
          ${primaryHeader}
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">
          ${subHeader}
        </div>
        <div style="width:100%; height:6px; background:var(--border-color); border-radius:3px; overflow:hidden;">
          <div style="width:${dashboardMapMode === 'depth' ? Math.max(8, Math.min(100, (avgVal || 0) * 10)) : pct}%; height:100%; background:${barColor}; border-radius:3px;"></div>
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
let showStationMarkers = true;

function updateMapLegend() {
  const legendDiv = document.querySelector('#leaflet-map-element .map-legend-control');
  const sidebarLegendDiv = document.querySelector('.map-filters-panel .map-legend');
  const isDark = theme === 'dark';
  const statusFilter = document.getElementById('map-filter-status')?.value || 'ACTIVE_PENDING';

  // 1. Update Left Sidebar Legend panel dynamically
  if (sidebarLegendDiv) {
    let sidebarHtml = '<h4>Legend</h4>';
    if (statusFilter === 'MONITORED' || statusFilter === 'ACTIVE_ALL' || statusFilter === 'ALL') {
      sidebarHtml += `<div class="legend-item"><span class="legend-color pin-green" style="box-shadow: 0 0 6px rgba(16,185,129,0.6);"></span><span>Monitored Active Well</span></div>`;
    }
    if (statusFilter === 'ACTIVE_PENDING' || statusFilter === 'ACTIVE_ALL' || statusFilter === 'ALL') {
      sidebarHtml += `<div class="legend-item"><span class="legend-color pin-red" style="box-shadow: 0 0 6px rgba(239,68,68,0.6);"></span><span>Pending Active Well (Needs Visit)</span></div>`;
    }
    if (statusFilter === 'CLOSED' || statusFilter === 'ALL') {
      sidebarHtml += `<div class="legend-item"><span class="legend-color pin-grey"></span><span>Closed Well</span></div>`;
    }
    sidebarLegendDiv.innerHTML = sidebarHtml;
  }

  // 2. Update Lower-Right Leaflet Control Legend
  if (!legendDiv) return;

  if (!showStationMarkers && !showWaterDepthMap) {
    legendDiv.style.display = 'none';
    return;
  }
  
  legendDiv.style.display = 'block';
  legendDiv.style.backgroundColor = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  legendDiv.style.border = '1px solid ' + (isDark ? '#334155' : '#cbd5e1');
  legendDiv.style.color = isDark ? '#f8fafc' : '#0f172a';

  let html = '';
  if (showWaterDepthMap) {
    html += `
      <div style="font-weight:700; font-size:10px; margin-bottom:5px; letter-spacing:0.5px; text-transform:uppercase; color:${isDark ? '#94a3b8' : '#64748b'};">WATER TABLE DEPTH</div>
      <div style="display:flex; align-items:center; margin-bottom:3px;"><span style="width:12px; height:12px; background:#0284c7; border-radius:2px; margin-right:6px; display:inline-block;"></span>&lt; 2.0 m (Shallow)</div>
      <div style="display:flex; align-items:center; margin-bottom:3px;"><span style="width:12px; height:12px; background:#10b981; border-radius:2px; margin-right:6px; display:inline-block;"></span>2.0 - 4.0 m</div>
      <div style="display:flex; align-items:center; margin-bottom:3px;"><span style="width:12px; height:12px; background:#f59e0b; border-radius:2px; margin-right:6px; display:inline-block;"></span>4.0 - 6.0 m</div>
      <div style="display:flex; align-items:center; margin-bottom:3px;"><span style="width:12px; height:12px; background:#f97316; border-radius:2px; margin-right:6px; display:inline-block;"></span>6.0 - 8.0 m</div>
      <div style="display:flex; align-items:center; margin-bottom:5px;"><span style="width:12px; height:12px; background:#ef4444; border-radius:2px; margin-right:6px; display:inline-block;"></span>&gt; 8.0 m (Depleted)</div>
    `;
  }

  if (showStationMarkers) {
    if (showWaterDepthMap) {
      html += `<div style="height:1px; background:${isDark ? '#334155' : '#cbd5e1'}; margin:6px 0;"></div>`;
    }
    html += `<div style="font-weight:700; font-size:10px; margin-bottom:5px; letter-spacing:0.5px; text-transform:uppercase; color:${isDark ? '#94a3b8' : '#64748b'};">STATION SYMBOLS</div>`;

    const monitoredSymbol = `<div style="display:flex; align-items:center; margin-bottom:4px;"><span style="width:10px; height:10px; background:#10b981; border-radius:50%; border:1.5px solid #ffffff; margin-right:6px; display:inline-block; box-shadow:0 0 4px rgba(16,185,129,0.6);"></span>Monitored Active Station</div>`;
    const pendingSymbol = `<div style="display:flex; align-items:center; margin-bottom:4px;"><span style="width:10px; height:10px; background:#ef4444; border-radius:50%; border:1.5px solid #ffffff; margin-right:6px; display:inline-block; box-shadow:0 0 4px rgba(239,68,68,0.6);"></span>Pending Visit (Unmonitored)</div>`;
    const closedSymbol = `<div style="display:flex; align-items:center;"><span style="width:10px; height:10px; background:#94a3b8; border-radius:50%; border:1.5px solid #ffffff; margin-right:6px; display:inline-block;"></span>Closed / Inactive Station</div>`;

    if (statusFilter === 'MONITORED') {
      html += monitoredSymbol;
    } else if (statusFilter === 'ACTIVE_PENDING') {
      html += pendingSymbol;
    } else if (statusFilter === 'CLOSED') {
      html += closedSymbol;
    } else if (statusFilter === 'ACTIVE_ALL') {
      html += monitoredSymbol + pendingSymbol;
    } else { // 'ALL'
      html += monitoredSymbol + pendingSymbol + closedSymbol;
    }
  }

  legendDiv.innerHTML = html;
}
window.updateMapLegend = updateMapLegend;

function initMap() {
  const mapElement = document.getElementById('leaflet-map-element');
  if (!mapElement || !odishaDistrictsGeoJSON) return;
  
  if (mainMap) {
    mainMap.remove();
  }
  
  const isDark = theme === 'dark';
  const background = isDark ? '#0b0f19' : '#f8fafc';
  const border = isDark ? '#f8fafc' : '#0f172a';
  
  mainMap = L.map('leaflet-map-element', {
    zoomControl: true,
    attributionControl: false
  }).setView([20.4, 84.5], 7);

  mainMap.on('zoomend', plotMarkersOnMap);

  // Baselayers
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 });
  const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
  const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17 });

  if (isDark) {
    darkLayer.addTo(mainMap);
  } else {
    osmLayer.addTo(mainMap);
  }

  const baseMaps = {
    "🌐 Streets": osmLayer,
    "🛰️ Satellite": satelliteLayer,
    "🌙 Dark": darkLayer,
    "🏔️ Terrain": topoLayer
  };
  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(mainMap);
  
  mapLabelsGroup = L.layerGroup().addTo(mainMap);

  // Lower-Right Station Map Legend Control
  const legendControl = L.control({ position: 'bottomright' });
  legendControl.onAdd = function() {
    const div = L.DomUtil.create('div', 'map-legend-control');
    div.style.backgroundColor = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    div.style.padding = '10px 12px';
    div.style.border = '1px solid ' + (isDark ? '#334155' : '#cbd5e1');
    div.style.borderRadius = '10px';
    div.style.color = isDark ? '#f8fafc' : '#0f172a';
    div.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    div.style.fontSize = '11px';
    div.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    div.style.marginRight = '12px';
    div.style.marginBottom = '12px';

    setTimeout(() => updateMapLegend(), 10);
    return div;
  };
  legendControl.addTo(mainMap);
  
  // Calculate average water levels per district
  const districtAverages = {};
  getScopedWellsData().forEach(well => {
    if (isActiveWell(well)) {
      const dist = getDistrictFromWell(well);
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

  // Calculate average water levels per block
  const blockAverages = {};
  getScopedWellsData().forEach(well => {
    if (isActiveWell(well)) {
      const blockKey = normalizeGeoJSONBlock(well.block);
      if (blockKey) {
        if (!blockAverages[blockKey]) {
          blockAverages[blockKey] = { sum: 0, count: 0 };
        }
        const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
        if (seasonal.dtgwl_mbgl !== null) {
          blockAverages[blockKey].sum += seasonal.dtgwl_mbgl;
          blockAverages[blockKey].count++;
        }
      }
    }
  });
  
  // Determine if block overlay is visible
  const blocksOverlayActive = showBlocksOverlay && odishaBlocksGeoJSON;
  
  // Render persistent State Perimeter Boundary Outline
  if (odishaDistrictsGeoJSON) {
    L.geoJSON(odishaDistrictsGeoJSON, {
      style: {
        color: isDark ? '#f8fafc' : '#000000',
        weight: 3.8,
        opacity: 0.9,
        fill: false,
        interactive: false
      }
    }).addTo(mainMap);
  }

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
          weight: 2.4,
          opacity: 1.0,
          fillColor: avg !== null ? getDepthColor(avg) : (isDark ? '#1e293b' : '#cbd5e1'),
          fillOpacity: blocksOverlayActive ? 0.25 : (avg !== null ? 0.85 : 0.2) // dim districts if blocks are on top
        };
      },
      onEachFeature: (feature, layer) => {
        const rawName = feature.properties.Dist_Name || feature.properties.dtname || 'Unknown';
        const key = normalizeGeoJSONDistrict(rawName);
        const data = districtAverages[key];
        const avg = data && data.count > 0 ? (data.sum / data.count).toFixed(2) : null;
        
        layer.bindTooltip(`District: ${rawName}<br/>Water level: ${avg ? avg + ' m BGL' : 'No Data'}`, { sticky: true });
        
        // Add district labels ONLY if block overlay is not active (to prevent text overlap)
        if (!blocksOverlayActive) {
          try {
            const bounds = layer.getBounds();
            if (bounds && typeof bounds.getCenter === 'function') {
              const center = bounds.getCenter();
              if (center && center.lat && center.lng) {
                L.marker(center, {
                  icon: L.divIcon({
                    className: 'map-centroid-label district-centroid-label',
                    html: `<div class="centroid-text">${rawName}</div>`,
                    iconSize: [100, 20],
                    iconAnchor: [50, 10]
                  })
                }).addTo(mapLabelsGroup);
              }
            }
          } catch (err) {
            console.warn("Failed to plot district label:", err);
          }
        }
        
        layer.on('click', () => {
          mainMap.fitBounds(layer.getBounds());
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
    L.geoJSON(odishaDistrictsGeoJSON, {
      style: {
        color: border,
        weight: 2.4,
        opacity: 0.95,
        fillColor: 'transparent',
        fillOpacity: 0
      }
    }).addTo(mainMap);
  }
  
  // 2. Draw blocks overlay with color-coding and labels if enabled
  if (blocksOverlayActive) {
    boundaryLayer = L.geoJSON(odishaBlocksGeoJSON, {
      style: feature => {
        const rawBlock = feature.properties.BLK_NAME01 || feature.properties.Block_Name || feature.properties.blockname || feature.properties.sdtname || feature.properties.NAME || feature.properties.name || '';
        const blockKey = normalizeGeoJSONBlock(rawBlock);
        const data = blockAverages[blockKey];
        const avg = data && data.count > 0 ? (data.sum / data.count) : null;
        
        return {
          color: isDark ? '#38bdf8' : '#0284c7',
          weight: 1,
          dashArray: '3, 3',
          fillColor: avg !== null ? getDepthColor(avg) : 'transparent',
          fillOpacity: avg !== null ? 0.7 : 0
        };
      },
      onEachFeature: (feature, layer) => {
        const rawBlock = feature.properties.BLK_NAME01 || feature.properties.Block_Name || feature.properties.blockname || feature.properties.sdtname || feature.properties.NAME || feature.properties.name || 'Unknown';
        const blockKey = normalizeGeoJSONBlock(rawBlock);
        const data = blockAverages[blockKey];
        const avg = data && data.count > 0 ? (data.sum / data.count).toFixed(2) : null;
        
        layer.bindTooltip(`Block: ${rawBlock}<br/>Water level: ${avg ? avg + ' m BGL' : 'No Data'}`, { sticky: true });
        
        // Add block labels ONLY when zoomed into a district (zoom >= 9) or if a specific district is filtered
        const currentZoomVal = mainMap ? mainMap.getZoom() : 7;
        const currentDistFilter = document.getElementById('map-filter-district') ? document.getElementById('map-filter-district').value : 'ALL';
        if (currentZoomVal >= 9 || currentDistFilter !== 'ALL') {
          try {
            const bounds = layer.getBounds();
            if (bounds && typeof bounds.getCenter === 'function') {
              const center = bounds.getCenter();
              if (center && center.lat && center.lng) {
                L.marker(center, {
                  icon: L.divIcon({
                    className: 'map-centroid-label block-centroid-label',
                    html: `<div class="centroid-text block-text">${rawBlock}</div>`,
                    iconSize: [80, 16],
                    iconAnchor: [40, 8]
                  })
                }).addTo(mapLabelsGroup);
              }
            }
          } catch (err) {
            console.warn("Failed to plot block label:", err);
          }
        }
        
        layer.on('click', () => {
          mainMap.fitBounds(layer.getBounds());
          openBlockAnalyticsModal(rawBlock, blockKey, feature.properties);
        });
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
  
  if (!showStationMarkers) {
    return; // Don't plot circle markers when checkbox is unchecked
  }

  const currentZoom = mainMap ? mainMap.getZoom() : 7;
  const baseRadius = currentZoom <= 7 ? 4.0 : (currentZoom === 8 ? 5.5 : 7.5);
  const strokeWeight = currentZoom <= 7 ? 1.2 : 1.8;

  const districtFilter = document.getElementById('map-filter-district').value;
  const blockFilter = document.getElementById('map-filter-block').value;
  const statusFilter = document.getElementById('map-filter-status').value;
  const query = document.getElementById('map-search-input').value.toLowerCase();
  
  getScopedWellsData().forEach(well => {
    const dist = getDistrictFromSheet(well.sheet);
    const isAct = isActiveWell(well);
    const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
    const isMon = seasonal.dtgwl_mbgl !== null;
    
    // Filter matching
    if (districtFilter !== 'ALL' && dist !== districtFilter) return;
    if (blockFilter !== 'ALL' && well.block !== blockFilter && normalizeGeoJSONBlock(well.block) !== normalizeGeoJSONBlock(blockFilter)) return;
    
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
      // Determine pin color based on exact depth if monitored, otherwise status
      let color = '#94a3b8'; // Grey (Closed)
      let tooltipValText = 'No Data';
      if (isAct) {
        if (isMon) {
          color = getDepthColor(seasonal.dtgwl_mbgl);
          tooltipValText = `${seasonal.dtgwl_mbgl} m BGL`;
        } else {
          color = '#ef4444'; // Red if Pending
          tooltipValText = 'Pending';
        }
      }
      
      const marker = L.circleMarker([well.latitude, well.longitude], {
        radius: baseRadius,
        fillColor: color,
        color: '#ffffff',
        weight: strokeWeight,
        fillOpacity: 0.92
      });
      
      marker.bindTooltip(`
        <div style="font-family:system-ui, -apple-system, sans-serif; font-size:11px; padding:2px;">
          <strong style="color:#38bdf8; font-size:12px; display:block; margin-bottom:2px;">Well: ${well.well_number}</strong>
          <div>📍 ${well.location || '-'} (${well.block || ''})</div>
          <div>💧 Water Level: <strong style="color:#10b981;">${tooltipValText}</strong></div>
          <div style="font-size:10px; color:#94a3b8; margin-top:2px;">Status: ${well.remarks || 'Active'}</div>
        </div>
      `, { sticky: true });
      
      marker.on('mouseover', function() {
        this.setStyle({ radius: baseRadius + 2.5, weight: strokeWeight + 1.0, fillOpacity: 1.0 });
        if (typeof this.bringToFront === 'function') this.bringToFront();
      });
      marker.on('mouseout', function() {
        this.setStyle({ radius: baseRadius, weight: strokeWeight, fillOpacity: 0.92 });
      });

      marker.on('click', () => {
        // Open edit/visit modal
        openVisitEditModal(well);
      });
      
      mainMarkersGroup.addLayer(marker);
    }
  });

  updateMapLegend();
}

function openBlockAnalyticsModal(rawBlock, blockKey, props) {
  const modal = document.getElementById('modal-block-analytics');
  if (!modal) return;

  const districtFilter = document.getElementById('map-filter-district');
  const selectedDist = districtFilter ? districtFilter.value : 'ALL';

  // Find district name for this block from matching wells or GeoJSON properties
  let matchedDistName = selectedDist !== 'ALL' ? selectedDist : '-';
  const blockWells = getScopedWellsData().filter(w => normalizeGeoJSONBlock(w.block) === blockKey);
  
  if (matchedDistName === '-' && blockWells.length > 0) {
    matchedDistName = getDistrictFromWell(blockWells[0]);
  }
  if (matchedDistName === '-' && props && (props.Dist_Name || props.dtname)) {
    matchedDistName = props.Dist_Name || props.dtname;
  }

  // Calculate statistics
  let totalWells = blockWells.length;
  let monitoredCount = 0;
  let pendingCount = 0;
  let activeCount = 0;
  let sumGwl = 0;

  blockWells.forEach(well => {
    const isAct = isActiveWell(well);
    if (isAct) activeCount++;
    const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
    if (seasonal.dtgwl_mbgl !== null) {
      monitoredCount++;
      sumGwl += seasonal.dtgwl_mbgl;
    } else if (isAct) {
      pendingCount++;
    }
  });

  const avgGwl = monitoredCount > 0 ? (sumGwl / monitoredCount).toFixed(2) : null;

  // Update Modal Fields
  const titleEl = document.getElementById('lbl-block-modal-title');
  const distEl = document.getElementById('lbl-block-modal-district');
  if (titleEl) titleEl.textContent = `${rawBlock} Block Analytics`;
  if (distEl) distEl.textContent = matchedDistName;

  // Health Status Badge
  const healthBadge = document.getElementById('lbl-block-modal-health');
  if (healthBadge) {
    if (avgGwl === null) {
      healthBadge.textContent = '⚪ No Data Recorded';
      healthBadge.style.background = 'rgba(148, 163, 184, 0.2)';
      healthBadge.style.color = '#94a3b8';
      healthBadge.style.borderColor = '#94a3b8';
    } else {
      const val = parseFloat(avgGwl);
      if (val < 2.0) {
        healthBadge.textContent = `🟢 Shallow / High Level (${avgGwl} m BGL)`;
        healthBadge.style.background = 'rgba(56, 189, 248, 0.2)';
        healthBadge.style.color = '#38bdf8';
        healthBadge.style.borderColor = '#38bdf8';
      } else if (val <= 4.0) {
        healthBadge.textContent = `🟢 Safe / Normal (${avgGwl} m BGL)`;
        healthBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        healthBadge.style.color = '#10b981';
        healthBadge.style.borderColor = '#10b981';
      } else if (val <= 8.0) {
        healthBadge.textContent = `🟡 Moderate Depth (${avgGwl} m BGL)`;
        healthBadge.style.background = 'rgba(245, 158, 11, 0.2)';
        healthBadge.style.color = '#f59e0b';
        healthBadge.style.borderColor = '#f59e0b';
      } else {
        healthBadge.textContent = `🔴 Depleted / Deep (${avgGwl} m BGL)`;
        healthBadge.style.background = 'rgba(239, 68, 68, 0.2)';
        healthBadge.style.color = '#ef4444';
        healthBadge.style.borderColor = '#ef4444';
      }
    }
  }

  // Summary Stat Cards
  const avgEl = document.getElementById('lbl-block-stat-avg');
  const totalEl = document.getElementById('lbl-block-stat-total');
  const monEl = document.getElementById('lbl-block-stat-monitored');
  const pendEl = document.getElementById('lbl-block-stat-pending');

  if (avgEl) avgEl.textContent = avgGwl ? `${avgGwl} m BGL` : '-';
  if (totalEl) totalEl.textContent = totalWells;
  if (monEl) monEl.textContent = monitoredCount;
  if (pendEl) pendEl.textContent = pendingCount;

  // Build Stations Inventory Table
  const tbody = document.getElementById('tbody-block-wells-list');
  if (tbody) {
    tbody.innerHTML = '';
    if (blockWells.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding:16px; text-align:center; color:#94a3b8;">No groundwater monitoring stations registered under this block.</td></tr>`;
    } else {
      blockWells.forEach(well => {
        const isAct = isActiveWell(well);
        const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
        const isMon = seasonal.dtgwl_mbgl !== null;

        let statusBadge = '<span style="color:#94a3b8; font-weight:600;">Closed</span>';
        let depthText = '<span style="color:#94a3b8;">-</span>';
        if (isAct) {
          if (isMon) {
            statusBadge = '<span style="color:#10b981; font-weight:600;">🟢 Monitored</span>';
            depthText = `<strong style="color:#38bdf8;">${seasonal.dtgwl_mbgl} m BGL</strong>`;
          } else {
            statusBadge = '<span style="color:#ef4444; font-weight:600;">🔴 Pending</span>';
            depthText = '<span style="color:#ef4444;">Pending Visit</span>';
          }
        }

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        tr.innerHTML = `
          <td style="padding:8px 12px; font-weight:600; color:#38bdf8;">${well.well_number || '-'}</td>
          <td style="padding:8px 12px;">${well.location || '-'}</td>
          <td style="padding:8px 12px;">${depthText}</td>
          <td style="padding:8px 12px;">${statusBadge}</td>
          <td style="padding:8px 12px; text-align:right;">
            <button class="btn btn-sm-well-view" data-well-id="${well.well_number}" style="background:#0284c7; color:#fff; border:none; padding:4px 10px; border-radius:4px; font-size:0.75rem; font-weight:600; cursor:pointer;">
              🔍 View Well
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      // Attach click listeners to well view buttons inside modal
      tbody.querySelectorAll('.btn-sm-well-view').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const wellNo = e.currentTarget.getAttribute('data-well-id');
          const targetWell = blockWells.find(w => w.well_number === wellNo);
          if (targetWell) {
            modal.style.display = 'none';
            openVisitEditModal(targetWell);
          }
        });
      });
    }
  }

  // Action button: Filter Dashboard to this Block
  const filterBtn = document.getElementById('btn-block-modal-filter-dash');
  if (filterBtn) {
    filterBtn.onclick = () => {
      const distFilter = document.getElementById('map-filter-district');
      const blockFilter = document.getElementById('map-filter-block');
      if (distFilter && matchedDistName !== '-' && matchedDistName !== 'ALL') {
        distFilter.value = matchedDistName;
        distFilter.dispatchEvent(new Event('change'));
      }
      if (blockFilter) {
        const matchedOption = Array.from(blockFilter.options).find(o => o.value.toLowerCase().trim() === blockKey);
        if (matchedOption) {
          blockFilter.value = matchedOption.value;
          blockFilter.dispatchEvent(new Event('change'));
        }
      }
      modal.style.display = 'none';
    };
  }

  // Modal Close Handlers
  const closeBtn = document.getElementById('btn-close-block-modal');
  if (closeBtn) {
    closeBtn.onclick = () => { modal.style.display = 'none'; };
  }
  modal.onclick = (e) => {
    if (e.target === modal) modal.style.display = 'none';
  };

  modal.style.display = 'flex';
}

function setupActionButtons() {
  // Map overlays toggles
  const chkPins = document.getElementById('chk-toggle-station-pins');
  const chkWater = document.getElementById('chk-toggle-water-map');
  const chkBlocks = document.getElementById('chk-toggle-blocks');
  const btnPres = document.getElementById('btn-toggle-presentation');
  
  if (chkPins) {
    chkPins.checked = showStationMarkers;
    chkPins.onchange = (e) => {
      showStationMarkers = e.target.checked;
      plotMarkersOnMap();
      updateMapLegend();
    };
  }

  if (chkWater) {
    chkWater.onchange = (e) => {
      showWaterDepthMap = e.target.checked;
      initMap();
      updateMapLegend();
    };
  }
  
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
      const res = await fetch('api/wells/reload', { method: 'POST' });
      if (res.status === 401) {
        sessionStorage.clear();
        window.location.href = 'login.html';
        return;
      }
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
  const btnExportSidebar = document.getElementById('btn-export-sidebar');
  if (btnExportSidebar) {
    btnExportSidebar.onclick = () => downloadFullExcel();
  }
  const btnExportDashboard = document.getElementById('btn-export-dashboard');
  if (btnExportDashboard) {
    btnExportDashboard.onclick = () => downloadFullExcel();
  }
  
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
  
  getScopedWellsData().forEach(well => {
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
  
  filteredWells = getScopedWellsData().filter(well => {
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
    const latVal = parseFloat(document.getElementById('input-well-lat').value);
    const lonVal = parseFloat(document.getElementById('input-well-lon').value);
    
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
        const updateRes = await fetch('api/wells/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheet: selectedWell.sheet,
            row_idx: selectedWell.row_idx,
            date: formattedDate,
            bmp: bmpVal,
            mbgl: mbglVal,
            parapet: parapetVal,
            well_number: selectedWell.well_number,
            lat: latVal,
            lon: lonVal
          })
        });
        
        if (updateRes.status === 401) {
          sessionStorage.clear();
          window.location.href = 'login.html';
          return;
        }
        
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
      if (!isNaN(latVal)) {
        wellsData[wellIdx].latitude = latVal;
        wellsData[wellIdx].lat = latVal;
        selectedWell.latitude = latVal;
        selectedWell.lat = latVal;
      }
      if (!isNaN(lonVal)) {
        wellsData[wellIdx].longitude = lonVal;
        wellsData[wellIdx].lon = lonVal;
        selectedWell.longitude = lonVal;
        selectedWell.lon = lonVal;
      }
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
  document.getElementById('lbl-well-coords').textContent = (well.latitude || well.lat) ? `${(well.latitude || well.lat).toFixed(4)}, ${(well.longitude || well.lon).toFixed(4)}` : 'N/A';
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
  const inputLat = document.getElementById('input-well-lat');
  const inputLon = document.getElementById('input-well-lon');
  
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
  
  inputLat.value = (well.latitude || well.lat) !== undefined ? (well.latitude || well.lat) : '';
  inputLon.value = (well.longitude || well.lon) !== undefined ? (well.longitude || well.lon) : '';
  
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
        const uploadRes = await fetch('api/wells/upload-photo', {
          method: 'POST',
          body: formData
        });
        if (uploadRes.status === 401) {
          sessionStorage.clear();
          window.location.href = 'login.html';
          return;
        }
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
let trendAnalysisLevel = 'station'; // 'station', 'block', or 'district'
let selectedTrendDistrict = 'ALL';
let selectedTrendBlock = 'ALL';

function populateTrendsDropdown() {
  const levelSelect = document.getElementById('trends-level-select');
  const distSelect = document.getElementById('trends-district-select');
  const blockSelect = document.getElementById('trends-block-select');
  const wellSelect = document.getElementById('trends-well-select');

  if (!wellSelect) return;

  // Populate District dropdown
  if (distSelect) {
    const districtsSet = new Set();
    getScopedWellsData().forEach(w => {
      const d = getDistrictFromSheet(w.sheet);
      if (d && d !== 'Other') districtsSet.add(d);
    });
    distSelect.innerHTML = '<option value="ALL">All Districts</option>';
    Array.from(districtsSet).sort().forEach(d => {
      distSelect.innerHTML += `<option value="${d}">${d}</option>`;
    });
  }

  // Update block dropdown
  const updateBlockDropdown = () => {
    if (!blockSelect) return;
    const curDist = distSelect ? distSelect.value : 'ALL';
    const blocksSet = new Set();
    getScopedWellsData().forEach(w => {
      const d = getDistrictFromSheet(w.sheet);
      if ((curDist === 'ALL' || d === curDist) && w.block) {
        blocksSet.add(w.block);
      }
    });
    blockSelect.innerHTML = '<option value="ALL">All Blocks</option>';
    Array.from(blocksSet).sort().forEach(b => {
      blockSelect.innerHTML += `<option value="${b}">${b}</option>`;
    });
  };

  // Update wells dropdown
  const updateWellDropdown = () => {
    if (!wellSelect) return;
    const curDist = distSelect ? distSelect.value : 'ALL';
    const curBlock = blockSelect ? blockSelect.value : 'ALL';
    wellSelect.innerHTML = '<option value="">-- Choose Well Number --</option>';

    getScopedWellsData().forEach(well => {
      const d = getDistrictFromSheet(well.sheet);
      if (curDist !== 'ALL' && d !== curDist) return;
      if (curBlock !== 'ALL' && well.block !== curBlock) return;
      wellSelect.innerHTML += `<option value="${well.well_number}">${well.well_number} - ${well.location || 'Unknown'}</option>`;
    });
  };

  updateBlockDropdown();
  updateWellDropdown();

  if (levelSelect) {
    levelSelect.onchange = (e) => {
      trendAnalysisLevel = e.target.value;
      const distGroup = document.getElementById('group-trends-district');
      const blockGroup = document.getElementById('group-trends-block');
      const stationGroup = document.getElementById('group-trends-station');
      
      if (distGroup) distGroup.style.display = 'block';
      if (blockGroup) blockGroup.style.display = trendAnalysisLevel === 'district' ? 'none' : 'block';
      if (stationGroup) stationGroup.style.display = trendAnalysisLevel === 'station' ? 'block' : 'none';

      updateTrendsTab();
    };
  }

  if (distSelect) {
    distSelect.onchange = (e) => {
      selectedTrendDistrict = e.target.value;
      updateBlockDropdown();
      updateWellDropdown();
      updateTrendsTab();
    };
  }

  if (blockSelect) {
    blockSelect.onchange = (e) => {
      selectedTrendBlock = e.target.value;
      updateWellDropdown();
      updateTrendsTab();
    };
  }

  wellSelect.onchange = (e) => {
    const wellNo = e.target.value;
    if (wellNo) {
      selectedWell = wellsData.find(w => w.well_number === wellNo);
    } else {
      selectedWell = null;
    }
    updateTrendsTab();
  };
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
  const isDark = theme === 'dark'; // Fix: Define isDark inside updateTrendsTab!

  const cardPanel = document.getElementById('trends-well-card');
  const contentBox = document.getElementById('trends-content-box');
  
  let historicalList = [];
  let titleStr = '';
  let descStr = '';
  let distStr = '';
  let blockStr = '';
  let aquiferStr = '';

  const years = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const seasons = ['PreMon', 'MidMon', 'PostMon', 'Winter'];

  if (trendAnalysisLevel === 'station') {
    if (!selectedWell) {
      // Default to first available well if none explicitly picked
      if (wellsData && wellsData.length > 0) {
        selectedWell = wellsData[0];
      } else {
        if (cardPanel) cardPanel.style.display = 'none';
        if (contentBox) contentBox.style.display = 'none';
        return;
      }
    }
    titleStr = selectedWell.well_number;
    descStr = selectedWell.location || 'Observation Well';
    distStr = getDistrictFromSheet(selectedWell.sheet);
    blockStr = selectedWell.block || 'ALL';
    aquiferStr = selectedWell.well_type || 'DW';

    years.forEach(yr => {
      seasons.forEach(sea => {
        const key = `${yr}_${sea}`;
        let val = null;
        if (visitsHistory[selectedWell.well_number]?.[key]) {
          val = visitsHistory[selectedWell.well_number][key].value;
        }
        if (val === null && selectedWell.history && selectedWell.history[key] !== undefined) {
          val = parseFloat(selectedWell.history[key]);
        }
        if (val !== null && !isNaN(val)) {
          historicalList.push({ season: key, value: val });
        }
      });
    });
  } else if (trendAnalysisLevel === 'block') {
    const curDist = selectedTrendDistrict;
    const curBlock = selectedTrendBlock !== 'ALL' ? selectedTrendBlock : (wellsData[0] ? wellsData[0].block : 'Angul');
    
    titleStr = `${curBlock} Block`;
    descStr = `Average Groundwater Level Trend for ${curBlock} Block`;
    distStr = curDist;
    blockStr = curBlock;
    aquiferStr = 'Block Composite';

    years.forEach(yr => {
      seasons.forEach(sea => {
        const key = `${yr}_${sea}`;
        let sum = 0, count = 0;
        wellsData.forEach(w => {
          const d = getDistrictFromSheet(w.sheet);
          if ((curDist === 'ALL' || d === curDist) && (curBlock === 'ALL' || w.block === curBlock)) {
            let val = null;
            if (visitsHistory[w.well_number]?.[key]) val = visitsHistory[w.well_number][key].value;
            if (val === null && w.history && w.history[key] !== undefined) val = parseFloat(w.history[key]);
            if (val !== null && !isNaN(val) && val > 0) {
              sum += val;
              count++;
            }
          }
        });
        if (count > 0) {
          historicalList.push({ season: key, value: sum / count });
        }
      });
    });
  } else if (trendAnalysisLevel === 'district') {
    const curDist = selectedTrendDistrict !== 'ALL' ? selectedTrendDistrict : 'Cuttack';
    
    titleStr = `${curDist} District`;
    descStr = `Statewide Average Groundwater Level Trend for ${curDist} District`;
    distStr = curDist;
    blockStr = 'All District Blocks';
    aquiferStr = 'District Composite';

    years.forEach(yr => {
      seasons.forEach(sea => {
        const key = `${yr}_${sea}`;
        let sum = 0, count = 0;
        wellsData.forEach(w => {
          const d = getDistrictFromSheet(w.sheet);
          if (d === curDist) {
            let val = null;
            if (visitsHistory[w.well_number]?.[key]) val = visitsHistory[w.well_number][key].value;
            if (val === null && w.history && w.history[key] !== undefined) val = parseFloat(w.history[key]);
            if (val !== null && !isNaN(val) && val > 0) {
              sum += val;
              count++;
            }
          }
        });
        if (count > 0) {
          historicalList.push({ season: key, value: sum / count });
        }
      });
    });
  }

  if (cardPanel) cardPanel.style.display = 'flex';
  if (contentBox) contentBox.style.display = 'grid';

  document.getElementById('trends-well-id').textContent = titleStr;
  document.getElementById('trends-well-desc').textContent = descStr;
  document.getElementById('trends-well-dist').textContent = distStr;
  document.getElementById('trends-well-block').textContent = blockStr;
  document.getElementById('trends-well-aquifer').textContent = aquiferStr;

  // 1. Calculate Mann-Kendall statistics
  const mkValues = historicalList.map(h => h.value);
  const mkStats = calculateMannKendallAndSensSlope(mkValues);
  
  document.getElementById('mk-s-val').textContent = mkStats.s;
  document.getElementById('mk-z-score').textContent = mkStats.z;
  document.getElementById('mk-p-val').textContent = mkStats.pValue;
  document.getElementById('mk-sens-slope').textContent = mkStats.sensSlope + ' m/year';
  
  const statusBox = document.getElementById('mk-trend-status');
  if (statusBox) {
    statusBox.textContent = mkStats.trendText;
    statusBox.style.backgroundColor = mkStats.trendColor;
    statusBox.style.color = '#fff';
  }

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
  
  const forecastListElem = document.getElementById('forecast-years-list');
  if (forecastListElem) forecastListElem.innerHTML = forecastHTML;

  const warningBox = document.getElementById('forecast-warning-box');
  if (warningBox) {
    if (warningActive) {
      warningBox.className = 'forecast-warning-box warning-active';
      warningBox.textContent = '⚠️ CRITICAL WARNING: Groundwater table depth is projected to deplete beyond safety threshold of 8.5 meters BGL within the next 5 years. Immediate regulation of extraction is recommended.';
    } else {
      warningBox.className = 'forecast-warning-box';
      warningBox.textContent = '✅ Stable Projections: Water table levels are forecasted to remain within stable and safe depths (<8.5m BGL).';
    }
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
  
  // Grab block or district rainfall data
  let rainList = [];
  const targetBlock = (selectedWell && selectedWell.block) ? selectedWell.block : 'Cuttack';
  if (rainfallData && rainfallData.blocks) {
    const blockNorm = normalizeBlockName(targetBlock);
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
let liveNewsArticles = [];

function parseRssXml(xmlString) {
  const items = [];
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const xmlItems = xmlDoc.getElementsByTagName("item");
    
    for (let i = 0; i < xmlItems.length; i++) {
      const item = xmlItems[i];
      const rawTitle = item.getElementsByTagName("title")[0]?.textContent || '';
      const link = item.getElementsByTagName("link")[0]?.textContent || '#';
      const pubDate = item.getElementsByTagName("pubDate")[0]?.textContent || '';
      const source = item.getElementsByTagName("source")[0]?.textContent || 'Google News';
      
      let title = rawTitle;
      let finalSource = source;
      const dashIdx = rawTitle.lastIndexOf(' - ');
      if (dashIdx > 0) {
        title = rawTitle.substring(0, dashIdx).trim();
        finalSource = rawTitle.substring(dashIdx + 3).trim();
      }
      
      let dateStr = pubDate;
      try {
        const d = new Date(pubDate);
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        }
      } catch(e) {}

      items.push({
        id: link || String(i),
        title: title,
        badge: finalSource,
        date: dateStr,
        author: finalSource,
        snippet: `Groundwater monitoring updates regarding ${title}. Check the original Google News article for full briefing.`,
        link: link
      });
    }
  } catch (err) {
    console.error("Failed to parse RSS XML:", err);
  }
  return items;
}

async function renderNews() {
  const container = document.getElementById('news-grid-container');
  if (!container) return;
  
  if (liveNewsArticles.length === 0) {
    container.innerHTML = '<div style="grid-column: span 3; text-align: center; padding: 40px; color: var(--text-muted);"><p>Fetching latest groundwater news...</p></div>';
    try {
      const targetUrl = 'https://news.google.com/rss/search?q=groundwater+india+OR+groundwater+global&hl=en-IN&gl=IN&ceid=IN:en';
      let xmlText = '';
      
      if (!isStandaloneMode) {
        try {
          const res = await fetch('/api/news');
          if (res.ok) xmlText = await res.text();
        } catch (e) {
          console.warn("Local proxy fetch failed, trying public CORS proxy...");
        }
      }
      
      if (!xmlText) {
        const corsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const res = await fetch(corsUrl);
        if (res.ok) xmlText = await res.text();
      }
      
      if (xmlText) {
        liveNewsArticles = parseRssXml(xmlText);
      }
    } catch (err) {
      console.warn("Failed to fetch live news, falling back to static database:", err);
    }
  }
  
  const displayList = liveNewsArticles.length > 0 ? liveNewsArticles : newsArticles;
  
  container.innerHTML = '';
  displayList.forEach(art => {
    const card = document.createElement('article');
    card.className = 'news-card';
    card.style.cursor = 'pointer';
    card.onclick = () => window.open(art.link, '_blank');
    card.innerHTML = `
      <div class="news-body">
        <span class="news-badge">${art.badge}</span>
        <h3>${art.title}</h3>
        <div class="news-meta">
          <span>By ${art.author}</span>
          <span>${art.date}</span>
        </div>
        <p class="news-snippet">${art.snippet}</p>
        <button class="news-btn">Read Full Article ➔</button>
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

// --- NWIC Live Telemetry Integration ---
let telemetryMap = null;
let telemetryLayerGroup = null;
let telemetryFiltersPopulated = false;
let fetchedTelemetryRecords = [];
let telemetryChartInstance = null;


function initTelemetryMap() {
  if (telemetryMap) {
    telemetryMap.invalidateSize();
    return;
  }
  
  telemetryMap = L.map('telemetry-leaflet-map', {
    zoomControl: true,
    attributionControl: true
  }).setView([20.95, 84.8], 7.0);
  
  const isDark = theme === 'dark';
  const tileUrl = isDark 
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    
  L.tileLayer(tileUrl, {
    maxZoom: 19
  }).addTo(telemetryMap);
  
  telemetryLayerGroup = L.layerGroup().addTo(telemetryMap);
}

function parseTelemetryDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = dateStr.replace(/\s*-\s*/g, "-").replace(/\s*:\s*/g, ":").trim();
  const normalized = cleaned.includes(":") ? cleaned : `${cleaned} 00:00`;
  const match = normalized.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match.map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

const ODISHA_DISTRICTS = [
  "ANUGUL",
  "BALANGIR",
  "BALESHWAR",
  "BARGARH",
  "BAUDH",
  "BHADRAK",
  "CUTTACK",
  "DEBAGARH",
  "DHENKANAL",
  "GAJAPATI",
  "GANJAM",
  "JAGATSINGHAPUR",
  "JAJAPUR",
  "JHARSUGUDA",
  "KALAHANDI",
  "KANDHAMAL",
  "KENDRAPARA",
  "KENDUJHAR",
  "KHORDHA",
  "KORAPUT",
  "MALKANGIRI",
  "MAYURBHANJ",
  "NABARANGAPUR",
  "NAYAGARH",
  "NUAPADA",
  "PURI",
  "RAYAGADA",
  "SAMBALPUR",
  "SUBARNAPUR",
  "SUNDARGARH"
];

const TELEMETRY_AGENCIES = [
  "Odisha GW",
  "CGWB"
];

async function populateTelemetryFilters() {
  if (telemetryFiltersPopulated) return;
  
  const statusLbl = document.getElementById('lbl-telemetry-count');
  statusLbl.textContent = "Setting up search options...";
  
  try {
    const distSelect = document.getElementById('telemetry-filter-district');
    distSelect.innerHTML = '<option value="">-- All Districts --</option>';
    ODISHA_DISTRICTS.forEach(d => {
      distSelect.innerHTML += `<option value="${d}">${d}</option>`;
    });
    
    const agencySelect = document.getElementById('telemetry-filter-agency');
    agencySelect.innerHTML = '<option value="">-- All Agencies --</option>';
    TELEMETRY_AGENCIES.forEach(a => {
      agencySelect.innerHTML += `<option value="${a}">${a}</option>`;
    });
    
    const maxDate = new Date();
    const minDate = new Date(maxDate.getTime() - 60 * 24 * 60 * 60 * 1000);
    const toInputDate = d => d.toISOString().split("T")[0];
    
    const startElem = document.getElementById('telemetry-filter-start-date');
    const endElem = document.getElementById('telemetry-filter-end-date');
    
    startElem.value = toInputDate(minDate);
    endElem.value = toInputDate(maxDate);
    
    setupTelemetryEvents();
    telemetryFiltersPopulated = true;
    statusLbl.textContent = "Ready to fetch live data";
  } catch (err) {
    console.error("Filter loading failed:", err);
    statusLbl.textContent = "Error setting up options";
    setupTelemetryEvents();
  }
}

function setupTelemetryEvents() {
  const fetchBtn = document.getElementById('btn-fetch-telemetry');
  const searchInput = document.getElementById('telemetry-search-input');
  
  if (fetchBtn) {
    fetchBtn.onclick = async () => {
      fetchBtn.disabled = true;
      fetchBtn.textContent = '⚡ Querying...';
      
      const stateVal = document.getElementById('telemetry-filter-state').value;
      const districtVal = document.getElementById('telemetry-filter-district').value;
      const agencyVal = document.getElementById('telemetry-filter-agency').value;
      const startDateVal = document.getElementById('telemetry-filter-start-date').value;
      const endDateVal = document.getElementById('telemetry-filter-end-date').value;
      
      const startLimit = startDateVal ? new Date(startDateVal + "T00:00:00") : null;
      const endLimit = endDateVal ? new Date(endDateVal + "T23:59:59") : null;
      
      const tbody = document.getElementById('telemetry-table-body');
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">⚡ Fetching live telemetry from NWIC database...</td></tr>`;
      
      if (telemetryLayerGroup) {
        telemetryLayerGroup.clearLayers();
      }
      
      document.getElementById('lbl-map-pins-count').textContent = '0 pins plotted';
      
      try {
        let allRecords = [];
        let offset = 0;
        const limit = 2000;
        let total = 0;
        
        const queryFilters = { "State": stateVal };
        if (districtVal) {
          queryFilters["District"] = districtVal;
        }
        if (agencyVal) {
          queryFilters["Agency"] = agencyVal;
        }

        do {
          const payload = {
            resource_id: '7de68858-4e78-4a09-8a3a-c63c4a027eeb',
            filters: queryFilters,
            limit: limit,
            offset: offset
          };
          
          let res = await fetch('api/nwic/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(() => ({ ok: false }));
          
          if (!res.ok) {
            console.warn("Proxy search failed. Trying direct GET request with query params...");
            const queryParams = new URLSearchParams({
              resource_id: '7de68858-4e78-4a09-8a3a-c63c4a027eeb',
              filters: JSON.stringify(queryFilters),
              limit: limit.toString(),
              offset: offset.toString()
            });
            res = await fetch(`https://nwdp.nwic.gov.in/api/3/action/datastore_search?${queryParams.toString()}`).catch(() => ({ ok: false }));
          }
          
          if (!res.ok) throw new Error("CORS or network connection failed.");
          
          const data = await res.json();
          if (!data.success) throw new Error(data.error || "NWIC server error");
          
          const records = data.result.records || [];
          total = data.result.total;
          allRecords.push(...records);
          offset += limit;
          
          if (allRecords.length >= total) break;
        } while (offset < total);
        
        const filtered = allRecords.filter(row => {
          if (row["Data Acquisition Time"]) {
            const d = parseTelemetryDate(row["Data Acquisition Time"]);
            if (d) {
              if (startLimit && d < startLimit) return false;
              if (endLimit && d > endLimit) return false;
            }
          }
          return true;
        });
        
        // Sort newest first
        filtered.sort((a, b) => {
          const dA = parseTelemetryDate(a["Data Acquisition Time"]) || 0;
          const dB = parseTelemetryDate(b["Data Acquisition Time"]) || 0;
          return dB - dA;
        });
        
        fetchedTelemetryRecords = filtered;
        document.getElementById('lbl-telemetry-count').textContent = `Loaded ${filtered.length} telemetry records`;
        renderTelemetryTable(filtered);
        plotTelemetryMarkers(filtered);
        showToast(`Loaded ${filtered.length} live records successfully!`);
        
      } catch (err) {
        console.error("Telemetry query failed:", err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #f87171; padding: 40px;">⚠️ Query Failed: ${err.message}. Ensure local Node.js proxy is running.</td></tr>`;
        showToast("Telemetry query failed", "error");
      } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = '⚡ Fetch Live Telemetry';
      }
    };
  }
  
  const exportBtn = document.getElementById('btn-export-telemetry');
  if (exportBtn) {
    exportBtn.onclick = () => {
      if (fetchedTelemetryRecords.length === 0) {
        showToast("No telemetry data to export. Please fetch data first.", "warning");
        return;
      }
      
      const worksheetData = fetchedTelemetryRecords.map(row => ({
        "Station Code": row["Station"] || '',
        "Agency": row["Agency"] || '',
        "District": row["District"] || '',
        "Latitude": row["Latitude"] || '',
        "Longitude": row["Longitude"] || '',
        "Groundwater Level (m)": row["Groundwater Level Telemetry 6 Hourly (meter)"] || '',
        "Data Acquisition Time": row["Data Acquisition Time"] || ''
      }));
      
      const ws = XLSX.utils.json_to_sheet(worksheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Telemetry Data");
      XLSX.writeFile(wb, `Telemetry_Data_Odisha_${Date.now()}.xlsx`);
      showToast("Telemetry data exported to Excel successfully!");
    };
  }

  const closeModalBtn = document.getElementById('btn-close-telemetry-modal');
  if (closeModalBtn) {
    closeModalBtn.onclick = () => {
      document.getElementById('telemetry-trend-modal').classList.remove('open');
    };
  }

  // Click handler delegation for table links and map buttons
  document.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('telemetry-station-link')) {
      e.preventDefault();
      const stationCode = e.target.getAttribute('data-station');
      openTelemetryTrendModal(stationCode);
    } else if (e.target && e.target.classList.contains('telemetry-map-graph-btn')) {
      e.preventDefault();
      const stationCode = e.target.getAttribute('data-station');
      openTelemetryTrendModal(stationCode);
    }
  });
  
  if (searchInput) {
    searchInput.onkeyup = (e) => {
      const query = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('#telemetry-table-body tr');
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (row.cells.length > 1) { // Skip empty placeholder row
          row.style.display = text.includes(query) ? '' : 'none';
        }
      });
    };
  }
}

function renderTelemetryTable(records) {
  const tbody = document.getElementById('telemetry-table-body');
  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">No telemetry records match your filter criteria.</td></tr>`;
    return;
  }
  
  const displayRecords = records.slice(0, 300); // limit to 300 for browser DOM speed
  tbody.innerHTML = displayRecords.map(row => {
    return `
      <tr>
        <td class="text-highlight" style="font-family: monospace; font-weight: 600;">
          <a href="#" class="telemetry-station-link" data-station="${row["Station"]}" style="text-decoration: underline; color: var(--text-highlight);">${row["Station"] || '-'}</a>
        </td>
        <td>${row["Agency"] || '-'}</td>
        <td>${row["District"] || '-'}</td>
        <td>${row["Latitude"] ? parseFloat(row["Latitude"]).toFixed(5) : '-'}</td>
        <td>${row["Longitude"] ? parseFloat(row["Longitude"]).toFixed(5) : '-'}</td>
        <td style="font-weight: 700; color: #38bdf8;">${row["Groundwater Level Telemetry 6 Hourly (meter)"] || '-'}</td>
        <td style="font-size: 0.85rem; color: var(--text-muted);">${row["Data Acquisition Time"] || '-'}</td>
      </tr>
    `;
  }).join('');
}

function plotTelemetryMarkers(records) {
  if (!telemetryMap || !telemetryLayerGroup) return;
  
  const uniqueStations = {};
  records.forEach(row => {
    const sId = row["Station"];
    if (!sId) return;
    
    const parsedDate = parseTelemetryDate(row["Data Acquisition Time"]);
    if (!uniqueStations[sId] || (parsedDate && parsedDate > uniqueStations[sId].date)) {
      uniqueStations[sId] = {
        row: row,
        date: parsedDate
      };
    }
  });
  
  const stationsList = Object.values(uniqueStations);
  document.getElementById('lbl-map-pins-count').textContent = `${stationsList.length} stations plotted`;
  
  const bounds = [];
  stationsList.forEach(item => {
    const row = item.row;
    const lat = parseFloat(row["Latitude"]);
    const lng = parseFloat(row["Longitude"]);
    
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;
    
    const val = row["Groundwater Level Telemetry 6 Hourly (meter)"] || 'N/A';
    const time = row["Data Acquisition Time"] || 'N/A';
    const agency = row["Agency"] || 'N/A';
    const district = row["District"] || 'N/A';
    
    const popupHtml = `
      <div class="well-popup-card" style="padding: 5px;">
        <h4 style="margin: 0 0 6px 0; color: #38bdf8; font-family: monospace;">🔌 Station: ${row["Station"]}</h4>
        <div style="font-size: 0.8rem; display: flex; flex-direction: column; gap: 4px; color: #fff;">
          <div><strong>Agency:</strong> ${agency}</div>
          <div><strong>District:</strong> ${district}</div>
          <div style="margin-top: 6px; padding: 6px; background: rgba(56, 189, 248, 0.1); border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.3);">
            <strong style="color: #38bdf8;">Latest Level:</strong> ${val} m
          </div>
          <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 2px;">Acquired: ${time}</div>
          <div style="margin-top: 8px;">
            <button class="telemetry-map-graph-btn" data-station="${row["Station"]}" style="width: 100%; font-size: 0.72rem; padding: 6px; font-weight: 600; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 4px; cursor: pointer; text-align: center;">
              📈 View Trend Graph
            </button>
          </div>
        </div>
      </div>
    `;
    
    const marker = L.circleMarker([lat, lng], {
      radius: 6,
      fillColor: '#38bdf8',
      color: '#ffffff',
      weight: 1,
      opacity: 1.0,
      fillOpacity: 0.85
    }).bindPopup(popupHtml);
    
    telemetryLayerGroup.addLayer(marker);
    bounds.push([lat, lng]);
  });
  
  if (bounds.length > 0) {
    telemetryMap.fitBounds(bounds, { padding: [30, 30] });
  }
}

function openTelemetryTrendModal(stationCode) {
  const stationRecords = fetchedTelemetryRecords.filter(r => r["Station"] === stationCode);
  if (stationRecords.length === 0) {
    showToast("No telemetry data records found for this station.", "warning");
    return;
  }
  
  // Sort chronologically (oldest to newest) for chart plotting
  const sortedRecords = [...stationRecords].sort((a, b) => {
    const dA = parseTelemetryDate(a["Data Acquisition Time"]) || 0;
    const dB = parseTelemetryDate(b["Data Acquisition Time"]) || 0;
    return dA - dB;
  });
  
  const latestRec = sortedRecords[sortedRecords.length - 1];
  
  document.getElementById('telemetry-modal-station-id').textContent = stationCode;
  document.getElementById('telemetry-modal-district').textContent = latestRec["District"] || '-';
  document.getElementById('telemetry-modal-agency').textContent = latestRec["Agency"] || '-';
  
  document.getElementById('telemetry-trend-modal').classList.add('open');
  
  plotTelemetryChart(sortedRecords);
}

function plotTelemetryChart(sortedRecords) {
  const ctx = document.getElementById('chart-telemetry-trend').getContext('2d');
  
  if (telemetryChartInstance) {
    telemetryChartInstance.destroy();
  }
  
  const labels = sortedRecords.map(r => {
    return r["Data Acquisition Time"] ? r["Data Acquisition Time"].split(' ')[0] : '';
  });
  
  const values = sortedRecords.map(r => {
    const val = parseFloat(r["Groundwater Level Telemetry 6 Hourly (meter)"]);
    return isNaN(val) ? null : val;
  });
  
  telemetryChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Groundwater Level (meters below ground level)',
        data: values,
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        pointBackgroundColor: '#38bdf8',
        pointRadius: 4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#e2e8f0',
            font: { family: 'Outfit, sans-serif', size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `Level: ${context.parsed.y} m`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#94a3b8',
            font: { family: 'Outfit, sans-serif', size: 10 },
            maxRotation: 45,
            minRotation: 45
          }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#94a3b8',
            font: { family: 'Outfit, sans-serif' }
          },
          title: {
            display: true,
            text: 'Groundwater Level (m)',
            color: '#e2e8f0',
            font: { family: 'Outfit, sans-serif', weight: 600 }
          }
        }
      }
    }
  });
}

// --- Advanced Export Features & Parity Port ---

function initAdvancedExportFeatures() {
  const selExportDivision = document.getElementById('sel-export-division');
  const btnExportFieldBook = document.getElementById('btn-export-fieldbook');
  const selExportGraspDistrict = document.getElementById('sel-export-grasp-district');
  const btnExportGrasp = document.getElementById('btn-export-grasp');
  const btnExportNotMonitored = document.getElementById('btn-export-notmonitored');
  const selExportWttoDistrict = document.getElementById('sel-export-wtto-district');
  const selExportWttoOption = document.getElementById('sel-export-wtto-option');
  const btnExportWtto = document.getElementById('btn-export-wtto');
  
  const selTemplateTarget = document.getElementById('sel-template-target');
  const btnTriggerUploadTemplate = document.getElementById('btn-trigger-upload-template');
  const btnRemoveTemplate = document.getElementById('btn-remove-template');
  const inputFileWttoTemplate = document.getElementById('input-file-wtto-template');
  const templateStatusMsg = document.getElementById('template-status-msg');

  // Update template upload status display
  function updateTemplateStatus() {
    if (!selTemplateTarget || !templateStatusMsg) return;
    const target = selTemplateTarget.value;
    const key = `gw_custom_excel_template_${target}`;
    const data = localStorage.getItem(key);
    if (data) {
      templateStatusMsg.textContent = `✅ WTTO Template Loaded (${(data.length / 1024).toFixed(0)} KB)`;
      templateStatusMsg.style.color = '#10b981'; // Green
    } else {
      const division = getDivisionForDistrictLocal(target);
      const divKey = `gw_custom_excel_template_${division}`;
      const divData = localStorage.getItem(divKey);
      if (divData) {
        templateStatusMsg.textContent = `✅ Division Template Loaded (${(divData.length / 1024).toFixed(0)} KB)`;
        templateStatusMsg.style.color = '#10b981';
      } else {
        templateStatusMsg.textContent = '❌ No template loaded';
        templateStatusMsg.style.color = '#ef4444'; // Red
      }
    }
  }

  if (selTemplateTarget) {
    selTemplateTarget.onchange = updateTemplateStatus;
    updateTemplateStatus();
  }

  // Trigger file upload dialog
  if (btnTriggerUploadTemplate && inputFileWttoTemplate) {
    btnTriggerUploadTemplate.onclick = () => inputFileWttoTemplate.click();
    
    inputFileWttoTemplate.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const target = selTemplateTarget.value;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const arrayBuffer = evt.target.result;
          // Verify with SheetJS that it's a valid workbook
          const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
          const base64 = base64ArrayBuffer(arrayBuffer);
          
          localStorage.setItem(`gw_custom_excel_template_${target}`, base64);
          showToast(`WTTO Template workbook saved successfully for ${target}!`);
          updateTemplateStatus();
        } catch (err) {
          console.error("Template upload failed:", err);
          showToast("Failed to parse file. Make sure it is a valid .xlsx file.", "error");
        }
      };
      reader.readAsArrayBuffer(file);
    };
  }

  // Remove Custom Template
  if (btnRemoveTemplate) {
    btnRemoveTemplate.onclick = () => {
      const target = selTemplateTarget.value;
      const key = `gw_custom_excel_template_${target}`;
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        showToast(`Template cleared for ${target}.`);
      } else {
        const division = getDivisionForDistrictLocal(target);
        const divKey = `gw_custom_excel_template_${division}`;
        if (localStorage.getItem(divKey)) {
          localStorage.removeItem(divKey);
          showToast(`Division Template cleared for ${division}.`);
        } else {
          showToast("No custom template exists to remove.", "warning");
        }
      }
      updateTemplateStatus();
    };
  }

  // 1. Division-wise Field Book Export
  if (btnExportFieldBook && selExportDivision) {
    btnExportFieldBook.onclick = async () => {
      const targetDiv = selExportDivision.value;
      const activeSeasonStr = `${selectedSeason} ${selectedYear}`;
      
      // Map all active wells
      const enrichedWells = wellsData.map(well => {
        const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
        return {
          ...well,
          date: seasonal.date,
          dtgwl_mbgl: seasonal.dtgwl_mbgl,
          dtgwl_bmp: seasonal.dtgwl_bmp
        };
      });

      // Filter by division if selected
      const filteredWells = targetDiv === 'all' 
        ? enrichedWells 
        : enrichedWells.filter(w => getDivisionForDistrictLocal(getDistrictFromSheetLocal(w.sheet)) === targetDiv);

      if (filteredWells.length === 0) {
        showToast("No well records found to export.", "warning");
        return;
      }

      // Group wells by sheet
      const sheetsGroup = {};
      filteredWells.forEach(well => {
        const s = well.sheet || 'Other';
        if (!sheetsGroup[s]) sheetsGroup[s] = [];
        sheetsGroup[s].push(well);
      });

      const wb = XLSX.utils.book_new();

      // Write each sheet
      Object.keys(sheetsGroup).forEach(sheetName => {
        const wsData = [
          [`FIELD BOOK - SEASON: ${activeSeasonStr.toUpperCase()}`],
          ["Sl. No.", "Location", "Well Type", "Well Number", "Latitude", "Longitude", "Parapet Height (m)", "Depth (m)", "Date of Visit", "DTGWL (bmp)", "DTGWL (mbgl)", "Remarks"]
        ];

        sheetsGroup[sheetName].forEach((well, index) => {
          wsData.push([
            well.sl_no || (index + 1),
            well.location || '',
            well.well_type || '',
            well.well_number || '',
            well.lat || '',
            well.lon || '',
            well.parapet_height || '',
            well.depth || '',
            well.date || '',
            well.dtgwl_bmp !== null && well.dtgwl_bmp !== undefined ? Number(well.dtgwl_bmp).toFixed(2) : '',
            well.dtgwl_mbgl !== null && well.dtgwl_mbgl !== undefined ? Number(well.dtgwl_mbgl).toFixed(2) : '',
            well.remarks || ''
          ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        // Column widths auto fit
        const maxLens = wsData[1].map((_, colIdx) => 
          Math.max(...wsData.map(row => String(row[colIdx] || '').length))
        );
        ws['!cols'] = maxLens.map(len => ({ wch: len + 3 }));
        XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 30));
      });

      const filename = targetDiv === 'all'
        ? `Groundwater_Field_Book_Full_${selectedYear}_${selectedSeason.replace(/\s+/g, '_')}.xlsx`
        : `${targetDiv.replace(/\s+/g, '_')}_Field_Book_${selectedYear}_${selectedSeason.replace(/\s+/g, '_')}.xlsx`;

      XLSX.writeFile(wb, filename);
      showToast("Field Book exported successfully!");
    };
  }

  // 2. GRASP CSV Export
  if (btnExportGrasp && selExportGraspDistrict) {
    btnExportGrasp.onclick = () => {
      const distName = selExportGraspDistrict.value;
      
      // Enrich wells with active seasonal data
      const enrichedWells = wellsData.map(well => {
        const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
        return {
          ...well,
          date: seasonal.date,
          dtgwl_mbgl: seasonal.dtgwl_mbgl
        };
      });

      // Filter by district
      const districtWells = enrichedWells.filter(w => {
        const dist = getDistrictFromSheetLocal(w.sheet);
        return dist.toLowerCase() === distName.toLowerCase();
      });

      // Filter valid ones (has visit date and reading)
      const validWells = districtWells.filter(w => w.date && w.dtgwl_mbgl !== null && w.dtgwl_mbgl !== undefined);

      if (validWells.length === 0) {
        showToast(`No monitored stations found with water level readings in district ${distName}.`, "warning");
        return;
      }

      // Helper to format date to DD-MM-YYYY
      const formatGraspDate = (dateStr) => {
        if (!dateStr) return '';
        const cleaned = String(dateStr).replace(/[\.\/]/g, '-');
        const parts = cleaned.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`;
          return `${parts[0]}-${parts[1]}-${parts[2]}`;
        }
        return cleaned;
      };

      const csvContent = validWells.map(w => {
        const wellId = w.well_number || '';
        const dateVal = formatGraspDate(w.date);
        const timeVal = '08:00';
        const mbglVal = Number(w.dtgwl_mbgl).toFixed(2);
        return `${wellId},${dateVal},${timeVal},${mbglVal}`;
      }).join('\r\n');

      const filename = `GRASP_${distName.toUpperCase()}_${selectedYear}_${selectedSeason.replace(/\s+/g, '_')}.csv`;
      
      // Download CSV file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`GRASP CSV exported successfully for ${distName}!`);
    };
  }

  // 3. Not Monitored Report Export
  if (btnExportNotMonitored) {
    btnExportNotMonitored.onclick = () => {
      const activeSeasonStr = `${selectedSeason} ${selectedYear}`;
      
      // Enrich wells
      const enrichedWells = wellsData.map(well => {
        const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
        return {
          ...well,
          date: seasonal.date,
          dtgwl_bmp: seasonal.dtgwl_bmp
        };
      });

      // Filter active unmonitored wells
      const notMonitoredWells = enrichedWells.filter(w => {
        const rem = (w.remarks || '').toLowerCase();
        const isActive = !rem.includes('closed') && !rem.includes('cemented') && !rem.includes('dumped');
        if (!isActive) return false;
        
        const hasDate = w.date !== null && w.date !== undefined && w.date !== '';
        const hasBmp = w.dtgwl_bmp !== null && w.dtgwl_bmp !== undefined && w.dtgwl_bmp !== '' && !isNaN(Number(w.dtgwl_bmp));
        
        let dateInRange = false;
        if (hasDate) {
          dateInRange = checkDateInSeasonRangeLocal(w.date, activeSeasonStr);
        }
        
        return !hasDate || !hasBmp || !dateInRange;
      });

      if (notMonitoredWells.length === 0) {
        showToast("All active stations are successfully monitored for this season!", "info");
        return;
      }

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
          (well.dtgwl_bmp !== null && well.dtgwl_bmp !== undefined ? String(well.dtgwl_bmp) : ""),
          well.remarks || "",
          well.comment || ""
        ]);
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      
      const maxLens = wsData[0].map((_, colIdx) => 
        Math.max(...wsData.map(row => String(row[colIdx] || '').length))
      );
      ws['!cols'] = maxLens.map(len => ({ wch: len + 3 }));

      XLSX.utils.book_append_sheet(wb, ws, "Not Monitored");
      
      const filename = `Not_Monitored_Stations_${activeSeasonStr.replace(/\s+/g, '_')}.xlsx`;
      XLSX.writeFile(wb, filename);
      showToast("Not Monitored Report exported successfully!");
    };
  }

  // 4. WTTO Custom Template Export
  if (btnExportWtto && selExportWttoDistrict && selExportWttoOption) {
    btnExportWtto.onclick = async () => {
      const districtName = selExportWttoDistrict.value;
      const sheetOption = selExportWttoOption.value;
      const seasonName = `${selectedSeason} ${selectedYear}`;
      
      const division = getDivisionForDistrictLocal(districtName);
      const customB64 = localStorage.getItem(`gw_custom_excel_template_${districtName}`) || localStorage.getItem(`gw_custom_excel_template_${division}`);
      
      if (!customB64) {
        // Fallback: Automatically generate and download full WTTO Excel file directly
        executeWTTOExcelDownload();
        return;
      }

      try {
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
          showToast(`The uploaded WTTO workbook does not contain ${districtName} sheets.`, "error");
          return;
        }

        // Enrich wells
        const enrichedWells = wellsData.map(well => {
          const seasonal = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
          return {
            ...well,
            date: seasonal.date,
            dtgwl_mbgl: seasonal.dtgwl_mbgl,
            dtgwl_bmp: seasonal.dtgwl_bmp
          };
        });

        sheetsToUpdate.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          if (!ws) return;
          
          const sheetWells = enrichedWells.filter(w => w.sheet === sheetName);
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
                if (c > lastSeasonCol) lastSeasonCol = c;
              }
              
              const valStr = String(cell.v).toLowerCase().trim();
              if (valStr.includes("parapet")) {
                parapetCol = c;
              } else if (valStr.includes("depth") && valStr.includes(String(selectedYear))) {
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
          
          const seasonKey = `${selectedYear}_${selectedSeason.includes('Pre') ? 'PreMon' : selectedSeason.includes('Mid') ? 'MidMon' : selectedSeason.includes('Post') ? 'PostMon' : 'Winter'}`;

          if (colMap[seasonKey] === undefined) {
            let insertColIdx = -1;
            const predecessors = getOrderedSeasonsBefore(seasonKey, 40);
            for (const pred of predecessors) {
              if (colMap[pred] !== undefined) {
                insertColIdx = colMap[pred] + 1;
                break;
              }
            }
            
            if (insertColIdx === -1) {
              const successors = getOrderedSeasonsAfter(seasonKey, 40);
              for (const succ of successors) {
                if (colMap[succ] !== undefined) {
                  insertColIdx = colMap[succ];
                  break;
                }
              }
            }
            
            if (insertColIdx === -1) {
              insertColIdx = lastSeasonCol !== -1 ? lastSeasonCol + 1 : range.e.c + 1;
            }
            
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
            
            if (ws['!cols']) {
              ws['!cols'].splice(insertColIdx, 0, ws['!cols'][insertColIdx] || { wch: 12 });
            }
            
            range.e.c += 1;
            ws['!ref'] = XLSX.utils.encode_range(range);
            
            Object.keys(colMap).forEach(key => {
              if (colMap[key] >= insertColIdx) colMap[key] += 1;
            });
            if (parapetCol !== null && parapetCol >= insertColIdx) parapetCol += 1;
            if (depthCol !== null && depthCol >= insertColIdx) depthCol += 1;
            
            const newHeader = formatSeasonKeyToHeader(seasonKey);
            updateCell(ws, headerRow, insertColIdx, newHeader);
            colMap[seasonKey] = insertColIdx;
          }
          
          sheetWells.forEach(well => {
            let r = -1;
            if (well.well_number) {
              const wNum = well.well_number.toLowerCase().trim();
              if (wellRowMap[wNum] !== undefined) r = wellRowMap[wNum];
            }
            if (r === -1 && well.row_idx) r = well.row_idx - 1;
            if (r === -1 || r > range.e.r) return;
            
            const activeBglVal = well.dtgwl_mbgl !== null && well.dtgwl_mbgl !== undefined ? well.dtgwl_mbgl : '';
            const activeTargetCol = colMap[seasonKey];
            if (activeTargetCol !== undefined && activeBglVal !== '') {
              updateCell(ws, r, activeTargetCol, activeBglVal);
            }
            
            const wellHistory = visitsHistory[well.well_number];
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
            
            if (parapetCol !== null && well.parapet_height !== null && well.parapet_height !== undefined) {
              updateCell(ws, r, parapetCol, well.parapet_height);
            }
            if (depthCol !== null && well.depth !== null && well.depth !== undefined && well.depth !== '') {
              updateCell(ws, r, depthCol, well.depth);
            }
          });
        });

        const outBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        const outFilename = `WTTO_${districtName}_${seasonName.replace(/\s+/g, '_')}.xlsx`;
        downloadExcelFromBase64(outBase64, outFilename);
        showToast("WTTO Template filled and downloaded successfully!");
      } catch (err) {
        console.error("WTTO template custom export failed:", err);
        showToast("WTTO custom export failed: " + err.message, "error");
      }
    };
  }
}

// --- Parity Helper Utilities ---

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
  if (d.includes('rs') || d.includes('research')) return 'RS DIVISION';
  if (d.includes('hp') || d.includes('hydrology')) return 'AD HP DIVISION';
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

  const parsed = parseSeasonAndYear(targetSeasonStr);
  const targetSeason = parsed.season;
  const targetYear = parsed.year;
  
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

function base64ArrayBuffer(arrayBuffer) {
  let base64 = '';
  const encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = new Uint8Array(arrayBuffer);
  const byteLength = bytes.byteLength;
  const byteRemainder = byteLength % 3;
  const mainLength = byteLength - byteRemainder;
  let a, b, c, d;
  let chunk;

  for (let i = 0; i < mainLength; i += 3) {
    chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    a = (chunk & 16515072) >> 18;
    b = (chunk & 258048) >> 12;
    c = (chunk & 4032) >> 6;
    d = chunk & 63;
    base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
  }

  if (byteRemainder === 1) {
    chunk = bytes[mainLength];
    a = (chunk & 252) >> 2;
    b = (chunk & 3) << 4;
    base64 += encodings[a] + encodings[b] + '==';
  } else if (byteRemainder === 2) {
    chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];
    a = (chunk & 64512) >> 10;
    b = (chunk & 1008) >> 4;
    c = (chunk & 15) << 2;
    base64 += encodings[a] + encodings[b] + encodings[c] + '=';
  }

  return base64;
}

function downloadExcelFromBase64(base64, filename) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper: Extract district name from well object
function getDistrictFromWell(well) {
  if (!well) return '';
  if (well.district && typeof well.district === 'string' && well.district.trim() !== '') {
    return well.district.trim();
  }
  if (well.sheet && typeof getDistrictFromSheetLocal === 'function') {
    return getDistrictFromSheetLocal(well.sheet);
  }
  return 'Cuttack';
}

// --- WTTO Role-Based Excel Download Handler ---
function initWTTOExportModal() {
  const btnExportSidebar = document.getElementById('btn-export-sidebar');
  const modalWttoExport = document.getElementById('modal-wtto-export');
  const btnCloseWttoModal = document.getElementById('btn-close-wtto-modal');
  const selExportWttoDistrict = document.getElementById('sel-export-wtto-district');
  const selExportWttoSeason = document.getElementById('sel-export-wtto-season');
  const lblWttoScopeName = document.getElementById('lbl-wtto-scope-name');
  const lblWttoStationCount = document.getElementById('lbl-wtto-station-count');
  const btnDoWttoDownload = document.getElementById('btn-do-wtto-download');

  if (!modalWttoExport) return;

  function populateWTTOOptions() {
    const userDiv = getUserDivision();
    selExportWttoDistrict.innerHTML = '';

    // Get list of unique districts from wellsData
    const allDistricts = Array.from(new Set((wellsData || []).map(w => getDistrictFromWell(w)).filter(Boolean))).sort();

    if (userDiv === 'ALL') {
      lblWttoScopeName.textContent = '🌐 Statewide Admin Scope (All 30 Odisha Districts)';
      const optAll = document.createElement('option');
      optAll.value = 'ALL_DISTRICTS';
      optAll.textContent = 'All 30 Odisha Districts (Full WTTO Workbook)';
      selExportWttoDistrict.appendChild(optAll);

      allDistricts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = `District: ${d}`;
        selExportWttoDistrict.appendChild(opt);
      });
    } else {
      lblWttoScopeName.textContent = `🏢 Division Scope: ${userDiv}`;
      
      const allowedDistricts = allDistricts.filter(dist => {
        const div = getDivisionForDistrictLocal(dist);
        if (div === userDiv) return true;
        if ((userDiv === 'BARIPADA DIVISION' || userDiv === 'BALASORE DIVISION') && (div === 'BARIPADA DIVISION' || div === 'BALASORE DIVISION')) return true;
        return false;
      });

      const optDivAll = document.createElement('option');
      optDivAll.value = 'ALL_DIVISION_DISTRICTS';
      optDivAll.textContent = `All Districts in ${userDiv.replace(' DIVISION', '')} (${allowedDistricts.length} Districts)`;
      selExportWttoDistrict.appendChild(optDivAll);

      allowedDistricts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = `District: ${d}`;
        selExportWttoDistrict.appendChild(opt);
      });
    }

    updateWTTOStationCount();
  }

  function updateWTTOStationCount() {
    const selectedScope = selExportWttoDistrict.value;
    let count = 0;

    if (selectedScope === 'ALL_DISTRICTS') {
      count = (wellsData || []).length;
    } else if (selectedScope === 'ALL_DIVISION_DISTRICTS') {
      count = getScopedWellsData().length;
    } else {
      count = (wellsData || []).filter(w => getDistrictFromWell(w) === selectedScope).length;
    }

    lblWttoStationCount.textContent = `${count} Baseline Stations`;
  }

  if (btnExportSidebar) {
    btnExportSidebar.onclick = () => {
      populateWTTOOptions();
      modalWttoExport.style.display = 'flex';
    };
  }

  if (btnCloseWttoModal) {
    btnCloseWttoModal.onclick = () => {
      modalWttoExport.style.display = 'none';
    };
  }

  if (selExportWttoDistrict) {
    selExportWttoDistrict.onchange = updateWTTOStationCount;
  }

  if (btnDoWttoDownload) {
    btnDoWttoDownload.onclick = () => {
      executeWTTOExcelDownload();
    };
  }
}

function executeWTTOExcelDownload() {
  const selExportWttoDistrict = document.getElementById('sel-export-wtto-district');
  const selExportWttoSeason = document.getElementById('sel-export-wtto-season');
  const btnDoWttoDownload = document.getElementById('btn-do-wtto-download');

  const selectedScope = selExportWttoDistrict ? selExportWttoDistrict.value : 'ALL_DISTRICTS';
  const seasonKey = selExportWttoSeason ? selExportWttoSeason.value : `${selectedYear}_PreMon`;
  const userDiv = getUserDivision();

  let targetWells = [];
  let scopeLabel = '';

  if (selectedScope === 'ALL_DISTRICTS') {
    targetWells = wellsData || [];
    scopeLabel = 'ALL_ODISHA_DISTRICTS';
  } else if (selectedScope === 'ALL_DIVISION_DISTRICTS') {
    targetWells = getScopedWellsData();
    scopeLabel = userDiv.replace(/[\s_]+/g, '_');
  } else {
    targetWells = (wellsData || []).filter(w => getDistrictFromWell(w).toLowerCase() === selectedScope.toLowerCase());
    scopeLabel = selectedScope.replace(/[\s_]+/g, '_');
  }

  if (!targetWells || targetWells.length === 0) {
    targetWells = getScopedWellsData();
    scopeLabel = userDiv === 'ALL' ? 'ALL_ODISHA_DISTRICTS' : userDiv.replace(/[\s_]+/g, '_');
  }

  if (!targetWells || targetWells.length === 0) {
    showToast('No station data found for the selected scope.', 'error');
    return;
  }

  if (btnDoWttoDownload) {
    btnDoWttoDownload.disabled = true;
    btnDoWttoDownload.innerHTML = '<span>⏳</span> Generating WTTO Standard Excel...';
  }

  setTimeout(() => {
    try {
      if (typeof XLSX === 'undefined') {
        throw new Error("SheetJS exporter library (xlsx.full.min.js) is not loaded.");
      }

      const wb = XLSX.utils.book_new();

      // Collect all unique historical seasons up to 2026_PreMon
      const seasonsSet = new Set();
      targetWells.forEach(w => {
        if (w.history && typeof w.history === 'object') {
          Object.keys(w.history).forEach(k => {
            if (!k.includes('2026_Mid') && !k.includes('2026_Post')) {
              seasonsSet.add(k);
            }
          });
        }
      });

      const seasonOrder = ['Winter', 'PreMon', 'MidMon', 'PostMon'];
      const sortedSeasons = Array.from(seasonsSet).sort((a, b) => {
        const partsA = a.split('_');
        const partsB = b.split('_');
        const yearA = parseInt(partsA[0], 10) || 0;
        const yearB = parseInt(partsB[0], 10) || 0;
        if (yearA !== yearB) return yearA - yearB;
        const typeAIdx = seasonOrder.indexOf(partsA[1]);
        const typeBIdx = seasonOrder.indexOf(partsB[1]);
        return (typeAIdx !== -1 ? typeAIdx : 99) - (typeBIdx !== -1 ? typeBIdx : 99);
      });

      // Group wells by district
      const wellsByDistrict = {};
      targetWells.forEach(w => {
        const dist = getDistrictFromWell(w) || 'OTHERS';
        if (!wellsByDistrict[dist]) wellsByDistrict[dist] = [];
        wellsByDistrict[dist].push(w);
      });

      Object.keys(wellsByDistrict).sort().forEach(distName => {
        const distWells = wellsByDistrict[distName];
        
        const sheetData = distWells.map((w, index) => {
          const rowObj = {
            'Sn': w.sl_no || (index + 1),
            'District': w.district || distName,
            'BLOCK': w.block || '',
            'Villag/ULB': w.village || '',
            'Location of Observation wells': w.location || '',
            'Well Type': w.well_type || 'DW',
            'Well ID': w.well_number || '',
            'Present Well Status': w.remarks || 'Active',
            'Lat-DD': w.lat || w.lat_raw || '',
            'Long-DD': w.lon || w.lon_raw || '',
            'Installn_Dt': w.installn_dt || '',
            'Start Monitoring': w.start_mon || '',
            'End Monitoring': w.end_mon || ''
          };

          // Append historical water level columns matching standard WTTO format
          sortedSeasons.forEach(sKey => {
            let val = '';
            if (w.history && w.history[sKey] !== undefined) {
              const hVal = w.history[sKey];
              if (typeof hVal === 'number') val = hVal;
              else if (hVal && typeof hVal === 'object') val = hVal.dtgwl_mbgl ?? hVal.dtgwl_bmp ?? '';
              else val = hVal;
            }
            rowObj[sKey] = val;
          });

          return rowObj;
        });

        const ws = XLSX.utils.json_to_sheet(sheetData);

        // Standard column width styling
        const colWidths = [
          { wch: 6 },  // Sn
          { wch: 14 }, // District
          { wch: 16 }, // BLOCK
          { wch: 18 }, // Villag/ULB
          { wch: 28 }, // Location
          { wch: 10 }, // Well Type
          { wch: 18 }, // Well ID
          { wch: 14 }, // Present Well Status
          { wch: 12 }, // Lat-DD
          { wch: 12 }, // Long-DD
          { wch: 12 }, // Installn_Dt
          { wch: 14 }, // Start Mon
          { wch: 14 }  // End Mon
        ];
        sortedSeasons.forEach(() => colWidths.push({ wch: 12 }));
        ws['!cols'] = colWidths;

        const safeSheetName = distName.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
      });

      const outFilename = `WTTO_${scopeLabel}_STANDARD_FORMAT_2026.xlsx`;
      XLSX.writeFile(wb, outFilename);
      showToast(`✅ Standard WTTO Excel workbook (${outFilename}) downloaded successfully!`, 'success');
      
      const modal = document.getElementById('modal-wtto-export');
      if (modal) modal.style.display = 'none';
    } catch (err) {
      console.error('WTTO Export failed:', err);
      showToast('WTTO export failed: ' + err.message, 'error');
    } finally {
      if (btnDoWttoDownload) {
        btnDoWttoDownload.disabled = false;
        btnDoWttoDownload.innerHTML = '<span>📥</span> Download WTTO Excel File';
      }
    }
  }, 100);
}

// Auto-initialize WTTO export event handlers once DOM is interactive
// Auto-initialize WTTO export event handlers once DOM is interactive
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initWTTOExportModal();
    initTrendsView();
  });
} else {
  initWTTOExportModal();
  initTrendsView();
}

// --- Trend Analysis Section Engine ---
let trendChartInstance = null;
let rainfallChartInstance = null;

function initTrendsView() {
  const levelSelect = document.getElementById('trends-level-select');
  const distSelect = document.getElementById('trends-district-select');
  const blockSelect = document.getElementById('trends-block-select');
  const stationSelect = document.getElementById('trends-well-select');
  const chartModeSelect = document.getElementById('trends-chart-mode');
  const forecastSelect = document.getElementById('trends-forecast-mode');

  if (!levelSelect || !stationSelect) return;

  // Populate District Select
  const districts = new Set();
  getScopedWellsData().forEach(w => {
    const d = getDistrictFromWell(w);
    if (d) districts.add(d);
  });

  distSelect.innerHTML = '<option value="ALL">All Districts</option>';
  Array.from(districts).sort().forEach(d => {
    distSelect.innerHTML += `<option value="${d}">${d}</option>`;
  });

  const updateStationDropdown = () => {
    const lvl = levelSelect.value;
    const selectedDist = distSelect.value;
    const selectedBlk = blockSelect.value;

    const groupDist = document.getElementById('group-trends-district');
    const groupBlk = document.getElementById('group-trends-block');
    const groupStation = document.getElementById('group-trends-station');

    if (lvl === 'district') {
      groupDist.style.display = 'block';
      groupBlk.style.display = 'none';
      groupStation.style.display = 'none';
    } else if (lvl === 'block') {
      groupDist.style.display = 'block';
      groupBlk.style.display = 'block';
      groupStation.style.display = 'none';
    } else {
      groupDist.style.display = 'block';
      groupBlk.style.display = 'block';
      groupStation.style.display = 'block';
    }

    // Populate Blocks
    blockSelect.innerHTML = '<option value="ALL">All Blocks</option>';
    const blocks = new Set();
    getScopedWellsData().forEach(w => {
      const d = getDistrictFromWell(w);
      if ((selectedDist === 'ALL' || d === selectedDist) && w.block) {
        blocks.add(w.block);
      }
    });
    Array.from(blocks).sort().forEach(b => {
      blockSelect.innerHTML += `<option value="${b}">${b}</option>`;
    });

    // Populate Stations
    stationSelect.innerHTML = '<option value="">-- Choose Well Number --</option>';
    getScopedWellsData().forEach(w => {
      const d = getDistrictFromWell(w);
      const b = w.block;
      if ((selectedDist === 'ALL' || d === selectedDist) && (selectedBlk === 'ALL' || b === selectedBlk || normalizeGeoJSONBlock(b) === normalizeGeoJSONBlock(selectedBlk))) {
        stationSelect.innerHTML += `<option value="${w.well_number}">${w.well_number} - ${w.location || w.block}</option>`;
      }
    });

    // Auto-select first station if available
    if (lvl === 'station' && stationSelect.options.length > 1 && !stationSelect.value) {
      stationSelect.selectedIndex = 1;
    }

    renderTrendsView();
  };

  levelSelect.addEventListener('change', updateStationDropdown);
  distSelect.addEventListener('change', updateStationDropdown);
  blockSelect.addEventListener('change', updateStationDropdown);
  stationSelect.addEventListener('change', renderTrendsView);
  if (chartModeSelect) chartModeSelect.addEventListener('change', renderTrendsView);
  if (forecastSelect) forecastSelect.addEventListener('change', renderTrendsView);

  updateStationDropdown();
}

function calculateMannKendallAndSensSlope(data) {
  const validData = data.filter(v => v !== null && v !== undefined && !isNaN(v));
  const n = validData.length;
  if (n < 4) {
    return {
      s: 0,
      z: 0,
      pValue: 1.0,
      sensSlope: 0.0,
      trendText: 'N/A (Need >= 4 points)',
      trendColor: '#64748b'
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
    if (count > 1) tieSum += count * (count - 1) * (2 * count + 5);
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
      trendText = 'Depleting (Increasing BGL 🔴)';
      trendColor = '#ef4444';
    } else {
      trendText = 'Recovering (Decreasing BGL 🟢)';
      trendColor = '#10b981';
    }
  } else {
    if (s > 0) {
      trendText = 'Slight Depletion (Non-Sig. 🟡)';
      trendColor = '#f59e0b';
    } else if (s < 0) {
      trendText = 'Slight Recovery (Non-Sig. 🔵)';
      trendColor = '#3b82f6';
    }
  }

  return {
    s,
    z: Number(z.toFixed(3)),
    pValue: Number(pValue.toFixed(4)),
    sensSlope: Number(sensSlope.toFixed(4)),
    trendText,
    trendColor
  };
}

function calculateExtendedRegressionLine(values, totalLength) {
  const n = values.length;
  if (n < 2) return Array(totalLength).fill(null);

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, count = 0;
  for (let i = 0; i < n; i++) {
    const y = values[i];
    if (y !== undefined && y !== null && !isNaN(y)) {
      sumX += i;
      sumY += y;
      sumXY += i * y;
      sumXX += i * i;
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
}

function renderTrendsView() {
  const levelSelect = document.getElementById('trends-level-select');
  const distSelect = document.getElementById('trends-district-select');
  const blockSelect = document.getElementById('trends-block-select');
  const stationSelect = document.getElementById('trends-well-select');
  const chartModeSelect = document.getElementById('trends-chart-mode');
  const forecastSelect = document.getElementById('trends-forecast-mode');

  const card = document.getElementById('trends-well-card');
  const contentBox = document.getElementById('trends-content-box');
  if (!card || !contentBox) return;

  const lvl = levelSelect.value;
  const targetDist = distSelect.value;
  const targetBlk = blockSelect.value;
  const targetWellNum = stationSelect.value;
  const chartMode = chartModeSelect ? chartModeSelect.value : 'depth';
  const forecastMode = forecastSelect ? forecastSelect.value : 'none';

  let labels = [];
  let values = [];
  let titleStr = '';
  let subStr = '';

  const years = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const seasons = ['Winter', 'PreMon', 'MidMon', 'PostMon'];

  if (lvl === 'station') {
    if (!targetWellNum) {
      card.style.display = 'none';
      contentBox.style.display = 'none';
      return;
    }

    const well = getScopedWellsData().find(w => w.well_number === targetWellNum);
    if (!well) return;

    card.style.display = 'flex';
    contentBox.style.display = 'grid';

    document.getElementById('trends-well-id').textContent = `Station ID: ${well.well_number}`;
    document.getElementById('trends-well-desc').textContent = `${well.location || 'Observation Well'}, ${well.block || ''} Block`;
    document.getElementById('trends-well-dist').textContent = getDistrictFromWell(well);
    document.getElementById('trends-well-block').textContent = well.block || '-';
    document.getElementById('trends-well-aquifer').textContent = well.well_type || 'DW';

    const seasonMap = { 'Winter': 'Winter', 'PreMon': 'Pre-Monsoon', 'MidMon': 'Mid-Monsoon', 'PostMon': 'Post-Monsoon' };

    // Collect historical time-series
    years.forEach(y => {
      seasons.forEach(s => {
        if (y === 2026 && (s === 'MidMon' || s === 'PostMon')) return;
        const key = `${y}_${s}`;
        labels.push(key);
        const sFull = seasonMap[s] || 'Pre-Monsoon';
        const seasonal = getWellDataForSeason(well, sFull, y, visitsHistory);
        let val = seasonal.dtgwl_mbgl;

        if (val === null && historicalTrends) {
          const normBlk = normalizeBlockName(well.block);
          const blockTrend = historicalTrends?.blocks?.[normBlk] || historicalTrends?.blocks?.[well.block];
          if (blockTrend) {
            const item = blockTrend.find(t => t.season === key);
            if (item && item.value !== undefined) val = item.value;
          }
        }
        values.push(val);
      });
    });

    titleStr = `Water Level Depth Trend - ${well.well_number}`;
    subStr = `${well.location || ''} (${well.block})`;
  } else if (lvl === 'block') {
    if (targetBlk === 'ALL') {
      card.style.display = 'none';
      contentBox.style.display = 'none';
      return;
    }

    card.style.display = 'flex';
    contentBox.style.display = 'grid';

    document.getElementById('trends-well-id').textContent = `Block Level: ${targetBlk}`;
    document.getElementById('trends-well-desc').textContent = `Average groundwater monitoring trend across all active stations in ${targetBlk} Block`;
    document.getElementById('trends-well-dist').textContent = targetDist;
    document.getElementById('trends-well-block').textContent = targetBlk;
    document.getElementById('trends-well-aquifer').textContent = 'Block Network';

    const seasonMap = { 'Winter': 'Winter', 'PreMon': 'Pre-Monsoon', 'MidMon': 'Mid-Monsoon', 'PostMon': 'Post-Monsoon' };
    const blockWells = getScopedWellsData().filter(w => (w.block === targetBlk || normalizeGeoJSONBlock(w.block) === normalizeGeoJSONBlock(targetBlk)) && isActiveWell(w));
    years.forEach(y => {
      seasons.forEach(s => {
        if (y === 2026 && (s === 'MidMon' || s === 'PostMon')) return;
        const key = `${y}_${s}`;
        labels.push(key);
        const sFull = seasonMap[s] || 'Pre-Monsoon';
        let sum = 0, cnt = 0;
        blockWells.forEach(w => {
          const seasonal = getWellDataForSeason(w, sFull, y, visitsHistory);
          let v = seasonal.dtgwl_mbgl;
          if (v === null && historicalTrends) {
            const normBlk = normalizeBlockName(w.block);
            const blockTrend = historicalTrends?.blocks?.[normBlk] || historicalTrends?.blocks?.[w.block];
            if (blockTrend) {
              const item = blockTrend.find(t => t.season === key);
              if (item && item.value !== undefined) v = item.value;
            }
          }
          if (v !== null && v !== undefined && !isNaN(v)) {
            sum += v; cnt++;
          }
        });
        values.push(cnt > 0 ? Number((sum / cnt).toFixed(2)) : null);
      });
    });

    titleStr = `Block Average Water Level Trend - ${targetBlk}`;
    subStr = `${targetDist} District (${blockWells.length} Stations)`;
  } else {
    card.style.display = 'flex';
    contentBox.style.display = 'grid';

    const distName = targetDist === 'ALL' ? 'Odisha State' : targetDist;
    document.getElementById('trends-well-id').textContent = `District Level: ${distName}`;
    document.getElementById('trends-well-desc').textContent = `Groundwater level monitoring average trend across ${distName}`;
    document.getElementById('trends-well-dist').textContent = distName;
    document.getElementById('trends-well-block').textContent = 'All Division';
    document.getElementById('trends-well-aquifer').textContent = 'District Network';

    const seasonMap = { 'Winter': 'Winter', 'PreMon': 'Pre-Monsoon', 'MidMon': 'Mid-Monsoon', 'PostMon': 'Post-Monsoon' };
    const normDistTarget = normalizeGeoJSONDistrict(targetDist);
    const distWells = getScopedWellsData().filter(w => (targetDist === 'ALL' || normalizeGeoJSONDistrict(getDistrictFromWell(w)) === normDistTarget) && isActiveWell(w));
    years.forEach(y => {
      seasons.forEach(s => {
        if (y === 2026 && (s === 'MidMon' || s === 'PostMon')) return;
        const key = `${y}_${s}`;
        labels.push(key);
        const sFull = seasonMap[s] || 'Pre-Monsoon';
        let sum = 0, cnt = 0;
        distWells.forEach(w => {
          const seasonal = getWellDataForSeason(w, sFull, y, visitsHistory);
          let v = seasonal.dtgwl_mbgl;
          if (v === null && historicalTrends) {
            const normBlk = normalizeBlockName(w.block);
            const blockTrend = historicalTrends?.blocks?.[normBlk] || historicalTrends?.blocks?.[w.block];
            if (blockTrend) {
              const item = blockTrend.find(t => t.season === key);
              if (item && item.value !== undefined) v = item.value;
            }
          }
          if (v !== null && v !== undefined && !isNaN(v)) {
            sum += v; cnt++;
          }
        });
        values.push(cnt > 0 ? Number((sum / cnt).toFixed(2)) : null);
      });
    });

    titleStr = `District Average Water Level Trend - ${distName}`;
    subStr = `Network Total (${distWells.length} Stations)`;
  }

  // Calculate Mann-Kendall statistics
  const mkResult = calculateMannKendallAndSensSlope(values);
  document.getElementById('mk-s-val').textContent = mkResult.s;
  document.getElementById('mk-z-score').textContent = mkResult.z;
  document.getElementById('mk-p-val').textContent = mkResult.pValue;
  document.getElementById('mk-sens-slope').textContent = `${mkResult.sensSlope} m/yr`;

  const mkStatusBox = document.getElementById('mk-trend-status');
  if (mkStatusBox) {
    mkStatusBox.textContent = `Trend Result: ${mkResult.trendText}`;
    mkStatusBox.style.background = mkResult.trendColor + '20';
    mkStatusBox.style.color = mkResult.trendColor;
    mkStatusBox.style.border = `1px solid ${mkResult.trendColor}`;
    mkStatusBox.style.padding = '8px 12px';
    mkStatusBox.style.borderRadius = '8px';
    mkStatusBox.style.fontWeight = 'bold';
    mkStatusBox.style.marginTop = '10px';
  }

  // Render Forecast years list
  const forecastList = document.getElementById('forecast-years-list');
  const forecastWarning = document.getElementById('forecast-warning-box');
  if (forecastList) {
    forecastList.innerHTML = '';
    const validVals = values.filter(v => v !== null && !isNaN(v));
    const regLine = calculateExtendedRegressionLine(validVals, validVals.length + 8);
    const lastVal = regLine[validVals.length - 1] || 4.5;

    const futureYears = [2027, 2028, 2029, 2030, 2031];
    futureYears.forEach((yr, idx) => {
      const projVal = (lastVal + (mkResult.sensSlope * (idx + 1))).toFixed(2);
      forecastList.innerHTML += `
        <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border-color); font-size:0.85rem;">
          <span>Projection Year ${yr}:</span>
          <strong>${projVal} m BGL</strong>
        </div>
      `;
    });

    if (forecastWarning) {
      if (mkResult.sensSlope > 0.15) {
        forecastWarning.textContent = '⚠️ WARNING: High depletion rate observed! Water table rising >0.15 m/yr deeper BGL.';
        forecastWarning.style.background = '#ef444420';
        forecastWarning.style.color = '#ef4444';
      } else {
        forecastWarning.textContent = '✅ Stable or recovering groundwater regime maintained.';
        forecastWarning.style.background = '#10b98120';
        forecastWarning.style.color = '#10b981';
      }
    }
  }

  // Render Primary Chart
  const ctx = document.getElementById('chart-historical-trends');
  if (ctx) {
    if (trendChartInstance) trendChartInstance.destroy();

    const isDark = theme === 'dark';
    const textColor = isDark ? '#f8fafc' : '#0f172a';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    let chartDatasets = [];

    if (chartMode === 'pre_vs_post') {
      // Group by year for Pre vs Post
      const yearMap = {};
      labels.forEach((lbl, i) => {
        const parts = lbl.split('_');
        const y = parts[0];
        const s = parts[1];
        if (!yearMap[y]) yearMap[y] = {};
        yearMap[y][s] = values[i];
      });

      const yLabels = Object.keys(yearMap).sort();
      const preVals = yLabels.map(y => yearMap[y]['PreMon'] ?? null);
      const postVals = yLabels.map(y => yearMap[y]['PostMon'] ?? null);

      trendChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: yLabels,
          datasets: [
            { label: 'Pre-Monsoon (m BGL)', data: preVals, backgroundColor: '#f59e0b' },
            { label: 'Post-Monsoon (m BGL)', data: postVals, backgroundColor: '#0284c7' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { reverse: true, title: { display: true, text: 'Depth (m BGL)', color: textColor }, grid: { color: gridColor }, ticks: { color: textColor } },
            x: { grid: { color: gridColor }, ticks: { color: textColor } }
          },
          plugins: { legend: { labels: { color: textColor } } }
        }
      });
    } else if (chartMode === 'fluctuation') {
      const yearMap = {};
      labels.forEach((lbl, i) => {
        const parts = lbl.split('_');
        const y = parts[0];
        const s = parts[1];
        if (!yearMap[y]) yearMap[y] = {};
        yearMap[y][s] = values[i];
      });

      const yLabels = Object.keys(yearMap).sort();
      const flucVals = yLabels.map(y => {
        const pre = yearMap[y]['PreMon'];
        const post = yearMap[y]['PostMon'];
        return (pre !== undefined && post !== undefined && pre !== null && post !== null) ? Number((pre - post).toFixed(2)) : null;
      });

      trendChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: yLabels,
          datasets: [
            {
              label: 'Seasonal Fluctuation (PreMon - PostMon Rise in m)',
              data: flucVals,
              backgroundColor: flucVals.map(v => v >= 0 ? '#10b981' : '#ef4444')
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { title: { display: true, text: 'Fluctuation Rise (m)', color: textColor }, grid: { color: gridColor }, ticks: { color: textColor } },
            x: { grid: { color: gridColor }, ticks: { color: textColor } }
          },
          plugins: { legend: { labels: { color: textColor } } }
        }
      });
    } else {
      // Default: Line chart of depth BGL over time
      chartDatasets.push({
        label: `${titleStr} (m BGL)`,
        data: values,
        borderColor: '#0284c7',
        backgroundColor: 'rgba(2, 132, 199, 0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#0284c7'
      });

      // Add extended forecast line if enabled
      if (forecastMode !== 'none') {
        const extraPoints = forecastMode === '2047' ? 20 : 10;
        const totalLen = labels.length + extraPoints;
        const extLabels = [...labels];
        for (let i = 1; i <= extraPoints; i++) {
          extLabels.push(`Forecast +${i}`);
        }

        const validVals = values.filter(v => v !== null && !isNaN(v));
        const extReg = calculateExtendedRegressionLine(validVals, totalLen);

        chartDatasets.push({
          label: `Extended Linear Forecast (${forecastMode})`,
          data: extReg,
          borderColor: '#ef4444',
          borderDash: [6, 6],
          fill: false,
          pointRadius: 0
        });

        labels = extLabels;
      }

      trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: chartDatasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { reverse: true, title: { display: true, text: 'Depth (m BGL)', color: textColor }, grid: { color: gridColor }, ticks: { color: textColor } },
            x: { grid: { color: gridColor }, ticks: { color: textColor, maxRotation: 45 } }
          },
          plugins: { legend: { labels: { color: textColor } } }
        }
      });
    }
  }

  // Render Dual Y-Axis Rainfall Correlation Chart
  const rainCtx = document.getElementById('chart-rainfall-correlation');
  if (rainCtx) {
    if (rainfallChartInstance) rainfallChartInstance.destroy();

    const isDark = theme === 'dark';
    const textColor = isDark ? '#f8fafc' : '#0f172a';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    // Mock rainfall pattern aligned with labels
    const rainVals = labels.map(l => {
      if (l.includes('PreMon')) return 120;
      if (l.includes('MidMon')) return 850;
      if (l.includes('PostMon')) return 320;
      if (l.includes('Winter')) return 45;
      return 100;
    });

    rainfallChartInstance = new Chart(rainCtx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            type: 'bar',
            label: 'Rainfall (mm)',
            data: rainVals,
            backgroundColor: 'rgba(56, 189, 248, 0.4)',
            borderColor: '#38bdf8',
            yAxisID: 'yRain'
          },
          {
            type: 'line',
            label: 'Water Depth (m BGL)',
            data: values,
            borderColor: '#0284c7',
            tension: 0.3,
            yAxisID: 'yDepth'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          yDepth: {
            type: 'linear',
            position: 'left',
            reverse: true,
            title: { display: true, text: 'Water Level (m BGL)', color: textColor },
            grid: { color: gridColor },
            ticks: { color: textColor }
          },
          yRain: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Rainfall (mm)', color: textColor },
            grid: { drawOnChartArea: false },
            ticks: { color: textColor }
          },
          x: { grid: { color: gridColor }, ticks: { color: textColor, maxRotation: 45 } }
        },
        plugins: { legend: { labels: { color: textColor } } }
      }
    });
  }
}

