import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants/theme';

export const LoginScreen = () => {
  const { loginAgent, loginClient, isLoading, serverUrl, updateServerUrl } = useAuth();
  const [activeTab, setActiveTab] = useState<'AGENT' | 'CLIENT'>('AGENT');

  // Agent Form State
  const [workspaceName, setWorkspaceName] = useState('');
  const [agentPassword, setAgentPassword] = useState('');

  // Client Form State
  const [clientIdentifier, setClientIdentifier] = useState('');
  const [clientPassword, setClientPassword] = useState('');

  // Server Settings Modal
  const [showSettings, setShowSettings] = useState(false);
  const [customUrl, setCustomUrl] = useState(serverUrl);

  const handleAgentLogin = async () => {
    if (!workspaceName.trim() || !agentPassword.trim()) {
      Alert.alert('Required Fields', 'Please enter your Workspace Name and Password.');
      return;
    }
    try {
      await loginAgent(workspaceName.trim(), agentPassword);
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Invalid workspace credentials.');
    }
  };

  const handleClientLogin = async () => {
    if (!clientIdentifier.trim() || !clientPassword.trim()) {
      Alert.alert('Required Fields', 'Please enter your Email or Phone Number and Password.');
      return;
    }
    try {
      await loginClient(clientIdentifier.trim(), clientPassword);
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Invalid credentials or no password set.');
    }
  };

  const handleSaveServerUrl = async () => {
    if (!customUrl.trim()) return;
    await updateServerUrl(customUrl.trim());
    setShowSettings(false);
    Alert.alert('Server Updated', `Active API Endpoint: ${customUrl.trim()}`);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Ionicons name="chatbubbles" size={36} color="#ffffff" />
          </View>
          <Text style={styles.appName}>Chatmagal</Text>
          <Text style={styles.appTagline}>WhatsApp AI & Customer Management</Text>
        </View>

        {/* Role Segmented Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'AGENT' && styles.tabActive]}
            onPress={() => setActiveTab('AGENT')}
          >
            <Ionicons
              name="briefcase-outline"
              size={18}
              color={activeTab === 'AGENT' ? COLORS.primary : COLORS.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === 'AGENT' && styles.tabTextActive]}>
              Agent / Business
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'CLIENT' && styles.tabActive]}
            onPress={() => setActiveTab('CLIENT')}
          >
            <Ionicons
              name="person-outline"
              size={18}
              color={activeTab === 'CLIENT' ? COLORS.primary : COLORS.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === 'CLIENT' && styles.tabTextActive]}>
              Client Portal
            </Text>
          </TouchableOpacity>
        </View>

        {/* Card Container */}
        <View style={styles.card}>
          {activeTab === 'AGENT' ? (
            // AGENT LOGIN
            <View>
              <Text style={styles.formTitle}>Workspace Staff Login</Text>
              <Text style={styles.formSubtitle}>Manage live WhatsApp chats, orders & AI bot</Text>

              <Text style={styles.label}>Workspace Name</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="business-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Falcus Media"
                  placeholderTextColor={COLORS.textLight}
                  value={workspaceName}
                  onChangeText={setWorkspaceName}
                  autoCapitalize="none"
                />
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter workspace password"
                  placeholderTextColor={COLORS.textLight}
                  value={agentPassword}
                  onChangeText={setAgentPassword}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={[styles.loginBtn, isLoading && styles.btnDisabled]}
                onPress={handleAgentLogin}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.loginBtnText}>Sign In to Workspace</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            // CLIENT LOGIN
            <View>
              <Text style={styles.formTitle}>Client Portal Login</Text>
              <Text style={styles.formSubtitle}>Track orders, services & chat with support</Text>

              <Text style={styles.label}>Phone Number or Email</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 23480... or email@domain.com"
                  placeholderTextColor={COLORS.textLight}
                  value={clientIdentifier}
                  onChangeText={setClientIdentifier}
                  autoCapitalize="none"
                />
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your account password"
                  placeholderTextColor={COLORS.textLight}
                  value={clientPassword}
                  onChangeText={setClientPassword}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={[styles.loginBtn, isLoading && styles.btnDisabled]}
                onPress={handleClientLogin}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.loginBtnText}>Access Client Portal</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Server Endpoint Settings Button */}
        <TouchableOpacity style={styles.serverButton} onPress={() => setShowSettings(true)}>
          <Ionicons name="server-outline" size={16} color={COLORS.textSecondary} />
          <Text style={styles.serverButtonText}>API Server: {serverUrl}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Settings Modal */}
      <Modal visible={showSettings} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>API Server Configuration</Text>
            <Text style={styles.modalDesc}>
              Set the backend API URL (e.g. https://chatmagal.com or your local dev server):
            </Text>

            <TextInput
              style={styles.modalInput}
              value={customUrl}
              onChangeText={setCustomUrl}
              placeholder="https://..."
              autoCapitalize="none"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowSettings(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveServerUrl}>
                <Text style={styles.modalSaveText}>Save Server</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  appTagline: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  formSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: COLORS.text,
  },
  loginBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  serverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    gap: 6,
  },
  serverButtonText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 20,
    backgroundColor: '#f8fafc',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalCancelText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  modalSaveBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalSaveText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
