import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator 
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

export default function FieldBookScreen({ onClose, onImportData, theme }) {
  const isDark = theme === 'dark';
  const [loading, setLoading] = useState(false);
  const [parsedFileName, setParsedFileName] = useState(null);
  const [parsedRecords, setParsedRecords] = useState([]);
  const [stats, setStats] = useState({ total: 0, valid: 0, invalid: 0, districts: 0 });

  const containerStyle = [styles.container, { backgroundColor: isDark ? '#0f172a' : '#f8fafc' }];
  const cardStyle = [styles.card, { backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0' }];
  const textColor = { color: isDark ? '#f8fafc' : '#0f172a' };
  const subTextColor = { color: isDark ? '#94a3b8' : '#64748b' };

  // Parse DMS format string (20_33_51 or 20-30-37) to Decimal Degrees float
  const parseDMSCoordinate = (val) => {
    if (!val) return null;
    if (typeof val === 'number') return val;
    const str = String(val).trim();
    if (!str) return null;
    if (!isNaN(parseFloat(str)) && !str.includes('_') && !str.includes('-')) {
      return parseFloat(str);
    }
    const parts = str.split(/[_:-]/).map(p => parseFloat(p.trim())).filter(p => !isNaN(p));
    if (parts.length >= 3) {
      const deg = parts[0];
      const min = parts[1];
      const sec = parts[2];
      const dd = deg + (min / 60) + (sec / 3600);
      return parseFloat(dd.toFixed(6));
    } else if (parts.length === 2) {
      return parseFloat((parts[0] + (parts[1] / 60)).toFixed(6));
    } else if (parts.length === 1) {
      return parts[0];
    }
    return null;
  };

  // 1. Download & Share Sample Official Division Field Book CSV
  const handleDownloadSampleCSV = async () => {
    try {
      const csvHeaders = "District,BLOCK,Location of Observation wells,Well Type,Well Number,Lat(DMS),Long(DMS),Dt_SiteVisit [dd/mm/yy],Total Depth in mtr,Height of Parapet in mtr,DTGWL [bmp],DTGWL [mbgl],Remarks\n";
      const sampleRows = [
        "Cuttack,Athagarh,Gurudijhatia : Girl's High School,BW,07M01BW001,20_33_51,85_48_37,30/05/2026,30.5,0.48,8.58,8.10,Active",
        "Cuttack,Banki,Baideswar : Bus Stand,DW,07M03DW005,20_21_10,85_23_11,28/05/2026,8.2,0.60,5.45,4.85,Active",
        "Kendrapara,Aul,Gopinathpur Sasan : Sidheswar Mahadev Temple,DW,17BR01DW001,20_39_12,86_38_11,01/06/2026,4.4,0.65,2.62,1.97,Active",
        "Jajpur,Badachana,Baisimauza: Inside High School Compound,DW,13BR01DW003,20_29_00,86_09_00,03/06/2026,5.8,0.50,6.30,5.80,Closed"
      ].join("\n");

      const fileContent = csvHeaders + sampleRows;
      const fileUri = `${FileSystem.documentDirectory}Division_Groundwater_Field_Book_Template.csv`;
      
      await FileSystem.writeAsStringAsync(fileUri, fileContent, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Download Official Division Field Book CSV' });
      } else {
        Alert.alert("Template Saved", `Template file created at:\n${fileUri}`);
      }
    } catch (err) {
      console.error("Template export error:", err);
      Alert.alert("Export Error", "Could not generate sample template CSV: " + err.message);
    }
  };

  // 2. Pick & Parse Official Division Field Book File
  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const file = res.assets[0];
      setLoading(true);
      setParsedFileName(file.name);

      const fileUri = file.uri;
      const fileBase64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });

      const workbook = XLSX.read(fileBase64, { type: 'base64' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawJson = XLSX.utils.sheet_to_json(worksheet);

      processParsedRows(rawJson, file.name);
    } catch (err) {
      console.error("Document Picker Error:", err);
      Alert.alert("Import Error", "Failed to parse document: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const processParsedRows = (rawRows, fileName) => {
    let validCount = 0;
    let invalidCount = 0;
    const districtsSet = new Set();
    const parsedList = [];

    rawRows.forEach((row, idx) => {
      const district = row['District'] || row['district'] || row['District Name'] || row['DISTRICT'] || '';
      const block = row['BLOCK'] || row['Block'] || row['block'] || row['Block Name'] || row['Urban Area'] || '';
      const stationName = row['Location of Observation wells'] || row['Location'] || row['Station_Name'] || row['Village'] || `Station_${idx+1}`;
      const stationCode = row['Well Number'] || row['Well ID'] || row['New Well ID'] || row['Old Well ID'] || row['Station_Code'] || `W_${idx+1}`;
      const wellType = row['Well Type'] || row['Well_Type'] || row['Type'] || 'DW';
      const visitDate = row['Dt_SiteVisit [dd/mm/yy]'] || row['Dt_SiteVisit'] || row['Reading_Date'] || row['Date'] || new Date().toISOString().split('T')[0];
      
      const depthVal = parseFloat(row['Total Depth in mtr'] || row['Total Depth bgl in mtr'] || row['Total Depth'] || row['Well Depth'] || '');
      const parapetVal = parseFloat(row['Height of Parapet in mtr'] || row['Parapet'] || '');
      const dtgwlBmpVal = parseFloat(row['DTGWL [bmp]'] || row['DTGWL bmp'] || '');
      const dtgwlMbglVal = parseFloat(row['DTGWL [mbgl]'] || row['DTGWL mbgl'] || row['Water_Level_m_bgl'] || row['DTGWL'] || '');
      const remarks = row['Remarks'] || row['Present Well Status'] || row['Well Status'] || 'Active';

      const latRaw = row['Lat(DMS)'] || row['Lat(DD)'] || row['Latitude'] || row['Lat'] || '';
      const lngRaw = row['Long(DMS)'] || row['Long(DD)'] || row['Longitude'] || row['Long'] || '';
      const lat = parseDMSCoordinate(latRaw);
      const lng = parseDMSCoordinate(lngRaw);

      const waterLevel = !isNaN(dtgwlMbglVal) ? dtgwlMbglVal : (!isNaN(dtgwlBmpVal) && !isNaN(parapetVal) ? dtgwlBmpVal - parapetVal : dtgwlBmpVal);
      const isValid = String(district).trim().length > 0 && String(block).trim().length > 0 && (!isNaN(waterLevel) || String(remarks).toLowerCase() === 'closed');

      if (String(district).trim()) districtsSet.add(String(district).trim());

      if (isValid) {
        validCount++;
      } else {
        invalidCount++;
      }

      parsedList.push({
        id: `row_${idx}`,
        district: String(district).trim(),
        block: String(block).trim(),
        well_id: String(stationCode).trim(),
        location: String(stationName).trim(),
        well_type: String(wellType).trim(),
        dtgwl_mbgl: isNaN(waterLevel) ? null : parseFloat(waterLevel.toFixed(2)),
        dtgwl_bmp: isNaN(dtgwlBmpVal) ? null : parseFloat(dtgwlBmpVal.toFixed(2)),
        total_depth: isNaN(depthVal) ? null : depthVal,
        parapet_height: isNaN(parapetVal) ? null : parapetVal,
        date: String(visitDate).trim(),
        latitude: lat,
        longitude: lng,
        remarks: String(remarks).trim(),
        isValid
      });
    });

    setStats({
      total: rawRows.length,
      valid: validCount,
      invalid: invalidCount,
      districts: districtsSet.size
    });

    setParsedRecords(parsedList);

    Alert.alert(
      "Division Field Book Parsed 📊",
      `Parsed ${rawRows.length} rows (${validCount} valid) across ${districtsSet.size} districts.`
    );
  };

  // 3. Save & Import Data
  const handleCommitImport = () => {
    const validRecords = parsedRecords.filter(r => r.isValid);
    if (validRecords.length === 0) {
      Alert.alert("No Valid Data", "Please upload a Division Field Book with valid District, BLOCK, and Water Level readings.");
      return;
    }

    if (onImportData) {
      onImportData(validRecords);
    }

    Alert.alert(
      "Import Success 🟢",
      `Successfully imported ${validRecords.length} station records into your mobile app database!`,
      [{ text: "OK", onPress: onClose }]
    );
  };

  return (
    <View style={containerStyle}>
      {/* Header Bar */}
      <View style={[styles.header, { backgroundColor: isDark ? '#0b0f19' : '#ffffff', borderBottomColor: isDark ? '#1e293b' : '#e2e8f0' }]}>
        <Text style={[styles.headerTitle, textColor]}>📘 Official Division Field Book</Text>
        {onClose && (
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Specification Card */}
        <View style={cardStyle}>
          <Text style={styles.cardTitle}>📋 Official Division Field Book Layout</Text>
          <Text style={[styles.cardSubtitle, subTextColor]}>
            Standardized format used across GWD Division Cuttack and Odisha districts.
          </Text>

          <View style={[styles.specBox, { backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : '#f1f5f9' }]}>
            <Text style={[styles.specTitle, { color: '#38bdf8' }]}>Official Header Columns:</Text>
            <Text style={[styles.specItem, subTextColor]}>• <Text style={{ fontWeight: '700', color: textColor.color }}>District / BLOCK</Text>: District & Block Name</Text>
            <Text style={[styles.specItem, subTextColor]}>• <Text style={{ fontWeight: '700', color: textColor.color }}>Location of Observation wells</Text>: Landmark/Village</Text>
            <Text style={[styles.specItem, subTextColor]}>• <Text style={{ fontWeight: '700', color: textColor.color }}>Well Type / Well Number</Text>: Type (DW, PZ, TW) & Unique ID</Text>
            <Text style={[styles.specItem, subTextColor]}>• <Text style={{ fontWeight: '700', color: textColor.color }}>Total Depth in mtr</Text>: Well depth in meters</Text>
            <Text style={[styles.specItem, subTextColor]}>• <Text style={{ fontWeight: '700', color: textColor.color }}>Height of Parapet in mtr</Text>: Parapet height</Text>
            <Text style={[styles.specItem, subTextColor]}>• <Text style={{ fontWeight: '700', color: textColor.color }}>DTGWL [mbgl] / [bmp]</Text>: Water level depth</Text>
            <Text style={[styles.specItem, subTextColor]}>• <Text style={{ color: '#a855f7' }}>Lat(DMS) / Long(DMS) / Dt_SiteVisit / Remarks</Text></Text>
          </View>

          <TouchableOpacity style={styles.actionBtnPrimary} onPress={handleDownloadSampleCSV}>
            <Text style={styles.actionBtnText}>📥 Download Division CSV Template</Text>
          </TouchableOpacity>
        </View>

        {/* Upload File Card */}
        <View style={[cardStyle, { marginTop: 16 }]}>
          <Text style={styles.cardTitle}>📤 Pick & Upload Division Field Book</Text>
          <Text style={[styles.cardSubtitle, subTextColor]}>
            Upload your official district CSV or Excel file to parse and update groundwater level records.
          </Text>

          <TouchableOpacity style={styles.uploadBox} onPress={handlePickDocument}>
            {loading ? (
              <ActivityIndicator size="large" color="#38bdf8" />
            ) : (
              <>
                <Text style={{ fontSize: 36, marginBottom: 6 }}>📁</Text>
                <Text style={[styles.uploadBoxTitle, textColor]}>Tap to Select Division Field Book (.csv / .xlsx)</Text>
                {parsedFileName && (
                  <Text style={{ color: '#38bdf8', fontWeight: '600', marginTop: 4 }}>
                    Selected: {parsedFileName}
                  </Text>
                )}
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Validation & Preview Card */}
        {parsedRecords.length > 0 && (
          <View style={[cardStyle, { marginTop: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.cardTitle}>🔍 Parsed Validation Preview</Text>
              <TouchableOpacity style={styles.commitBtn} onPress={handleCommitImport}>
                <Text style={styles.commitBtnText}>💾 Save & Import Data</Text>
              </TouchableOpacity>
            </View>

            {/* Stats Badges */}
            <View style={styles.statsRow}>
              <View style={[styles.statBadge, { backgroundColor: isDark ? '#0f172a' : '#f1f5f9' }]}>
                <Text style={styles.statLabel}>Total Rows</Text>
                <Text style={[styles.statVal, { color: '#38bdf8' }]}>{stats.total}</Text>
              </View>
              <View style={[styles.statBadge, { backgroundColor: isDark ? '#0f172a' : '#f1f5f9' }]}>
                <Text style={styles.statLabel}>Valid</Text>
                <Text style={[styles.statVal, { color: '#4ade80' }]}>{stats.valid}</Text>
              </View>
              <View style={[styles.statBadge, { backgroundColor: isDark ? '#0f172a' : '#f1f5f9' }]}>
                <Text style={styles.statLabel}>Districts</Text>
                <Text style={[styles.statVal, { color: '#c084fc' }]}>{stats.districts}</Text>
              </View>
            </View>

            {/* List Preview */}
            <View style={{ marginTop: 12 }}>
              {parsedRecords.slice(0, 25).map((item) => (
                <View key={item.id} style={[styles.previewItem, { borderBottomColor: isDark ? '#334155' : '#e2e8f0' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '700', color: textColor.color }}>{item.district} / {item.block}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: item.isValid ? '#34d399' : '#f87171' }}>
                      {item.isValid ? '✓ Valid' : '⚠ Warning'}
                    </Text>
                  </View>
                  <Text style={[subTextColor, { fontSize: 12, marginTop: 2 }]}>
                    [{item.well_type}] {item.well_id} - {item.location}
                  </Text>
                  <Text style={{ color: '#38bdf8', fontWeight: '600', fontSize: 12, marginTop: 2 }}>
                    Level: {item.dtgwl_mbgl !== null ? `${item.dtgwl_mbgl} m bgl` : 'N/A'} | Depth: {item.total_depth !== null ? `${item.total_depth}m` : '-'} | Date: {item.date}
                  </Text>
                </View>
              ))}
              {parsedRecords.length > 25 && (
                <Text style={[subTextColor, { textAlign: 'center', marginVertical: 8, fontSize: 12 }]}>
                  ... and {parsedRecords.length - 25} more records.
                </Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 6, borderRadius: 20, backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  closeBtnText: { color: '#ef4444', fontWeight: '800', fontSize: 16 },
  content: { padding: 16 },
  card: { padding: 16, borderRadius: 14, borderWidth: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#38bdf8' },
  cardSubtitle: { fontSize: 12, marginTop: 4, lineHeight: 18 },
  specBox: { padding: 12, borderRadius: 10, marginVertical: 12 },
  specTitle: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  specItem: { fontSize: 12, marginBottom: 4 },
  actionBtnPrimary: {
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4
  },
  actionBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  uploadBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#38bdf8',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.05)'
  },
  uploadBoxTitle: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  commitBtn: { backgroundColor: '#10b981', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  commitBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  statBadge: { flex: 1, padding: 8, borderRadius: 8, alignItems: 'center' },
  statLabel: { fontSize: 10, color: '#94a3b8' },
  statVal: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  previewItem: { paddingVertical: 8, borderBottomWidth: 1 }
});
