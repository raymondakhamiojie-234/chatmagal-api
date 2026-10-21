import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  BackHandler,
  Platform,
  TouchableOpacity,
  TextInput,
  Modal,
  SafeAreaView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView, WebViewNavigation } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const DEFAULT_URL = 'https://chatmagal.com';
const STORAGE_KEY = '@chatmagal_custom_url';

export default function App() {
  const [appUrl, setAppUrl] = useState<string>(DEFAULT_URL);
  const [loading, setLoading] = useState<boolean>(true);
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [tempUrl, setTempUrl] = useState<string>(DEFAULT_URL);

  const webViewRef = useRef<WebView>(null);

  // Load saved URL on startup
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved) {
        setAppUrl(saved);
        setTempUrl(saved);
      }
    });
  }, []);

  // Handle Android hardware back button
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true; // prevent app from closing
      }
      return false; // let system handle it (exit app)
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [canGoBack]);

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
  };

  const handleSaveUrl = async () => {
    let clean = tempUrl.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    setAppUrl(clean);
    await AsyncStorage.setItem(STORAGE_KEY, clean);
    setShowSettings(false);
    setHasError(false);
    webViewRef.current?.reload();
  };

  const handleResetDefault = async () => {
    setAppUrl(DEFAULT_URL);
    setTempUrl(DEFAULT_URL);
    await AsyncStorage.removeItem(STORAGE_KEY);
    setShowSettings(false);
    setHasError(false);
    webViewRef.current?.reload();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" backgroundColor="#008069" />

      {/* Main Web View Wrapping Chatmagal Web Project */}
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{ uri: appUrl }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          scalesPageToFit={true}
          allowsBackForwardNavigationGestures={true}
          pullToRefreshEnabled={true}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          cacheEnabled={true}
          mixedContentMode="always"
          onNavigationStateChange={handleNavigationStateChange}
          onLoadStart={() => {
            setLoading(true);
            setHasError(false);
          }}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setHasError(true);
          }}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#25D366" />
              <Text style={styles.loadingText}>Opening Chatmagal...</Text>
            </View>
          )}
        />

        {/* Offline / Connection Error Screen */}
        {hasError && (
          <View style={styles.errorOverlay}>
            <Ionicons name="cloud-offline-outline" size={64} color="#ef4444" />
            <Text style={styles.errorTitle}>Cannot connect to Chatmagal</Text>
            <Text style={styles.errorSubtitle}>
              Please check your internet connection or verify the server address.
            </Text>
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => {
                  setHasError(false);
                  webViewRef.current?.reload();
                }}
              >
                <Ionicons name="refresh" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.retryBtnText}>Retry Connection</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.serverConfigBtn}
                onPress={() => setShowSettings(true)}
              >
                <Ionicons name="settings-outline" size={18} color="#0f172a" style={{ marginRight: 6 }} />
                <Text style={styles.serverConfigText}>Change Server</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Floating Server Settings Shortcut */}
        <TouchableOpacity
          style={styles.floatingSettings}
          onPress={() => setShowSettings(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="settings" size={16} color="#64748b" />
        </TouchableOpacity>
      </View>

      {/* Server URL Modal */}
      <Modal visible={showSettings} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Ionicons name="globe-outline" size={24} color="#25D366" />
              <Text style={styles.modalTitle}>App Server Address</Text>
            </View>

            <Text style={styles.modalDesc}>
              By default, the app wraps your live deployment. You can also point it to a local development machine:
            </Text>

            <TextInput
              style={styles.input}
              value={tempUrl}
              onChangeText={setTempUrl}
              placeholder="https://chatmagal.com"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.resetBtn} onPress={handleResetDefault}>
                <Text style={styles.resetBtnText}>Reset to Default</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveUrl}>
                <Text style={styles.saveBtnText}>Connect</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowSettings(false)}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#008069',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    position: 'relative',
  },
  webView: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    zIndex: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 16,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  btnRow: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#25D366',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  serverConfigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  serverConfigText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
  floatingSettings: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalDesc: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  resetBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  resetBtnText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#25D366',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  closeBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  closeBtnText: {
    color: '#94a3b8',
    fontSize: 13,
  },
});
