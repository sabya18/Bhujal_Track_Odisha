import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  Modal, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Image, 
  Alert, 
  Platform 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export default function VisitModal({ visible, well, onClose, onSave }) {
  const [date, setDate] = useState('');
  const [bmp, setBmp] = useState('');
  const [mbgl, setMbgl] = useState('');
  const [parapet, setParapet] = useState('');
  const [photo, setPhoto] = useState(null);

  useEffect(() => {
    if (well) {
      // Set initial values from the selected well
      setDate(well.date || new Date().toLocaleDateString('en-GB').replace(/\//g, '.')); // Default to DD.MM.YYYY
      setBmp(well.dtgwl_bmp !== null && well.dtgwl_bmp !== undefined ? well.dtgwl_bmp.toString() : '');
      setMbgl(well.dtgwl_mbgl !== null && well.dtgwl_mbgl !== undefined ? well.dtgwl_mbgl.toString() : '');
      setParapet(well.parapet_height !== null && well.parapet_height !== undefined ? well.parapet_height.toString() : '0.0');
      setPhoto(well.photoUrl || null);
    }
  }, [well, visible]);

  // Real-time MBGL recalculation when BMP changes
  const handleBmpChange = (val) => {
    setBmp(val);
    const bmpVal = parseFloat(val);
    const parapetVal = parseFloat(parapet) || 0;
    if (!isNaN(bmpVal)) {
      const calculatedMbgl = bmpVal - parapetVal;
      setMbgl(Math.max(0, parseFloat(calculatedMbgl.toFixed(2))).toString());
    } else {
      setMbgl('');
    }
  };

  // Real-time BMP recalculation when MBGL changes
  const handleMbglChange = (val) => {
    setMbgl(val);
    const mbglVal = parseFloat(val);
    const parapetVal = parseFloat(parapet) || 0;
    if (!isNaN(mbglVal)) {
      const calculatedBmp = mbglVal + parapetVal;
      setBmp(parseFloat(calculatedBmp.toFixed(2)).toString());
    } else {
      setBmp('');
    }
  };

  // Recalculate MBGL when Parapet Height changes
  const handleParapetChange = (val) => {
    setParapet(val);
    const parapetVal = parseFloat(val) || 0;
    const bmpVal = parseFloat(bmp);
    if (!isNaN(bmpVal)) {
      const calculatedMbgl = bmpVal - parapetVal;
      setMbgl(Math.max(0, parseFloat(calculatedMbgl.toFixed(2))).toString());
    }
  };

  // Camera integration
  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permission Denied", "Please grant camera permission to capture site photos.");
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const base64Data = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setPhoto(base64Data);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Camera Error", "Failed to launch device camera.");
    }
  };

  // Gallery file pick
  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permission Denied", "Please grant gallery permission to select photos.");
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const base64Data = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setPhoto(base64Data);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Gallery Error", "Failed to open photo gallery.");
    }
  };

  const handleSave = () => {
    if (!date) {
      Alert.alert("Validation Error", "Please specify the date of the site visit.");
      return;
    }
    if (!bmp) {
      Alert.alert("Validation Error", "Please input the DTGWL below Measuring Point (BMP).");
      return;
    }

    // Pass data back to parent
    onSave({
      sheet: well.sheet,
      row_idx: well.row_idx,
      date: date.trim(),
      bmp: bmp !== '' ? parseFloat(bmp) : null,
      mbgl: mbgl !== '' ? parseFloat(mbgl) : null,
      parapet: parapet !== '' ? parseFloat(parapet) : 0.0,
      photoUrl: photo
    });
  };

  if (!well) return null;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Record Site Visit</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Station Info Box */}
            <View style={styles.metaCard}>
              <View style={styles.metaRow}>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>Station ID</Text>
                  <Text style={[styles.metaVal, styles.highlightText]}>{well.well_number}</Text>
                </View>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>Block</Text>
                  <Text style={styles.metaVal}>{well.block || '-'}</Text>
                </View>
              </View>
              <View style={[styles.metaRow, { marginTop: 12 }]}>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>Lat / Long</Text>
                  <Text style={styles.metaVal}>{well.lat ? `${well.lat.toFixed(4)}, ${well.lon.toFixed(4)}` : 'No Coordinates'}</Text>
                </View>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>Status (Sheet)</Text>
                  <Text style={[styles.metaVal, well.remarks?.toLowerCase().includes('active') ? styles.activeVal : styles.closedVal]}>
                    {well.remarks || 'Active'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Inputs Form */}
            <View style={styles.formSection}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Date of Visit (DD.MM.YYYY)</Text>
                <TextInput
                  style={styles.inputField}
                  value={date}
                  onChangeText={setDate}
                  placeholder="e.g. 15.02.2026"
                  placeholderTextColor="#64748b"
                />
              </View>

              <View style={styles.formRow}>
                <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.inputLabel}>Parapet Height (m)</Text>
                  <TextInput
                    style={styles.inputField}
                    value={parapet}
                    onChangeText={handleParapetChange}
                    keyboardType="numeric"
                    placeholder="e.g. 0.45"
                    placeholderTextColor="#64748b"
                  />
                </View>
                <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.inputLabel}>DTGWL BMP (m)</Text>
                  <TextInput
                    style={styles.inputField}
                    value={bmp}
                    onChangeText={handleBmpChange}
                    keyboardType="numeric"
                    placeholder="e.g. 5.60"
                    placeholderTextColor="#64748b"
                  />
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>DTGWL MBGL (m) [Auto-calculated]</Text>
                <TextInput
                  style={[styles.inputField, styles.disabledInput]}
                  value={mbgl}
                  onChangeText={handleMbglChange}
                  keyboardType="numeric"
                  placeholder="Calculated automatically"
                  placeholderTextColor="#64748b"
                />
              </View>
            </View>

            {/* Photo Attachment Section */}
            <View style={styles.photoSection}>
              <Text style={styles.photoTitle}>Site Photo Verification</Text>
              
              <View style={styles.previewFrame}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.previewImg} />
                ) : (
                  <View style={styles.emptyPhotoBox}>
                    <Text style={styles.photoIcon}>📷</Text>
                    <Text style={styles.emptyPhotoText}>No Site Photo Captured</Text>
                  </View>
                )}
              </View>

              <View style={styles.photoButtons}>
                <TouchableOpacity onPress={takePhoto} style={styles.cameraBtn}>
                  <Text style={styles.btnText}>Launch Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={pickPhoto} style={styles.galleryBtn}>
                  <Text style={styles.btnText}>Open Gallery</Text>
                </TouchableOpacity>
              </View>

              {photo && (
                <TouchableOpacity onPress={() => setPhoto(null)} style={styles.removePhotoBtn}>
                  <Text style={styles.removePhotoText}>Remove Site Photo</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>

          {/* Form Actions */}
          <View style={styles.footerRow}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save Visit</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 15, 25, 0.85)',
    justifyContent: 'center',
    padding: 16,
  },
  modalBox: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#94a3b8',
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 16,
  },
  metaCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaCol: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaVal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f8fafc',
  },
  highlightText: {
    color: '#38bdf8',
  },
  activeVal: {
    color: '#10b981',
  },
  closedVal: {
    color: '#ef4444',
  },
  formSection: {
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94a3b8',
    marginBottom: 6,
  },
  inputField: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderWidth: 1,
    borderColor: '#334155',
    color: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  disabledInput: {
    borderColor: '#334155',
    color: '#38bdf8',
    fontWeight: '600',
  },
  photoSection: {
    marginBottom: 24,
  },
  photoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 10,
  },
  previewFrame: {
    width: '100%',
    aspectRatio: 4/3,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#334155',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  emptyPhotoBox: {
    alignItems: 'center',
  },
  photoIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyPhotoText: {
    fontSize: 13,
    color: '#94a3b8',
  },
  photoButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cameraBtn: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 6,
  },
  galleryBtn: {
    flex: 1,
    backgroundColor: '#475569',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginLeft: 6,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  removePhotoBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  removePhotoText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    marginRight: 8,
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginLeft: 8,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
