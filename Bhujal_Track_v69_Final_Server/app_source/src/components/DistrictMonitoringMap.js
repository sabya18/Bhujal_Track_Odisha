import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import odishaGeojson from '../data/odisha_districts_complete.json';
import { LEAFLET_CSS, LEAFLET_JS } from '../utils/leafletAssets';

const getCompletionColor = (stats) => {
  if (!stats || stats.active === 0) return '#64748b';
  const percent = Math.round((stats.monitored / stats.active) * 100);
  if (percent >= 90) return '#10b981';
  if (percent >= 70) return '#38bdf8';
  if (percent >= 40) return '#f59e0b';
  return '#ef4444';
};

const getDepthColor = (avgMbgl) => {
  if (avgMbgl === null || avgMbgl === undefined || avgMbgl === 'N/A' || avgMbgl === 0) return '#64748b';
  const val = parseFloat(avgMbgl);
  if (isNaN(val)) return '#64748b';
  if (val < 2.5) return '#0284c7';
  if (val < 4.5) return '#10b981';
  if (val < 6.5) return '#f59e0b';
  if (val < 8.5) return '#f97316';
  return '#ef4444';
};

const normalizeDistrictName = (name) => {
  if (!name) return '';
  const d = name.toLowerCase().trim()
                .replace(/_blocks/g, '')
                .replace(/_urban/g, '')
                .replace(/\s+/g, ' ');
  
  if (d.includes('kendrapara')) return d.includes('urban') ? 'kendrapara urban' : 'kendrapara';
  if (d.includes('cuttack')) return d.includes('urban') ? 'cuttack urban' : 'cuttack';
  if (d.includes('jajpur')) return d.includes('urban') ? 'jajpur urban' : 'jajpur';
  if (d.includes('jagatsinghpur') || d.includes('jagatsinghapur') || d.includes('jspur')) return 'jagatsinghpur';
  if (d === 'bolangir' || d === 'balangir') return 'balangir';
  if (d === 'bhubaneswar' || d === 'khurda' || d === 'khordha') return 'khordha';
  if (d === 'nawarangapur' || d === 'nabarangapur' || d === 'nabarangpur') return 'nabarangpur';
  if (d === 'debagarh' || d === 'deogarh') return 'deogarh';
  if (d === 'baleshwar' || d === 'balasore') return 'balasore';
  if (d === 'kendujhar' || d === 'keonjhar') return 'keonjhar';
  return d;
};

export default function DistrictMonitoringMap({ districtStats, theme, selectedDistrict, onSelectDistrict, wellsData = [], wttoData = [] }) {
  const isDark = theme === 'dark';
  const webviewRef = React.useRef(null);

  const mapStats = useMemo(() => {
    const result = {};
    Object.entries(districtStats || {}).forEach(([district, stats]) => {
      const key = normalizeDistrictName(district);
      result[key] = {
        ...stats,
        color: getDepthColor(stats.avgMbgl),
        percent: stats.active > 0 ? Math.round((stats.monitored / stats.active) * 100) : 0,
      };
    });
    return result;
  }, [districtStats]);

  const mapHtml = useMemo(() => {
    const geojsonStr = JSON.stringify(odishaGeojson).replace(/</g, '\u003c');
    const blocksGeojsonStr = JSON.stringify(odishaBlocksGeojson).replace(/</g, '\u003c');
    const statsStr = JSON.stringify(mapStats).replace(/</g, '\u003c');
    const background = isDark ? '#0b0f19' : '#e2e8f0';
    const border = isDark ? '#f8fafc' : '#0f172a';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
        <style>${LEAFLET_CSS}</style>
        <style>
          html, body, #map { margin:0; width:100%; height:100%; background:${background}; }
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
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>${LEAFLET_JS}</script>
        <script>
          const geojson = ${geojsonStr};
          const mapStats = ${statsStr};
          const isDarkGlobal = ${isDark};

          function normalizeGeoJSONDistrict(distName) {
            const d = (distName || '').toLowerCase().trim();
            if (d.includes('kendrapara')) return d.includes('urban') ? 'kendrapara urban' : 'kendrapara';
            if (d.includes('cuttack')) return d.includes('urban') ? 'cuttack urban' : 'cuttack';
            if (d.includes('jajpur')) return d.includes('urban') ? 'jajpur urban' : 'jajpur';
            if (d.includes('jagatsinghpur') || d.includes('jagatsinghapur') || d.includes('jspur')) return 'jagatsinghpur';
            if (d === 'bolangir' || d === 'balangir') return 'balangir';
            if (d === 'bhubaneswar' || d === 'khurda' || d === 'khordha') return 'khordha';
            if (d === 'nawarangapur' || d === 'nabarangapur' || d === 'nabarangpur') return 'nabarangpur';
            if (d === 'debagarh' || d === 'deogarh') return 'deogarh';
            if (d === 'baleshwar' || d === 'balasore') return 'balasore';
            if (d === 'kendujhar' || d === 'keonjhar') return 'keonjhar';
            return d;
          }

          const map = L.map('map', {
            preferCanvas: false,
            zoomControl: false,
            attributionControl: false,
            tap: false
          }).setView([20.35, 84.45], 6.8);

          L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
          }).addTo(map);

          if (geojson) {
            // Render heavy state boundary outline for high contrast in light mode
            L.geoJSON(geojson, {
              style: {
                color: isDarkGlobal ? '#f8fafc' : '#000000',
                weight: 3.8,
                opacity: 0.9,
                fill: false,
                interactive: false
              }
            }).addTo(map);

            const districtLayersMap = {};
            const districtGeoJsonLayer = L.geoJSON(geojson, {
              style: feature => {
                const name = feature.properties.Dist_Name || feature.properties.dtname || 'Unknown';
                const key = normalizeGeoJSONDistrict(name);
                const stats = mapStats[key];
                const color = stats ? stats.color : (isDarkGlobal ? '#334155' : '#0284c7');
                return {
                  color: isDarkGlobal ? '#f8fafc' : '#0f172a',
                  weight: 2.4,
                  opacity: 1.0,
                  fillColor: color,
                  fillOpacity: 0.85
                };
              },
              onEachFeature: (feature, layer) => {
                const name = feature.properties.Dist_Name || feature.properties.dtname || 'Unknown';
                const key = normalizeGeoJSONDistrict(name);
                if (!districtLayersMap[key]) districtLayersMap[key] = [];
                districtLayersMap[key].push(layer);

                layer.on('click', (e) => {
                  if (e && e.originalEvent) L.DomEvent.stopPropagation(e);
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type:'SELECT_DISTRICT', district: name }));
                  } else if (window.parent) {
                    window.parent.postMessage(JSON.stringify({ type:'SELECT_DISTRICT', district: name }), '*');
                  }
                });
              }
            }).addTo(map);

            const districtLabelGroup = L.layerGroup();
            Object.keys(districtLayersMap).forEach(key => {
              const layers = districtLayersMap[key];
              const group = L.featureGroup(layers);
              const center = group.getBounds().getCenter();
              const name = layers[0].feature.properties.Dist_Name || layers[0].feature.properties.dtname;
              
              const tooltip = L.tooltip({ permanent: true, direction: 'center', className: 'district-label', interactive: true })
                .setLatLng(center)
                .setContent('<div class="glowing-tooltip"><strong>' + name + '</strong></div>')
                .on('click', (e) => {
                  if (e && e.originalEvent) L.DomEvent.stopPropagation(e);
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type:'SELECT_DISTRICT', district: name }));
                  } else if (window.parent) {
                    window.parent.postMessage(JSON.stringify({ type:'SELECT_DISTRICT', district: name }), '*');
                  }
                });
              districtLabelGroup.addLayer(tooltip);
            });
            districtLabelGroup.addTo(map);
          }

          function handleMessage(e) {
            try {
              const msg = JSON.parse(e.data);
              if (msg.type === 'ZOOM_IN') map.zoomIn();
              else if (msg.type === 'ZOOM_OUT') map.zoomOut();
            } catch(err) {}
          }
          window.addEventListener('message', handleMessage);
          document.addEventListener('message', handleMessage);
        </script>
      </body>
      </html>
    `;
  }, [mapStats, isDark]);

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html: mapHtml, baseUrl: Platform.OS === 'android' ? 'file:///android_asset/' : '' }}
        style={{ flex: 1 }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        androidLayerType="software"
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        allowingReadAccessToURL="*"
      />
    </View>
  );
}
