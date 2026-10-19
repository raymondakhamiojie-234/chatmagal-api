import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getWorkspaceApi } from '../../api/client';
import { Workspace } from '../../types';
import { COLORS } from '../../constants/theme';

export const SettingsScreen = () => {
  const { workspace: authWs, logout, serverUrl } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(authWs);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLatest = async () => {
      try {
        setLoading(true);
        const ws = await getWorkspaceApi();
        setWorkspace(ws);
      } catch (e) {
        // Fallback to authWs
      } finally {
        setLoading(false);
      }
    };
    fetchLatest();
  }, []);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out from this workspace?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Workspace Profile Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.logoBadge}>
            <Ionicons name="business" size={28} color="#ffffff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.wsName}>{workspace?.businessName || workspace?.name || 'Workspace'}</Text>
            <Text style={styles.wsPlan}>{workspace?.subscriptionPlan || 'Pro Plan'}</Text>
          </View>
        </View>

        {/* Wallet Balance Widget */}
        <View style={styles.walletBox}>
          <View style={styles.walletInfo}>
            <Ionicons name="wallet-outline" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
            <Text style={styles.walletLabel}>Wallet Balance</Text>
          </View>
          <Text style={styles.walletAmount}>
            ${Number(workspace?.walletBalance || 0).toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Bot & System Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Bot & Tone</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>System Tone</Text>
            <Text style={styles.infoValue}>{workspace?.systemTone || 'Friendly & Professional'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Auto Draft</Text>
            <Text style={styles.infoValue}>{workspace?.autoDraft ? 'Enabled' : 'Disabled'}</Text>
          </View>
        </View>
      </View>

      {/* Connection Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App & Connection</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Server Endpoint</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{serverUrl}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Role</Text>
            <Text style={styles.infoValue}>Staff / Agent</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>App Version</Text>
            <Text style={styles.infoValue}>v1.0.0 (Expo/React Native)</Text>
          </View>
        </View>
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={20} color="#dc2626" style={{ marginRight: 8 }} />
        <Text style={styles.logoutText}>Sign Out from Workspace</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoBadge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  wsName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  wsPlan: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  walletBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  walletInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
  },
  walletAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#166534',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    maxWidth: '60%',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 10,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#dc2626',
  },
});
