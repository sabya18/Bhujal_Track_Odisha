import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StatusBar
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

const GOOGLE_NEWS_RSS_URL = 'https://news.google.com/rss/search?q=groundwater+india+OR+groundwater+global&hl=en-IN&gl=IN&ceid=IN:en';
const CACHE_KEY = 'gw_news_cache';

// Helper to format dates to relative time
const formatRelativeTime = (dateStr) => {
  try {
    const timestamp = Date.parse(dateStr);
    if (isNaN(timestamp)) return dateStr;
    const now = Date.now();
    const diff = now - timestamp;
    
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
};

// Helper to parse title and source from Google News title format
const parseTitleAndSource = (rawTitle, itemAuthor) => {
  let title = rawTitle || '';
  let source = itemAuthor || 'Google News';

  // Google News titles usually end with " - Source Name"
  const dashIdx = title.lastIndexOf(' - ');
  if (dashIdx > 0) {
    const parsedSource = title.substring(dashIdx + 3).trim();
    const parsedTitle = title.substring(0, dashIdx).trim();
    if (parsedSource && parsedTitle) {
      title = parsedTitle;
      source = parsedSource;
    }
  } else {
    const pipeIdx = title.lastIndexOf(' | ');
    if (pipeIdx > 0) {
      const parsedSource = title.substring(pipeIdx + 3).trim();
      const parsedTitle = title.substring(0, pipeIdx).trim();
      if (parsedSource && parsedTitle) {
        title = parsedTitle;
        source = parsedSource;
      }
    }
  }
  return { title, source };
};

// Helper to parse RSS XML tags manually
const parseRssXml = (xmlString) => {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xmlString)) !== null) {
    const itemContent = match[1];
    
    const getTagContent = (tag) => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i');
      const tagMatch = itemContent.match(regex);
      if (tagMatch) {
        return tagMatch[1]
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .trim();
      }
      return '';
    };

    const title = getTagContent('title');
    const link = getTagContent('link');
    const pubDate = getTagContent('pubDate');
    const source = getTagContent('source') || 'Google News';

    if (title && link) {
      items.push({
        title,
        link,
        pubDate,
        source
      });
    }
  }
  return items;
};

export default function NewsScreen({ theme, toggleTheme, onClose }) {
  const styles = getStyles(theme);
  const isDark = theme === 'dark';
  
  const [newsList, setNewsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  
  // WebView state for reading full article
  const [activeArticleUrl, setActiveArticleUrl] = useState(null);
  const [webViewLoading, setWebViewLoading] = useState(false);

  // Load news from local AsyncStorage cache on startup
  const loadCachedNews = async () => {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.sort((a, b) => {
          const timeA = a.pubDate ? Date.parse(a.pubDate) : 0;
          const timeB = b.pubDate ? Date.parse(b.pubDate) : 0;
          return timeB - timeA;
        });
        setNewsList(parsed);
      }
    } catch (err) {
      console.warn('Failed to load cached news:', err);
    }
  };

  // Fetch news from Google News RSS feed directly and parse XML
  const fetchNews = async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    try {
      const response = await fetch(GOOGLE_NEWS_RSS_URL);
      const xmlString = await response.text();
      
      const parsedItems = parseRssXml(xmlString);
      
      if (parsedItems.length > 0) {
        const parsedArticles = parsedItems.map((item, idx) => {
          const { title, source } = parseTitleAndSource(item.title, item.source);
          return {
            id: item.link || String(idx),
            title: title,
            link: item.link,
            pubDate: item.pubDate,
            source: source
          };
        });

        // Sort articles by publication date in descending order (latest first)
        parsedArticles.sort((a, b) => {
          const timeA = a.pubDate ? Date.parse(a.pubDate) : 0;
          const timeB = b.pubDate ? Date.parse(b.pubDate) : 0;
          return timeB - timeA;
        });

        setNewsList(parsedArticles);
        setIsOfflineMode(false);
        // Save latest news to cache (limit to 35 items)
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(parsedArticles.slice(0, 35)));
      } else {
        throw new Error('No articles parsed from Google News RSS XML');
      }
    } catch (err) {
      console.log('Fetch error, loading offline cache:', err);
      setIsOfflineMode(true);
      await loadCachedNews();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Load cache first, then fetch live updates
    const initNews = async () => {
      await loadCachedNews();
      fetchNews();
    };
    initNews();
  }, []);

  const handleRefresh = useCallback(() => {
    fetchNews(true);
  }, []);

  const renderNewsCard = ({ item }) => {
    return (
      <TouchableOpacity
        style={styles.newsCard}
        onPress={() => setActiveArticleUrl(item.link)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>{item.source}</Text>
          </View>
          <Text style={styles.cardMeta}>{formatRelativeTime(item.pubDate)}</Text>
        </View>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.readMoreText}>Read Article →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {onClose && (
            <TouchableOpacity style={styles.backBtn} onPress={onClose}>
              <Text style={styles.backBtnText}>✕ Close</Text>
            </TouchableOpacity>
          )}
          <View style={{ marginLeft: onClose ? 12 : 0 }}>
            <Text style={styles.title}>Groundwater News</Text>
            <Text style={styles.subtitle}>India & Global updates</Text>
          </View>
        </View>
        {!onClose && (
          <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
            <Text style={styles.themeToggleIcon}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Offline Status Badge */}
      {isOfflineMode && (
        <View style={styles.offlineAlert}>
          <Text style={styles.offlineAlertText}>📶 Currently Offline — Showing Cached Articles</Text>
        </View>
      )}

      {/* Feed List */}
      {loading && newsList.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>Fetching latest groundwater news...</Text>
        </View>
      ) : (
        <FlatList
          data={newsList}
          keyExtractor={(item) => item.id}
          renderItem={renderNewsCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#38bdf8"
              colors={['#38bdf8']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No articles found.</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => fetchNews()}>
                <Text style={styles.retryBtnText}>Retry Fetch</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* In-App Reading Webview Modal */}
      <Modal
        visible={activeArticleUrl !== null}
        animationType="slide"
        onRequestClose={() => setActiveArticleUrl(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          {/* WebView Navigation Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setActiveArticleUrl(null)}
            >
              <Text style={styles.closeBtnText}>✕ Close Article</Text>
            </TouchableOpacity>
            {webViewLoading && (
              <ActivityIndicator size="small" color="#38bdf8" style={styles.webViewLoader} />
            )}
          </View>
          
          {/* Article WebView */}
          {activeArticleUrl && (
            <WebView
              source={{ uri: activeArticleUrl }}
              style={styles.webView}
              onLoadStart={() => setWebViewLoading(true)}
              onLoadEnd={() => setWebViewLoading(false)}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={StyleSheet.absoluteFill}>
                  <ActivityIndicator size="large" color="#38bdf8" style={{ marginTop: 50 }} />
                </View>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
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
    accent: '#38bdf8',
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
      paddingTop: Platform.OS === 'ios' ? 20 : 40,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
    },
    backBtn: {
      backgroundColor: isDark ? '#334155' : '#e2e8f0',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
    },
    backBtnText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '700',
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
      marginTop: 2,
    },
    themeToggle: {
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 20,
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    themeToggleIcon: {
      fontSize: 16,
    },
    offlineAlert: {
      backgroundColor: '#ea580c',
      paddingVertical: 6,
      alignItems: 'center',
    },
    offlineAlertText: {
      color: '#ffffff',
      fontSize: 11,
      fontWeight: '700',
    },
    loadingBox: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: 16,
      textAlign: 'center',
    },
    listContainer: {
      padding: 16,
      paddingBottom: 32,
    },
    newsCard: {
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    sourceBadge: {
      backgroundColor: isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(2, 132, 199, 0.1)',
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(56, 189, 248, 0.2)' : 'rgba(2, 132, 199, 0.2)',
    },
    sourceBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: isDark ? colors.accent : '#0284c7',
    },
    cardMeta: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
      lineHeight: 22,
      marginBottom: 12,
    },
    cardFooter: {
      alignItems: 'flex-end',
    },
    readMoreText: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? colors.accent : '#0284c7',
    },
    emptyBox: {
      alignItems: 'center',
      paddingVertical: 80,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 14,
      marginBottom: 16,
    },
    retryBtn: {
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    retryBtnText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    modalContainer: {
      flex: 1,
      backgroundColor: colors.bgApp,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      backgroundColor: colors.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
    },
    closeBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: isDark ? '#334155' : '#e2e8f0',
    },
    closeBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    webViewLoader: {
      marginRight: 8,
    },
    webView: {
      flex: 1,
    }
  });
};
