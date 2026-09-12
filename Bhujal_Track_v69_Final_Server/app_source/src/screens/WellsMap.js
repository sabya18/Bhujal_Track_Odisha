import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  TextInput,
  ScrollView,
  Dimensions,
  Platform,
  ActivityIndicator,
  Linking,
  Alert,
  TouchableNativeFeedback
} from 'react-native';
import { WebView } from 'react-native-webview';
import odishaDistrictsGeoJSON from '../data/odisha_districts_complete.json';
import { LEAFLET_CSS, LEAFLET_JS } from '../utils/leafletAssets';

export default function WellsMap({ 
  wellsData, 
  onRecordVisit, 
  onViewTrend,
  theme, 
  toggleTheme,
  selectedYear,
  setSelectedYear,
  selectedSeason,
  setSelectedSeason,
  wttoData = []
}) {
  const styles = getStyles(theme);
  const isDark = theme === 'dark';
  const [selectedWell, setSelectedWell] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [gisActive, setGisActive] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');
  const webviewRef = useRef(null);
  const [showDistrictWTTO, setShowDistrictWTTO] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [seasonDropdownOpen, setSeasonDropdownOpen] = useState(false);

  const getDistrictFromSheet = (sheet) => {
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

  const normalizeWellDistrict = (dist) => {
    if (!dist) return '';
    const s = dist.toLowerCase().trim();
    if (s.includes('kendrapara')) return s.includes('urban') ? 'kendrapara urban' : 'kendrapara';
    if (s.includes('cuttack')) return s.includes('urban') ? 'cuttack urban' : 'cuttack';
    if (s.includes('jajpur')) return s.includes('urban') ? 'jajpur urban' : 'jajpur';
    if (s.includes('jagatsinghpur') || s.includes('jagatsinghapur') || s.includes('jspur') || s.includes('jagatsingpur')) return 'jagatsinghpur';
    if (s.includes('bolangir') || s.includes('balangir')) return 'balangir';
    if (s.includes('bhubaneswar') || s.includes('khurda') || s.includes('khordha')) return 'khordha';
    if (s.includes('nawarangapur') || s.includes('nabarangapur') || s.includes('nabarangpur')) return 'nabarangpur';
    if (s.includes('debagarh') || s.includes('deogarh')) return 'deogarh';
    if (s.includes('baleshwar') || s.includes('balasore') || s.includes('balesore') || s.includes('baleswar')) return 'balasore';
    if (s.includes('kendujhar') || s.includes('keonjhar')) return 'keonjhar';
    return s.replace(/_blocks/g, '').replace(/_urban/g, '').trim();
  };

  const districtAverages = useMemo(() => {
    const seasonCode = selectedSeason === 'Winter' ? 'Winter' :
                       selectedSeason === 'Pre-Monsoon' ? 'PreMon' :
                       selectedSeason === 'Mid-Monsoon' ? 'MidMon' :
                       selectedSeason === 'Post-Monsoon' ? 'PostMon' : 'Winter';
    const seasonKey = `${selectedYear}_${seasonCode}`;

    const distMap = {};

    const addReading = (rawDist, val) => {
      if (!rawDist || val === null || val === undefined || isNaN(val) || val <= 0) return;
      const normalizedDist = normalizeWellDistrict(rawDist);
      if (!normalizedDist) return;
      if (!distMap[normalizedDist]) distMap[normalizedDist] = [];
      distMap[normalizedDist].push(val);
    };

    (wttoData || []).forEach(well => {
      const sheetName = well.sheet || '';
      const distName = getDistrictFromSheet(sheetName) || well.district;

      let val = null;
      if (well.history && well.history[seasonKey] !== undefined && !isNaN(parseFloat(well.history[seasonKey]))) {
        val = parseFloat(well.history[seasonKey]);
      } else if (well.history && well.history['2026_PreMon'] !== undefined && !isNaN(parseFloat(well.history['2026_PreMon']))) {
        val = parseFloat(well.history['2026_PreMon']);
      } else if (well.dtgwl_mbgl !== null && well.dtgwl_mbgl !== undefined && well.dtgwl_mbgl !== '' && !isNaN(parseFloat(well.dtgwl_mbgl))) {
        val = parseFloat(well.dtgwl_mbgl);
      }

      if (val !== null && val > 0) {
        addReading(distName, val);
      }
    });

    (wellsData || []).forEach(well => {
      if (well.dtgwl_mbgl !== null && well.dtgwl_mbgl !== undefined && well.dtgwl_mbgl !== '' && !isNaN(parseFloat(well.dtgwl_mbgl))) {
        const val = parseFloat(well.dtgwl_mbgl);
        if (val > 0) {
          const sheetName = well.sheet || '';
          const distName = getDistrictFromSheet(sheetName) || well.district || well.district_name;
          addReading(distName, val);
        }
      }
    });

    const averages = {};
    Object.keys(distMap).forEach(dist => {
      const arr = distMap[dist];
      if (arr.length > 0) {
        const sum = arr.reduce((a, b) => a + b, 0);
        averages[dist] = sum / arr.length;
      }
    });

    return averages;
  }, [wttoData, wellsData, selectedYear, selectedSeason]);

  const getWttoWellDataForSeason = (well, year, season) => {
    const seasonCode = season === 'Winter' ? 'Winter' :
                       season === 'Pre-Monsoon' ? 'PreMon' :
                       season === 'Mid-Monsoon' ? 'MidMon' :
                       season === 'Post-Monsoon' ? 'PostMon' : 'Winter';
    const seasonKey = `${year}_${seasonCode}`;
    
    const distName = getDistrictFromSheet(well.sheet);

    if (well.history && well.history[seasonKey] !== undefined && well.history[seasonKey] !== null) {
      const val = parseFloat(well.history[seasonKey]);
      if (!isNaN(val)) {
        const defaultDate = `15.${seasonCode === 'Winter' ? '01' : seasonCode === 'PreMon' ? '05' : seasonCode === 'MidMon' ? '08' : '11'}.${year}`;
        return {
          date: defaultDate,
          dtgwl_mbgl: val,
          dtgwl_bmp: val + (parseFloat(well.parapet_height) || 0)
        };
      }
    }
    return {
      date: well.date || null,
      dtgwl_mbgl: well.dtgwl_mbgl !== undefined ? parseFloat(well.dtgwl_mbgl) : null,
      dtgwl_bmp: well.dtgwl_bmp !== undefined ? parseFloat(well.dtgwl_bmp) : null
    };
  };

  const combinedWells = useMemo(() => {
    const map = new Map();
    
    wttoData.forEach(w => {
      if (w.well_number) {
        const seasonal = getWttoWellDataForSeason(w, selectedYear, selectedSeason);
        map.set(w.well_number, {
          ...w,
          date: seasonal.date,
          dtgwl_mbgl: seasonal.dtgwl_mbgl,
          dtgwl_bmp: seasonal.dtgwl_bmp,
          isWtto: true
        });
      }
    });
    
    wellsData.forEach(w => {
      if (w.well_number) {
        const existing = map.get(w.well_number);
        map.set(w.well_number, {
          ...existing,
          ...w,
          isWtto: false
        });
      }
    });
    
    return Array.from(map.values());
  }, [wellsData, wttoData, selectedYear, selectedSeason]);

  const uniqueDistricts = useMemo(() => {
    const districts = new Set();
    combinedWells.forEach(w => {
      const dist = getDistrictFromSheet(w.sheet);
      if (dist && dist !== 'Other') {
        districts.add(dist);
      }
    });
    const sorted = Array.from(districts).sort();
    return ['ALL', ...sorted];
  }, [combinedWells]);

  const validMapWells = useMemo(() => {
    return combinedWells.filter(well => {
      if (well.lat === null || well.lat === undefined || well.lon === null || well.lon === undefined) return false;
      const latNum = Number(well.lat);
      const lonNum = Number(well.lon);
      if (isNaN(latNum) || isNaN(lonNum)) return false;
      const inOdisha = (latNum >= 17.5 && latNum <= 23.0 && lonNum >= 81.0 && lonNum <= 88.0);
      if (!inOdisha) return false;

      if (selectedDistrict === 'ALL') return true;
      const dist = getDistrictFromSheet(well.sheet);
      return dist.toLowerCase() === selectedDistrict.toLowerCase();
    });
  }, [combinedWells, selectedDistrict]);

  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    
    return validMapWells.filter(well => {
      const idMatch = (well.well_number || '').toLowerCase().includes(q);
      const locMatch = (well.location || '').toLowerCase().includes(q);
      return idMatch || locMatch;
    }).slice(0, 5);
  }, [searchQuery, validMapWells]);

  const handleSelectSuggestion = (well) => {
    setSearchQuery('');
    if (webviewRef.current && well.lat && well.lon) {
      const latNum = Number(well.lat);
      const lonNum = Number(well.lon);
      if (!isNaN(latNum) && !isNaN(lonNum)) {
        webviewRef.current.postMessage(JSON.stringify({
          type: 'FOCUS_WELL',
          payload: { ...well, lat: latNum, lon: lonNum }
        }));
      }
    }
  };

  const mapHtml = useMemo(() => {
    const districtsGeojsonStr = JSON.stringify(odishaDistrictsGeoJSON).replace(/</g, '\u003c');
    const districtAveragesStr = JSON.stringify(districtAverages).replace(/</g, '\u003c');
    
    const trimmedWells = validMapWells.map(w => ({
      well_number: w.well_number,
      location: w.location,
      block: w.block,
      well_type: w.well_type,
      remarks: w.remarks,
      date: w.date,
      dtgwl_mbgl: w.dtgwl_mbgl,
      dtgwl_bmp: w.dtgwl_bmp,
      lat: Number(w.lat),
      lon: Number(w.lon),
      district: getDistrictFromSheet(w.sheet)
    }));
    const wellsJsonStr = JSON.stringify(trimmedWells).replace(/</g, '\u003c');

    const background = isDark ? '#0b0f19' : '#e2e8f0';
    const border = isDark ? '#f8fafc' : '#0f172a';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>${LEAFLET_CSS}</style>
        <style>
          body, html, #map { margin: 0; padding: 0; height: 100%; width: 100%; background-color: ${background}; }
          .map-legend-control {
            background-color: ${isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
            padding: 10px 12px;
            border: 1px solid ${isDark ? '#334155' : '#cbd5e1'};
            border-radius: 10px;
            color: ${isDark ? '#f8fafc' : '#0f172a'};
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 11px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            margin-right: 12px;
            margin-bottom: 12px;
          }
          .district-label { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
          .glowing-tooltip {
            background: ${isDark ? 'rgba(15,23,42,.95)' : 'rgba(255,255,255,.95)'};
            color: ${isDark ? '#f8fafc' : '#0f172a'};
            border: 1.5px solid ${border};
            border-radius: 6px;
            padding: 3px 6px;
            text-align: center;
            font: 700 10px system-ui;
            box-shadow: 0 2px 6px rgba(0,0,0,0.25);
          }
          .glowing-tooltip strong { display: block; font-size: 10px; color: ${isDark ? '#f8fafc' : '#0f172a'}; white-space: nowrap; }
          .glowing-tooltip .depth-val { font-size: 9px; font-weight: 600; opacity: 0.9; margin-top: 1px; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>${LEAFLET_JS}</script>
        <script>
          const wells = ${wellsJsonStr};
          const districtsGeoJSON = ${districtsGeojsonStr};
          const districtAverages = ${districtAveragesStr};
          const isDarkGlobal = ${isDark};
          const showDistrictWTTO = ${showDistrictWTTO};
          const showPins = ${showPins};
          const gisActive = ${gisActive};

          function getColorForDepth(depth) {
            if (depth === null || depth === undefined) return isDarkGlobal ? '#334155' : '#64748b';
            if (depth < 2.0) return '#0284c7';
            if (depth < 4.0) return '#10b981';
            if (depth < 6.0) return '#f59e0b';
            if (depth < 8.0) return '#f97316';
            return '#ef4444';
          }

          function normalizeGeoJSONDistrict(distName) {
            if (!distName) return '';
            const d = distName.toLowerCase().replace(/[\s_\.\-]+/g, '');
            if (d.includes('kendrapara')) return d.includes('urban') ? 'kendrapara urban' : 'kendrapara';
            if (d.includes('cuttack')) return d.includes('urban') ? 'cuttack urban' : 'cuttack';
            if (d.includes('jajpur')) return d.includes('urban') ? 'jajpur urban' : 'jajpur';
            if (d.includes('jagatsinghpur') || d.includes('jagatsinghapur') || d.includes('jspur')) return 'jagatsinghpur';
            if (d.includes('bolangir') || d.includes('balangir')) return 'balangir';
            if (d.includes('bhubaneswar') || d.includes('khurda') || d.includes('khordha')) return 'khordha';
            if (d.includes('nawarangapur') || d.includes('nabarangapur') || d.includes('nabarangpur')) return 'nabarangpur';
            if (d.includes('debagarh') || d.includes('deogarh')) return 'deogarh';
            if (d.includes('baleshwar') || d.includes('balasore')) return 'balasore';
            if (d.includes('kendujhar') || d.includes('keonjhar')) return 'keonjhar';
            return distName.toLowerCase().replace(/_blocks/g, '').replace(/_urban/g, '').trim();
          }

          const map = L.map('map', {
            preferCanvas: false,
            zoomControl: false,
            attributionControl: false,
            tap: false
          }).setView([20.5, 84.5], 7.0);

          if (gisActive) {
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
              maxZoom: 18
            }).addTo(map);
          } else {
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19
            }).addTo(map);
          }

          L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);

          // Add Legend Control (Lower Right Corner)
          const LegendControl = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd: function() {
              const div = L.DomUtil.create('div', 'map-legend-control');
              let html = '';
              
              if (showPins) {
                html += '<div style="font-weight:700; font-size:10px; margin-bottom:5px; letter-spacing:0.5px; text-transform:uppercase;">STATION STATUS</div>' +
                  '<div style="display:flex; align-items:center; margin-bottom:4px;"><span style="width:10px; height:10px; background:#10b981; border-radius:50%; border:1px solid #0f172a; margin-right:6px; display:inline-block;"></span>Monitored Station</div>' +
                  '<div style="display:flex; align-items:center; margin-bottom:4px;"><span style="width:10px; height:10px; background:#0284c7; border-radius:50%; border:1px solid #0f172a; margin-right:6px; display:inline-block;"></span>Unmonitored Station</div>' +
                  '<div style="display:flex; align-items:center; margin-bottom:6px;"><span style="width:10px; height:10px; background:#94a3b8; border-radius:50%; border:1px solid #0f172a; margin-right:6px; display:inline-block;"></span>Closed / Inactive</div>';
              }

              if (showDistrictWTTO) {
                if (showPins) {
                  html += '<div style="height:1px; background:' + (isDarkGlobal ? '#334155' : '#cbd5e1') + '; margin:6px 0;"></div>';
                }
                html += '<div style="font-weight:700; font-size:10px; margin-bottom:5px; letter-spacing:0.5px; text-transform:uppercase;">WATER TABLE DEPTH</div>' +
                  '<div style="display:flex; align-items:center; margin-bottom:3px;"><span style="width:12px; height:12px; background:#0284c7; border-radius:2px; margin-right:6px; display:inline-block;"></span>&lt; 2.0 m (Shallow)</div>' +
                  '<div style="display:flex; align-items:center; margin-bottom:3px;"><span style="width:12px; height:12px; background:#10b981; border-radius:2px; margin-right:6px; display:inline-block;"></span>2.0 - 4.0 m</div>' +
                  '<div style="display:flex; align-items:center; margin-bottom:3px;"><span style="width:12px; height:12px; background:#f59e0b; border-radius:2px; margin-right:6px; display:inline-block;"></span>4.0 - 6.0 m</div>' +
                  '<div style="display:flex; align-items:center; margin-bottom:3px;"><span style="width:12px; height:12px; background:#f97316; border-radius:2px; margin-right:6px; display:inline-block;"></span>6.0 - 8.0 m</div>' +
                  '<div style="display:flex; align-items:center;"><span style="width:12px; height:12px; background:#ef4444; border-radius:2px; margin-right:6px; display:inline-block;"></span>&gt; 8.0 m (Depleted)</div>';
              }

              div.innerHTML = html;
              return div;
            }
          });
          new LegendControl().addTo(map);

          const wttoLayerGroup = L.layerGroup().addTo(map);
          const markerLayer = L.layerGroup().addTo(map);
          const svgRenderer = L.svg({ padding: 0.5 });

          // Render persistent State Outer Perimeter Boundary Line
          if (districtsGeoJSON) {
            L.geoJSON(districtsGeoJSON, {
              style: {
                color: isDarkGlobal ? '#f8fafc' : '#000000',
                weight: 3.8,
                opacity: 0.9,
                fill: false,
                interactive: false
              }
            }).addTo(wttoLayerGroup);

            // Always render district boundary strokes even when choropleth is turned off
            if (!showDistrictWTTO) {
              L.geoJSON(districtsGeoJSON, {
                style: {
                  color: isDarkGlobal ? '#f8fafc' : '#0f172a',
                  weight: 2.2,
                  opacity: 0.95,
                  fill: false,
                  interactive: false
                }
              }).addTo(wttoLayerGroup);
            }
          }

          if (showDistrictWTTO && districtsGeoJSON) {
            const districtLayers = {};
            L.geoJSON(districtsGeoJSON, {
              style: function(feature) {
                const rawDistName = feature.properties.Dist_Name;
                const normDist = normalizeGeoJSONDistrict(rawDistName);
                let avgVal = districtAverages[normDist] !== undefined ? districtAverages[normDist] : null;
                const color = avgVal !== null ? getColorForDepth(avgVal) : (isDarkGlobal ? '#334155' : '#0284c7');
                return {
                  color: isDarkGlobal ? '#f8fafc' : '#0f172a',
                  weight: 2.4,
                  opacity: 1.0,
                  fillColor: color,
                  fillOpacity: 0.85
                };
              },
              onEachFeature: function(feature, layer) {
                const rawDistName = feature.properties.Dist_Name;
                const normDist = normalizeGeoJSONDistrict(rawDistName);
                if (!districtLayers[normDist]) districtLayers[normDist] = [];
                districtLayers[normDist].push(layer);

                let avgVal = districtAverages[normDist] !== undefined ? districtAverages[normDist] : null;
                let popupContent = '<div style="font-family: system-ui; font-size: 11px;"><strong>District:</strong> ' + rawDistName + '<br/>';
                popupContent += '<strong>Avg Water Level Depth:</strong> ' + (avgVal !== null ? avgVal.toFixed(2) + ' m' : 'No Data') + '</div>';
                layer.bindPopup(popupContent);
              }
            }).addTo(wttoLayerGroup);

            Object.keys(districtLayers).forEach(key => {
              const layers = districtLayers[key];
              const group = L.featureGroup(layers);
              const center = group.getBounds().getCenter();
              const rawDistName = layers[0].feature.properties.Dist_Name;
              const normDist = normalizeGeoJSONDistrict(rawDistName);
              let avgVal = districtAverages[normDist] !== undefined ? districtAverages[normDist] : null;
              
              let tooltipContent = '<div class="glowing-tooltip"><strong>' + rawDistName + '</strong>';
              if (avgVal !== null) {
                tooltipContent += '<div class="depth-val">' + avgVal.toFixed(2) + ' m</div>';
              }
              tooltipContent += '</div>';

              const tooltip = L.tooltip({ permanent: true, direction: 'center', className: 'district-label', interactive: true })
                .setLatLng(center)
                .setContent(tooltipContent);
              wttoLayerGroup.addLayer(tooltip);
            });
          }

          // Station Markers
          if (showPins) {
            wells.forEach(well => {
              if (!well.lat || !well.lon || isNaN(well.lat) || isNaN(well.lon)) return;
              const rem = (well.remarks || '').toLowerCase();
              const active = !rem.includes('inactive') && !rem.includes('closed');
              const hasVisit = well.date !== null && well.date !== '';
              let color = !active ? '#94a3b8' : hasVisit ? '#10b981' : '#0284c7';

              const circle = L.circleMarker([well.lat, well.lon], {
                renderer: svgRenderer,
                radius: 5,
                fillColor: color,
                color: isDarkGlobal ? '#0f172a' : '#ffffff',
                weight: 1.5,
                fillOpacity: 0.95
              });

              circle.on('click', (e) => {
                if (e && e.originalEvent) L.DomEvent.stopPropagation(e);
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'SELECT_WELL',
                    payload: well
                  }));
                } else if (window.parent) {
                  window.parent.postMessage(JSON.stringify({
                    type: 'SELECT_WELL',
                    payload: well
                  }), '*');
                }
              });

              markerLayer.addLayer(circle);
            });
          }

          function handleMessage(e) {
            try {
              const msg = JSON.parse(e.data);
              if (msg.type === 'ZOOM_IN') map.zoomIn();
              else if (msg.type === 'ZOOM_OUT') map.zoomOut();
              else if (msg.type === 'FOCUS_WELL') {
                if (msg.payload && msg.payload.lat && msg.payload.lon) {
                  map.setView([msg.payload.lat, msg.payload.lon], 14);
                }
              }
            } catch(err) {}
          }
          window.addEventListener('message', handleMessage);
          document.addEventListener('message', handleMessage);
        </script>
      </body>
      </html>
    `;
  }, [validMapWells, districtAverages, showDistrictWTTO, showPins, gisActive, isDark]);

  const handleMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'SELECT_WELL') {
        setSelectedWell(message.payload);
      }
    } catch (err) {}
  };

  return (
    <View style={styles.container} collapsable={false}>
      <View style={{ flex: 1, position: 'relative' }} collapsable={false}>
        <WebView
          ref={webviewRef}
          originWhitelist={['*']}
          source={{ html: mapHtml, baseUrl: Platform.OS === 'android' ? 'file:///android_asset/' : '' }}
          style={styles.map}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          androidLayerType="software"
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
          allowingReadAccessToURL="*"
        />
        <View style={styles.zoomControlsContainer}>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => webviewRef.current?.postMessage(JSON.stringify({ type: 'ZOOM_IN' }))} activeOpacity={0.7}>
            <Text style={styles.zoomBtnText}>+</Text>
          </TouchableOpacity>
          <View style={styles.zoomDivider} />
          <TouchableOpacity style={styles.zoomBtn} onPress={() => webviewRef.current?.postMessage(JSON.stringify({ type: 'ZOOM_OUT' }))} activeOpacity={0.7}>
            <Text style={styles.zoomBtnText}>−</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Top Controls Overlay */}
      <View style={styles.searchContainer} collapsable={false}>
        {/* Search Bar Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput
            style={[styles.searchInput, { flex: 1, marginRight: 6 }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="🔍 Search Station"
            placeholderTextColor={isDark ? "#94a3b8" : "#64748b"}
          />
          <TouchableOpacity 
            style={[styles.topIconBtn, gisActive && styles.topIconBtnActive]} 
            onPress={() => setGisActive(!gisActive)}
          >
            <Text style={{ fontSize: 16 }}>🗺️</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.topIconBtn, showPins && styles.topIconBtnActive]} 
            onPress={() => setShowPins(!showPins)}
          >
            <Text style={{ fontSize: 16 }}>📌</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.topIconBtn} 
            onPress={toggleTheme}
          >
            <Text style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
        </View>

        {/* Overlay Control Stack (Left Column) */}
        <View style={{ width: 170, marginTop: 8, zIndex: 90 }}>
          {/* District Dropdown Pill */}
          <TouchableOpacity 
            style={styles.controlPill}
            onPress={() => {
              setDropdownOpen(!dropdownOpen);
              setYearDropdownOpen(false);
              setSeasonDropdownOpen(false);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.controlPillText} numberOfLines={1}>
              📍 District: {selectedDistrict === 'ALL' ? 'ALL' : selectedDistrict}
            </Text>
            <Text style={styles.controlPillArrow}>{dropdownOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {/* Water Map Toggle Pill */}
          <TouchableOpacity 
            style={[styles.controlPill, showDistrictWTTO && styles.controlPillActiveTeal]}
            onPress={() => setShowDistrictWTTO(!showDistrictWTTO)}
            activeOpacity={0.8}
          >
            <Text style={[styles.controlPillText, showDistrictWTTO && { color: '#ffffff', fontWeight: 'bold' }]} numberOfLines={1}>
              📊 Water Map: {showDistrictWTTO ? 'On' : 'Off'}
            </Text>
          </TouchableOpacity>

          {/* Year Dropdown Pill */}
          <TouchableOpacity 
            style={styles.controlPill}
            onPress={() => {
              setYearDropdownOpen(!yearDropdownOpen);
              setDropdownOpen(false);
              setSeasonDropdownOpen(false);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.controlPillText} numberOfLines={1}>
              📅 Year: {selectedYear}
            </Text>
            <Text style={styles.controlPillArrow}>{yearDropdownOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {/* Season Dropdown Pill */}
          <TouchableOpacity 
            style={styles.controlPill}
            onPress={() => {
              setSeasonDropdownOpen(!seasonDropdownOpen);
              setDropdownOpen(false);
              setYearDropdownOpen(false);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.controlPillText} numberOfLines={1}>
              🌦️ {selectedSeason}
            </Text>
            <Text style={styles.controlPillArrow}>{seasonDropdownOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
        </View>

        {/* Search Suggestions */}
        {searchSuggestions.length > 0 && (
          <View style={styles.suggestionsBox}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {searchSuggestions.map(well => (
                <TouchableOpacity
                  key={well.well_number}
                  style={styles.suggestionRow}
                  onPress={() => handleSelectSuggestion(well)}
                >
                  <Text style={styles.suggestionLoc} numberOfLines={1}>📍 {well.location}</Text>
                  <Text style={styles.suggestionId}>ID: {well.well_number} ({well.block})</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Dropdown Options Absolute Overlay */}
      {dropdownOpen && (
        <View style={[styles.dropdownOverlay, { top: Platform.OS === 'ios' ? 104 : 100 }]}>
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
            {uniqueDistricts.map((dist) => (
              <TouchableOpacity
                key={dist}
                style={[styles.dropdownItem, selectedDistrict === dist && styles.dropdownItemActive]}
                onPress={() => {
                  setSelectedDistrict(dist);
                  setDropdownOpen(false);
                }}
              >
                <Text style={[styles.dropdownItemText, selectedDistrict === dist && styles.dropdownItemTextActive]}>
                  {dist}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {yearDropdownOpen && (
        <View style={[styles.dropdownOverlay, { top: Platform.OS === 'ios' ? 180 : 176 }]}>
          <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
            {[2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => (
              <TouchableOpacity
                key={y}
                style={[styles.dropdownItem, selectedYear === y && styles.dropdownItemActive]}
                onPress={() => {
                  setSelectedYear(y);
                  setYearDropdownOpen(false);
                }}
              >
                <Text style={[styles.dropdownItemText, selectedYear === y && styles.dropdownItemTextActive]}>
                  {y}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {seasonDropdownOpen && (
        <View style={[styles.dropdownOverlay, { top: Platform.OS === 'ios' ? 222 : 218 }]}>
          <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
            {['Winter', 'Pre-Monsoon', 'Mid-Monsoon', 'Post-Monsoon'].map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.dropdownItem, selectedSeason === s && styles.dropdownItemActive]}
                onPress={() => {
                  setSelectedSeason(s);
                  setSeasonDropdownOpen(false);
                }}
              >
                <Text style={[styles.dropdownItemText, selectedSeason === s && styles.dropdownItemTextActive]}>
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Bottom Drawer */}
      {selectedWell && (
        <View style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>{selectedWell.well_number}</Text>
            <TouchableOpacity onPress={() => setSelectedWell(null)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.drawerBody}>
            <Text style={styles.drawerLocation} numberOfLines={2}>
              📍 {selectedWell.location}
            </Text>
            
            <View style={styles.drawerRow}>
              <Text style={styles.drawerLabel}>Block: <Text style={styles.drawerValue}>{selectedWell.block || '-'}</Text></Text>
              <Text style={styles.drawerLabel}>Well Type: <Text style={[styles.drawerValue, styles.highlightText]}>{selectedWell.well_type}</Text></Text>
            </View>
            
            <View style={styles.drawerRow}>
              <Text style={styles.drawerLabel}>Recorded Visit: <Text style={styles.drawerValue}>{selectedWell.date || 'Pending'}</Text></Text>
              {selectedWell.dtgwl_bmp !== null && selectedWell.dtgwl_bmp !== undefined && (
                <Text style={styles.drawerLabel}>BMP: <Text style={styles.drawerValue}>{selectedWell.dtgwl_bmp} m</Text></Text>
              )}
            </View>

            {selectedWell.lat !== null && selectedWell.lon !== null && (
              <View style={styles.drawerRow}>
                <Text style={styles.drawerLabel}>Latitude: <Text style={styles.drawerValue}>{Number(selectedWell.lat).toFixed(5)}</Text></Text>
                <Text style={styles.drawerLabel}>Longitude: <Text style={styles.drawerValue}>{Number(selectedWell.lon).toFixed(5)}</Text></Text>
              </View>
            )}

            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#3b82f6', shadowColor: '#3b82f6', marginTop: 12, marginBottom: 2 }]}
              onPress={() => onViewTrend && onViewTrend(selectedWell)}
            >
              <Text style={styles.actionBtnText}>📊 View Trend Chart</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
              <TouchableOpacity 
                style={[styles.actionBtn, { flex: 1, marginRight: 8, marginTop: 0 }]}
                onPress={() => {
                  onRecordVisit(selectedWell);
                  setSelectedWell(null);
                }}
              >
                <Text style={styles.actionBtnText}>✏️ Record Visit</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.actionBtn, { flex: 1, backgroundColor: '#059669', shadowColor: '#059669', marginTop: 0 }]}
                onPress={() => {
                  const lat = Number(selectedWell.lat);
                  const lon = Number(selectedWell.lon);
                  const label = selectedWell.location || selectedWell.well_number;
                  const url = Platform.select({
                    ios: `maps:0,0?q=${lat},${lon}(${label})`,
                    android: `geo:0,0?q=${lat},${lon}(${label})`
                  }) || `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
                  
                  Linking.openURL(url).catch(err => {
                    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`);
                  });
                }}
              >
                <Text style={styles.actionBtnText}>🚗 Navigate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const getStyles = (theme) => {
  const isDark = theme === 'dark';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#080d16' : '#f1f5f9' },
    map: { flex: 1 },
    zoomControlsContainer: {
      position: 'absolute',
      right: 12,
      top: 180,
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#334155' : '#cbd5e1',
      elevation: 6,
      zIndex: 50
    },
    zoomBtn: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
    zoomBtnText: { fontSize: 22, fontWeight: '600', color: isDark ? '#f8fafc' : '#0f172a' },
    zoomDivider: { height: 1, backgroundColor: isDark ? '#334155' : '#e2e8f0' },
    searchContainer: {
      position: 'absolute',
      top: 12,
      left: 12,
      right: 12,
      zIndex: 100
    },
    searchInput: {
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      color: isDark ? '#f8fafc' : '#0f172a',
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 44,
      fontSize: 14,
      borderWidth: 1,
      borderColor: isDark ? '#334155' : '#cbd5e1',
      elevation: 4
    },
    topIconBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      justify: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#334155' : '#cbd5e1',
      elevation: 4,
      marginLeft: 4
    },
    topIconBtnActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
    controlPill: {
      flexDirection: 'row',
      alignItems: 'center',
      justify: 'space-between',
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      height: 36,
      paddingHorizontal: 12,
      borderRadius: 10,
      marginBottom: 6,
      borderWidth: 1,
      borderColor: isDark ? '#334155' : '#cbd5e1',
      elevation: 4
    },
    controlPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#f8fafc' : '#0f172a',
      flex: 1
    },
    controlPillArrow: {
      fontSize: 10,
      color: isDark ? '#94a3b8' : '#64748b',
      marginLeft: 4
    },
    controlPillActiveTeal: { backgroundColor: '#0d9488', borderColor: '#0f766e' },
    dropdownOverlay: {
      position: 'absolute',
      left: 12,
      width: 170,
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? '#334155' : '#cbd5e1',
      elevation: 10,
      zIndex: 200,
      paddingVertical: 4
    },
    dropdownItem: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#334155' : '#f1f5f9'
    },
    dropdownItemActive: { backgroundColor: isDark ? '#0284c7' : '#e0f2fe' },
    dropdownItemText: { fontSize: 12, color: isDark ? '#f8fafc' : '#0f172a' },
    dropdownItemTextActive: { fontWeight: '700', color: isDark ? '#ffffff' : '#0284c7' },
    suggestionsBox: {
      marginTop: 6,
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? '#334155' : '#cbd5e1',
      elevation: 6,
      maxHeight: 180
    },
    suggestionRow: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#334155' : '#f1f5f9'
    },
    suggestionLoc: { fontSize: 12, fontWeight: '600', color: isDark ? '#f8fafc' : '#0f172a' },
    suggestionId: { fontSize: 10, color: isDark ? '#94a3b8' : '#64748b', marginTop: 2 },
    drawer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 16,
      elevation: 12,
      borderTopWidth: 1,
      borderColor: isDark ? '#334155' : '#e2e8f0',
      zIndex: 150
    },
    drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    drawerTitle: { fontSize: 18, fontWeight: '700', color: isDark ? '#f8fafc' : '#0f172a' },
    closeBtn: { padding: 4 },
    closeBtnText: { fontSize: 16, color: isDark ? '#94a3b8' : '#64748b' },
    drawerBody: {},
    drawerLocation: { fontSize: 13, color: isDark ? '#cbd5e1' : '#475569', marginBottom: 10 },
    drawerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    drawerLabel: { fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' },
    drawerValue: { fontWeight: '600', color: isDark ? '#f8fafc' : '#0f172a' },
    highlightText: { color: '#0284c7' },
    actionBtn: { backgroundColor: '#0284c7', paddingVertical: 10, borderRadius: 10, alignItems: 'center', marginTop: 8 },
    actionBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 }
  });
};
