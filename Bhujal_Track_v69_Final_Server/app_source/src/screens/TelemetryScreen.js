import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  FlatList, 
  TouchableOpacity, 
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  SafeAreaView
} from 'react-native';
import { WebView } from 'react-native-webview';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';


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

export default function TelemetryScreen({ theme, toggleTheme, serverUrl }) {
  const styles = getStyles(theme);
  const isDark = theme === 'dark';
  
  // Tab view toggles
  const [activeSubTab, setActiveSubTab] = useState('list'); // 'list' or 'map'
  
  // Search query
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filters state
  const [selectedState, setSelectedState] = useState('Odisha');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedAgency, setSelectedAgency] = useState('');
  
  // Date picker states
  const [startDate, setStartDate] = useState(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)); // Default: 60 days ago
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  
  // Data lists & loading
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [telemetryRecords, setTelemetryRecords] = useState([]);
  const [rainfallTelemetryRecords, setRainfallTelemetryRecords] = useState([]);
  
  // Picker modal controllers
  const [districtModalVisible, setDistrictModalVisible] = useState(false);
  const [agencyModalVisible, setAgencyModalVisible] = useState(false);
  const [chartModalVisible, setChartModalVisible] = useState(false);
  const [selectedStationForChart, setSelectedStationForChart] = useState(null);
  
  const webviewRef = useRef(null);

  const getBackendUrl = () => {
    if (!serverUrl) return null;
    return `${serverUrl.replace(/\/$/, '')}/api/nwic/telemetry`;
  };

  function parseTelemetryDate(dateStr) {
    if (!dateStr) return null;
    const cleaned = dateStr.replace(/\s*-\s*/g, "-").replace(/\s*:\s*/g, ":").trim();
    const normalized = cleaned.includes(":") ? cleaned : `${cleaned} 00:00`;
    const match = normalized.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, day, month, year, hour, minute] = match.map(Number);
    return new Date(year, month - 1, day, hour, minute);
  }

  const handleFetchTelemetry = async () => {
    setLoadingQuery(true);
    setTelemetryRecords([]);
    
    const startLimit = startDate ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0) : null;
    const endLimit = endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59) : null;

    try {
      let allRecords = [];
      let offset = 0;
      const limit = 2000;
      let total = 0;
      
      // Build server-side filters
      const queryFilters = { "State": selectedState };
      if (selectedDistrict) {
        queryFilters["District"] = selectedDistrict;
      }
      if (selectedAgency) {
        queryFilters["Agency"] = selectedAgency;
      }

      do {
        const payload = {
          resource_id: '7de68858-4e78-4a09-8a3a-c63c4a027eeb',
          filters: queryFilters,
          limit: limit,
          offset: offset
        };
        
        let res = null;
        const backendUrl = getBackendUrl();
        
        if (backendUrl) {
          res = await fetch(backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(() => null);
        }
        
        if (!res || !res.ok) {
          const queryParams = new URLSearchParams({
            resource_id: '7de68858-4e78-4a09-8a3a-c63c4a027eeb',
            filters: JSON.stringify(queryFilters),
            limit: limit.toString(),
            offset: offset.toString()
          });
          const targetUrl = `https://nwdp.nwic.gov.in/api/3/action/datastore_search?${queryParams.toString()}`;
          res = await fetch(targetUrl).catch(() => null);
        }
        
        if (!res || !res.ok) throw new Error("Could not connect to NWIC telemetry server.");
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "NWIC server error");
        
        const records = data.result.records || [];
        total = data.result.total;
        allRecords.push(...records);
        offset += limit;
        
        if (allRecords.length >= total) break;
      } while (offset < total);

      // Perform filters on client-side (for date range)
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

      setTelemetryRecords(filtered);
      
      // Fetch matching NWIC active (2026-2030) and historical (2021-2025) rainfall telemetry for correlation
      if (selectedState === 'Odisha') {
        try {
          const rfFilters = { "State": "Odisha" };
          if (selectedDistrict) rfFilters["District"] = selectedDistrict;
          
          const qParams2026 = new URLSearchParams({
            resource_id: 'cd924cf6-444d-424d-bc1e-735b958b53fd',
            filters: JSON.stringify(rfFilters),
            limit: '2000'
          });
          const qParams2021 = new URLSearchParams({
            resource_id: 'c73ba1cb-e9e4-47ca-88e6-3623f78bf13c',
            filters: JSON.stringify(rfFilters),
            limit: '2000'
          });

          const [rfRes2026, rfRes2021] = await Promise.all([
            fetch(`https://nwdp.nwic.gov.in/api/3/action/datastore_search?${qParams2026.toString()}`).catch(() => null),
            fetch(`https://nwdp.nwic.gov.in/api/3/action/datastore_search?${qParams2021.toString()}`).catch(() => null)
          ]);

          let combinedRf = [];
          if (rfRes2026 && rfRes2026.ok) {
            const d26 = await rfRes2026.json();
            if (d26.success && d26.result?.records) combinedRf.push(...d26.result.records);
          }
          if (rfRes2021 && rfRes2021.ok) {
            const d21 = await rfRes2021.json();
            if (d21.success && d21.result?.records) combinedRf.push(...d21.result.records);
          }
          setRainfallTelemetryRecords(combinedRf);
        } catch (e) {
          console.warn("Rainfall telemetry fetch error:", e);
        }
      }
    } catch (err) {
      console.warn(err);
      alert(`Query failed: ${err.message}`);
    } finally {
      setLoadingQuery(false);
    }
  };

  const handleExportExcel = async () => {
    if (filteredRecords.length === 0) {
      alert("No data available to export.");
      return;
    }

    try {
      const rows = filteredRecords.map(item => ({
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
        alert(`Telemetry data saved locally at:\n${fileUri}`);
      }
    } catch (err) {
      console.error("Telemetry export failed:", err);
      alert(`Export Failed: ${err.message}`);
    }
  };

  const filteredRecords = useMemo(() => {
    if (!searchQuery) return telemetryRecords;
    const q = searchQuery.toLowerCase().trim();
    return telemetryRecords.filter(row => {
      const station = (row["Station"] || '').toLowerCase();
      const district = (row["District"] || '').toLowerCase();
      const agency = (row["Agency"] || '').toLowerCase();
      return station.includes(q) || district.includes(q) || agency.includes(q);
    });
  }, [telemetryRecords, searchQuery]);

  const mapHtml = useMemo(() => {
    // Group records by station to plot latest values only
    const uniqueStations = {};
    filteredRecords.forEach(row => {
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
    
    const pins = Object.values(uniqueStations).map(item => {
      const row = item.row;
      const lat = parseFloat(row["Latitude"]);
      const lng = parseFloat(row["Longitude"]);
      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return null;
      
      return {
        lat,
        lng,
        station: row["Station"],
        agency: row["Agency"] || '-',
        district: row["District"] || '-',
        level: row["Groundwater Level Telemetry 6 Hourly (meter)"] || '-',
        time: row["Data Acquisition Time"] || '-'
      };
    }).filter(Boolean);
    
    const tileUrl = isDark 
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
      
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map { height: 100%; margin: 0; padding: 0; background: ${isDark ? '#0b0f19' : '#f1f5f9'}; }
          .well-popup-card {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #ffffff;
          }
          .leaflet-popup-content-wrapper {
            background: #0b0f19;
            border: 1px solid #1e293b;
            border-radius: 8px;
          }
          .leaflet-popup-tip {
            background: #0b0f19;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const map = L.map('map', { zoomControl: false }).setView([20.95, 84.8], 7.0);
          
          L.tileLayer('${tileUrl}', {
            maxZoom: 19
          }).addTo(map);
          
          const pins = ${JSON.stringify(pins)};
          const bounds = [];
          
          pins.forEach(pin => {
            const popupHtml = \`
              <div class="well-popup-card">
                <h4 style="margin: 0 0 6px 0; color: #38bdf8; font-family: monospace;">🔌 Station: \${pin.station}</h4>
                <div style="font-size: 0.8rem; display: flex; flex-direction: column; gap: 4px;">
                  <div><strong>Agency:</strong> \${pin.agency}</div>
                  <div><strong>District:</strong> \${pin.district}</div>
                  <div style="margin-top: 6px; padding: 6px; background: rgba(56, 189, 248, 0.1); border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.3);">
                    <strong style="color: #38bdf8;">Latest Level:</strong> \${pin.level} m
                  </div>
                  <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 2px;">Acquired: \${pin.time}</div>
                  <div style="margin-top: 8px;">
                    <button onclick="window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SHOW_TREND', station: '\${pin.station}' }))" style="width: 100%; font-size: 0.72rem; padding: 6px; font-weight: 600; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 4px; cursor: pointer;">
                      📈 View Trend Graph
                    </button>
                  </div>
                </div>
              </div>
            \`;
            
            const marker = L.circleMarker([pin.lat, pin.lng], {
              radius: 6,
              fillColor: '#38bdf8',
              color: '#ffffff',
              weight: 1,
              opacity: 1.0,
              fillOpacity: 0.85
            }).bindPopup(popupHtml);
            
            marker.addTo(map);
            bounds.push([pin.lat, pin.lng]);
          });
          
          if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [30, 30] });
          }
        </script>
      </body>
      </html>
    `;
  }, [filteredRecords, isDark]);

  const handleOpenChartModal = (stationCode) => {
    setSelectedStationForChart(stationCode);
    setChartModalVisible(true);
  };

  const handleWebViewMessage = (event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'SHOW_TREND') {
        handleOpenChartModal(msg.station);
      }
    } catch (e) {
      console.warn("Error parsing map message:", e);
    }
  };

  const handleExportTelemetry = async () => {
    if (filteredRecords.length === 0) {
      alert("No telemetry data to export. Please query some data first.");
      return;
    }
    
    try {
      const dataToExport = filteredRecords.map(r => ({
        "Station Code": r["Station"] || '',
        "Agency": r["Agency"] || '',
        "District": r["District"] || '',
        "Latitude": r["Latitude"] || '',
        "Longitude": r["Longitude"] || '',
        "Groundwater Level (m)": r["Groundwater Level Telemetry 6 Hourly (meter)"] || '',
        "Data Acquisition Time": r["Data Acquisition Time"] || ''
      }));
      
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Telemetry Data");
      
      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const filename = `Telemetry_Data_Odisha_${new Date().toISOString().split('T')[0]}.xlsx`;
      const fileUri = `${FileSystem.externalCacheDirectory || FileSystem.documentDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      
      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (isSharingAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Export Telemetry Data',
          UTI: 'com.microsoft.excel.xlsx'
        });
      } else {
        alert(`File saved to cache: ${filename}`);
      }
    } catch (error) {
      console.error("Export telemetry failed:", error);
      alert("Failed to export telemetry data: " + error.message);
    }
  };

  const chartHtml = useMemo(() => {
    if (!selectedStationForChart) return '';
    
    const stationRecords = telemetryRecords.filter(r => r["Station"] === selectedStationForChart);
    if (stationRecords.length === 0) return '';
    
    const sortedRecords = [...stationRecords].sort((a, b) => {
      const dA = parseTelemetryDate(a["Data Acquisition Time"]) || 0;
      const dB = parseTelemetryDate(b["Data Acquisition Time"]) || 0;
      return dA - dB;
    });
    
    const labels = sortedRecords.map(r => r["Data Acquisition Time"] ? r["Data Acquisition Time"].split(' ')[0] : '');
    const values = sortedRecords.map(r => {
      const val = parseFloat(r["Groundwater Level Telemetry 6 Hourly (meter)"]);
      return isNaN(val) ? null : val;
    });

    const rainfallValues = labels.map(dateLabel => {
      if (!rainfallTelemetryRecords || rainfallTelemetryRecords.length === 0) return 0;
      const matchingRf = rainfallTelemetryRecords.filter(rf => {
        const rfTime = rf["Data Acquisition Time"] || '';
        return rfTime.startsWith(dateLabel);
      });
      if (matchingRf.length === 0) return 0;
      const sum = matchingRf.reduce((acc, curr) => acc + (parseFloat(curr["Telemetry Hourly Rainfall (mm)"]) || 0), 0);
      return Math.round(sum * 10) / 10;
    });

    const hasRainfall = rainfallValues.some(v => v > 0);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
          body {
            margin: 0;
            padding: 10px;
            background-color: ${isDark ? '#0f172a' : '#ffffff'};
            color: ${isDark ? '#e2e8f0' : '#1e293b'};
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }
          .chart-container {
            position: relative;
            height: 250px;
            width: 100%;
          }
        </style>
      </head>
      <body>
        <div class="chart-container">
          <canvas id="telemetryChart"></canvas>
        </div>
        <script>
          const ctx = document.getElementById('telemetryChart').getContext('2d');
          new Chart(ctx, {
            type: 'line',
            data: {
              labels: ${JSON.stringify(labels)},
              datasets: [
                {
                  label: 'Water Level Depth (m)',
                  data: ${JSON.stringify(values)},
                  borderColor: '#38bdf8',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  borderWidth: 2.5,
                  tension: 0.3,
                  pointBackgroundColor: '#38bdf8',
                  pointRadius: 4,
                  fill: true,
                  yAxisID: 'y'
                },
                ${hasRainfall ? `{
                  type: 'bar',
                  label: 'NWIC Live Rainfall (mm)',
                  data: ${JSON.stringify(rainfallValues)},
                  backgroundColor: 'rgba(59, 130, 246, 0.65)',
                  borderColor: '#2563eb',
                  borderWidth: 1,
                  yAxisID: 'y1',
                  borderRadius: 4
                }` : ''}
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  labels: { color: '${isDark ? '#e2e8f0' : '#1e293b'}' }
                },
                tooltip: {
                  mode: 'index',
                  intersect: false
                }
              },
              scales: {
                x: {
                  grid: { color: '${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}' },
                  ticks: { color: '${isDark ? '#94a3b8' : '#64748b'}', maxRotation: 45 }
                },
                y: {
                  type: 'linear',
                  display: true,
                  position: 'left',
                  grid: { color: '${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}' },
                  ticks: { color: '${isDark ? '#94a3b8' : '#64748b'}' },
                  title: { display: true, text: 'Water Level Depth (m)', color: '#38bdf8' }
                },
                ${hasRainfall ? `y1: {
                  type: 'linear',
                  display: true,
                  position: 'right',
                  grid: { drawOnChartArea: false },
                  ticks: { color: '${isDark ? '#94a3b8' : '#64748b'}' },
                  title: { display: true, text: 'Rainfall (mm)', color: '#2563eb' }
                }` : ''}
              }
            }
          });
        </script>
      </body>
      </html>
    `;
  }, [selectedStationForChart, telemetryRecords, rainfallTelemetryRecords, isDark]);

  const renderTelemetryRow = ({ item }) => {
    return (
      <View style={styles.recordCard}>
        <View style={styles.cardHeaderRow}>
          <TouchableOpacity onPress={() => handleOpenChartModal(item["Station"])}>
            <Text style={[styles.cardStationCode, { textDecorationLine: 'underline', color: '#38bdf8' }]}>
              🔌 {item["Station"]}
            </Text>
          </TouchableOpacity>
          <Text style={styles.cardValueText}>{item["Groundwater Level Telemetry 6 Hourly (meter)"] || '-'} m</Text>
        </View>
        <View style={styles.cardDetailRow}>
          <Text style={styles.cardMetaLabel}>Agency:</Text>
          <Text style={styles.cardMetaValue}>{item["Agency"] || '-'}</Text>
        </View>
        <View style={styles.cardDetailRow}>
          <Text style={styles.cardMetaLabel}>District:</Text>
          <Text style={styles.cardMetaValue}>{item["District"] || '-'}</Text>
        </View>
        <View style={styles.cardDetailRow}>
          <Text style={styles.cardMetaLabel}>Coordinates:</Text>
          <Text style={styles.cardMetaValue}>{parseFloat(item["Latitude"]).toFixed(4)}, {parseFloat(item["Longitude"]).toFixed(4)}</Text>
        </View>
        <View style={styles.cardTimeRow}>
          <Text style={styles.cardTimeText}>{item["Data Acquisition Time"] || '-'}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.mainContainer}>
      {/* Header Banner */}
      <View style={styles.headerBanner}>
        <Text style={styles.headerTitle}>🔌 NWIC Live Telemetry</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {filteredRecords.length > 0 && (
            <TouchableOpacity style={styles.exportBtn} onPress={handleExportExcel}>
              <Text style={styles.exportBtnText}>📊 Export</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.themeToggleBtn} onPress={toggleTheme}>
            <Text style={styles.themeToggleIcon}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters section */}
      <View style={styles.filtersCard}>
        <View style={styles.filtersGrid}>
          {/* District dropdown selector */}
          <TouchableOpacity 
            style={styles.filterSelector}
            onPress={() => setDistrictModalVisible(true)}
          >
            <Text style={styles.filterText} numberOfLines={1}>
              📍 District: {selectedDistrict || 'All Districts'}
            </Text>
          </TouchableOpacity>

          {/* Agency dropdown selector */}
          <TouchableOpacity 
            style={styles.filterSelector}
            onPress={() => setAgencyModalVisible(true)}
          >
            <Text style={styles.filterText} numberOfLines={1}>
              🏢 Agency: {selectedAgency || 'All Agencies'}
            </Text>
          </TouchableOpacity>

          {/* Date Pickers */}
          <View style={styles.datePickerContainer}>
            <TouchableOpacity 
              style={[styles.filterSelector, { flex: 1, marginRight: 6 }]}
              onPress={() => setShowStartPicker(true)}
            >
              <Text style={styles.filterText} numberOfLines={1}>
                📅 Start: {startDate.toLocaleDateString('en-GB')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.filterSelector, { flex: 1 }]}
              onPress={() => setShowEndPicker(true)}
            >
              <Text style={styles.filterText} numberOfLines={1}>
                📅 End: {endDate.toLocaleDateString('en-GB')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Android / iOS native calendar overlays */}
          {showStartPicker && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display="default"
              onChange={(event, selectedDate) => {
                setShowStartPicker(false);
                if (selectedDate) setStartDate(selectedDate);
              }}
            />
          )}

          {showEndPicker && (
            <DateTimePicker
              value={endDate}
              mode="date"
              display="default"
              onChange={(event, selectedDate) => {
                setShowEndPicker(false);
                if (selectedDate) setEndDate(selectedDate);
              }}
            />
          )}

          {/* Query execute button */}
          <TouchableOpacity 
            style={styles.queryButton} 
            onPress={handleFetchTelemetry}
            disabled={loadingQuery}
          >
            {loadingQuery ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.queryButtonText}>⚡ Fetch Live Telemetry</Text>
            )}
          </TouchableOpacity>

          {/* Export telemetry button */}
          {telemetryRecords.length > 0 && (
            <TouchableOpacity 
              style={[styles.queryButton, { backgroundColor: '#475569', marginTop: 8 }]} 
              onPress={handleExportTelemetry}
            >
              <Text style={styles.queryButtonText}>📊 Export Sheet (.xlsx)</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Screen Sub-Tabs Switcher */}
      <View style={styles.subTabBar}>
        <TouchableOpacity 
          style={[styles.subTabItem, activeSubTab === 'list' && styles.subTabActiveItem]}
          onPress={() => setActiveSubTab('list')}
        >
          <Text style={[styles.subTabLabel, activeSubTab === 'list' && styles.subTabActiveLabel]}>
            📁 List View ({filteredRecords.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.subTabItem, activeSubTab === 'map' && styles.subTabActiveItem]}
          onPress={() => setActiveSubTab('map')}
        >
          <Text style={[styles.subTabLabel, activeSubTab === 'map' && styles.subTabActiveLabel]}>
            🗺️ Map View
          </Text>
        </TouchableOpacity>
      </View>

      {/* Primary Display Content */}
      <View style={styles.contentContainer}>
        {activeSubTab === 'list' ? (
          <View style={{ flex: 1 }}>
            <View style={styles.searchBarContainer}>
              <TextInput 
                style={styles.searchBar}
                placeholder="Search telemetry stations..."
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            <FlatList
              data={filteredRecords}
              keyExtractor={(item, index) => `${item["Station"]}_${index}`}
              renderItem={renderTelemetryRow}
              contentContainerStyle={{ paddingBottom: 20 }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {loadingQuery ? "Loading..." : 'Select filters and click "Fetch Live Telemetry" to pull real-time datastore recordings.'}
                  </Text>
                </View>
              }
            />
          </View>
        ) : (
          <View style={{ flex: 1, borderRadius: 12, overflow: 'hidden' }}>
            <WebView
              ref={webviewRef}
              source={{ html: mapHtml }}
              style={{ flex: 1 }}
              originWhitelist={['*']}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              onMessage={handleWebViewMessage}
            />
          </View>
        )}
      </View>

      {/* District Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={districtModalVisible}
        onRequestClose={() => setDistrictModalVisible(false)}
      >
        <View style={styles.modalCenteredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Select District</Text>
            <ScrollView style={{ maxHeight: 300, width: '100%' }}>
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => {
                  setSelectedDistrict('');
                  setDistrictModalVisible(false);
                }}
              >
                <Text style={styles.modalItemText}>-- All Districts --</Text>
              </TouchableOpacity>
              {ODISHA_DISTRICTS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedDistrict(d);
                    setDistrictModalVisible(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{d}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setDistrictModalVisible(false)}
            >
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Agency Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={agencyModalVisible}
        onRequestClose={() => setAgencyModalVisible(false)}
      >
        <View style={styles.modalCenteredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Select Agency</Text>
            <ScrollView style={{ maxHeight: 300, width: '100%' }}>
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => {
                  setSelectedAgency('');
                  setAgencyModalVisible(false);
                }}
              >
                <Text style={styles.modalItemText}>-- All Agencies --</Text>
              </TouchableOpacity>
              {TELEMETRY_AGENCIES.map((a) => (
                <TouchableOpacity
                  key={a}
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedAgency(a);
                    setAgencyModalVisible(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{a}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setAgencyModalVisible(false)}
            >
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Telemetry Chart Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={chartModalVisible}
        onRequestClose={() => setChartModalVisible(false)}
      >
        <View style={styles.modalCenteredView}>
          <View style={[styles.modalView, { width: '90%', maxWidth: 500, height: 420, padding: 15 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', borderBottomWidth: 1, borderBottomColor: isDark ? '#1e293b' : '#e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? '#38bdf8' : '#0284c7' }}>📈 Telemetry Trend</Text>
              <TouchableOpacity onPress={() => setChartModalVisible(false)}>
                <Text style={{ fontSize: 20, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: isDark ? '#cbd5e1' : '#334155', marginBottom: 10, alignSelf: 'flex-start' }}>
              Station: <Text style={{ fontWeight: 'bold', color: '#38bdf8' }}>{selectedStationForChart}</Text>
            </Text>
            
            <View style={{ flex: 1, width: '100%', borderRadius: 8, overflow: 'hidden', backgroundColor: isDark ? '#0f172a' : '#f8fafc', borderWidth: 1, borderColor: isDark ? '#1e293b' : '#e2e8f0' }}>
              <WebView
                source={{ html: chartHtml }}
                style={{ flex: 1, backgroundColor: 'transparent' }}
                originWhitelist={['*']}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (theme) => {
  const isDark = theme === 'dark';
  return StyleSheet.create({
    mainContainer: {
      flex: 1,
      backgroundColor: isDark ? '#0f172a' : '#f8fafc'
    },
    headerBanner: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#1e293b' : '#e2e8f0',
      backgroundColor: isDark ? '#0b0f19' : '#ffffff'
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: isDark ? '#ffffff' : '#0f172a'
    },
    themeToggleBtn: {
      padding: 6,
      borderRadius: 8,
      backgroundColor: isDark ? '#1e293b' : '#f1f5f9'
    },
    themeToggleIcon: {
      fontSize: 16
    },
    exportBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: '#10b981',
    },
    exportBtnText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: 'bold',
    },
    filtersCard: {
      margin: 12,
      padding: 12,
      borderRadius: 10,
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      borderWidth: 1,
      borderColor: isDark ? '#334155' : '#e2e8f0',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2
    },
    filtersGrid: {
      flexDirection: 'column',
      gap: 8
    },
    filterSelector: {
      padding: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? '#475569' : '#cbd5e1',
      backgroundColor: isDark ? '#0f172a' : '#f8fafc',
      justifyContent: 'center'
    },
    filterText: {
      fontSize: 13,
      color: isDark ? '#e2e8f0' : '#334155'
    },
    datePickerContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between'
    },
    queryButton: {
      backgroundColor: '#38bdf8',
      paddingVertical: 11,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4
    },
    queryButtonText: {
      color: '#ffffff',
      fontWeight: 'bold',
      fontSize: 14
    },
    subTabBar: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#1e293b' : '#e2e8f0',
      backgroundColor: isDark ? '#0b0f19' : '#ffffff'
    },
    subTabItem: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center'
    },
    subTabActiveItem: {
      borderBottomWidth: 3,
      borderBottomColor: '#38bdf8'
    },
    subTabLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#64748b' : '#94a3b8'
    },
    subTabActiveLabel: {
      color: '#38bdf8'
    },
    contentContainer: {
      flex: 1,
      padding: 12
    },
    searchBarContainer: {
      marginBottom: 10
    },
    searchBar: {
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? '#334155' : '#e2e8f0',
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      color: isDark ? '#ffffff' : '#0f172a',
      fontSize: 14
    },
    recordCard: {
      padding: 12,
      borderRadius: 8,
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      borderWidth: 1,
      borderColor: isDark ? '#334155' : '#e2e8f0',
      marginBottom: 8
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#334155' : '#f1f5f9',
      paddingBottom: 6
    },
    cardStationCode: {
      fontSize: 14,
      fontWeight: 'bold',
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      color: '#38bdf8'
    },
    cardValueText: {
      fontSize: 15,
      fontWeight: 'bold',
      color: '#38bdf8'
    },
    cardDetailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4
    },
    cardMetaLabel: {
      fontSize: 12,
      color: isDark ? '#94a3b8' : '#64748b'
    },
    cardMetaValue: {
      fontSize: 12,
      fontWeight: '500',
      color: isDark ? '#e2e8f0' : '#334155'
    },
    cardTimeRow: {
      marginTop: 6,
      alignItems: 'flex-end'
    },
    cardTimeText: {
      fontSize: 10,
      color: isDark ? '#64748b' : '#94a3b8'
    },
    emptyContainer: {
      padding: 40,
      alignItems: 'center'
    },
    emptyText: {
      fontSize: 13,
      textAlign: 'center',
      color: isDark ? '#64748b' : '#94a3b8',
      lineHeight: 18
    },
    modalCenteredView: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)'
    },
    modalView: {
      margin: 20,
      width: '80%',
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#334155' : '#cbd5e1'
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      marginBottom: 12,
      color: isDark ? '#ffffff' : '#0f172a'
    },
    modalItem: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#334155' : '#e2e8f0',
      width: '100%'
    },
    modalItemText: {
      fontSize: 14,
      color: isDark ? '#e2e8f0' : '#334155'
    },
    modalCloseButton: {
      marginTop: 16,
      paddingVertical: 8,
      paddingHorizontal: 20,
      borderRadius: 6,
      backgroundColor: isDark ? '#334155' : '#cbd5e1'
    },
    modalCloseButtonText: {
      color: isDark ? '#ffffff' : '#334155',
      fontSize: 13,
      fontWeight: '600'
    }
  });
};
