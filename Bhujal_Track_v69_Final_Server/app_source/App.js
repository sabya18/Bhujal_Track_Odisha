import React, { useState, useEffect, useMemo, Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#ef4444', marginBottom: 12 }}>Something went wrong</Text>
          <Text style={{ fontSize: 14, color: '#94a3b8', textAlign: 'center', marginBottom: 24 }}>
            {this.state.error ? String(this.state.error) : 'An unexpected error occurred.'}
          </Text>
          <TouchableOpacity 
            style={{ backgroundColor: '#0284c7', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 16 }}>Reload Application</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  SafeAreaView, 
  StatusBar, 
  Alert, 
  Platform,
  useColorScheme,
  Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadWells, saveWells, resetWells, saveCustomTemplate, saveVisitToHistory, saveMultipleVisitsToHistory, loadWttoData, saveWttoData, loadVisitsHistory, normalizeBlockName } from './src/utils/storage';
import Dashboard from './src/screens/Dashboard';
import WellsMap from './src/screens/WellsMap';
import Directory from './src/screens/Directory';
import NewsScreen from './src/screens/NewsScreen';
import TrendChart from './src/screens/TrendChart';
import TelemetryScreen from './src/screens/TelemetryScreen';
import FieldBookScreen from './src/screens/FieldBookScreen';
import LoginScreen from './src/screens/LoginScreen';

const detectCurrentSeasonLocal = (dateObj) => {
  const d = dateObj || new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const val = month * 100 + day;

  if (val >= 201 && val <= 315) {
    return `Season-Winter -${year}`;
  } else if (val >= 420 && val <= 610) {
    return `Season- Pre-Monsson-${year}`;
  } else if (val >= 801 && val <= 1010) {
    return `Mid-Monsoon-${year}`;
  } else if (val >= 1101 && val <= 1231) {
    return `Post-Monsson-${year}`;
  } else if (val >= 101 && val <= 110) {
    return `Post-Monsson-${year - 1}`;
  } else {
    if (val > 110 && val < 201) return `Season-Winter -${year}`;
    if (val > 315 && val < 420) return `Season- Pre-Monsson-${year}`;
    if (val > 610 && val < 801) return `Mid-Monsoon-${year}`;
    return `Post-Monsson-${year}`;
  }
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
  
  const lower = targetSeasonStr.toLowerCase();
  let targetSeason = 'Winter';
  if (lower.includes('pre')) targetSeason = 'Pre-Monsoon';
  else if (lower.includes('mid') || lower.includes('mon')) {
    if (lower.includes('mid')) targetSeason = 'Mid-Monsoon';
    else if (lower.includes('post')) targetSeason = 'Post-Monsoon';
  } else if (lower.includes('win')) {
    targetSeason = 'Winter';
  }
  
  const match = targetSeasonStr.match(/\d{4}/);
  const targetYear = match ? parseInt(match[0], 10) : new Date().getFullYear();
  
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

const getWellDataForSeason = (well, seasonName, year, visitsHistory = {}) => {
  let seasonCode = 'Winter';
  if (seasonName.includes('Pre')) seasonCode = 'PreMon';
  else if (seasonName.includes('Mid')) seasonCode = 'MidMon';
  else if (seasonName.includes('Post')) seasonCode = 'PostMon';
  
  const seasonKey = `${year}_${seasonCode}`;
  
  let defaultDate = '15.02.' + year;
  if (seasonName === 'Pre-Monsoon') defaultDate = '15.05.' + year;
  else if (seasonName === 'Mid-Monsoon') defaultDate = '15.09.' + year;
  else if (seasonName === 'Post-Monsoon') defaultDate = '15.11.' + year;

  // 1. Check user recorded visits
  const histRecord = visitsHistory[well.well_number]?.[seasonKey];
  if (histRecord && histRecord.value !== null && histRecord.value !== undefined) {
    return {
      date: histRecord.date || defaultDate,
      dtgwl_mbgl: histRecord.value,
      dtgwl_bmp: histRecord.value + (well.parapet_height || 0)
    };
  }

  // 2. Check well.date directly if it matches this season
  if (well.date) {
    const targetSeasonStr = `${seasonName} ${year}`;
    if (checkDateInSeasonRangeLocal(well.date, targetSeasonStr)) {
      return {
        date: well.date,
        dtgwl_mbgl: well.dtgwl_mbgl,
        dtgwl_bmp: well.dtgwl_bmp
      };
    }
  }

  // 3. Check well.history (imported WTTO/division history)
  if (well.history && well.history[seasonKey] !== undefined && well.history[seasonKey] !== null) {
    const val = parseFloat(well.history[seasonKey]);
    if (!isNaN(val) && val <= 150 && val >= 0) {
      return {
        date: defaultDate,
        dtgwl_mbgl: val,
        dtgwl_bmp: val + (well.parapet_height || 0)
      };
    }
  }

  return {
    date: null,
    dtgwl_mbgl: null,
    dtgwl_bmp: null
  };
};

function AppMain() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [wellsData, setWellsData] = useState([]);
  const [wttoData, setWttoData] = useState([]);
  const [visitsHistory, setVisitsHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [preloadWell, setPreloadWell] = useState(null);
  const [showNewsModal, setShowNewsModal] = useState(false);
  const [showFieldBookModal, setShowFieldBookModal] = useState(false);
  const [selectedTrendWell, setSelectedTrendWell] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [username, setUsername] = useState('GWD_ODISHA');
  const [serverUrl, setServerUrl] = useState('');

  const handleFieldBookImportSuccess = async (importedRecords) => {
    let updatedCount = 0;
    let addedCount = 0;
    const nextWells = [...wellsData];

    importedRecords.forEach(rec => {
      const idx = nextWells.findIndex(w => 
        (w.well_id && w.well_id.toLowerCase() === rec.well_id.toLowerCase()) ||
        (w.district && w.district.toLowerCase() === rec.district.toLowerCase() &&
         w.block && w.block.toLowerCase() === rec.block.toLowerCase() &&
         w.location && w.location.toLowerCase() === rec.location.toLowerCase())
      );

      if (idx >= 0) {
        nextWells[idx].dtgwl_mbgl = rec.dtgwl_mbgl;
        nextWells[idx].date = rec.date;
        if (rec.dtgwl_bmp) nextWells[idx].dtgwl_bmp = rec.dtgwl_bmp;
        if (rec.total_depth) nextWells[idx].depth = rec.total_depth;
        if (rec.parapet_height) nextWells[idx].parapet = rec.parapet_height;
        if (rec.latitude) nextWells[idx].latitude = rec.latitude;
        if (rec.longitude) nextWells[idx].longitude = rec.longitude;
        if (rec.well_type) nextWells[idx].well_type = rec.well_type;
        if (rec.remarks) nextWells[idx].remarks = rec.remarks;
        updatedCount++;
      } else {
        nextWells.push({
          district: rec.district,
          block: rec.block,
          well_id: rec.well_id,
          location: rec.location,
          dtgwl_mbgl: rec.dtgwl_mbgl,
          dtgwl_bmp: rec.dtgwl_bmp,
          depth: rec.total_depth,
          parapet: rec.parapet_height,
          date: rec.date,
          latitude: rec.latitude || 20.4625,
          longitude: rec.longitude || 85.8828,
          well_type: rec.well_type || 'DW',
          remarks: rec.remarks || 'Active'
        });
        addedCount++;
      }
    });

    setWellsData(nextWells);
    await saveWells(nextWells);
    setShowFieldBookModal(false);
  };

  const initSeasonObj = useMemo(() => {
    const currentStr = detectCurrentSeasonLocal();
    const lower = currentStr.toLowerCase();
    let season = 'Winter';
    if (lower.includes('pre')) season = 'Pre-Monsoon';
    else if (lower.includes('mid') || (lower.includes('monsoon') && !lower.includes('post'))) season = 'Mid-Monsoon';
    else if (lower.includes('post')) season = 'Post-Monsoon';
    
    const match = currentStr.match(/\d{4}/);
    const year = match ? parseInt(match[0], 10) : new Date().getFullYear();
    return { season, year };
  }, []);

  const [selectedSeason, setSelectedSeason] = useState('Pre-Monsoon');
  const [selectedYear, setSelectedYear] = useState(2026); // Fixed to 2026 as per user option choice

  const systemScheme = useColorScheme();
  const [theme, setTheme] = useState('dark'); // Default to obsidian dark

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      
      // Load cached server URL from storage
      const cachedUrl = await AsyncStorage.getItem('gw_server_url');
      if (cachedUrl) {
        setServerUrl(cachedUrl);
      }

      // Load session token/info from AsyncStorage
      const sessionStr = await AsyncStorage.getItem('user_session');
      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          if (session && session.username) {
            setIsLoggedIn(true);
            setUsername(session.username);
          }
        } catch (e) {
          console.warn("Invalid login session in storage.");
        }
      }
      
      const data = await loadWells();
      setWellsData(data);
      const wtto = await loadWttoData();
      setWttoData(wtto);
      const history = await loadVisitsHistory();
      setVisitsHistory(history || {});
      setLoading(false);
    };
    initData();
  }, []);

  const handleLogout = async () => {
    await AsyncStorage.removeItem('user_session');
    setIsLoggedIn(false);
    setUsername(null);
  };

  const handleSaveServerUrl = async (url) => {
    setServerUrl(url);
    await AsyncStorage.setItem('gw_server_url', url);
  };

  const handleSyncWithServer = async () => {
    setLoading(true);
    try {
      // Retrieve the stored session token
      const sessionStr = await AsyncStorage.getItem('user_session');
      let token = null;
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        token = session.token;
      }
      
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Fetch wells list from the server
      const base = serverUrl || '';
      const wellsRes = await fetch(`${base.replace(/\/$/, '')}/api/wells`, { headers });
      if (!wellsRes.ok) {
        throw new Error(`Server returned ${wellsRes.status} on wells sync`);
      }
      const serverWells = await wellsRes.json();
      
      // Fetch visits history map from the server
      const historyRes = await fetch(`${base.replace(/\/$/, '')}/api/visits/history`, { headers });
      if (!historyRes.ok) {
        throw new Error(`Server returned ${historyRes.status} on visits history sync`);
      }
      const serverHistory = await historyRes.json();
      
      // Update wells local cache
      const normalizedWells = serverWells.map(well => ({
        ...well,
        block: normalizeBlockName(well.block)
      }));
      setWellsData(normalizedWells);
      await saveWells(normalizedWells);
      
      // Update visits history local cache
      setVisitsHistory(serverHistory);
      await AsyncStorage.setItem('gw_visits_history', JSON.stringify(serverHistory));
      
      Alert.alert(
        "Sync Success 🟢",
        `Successfully synced with PostgreSQL database!\n` +
        `• Synced: ${normalizedWells.length} wells\n` +
        `• Synced: ${Object.keys(serverHistory).length} stations history records.`
      );
    } catch (err) {
      console.error("Sync error:", err);
      Alert.alert("Sync Failure 🔴", "Could not sync database from server:\n" + err.message);
    } finally {
      setLoading(false);
    }
  };

  const mappedWellsData = useMemo(() => {
    return wellsData.map(well => {
      const seasonalData = getWellDataForSeason(well, selectedSeason, selectedYear, visitsHistory);
      return {
        ...well,
        date: seasonalData.date,
        dtgwl_mbgl: seasonalData.dtgwl_mbgl,
        dtgwl_bmp: seasonalData.dtgwl_bmp
      };
    });
  }, [wellsData, selectedSeason, selectedYear, visitsHistory]);

  useEffect(() => {
    const loadThemeSetting = async () => {
      try {
        const cachedTheme = await AsyncStorage.getItem('gw_app_theme');
        if (cachedTheme) {
          setTheme(cachedTheme);
        } else if (systemScheme) {
          setTheme(systemScheme);
        }
      } catch (err) {
        console.warn(err);
      }
    };
    loadThemeSetting();
  }, [systemScheme]);

  const toggleTheme = async () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      await AsyncStorage.setItem('gw_app_theme', nextTheme);
    } catch (err) {
      console.warn(err);
    }
  };

  // When tapping Record Field Visit in Directory or Map, redirect to Dashboard and pre-fill form
  const handleRecordVisitClick = (well) => {
    setPreloadWell(well);
    setActiveTab('dashboard');
  };

  const inferSeasonFromDate = (dateStr) => {
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

  // General-purpose save and update callback for existing/new stations
  const handleSaveWell = async (wellObj) => {
    let updatedData;
    const exists = wellsData.some(w => w.sheet === wellObj.sheet && w.row_idx === wellObj.row_idx);
    
    if (exists) {
      // Update existing well in array
      updatedData = wellsData.map(w => {
        if (w.sheet === wellObj.sheet && w.row_idx === wellObj.row_idx) {
          return { ...w, ...wellObj };
        }
        return w;
      });
    } else {
      // Insert newly added well to array
      updatedData = [...wellsData, wellObj];
    }

    setWellsData(updatedData);
    const success = await saveWells(updatedData);
 
    if (success) {
      // Save to visits history persistently
      try {
        let year = new Date().getFullYear();
        if (wellObj.date) {
          const dateParts = wellObj.date.split('.');
          if (dateParts.length === 3) {
            year = parseInt(dateParts[2], 10);
          } else {
            const hyphenParts = wellObj.date.split('-');
            if (hyphenParts.length === 3) {
              year = parseInt(hyphenParts[0].length === 4 ? hyphenParts[0] : hyphenParts[2], 10);
            }
          }
        }
        
        let seasonCode = 'Winter';
        if (wellObj.season) {
          const lowerSeason = wellObj.season.toLowerCase();
          if (lowerSeason.includes('pre')) seasonCode = 'PreMon';
          else if (lowerSeason.includes('mid')) seasonCode = 'MidMon';
          else if (lowerSeason.includes('post')) seasonCode = 'PostMon';
          else seasonCode = 'Winter';
        }
        
        const seasonKey = `${year}_${seasonCode}`;
        await saveVisitToHistory(wellObj.well_number, seasonKey, wellObj.date, wellObj.dtgwl_mbgl);

        // Also update local visitsHistory state so UI updates immediately
        setVisitsHistory(prev => {
          const updated = { ...prev };
          if (!updated[wellObj.well_number]) {
            updated[wellObj.well_number] = {};
          }
          updated[wellObj.well_number][seasonKey] = {
            date: wellObj.date || '',
            value: wellObj.dtgwl_mbgl != null ? parseFloat(wellObj.dtgwl_mbgl) : null
          };
          return updated;
        });
      } catch (e) {
        console.warn("Failed to write to visit history:", e);
      }
    } else {
      Alert.alert("Error", "Failed to save station details offline.");
    }
  };

  const handleSaveAllWells = async (updatedWells) => {
    setWellsData(updatedWells);
    const success = await saveWells(updatedWells);
    return success;
  };

  const handleResetDB = () => {
    Alert.alert(
      "Reset Database",
      "Are you sure you want to restore the wells database back to winter field book default template? All your mobile records and new stations will be cleared.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Reset", 
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            const restored = await resetWells();
            setWellsData(restored);
            const history = await loadVisitsHistory();
            setVisitsHistory(history || {});
            setLoading(false);
            Alert.alert("Reset Complete", "Database successfully restored to defaults.");
          }
        }
      ]
    );
  };

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
    if (c.includes('jagatsinghpur') || c.includes('jagatsinghapur') || c.includes('jspur') || c.includes('jagatsingpur') || c.includes('jagatsighpur') || c.includes('jagatsighpuyr') || c.includes('jtsgp')) {
      return 'Jagatsinghpur';
    }
    if (c.includes('bolangir') || c.includes('balangir') || c.includes('blgr')) {
      return 'Balangir';
    }
    if (c.includes('bhubaneswar') || c.includes('khurda') || c.includes('khordha') || c.includes('hordha') || c.includes('khurdha') || c.includes('khorda') || c.includes('bbsr')) {
      return 'Khordha';
    }
    if (c.includes('nawarangapur') || c.includes('nabarangapur') || c.includes('nabarangpur') || c.includes('nbrg')) {
      return 'Nabarangpur';
    }
    if (c.includes('debagarh') || c.includes('deogarh') || c.includes('dgr')) {
      return 'Deogarh';
    }
    if (c.includes('baleshwar') || c.includes('balasore') || c.includes('balesore') || c.includes('bls')) {
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
 
  const getDivisionForDistrictLocal = (district) => {
    const d = (district || '').toLowerCase().trim();
    if (d === 'all districts') return 'ALL DIVISIONS';
    if (d.includes('rs') || d.includes('research')) return 'RS DIVISION';
    if (d.includes('hp') || d.includes('hydrology')) return 'AD HP DIVISION';
    if (['cuttack', 'cuttack urban', 'kendrapara', 'kendrapara urban', 'jajpur', 'jajpur urban', 'jagatsinghpur', 'jspur', 'khordha', 'puri', 'nayagarh'].some(x => d.includes(x))) return 'CUTTACK DIVISION';
    if (['sambalpur', 'jharsuguda', 'sundargarh', 'deogarh'].includes(d)) return 'SAMBALPUR DIVISION';
    if (['ganjam', 'gajapati', 'kandhamal', 'boudh'].includes(d)) return 'BERHAMPUR DIVISION';
    if (['balasore', 'bhadrak', 'mayurbhanj'].includes(d)) return 'BALASORE DIVISION';
    if (['bolangir', 'subarnapur', 'bargarh'].includes(d)) return 'BOLANGIR DIVISION';
    if (['koraput', 'nabarangpur', 'malkangiri'].includes(d)) return 'KORAPUT DIVISION';
    if (['kalahandi', 'nuapada', 'rayagada'].includes(d)) return 'BHAWANIPATNA DIVISION';
    if (['angul', 'dhenkanal', 'keonjhar'].includes(d)) return 'ANGUL DIVISION';
    return 'CUTTACK DIVISION';
  };

  const handleImportWellsData = async (newWells, templateB64, division) => {
    setLoading(true);
    try {
      // Filter out existing wells that belong to the division we are importing
      let otherWells;
      if (division === 'ALL DISTRICTS (AUTOMATIC)' || division === 'ALL DISTRICTS') {
        const importedDistricts = new Set(newWells.map(w => getDistrictFromSheetLocal(w.sheet).toUpperCase()));
        otherWells = wellsData.filter(w => {
          const dist = getDistrictFromSheetLocal(w.sheet).toUpperCase();
          return !importedDistricts.has(dist);
        });
      } else {
        otherWells = wellsData.filter(w => {
          const dist = getDistrictFromSheetLocal(w.sheet);
          const div = getDivisionForDistrictLocal(dist);
          return div !== division;
        });
      }

      // Combine other divisions with new wells
      const updatedData = [...otherWells, ...newWells];
      setWellsData(updatedData);
      
      // Save database and custom template
      await saveWells(updatedData);

      // Batch save imported wells to visits history
      try {
        const historyVisits = [];
        newWells.forEach(well => {
          // 1. Add current active visit
          if (well.well_number && well.date && well.dtgwl_mbgl !== null && well.dtgwl_mbgl !== undefined) {
            const seasonKey = inferSeasonFromDate(well.date);
            if (seasonKey) {
              historyVisits.push({
                wellNumber: well.well_number,
                seasonKey,
                date: well.date,
                value: well.dtgwl_mbgl
              });
            }
          }
          // 2. Add parsed historical visits from the excel sheet
          if (well.well_number && well.history) {
            Object.keys(well.history).forEach(seasonKey => {
              const val = well.history[seasonKey];
              if (val !== null && val !== undefined && val !== '') {
                historyVisits.push({
                  wellNumber: well.well_number,
                  seasonKey: seasonKey,
                  date: '',
                  value: val
                });
              }
            });
          }
        });
        if (historyVisits.length > 0) {
          await saveMultipleVisitsToHistory(historyVisits);
        }
      } catch (e) {
        console.warn("Failed to write imported wells to visit history:", e);
      }

      const history = await loadVisitsHistory();
      setVisitsHistory(history || {});

      if (templateB64) {
        await saveCustomTemplate(division, templateB64);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to import division data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportAppSheet = async (newWells, newVisits, diagnostics) => {
    setLoading(true);
    try {
      const existingWellsMap = {};
      wellsData.forEach(w => {
        existingWellsMap[w.well_number] = w;
      });
      
      newWells.forEach(w => {
        existingWellsMap[w.well_number] = {
          ...(existingWellsMap[w.well_number] || {}),
          ...w
        };
      });
      
      const updatedWells = Object.values(existingWellsMap);
      setWellsData(updatedWells);
      await saveWells(updatedWells);
      
      if (newVisits && newVisits.length > 0) {
        await saveMultipleVisitsToHistory(newVisits);
      }
      
      const updatedHistory = await loadVisitsHistory();
      setVisitsHistory(updatedHistory || {});
      
      const dm = diagnostics || {};
      const cols = dm.colsMatched || {};
      Alert.alert(
        "Sync Complete 🟢",
        `• Synced: ${dm.recordsSynced || 0} visits (${newWells.length} stations)\n` +
        `• Skipped (missing data): ${dm.recordsSkipped || 0} rows\n` +
        `• Tab Name: "${dm.sheetName || 'N/A'}"\n` +
        `• Columns Matched:\n` +
        `  - Well ID: ${cols.wellId ? '🟢' : '🔴'}\n` +
        `  - Date: ${cols.date ? '🟢' : '🔴'}\n` +
        `  - Season: ${cols.season ? '🟢' : '🔴'}\n` +
        `  - Water Level (BMP): ${cols.waterLevel ? '🟢' : '🔴'}\n` +
        `  - Parapet Height: ${cols.parapet ? '🟢' : '🔴'}`
      );
      return true;
    } catch (err) {
      console.error("AppSheet sync error:", err);
      Alert.alert("Sync Error", err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleImportWTTOData = async (newWTTOWells, templateB64, district) => {
    setLoading(true);
    try {
      const currentWtto = await loadWttoData();
      
      // Normalize sheet names to prevent collision (e.g. Jajpur "Block" -> "Jajpur_Blocks")
      const normalizedWTTOWells = newWTTOWells.map(well => {
        let sheetName = well.sheet || '';
        const lowerSheet = sheetName.toLowerCase().trim();
        if (district !== "All Districts" && (lowerSheet === 'block' || lowerSheet === 'urban')) {
          const isUrban = lowerSheet === 'urban' || district.toLowerCase().includes('urban');
          const cleanDistrict = district.replace(/\s+Urban/gi, '');
          sheetName = cleanDistrict + (isUrban ? '_urban' : '_Blocks');
        }
        return {
          ...well,
          sheet: sheetName
        };
      });

      // Determine which districts we are updating
      let districtsToUpdate = [];
      if (district === "All Districts") {
        districtsToUpdate = Array.from(new Set(normalizedWTTOWells.map(w => getDistrictFromSheetLocal(w.sheet))));
      } else {
        districtsToUpdate = [district];
      }

      // Process and preserve 2026 monitoring data for all 30 districts
      const processedImportedWells = normalizedWTTOWells.map(importedWell => {
        const wellDist = getDistrictFromSheetLocal(importedWell.sheet);
        
        let mergedHistory = { ...(importedWell.history || {}) };
        
        // Preserve existing 2026 data from database if not present in new import
        const existingWell = currentWtto.find(w => w.well_number === importedWell.well_number && getDistrictFromSheetLocal(w.sheet) === wellDist);
        if (existingWell && existingWell.history) {
          Object.keys(existingWell.history).forEach(key => {
            if (key.startsWith('2026') && (mergedHistory[key] === undefined || mergedHistory[key] === null || mergedHistory[key] === '')) {
              mergedHistory[key] = existingWell.history[key];
            }
          });
        }
        
        return {
          ...importedWell,
          history: mergedHistory
        };
      });

      // Filter out existing WTTO wells belonging to the districts we are updating
      const otherWtto = currentWtto.filter(w => {
        const d = getDistrictFromSheetLocal(w.sheet);
        return !districtsToUpdate.includes(d);
      });

      // Combine other districts with new processed WTTO wells
      const updatedWtto = [...otherWtto, ...processedImportedWells];
      setWttoData(updatedWtto);
      
      // Save WTTO database
      await saveWttoData(updatedWtto);

      // Save custom template base64 under district key
      if (templateB64) {
        await saveCustomTemplate(district, templateB64);
      }

      // Sync WTTO history values with visitsHistory
      try {
        const historyVisits = [];
        processedImportedWells.forEach(well => {
          if (well.well_number && well.history) {
            Object.keys(well.history).forEach(seasonKey => {
              const val = well.history[seasonKey];
              if (val !== null && val !== undefined && val !== '') {
                historyVisits.push({
                  wellNumber: well.well_number,
                  seasonKey: seasonKey,
                  date: '',
                  value: val
                });
              }
            });
          }
        });
        if (historyVisits.length > 0) {
          await saveMultipleVisitsToHistory(historyVisits);
        }
      } catch (e) {
        console.warn("Failed to write WTTO wells to visits history:", e);
      }

      const history = await loadVisitsHistory();
      setVisitsHistory(history || {});
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to import WTTO data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Render active panel
  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard 
            wellsData={mappedWellsData} 
            wttoData={wttoData}
            loading={loading} 
            onResetDB={handleResetDB} 
            onSaveWell={handleSaveWell}
            onSaveAllWells={handleSaveAllWells}
            onImportDB={handleImportWellsData}
            onImportWTTO={handleImportWTTOData}
            onImportAppSheet={handleImportAppSheet}
            visitsHistory={visitsHistory}
            preloadWell={preloadWell}
            clearPreloadWell={() => setPreloadWell(null)}
            theme={theme}
            toggleTheme={toggleTheme}
            onOpenNews={() => setShowNewsModal(true)}
            selectedSeason={selectedSeason}
            setSelectedSeason={setSelectedSeason}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            onLogout={handleLogout}
            serverUrl={serverUrl}
            onSaveServerUrl={handleSaveServerUrl}
          />
        );
      case 'map':
        return (
          <WellsMap 
            wellsData={mappedWellsData} 
            onRecordVisit={handleRecordVisitClick} 
            onViewTrend={(well) => setSelectedTrendWell(well)}
            theme={theme}
            toggleTheme={toggleTheme}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            selectedSeason={selectedSeason}
            setSelectedSeason={setSelectedSeason}
            wttoData={wttoData}
          />
        );
      case 'directory':
        return (
          <Directory 
            wellsData={mappedWellsData} 
            onRecordVisit={handleRecordVisitClick} 
            theme={theme}
            toggleTheme={toggleTheme}
            selectedSeason={selectedSeason}
            selectedYear={selectedYear}
          />
        );
      case 'trends':
        return (
          <TrendChart 
            wellsData={mappedWellsData} 
            wttoData={wttoData}
            theme={theme}
            toggleTheme={toggleTheme}
          />
        );
      case 'telemetry':
        return (
          <TelemetryScreen 
            theme={theme}
            toggleTheme={toggleTheme}
            serverUrl={serverUrl}
          />
        );
      case 'fieldbook':
        return (
          <FieldBookScreen
            onClose={() => setActiveTab('dashboard')}
            onImportData={handleFieldBookImportSuccess}
            theme={theme}
          />
        );
      default:
        return (
          <Dashboard 
            wellsData={mappedWellsData} 
            wttoData={wttoData}
            loading={loading} 
            onResetDB={handleResetDB} 
            onSaveWell={handleSaveWell}
            onSaveAllWells={handleSaveAllWells}
            onImportDB={handleImportWellsData}
            onImportWTTO={handleImportWTTOData}
            onImportAppSheet={handleImportAppSheet}
            visitsHistory={visitsHistory}
            preloadWell={preloadWell}
            clearPreloadWell={() => setPreloadWell(null)}
            theme={theme}
            toggleTheme={toggleTheme}
            onOpenNews={() => setShowNewsModal(true)}
            onOpenFieldBook={() => setShowFieldBookModal(true)}
            selectedSeason={selectedSeason}
            setSelectedSeason={setSelectedSeason}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            onLogout={handleLogout}
            serverUrl={serverUrl}
            onSaveServerUrl={handleSaveServerUrl}
          />
        );
    }
  };

  const isDark = theme === 'dark';
  const containerStyle = [styles.container, { backgroundColor: isDark ? '#0f172a' : '#f1f5f9' }];
  const tabBarStyle = [styles.tabBar, { 
    backgroundColor: isDark ? '#0b0f19' : '#ffffff',
    borderTopColor: isDark ? '#1e293b' : '#e2e8f0'
  }];
  const tabItemActiveStyle = [styles.tabItem, activeTab === 'dashboard' && styles.tabItemActive, {
    backgroundColor: isDark ? (activeTab === 'dashboard' ? 'rgba(255, 255, 255, 0.02)' : 'transparent') : (activeTab === 'dashboard' ? 'rgba(0, 0, 0, 0.02)' : 'transparent')
  }];
  const tabItemActiveStyleMap = [styles.tabItem, activeTab === 'map' && styles.tabItemActive, {
    backgroundColor: isDark ? (activeTab === 'map' ? 'rgba(255, 255, 255, 0.02)' : 'transparent') : (activeTab === 'map' ? 'rgba(0, 0, 0, 0.02)' : 'transparent')
  }];
  const tabItemActiveStyleDir = [styles.tabItem, activeTab === 'directory' && styles.tabItemActive, {
    backgroundColor: isDark ? (activeTab === 'directory' ? 'rgba(255, 255, 255, 0.02)' : 'transparent') : (activeTab === 'directory' ? 'rgba(0, 0, 0, 0.02)' : 'transparent')
  }];
  const tabItemActiveStyleTrends = [styles.tabItem, activeTab === 'trends' && styles.tabItemActive, {
    backgroundColor: isDark ? (activeTab === 'trends' ? 'rgba(255, 255, 255, 0.02)' : 'transparent') : (activeTab === 'trends' ? 'rgba(0, 0, 0, 0.02)' : 'transparent')
  }];
  const tabItemActiveStyleTelemetry = [styles.tabItem, activeTab === 'telemetry' && styles.tabItemActive, {
    backgroundColor: isDark ? (activeTab === 'telemetry' ? 'rgba(255, 255, 255, 0.02)' : 'transparent') : (activeTab === 'telemetry' ? 'rgba(0, 0, 0, 0.02)' : 'transparent')
  }];

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={containerStyle}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? "#0f172a" : "#f1f5f9"} />
        <LoginScreen 
          onLoginSuccess={(user) => {
            setIsLoggedIn(true);
            setUsername(user);
          }} 
          theme={theme} 
          serverUrl={serverUrl}
          onSaveServerUrl={handleSaveServerUrl}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={containerStyle}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? "#0f172a" : "#f1f5f9"} />
      
      {/* Active Screen Render */}
      <View style={styles.screenContainer}>
        {renderScreen()}
      </View>

      {/* Premium Bottom Tab Navigation Bar with Station Map Restored */}
      <View style={tabBarStyle}>
        <TouchableOpacity 
          style={tabItemActiveStyle}
          onPress={() => setActiveTab('dashboard')}
        >
          <Text style={styles.tabIcon}>📊</Text>
          <Text style={[styles.tabLabel, activeTab === 'dashboard' && styles.tabLabelActive, { color: activeTab === 'dashboard' ? '#38bdf8' : (isDark ? '#64748b' : '#64748b') }]}>Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={tabItemActiveStyleMap}
          onPress={() => setActiveTab('map')}
        >
          <Text style={styles.tabIcon}>🗺️</Text>
          <Text style={[styles.tabLabel, activeTab === 'map' && styles.tabLabelActive, { color: activeTab === 'map' ? '#38bdf8' : (isDark ? '#64748b' : '#64748b') }]}>Station Map</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={tabItemActiveStyleDir}
          onPress={() => setActiveTab('directory')}
        >
          <Text style={styles.tabIcon}>📁</Text>
          <Text style={[styles.tabLabel, activeTab === 'directory' && styles.tabLabelActive, { color: activeTab === 'directory' ? '#38bdf8' : (isDark ? '#64748b' : '#64748b') }]}>Directory</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={tabItemActiveStyleTrends}
          onPress={() => setActiveTab('trends')}
        >
          <Text style={styles.tabIcon}>📈</Text>
          <Text style={[styles.tabLabel, activeTab === 'trends' && styles.tabLabelActive, { color: activeTab === 'trends' ? '#38bdf8' : (isDark ? '#64748b' : '#64748b') }]}>Trends</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={tabItemActiveStyleTelemetry}
          onPress={() => setActiveTab('telemetry')}
        >
          <Text style={styles.tabIcon}>🔌</Text>
          <Text style={[styles.tabLabel, activeTab === 'telemetry' && styles.tabLabelActive, { color: activeTab === 'telemetry' ? '#38bdf8' : (isDark ? '#64748b' : '#64748b') }]}>Telemetry</Text>
        </TouchableOpacity>
      </View>

      {/* Groundwater News Overlay Modal */}
      {showNewsModal && (
        <Modal
          visible={showNewsModal}
          animationType="slide"
          onRequestClose={() => setShowNewsModal(false)}
        >
          <NewsScreen 
            onClose={() => setShowNewsModal(false)} 
            theme={theme} 
            toggleTheme={toggleTheme} 
          />
        </Modal>
      )}

      {/* Well History Trend Modal (Opened from Map Station Popup Drawer) */}
      {selectedTrendWell !== null && (
        <Modal
          visible={selectedTrendWell !== null}
          animationType="slide"
          onRequestClose={() => setSelectedTrendWell(null)}
        >
          <TrendChart 
            wellsData={mappedWellsData}
            wttoData={wttoData}
            preselectedWell={selectedTrendWell}
            onClose={() => setSelectedTrendWell(null)}
            theme={theme}
            toggleTheme={toggleTheme}
          />
        </Modal>
      )}

      {/* Standard Field Book Import Overlay Modal */}
      {showFieldBookModal && (
        <Modal
          visible={showFieldBookModal}
          animationType="slide"
          onRequestClose={() => setShowFieldBookModal(false)}
        >
          <FieldBookScreen
            onClose={() => setShowFieldBookModal(false)}
            onImportData={handleFieldBookImportSuccess}
            theme={theme}
          />
        </Modal>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppMain />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 92 : 72,
    backgroundColor: '#0b0f19',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
    paddingHorizontal: 8,
    paddingTop: 6,
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 18,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 16,
  },
  tabItemActive: {},
  tabIcon: {
    fontSize: 19,
    marginBottom: 3,
  },
  tabLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
    letterSpacing: 0.15,
  },
  tabLabelActive: {
    color: '#38bdf8',
  },
});
