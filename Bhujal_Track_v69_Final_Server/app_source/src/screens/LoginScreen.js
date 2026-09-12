import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  SafeAreaView, 
  ActivityIndicator, 
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen({ onLoginSuccess, theme, serverUrl, onSaveServerUrl }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [localUrl, setLocalUrl] = useState(serverUrl);

  useEffect(() => {
    if (serverUrl) {
      setLocalUrl(serverUrl);
    }
  }, [serverUrl]);

  const isDark = theme === 'dark';

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("Required Fields", "Please enter both username and password.");
      return;
    }

    setLoading(true);
    
    // Fallback credentials matching server
    const localUsername = "GWD_ODISHA";
    const localPassword = "PASSWORD_2026";

    try {
      let authSuccess = false;
      let onlineToken = null;

      // 1. Attempt online authentication against server backend if reachable
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

        const base = serverUrl || '';
        const response = await fetch(`${base.replace(/\/$/, '')}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password: password.trim() }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          authSuccess = true;
          const data = await response.json();
          if (data && data.token) {
            onlineToken = data.token;
          }
        }
      } catch (err) {
        console.log("Online authentication failed or timed out, falling back to offline validation.");
      }

      // 2. Fallback to offline local validation if online failed
      if (!authSuccess) {
        if (username.trim() === localUsername && password.trim() === localPassword) {
          authSuccess = true;
        }
      }

      if (authSuccess) {
        // Save login state locally in storage
        await AsyncStorage.setItem('user_session', JSON.stringify({
          username: username.trim(),
          token: onlineToken,
          loginTime: new Date().toISOString()
        }));
        onLoginSuccess(username.trim());
      } else {
        Alert.alert("Authentication Failed", "Invalid username or password. Please try again.");
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "An unexpected error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  const bgStyle = { backgroundColor: isDark ? '#0f172a' : '#f8fafc' };
  const cardBgStyle = { backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0' };
  const textStyle = { color: isDark ? '#f8fafc' : '#0f172a' };
  const subTextStyle = { color: isDark ? '#94a3b8' : '#64748b' };
  const inputBgStyle = { 
    backgroundColor: isDark ? '#0f172a' : '#f1f5f9', 
    color: isDark ? '#f8fafc' : '#0f172a',
    borderColor: isDark ? '#334155' : '#cbd5e1'
  };

  return (
    <SafeAreaView style={[styles.container, bgStyle]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.logoIcon}>💧</Text>
            <Text style={[styles.logoText, textStyle]}>Bhujal Track</Text>
            <Text style={[styles.subtitle, subTextStyle]}>Groundwater Monitor & Sync Panel</Text>
          </View>

          <View style={[styles.card, cardBgStyle]}>
            <Text style={[styles.cardTitle, textStyle]}>Sign In</Text>
            <Text style={[styles.cardSubtitle, subTextStyle]}>Access offline monitoring database</Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, textStyle]}>Username</Text>
              <TextInput
                style={[styles.input, inputBgStyle]}
                placeholder="Enter username"
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, textStyle]}>Password</Text>
              <TextInput
                style={[styles.input, inputBgStyle]}
                placeholder="Enter password"
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity 
              style={styles.button} 
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Log In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 16,
                padding: 8
              }}
              onPress={() => setShowServerConfig(!showServerConfig)}
            >
              <Text style={{ color: '#0ea5e9', fontSize: 13, fontWeight: '700' }}>
                {showServerConfig ? "Hide Connection Settings" : "Configure Server URL ⚙️"}
              </Text>
            </TouchableOpacity>

            {showServerConfig && (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: isDark ? '#334155' : '#e2e8f0', paddingTop: 12 }}>
                <Text style={[styles.label, textStyle, { marginBottom: 6 }]}>Active Server URL:</Text>
                <TextInput
                  style={[styles.input, inputBgStyle]}
                  value={localUrl}
                  onChangeText={(text) => {
                    setLocalUrl(text);
                    onSaveServerUrl(text);
                  }}
                  placeholder="https://...lhr.life"
                  placeholderTextColor={isDark ? '#475569' : '#94a3b8'}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={{ fontSize: 11, color: isDark ? '#64748b' : '#94a3b8', marginTop: 4, fontStyle: 'italic' }}>
                  Enter your current internet tunnel URL or PC IP address.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, subTextStyle]}>🟢 Offline-First Authentication Enabled</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoIcon: {
    fontSize: 56,
    marginBottom: 12,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: '500',
  },
  button: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#0ea5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
