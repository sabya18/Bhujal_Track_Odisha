import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  TouchableWithoutFeedback,
  TextInput, 
  ActivityIndicator, 
  Alert, 
  Image,
  Platform,
  Modal,
  Animated
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as XLSX from 'xlsx';
import { exportToExcelClientSide, exportForGrasp, exportToWTTOExcel, exportNotMonitoredReport } from '../utils/excelExporter';
import { importExcelDataClientSide, importGoogleSheetData, inferSeasonNameFromDate, importExcelDataDirectly } from '../utils/excelImporter';
import { getCustomTemplate, saveCustomTemplate } from '../utils/storage';
import DistrictMonitoringMap from '../components/DistrictMonitoringMap';
import gwraHistoricalData from '../data/gwra_historical.json';

const districtSheetsMap = {
  'Kendrapara': ['KDP_BLOCK', 'Kendrapara_Blocks'],
  'Kendrapara Urban': ['KENDRAPADA_URBAN', 'Kendrapara_urban'],
  'Cuttack': ['Cuttack_Blocks'],
  'Cuttack Urban': ['Cuttack_Urban'],
  'Jajpur': ['Jajpur_Blocks'],
  'Jajpur Urban': ['Jajpur_Urban'],
  'Jagatsinghpur': ['Jspur_Blocks']
};

const blockMapping = {
  'ATHAGARH': 'ATHAGAD',
  'BARAMBA': 'BADAMBA',
  'BARANGA': 'BARANG',
  'CUTTACK': 'CUTTACKSADAR',
  'DAMPARA': 'BANKIDAMPARA',
  'BANKIDAMPADA': 'BANKIDAMPARA',
  'NARSINGHPUR': 'NARASINGHPUR',
  'TANGICHOWDWAR': 'TANGICHOUDWAR',
  'ERASAMA': 'ERSAMA',
  'KUJANG': 'KUJANGA',
  'BINJHARAPUR': 'BINJHARPUR',
  'DASARTHPUR': 'DASARATHPUR',
  'DERBISH': 'DERABISH',
  'MAHAKALAPADA': 'MAHAKALPADA',
  'MARSAGHAI': 'MARSHAGHAI'
};

const detectCurrentSeason = (dateObj) => {
  const d = dateObj || new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-based
  const day = d.getDate();
  const val = month * 100 + day; // e.g. Feb 15 -> 215

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
    // Fallbacks for the gaps in between to partition the year continuously
    if (val > 110 && val < 201) return `Season-Winter -${year}`;
    if (val > 315 && val < 420) return `Season- Pre-Monsson-${year}`;
    if (val > 610 && val < 801) return `Mid-Monsoon-${year}`;
    return `Post-Monsson-${year}`;
  }
};

const formatSeasonDisplayName = (seasonStr) => {
  if (!seasonStr) return '';
  const lower = seasonStr.toLowerCase();
  let season = 'Winter';
  if (lower.includes('pre')) season = 'Pre-Monsoon';
  else if (lower.includes('mid') || (lower.includes('monsoon') && !lower.includes('post'))) season = 'Mid-Monsoon';
  else if (lower.includes('post')) season = 'Post-Monsoon';
  
  const match = seasonStr.match(/\d{4}/);
  const year = match ? match[0] : '';
  return `${season} ${year}`;
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

const checkDateInSeasonRange = (dateStr, targetSeasonStr) => {
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

const detectImportedSeason = (wells) => {
  const counts = {
    'Winter': 0,
    'Pre-Monsoon': 0,
    'Mid-Monsoon': 0,
    'Post-Monsoon': 0
  };
  let validDates = 0;
  
  const inferLocalSeason = (dateStr) => {
    if (!dateStr) return 'Winter';
    let month = 1, day = 1;
    if (dateStr.includes('.')) {
      const parts = dateStr.split('.');
      if (parts.length === 3) {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
      }
    } else if (dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          month = parseInt(parts[1], 10);
          day = parseInt(parts[2], 10);
        } else {
          day = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
        }
      }
    }
    if (isNaN(month) || isNaN(day)) return 'Winter';
    
    if ((month === 2 && day >= 1) || (month === 3 && day <= 31)) return 'Winter';
    if ((month === 5 && day >= 1) || (month === 6 && day <= 30)) return 'Pre-Monsoon';
    if ((month === 8 && day >= 1) || (month === 9 && day <= 30)) return 'Mid-Monsoon';
    if ((month === 11 && day >= 1) || (month === 12 && day <= 31)) return 'Post-Monsoon';
    
    if (month === 1) return 'Winter';
    if (month === 4) return 'Pre-Monsoon';
    if (month === 7) return 'Mid-Monsoon';
    return 'Post-Monsoon';
  };

  wells.forEach(w => {
    if (w.date) {
      const s = inferLocalSeason(w.date);
      if (counts[s] !== undefined) {
        counts[s]++;
        validDates++;
      }
    }
  });
  
  if (validDates === 0) {
    return 'Pre-Monsoon';
  }
  
  let maxSeason = 'Winter';
  let maxCount = -1;
  Object.keys(counts).forEach(s => {
    if (counts[s] > maxCount) {
      maxCount = counts[s];
      maxSeason = s;
    }
  });
  return maxSeason;
};

const detectImportedYear = (wells) => {
  const counts = {};
  let validYears = 0;
  wells.forEach(w => {
    if (w.date) {
      const parts = w.date.split('.');
      if (parts.length === 3) {
        const y = parseInt(parts[2], 10);
        if (!isNaN(y)) {
          counts[y] = (counts[y] || 0) + 1;
          validYears++;
        }
      } else {
        const hyphenParts = w.date.split('-');
        if (hyphenParts.length === 3) {
          const y = hyphenParts[0].length === 4 ? parseInt(hyphenParts[0], 10) : parseInt(hyphenParts[2], 10);
          if (!isNaN(y)) {
            counts[y] = (counts[y] || 0) + 1;
            validYears++;
          }
        }
      }
    }
  });
  
  if (validYears === 0) return new Date().getFullYear();
  
  let maxYear = new Date().getFullYear();
  let maxCount = -1;
  Object.keys(counts).forEach(y => {
    if (counts[y] > maxCount) {
      maxCount = counts[y];
      maxYear = parseInt(y, 10);
    }
  });
  return maxYear;
};

const wttoImportDistrictsList = [
  'All Districts',
  'Cuttack',
  'Cuttack Urban',
  'Kendrapara',
  'Kendrapara Urban',
  'Jajpur',
  'Jajpur Urban',
  'Angul',
  'Balangir',
  'Balasore',
  'Bargarh',
  'Bhadrak',
  'Boudh',
  'Deogarh',
  'Dhenkanal',
  'Gajapati',
  'Ganjam',
  'Jagatsinghpur',
  'Jharsuguda',
  'Kalahandi',
  'Kandhamal',
  'Keonjhar',
  'Khordha',
  'Koraput',
  'Malkangiri',
  'Mayurbhanj',
  'Nabarangpur',
  'Nayagarh',
  'Nuapada',
  'Puri',
  'Rayagada',
  'Sambalpur',
  'Subarnapur',
  'Sundargarh'
];

const DashboardBackgroundTexture = ({ theme }) => {
  const isDark = theme === 'dark';
  const lineColor = isDark ? 'rgba(56, 189, 248, 0.04)' : 'rgba(2, 132, 199, 0.03)';
  
  const hLines = Array.from({ length: 45 });
  const vLines = Array.from({ length: 10 });

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      {/* Ambient Aurora Glow Blobs */}
      <View
        style={{
          position: 'absolute',
          top: -80,
          right: -80,
          width: 320,
          height: 320,
          borderRadius: 160,
          backgroundColor: isDark ? '#0284c7' : '#bae6fd',
          opacity: isDark ? 0.07 : 0.15,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 600,
          left: -120,
          width: 360,
          height: 360,
          borderRadius: 180,
          backgroundColor: isDark ? '#6366f1' : '#e0e7ff',
          opacity: isDark ? 0.05 : 0.12,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 1300,
          right: -100,
          width: 380,
          height: 380,
          borderRadius: 190,
          backgroundColor: isDark ? '#0ea5e9' : '#e0f2fe',
          opacity: isDark ? 0.06 : 0.14,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 2000,
          left: -80,
          width: 340,
          height: 340,
          borderRadius: 170,
          backgroundColor: isDark ? '#10b981' : '#d1fae5',
          opacity: isDark ? 0.05 : 0.1,
        }}
      />

      {/* Blueprint Grid Lines */}
      {hLines.map((_, i) => (
        <View
          key={`h-${i}`}
          style={{
            position: 'absolute',
            top: i * 75,
            left: 0,
            right: 0,
            height: 0.8,
            backgroundColor: lineColor,
          }}
        />
      ))}
      {vLines.map((_, i) => (
        <View
          key={`v-${i}`}
          style={{
            position: 'absolute',
            left: i * 55,
            top: 0,
            bottom: 0,
            width: 0.8,
            backgroundColor: lineColor,
          }}
        />
      ))}
    </View>
  );
};

const SeasonAnimation = ({ seasonText, shiverAnim }) => {
  const lower = (seasonText || '').toLowerCase();
  const isWinter = lower.includes('winter');
  const isPreMonsoon = lower.includes('pre');
  const isMidMonsoon = lower.includes('mid') || (lower.includes('monsoon') && !lower.includes('pre') && !lower.includes('post'));
  const isPostMonsoon = lower.includes('post');

  // Particle positions & drifts
  const particleAnims = useRef(Array(6).fill(0).map(() => new Animated.Value(0))).current;
  const particleDrifts = useRef(Array(6).fill(0).map(() => new Animated.Value(0))).current;
  
  const flashAnim = useRef(new Animated.Value(0)).current;
  const sunRotation = useRef(new Animated.Value(0)).current;
  const windAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Reset all anim values
    shiverAnim.setValue(0);
    flashAnim.setValue(0);
    sunRotation.setValue(0);
    windAnim.setValue(0);
    particleAnims.forEach(anim => anim.setValue(0));
    particleDrifts.forEach(anim => anim.setValue(0));

    const activeAnimations = [];

    if (isWinter) {
      // 1. Shivering horizontal shake loop
      const shiverLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(shiverAnim, { toValue: -1.8, duration: 40, useNativeDriver: true }),
          Animated.timing(shiverAnim, { toValue: 1.8, duration: 40, useNativeDriver: true }),
          Animated.timing(shiverAnim, { toValue: -1.8, duration: 40, useNativeDriver: true }),
          Animated.timing(shiverAnim, { toValue: 1.8, duration: 40, useNativeDriver: true }),
          Animated.timing(shiverAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
          Animated.delay(1200)
        ])
      );
      shiverLoop.start();
      activeAnimations.push(shiverLoop);

      // 2. Snowflakes drift down
      particleAnims.forEach((anim, index) => {
        const startDelay = index * 400;
        const duration = 2500 + Math.random() * 2000;
        
        const runSnow = () => {
          anim.setValue(0);
          particleDrifts[index].setValue(0);
          
          Animated.parallel([
            Animated.timing(anim, {
              toValue: 1,
              duration: duration,
              useNativeDriver: true
            }),
            Animated.sequence([
              Animated.timing(particleDrifts[index], { toValue: 12, duration: duration / 2, useNativeDriver: true }),
              Animated.timing(particleDrifts[index], { toValue: -12, duration: duration / 2, useNativeDriver: true })
            ])
          ]).start((o) => {
            if (o.finished) runSnow();
          });
        };
        
        const t = setTimeout(runSnow, startDelay);
        activeAnimations.push({ stop: () => clearTimeout(t) });
      });
    }

    if (isPreMonsoon) {
      // Rotating Sun Loop
      const sunLoop = Animated.loop(
        Animated.timing(sunRotation, {
          toValue: 1,
          duration: 12000,
          useNativeDriver: true
        })
      );
      sunLoop.start();
      activeAnimations.push(sunLoop);

      // Rising warm sparkles
      particleAnims.forEach((anim, index) => {
        const startDelay = index * 300;
        const duration = 1800 + Math.random() * 1200;
        
        const runSpark = () => {
          anim.setValue(0);
          particleDrifts[index].setValue(0);
          
          Animated.parallel([
            Animated.timing(anim, {
              toValue: 1,
              duration: duration,
              useNativeDriver: true
            }),
            Animated.timing(particleDrifts[index], {
              toValue: (Math.random() - 0.5) * 40,
              duration: duration,
              useNativeDriver: true
            })
          ]).start((o) => {
            if (o.finished) runSpark();
          });
        };
        
        const t = setTimeout(runSpark, startDelay);
        activeAnimations.push({ stop: () => clearTimeout(t) });
      });
    }

    if (isMidMonsoon) {
      // Random thunderbolt flashes
      let flashTimeout;
      const runFlash = () => {
        flashAnim.setValue(0);
        Animated.sequence([
          Animated.timing(flashAnim, { toValue: 0.7, duration: 40, useNativeDriver: true }),
          Animated.timing(flashAnim, { toValue: 0.1, duration: 30, useNativeDriver: true }),
          Animated.timing(flashAnim, { toValue: 0.8, duration: 50, useNativeDriver: true }),
          Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true })
        ]).start(() => {
          const nextInterval = 3000 + Math.random() * 5000;
          flashTimeout = setTimeout(runFlash, nextInterval);
        });
      };
      flashTimeout = setTimeout(runFlash, 2500);
      activeAnimations.push({ stop: () => clearTimeout(flashTimeout) });

      // Rain drops falling
      particleAnims.forEach((anim, index) => {
        const startDelay = index * 180;
        const duration = 900 + Math.random() * 600;
        
        const runRain = () => {
          anim.setValue(0);
          Animated.timing(anim, {
            toValue: 1,
            duration: duration,
            useNativeDriver: true
          }).start((o) => {
            if (o.finished) runRain();
          });
        };
        
        const t = setTimeout(runRain, startDelay);
        activeAnimations.push({ stop: () => clearTimeout(t) });
      });
    }

    if (isPostMonsoon) {
      // Drift leaves horizontally
      particleAnims.forEach((anim, index) => {
        const startDelay = index * 400;
        const duration = 3500 + Math.random() * 2000;
        
        const runLeaf = () => {
          anim.setValue(0);
          particleDrifts[index].setValue(0);
          
          Animated.parallel([
            Animated.timing(anim, {
              toValue: 1,
              duration: duration,
              useNativeDriver: true
            }),
            Animated.timing(particleDrifts[index], {
              toValue: 40 + Math.random() * 60,
              duration: duration,
              useNativeDriver: true
            })
          ]).start((o) => {
            if (o.finished) runLeaf();
          });
        };
        
        const t = setTimeout(runLeaf, startDelay);
        activeAnimations.push({ stop: () => clearTimeout(t) });
      });
    }

    return () => {
      activeAnimations.forEach(a => a.stop());
    };
  }, [isWinter, isPreMonsoon, isMidMonsoon, isPostMonsoon]);

  const sunSpin = sunRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '365deg']
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      {isMidMonsoon && (
        <Animated.View 
          style={[
            StyleSheet.absoluteFill, 
            { backgroundColor: 'rgba(255, 255, 255, 0.45)', opacity: flashAnim, zIndex: 1 }
          ]} 
        />
      )}

      {isWinter && particleAnims.map((anim, idx) => {
        const left = 10 + idx * 16 + Math.random() * 4;
        const translateY = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [-15, 75]
        });
        const opacity = anim.interpolate({
          inputRange: [0, 0.15, 0.85, 1],
          outputRange: [0, 0.85, 0.85, 0]
        });
        return (
          <Animated.Text
            key={idx}
            style={{
              position: 'absolute',
              top: 0,
              left: `${left}%`,
              fontSize: 14,
              opacity: opacity,
              transform: [
                { translateY },
                { translateX: particleDrifts[idx] }
              ],
              color: '#ffffff'
            }}
          >
            ❄️
          </Animated.Text>
        );
      })}

      {isPreMonsoon && (
        <>
          <Animated.Text
            style={{
              position: 'absolute',
              right: 18,
              top: 8,
              fontSize: 34,
              transform: [{ rotate: sunSpin }],
              zIndex: 2,
              textShadowColor: 'rgba(251, 191, 36, 0.5)',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 8
            }}
          >
            ☀️
          </Animated.Text>
          {particleAnims.map((anim, idx) => {
            const left = 15 + idx * 13;
            const translateY = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [55, -15]
            });
            const opacity = anim.interpolate({
              inputRange: [0, 0.15, 0.85, 1],
              outputRange: [0, 0.65, 0.65, 0]
            });
            return (
              <Animated.Text
                key={idx}
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: `${left}%`,
                  fontSize: 11,
                  opacity: opacity,
                  transform: [
                    { translateY },
                    { translateX: particleDrifts[idx] }
                  ]
                }}
              >
                {idx % 2 === 0 ? '✨' : '🔥'}
              </Animated.Text>
            );
          })}
        </>
      )}

      {isMidMonsoon && (
        <>
          <View style={{ position: 'absolute', right: 18, top: 4, flexDirection: 'row', gap: -6 }}>
            <Text style={{ fontSize: 24 }}>☁️</Text>
            <Text style={{ fontSize: 20, marginTop: 4 }}>🌧️</Text>
          </View>
          {particleAnims.map((anim, idx) => {
            const left = 12 + idx * 15;
            const translateY = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [-15, 75]
            });
            const opacity = anim.interpolate({
              inputRange: [0, 0.15, 0.85, 1],
              outputRange: [0, 0.6, 0.6, 0]
            });
            return (
              <Animated.Text
                key={idx}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: `${left}%`,
                  fontSize: 12,
                  opacity: opacity,
                  transform: [
                    { translateY },
                    { skewX: '-12deg' }
                  ]
                }}
              >
                💧
              </Animated.Text>
            );
          })}
        </>
      )}

      {isPostMonsoon && (
        <>
          <View style={{ position: 'absolute', right: 20, top: 10 }}>
            <Text style={{ fontSize: 24 }}>🌤️</Text>
          </View>
          {particleAnims.map((anim, idx) => {
            const top = 10 + idx * 8;
            const translateX = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [-20, 220]
            });
            const opacity = anim.interpolate({
              inputRange: [0, 0.15, 0.85, 1],
              outputRange: [0, 0.8, 0.8, 0]
            });
            const rotate = anim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '360deg']
            });
            return (
              <Animated.Text
                key={idx}
                style={{
                  position: 'absolute',
                  top: top,
                  left: 10,
                  fontSize: 13,
                  opacity: opacity,
                  transform: [
                    { translateX },
                    { translateY: particleDrifts[idx] },
                    { rotate }
                  ]
                }}
              >
                {idx % 2 === 0 ? '🍃' : '🍁'}
              </Animated.Text>
            );
          })}
        </>
      )}
    </View>
  );
};

export default function Dashboard({ 
  wellsData, 
  wttoData = [],
  loading, 
  onResetDB, 
  onSaveWell, 
  onImportDB,
  onImportWTTO,
  onImportAppSheet,
  visitsHistory,
  preloadWell, 
  clearPreloadWell,
  theme,
  toggleTheme,
  onOpenNews,
  onOpenFieldBook,
  selectedSeason,
  setSelectedSeason,
  selectedYear,
  setSelectedYear,
  onLogout,
  onSyncWithServer,
  serverUrl,
  onSaveServerUrl
}) {
  const styles = getStyles(theme);
  const isDark = theme === 'dark';
  const shiverAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  const availableYears = useMemo(() => {
    const yearsSet = new Set();
    
    // 1. Scan active dates
    wellsData.forEach(w => {
      if (w.date) {
        let year = null;
        if (w.date.includes('.')) {
          const parts = w.date.split('.');
          if (parts.length === 3) year = parseInt(parts[2], 10);
        } else if (w.date.includes('-')) {
          const parts = w.date.split('-');
          if (parts.length === 3) {
            year = parseInt(parts[0].length === 4 ? parts[0] : parts[2], 10);
          }
        }
        if (year && !isNaN(year) && year >= 2000 && year <= 2100) {
          yearsSet.add(year);
        }
      }
      
      // 2. Scan historical records
      if (w.history) {
        Object.keys(w.history).forEach(key => {
          const yearMatch = key.match(/^\d{4}/);
          if (yearMatch) {
            const yr = parseInt(yearMatch[0], 10);
            if (yr >= 2000 && yr <= 2100) {
              yearsSet.add(yr);
            }
          }
        });
      }
    });
    
    // Convert to sorted array descending
    const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
    
    // Fallback if empty
    if (sortedYears.length === 0) {
      const cy = new Date().getFullYear();
      return [cy - 1, cy].sort((a, b) => b - a);
    }
    
    // If only one year exists, add the adjacent year for selection option
    if (sortedYears.length === 1) {
      const singleYr = sortedYears[0];
      return [singleYr, singleYr - 1].sort((a, b) => b - a);
    }
    
    return sortedYears;
  }, [wellsData]);

  const getActiveSeason = () => {
    if (selectedSeason === 'Winter') return `Season-Winter -${selectedYear}`;
    if (selectedSeason === 'Pre-Monsoon') return `Season- Pre-Monsson-${selectedYear}`;
    if (selectedSeason === 'Mid-Monsoon') return `Mid-Monsoon-${selectedYear}`;
    if (selectedSeason === 'Post-Monsoon') return `Post-Monsson-${selectedYear}`;
    return `Season-Winter -${selectedYear}`;
  };

  // Pulsating text animation loop for active season card label
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.15,
          duration: 1200,
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const getCardColors = (pct, isInverted = false) => {
    let score = isInverted ? (100 - pct) : pct;
    
    if (isDark) {
      if (score >= 90) {
        return {
          bg: 'rgba(16, 185, 129, 0.15)',
          border: 'rgba(16, 185, 129, 0.4)',
          text: '#34d399',
          secondaryText: 'rgba(52, 211, 153, 0.8)'
        };
      } else if (score >= 70) {
        return {
          bg: 'rgba(56, 189, 248, 0.15)',
          border: 'rgba(56, 189, 248, 0.4)',
          text: '#38bdf8',
          secondaryText: 'rgba(56, 189, 248, 0.8)'
        };
      } else if (score >= 40) {
        return {
          bg: 'rgba(245, 158, 11, 0.15)',
          border: 'rgba(245, 158, 11, 0.4)',
          text: '#fbbf24',
          secondaryText: 'rgba(251, 191, 36, 0.8)'
        };
      } else {
        return {
          bg: 'rgba(239, 68, 68, 0.15)',
          border: 'rgba(239, 68, 68, 0.4)',
          text: '#f87171',
          secondaryText: 'rgba(248, 113, 113, 0.8)'
        };
      }
    } else {
      if (score >= 90) {
        return {
          bg: '#dcfce7',
          border: '#86efac',
          text: '#15803d',
          secondaryText: '#166534'
        };
      } else if (score >= 70) {
        return {
          bg: '#e0f2fe',
          border: '#bae6fd',
          text: '#0369a1',
          secondaryText: '#075985'
        };
      } else if (score >= 40) {
        return {
          bg: '#fef3c7',
          border: '#fde047',
          text: '#b45309',
          secondaryText: '#92400e'
        };
      } else {
        return {
          bg: '#fee2e2',
          border: '#fca5a5',
          text: '#b91c1c',
          secondaryText: '#991b1b'
        };
      }
    }
  };
  
  // Selection State
  const [selectedDivision, setSelectedDivision] = useState(null);
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');
  const [selectedBlock, setSelectedBlock] = useState('ALL');
  const [selectedWellId, setSelectedWellId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewSite, setIsNewSite] = useState(false);
  const [recentStations, setRecentStations] = useState([]);

  // GWRA dedicated viewer section state
  const [gwraViewDistrict, setGwraViewDistrict] = useState('ANGUL');
  const [gwraViewBlock, setGwraViewBlock] = useState('ANUGUL');

  const gwraDistricts = useMemo(() => {
    const set = new Set();
    Object.values(gwraHistoricalData).forEach(item => {
      if (item.district) set.add(item.district);
    });
    return Array.from(set).sort();
  }, []);

  const gwraBlocksForDistrict = useMemo(() => {
    if (!gwraViewDistrict) return [];
    return Object.values(gwraHistoricalData)
      .filter(item => item.district === gwraViewDistrict)
      .map(item => item.block)
      .sort();
  }, [gwraViewDistrict]);

  useEffect(() => {
    if (gwraBlocksForDistrict.length > 0) {
      const exists = gwraBlocksForDistrict.includes(gwraViewBlock);
      if (!exists) {
        setGwraViewBlock(gwraBlocksForDistrict[0]);
      }
    }
  }, [gwraBlocksForDistrict]);

  // Menu and Export States
  const [showMenu, setShowMenu] = useState(false);
  const [showExportFormatModal, setShowExportFormatModal] = useState(false);
  const [showFieldBookExportModal, setShowFieldBookExportModal] = useState(false);
  const [showSeasonSelector, setShowSeasonSelector] = useState(false);
  const [selectedExportDist, setSelectedExportDist] = useState(null);
  const [selectedExportOption, setSelectedExportOption] = useState('all'); // 'all', 'blocks', 'urban'
  const [wttoExportDistricts, setWttoExportDistricts] = useState([]);
  const [showGraspModal, setShowGraspModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedImportDivision, setSelectedImportDivision] = useState(null);
  const [selectedImportDistrict, setSelectedImportDistrict] = useState(null);
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [importTab, setImportTab] = useState('file'); // 'file' or 'sheets'
  const [importMode, setImportMode] = useState('data'); // 'data' or 'wtto'

  
  // Form State
  const [wellNumber, setWellNumber] = useState('');
  const [slNo, setSlNo] = useState('');
  const [location, setLocation] = useState('');
  const [wellType, setWellType] = useState('DW'); // DW, BW, TW
  const [depth, setDepth] = useState('');
  const [parapet, setParapet] = useState('0.00');
  const [date, setDate] = useState('');
  const [bmp, setBmp] = useState('');
  const [mbgl, setMbgl] = useState('');
  const [msl, setMsl] = useState('');
  const [rl, setRl] = useState(''); // Reduced Level (calculated)
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [remarks, setRemarks] = useState('');
  const [comment, setComment] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [season, setSeason] = useState('Winter'); // Winter, Pre-Monsoon, Mid-Monsoon, Post-Monsoon

  // GPS User Location (for Distance Finder)
  const [userCoords, setUserCoords] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [altimeterLoading, setAltimeterLoading] = useState(false);

  // MSL batch fetching state
  const [mslFetching, setMslFetching] = useState(false);
  const [mslFetchProgress, setMslFetchProgress] = useState('');

  // Calendar Picker State
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateObject, setDateObject] = useState(new Date());

  // UI state
  const [showStats, setShowStats] = useState(true);

  // Constants
  const seasons = ['Winter', 'Pre-Monsoon', 'Mid-Monsoon', 'Post-Monsoon'];

  // Helper district detector (dynamic parsing)
  const getDistrictFromSheet = (sheet) => {
    if (!sheet) return 'Other';
    const s = sheet.toLowerCase().trim()
                  .replace(/_blocks/g, '')
                  .replace(/_urban/g, '')
                  .replace(/\s+/g, ' ');
    if (s.includes('kendrapara') || s.includes('kdp')) {
      return (sheet.toLowerCase().includes('urban') || s.includes('urban')) ? 'Kendrapara Urban' : 'Kendrapara';
    }
    if (s.includes('cuttack')) {
      return (sheet.toLowerCase().includes('urban') || s.includes('urban')) ? 'Cuttack Urban' : 'Cuttack';
    }
    if (s.includes('jajpur')) {
      return (sheet.toLowerCase().includes('urban') || s.includes('urban')) ? 'Jajpur Urban' : 'Jajpur';
    }
    if (s.includes('jspur') || s.includes('jagatsinghpur') || s.includes('jagatsinghapur')) {
      return 'Jagatsinghpur';
    }
    if (s === 'bolangir' || s === 'balangir') {
      return 'Balangir';
    }
    if (s === 'bhubaneswar' || s === 'khurda' || s === 'khordha') {
      return 'Khordha';
    }
    if (s === 'nawarangapur' || s === 'nabarangapur' || s === 'nabarangpur') {
      return 'Nabarangpur';
    }
    if (s === 'debagarh' || s === 'deogarh') {
      return 'Deogarh';
    }
    if (s === 'baleshwar' || s === 'balasore') {
      return 'Balasore';
    }
    if (s === 'kendujhar' || s === 'keonjhar') {
      return 'Keonjhar';
    }
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
 
  const getDivisionForDistrict = (district) => {
    const d = (district || '').toLowerCase().trim();
    if (d === 'all districts') return 'ALL DIVISIONS';
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

  const gwdDivisions = [
    'CUTTACK DIVISION',
    'SAMBALPUR DIVISION',
    'BERHAMPUR DIVISION',
    'BALASORE DIVISION',
    'BOLANGIR DIVISION',
    'KORAPUT DIVISION',
    'BHAWANIPATNA DIVISION',
    'ANGUL DIVISION',
    'RS DIVISION',
    'AD HP DIVISION'
  ];

  const odishaDistricts = [
    'Angul',
    'Balangir',
    'Balasore',
    'Bargarh',
    'Bhadrak',
    'Boudh',
    'Cuttack',
    'Deogarh',
    'Dhenkanal',
    'Gajapati',
    'Ganjam',
    'Jagatsinghpur',
    'Jajpur',
    'Jharsuguda',
    'Kalahandi',
    'Kandhamal',
    'Kendrapara',
    'Keonjhar',
    'Khordha',
    'Koraput',
    'Malkangiri',
    'Mayurbhanj',
    'Nabarangpur',
    'Nayagarh',
    'Nuapada',
    'Puri',
    'Rayagada',
    'Sambalpur',
    'Subarnapur',
    'Sundargarh'
  ];

  const divisionMeta = useMemo(() => {
    const meta = {};
    gwdDivisions.forEach(div => {
      meta[div] = { districts: new Set(), totalStations: 0 };
    });

    wellsData.forEach(well => {
      const dist = getDistrictFromSheet(well.sheet);
      const div = getDivisionForDistrict(dist);
      if (meta[div]) {
        meta[div].districts.add(dist);
        meta[div].totalStations += 1;
      }
    });

    return meta;
  }, [wellsData]);

  const isActiveWell = (well) => {
    if (!well) return false;
    const rem = (well.remarks || '').toLowerCase();
    return !rem.includes('inactive') && !rem.includes('closed') && !rem.includes('cemented') && !rem.includes('dumped') && !rem.includes('abandoned') && !rem.includes('filled');
  };

  // Helper to parse dd.mm.yyyy string into Date object
  const parseDateString = (dateStr) => {
    if (!dateStr) return new Date();
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-based
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month, day);
      }
    }
    return new Date();
  };

  // Haversine formula to compute distance in meters
  const getDistanceInMeters = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371000; // Radius of Earth in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Load Recent Stations on mount
  useEffect(() => {
    const loadRecentsList = async () => {
      try {
        const val = await AsyncStorage.getItem('gw_recent_stations');
        if (val) {
          setRecentStations(JSON.parse(val));
        }
      } catch (err) {
        console.warn(err);
      }
    };
    loadRecentsList();
  }, []);

  // Update Recent Stations list on successful save
  const updateRecentsList = async (well) => {
    try {
      let list = [...recentStations];
      // Filter out duplicate well number
      list = list.filter(item => item.well_number !== well.well_number);
      // Unshift new item
      list.unshift({
        well_number: well.well_number,
        location: well.location,
        block: well.block,
        sheet: well.sheet
      });
      // Cap list at 5 items
      list = list.slice(0, 5);
      setRecentStations(list);
      await AsyncStorage.setItem('gw_recent_stations', JSON.stringify(list));
    } catch (err) {
      console.warn(err);
    }
  };

  // Fetch device GPS for distance badge calculations
  const fetchUserLocationForDistance = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserCoords({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude
        });
      }
    } catch (e) {
      console.warn("Could not get position for distance badge:", e);
    }
  };

  // Compile stats
  const total = wellsData.length;
  const activeWells = wellsData.filter(isActiveWell);
  const active = activeWells.length;
  const currentSeasonStr = getActiveSeason();
  const monitored = activeWells.filter(w => {
    const hasDate = w.date !== null && w.date !== undefined && w.date !== '';
    const hasBmp = w.dtgwl_bmp !== null && w.dtgwl_bmp !== undefined && w.dtgwl_bmp !== '' && !isNaN(Number(w.dtgwl_bmp));
    return hasDate && hasBmp && checkDateInSeasonRange(w.date, currentSeasonStr);
  }).length;
  const pending = active - monitored;
  const percent = active > 0 ? Math.round((monitored / active) * 100) : 0;

  const districts = useMemo(() => {
    if (!selectedDivision || selectedDivision === 'ALL') return [];
    const set = new Set();
    wellsData.forEach(well => {
      const dist = getDistrictFromSheet(well.sheet);
      const div = getDivisionForDistrict(dist);
      if (div === selectedDivision) {
        set.add(dist);
      }
    });
    return Array.from(set).sort();
  }, [wellsData, selectedDivision]);

  const allLoadedDistricts = useMemo(() => {
    const set = new Set();
    wellsData.forEach(well => {
      const dist = getDistrictFromSheet(well.sheet);
      if (dist && dist !== 'Other') {
        set.add(dist);
      }
    });
    wttoData.forEach(well => {
      const dist = getDistrictFromSheet(well.sheet);
      if (dist && dist !== 'Other') {
        set.add(dist);
      }
    });
    return Array.from(set).sort();
  }, [wellsData, wttoData]);

  const districtStats = useMemo(() => {
    const stats = {};

    wellsData.forEach(well => {
      const dist = getDistrictFromSheet(well.sheet);
      if (!stats[dist]) {
        stats[dist] = { total: 0, active: 0, monitored: 0, sumMbgl: 0, countMbgl: 0 };
      }
      
      stats[dist].total += 1;
      const active = isActiveWell(well);
      if (active) {
        stats[dist].active += 1;
        const hasVisit = well.date !== null && well.date !== undefined && well.date !== '';
        const hasBmp = well.dtgwl_bmp !== null && well.dtgwl_bmp !== undefined && well.dtgwl_bmp !== '' && !isNaN(Number(well.dtgwl_bmp));
        const inSeason = hasVisit && checkDateInSeasonRange(well.date, currentSeasonStr);
        if (inSeason && hasBmp) {
          stats[dist].monitored += 1;
        }
        if (well.dtgwl_mbgl !== null && well.dtgwl_mbgl !== undefined && well.dtgwl_mbgl !== '') {
          const val = parseFloat(well.dtgwl_mbgl);
          if (!isNaN(val)) {
            stats[dist].sumMbgl += val;
            stats[dist].countMbgl += 1;
          }
        }
      }
    });

    const result = {};
    Object.keys(stats).forEach(dist => {
      const d = stats[dist];
      const avg = d.countMbgl > 0 ? (d.sumMbgl / d.countMbgl) : 0;
      
      let status = 'Moderate';
      let statusColor = '#f59e0b'; // orange/yellow
      let statusBg = 'rgba(245, 158, 11, 0.12)';
      
      if (d.countMbgl === 0) {
        status = 'No Data';
        statusColor = '#94a3b8';
        statusBg = 'rgba(148, 163, 184, 0.12)';
      } else if (avg < 3.5) {
        status = 'Abundant';
        statusColor = '#10b981'; // green
        statusBg = 'rgba(16, 185, 129, 0.12)';
      } else if (avg > 6.0) {
        status = 'Depleted';
        statusColor = '#ef4444'; // red
        statusBg = 'rgba(239, 68, 68, 0.12)';
      }

      result[dist] = {
        total: d.total,
        active: d.active,
        monitored: d.monitored,
        avgMbgl: avg.toFixed(2),
        countMbgl: d.countMbgl,
        status,
        statusColor,
        statusBg
      };
    });

    return result;
  }, [wellsData]);

  const blocks = useMemo(() => {
    if (selectedDistrict === 'ALL') return [];
    const set = new Set();
    wellsData.forEach(well => {
      const dist = getDistrictFromSheet(well.sheet);
      if (dist === selectedDistrict && well.block) {
        set.add(well.block);
      }
    });
    return Array.from(set).sort();
  }, [wellsData, selectedDistrict]);

  // List of filtered stations under selected block
  const filteredStations = useMemo(() => {
    if (selectedDistrict === 'ALL' || selectedBlock === 'ALL') return [];
    
    return wellsData.filter(well => {
      const dist = getDistrictFromSheet(well.sheet);
      if (dist !== selectedDistrict) return false;
      if (well.block !== selectedBlock) return false;
      
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const numMatch = (well.well_number || '').toLowerCase().includes(q);
        const locMatch = (well.location || '').toLowerCase().includes(q);
        return numMatch || locMatch;
      }
      return true;
    });
  }, [wellsData, selectedDistrict, selectedBlock, searchQuery]);

  // Calculated distance between phone and station coordinates
  const currentWellDistance = useMemo(() => {
    if (!userCoords || !latitude || !longitude) return null;
    const latWell = parseFloat(latitude);
    const lonWell = parseFloat(longitude);
    if (isNaN(latWell) || isNaN(lonWell)) return null;
    return getDistanceInMeters(userCoords.latitude, userCoords.longitude, latWell, lonWell);
  }, [userCoords, latitude, longitude]);

  // Listen to preload well redirect requests from Map/Directory
  useEffect(() => {
    if (preloadWell) {
      const dist = getDistrictFromSheet(preloadWell.sheet);
      const div = getDivisionForDistrict(dist);
      setSelectedDivision(div);
      setSelectedDistrict(dist);
      setSelectedBlock(preloadWell.block);
      setSelectedWellId(preloadWell.well_number);
      setIsNewSite(false);
      
      // Prefill fields
      setWellNumber(preloadWell.well_number || '');
      setSlNo(preloadWell.sl_no != null ? preloadWell.sl_no.toString() : '');
      setLocation(preloadWell.location || '');
      setWellType(preloadWell.well_type || 'DW');
      setDepth(preloadWell.depth != null ? preloadWell.depth.toString() : '');
      setParapet(preloadWell.parapet_height != null ? preloadWell.parapet_height.toString() : '0.00');
      setDate(preloadWell.date || new Date().toLocaleDateString('en-GB').replace(/\//g, '.'));
      setDateObject(parseDateString(preloadWell.date));
      setBmp(preloadWell.dtgwl_bmp != null ? preloadWell.dtgwl_bmp.toString() : '');
      setMbgl(preloadWell.dtgwl_mbgl != null ? preloadWell.dtgwl_mbgl.toString() : '');
      setMsl(preloadWell.msl != null ? preloadWell.msl.toString() : '');
      setRl(preloadWell.rl != null ? preloadWell.rl.toString() : '');
      setLatitude(preloadWell.lat != null ? preloadWell.lat.toString() : '');
      setLongitude(preloadWell.lon != null ? preloadWell.lon.toString() : '');
      setRemarks(preloadWell.remarks || '');
      setComment(preloadWell.comment || '');
      setPhotoUrl(preloadWell.photoUrl || '');
      setSeason(preloadWell.season || selectedSeason);
      
      // Auto collapse stats panel and request location
      setShowStats(false);
      fetchUserLocationForDistance();
      clearPreloadWell();
    }
  }, [preloadWell]);

  // Load well details on dropdown selection change
  useEffect(() => {
    if (selectedWellId && !isNewSite) {
      const well = wellsData.find(w => w.well_number === selectedWellId);
      if (well) {
        setWellNumber(well.well_number || '');
        setSlNo(well.sl_no != null ? well.sl_no.toString() : '');
        setLocation(well.location || '');
        setWellType(well.well_type || 'DW');
        setDepth(well.depth != null ? well.depth.toString() : '');
        setParapet(well.parapet_height != null ? well.parapet_height.toString() : '0.00');
        setDate(well.date || new Date().toLocaleDateString('en-GB').replace(/\//g, '.'));
        setDateObject(parseDateString(well.date));
        setBmp(well.dtgwl_bmp != null ? well.dtgwl_bmp.toString() : '');
        setMbgl(well.dtgwl_mbgl != null ? well.dtgwl_mbgl.toString() : '');
        setMsl(well.msl != null ? well.msl.toString() : '');
        setRl(well.rl != null ? well.rl.toString() : '');
        setLatitude(well.lat != null ? well.lat.toString() : '');
        setLongitude(well.lon != null ? well.lon.toString() : '');
        setRemarks(well.remarks || '');
        setComment(well.comment || '');
        setPhotoUrl(well.photoUrl || '');
        setSeason(well.season || selectedSeason);

        fetchUserLocationForDistance();

        // Auto fetch MSL on selection if it is missing
        if (well.lat != null && well.lon != null && (well.msl == null || isNaN(parseFloat(well.msl)))) {
          fetch(`https://elevation-api.open-meteo.com/v1/elevation?latitude=${well.lat}&longitude=${well.lon}`)
            .then(res => res.json())
            .then(data => {
              if (data && data.elevation && data.elevation.length > 0) {
                const elev = data.elevation[0];
                if (elev != null) {
                  const roundedElev = parseFloat(elev.toFixed(2));
                  setMsl(roundedElev.toString());
                  
                  // Calculate RL on the fly
                  const mbglVal = parseFloat(well.dtgwl_mbgl);
                  let calculatedRl = null;
                  if (!isNaN(mbglVal)) {
                    calculatedRl = parseFloat((roundedElev - mbglVal).toFixed(2));
                    setRl(calculatedRl.toString());
                  }

                  // Update well in database
                  const updatedWell = {
                    ...well,
                    msl: roundedElev,
                    rl: calculatedRl
                  };
                  onSaveWell(updatedWell);
                }
              }
            })
            .catch(err => {
              console.warn("Failed to auto-fetch MSL for selected well:", err);
            });
        }
      }
    }
  }, [selectedWellId, isNewSite]);

  // Load visit measurement values from visitsHistory when active editor season selection changes
  useEffect(() => {
    if (selectedWellId && !isNewSite && visitsHistory) {
      const well = wellsData.find(w => w.well_number === selectedWellId);
      if (well) {
        let seasonCode = 'Winter';
        if (season.includes('Pre')) seasonCode = 'PreMon';
        else if (season.includes('Mid')) seasonCode = 'MidMon';
        else if (season.includes('Post')) seasonCode = 'PostMon';
        
        const seasonKey = `${selectedYear}_${seasonCode}`;
        const histRecord = visitsHistory[well.well_number]?.[seasonKey];
        
        if (histRecord && histRecord.value !== null && histRecord.value !== undefined) {
          setDate(histRecord.date || '');
          setBmp(String((histRecord.value + (well.parapet_height || 0)).toFixed(2)));
          setMbgl(String(histRecord.value.toFixed(2)));
        } else {
          // Check well.date directly if it matches this season
          const targetSeasonStr = `${season} ${selectedYear}`;
          if (well.date && checkDateInSeasonRange(well.date, targetSeasonStr)) {
            setDate(well.date);
            setBmp(well.dtgwl_bmp != null ? well.dtgwl_bmp.toString() : '');
            setMbgl(well.dtgwl_mbgl != null ? well.dtgwl_mbgl.toString() : '');
          } else {
            // Default date fallback for new/empty entry
            let defaultDate = '15.02.' + selectedYear;
            if (season === 'Pre-Monsoon') defaultDate = '15.05.' + selectedYear;
            else if (season === 'Mid-Monsoon') defaultDate = '15.09.' + selectedYear;
            else if (season === 'Post-Monsoon') defaultDate = '15.11.' + selectedYear;
            
            setDate(defaultDate);
            setBmp('');
            setMbgl('');
          }
        }
      }
    }
  }, [season, selectedWellId, selectedYear, visitsHistory]);

  // Auto calculate MBGL level
  useEffect(() => {
    const b = parseFloat(bmp);
    const p = parseFloat(parapet);
    if (!isNaN(b) && !isNaN(p)) {
      setMbgl((b - p).toFixed(2));
    } else if (!isNaN(b)) {
      setMbgl(b.toFixed(2));
    } else {
      setMbgl('');
    }
  }, [bmp, parapet]);

  // Auto calculate Reduced Level (RL) of Water Table
  useEffect(() => {
    const m = parseFloat(msl);
    const d = parseFloat(mbgl);
    if (!isNaN(m) && !isNaN(d)) {
      setRl((m - d).toFixed(2));
    } else {
      setRl('');
    }
  }, [msl, mbgl]);

  // Handle Fetching GPS & MSL Offline
  const handleFetchGPS = async () => {
    try {
      setGpsLoading(true);
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'GPS location permissions are required to fetch coordinates.');
        setGpsLoading(false);
        return;
      }

      // 6-second timeout fallback to last known location
      const getPosPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 6000)
      );

      let locationObj;
      try {
        locationObj = await Promise.race([getPosPromise, timeoutPromise]);
      } catch (timeoutErr) {
        locationObj = await Location.getLastKnownPositionAsync();
        if (!locationObj) {
          throw new Error('GPS Timeout and no last known location available.');
        }
      }

      const latVal = locationObj.coords.latitude.toFixed(6);
      const lonVal = locationObj.coords.longitude.toFixed(6);
      const altVal = locationObj.coords.altitude ? locationObj.coords.altitude.toFixed(2) : "0.00";

      setLatitude(latVal);
      setLongitude(lonVal);
      setMsl(altVal);
      
      setUserCoords({
        latitude: locationObj.coords.latitude,
        longitude: locationObj.coords.longitude
      });

      Alert.alert('GPS Status', `Location fetched successfully:\nLatitude: ${latVal}\nLongitude: ${lonVal}\nMSL Altitude: ${altVal} m`);
    } catch (err) {
      console.error(err);
      Alert.alert('GPS Error', 'Failed to fetch GPS coordinates offline. Please verify Location services are turned on.');
    } finally {
      setGpsLoading(false);
    }
  };

  // Handle Fetching Altimeter (Altitude for MSL)
  const handleFetchAltimeter = async () => {
    try {
      setAltimeterLoading(true);
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'GPS location permissions are required to fetch elevation.');
        setAltimeterLoading(false);
        return;
      }

      // 6-second timeout fallback to last known location
      const getPosPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 6000)
      );

      let locationObj;
      try {
        locationObj = await Promise.race([getPosPromise, timeoutPromise]);
      } catch (timeoutErr) {
        locationObj = await Location.getLastKnownPositionAsync();
        if (!locationObj) {
          throw new Error('GPS Timeout and no last known location available.');
        }
      }

      const altVal = locationObj.coords.altitude ? locationObj.coords.altitude.toFixed(2) : "0.00";
      setMsl(altVal);
      Alert.alert('Altimeter Status', `Elevation fetched successfully: ${altVal} m`);
    } catch (err) {
      console.error(err);
      Alert.alert('Altimeter Error', 'Failed to fetch elevation offline. Please verify Location services are turned on.');
    } finally {
      setAltimeterLoading(false);
    }
  };

  // Camera & Image handling
  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permissions are required to capture images.');
        return;
      }

      let result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setPhotoUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Camera Error', 'Could not open camera.');
    }
  };

  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Gallery access permissions are required.');
        return;
      }

      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setPhotoUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Gallery Error', 'Could not open media library.');
    }
  };

  // Resolve Excel Sheet name from Selection
  const getSheetFromSelection = (dist, blk) => {
    const d = dist.toLowerCase();
    const b = (blk || '').toLowerCase();
    if (d.includes('kendrapara')) {
      return b.includes('urban') || b.includes('municipality') ? 'Kendrapara_urban' : 'Kendrapara_Blocks';
    }
    if (d.includes('cuttack')) {
      return b.includes('urban') || b.includes('municipality') ? 'Cuttack_Urban' : 'Cuttack_Blocks';
    }
    if (d.includes('jajpur')) {
      return b.includes('urban') || b.includes('municipality') ? 'Jajpur_Urban' : 'Jajpur_Blocks';
    }
    if (d.includes('jagatsinghpur') || d.includes('jspur')) {
      return 'Jspur_Blocks';
    }
    return 'Cuttack_Blocks'; // Fallback
  };

  // Submit and Save Station Form
  const handleSaveForm = () => {
    if (!wellNumber.trim()) {
      Alert.alert("Validation Error", "Please provide a Well Number ID.");
      return;
    }
    if (!location.trim()) {
      Alert.alert("Validation Error", "Please provide a Location name.");
      return;
    }

    const sheetName = isNewSite 
      ? getSheetFromSelection(selectedDistrict, selectedBlock)
      : (wellsData.find(w => w.well_number === selectedWellId)?.sheet || 'Cuttack_Blocks');
    
    const rowIdxVal = isNewSite
      ? Date.now() // Faked row index based on timestamp
      : (wellsData.find(w => w.well_number === selectedWellId)?.row_idx || 5);

    const wellObj = {
      sheet: sheetName,
      row_idx: rowIdxVal,
      sl_no: slNo || "New",
      block: selectedBlock,
      location: location.trim(),
      well_type: wellType,
      well_number: wellNumber.trim(),
      lat: latitude ? parseFloat(latitude) : null,
      lon: longitude ? parseFloat(longitude) : null,
      lat_raw: latitude,
      lon_raw: longitude,
      date: date || null,
      depth: depth ? depth.toString() : "",
      parapet_height: parseFloat(parapet) || 0.00,
      dtgwl_bmp: bmp ? parseFloat(bmp) : null,
      dtgwl_mbgl: mbgl ? parseFloat(mbgl) : null,
      msl: msl ? parseFloat(msl) : null,
      rl: rl ? parseFloat(rl) : null,
      remarks: remarks.trim(),
      comment: comment.trim(),
      photoUrl: photoUrl || null,
      season: season
    };

    onSaveWell(wellObj);
    updateRecentsList(wellObj);
    setIsNewSite(false);
    setSelectedWellId(null);
    Alert.alert("Success", "Station details saved successfully.");
  };

  const handleFetchAllStationMsl = async () => {
    // Filter wells that have lat and lon, but do not have msl
    const targetWells = wellsData.filter(w => w.lat != null && w.lon != null && (w.msl == null || isNaN(parseFloat(w.msl))));
    
    if (targetWells.length === 0) {
      Alert.alert("MSL Elevation Data", "All stations with valid coordinates already have MSL elevation data.");
      return;
    }

    Alert.alert(
      "Fetch MSL Elevation Data",
      `Found ${targetWells.length} stations missing MSL elevation data. Would you like to fetch them from the Open-Meteo elevation API? (Requires internet)`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Fetch", 
          onPress: async () => {
            setMslFetching(true);
            setMslFetchProgress(`Starting fetch for ${targetWells.length} stations...`);
            
            try {
              // Copy of wellsData
              const updatedWells = [...wellsData];
              const batchSize = 50; // Fetch in chunks of 50 to avoid URL length issues
              let successCount = 0;
              
              for (let i = 0; i < targetWells.length; i += batchSize) {
                const chunk = targetWells.slice(i, i + batchSize);
                const lats = chunk.map(w => w.lat).join(',');
                const lons = chunk.map(w => w.lon).join(',');
                
                setMslFetchProgress(`Fetching elevations: ${i} / ${targetWells.length} completed...`);
                
                const response = await fetch(`https://elevation-api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`);
                if (response.ok) {
                  const data = await response.json();
                  if (data && data.elevation && data.elevation.length === chunk.length) {
                    chunk.forEach((well, idx) => {
                      const elev = data.elevation[idx];
                      if (elev != null) {
                        // Find this well in updatedWells
                        const wellIndex = updatedWells.findIndex(w => w.well_number === well.well_number);
                        if (wellIndex !== -1) {
                          updatedWells[wellIndex] = {
                            ...updatedWells[wellIndex],
                            msl: parseFloat(elev.toFixed(2))
                          };
                          // Also calculate RL if we already have dtgwl_mbgl
                          const mbglVal = parseFloat(updatedWells[wellIndex].dtgwl_mbgl);
                          if (!isNaN(mbglVal)) {
                            updatedWells[wellIndex].rl = parseFloat((elev - mbglVal).toFixed(2));
                          }
                          successCount++;
                        }
                      }
                    });
                  }
                }
              }
              
              setMslFetchProgress(`Saving updated stations...`);
              if (onSaveAllWells) {
                const saved = await onSaveAllWells(updatedWells);
                if (saved) {
                  Alert.alert("Fetch Complete", `Successfully updated MSL elevation for ${successCount} stations.`);
                } else {
                  Alert.alert("Error", "Failed to save updated stations to local storage.");
                }
              } else {
                Alert.alert("Warning", "onSaveAllWells callback not found.");
              }
            } catch (error) {
              console.error(error);
              Alert.alert("Fetch Failed", "An error occurred while fetching MSL elevation: " + error.message);
            } finally {
              setMslFetching(false);
              setMslFetchProgress('');
            }
          }
        }
      ]
    );
  };

  // Launch New Station Flow
  const startAddNewStation = () => {
    if (selectedDistrict === 'ALL' || selectedBlock === 'ALL') {
      Alert.alert("Action Required", "Please select a District and Block first to add a station under them.");
      return;
    }
    
    setIsNewSite(true);
    setSelectedWellId(null);
    
    // Reset form states
    setWellNumber('');
    setSlNo('');
    setLocation('');
    setWellType('DW');
    setDepth('');
    setParapet('0.45'); // Standard default parapet height
    setDate(new Date().toLocaleDateString('en-GB').replace(/\//g, '.'));
    setDateObject(new Date());
    setBmp('');
    setMbgl('');
    setMsl('');
    setRl('');
    setLatitude('');
    setLongitude('');
    setRemarks('New Station Created');
    setComment('');
    setPhotoUrl('');
    setSeason('Winter');
  };

  // Handle changing calendar picker values
  const onChangeDate = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setDateObject(selectedDate);
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const year = selectedDate.getFullYear();
      const dateStr = `${day}.${month}.${year}`;
      setDate(dateStr);
      
      // Auto detect and set season
      const autoSeason = inferSeasonNameFromDate(dateStr);
      if (autoSeason) {
        setSeason(autoSeason);
      }
    }
  };

  // Direct Loader for Recents List clicks
  const loadRecentStation = (recent) => {
    const dist = getDistrictFromSheet(recent.sheet);
    const div = getDivisionForDistrict(dist);
    setSelectedDivision(div);
    setSelectedDistrict(dist);
    setSelectedBlock(recent.block);
    setSelectedWellId(recent.well_number);
    setIsNewSite(false);
    setShowStats(false);
  };

  const prepareWttoExportModal = async () => {
    try {
      const available = [];
      for (const dist of allLoadedDistricts) {
        const division = getDivisionForDistrict(dist);
        const templateB64 = await getCustomTemplate(dist) || await getCustomTemplate(division);
        if (!templateB64) continue;

        const wb = XLSX.read(templateB64, { type: 'base64' });
        const sheetSet = new Set(wb.SheetNames);
        const expectedSheets = districtSheetsMap[dist] || [];
        if (expectedSheets.some(sheetName => sheetSet.has(sheetName))) {
          available.push(dist);
        }
      }
      setWttoExportDistricts(available);
      setShowExportFormatModal(true);
    } catch (err) {
      console.warn('Failed to inspect WTTO template sheets:', err);
      setWttoExportDistricts([]);
      setShowExportFormatModal(true);
    }
  };

  const handleInitiateImport = (division) => {
    setSelectedImportDivision(division);
    setSelectedImportDistrict(null);
    setGoogleSheetUrl('');
    setImportTab('file');
  };

  const handleInitiateWttoImport = (district) => {
    setSelectedImportDistrict(district);
    setSelectedImportDivision(getDivisionForDistrict(district));
    setGoogleSheetUrl('');
    setImportTab('file');
  };

  const handleLocalFileImport = async (division, district = null) => {
    const importTarget = district || division;
    setShowImportModal(false);
    setSelectedImportDivision(null);
    setSelectedImportDistrict(null);
    setImporting(true);
    try {
      const result = await importExcelDataClientSide();
      if (result) {
        if (result.isAppSheet) {
          const { wells, visits } = result;
          Alert.alert(
            "AppSheet Format Detected",
            `Found ${wells.length} stations and ${visits.length} water level measurements. Do you want to sync this data into your app?`,
            [
              { text: "Cancel", style: "cancel" },
              { 
                text: "Sync Now", 
                onPress: async () => {
                  await onImportAppSheet(wells, visits, result.diagnostics);
                }
              }
            ]
          );
          return;
        }

        const { wells, base64 } = result;
        if (importMode === 'wtto') {
          await saveCustomTemplate(importTarget, base64);
          if (wells.length === 0) {
            Alert.alert("WTTO Template Saved", `Raw WTTO workbook saved for ${importTarget}. No station records were parsed from this file.`);
            return;
          }
        }
 
        if (wells.length === 0) {
          Alert.alert("Import Failed", "No valid well records were found in the selected Excel file.");
          return;
        }

        const impSeason = detectImportedSeason(wells);
        const impYear = detectImportedYear(wells);
        let impSeasonStr = '';
        if (impSeason === 'Winter') impSeasonStr = `Season-Winter -${impYear}`;
        else if (impSeason === 'Pre-Monsoon') impSeasonStr = `Season- Pre-Monsson-${impYear}`;
        else if (impSeason === 'Mid-Monsoon') impSeasonStr = `Mid-Monsoon-${impYear}`;
        else if (impSeason === 'Post-Monsoon') impSeasonStr = `Post-Monsson-${impYear}`;
        
        const impActiveWells = wells.filter(isActiveWell);
        const impMonitoredCount = impActiveWells.filter(w => {
          const hasDate = w.date !== null && w.date !== undefined && w.date !== '';
          const hasBmp = w.dtgwl_bmp !== null && w.dtgwl_bmp !== undefined && w.dtgwl_bmp !== '' && !isNaN(Number(w.dtgwl_bmp));
          return hasDate && hasBmp && checkDateInSeasonRange(w.date, impSeasonStr);
        }).length;
        const impPendingCount = impActiveWells.length - impMonitoredCount;
        
        Alert.alert(
          "Confirm Import",
          importMode === 'wtto'
            ? `Successfully parsed ${wells.length} stations and saved the WTTO workbook for ${importTarget} (Detected: ${impSeason} ${impYear}, Monitored: ${impMonitoredCount}, Pending: ${impPendingCount}). Do you want to update the WTTO database with this WTTO data?`
            : `Successfully parsed ${wells.length} stations from the file for ${impSeason} ${impYear} (${impMonitoredCount} Monitored, ${impPendingCount} Pending). Do you want to overwrite your active database for ${division} with this data?`,
          [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Import", 
              onPress: async () => {
                if (importMode === 'wtto') {
                  await onImportWTTO(wells, base64, importTarget);
                } else {
                  await onImportDB(wells, base64, division);
                }
                Alert.alert("Import Complete", importMode === 'wtto' ? `Raw WTTO workbook imported successfully for ${importTarget}!` : `Database updated successfully for ${division}!`);
              }
            }
          ]
        );
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Import Error", "An error occurred while importing: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleDirectFileImport = async (division, district = null, filePath) => {
    const importTarget = district || division;
    setShowImportModal(false);
    setSelectedImportDivision(null);
    setSelectedImportDistrict(null);
    setImporting(true);
    try {
      const result = await importExcelDataDirectly(filePath);
      if (result) {
        const { wells, base64 } = result;
        if (importMode === 'wtto') {
          await saveCustomTemplate(importTarget, base64);
          if (wells.length === 0) {
            Alert.alert("WTTO Template Saved", `Raw WTTO workbook saved for ${importTarget}. No station records were parsed from this file.`);
            return;
          }
        }
 
        if (wells.length === 0) {
          Alert.alert("Import Failed", "No valid well records were found in the selected Excel file.");
          return;
        }

        const impSeason = detectImportedSeason(wells);
        const impYear = detectImportedYear(wells);
        let impSeasonStr = '';
        if (impSeason === 'Winter') impSeasonStr = `Season-Winter -${impYear}`;
        else if (impSeason === 'Pre-Monsoon') impSeasonStr = `Season- Pre-Monsson-${impYear}`;
        else if (impSeason === 'Mid-Monsoon') impSeasonStr = `Mid-Monsoon-${impYear}`;
        else if (impSeason === 'Post-Monsoon') impSeasonStr = `Post-Monsson-${impYear}`;
        
        const impActiveWells = wells.filter(isActiveWell);
        const impMonitoredCount = impActiveWells.filter(w => {
          const hasDate = w.date !== null && w.date !== undefined && w.date !== '';
          const hasBmp = w.dtgwl_bmp !== null && w.dtgwl_bmp !== undefined && w.dtgwl_bmp !== '' && !isNaN(Number(w.dtgwl_bmp));
          return hasDate && hasBmp && checkDateInSeasonRange(w.date, impSeasonStr);
        }).length;
        const impPendingCount = impActiveWells.length - impMonitoredCount;
        
        Alert.alert(
          "Confirm Import",
          importMode === 'wtto'
            ? `Successfully parsed ${wells.length} stations and saved the WTTO workbook for ${importTarget} (Detected: ${impSeason} ${impYear}, Monitored: ${impMonitoredCount}, Pending: ${impPendingCount}). Do you want to update the WTTO database with this WTTO data?`
            : `Successfully parsed ${wells.length} stations from the file for ${impSeason} ${impYear} (${impMonitoredCount} Monitored, ${impPendingCount} Pending). Do you want to overwrite your active database for ${division} with this data?`,
          [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Import", 
              onPress: async () => {
                if (importMode === 'wtto') {
                  await onImportWTTO(wells, base64, importTarget);
                } else {
                  await onImportDB(wells, base64, division);
                }
                Alert.alert("Import Complete", importMode === 'wtto' ? `Raw WTTO workbook imported successfully for ${importTarget}!` : `Database updated successfully for ${division}!`);
              }
            }
          ]
        );
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Import Error", "An error occurred while importing: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleGoogleSheetImport = async (division) => {
    if (!googleSheetUrl.trim()) {
      Alert.alert("Error", "Please enter a Google Sheets URL first.");
      return;
    }
    setShowImportModal(false);
    setSelectedImportDivision(null);
    setImporting(true);
    try {
      const result = await importGoogleSheetData(googleSheetUrl);
      if (result) {
        if (result.isAppSheet) {
          const { wells, visits } = result;
          Alert.alert(
            "AppSheet Format Detected",
            `Downloaded ${wells.length} stations and ${visits.length} water level measurements from Google Sheets. Do you want to sync this data?`,
            [
              { text: "Cancel", style: "cancel" },
              { 
                text: "Sync Now", 
                onPress: async () => {
                  await onImportAppSheet(wells, visits, result.diagnostics);
                }
              }
            ]
          );
          return;
        }

        const { wells, base64 } = result;
        if (wells.length === 0) {
          Alert.alert("Import Failed", "No valid well records were found in the Google Sheet.");
          return;
        }

        const impSeason = detectImportedSeason(wells);
        const impYear = detectImportedYear(wells);
        let impSeasonStr = '';
        if (impSeason === 'Winter') impSeasonStr = `Season-Winter -${impYear}`;
        else if (impSeason === 'Pre-Monsoon') impSeasonStr = `Season- Pre-Monsson-${impYear}`;
        else if (impSeason === 'Mid-Monsoon') impSeasonStr = `Mid-Monsoon-${impYear}`;
        else if (impSeason === 'Post-Monsoon') impSeasonStr = `Post-Monsson-${impYear}`;
        
        const impActiveWells = wells.filter(isActiveWell);
        const impMonitoredCount = impActiveWells.filter(w => {
          const hasDate = w.date !== null && w.date !== undefined && w.date !== '';
          const hasBmp = w.dtgwl_bmp !== null && w.dtgwl_bmp !== undefined && w.dtgwl_bmp !== '' && !isNaN(Number(w.dtgwl_bmp));
          return hasDate && hasBmp && checkDateInSeasonRange(w.date, impSeasonStr);
        }).length;
        const impPendingCount = impActiveWells.length - impMonitoredCount;
        
        Alert.alert(
          "Confirm Import",
          `Successfully downloaded and parsed ${wells.length} stations from Google Sheets for ${impSeason} ${impYear} (${impMonitoredCount} Monitored, ${impPendingCount} Pending). Do you want to overwrite your active database for ${division} with this data?`,
          [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Import", 
              onPress: async () => {
                await onImportDB(wells, base64, division);
                Alert.alert("Import Complete", `Database updated successfully for ${division}!`);
              }
            }
          ]
        );
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Import Error", err.message);
    } finally {
      setImporting(false);
    }
  };


  return (
    <View style={styles.container}>
      <DashboardBackgroundTexture theme={theme} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.menuBtn} 
          onPress={() => setShowMenu(true)}
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.title}>Bhujal Track</Text>
          <Text style={styles.subHeader}>GWD Division Tracker</Text>
        </View>
        
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity 
            style={styles.badge} 
            onPress={toggleTheme}
            activeOpacity={0.7}
          >
            <Text style={styles.badgeEmoji}>{isDark ? '🌙' : '☀️'}</Text>
            <Text style={styles.badgeText}>{isDark ? 'Dark' : 'Light'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Active Season Highlight Card */}
      {(() => {
        const lowerSeason = getActiveSeason().toLowerCase();
        const isWinter = lowerSeason.includes('winter');
        const isPreMonsoon = lowerSeason.includes('pre');
        const isMidMonsoon = lowerSeason.includes('mid') || (lowerSeason.includes('monsoon') && !lowerSeason.includes('pre') && !lowerSeason.includes('post'));
        const isPostMonsoon = lowerSeason.includes('post');

        let bannerBg = isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.06)';
        let bannerBorder = '#38bdf8';
        let bannerTextColor = '#38bdf8';
        let seasonIcon = '🍂';

        if (isWinter) {
          bannerBg = isDark ? 'rgba(186, 230, 253, 0.1)' : 'rgba(224, 242, 254, 0.6)';
          bannerBorder = '#7dd3fc';
          bannerTextColor = isDark ? '#38bdf8' : '#0369a1';
          seasonIcon = '❄️';
        } else if (isPreMonsoon) {
          bannerBg = isDark ? 'rgba(253, 186, 116, 0.12)' : 'rgba(254, 237, 222, 0.65)';
          bannerBorder = '#fdba74';
          bannerTextColor = isDark ? '#fb923c' : '#c2410c';
          seasonIcon = '☀️';
        } else if (isMidMonsoon) {
          bannerBg = isDark ? 'rgba(100, 116, 139, 0.15)' : 'rgba(241, 245, 249, 0.7)';
          bannerBorder = '#94a3b8';
          bannerTextColor = isDark ? '#94a3b8' : '#475569';
          seasonIcon = '🌧️';
        } else if (isPostMonsoon) {
          bannerBg = isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(209, 250, 229, 0.5)';
          bannerBorder = '#34d399';
          bannerTextColor = isDark ? '#34d399' : '#047857';
          seasonIcon = '🍃';
        }

        return (
          <View>
            <View 
              style={[styles.activeSeasonBanner, { backgroundColor: bannerBg, borderWidth: 0, marginBottom: 12 }]}
            >
              <SeasonAnimation seasonText={getActiveSeason()} shiverAnim={shiverAnim} />

              <Animated.View style={[styles.activeSeasonBannerLeft, { transform: [{ translateX: shiverAnim }] }]}>
                <Text style={[styles.activeSeasonLabel, { color: bannerTextColor }]}>
                  Active Monitoring Season
                </Text>
                <Text style={styles.activeSeasonValue}>{formatSeasonDisplayName(getActiveSeason())}</Text>
              </Animated.View>
              <Text style={styles.activeSeasonIcon}>{seasonIcon}</Text>
            </View>

            {/* Season & Year Selector Panel */}
            <View style={{
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
              borderWidth: 1.5,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(2, 132, 199, 0.1)',
              borderRadius: 14,
              padding: 12,
              marginBottom: 20,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0 : 0.08,
              shadowRadius: 6,
              elevation: isDark ? 0 : 3
            }}>
              <Text style={{
                fontSize: 11,
                fontWeight: '800',
                color: isDark ? '#94a3b8' : '#0284c7',
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                marginBottom: 10,
                textAlign: 'left'
              }}>
                Select Season & Year
              </Text>
              
              {/* Season Selection Scrollable Pill Bar */}
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                contentContainerStyle={{ paddingHorizontal: 2, paddingVertical: 4, gap: 8, marginBottom: 10 }}
              >
                {['Winter', 'Pre-Monsoon', 'Mid-Monsoon', 'Post-Monsoon'].map((season) => {
                  const isSelected = selectedSeason === season;
                  const emoji = season === 'Winter' ? '❄️' : season === 'Pre-Monsoon' ? '☀️' : season === 'Mid-Monsoon' ? '🌧️' : '🍃';
                  return (
                    <TouchableOpacity
                      key={season}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        backgroundColor: isSelected ? (isDark ? '#38bdf8' : '#0284c7') : (isDark ? 'rgba(15, 23, 42, 0.6)' : '#edf4fa'),
                        borderWidth: 1.5,
                        borderColor: isSelected ? 'transparent' : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(2, 132, 199, 0.1)'),
                        borderRadius: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        elevation: isSelected ? 3 : 0,
                        shadowColor: '#38bdf8',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: isSelected ? 0.25 : 0,
                        shadowRadius: 4
                      }}
                      onPress={() => setSelectedSeason(season)}
                    >
                      <Text style={{
                        fontSize: 12,
                        fontWeight: '800',
                        color: isSelected ? '#ffffff' : (isDark ? '#cbd5e1' : '#475569')
                      }}>
                        {emoji} {season === 'Pre-Monsoon' ? 'Pre-Monsoon' : season === 'Mid-Monsoon' ? 'Mid-Monsoon' : season === 'Post-Monsoon' ? 'Post-Monsoon' : 'Winter'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Year Selection Scrollable Pill Bar (Smooth Horizontal Scroll & Wide Pill Spacing) */}
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                contentContainerStyle={{ paddingHorizontal: 2, paddingVertical: 4, gap: 8 }}
              >
                {availableYears.map((year) => {
                  const isSelected = selectedYear === year;
                  return (
                    <TouchableOpacity
                      key={year}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 9,
                        minWidth: 80,
                        backgroundColor: isSelected ? (isDark ? '#ea580c' : '#ea580c') : (isDark ? 'rgba(15, 23, 42, 0.6)' : '#edf4fa'),
                        borderWidth: 1.5,
                        borderColor: isSelected ? 'transparent' : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(2, 132, 199, 0.1)'),
                        borderRadius: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        elevation: isSelected ? 3 : 0,
                        shadowColor: '#ea580c',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: isSelected ? 0.3 : 0,
                        shadowRadius: 4
                      }}
                      onPress={() => setSelectedYear(year)}
                    >
                      <Text style={{
                        fontSize: 13,
                        fontWeight: '800',
                        color: isSelected ? '#ffffff' : (isDark ? '#cbd5e1' : '#475569')
                      }}>
                        📅 {year}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        );
      })()}

      {/* Hamburger Overlay Menu Drawer */}
      {showMenu && (
        <Modal
          visible={showMenu}
          transparent={true}
          animationType="none"
          onRequestClose={() => setShowMenu(false)}
        >
          <TouchableOpacity 
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setShowMenu(false)}
          >
            <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.menuDrawer}>
              <View style={styles.menuHeader}>
                <Text style={styles.menuDrawerTitle}>Menu</Text>
                <TouchableOpacity 
                  style={styles.menuCloseBtn}
                  onPress={() => setShowMenu(false)}
                >
                  <Text style={styles.menuCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  setShowFieldBookExportModal(true);
                }}
              >
                <Text style={styles.menuItemIcon}>📖</Text>
                <Text style={styles.menuItemText}>Export Field Book</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.menuItem}
                onPress={async () => {
                  setShowMenu(false);
                  await exportNotMonitoredReport(wellsData, getActiveSeason());
                }}
              >
                <Text style={styles.menuItemIcon}>⚠️</Text>
                <Text style={styles.menuItemText}>Not Monitored Report</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  setShowGraspModal(true);
                }}
              >
                <Text style={styles.menuItemIcon}>📊</Text>
                <Text style={styles.menuItemText}>Export for GRASP</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  if (onOpenFieldBook) onOpenFieldBook();
                }}
              >
                <Text style={styles.menuItemIcon}>📘</Text>
                <Text style={styles.menuItemText}>Standard Field Book Format & Import</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  setImportMode('district');
                  setSelectedImportDivision(null);
                  setShowImportModal(true);
                }}
              >
                <Text style={styles.menuItemIcon}>📤</Text>
                <Text style={styles.menuItemText}>Import Division File</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  setImportMode('data');
                  setSelectedImportDivision(null);
                  setShowImportModal(true);
                }}
              >
                <Text style={styles.menuItemIcon}>📤</Text>
                <Text style={styles.menuItemText}>Import Field book</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  setImportMode('wtto');
                  setSelectedImportDivision(null);
                  setShowImportModal(true);
                }}
              >
                <Text style={styles.menuItemIcon}>📥</Text>
                <Text style={styles.menuItemText}>Import WTTO file</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => {
                  setShowMenu(false);
                  if (onOpenNews) onOpenNews();
                }}
                style={{ marginVertical: 6 }}
              >
                <View 
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'transparent',
                    borderColor: '#ef4444',
                    borderWidth: 1.5,
                    borderRadius: 10,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    shadowColor: '#ef4444',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.4,
                    shadowRadius: 6,
                    elevation: 2
                  }}
                >
                  <Text style={[styles.menuItemIcon, { marginBottom: 0, color: '#ef4444' }]}>📰</Text>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[styles.menuItemText, { fontWeight: '800', color: isDark ? '#fca5a5' : '#dc2626' }]}>
                      Groundwater News
                    </Text>
                    {/* Pulsating glowing red status light inside the red card */}
                    <Animated.View 
                      style={{ 
                        width: 8, 
                        height: 8, 
                        borderRadius: 4, 
                        backgroundColor: '#ef4444',
                        opacity: pulseAnim,
                        shadowColor: '#ef4444',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.8,
                        shadowRadius: 4,
                        elevation: 2
                      }} 
                    />
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  toggleTheme();
                }}
              >
                <Text style={styles.menuItemIcon}>{isDark ? '☀️' : '🌙'}</Text>
                <Text style={styles.menuItemText}>{isDark ? 'Light Theme' : 'Dark Theme'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  handleFetchAllStationMsl();
                }}
              >
                <Text style={styles.menuItemIcon}>⛰️</Text>
                <Text style={styles.menuItemText}>Fetch MSL Elevations</Text>
              </TouchableOpacity>




              {onLogout && (
                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => {
                    setShowMenu(false);
                    onLogout();
                  }}
                >
                  <Text style={styles.menuItemIcon}>🔑</Text>
                  <Text style={[styles.menuItemText, { color: '#0ea5e9', fontWeight: '800' }]}>Log Out</Text>
                </TouchableOpacity>
              )}

              <View style={styles.menuDivider} />

              <TouchableOpacity 
                style={[styles.menuItem, { marginTop: 'auto', borderBottomWidth: 0 }]}
                onPress={() => {
                  setShowMenu(false);
                  onResetDB();
                }}
              >
                <Text style={styles.menuItemIcon}>🔄</Text>
                <Text style={[styles.menuItemText, { color: '#ef4444' }]}>Reset Database</Text>
              </TouchableOpacity>
            </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>
      )}



      {/* GRASP Export Modal */}
      {showGraspModal && (
        <Modal
          visible={showGraspModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowGraspModal(false)}
        >
          <TouchableOpacity 
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setShowGraspModal(false)}
          >
            <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.graspDialog}>
              <Text style={styles.graspDialogTitle}>📊 Export for GRASP (CSV)</Text>
              <Text style={styles.graspDialogDesc}>
                Select a district to extract visited stations in GRASP format (ID, Date as DD-MM-YYYY, Time 08:00, and DTGWL mbgl).
              </Text>

              <ScrollView style={styles.wttoModalScroll} contentContainerStyle={styles.wttoModalScrollContent}>
                {allLoadedDistricts.map(dist => (
                  <TouchableOpacity
                    key={dist}
                    style={styles.graspDistItem}
                    onPress={() => {
                      setShowGraspModal(false);
                      exportForGrasp(wellsData, dist);
                    }}
                  >
                    <Text style={styles.graspDistText}>{dist.toUpperCase()}</Text>
                    <Text style={styles.graspDistSub}>Export CSV ➔</Text>
                  </TouchableOpacity>
                ))}

                {allLoadedDistricts.length === 0 && (
                  <Text style={styles.noStationsText}>No districts available. Please import sheets.</Text>
                )}
              </ScrollView>

              <TouchableOpacity 
                style={styles.graspCloseBtn}
                onPress={() => setShowGraspModal(false)}
              >
                <Text style={styles.graspCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Field Book Division Selector Export Modal */}
      {showFieldBookExportModal && (
        <Modal
          visible={showFieldBookExportModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowFieldBookExportModal(false)}
        >
          <TouchableOpacity 
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setShowFieldBookExportModal(false)}
          >
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.graspDialog}>
                <Text style={styles.graspDialogTitle}>📖 Export Field Book</Text>
                <Text style={styles.graspDialogDesc}>
                  Select a division to export its Field Book template filled with measurements, or export all divisions.
                </Text>

                <ScrollView style={styles.wttoModalScroll} contentContainerStyle={styles.wttoModalScrollContent}>
                  <TouchableOpacity
                    style={styles.graspDistItem}
                    onPress={() => {
                      setShowFieldBookExportModal(false);
                      exportToExcelClientSide(wellsData, null);
                    }}
                  >
                    <Text style={styles.graspDistText}>📚 ALL DIVISIONS</Text>
                    <Text style={styles.graspDistSub}>Export ➔</Text>
                  </TouchableOpacity>

                  {gwdDivisions.map(div => {
                    const count = wellsData.filter(w => getDivisionForDistrict(getDistrictFromSheet(w.sheet)) === div).length;
                    if (count === 0) return null;
                    return (
                      <TouchableOpacity
                        key={div}
                        style={styles.graspDistItem}
                        onPress={() => {
                          setShowFieldBookExportModal(false);
                          exportToExcelClientSide(wellsData, div);
                        }}
                      >
                        <Text style={styles.graspDistText}>🏢 {div}</Text>
                        <Text style={styles.graspDistSub}>Export ➔</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity 
                  style={styles.graspCloseBtn}
                  onPress={() => setShowFieldBookExportModal(false)}
                >
                  <Text style={styles.graspCloseBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Import Division Selector Modal */}
      {showImportModal && (
        <Modal
          visible={showImportModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setShowImportModal(false);
            setSelectedImportDivision(null);
            setSelectedImportDistrict(null);
          }}
        >
          <TouchableOpacity 
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => {
              setShowImportModal(false);
              setSelectedImportDivision(null);
              setSelectedImportDistrict(null);
            }}
          >
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.graspDialog, styles.importDialog]}>
              <ScrollView
                style={styles.importModalScroll}
                contentContainerStyle={styles.importModalScrollContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
              {selectedImportDivision === null ? (
                <>
                  <Text style={styles.graspDialogTitle}>
                    {importMode === 'wtto' ? '📥 Import WTTO file' : '📤 Import Field book'}
                  </Text>
                  <Text style={styles.graspDialogDesc}>
                    {importMode === 'wtto'
                      ? 'Select the district for this WTTO workbook. The uploaded file will be saved for that district and used later for WTTO export.'
                      : 'Select the GWD Division you want to import data for. The imported stations will replace only the existing stations in this division.'}
                  </Text>

                  {(importMode === 'wtto' ? wttoImportDistrictsList : ['ALL DISTRICTS (AUTOMATIC)', ...gwdDivisions]).map(item => (
                      <TouchableOpacity
                        key={item}
                        style={styles.graspDistItem}
                        onPress={() => importMode === 'wtto' ? handleInitiateWttoImport(item) : handleInitiateImport(item)}
                      >
                        <Text style={styles.graspDistText}>{importMode === 'wtto' ? item.toUpperCase() : item}</Text>
                        <Text style={styles.graspDistSub}>Select ➔</Text>
                      </TouchableOpacity>
                    ))}
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <TouchableOpacity 
                      onPress={() => {
                        setSelectedImportDivision(null);
                        setSelectedImportDistrict(null);
                      }}
                      style={{ padding: 6, marginRight: 8, backgroundColor: isDark ? '#1e293b' : '#f1f5f9', borderRadius: 8 }}
                    >
                      <Text style={{ color: isDark ? '#f8fafc' : '#0f172a', fontWeight: 'bold' }}>⬅ Back</Text>
                    </TouchableOpacity>
                    <Text style={[styles.graspDialogTitle, { marginBottom: 0, flex: 1 }]}>
                      {importMode === 'wtto' ? '📥' : '📤'} {importMode === 'wtto' ? selectedImportDistrict : selectedImportDivision}
                    </Text>
                  </View>

                  {/* Tab selector */}
                  {importMode !== 'wtto' && (
                  <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#1e293b' : '#edf4fa', borderRadius: 10, padding: 3, marginBottom: 16 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        alignItems: 'center',
                        borderRadius: 8,
                        backgroundColor: importTab === 'file' ? (isDark ? '#3b82f6' : '#0284c7') : 'transparent'
                      }}
                      onPress={() => setImportTab('file')}
                    >
                      <Text style={{ fontWeight: '700', color: importTab === 'file' ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'), fontSize: 13 }}>
                        📂 Local File
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        alignItems: 'center',
                        borderRadius: 8,
                        backgroundColor: importTab === 'sheets' ? (isDark ? '#3b82f6' : '#0284c7') : 'transparent'
                      }}
                      onPress={() => setImportTab('sheets')}
                    >
                      <Text style={{ fontWeight: '700', color: importTab === 'sheets' ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'), fontSize: 13 }}>
                        🟢 Google Sheets
                      </Text>
                    </TouchableOpacity>
                  </View>
                  )}

                  {importTab === 'file' ? (
                    <View style={{ marginVertical: 8, alignItems: 'center' }}>
                      <Text style={[styles.graspDialogDesc, { textAlign: 'center', marginBottom: 20 }]}>
                        {importMode === 'wtto'
                          ? `Upload the WTTO Excel workbook (.xlsx) for ${selectedImportDistrict}. Its sheets will be used for WTTO export and trends.`
                          : 'Upload a groundwater Excel spreadsheet (.xlsx) from your mobile device files.'}
                      </Text>
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#0284c7',
                          borderRadius: 12,
                          paddingVertical: 14,
                          paddingHorizontal: 24,
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '100%',
                          shadowColor: '#0284c7',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.3,
                          shadowRadius: 5,
                          elevation: 4
                        }}
                        onPress={() => handleLocalFileImport(selectedImportDivision, selectedImportDistrict)}
                      >
                        <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 16 }}>
                          {importMode === 'wtto' ? '📥 Select WTTO Workbook' : '📂 Select & Import File'}
                        </Text>
                      </TouchableOpacity>

                      {selectedImportDivision === 'CUTTACK DIVISION' && (
                        <TouchableOpacity
                          style={{
                            backgroundColor: '#10b981',
                            borderRadius: 12,
                            paddingVertical: 14,
                            paddingHorizontal: 24,
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%',
                            marginTop: 12,
                            shadowColor: '#10b981',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.3,
                            shadowRadius: 5,
                            elevation: 4
                          }}
                          onPress={() => handleDirectFileImport('CUTTACK DIVISION', null, 'file:///sdcard/Download/CTC Pre-monsoon Field Book 2026.xlsx')}
                        >
                          <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 16 }}>
                            ⚡ Direct Import CTC Pre-Monsoon 2026
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    <View style={{ marginVertical: 8 }}>
                      <Text style={[styles.graspDialogDesc, { marginBottom: 12 }]}>
                        Paste the Google Sheets shareable link below.
                      </Text>
                      
                      <View style={{
                        backgroundColor: isDark ? '#080d16' : '#f8fafc',
                        borderWidth: 1.5,
                        borderColor: isDark ? '#334155' : '#cbd5e1',
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        marginBottom: 8
                      }}>
                        <TextInput
                          style={{
                            height: 48,
                            color: isDark ? '#f8fafc' : '#0f172a',
                            fontSize: 14,
                            fontWeight: '500'
                          }}
                          placeholder="Paste spreadsheet URL here..."
                          placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                          value={googleSheetUrl}
                          onChangeText={setGoogleSheetUrl}
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="url"
                        />
                      </View>

                      <Text style={{
                        fontSize: 11,
                        color: isDark ? '#94a3b8' : '#64748b',
                        lineHeight: 15,
                        marginBottom: 20,
                        fontStyle: 'italic'
                      }}>
                        ⚠️ The Google Sheet must be shared as "Anyone with the link can view" to allow download.
                      </Text>

                      <TouchableOpacity
                        style={{
                          backgroundColor: '#059669',
                          borderRadius: 12,
                          paddingVertical: 14,
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '100%',
                          shadowColor: '#059669',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.3,
                          shadowRadius: 5,
                          elevation: 4
                        }}
                        onPress={() => handleGoogleSheetImport(selectedImportDivision)}
                      >
                        <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 16 }}>
                          🟢 Fetch & Import Sheet
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                </>
              )}
              </ScrollView>
              <TouchableOpacity 
                style={[styles.graspCloseBtn, { marginTop: 10 }]}
                onPress={() => {
                  setShowImportModal(false);
                  setSelectedImportDivision(null);
                  setSelectedImportDistrict(null);
                }}
              >
                <Text style={styles.graspCloseBtnText}>Cancel</Text>
              </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Export WTTO Modal */}
      {showExportFormatModal && (
        <Modal
          visible={showExportFormatModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowExportFormatModal(false)}
        >
          <TouchableOpacity 
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setShowExportFormatModal(false)}
          >
            <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.graspDialog}>
              <Text style={styles.graspDialogTitle}>📄 Export WTTO Excel File</Text>
              <Text style={styles.graspDialogDesc}>
                Select a district to export in the uploaded WTTO template format.
              </Text>

              <ScrollView
                style={styles.wttoModalScroll}
                contentContainerStyle={styles.wttoModalScrollContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {wttoExportDistricts.map(dist => {
                  const sheets = districtSheetsMap[dist] || [];
                  const hasBlocks = sheets.some(s => s.toLowerCase().includes('block'));
                  const hasUrban = sheets.some(s => s.toLowerCase().includes('urban'));
                  return (
                    <View key={dist} style={{ marginBottom: 12 }}>
                      <Text style={[styles.dropdownLabel, { marginVertical: 4, fontWeight: 'bold', fontSize: 13, color: isDark ? '#94a3b8' : '#475569' }]}>
                        📍 {dist.toUpperCase()}
                      </Text>
                      
                      <TouchableOpacity
                        style={[styles.graspDistItem, { marginVertical: 2 }]}
                        onPress={() => {
                          setSelectedExportDist(dist);
                          setSelectedExportOption('all');
                          setShowExportFormatModal(false);
                          setShowSeasonSelector(true);
                        }}
                      >
                        <Text style={styles.graspDistText}>  📄 All Sheets (Blocks & Urban)</Text>
                        <Text style={styles.graspDistSub}>Export ➔</Text>
                      </TouchableOpacity>

                      {hasBlocks && (
                        <TouchableOpacity
                          style={[styles.graspDistItem, { marginVertical: 2 }]}
                          onPress={() => {
                            setSelectedExportDist(dist);
                            setSelectedExportOption('blocks');
                            setShowExportFormatModal(false);
                            setShowSeasonSelector(true);
                          }}
                        >
                          <Text style={styles.graspDistText}>  🚜 Blocks Sheet Only</Text>
                          <Text style={styles.graspDistSub}>Export ➔</Text>
                        </TouchableOpacity>
                      )}

                      {hasUrban && (
                        <TouchableOpacity
                          style={[styles.graspDistItem, { marginVertical: 2 }]}
                          onPress={() => {
                            setSelectedExportDist(dist);
                            setSelectedExportOption('urban');
                            setShowExportFormatModal(false);
                            setShowSeasonSelector(true);
                          }}
                        >
                          <Text style={styles.graspDistText}>  🏙️ Urban Sheet Only</Text>
                          <Text style={styles.graspDistSub}>Export ➔</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}

                {wttoExportDistricts.length === 0 && (
                  <Text style={styles.noStationsText}>No WTTO district sheets are available in the uploaded template. Import the correct WTTO workbook first.</Text>
                )}
              </ScrollView>

              <TouchableOpacity 
                style={styles.graspCloseBtn}
                onPress={() => setShowExportFormatModal(false)}
              >
                <Text style={styles.graspCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Season Selector Modal for WTTO Export */}
      {showSeasonSelector && (
        <Modal
          visible={showSeasonSelector}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowSeasonSelector(false)}
        >
          <TouchableOpacity 
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setShowSeasonSelector(false)}
          >
            <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.graspDialog}>
              <Text style={styles.graspDialogTitle}>📅 Select WTTO Season</Text>
              <Text style={styles.graspDialogDesc}>
                Choose the target season column in the WTTO spreadsheet for {selectedExportDist ? selectedExportDist.toUpperCase() : ''}.
              </Text>

              <ScrollView
                style={styles.wttoModalScroll}
                contentContainerStyle={styles.wttoModalScrollContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {(() => {
                  const currentYear = new Date().getFullYear();
                  const dynamicSeasons = [];
                  for (let y = currentYear + 1; y >= 2020; y--) {
                    dynamicSeasons.push(`${y}_PostMon`);
                    dynamicSeasons.push(`${y}_MidMon`);
                    dynamicSeasons.push(`${y}_PreMon`);
                    dynamicSeasons.push(`${y}_Winter`);
                  }
                  return dynamicSeasons;
                })().map(sName => (
                  <TouchableOpacity
                    key={sName}
                    style={styles.graspDistItem}
                    onPress={() => {
                      setShowSeasonSelector(false);
                      exportToWTTOExcel(wellsData, selectedExportDist, sName, selectedExportOption);
                    }}
                  >
                    <Text style={styles.graspDistText}>{sName}</Text>
                    <Text style={styles.graspDistSub}>Export ➔</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity 
                style={styles.graspCloseBtn}
                onPress={() => setShowSeasonSelector(false)}
              >
                <Text style={styles.graspCloseBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Fullscreen Importing Spinner */}
      {importing && (
        <View style={[StyleSheet.absoluteFill, { 
          backgroundColor: 'rgba(0,0,0,0.6)', 
          justifyContent: 'center', 
          alignItems: 'center',
          zIndex: 9999
        }]}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={{ 
            color: '#ffffff', 
            fontSize: 16, 
            fontWeight: '600', 
            marginTop: 12 
          }}>Parsing Excel File...</Text>
        </View>
      )}

      {/* Interactive District Health Cards */}

      {!selectedWellId && !isNewSite && selectedDivision !== null && selectedDivision !== 'ALL' && (
        <View style={styles.districtSection}>
          <Text style={styles.districtSectionTitle}>🗺️ {selectedDivision} Health Tracker</Text>
          <View style={styles.districtGrid}>
            {districts.map(dist => {
              const stats = districtStats[dist];
              if (!stats) return null;
              const isSelected = selectedDistrict === dist;
              return (
                <TouchableOpacity
                  key={dist}
                  style={[styles.districtCard, isSelected && styles.districtCardActive]}
                  onPress={() => {
                    setSelectedDistrict(dist);
                    setSelectedBlock('ALL');
                    setSelectedWellId(null);
                    setIsNewSite(false);
                  }}
                >
                  <Text style={styles.districtName}>{dist}</Text>
                  <Text style={styles.districtAvgLabel}>Avg Water Level</Text>
                  <Text style={styles.districtAvgValue}>
                    {stats.countMbgl === 0 ? 'N/A' : `${stats.avgMbgl} m`}
                  </Text>
                  <View style={[styles.districtStatusBadge, { backgroundColor: stats.statusBg, borderColor: stats.statusColor }]}>
                    <Text style={[styles.districtStatusText, { color: stats.statusColor }]}>
                      {stats.status}
                    </Text>
                  </View>
                  <Text style={styles.districtRatioText}>
                    📊 Monitored: {stats.monitored}/{stats.active}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {districts.length === 0 && (
            <View style={styles.noDataCard}>
              <Text style={styles.noDataCardText}>
                No district sheet data loaded for {selectedDivision}. Add sheets in the Excel database to start monitoring.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Collapsible Stats Header */}
      <TouchableOpacity 
        style={styles.statsToggleHeader} 
        onPress={() => setShowStats(!showStats)}
      >
        <Text style={styles.panelTitle}>📊 Overall Status Overview</Text>
        <Text style={styles.toggleArrow}>{showStats ? '▲ Hide' : '▼ Show'}</Text>
      </TouchableOpacity>

      {showStats && (() => {
        const activePct = total > 0 ? (active / total) * 100 : 0;
        const activeColors = getCardColors(activePct);
        const monitoredPct = percent;
        const monitoredColors = getCardColors(monitoredPct);
        const pendingPct = active > 0 ? (pending / active) * 100 : 0;
        const pendingColors = getCardColors(pendingPct, true);

        return (
          <View style={styles.statsWrapper}>
            <View style={styles.grid}>
              <View style={[styles.card, styles.cardTotal]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardLabel}>Total Stations</Text>
                  <View style={[styles.cardIconBg, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)' }]}>
                    <Text style={styles.cardIcon}>🏢</Text>
                  </View>
                </View>
                <Text style={styles.cardVal}>{total}</Text>
                <Text style={styles.percentText}>All sites loaded</Text>
              </View>
              <View style={[styles.card, styles.cardActive, { borderColor: activeColors.border, overflow: 'hidden' }]}>
                <View style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${activePct}%`,
                  backgroundColor: activeColors.bg,
                }} />
                <View style={{ flex: 1, zIndex: 1 }}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={[styles.cardLabel, { color: activeColors.text }]}>Active Wells</Text>
                    <View style={[styles.cardIconBg, { backgroundColor: activeColors.border }]}>
                      <Text style={styles.cardIcon}>💧</Text>
                    </View>
                  </View>
                  <Text style={[styles.cardVal, { color: activeColors.text }]}>{active}</Text>
                  <Text style={[styles.percentText, { color: activeColors.secondaryText }]}>Active stations</Text>
                </View>
              </View>
              <View style={[styles.card, styles.cardMonitored, { borderColor: monitoredColors.border, overflow: 'hidden' }]}>
                <View style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${monitoredPct}%`,
                  backgroundColor: monitoredColors.bg,
                }} />
                <View style={{ flex: 1, zIndex: 1 }}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={[styles.cardLabel, { color: monitoredColors.text }]}>Monitored</Text>
                    <View style={[styles.cardIconBg, { backgroundColor: monitoredColors.border }]}>
                      <Text style={styles.cardIcon}>✅</Text>
                    </View>
                  </View>
                  <Text style={[styles.cardVal, { color: monitoredColors.text }]}>{monitored}</Text>
                  <Text style={[styles.percentText, { color: monitoredColors.secondaryText }]}>{percent}% of active</Text>
                </View>
              </View>
              <View style={[styles.card, styles.cardPending, { borderColor: pendingColors.border, overflow: 'hidden' }]}>
                <View style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${100 - pendingPct}%`,
                  backgroundColor: pendingColors.bg,
                }} />
                <View style={{ flex: 1, zIndex: 1 }}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={[styles.cardLabel, { color: pendingColors.text }]}>Pending Visit</Text>
                    <View style={[styles.cardIconBg, { backgroundColor: pendingColors.border }]}>
                      <Text style={styles.cardIcon}>⏳</Text>
                    </View>
                  </View>
                  <Text style={[styles.cardVal, { color: pendingColors.text }]}>{pending}</Text>
                  <Text style={[styles.percentText, { color: pendingColors.secondaryText }]}>Requires values</Text>
                </View>
              </View>
            </View>
          </View>
        );
      })()}

      <DistrictMonitoringMap
        districtStats={districtStats}
        theme={theme}
        selectedDistrict={selectedDistrict}
        wellsData={wellsData}
        wttoData={wttoData}
        onSelectDistrict={(district) => {
          setSelectedDivision(getDivisionForDistrict(district));
          setSelectedDistrict(district);
          setSelectedBlock('ALL');
          setSelectedWellId(null);
          setIsNewSite(false);
        }}
      />

      {/* Selector Workflow Panel */}
      <View style={styles.selectorCard}>
        <Text style={styles.selectorCardTitle}>📍 Station Selection Portal</Text>
        
        {/* Step 1: Division Selection */}
        {selectedDivision === null ? (
          <View>
            <Text style={styles.dropdownLabel}>Select GWD Division</Text>
            <View style={styles.verticalList}>
              {gwdDivisions.map(div => {
                const totalStations = divisionMeta[div]?.totalStations || 0;
                const distCount = divisionMeta[div]?.districts.size || 0;
                return (
                  <TouchableOpacity
                    key={div}
                    style={styles.verticalListItem}
                    onPress={() => {
                      setSelectedDivision(div);
                      setSelectedDistrict('ALL');
                      setSelectedBlock('ALL');
                      setSelectedWellId(null);
                      setIsNewSite(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.verticalListItemText}>{div}</Text>
                      <Text style={styles.verticalListItemSubtext}>
                        {totalStations > 0 
                          ? `📊 ${distCount} districts | ${totalStations} stations loaded` 
                          : '⚠️ No Data Loaded (Excel Sheet Missing)'}
                      </Text>
                    </View>
                    <Text style={styles.verticalListItemSubtext}>➔</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={[styles.selectedStationBanner, { marginBottom: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dropdownLabel}>Selected Division</Text>
              <Text style={styles.selectedWellName}>{selectedDivision}</Text>
            </View>
            <TouchableOpacity 
              style={styles.changeStationBtn}
              onPress={() => {
                setSelectedDivision(null);
                setSelectedDistrict('ALL');
                setSelectedBlock('ALL');
                setSelectedWellId(null);
                setIsNewSite(false);
              }}
            >
              <Text style={styles.changeStationText}>Change</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 2: District Selection */}
        {selectedDivision !== null && (
          selectedDistrict === 'ALL' ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.dropdownLabel}>Select District under {selectedDivision}</Text>
              <View style={styles.verticalList}>
                {districts.map(dist => {
                  const stats = districtStats[dist];
                  return (
                    <TouchableOpacity
                      key={dist}
                      style={styles.verticalListItem}
                      onPress={() => {
                        setSelectedDistrict(dist);
                        setSelectedBlock('ALL');
                        setSelectedWellId(null);
                        setIsNewSite(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.verticalListItemText}>{dist.toUpperCase()}</Text>
                        {stats && (
                          <Text style={[styles.verticalListItemSubtext, { fontSize: 13, marginTop: 2 }]}>
                            Monitored: {stats.monitored}/{stats.active} | Avg DTGWL: {stats.avgMbgl}m ({stats.status})
                          </Text>
                        )}
                      </View>
                      <Text style={styles.verticalListItemSubtext}>➔</Text>
                    </TouchableOpacity>
                  );
                })}
                {districts.length === 0 && (
                  <View style={{ padding: 12, alignItems: 'center' }}>
                    <Text style={[styles.noStationsText, { color: '#ef4444' }]}>⚠️ No Districts Found under this Division.</Text>
                    <Text style={[styles.exportDesc, { textAlign: 'center', fontSize: 13, marginTop: 4 }]}>
                      Please load the raw Excel data containing sheets named after districts in this division.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={[styles.selectedStationBanner, { marginBottom: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dropdownLabel}>Selected District</Text>
                <Text style={styles.selectedWellName}>{selectedDistrict.toUpperCase()}</Text>
              </View>
              <TouchableOpacity 
                style={styles.changeStationBtn}
                onPress={() => {
                  setSelectedDistrict('ALL');
                  setSelectedBlock('ALL');
                  setSelectedWellId(null);
                  setIsNewSite(false);
                }}
              >
                <Text style={styles.changeStationText}>Change</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {/* Step 3: Block Selection */}
        {selectedDivision !== null && selectedDistrict !== 'ALL' && (
          selectedBlock === 'ALL' ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.dropdownLabel}>Select Block under {selectedDistrict}</Text>
              <View style={styles.verticalList}>
                {blocks.map(blk => (
                  <TouchableOpacity
                    key={blk}
                    style={styles.verticalListItem}
                    onPress={() => {
                      setSelectedBlock(blk);
                      setSelectedWellId(null);
                      setIsNewSite(false);
                    }}
                  >
                    <Text style={styles.verticalListItemText}>{blk.toUpperCase()}</Text>
                    <Text style={styles.verticalListItemSubtext}>➔</Text>
                  </TouchableOpacity>
                ))}
                {blocks.length === 0 && (
                  <Text style={styles.noStationsText}>No blocks found.</Text>
                )}
              </View>
            </View>
          ) : (
            <View style={[styles.selectedStationBanner, { marginBottom: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dropdownLabel}>Selected Block</Text>
                <Text style={styles.selectedWellName}>{selectedBlock.toUpperCase()}</Text>
              </View>
              <TouchableOpacity 
                style={styles.changeStationBtn}
                onPress={() => {
                  setSelectedBlock('ALL');
                  setSelectedWellId(null);
                  setIsNewSite(false);
                }}
              >
                <Text style={styles.changeStationText}>Change</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {/* Step 4: Station Selection */}
        {selectedDivision !== null && selectedDistrict !== 'ALL' && selectedBlock !== 'ALL' && !isNewSite && (
          selectedWellId === null ? (
            <View style={{ marginTop: 12 }}>
              <View style={styles.rowBetween}>
                <Text style={styles.dropdownLabel}>Select Station in {selectedBlock}</Text>
                <TouchableOpacity 
                  style={styles.addSiteMiniBtn}
                  onPress={startAddNewStation}
                >
                  <Text style={styles.addSiteMiniText}>➕ Add New Station</Text>
                </TouchableOpacity>
              </View>
              
              <TextInput
                style={styles.stationSearchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="🔍 Search station name or ID..."
                placeholderTextColor="#64748b"
              />

              <View style={styles.verticalList}>
                {filteredStations.map(well => (
                  <TouchableOpacity
                    key={well.well_number}
                    style={styles.verticalListItem}
                    onPress={() => {
                      setSelectedWellId(well.well_number);
                      setSearchQuery('');
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.verticalListItemText}>📍 {well.location}</Text>
                      <Text style={[styles.verticalListItemSubtext, { marginTop: 2 }]}>ID: {well.well_number}</Text>
                    </View>
                    <Text style={styles.verticalListItemSubtext}>➔</Text>
                  </TouchableOpacity>
                ))}
                {filteredStations.length === 0 && (
                  <Text style={styles.noStationsText}>No stations found under this block.</Text>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.selectedStationBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dropdownLabel}>Selected Station</Text>
                <Text style={styles.selectedWellName}>
                  📍 {wellsData.find(w => w.well_number === selectedWellId)?.location}
                </Text>
                <Text style={styles.selectedWellId}>ID: {selectedWellId}</Text>
              </View>
              <TouchableOpacity 
                style={styles.changeStationBtn}
                onPress={() => {
                  setSelectedWellId(null);
                  setSearchQuery('');
                }}
              >
                <Text style={styles.changeStationText}>Change</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {/* Editing status banner for New Site */}
        {isNewSite && (
          <View style={styles.newSiteBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.newSiteTitle}>➕ Adding New Offline Station</Text>
              <Text style={styles.newSiteSubtitle}>District: {selectedDistrict} | Block: {selectedBlock}</Text>
            </View>
            <TouchableOpacity 
              style={styles.cancelNewSiteBtn}
              onPress={() => {
                setIsNewSite(false);
                setSelectedWellId(null);
              }}
            >
              <Text style={styles.cancelNewSiteText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* GWRA Block Historical Data Section */}
      {selectedBlock !== 'ALL' && !selectedWellId && !isNewSite && (() => {
        const blockKey = selectedBlock.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const mappedKey = blockMapping[blockKey] || blockKey;
        const gwraInfo = gwraHistoricalData[mappedKey];
        
        if (!gwraInfo) return null;
        
        return (
          <View style={styles.gwraCard}>
            <Text style={styles.gwraCardTitle}>📊 {gwraInfo.block} Block GWRA Resource Data</Text>
            <Text style={styles.gwraCardSubtitle}>
              District: {gwraInfo.district} | Source: CGWB Assessment
            </Text>
            
            <View style={styles.gwraTable}>
              <View style={styles.gwraTableHeader}>
                <Text style={styles.gwraTableHeaderText}>Year</Text>
                <Text style={styles.gwraTableHeaderText}>Rainfall (mm)</Text>
                <Text style={styles.gwraTableHeaderText}>Pre-Mon (mbgl)</Text>
                <Text style={styles.gwraTableHeaderText}>Post-Mon (mbgl)</Text>
                <Text style={styles.gwraTableHeaderText}>Fluct (m)</Text>
              </View>
              
              {Object.keys(gwraInfo.years).sort().map((year, idx, arr) => {
                const yearData = gwraInfo.years[year];
                const isLast = idx === arr.length - 1;
                return (
                  <View key={year} style={[styles.gwraTableRow, isLast && styles.gwraTableRowLast]}>
                    <Text style={[styles.gwraTableCell, styles.gwraYearText]}>{year}</Text>
                    <Text style={styles.gwraTableCell}>
                      {yearData.rainfall !== null ? `${yearData.rainfall}` : '-'}
                    </Text>
                    <Text style={styles.gwraTableCell}>
                      {yearData.preMonsoon !== null ? `${yearData.preMonsoon}` : '-'}
                    </Text>
                    <Text style={styles.gwraTableCell}>
                      {yearData.postMonsoon !== null ? `${yearData.postMonsoon}` : '-'}
                    </Text>
                    <Text style={[styles.gwraTableCell, { color: yearData.fluctuation >= 0 ? '#10b981' : '#ef4444' }]}>
                      {yearData.fluctuation !== null ? `${yearData.fluctuation}` : '-'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })()}

      {/* Suggestion 4: Recent Activity Quick Selector */}
      {recentStations.length > 0 && !selectedWellId && !isNewSite && (
        <View style={styles.recentsPanel}>
          <Text style={styles.recentsTitle}>⏳ Recent Activity</Text>
          <View style={styles.recentsList}>
            {recentStations.map(recent => (
              <TouchableOpacity
                key={recent.well_number}
                style={styles.recentItem}
                onPress={() => loadRecentStation(recent)}
              >
                <Text style={styles.recentItemLoc} numberOfLines={1}>📍 {recent.location}</Text>
                <Text style={styles.recentItemId}>{recent.well_number} ({recent.block})</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Main Dynamic Form Panel */}
      {(selectedWellId || isNewSite) && (
        <View style={styles.formCard}>
          <Text style={styles.formCardTitle}>
            {isNewSite ? '📝 Station Creation Form' : '✏️ Station Measurement Form'}
          </Text>

          {/* District / Block read-only info */}
          <View style={styles.readOnlyBanner}>
            <Text style={styles.bannerInfoText}>District: {selectedDistrict}</Text>
            <Text style={styles.bannerInfoText}>Block: {selectedBlock}</Text>
          </View>

          {/* Suggestion 2: GPS Distance Finder Badge */}
          {currentWellDistance !== null && (
            <View style={[
              styles.distanceBadge,
              currentWellDistance < 50 ? styles.distGreen : (currentWellDistance < 500 ? styles.distYellow : styles.distRed)
            ]}>
              <Text style={styles.distanceBadgeText}>
                📍 Phone to Well Distance: {currentWellDistance.toFixed(1)} m 
                {currentWellDistance < 50 ? ' (Correct Location Verified)' : (currentWellDistance < 500 ? ' (Close Proximity)' : ' (Out of Range Warning)')}
              </Text>
            </View>
          )}

          {/* Form Fields */}
          <View style={styles.formRow}>
            <View style={[styles.inputBox, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.inputLabel}>Well Number / ID *</Text>
              <TextInput
                style={styles.textInput}
                value={wellNumber}
                onChangeText={setWellNumber}
                placeholder="e.g. 07M01DW002"
                placeholderTextColor="#64748b"
              />
            </View>
            <View style={[styles.inputBox, { width: 100 }]}>
              <Text style={styles.inputLabel}>Sl. No.</Text>
              <TextInput
                style={styles.textInput}
                value={slNo}
                onChangeText={setSlNo}
                placeholder="e.g. 1"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.inputBox}>
            <Text style={styles.inputLabel}>Location Name / Landmark *</Text>
            <TextInput
              style={[styles.textInput, { height: 60 }]}
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Gurudijhatia : Girl's High School"
              placeholderTextColor="#64748b"
              multiline
            />
          </View>

          <View style={styles.formRow}>
            <View style={[styles.inputBox, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.inputLabel}>Well Type</Text>
              <View style={styles.typeSelectorRow}>
                {['DW', 'BW', 'TW'].map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeBtn, wellType === type && styles.typeBtnActive]}
                    onPress={() => setWellType(type)}
                  >
                    <Text style={[styles.typeBtnText, wellType === type && styles.typeBtnTextActive]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={[styles.inputBox, { width: 130 }]}>
              <Text style={styles.inputLabel}>Total Depth (m)</Text>
              <TextInput
                style={styles.textInput}
                value={depth}
                onChangeText={setDepth}
                placeholder="Depth"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Coordinates (Editable for all sites) */}
          <View style={styles.formRow}>
            <View style={[styles.inputBox, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.inputLabel}>Latitude</Text>
              <TextInput
                style={styles.textInput}
                value={latitude}
                onChangeText={setLatitude}
                editable={true}
                placeholder="Lat"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.inputBox, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Longitude</Text>
              <TextInput
                style={styles.textInput}
                value={longitude}
                onChangeText={setLongitude}
                editable={true}
                placeholder="Lon"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* GPS Coordinates Fetch Button (Available for all selected sites) */}
          {(isNewSite || selectedWellId) && (
            <TouchableOpacity 
              style={styles.fetchGpsBtn}
              onPress={handleFetchGPS}
              disabled={gpsLoading}
            >
              {gpsLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.fetchGpsText}>🛰️ Fetch Current GPS & MSL</Text>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.divider} />

          {/* Season Selector Dropdown Option */}
          <View style={styles.inputBox}>
            <Text style={styles.inputLabel}>Season of Observation</Text>
            <View style={styles.seasonSelectorRow}>
              {seasons.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.seasonBtn, season === s && styles.seasonBtnActive]}
                  onPress={() => setSeason(s)}
                >
                  <Text style={[styles.seasonBtnText, season === s && styles.seasonBtnTextActive]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Measurement Fields */}
          <View style={styles.formRow}>
            <View style={[styles.inputBox, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.inputLabel}>Height of Parapet (m)</Text>
              <TextInput
                style={styles.textInput}
                value={parapet}
                onChangeText={setParapet}
                placeholder="0.00"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
              />
            </View>
            
            {/* Calendar Date Picker */}
            <View style={[styles.inputBox, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Date of Visit (dd.mm.yyyy)</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.datePickerAnchor}>
                <View pointerEvents="none">
                  <TextInput
                    style={styles.textInput}
                    value={date}
                    placeholder="dd.mm.yyyy"
                    placeholderTextColor="#64748b"
                    editable={false}
                  />
                </View>
                <Text style={styles.calendarIcon}>📅</Text>
              </TouchableOpacity>
              
              {showDatePicker && (
                <DateTimePicker
                  value={dateObject}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onChangeDate}
                />
              )}
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={[styles.inputBox, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.inputLabel}>DTGWL [BMP] (m)</Text>
              <TextInput
                style={styles.textInput}
                value={bmp}
                onChangeText={setBmp}
                placeholder="e.g. 6.80"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.inputBox, { flex: 1 }]}>
              <Text style={styles.inputLabel}>DTGWL [MBGL] (m)</Text>
              <TextInput
                style={styles.textInput}
                value={mbgl}
                onChangeText={setMbgl}
                placeholder="e.g. 6.35"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Elevation / MSL Field and Live Reduced Level (RL) */}
          <View style={styles.formRow}>
            <View style={[styles.inputBox, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.inputLabel}>MSL Ground Elevation (m)</Text>
              <TextInput
                style={styles.textInput}
                value={msl}
                onChangeText={setMsl}
                placeholder="e.g. 15.30"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.inputBox, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Calculated RL (m)</Text>
              <TextInput
                style={[styles.textInput, styles.textInputLocked, { fontWeight: '700', color: '#10b981' }]}
                value={rl}
                editable={false}
                placeholder="Auto-calculated"
                placeholderTextColor="#64748b"
              />
            </View>
          </View>

          {/* Auto Altimeter Fetch Button */}
          <TouchableOpacity 
            style={styles.altimeterFetchBtn}
            onPress={handleFetchAltimeter}
            disabled={altimeterLoading}
          >
            {altimeterLoading ? (
              <ActivityIndicator size="small" color={isDark ? '#38bdf8' : '#0284c7'} />
            ) : (
              <Text style={styles.altimeterFetchText}>🛰️ Auto-Fetch MSL Ground Elevation</Text>
            )}
          </TouchableOpacity>

          <View style={styles.inputBox}>
            <Text style={styles.inputLabel}>Remarks / Remarks Context</Text>
            <TextInput
              style={[styles.textInput, { height: 60 }]}
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Active, closed, dry, etc..."
              placeholderTextColor="#64748b"
              multiline
            />
          </View>

          {/* Comments Section */}
          <View style={styles.inputBox}>
            <Text style={styles.inputLabel}>Comments</Text>
            <TextInput
              style={[styles.textInput, { height: 60 }]}
              value={comment}
              onChangeText={setComment}
              placeholder="Enter any additional comments here..."
              placeholderTextColor="#64748b"
              multiline
            />
          </View>

          {/* Camera snap UI and Suggestion 3: Watermark Overlay */}
          <Text style={styles.inputLabel}>Site Photo (Offline Capture)</Text>
          <View style={styles.photoContainer}>
            {photoUrl ? (
              <View style={styles.photoFrame}>
                <View style={styles.photoWrapper}>
                  <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
                  
                  {/* Visual Watermark Overlay */}
                  <View style={styles.watermarkOverlay}>
                    <Text style={styles.watermarkTextBold}>Well ID: {wellNumber || 'New Well'}</Text>
                    <Text style={styles.watermarkText}>Date: {date || '-'} | Season: {season}</Text>
                    {latitude && longitude ? (
                      <Text style={styles.watermarkText}>Lat: {latitude} | Lon: {longitude}</Text>
                    ) : null}
                    <Text style={styles.watermarkText}>DTGWL (BMP): {bmp || '0.00'} m | RL: {rl || '0.00'} m</Text>
                  </View>
                </View>
                
                <TouchableOpacity 
                  style={styles.removePhotoBtn}
                  onPress={() => setPhotoUrl('')}
                >
                  <Text style={styles.removePhotoText}>✕ Delete Photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.photoButtonsRow}>
                <TouchableOpacity style={styles.photoBtn} onPress={handleTakePhoto}>
                  <Text style={styles.photoBtnIcon}>📷</Text>
                  <Text style={styles.photoBtnText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={handlePickPhoto}>
                  <Text style={styles.photoBtnIcon}>🖼️</Text>
                  <Text style={styles.photoBtnText}>Gallery</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Save Action */}
          <TouchableOpacity 
            style={styles.saveFormBtn}
            onPress={handleSaveForm}
          >
            <Text style={styles.saveFormBtnText}>💾 Save Station Details Offline</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Dedicated GWRA Database Section */}
      <View style={styles.gwraSectionCard}>
        <Text style={styles.gwraSectionTitle}>📚 Ground Water Resource Assessment (GWRA) Database</Text>
        <Text style={styles.gwraSectionDesc}>
          Explore block-wise resource metrics from CGWB assessment sheets.
        </Text>

        <View style={styles.gwraDropdownRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.gwraDropdownLabel}>District</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gwraPillScroller}>
              {gwraDistricts.map(dist => {
                const isSelected = gwraViewDistrict === dist;
                return (
                  <TouchableOpacity
                    key={dist}
                    style={[styles.gwraViewPill, isSelected && styles.gwraViewPillActive]}
                    onPress={() => setGwraViewDistrict(dist)}
                  >
                    <Text style={[styles.gwraViewPillText, isSelected && styles.gwraViewPillTextActive]}>
                      {dist}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>

        <View style={[styles.gwraDropdownRow, { marginTop: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.gwraDropdownLabel}>Block / Assessment Unit</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gwraPillScroller}>
              {gwraBlocksForDistrict.map(blk => {
                const isSelected = gwraViewBlock === blk;
                return (
                  <TouchableOpacity
                    key={blk}
                    style={[styles.gwraViewPill, isSelected && styles.gwraViewPillActive]}
                    onPress={() => setGwraViewBlock(blk)}
                  >
                    <Text style={[styles.gwraViewPillText, isSelected && styles.gwraViewPillTextActive]}>
                      {blk}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* Display data for selected Block */}
        {(() => {
          const blockKey = gwraViewBlock.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const mappedKey = blockMapping[blockKey] || blockKey;
          const gwraInfo = gwraHistoricalData[mappedKey];

          if (!gwraInfo) {
            return (
              <Text style={{ color: colors.textSecondary, fontStyle: 'italic', marginTop: 12, textAlign: 'center' }}>
                No resource data found for {gwraViewBlock}.
              </Text>
            );
          }

          return (
            <View style={{ marginTop: 16 }}>
              <View style={styles.gwraTable}>
                <View style={styles.gwraTableHeader}>
                  <Text style={styles.gwraTableHeaderText}>Year</Text>
                  <Text style={styles.gwraTableHeaderText}>Rainfall (mm)</Text>
                  <Text style={styles.gwraTableHeaderText}>Pre-Mon (mbgl)</Text>
                  <Text style={styles.gwraTableHeaderText}>Post-Mon (mbgl)</Text>
                  <Text style={styles.gwraTableHeaderText}>Fluct (m)</Text>
                </View>

                {Object.keys(gwraInfo.years).sort().map((year, idx, arr) => {
                  const yearData = gwraInfo.years[year];
                  const isLast = idx === arr.length - 1;
                  return (
                    <View key={year} style={[styles.gwraTableRow, isLast && styles.gwraTableRowLast]}>
                      <Text style={[styles.gwraTableCell, styles.gwraYearText]}>{year}</Text>
                      <Text style={styles.gwraTableCell}>
                        {yearData.rainfall !== null ? `${yearData.rainfall}` : '-'}
                      </Text>
                      <Text style={styles.gwraTableCell}>
                        {yearData.preMonsoon !== null ? `${yearData.preMonsoon}` : '-'}
                      </Text>
                      <Text style={styles.gwraTableCell}>
                        {yearData.postMonsoon !== null ? `${yearData.postMonsoon}` : '-'}
                      </Text>
                      <Text style={[styles.gwraTableCell, { color: yearData.fluctuation >= 0 ? '#10b981' : '#ef4444' }]}>
                        {yearData.fluctuation !== null ? `${yearData.fluctuation}` : '-'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })()}
      </View>

      {/* Credits Footer */}
      <View style={styles.creditsFooter}>
        <Text style={styles.creditsText}>Developed by ssd_dev</Text>
      </View>

      {/* ScrollView bottom spacer */}
      <View style={{ height: 20 }} />

      </ScrollView>

      {/* MSL batch fetching progress modal */}
      {mslFetching && (
        <Modal
          visible={mslFetching}
          transparent={true}
          animationType="fade"
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}>
            <View style={{
              backgroundColor: isDark ? '#1e293b' : '#ffffff',
              padding: 24,
              borderRadius: 16,
              alignItems: 'center',
              width: '85%',
              borderWidth: 1.5,
              borderColor: isDark ? '#334155' : '#e2e8f0',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 10
            }}>
              <ActivityIndicator size="large" color="#38bdf8" style={{ marginBottom: 16 }} />
              <Text style={{
                color: isDark ? '#f8fafc' : '#0f172a',
                fontSize: 16,
                fontWeight: 'bold',
                marginBottom: 8,
                textAlign: 'center'
              }}>
                Fetching MSL Elevations
              </Text>
              <Text style={{
                color: isDark ? '#94a3b8' : '#64748b',
                fontSize: 14,
                textAlign: 'center',
                lineHeight: 20
              }}>
                {mslFetchProgress}
              </Text>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const getStyles = (theme) => {
  const isDark = theme === 'dark';
  const colors = {
    bgApp: isDark ? '#080d16' : '#f1f5f9',
    bgCard: isDark ? '#0f172a' : '#ffffff',
    borderColor: isDark ? '#1e293b' : '#e2e8f0',
    textPrimary: isDark ? '#f8fafc' : '#0f172a',
    textSecondary: isDark ? '#94a3b8' : '#475569',
    bgInput: isDark ? '#080d16' : '#f8fafc',
    borderInput: isDark ? '#1e293b' : '#cbd5e1',
    bgInputLocked: isDark ? 'rgba(8, 13, 22, 0.6)' : 'rgba(241, 245, 249, 0.6)',
    borderInputLocked: isDark ? '#0f172a' : '#e2e8f0',
    textInputLocked: isDark ? '#64748b' : '#94a3b8',
  };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgApp,
    },
    content: {
      padding: 16,
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingBottom: 40,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
      borderBottomWidth: 1.5,
      borderBottomColor: colors.borderColor,
      paddingBottom: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: '900',
      color: colors.textPrimary,
      letterSpacing: -0.8,
    },
    subHeader: {
      fontSize: 16,
      color: colors.textSecondary,
      marginTop: -1,
      fontWeight: '600',
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(2, 132, 199, 0.08)',
      borderWidth: 1.5,
      borderColor: isDark ? '#38bdf8' : '#0284c7',
      paddingVertical: 4,
      paddingHorizontal: 12,
      borderRadius: 20,
    },
    badgeEmoji: {
      fontSize: 14,
      marginRight: 6,
      marginTop: -1,
    },
    badgeText: {
      color: isDark ? '#38bdf8' : '#0284c7',
      fontSize: 13,
      fontWeight: '800',
    },
    statsToggleHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bgCard,
      borderWidth: 1.5,
      borderColor: colors.borderColor,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    toggleArrow: {
      color: '#38bdf8',
      fontSize: 15,
      fontWeight: '700',
    },
    statsWrapper: {
      marginBottom: 16,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    card: {
      width: '48%',
      backgroundColor: colors.bgCard,
      borderWidth: 1.5,
      borderColor: colors.borderColor,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 14,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: 8,
      elevation: 4,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    cardIconBg: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardIcon: {
      fontSize: 14,
    },
    cardTotal: {
      borderLeftWidth: 4,
      borderLeftColor: '#6366f1',
    },
    cardActive: {
      borderLeftWidth: 4,
      borderLeftColor: '#38bdf8',
    },
    cardMonitored: {
      borderLeftWidth: 4,
      borderLeftColor: '#10b981',
    },
    cardPending: {
      borderLeftWidth: 4,
      borderLeftColor: '#f59e0b',
    },
    cardLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    cardVal: {
      fontSize: 26,
      fontWeight: '900',
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    percentText: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 3,
      fontWeight: '700',
    },
    selectorCard: {
      backgroundColor: colors.bgCard,
      borderWidth: 1.5,
      borderColor: colors.borderColor,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 16,
      elevation: 6,
    },
    selectorCardTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 14,
    },
    dropdownLabel: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    verticalList: {
      marginTop: 8,
    },
    verticalListItem: {
      backgroundColor: colors.bgInput,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    verticalListItemActive: {
      borderColor: '#0284c7',
      backgroundColor: isDark ? 'rgba(2, 132, 199, 0.12)' : 'rgba(2, 132, 199, 0.08)',
    },
    verticalListItemText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    verticalListItemSubtext: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    pillScroller: {
      marginBottom: 10,
    },
    pill: {
      backgroundColor: colors.bgInput,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      borderRadius: 20,
      paddingVertical: 8,
      paddingHorizontal: 14,
      marginRight: 8,
    },
    pillActive: {
      backgroundColor: '#0284c7',
      borderColor: '#38bdf8',
    },
    pillText: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: '700',
    },
    pillTextActive: {
      color: '#ffffff',
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    addSiteMiniBtn: {
      backgroundColor: isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(2, 132, 199, 0.08)',
      borderColor: '#38bdf8',
      borderWidth: 1.5,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 8,
    },
    addSiteMiniText: {
      color: isDark ? '#38bdf8' : '#0284c7',
      fontSize: 13,
      fontWeight: '800',
    },
    selectedStationBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(2, 132, 199, 0.12)' : 'rgba(2, 132, 199, 0.08)',
      borderWidth: 1.5,
      borderColor: '#0284c7',
      borderRadius: 10,
      padding: 12,
    },
    selectedWellName: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    selectedWellId: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    changeStationBtn: {
      backgroundColor: colors.bgInput,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    changeStationText: {
      color: '#38bdf8',
      fontSize: 14,
      fontWeight: '700',
    },
    stationSearchInput: {
      backgroundColor: colors.bgInput,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      fontSize: 16,
      marginBottom: 10,
    },
    suggestionsBox: {
      backgroundColor: colors.bgInput,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      maxHeight: 180,
    },
    suggestionRow: {
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    suggestionLoc: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '700',
    },
    suggestionId: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    noStationsText: {
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: 14,
      fontSize: 15,
      fontWeight: '600',
    },
    newSiteBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      borderWidth: 1.5,
      borderColor: '#f59e0b',
      borderRadius: 10,
      padding: 12,
    },
    newSiteTitle: {
      color: '#f59e0b',
      fontSize: 16,
      fontWeight: '800',
    },
    newSiteSubtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    cancelNewSiteBtn: {
      backgroundColor: colors.bgInput,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    cancelNewSiteText: {
      color: '#ef4444',
      fontSize: 14,
      fontWeight: '700',
    },
    recentsPanel: {
      backgroundColor: colors.bgCard,
      borderWidth: 1.5,
      borderColor: colors.borderColor,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
    },
    recentsTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 10,
    },
    recentsList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    recentItem: {
      backgroundColor: colors.bgInput,
      borderColor: colors.borderInput,
      borderWidth: 1.5,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      marginRight: 8,
      marginBottom: 8,
      maxWidth: '100%',
    },
    recentItemLoc: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    recentItemId: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
      marginTop: 1,
    },
    formCard: {
      backgroundColor: colors.bgCard,
      borderWidth: 1.5,
      borderColor: colors.borderColor,
      borderRadius: 18,
      padding: 18,
      marginBottom: 20,
    },
    formCardTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 14,
    },
    readOnlyBanner: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: colors.bgInput,
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.borderInput,
    },
    bannerInfoText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '700',
    },
    distanceBadge: {
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1.5,
    },
    distGreen: {
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      borderColor: '#10b981',
    },
    distYellow: {
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      borderColor: '#f59e0b',
    },
    distRed: {
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderColor: '#ef4444',
    },
    distanceBadgeText: {
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
    },
    formRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    inputBox: {
      marginBottom: 16,
    },
    inputLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    textInput: {
      backgroundColor: colors.bgInput,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      fontSize: 16,
    },
    textInputLocked: {
      backgroundColor: colors.bgInputLocked,
      color: colors.textInputLocked,
      borderColor: colors.borderInputLocked,
    },
    typeSelectorRow: {
      flexDirection: 'row',
      height: 42,
    },
    typeBtn: {
      flex: 1,
      backgroundColor: colors.bgInput,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 6,
    },
    typeBtnActive: {
      backgroundColor: '#0284c7',
      borderColor: '#38bdf8',
    },
    typeBtnText: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: '800',
    },
    typeBtnTextActive: {
      color: '#ffffff',
    },
    fetchGpsBtn: {
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      borderColor: '#10b981',
      borderWidth: 1.5,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 16,
    },
    fetchGpsText: {
      color: '#10b981',
      fontSize: 15,
      fontWeight: '700',
    },
    datePickerAnchor: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bgInput,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      borderRadius: 10,
      paddingRight: 12,
    },
    calendarIcon: {
      fontSize: 18,
      color: colors.textSecondary,
    },
    seasonSelectorRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    seasonBtn: {
      width: '48%',
      backgroundColor: colors.bgInput,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: 'center',
      marginBottom: 8,
    },
    seasonBtnActive: {
      backgroundColor: '#0284c7',
      borderColor: '#38bdf8',
    },
    seasonBtnText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '700',
    },
    seasonBtnTextActive: {
      color: '#ffffff',
    },
    divider: {
      height: 1.5,
      backgroundColor: colors.borderColor,
      marginVertical: 16,
    },
    photoContainer: {
      marginBottom: 20,
    },
    photoFrame: {
      backgroundColor: colors.bgInput,
      borderRadius: 12,
      padding: 10,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.borderInput,
    },
    photoWrapper: {
      position: 'relative',
      width: '100%',
      borderRadius: 8,
      overflow: 'hidden',
    },
    photoPreview: {
      width: '100%',
      height: 220,
    },
    watermarkOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(9, 13, 22, 0.75)',
      padding: 10,
    },
    watermarkTextBold: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '800',
    },
    watermarkText: {
      color: '#e2e8f0',
      fontSize: 12,
      fontWeight: '600',
      marginTop: 1,
    },
    removePhotoBtn: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderColor: '#ef4444',
      borderWidth: 1.5,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      marginTop: 10,
    },
    removePhotoText: {
      color: '#ef4444',
      fontSize: 14,
      fontWeight: '700',
    },
    photoButtonsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    photoBtn: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: colors.bgInput,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      borderRadius: 10,
      paddingVertical: 14,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 8,
    },
    photoBtnIcon: {
      fontSize: 18,
      marginRight: 6,
    },
    photoBtnText: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: '700',
    },
    saveFormBtn: {
      backgroundColor: '#0284c7',
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
      shadowColor: '#0284c7',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      elevation: 4,
    },
    saveFormBtnText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    panel: {
      backgroundColor: colors.bgCard,
      borderWidth: 1.5,
      borderColor: colors.borderColor,
      borderRadius: 18,
      marginBottom: 20,
      overflow: 'hidden',
    },
    panelTitle: {
      fontSize: 18,
      fontWeight: '850',
      color: colors.textPrimary,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.02)',
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    panelBody: {
      padding: 16,
      borderTopWidth: 1.5,
      borderTopColor: colors.borderColor,
    },
    exportDesc: {
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 19,
      marginBottom: 16,
      fontWeight: '500',
    },
    exportBtn: {
      backgroundColor: '#0284c7',
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 20,
      shadowColor: '#0284c7',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    exportBtnText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '700',
    },
    distExportTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 10,
    },
    distGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    distBtn: {
      width: '48%',
      backgroundColor: colors.bgInput,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: 'center',
      marginBottom: 10,
    },
    distBtnText: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    resetBtn: {
      alignItems: 'center',
      paddingVertical: 10,
    },
    resetBtnText: {
      color: '#ef4444',
      fontSize: 15,
      fontWeight: '700',
    },
    bannerImageContainer: {
      width: '100%',
      height: 160,
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 20,
      borderWidth: 1.5,
      borderColor: colors.borderColor,
    },
    bannerImage: {
      width: '100%',
      height: '100%',
    },
    districtSection: {
      marginBottom: 20,
    },
    districtSectionTitle: {
      fontSize: 18,
      fontWeight: '850',
      color: colors.textPrimary,
      marginBottom: 12,
    },
    districtGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    districtCard: {
      width: '48%',
      backgroundColor: colors.bgCard,
      borderWidth: 1.5,
      borderColor: colors.borderColor,
      borderRadius: 16,
      padding: 14,
      marginBottom: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    districtCardActive: {
      borderColor: '#0284c7',
      backgroundColor: isDark ? 'rgba(2, 132, 199, 0.08)' : 'rgba(2, 132, 199, 0.04)',
    },
    districtName: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 6,
    },
    districtAvgLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    districtAvgValue: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textPrimary,
      marginVertical: 2,
    },
    districtStatusBadge: {
      alignSelf: 'flex-start',
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 6,
      borderWidth: 1,
      marginTop: 6,
      marginBottom: 8,
    },
    districtStatusText: {
      fontSize: 11,
      fontWeight: '800',
    },
    districtRatioText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    // Drawer & Modal Export Styles
    menuBtn: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
      borderWidth: 1.5,
      borderColor: colors.borderColor,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuIcon: {
      fontSize: 22,
      color: colors.textPrimary,
    },
    menuOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      zIndex: 1000,
      justifyContent: 'flex-start',
    },
    menuDrawer: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      width: '75%',
      backgroundColor: colors.bgCard,
      borderRightWidth: 1.5,
      borderRightColor: colors.borderColor,
      padding: 20,
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      zIndex: 1001,
      shadowColor: '#000',
      shadowOffset: { width: 4, height: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 5,
      elevation: 5,
    },
    menuHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? '#1e293b' : '#0284c7',
      marginHorizontal: -20,
      marginTop: Platform.OS === 'ios' ? -60 : -40,
      paddingHorizontal: 20,
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingBottom: 16,
      marginBottom: 24,
    },
    menuDrawerTitle: {
      fontSize: 22,
      fontWeight: '900',
      color: '#ffffff',
    },
    menuCloseBtn: {
      padding: 6,
      borderRadius: 6,
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    menuCloseText: {
      fontSize: 16,
      color: '#ffffff',
      fontWeight: '700',
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
    },
    menuItemIcon: {
      fontSize: 20,
      marginRight: 12,
    },
    menuItemText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    menuDivider: {
      height: 1.5,
      backgroundColor: colors.borderColor,
      marginVertical: 16,
    },
    graspDialog: {
      backgroundColor: colors.bgCard,
      borderWidth: 1.5,
      borderColor: colors.borderColor,
      borderRadius: 18,
      padding: 20,
      width: '90%',
      maxHeight: '80%',
      alignSelf: 'center',
      marginTop: '20%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 10,
    },
    importDialog: {
      width: '90%',
      maxWidth: 400,
      maxHeight: '88%',
      marginTop: '6%',
    },
    graspDialogTitle: {
      fontSize: 20,
      fontWeight: '850',
      color: colors.textPrimary,
      marginBottom: 8,
      textAlign: 'center',
    },
    graspDialogDesc: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 16,
    },
    wttoModalScroll: {
      maxHeight: 320,
      flexGrow: 0,
    },
    wttoModalScrollContent: {
      paddingBottom: 8,
    },
    importModalScroll: {
      maxHeight: 500,
      flexGrow: 0,
    },
    importModalScrollContent: {
      paddingBottom: 8,
    },
    graspDistItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bgInput,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 10,
    },
    graspDistText: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    graspDistSub: {
      fontSize: 13,
      color: '#38bdf8',
      fontWeight: '700',
    },
    graspCloseBtn: {
      backgroundColor: colors.bgInput,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 10,
    },
    graspCloseBtnText: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
    creditsFooter: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 28,
      marginBottom: 4,
      paddingTop: 16,
      borderTopWidth: 1.5,
      borderTopColor: colors.borderColor,
    },
    creditsText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    activeSeasonBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.06)',
      borderWidth: 1.5,
      borderColor: '#38bdf8',
      borderRadius: 14,
      paddingVertical: 22,
      paddingHorizontal: 20,
      marginBottom: 20,
      overflow: 'hidden',
    },
    activeSeasonBannerLeft: {
      flex: 1,
      zIndex: 2, // Ensure text stays on top of particles
    },
    activeSeasonLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: '#38bdf8',
      letterSpacing: 1.5,
      marginBottom: 6,
    },
    activeSeasonValue: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    activeSeasonIcon: {
      fontSize: 38,
      marginLeft: 12,
      zIndex: 2,
    },
    gwraCard: {
      backgroundColor: colors.bgCard,
      borderWidth: 1.5,
      borderColor: colors.borderColor,
      borderRadius: 18,
      padding: 16,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.15 : 0.06,
      shadowRadius: 10,
      elevation: 3,
    },
    gwraCardTitle: {
      fontSize: 16,
      fontWeight: '850',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    gwraCardSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '600',
      marginBottom: 12,
    },
    gwraTable: {
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 10,
      overflow: 'hidden',
    },
    gwraTableHeader: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.06)',
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
      paddingVertical: 8,
    },
    gwraTableHeaderText: {
      flex: 1,
      fontSize: 11,
      fontWeight: '800',
      color: isDark ? '#38bdf8' : '#0284c7',
      textAlign: 'center',
    },
    gwraTableRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
      paddingVertical: 10,
      alignItems: 'center',
    },
    gwraTableRowLast: {
      borderBottomWidth: 0,
    },
    gwraTableCell: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    gwraYearText: {
      color: isDark ? '#38bdf8' : '#0284c7',
      fontWeight: '800',
    },
    altimeterFetchBtn: {
      backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.06)',
      borderColor: isDark ? '#38bdf8' : '#0284c7',
      borderWidth: 1.5,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 16,
      justifyContent: 'center',
    },
    altimeterFetchText: {
      color: isDark ? '#38bdf8' : '#0284c7',
      fontSize: 15,
      fontWeight: '700',
    },
    gwraSectionCard: {
      backgroundColor: colors.bgCard,
      borderWidth: 1.5,
      borderColor: colors.borderColor,
      borderRadius: 18,
      padding: 16,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.15 : 0.06,
      shadowRadius: 10,
      elevation: 3,
    },
    gwraSectionTitle: {
      fontSize: 16,
      fontWeight: '850',
      color: colors.textPrimary,
      marginBottom: 6,
    },
    gwraSectionDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
      lineHeight: 16,
      marginBottom: 16,
    },
    gwraDropdownRow: {
      flexDirection: 'row',
    },
    gwraDropdownLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    gwraPillScroller: {
      flexDirection: 'row',
    },
    gwraViewPill: {
      backgroundColor: colors.bgInput,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      borderRadius: 20,
      paddingVertical: 6,
      paddingHorizontal: 12,
      marginRight: 8,
      marginBottom: 4,
    },
    gwraViewPillActive: {
      backgroundColor: '#0284c7',
      borderColor: '#0284c7',
    },
    gwraViewPillText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },
    gwraViewPillTextActive: {
      color: '#ffffff',
    },
  });
};
