import React, { useState, useMemo } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  FlatList, 
  TouchableOpacity, 
  ScrollView,
  Platform 
} from 'react-native';

export default function Directory({ wellsData, onRecordVisit, theme, toggleTheme, selectedSeason, selectedYear }) {
  const styles = getStyles(theme);
  const isDark = theme === 'dark';
  const [search, setSearch] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');
  const [selectedBlock, setSelectedBlock] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ACTIVE');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const getDistrictFromSheet = (sheet) => {
    const s = sheet.toLowerCase();
    if (s.includes('kendrapara')) return 'Kendrapara';
    if (s.includes('cuttack')) return 'Cuttack';
    if (s.includes('jajpur')) return 'Jajpur';
    if (s.includes('jspur')) return 'Jagatsinghpur';
    return 'Other';
  };

  const isActiveWell = (well) => {
    if (!well) return false;
    const rem = (well.remarks || '').toLowerCase();
    return !rem.includes('inactive') && !rem.includes('closed') && !rem.includes('cemented') && !rem.includes('dumped') && !rem.includes('abandoned') && !rem.includes('filled');
  };

  // Helper date range checkers for syncing
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

  const getActiveSeason = () => {
    if (selectedSeason === 'Winter') return `Season-Winter -${selectedYear}`;
    if (selectedSeason === 'Pre-Monsoon') return `Season- Pre-Monsson-${selectedYear}`;
    if (selectedSeason === 'Mid-Monsoon') return `Mid-Monsoon-${selectedYear}`;
    if (selectedSeason === 'Post-Monsoon') return `Post-Monsson-${selectedYear}`;
    return `Season-Winter -${selectedYear}`;
  };

  // Compile list of unique districts, blocks, and types
  const districts = ['ALL', 'Cuttack', 'Kendrapara', 'Jajpur', 'Jagatsinghpur'];
  
  const blocks = useMemo(() => {
    const set = new Set();
    wellsData.forEach(well => {
      const dist = getDistrictFromSheet(well.sheet);
      if (selectedDistrict === 'ALL' || dist === selectedDistrict) {
        if (well.block) set.add(well.block);
      }
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [wellsData, selectedDistrict]);

  const wellTypes = ['ALL', 'DW', 'BW', 'TW'];

  const statusOptions = [
    { label: 'Active - Pending', value: 'ACTIVE_PENDING' },
    { label: 'Active - All', value: 'ACTIVE' },
    { label: 'Monitored Only', value: 'MONITORED' },
    { label: 'Closed Stations', value: 'CLOSED' },
    { label: 'All Stations', value: 'ALL' }
  ];

  const directorySummary = useMemo(() => {
    const activeWells = wellsData.filter(isActiveWell);
    const active = activeWells.length;
    const currentSeasonStr = getActiveSeason();
    
    const monitored = activeWells.filter(w => {
      const hasDate = w.date !== null && w.date !== undefined && w.date !== '';
      const hasBmp = w.dtgwl_bmp !== null && w.dtgwl_bmp !== undefined && w.dtgwl_bmp !== '' && !isNaN(Number(w.dtgwl_bmp));
      return hasDate && hasBmp && checkDateInSeasonRange(w.date, currentSeasonStr);
    }).length;
    
    const pending = active - monitored;
    return { active, monitored, pending };
  }, [wellsData, selectedSeason, selectedYear]);

  // Filter wells list
  const filteredWells = useMemo(() => {
    return wellsData.filter(well => {
      // 1. Search text filter
      if (search) {
        const query = search.toLowerCase();
        const numMatch = (well.well_number || '').toLowerCase().includes(query);
        const locMatch = (well.location || '').toLowerCase().includes(query);
        const blockMatch = (well.block || '').toLowerCase().includes(query);
        if (!numMatch && !locMatch && !blockMatch) return false;
      }

      // 2. District filter
      if (selectedDistrict !== 'ALL') {
        const dist = getDistrictFromSheet(well.sheet);
        if (dist !== selectedDistrict) return false;
      }

      // 3. Block filter
      if (selectedBlock !== 'ALL') {
        if (well.block !== selectedBlock) return false;
      }

      // 4. Well Type filter
      if (selectedType !== 'ALL') {
        if (well.well_type !== selectedType) return false;
      }

      // 5. Status filter
      const active = isActiveWell(well);
      const hasVisit = well.date !== null && well.date !== '';
      
      if (selectedStatus === 'ACTIVE') {
        if (!active) return false;
      } else if (selectedStatus === 'ACTIVE_PENDING') {
        if (!active || hasVisit) return false;
      } else if (selectedStatus === 'MONITORED') {
        if (!active || !hasVisit) return false;
      } else if (selectedStatus === 'CLOSED') {
        if (active) return false;
      }

      return true;
    });
  }, [wellsData, search, selectedDistrict, selectedBlock, selectedType, selectedStatus]);

  // Render individual well item
  const renderWellItem = ({ item }) => {
    const active = isActiveWell(item);
    const hasVisit = item.date !== null && item.date !== '';
    const dist = getDistrictFromSheet(item.sheet);
    
    let statusBg = 'rgba(239, 68, 68, 0.15)'; // Red pending
    let statusText = 'Pending';
    let statusColor = '#ef4444';
    
    if (!active) {
      statusBg = 'rgba(100, 116, 139, 0.15)'; // Grey closed
      statusText = 'Closed';
      statusColor = '#94a3b8';
    } else if (hasVisit) {
      statusBg = 'rgba(16, 185, 129, 0.15)'; // Green monitored
      statusText = 'Monitored';
      statusColor = '#10b981';
    }

    return (
      <View style={styles.wellCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.wellNumber}>{item.well_number}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusBg, borderColor: statusColor }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.locationText}>📍 {item.location}</Text>
          
          <View style={styles.cardRow}>
            <Text style={styles.cardMeta}>District: <Text style={styles.metaValue}>{dist}</Text></Text>
            <Text style={styles.cardMeta}>Block: <Text style={styles.metaValue}>{item.block || '-'}</Text></Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={styles.cardMeta}>Type: <Text style={[styles.metaValue, styles.highlightText]}>{item.well_type}</Text></Text>
            <Text style={styles.cardMeta}>Parapet: <Text style={styles.metaValue}>{item.parapet_height} m</Text></Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={styles.cardMeta}>Visit Date: <Text style={styles.metaValue}>{item.date || '-'}</Text></Text>
            {item.dtgwl_bmp !== null && (
              <Text style={styles.cardMeta}>BMP: <Text style={styles.metaValue}>{item.dtgwl_bmp} m</Text></Text>
            )}
          </View>

          {item.dtgwl_mbgl !== null && (
            <View style={styles.cardRow}>
              <Text style={styles.cardMeta}>MBGL: <Text style={[styles.metaValue, styles.successText]}>{item.dtgwl_mbgl} m</Text></Text>
            </View>
          )}
        </View>

        <TouchableOpacity 
          style={styles.cardActionBtn}
          onPress={() => onRecordVisit(item)}
        >
          <Text style={styles.cardActionText}>✏️ Record Field Visit</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>FIELD STATION INDEX</Text>
          <Text style={styles.title}>Directory</Text>
          <Text style={styles.statsLabel}>Search, filter and update monitoring stations</Text>
        </View>
        <TouchableOpacity 
          style={{ 
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            padding: 8,
            borderRadius: 20
          }} 
          onPress={toggleTheme}
        >
          <Text style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{directorySummary.active}</Text>
          <Text style={styles.summaryLabel}>Active</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, styles.monitoredValue]}>{directorySummary.monitored}</Text>
          <Text style={styles.summaryLabel}>Monitored</Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardLast]}>
          <Text style={[styles.summaryValue, styles.pendingValue]}>{directorySummary.pending}</Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchField}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by ID, Location, or Block..."
          placeholderTextColor="#64748b"
        />
        <TouchableOpacity 
          onPress={() => setShowAdvancedFilters(!showAdvancedFilters)}
          style={[styles.filterToggleBtn, showAdvancedFilters && styles.filterToggleActive]}
        >
          <Text style={styles.filterToggleText}>⚙️ Filters</Text>
        </TouchableOpacity>
      </View>

      {/* Advanced Filters Expandable Drawer */}
      {showAdvancedFilters && (
        <View style={styles.advancedFiltersBox}>
          {/* Status Selection Row */}
          <Text style={styles.filterTitle}>Monitoring Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroller}>
            {statusOptions.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.pill, selectedStatus === opt.value && styles.pillActive]}
                onPress={() => setSelectedStatus(opt.value)}
              >
                <Text style={[styles.pillText, selectedStatus === opt.value && styles.pillTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* District Selection Row */}
          <Text style={styles.filterTitle}>District</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroller}>
            {districts.map(dist => (
              <TouchableOpacity
                key={dist}
                style={[styles.pill, selectedDistrict === dist && styles.pillActive]}
                onPress={() => {
                  setSelectedDistrict(dist);
                  setSelectedBlock('ALL'); // reset block
                }}
              >
                <Text style={[styles.pillText, selectedDistrict === dist && styles.pillTextActive]}>
                  {dist}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Block Selection Row */}
          <Text style={styles.filterTitle}>Block</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroller}>
            {blocks.map(blk => (
              <TouchableOpacity
                key={blk}
                style={[styles.pill, selectedBlock === blk && styles.pillActive]}
                onPress={() => setSelectedBlock(blk)}
              >
                <Text style={[styles.pillText, selectedBlock === blk && styles.pillTextActive]}>
                  {blk}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Well Type Row */}
          <Text style={styles.filterTitle}>Well Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroller}>
            {wellTypes.map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.pill, selectedType === type && styles.pillActive]}
                onPress={() => setSelectedType(type)}
              >
                <Text style={[styles.pillText, selectedType === type && styles.pillTextActive]}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <Text style={styles.resultCount}>{filteredWells.length} stations found</Text>

      {/* Virtualized FlatList Grid */}
      <FlatList
        data={filteredWells}
        keyExtractor={(item) => `${item.sheet}_${item.row_idx}`}
        renderItem={renderWellItem}
        contentContainerStyle={styles.listContainer}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No groundwater stations match filters.</Text>
          </View>
        }
      />
    </View>
  );
}

const getStyles = (theme) => {
  const isDark = theme === 'dark';
  const colors = {
    bgApp: isDark ? '#0f172a' : '#f1f5f9',
    bgCard: isDark ? '#1e293b' : '#ffffff',
    borderColor: isDark ? '#334155' : '#cbd5e1',
    textPrimary: isDark ? '#f8fafc' : '#0f172a',
    textSecondary: isDark ? '#94a3b8' : '#475569',
    bgInput: isDark ? '#1e293b' : '#ffffff',
    bgPill: isDark ? 'rgba(15, 23, 42, 0.6)' : '#e2e8f0',
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
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingBottom: 16,
    },
    eyebrow: {
      color: '#38bdf8',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.4,
      marginBottom: 4,
    },
    title: {
      fontSize: 30,
      fontWeight: '900',
      color: colors.textPrimary,
      letterSpacing: -0.8,
    },
    statsLabel: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
      marginTop: 2,
    },
    summaryRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      marginBottom: 14,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 14,
      paddingVertical: 11,
      paddingHorizontal: 12,
      marginRight: 8,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.16 : 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    summaryCardLast: {
      marginRight: 0,
    },
    summaryValue: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: '900',
    },
    monitoredValue: {
      color: '#10b981',
    },
    pendingValue: {
      color: '#f59e0b',
    },
    summaryLabel: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 1,
    },
    searchSection: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    searchField: {
      flex: 1,
      backgroundColor: colors.bgInput,
      borderWidth: 1,
      borderColor: colors.borderColor,
      color: colors.textPrimary,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      marginRight: 8,
    },
    filterToggleBtn: {
      backgroundColor: colors.bgInput,
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 12,
    },
    filterToggleActive: {
      borderColor: '#0284c7',
      backgroundColor: isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(2, 132, 199, 0.08)',
    },
    filterToggleText: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    resultCount: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      paddingHorizontal: 16,
      marginBottom: 10,
    },
    advancedFiltersBox: {
      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.6)',
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
      paddingBottom: 16,
      marginBottom: 16,
    },
    filterTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: 16,
      marginTop: 10,
      marginBottom: 6,
    },
    pillScroller: {
      paddingLeft: 16,
    },
    pill: {
      backgroundColor: colors.bgPill,
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 20,
      paddingVertical: 6,
      paddingHorizontal: 12,
      marginRight: 8,
      marginBottom: 4,
    },
    pillActive: {
      backgroundColor: '#0284c7',
      borderColor: '#0284c7',
    },
    pillText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    pillTextActive: {
      color: '#ffffff',
    },
    listContainer: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    wellCard: {
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 18,
      padding: 16,
      marginBottom: 14,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.18 : 0.07,
      shadowRadius: 10,
      elevation: 3,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
      paddingBottom: 8,
      marginBottom: 10,
    },
    wellNumber: {
      fontSize: 18,
      fontWeight: '900',
      color: colors.textPrimary,
    },
    statusBadge: {
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: 20,
      borderWidth: 1,
    },
    statusBadgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    cardBody: {
      marginBottom: 12,
    },
    locationText: {
      fontSize: 16,
      color: colors.textPrimary,
      fontWeight: '700',
      marginBottom: 10,
    },
    cardRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      marginBottom: 6,
    },
    cardMeta: {
      width: '50%',
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    metaValue: {
      color: colors.textPrimary,
      fontWeight: '600',
    },
    highlightText: {
      color: '#38bdf8',
    },
    successText: {
      color: '#10b981',
      fontWeight: '700',
    },
    cardActionBtn: {
      backgroundColor: isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(2, 132, 199, 0.08)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(56, 189, 248, 0.3)' : 'rgba(2, 132, 199, 0.25)',
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: 'center',
    },
    cardActionText: {
      color: isDark ? '#38bdf8' : '#0284c7',
      fontSize: 14,
      fontWeight: '800',
    },
    emptyBox: {
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 16,
    },
  });
};
