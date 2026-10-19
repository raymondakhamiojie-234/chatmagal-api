import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getClientOrdersApi } from '../../api/client';
import { Order } from '../../types';
import { COLORS } from '../../constants/theme';

export const ClientOrdersScreen = ({ navigation }: any) => {
  const { client } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!client?.id) return;
    try {
      const data = await getClientOrdersApi(client.id);
      setOrders(data);
    } catch (err: any) {
      console.error('Failed to load client orders:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client?.id]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return { bg: '#d1fae5', text: '#065f46', border: '#a7f3d0' };
      case 'in progress':
      case 'processing':
        return { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' };
      case 'cancelled':
        return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' };
      default:
        return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' };
    }
  };

  const renderOrderItem = ({ item }: { item: Order }) => {
    const isExpanded = expandedId === item.id;
    const statusStyle = getStatusColor(item.status);
    const dateFormatted = new Date(item.createdAt).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.orderNumber}>{item.orderNumber}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>{item.status}</Text>
          </View>
        </View>

        <Text style={styles.serviceName}>{item.serviceName}</Text>

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Ionicons name="calendar-outline" size={13} color={COLORS.textSecondary} />
            <Text style={styles.detailText}>{dateFormatted}</Text>
          </View>
          {item.price && (
            <Text style={styles.priceTag}>{item.price}</Text>
          )}
        </View>

        {isExpanded && item.details && (
          <View style={styles.expandedContent}>
            <Text style={styles.expandedTitle}>Order Details & Specifications:</Text>
            {Array.isArray(item.details) ? (
              item.details.map((ans: any, idx: number) => (
                <View key={idx} style={styles.answerItem}>
                  <Text style={styles.answerBullet}>•</Text>
                  <Text style={styles.answerText}>{typeof ans === 'string' ? ans : JSON.stringify(ans)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.answerText}>{JSON.stringify(item.details, null, 2)}</Text>
            )}
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.expandText}>{isExpanded ? 'Hide Details' : 'View Full Details'}</Text>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={COLORS.primary}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Client Header Banner */}
      <View style={styles.profileBanner}>
        <View style={styles.bannerLeft}>
          <Text style={styles.greetingText}>Welcome back, {client?.name || 'Valued Client'}!</Text>
          <Text style={styles.customerIdText}>Customer ID: {client?.customerId || 'N/A'}</Text>
        </View>
        <View style={styles.statusPill}>
          <Ionicons name="shield-checkmark" size={14} color="#065f46" />
          <Text style={styles.statusPillText}>{client?.accountStatus || 'VERIFIED'}</Text>
        </View>
      </View>

      <Text style={styles.sectionHeader}>My Service Requests & Orders</Text>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Fetching your orders...</Text>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="receipt-outline" size={54} color={COLORS.textLight} />
          <Text style={styles.emptyTitle}>No orders placed yet</Text>
          <Text style={styles.emptySubtitle}>
            You can request new services directly through our WhatsApp or in the Support Chat tab.
          </Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  profileBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  bannerLeft: {
    flex: 1,
  },
  greetingText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  customerIdText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d1fae5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065f46',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  priceTag: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  expandedContent: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  expandedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  answerItem: {
    flexDirection: 'row',
    marginTop: 4,
  },
  answerBullet: {
    marginRight: 6,
    color: COLORS.primary,
    fontSize: 14,
  },
  answerText: {
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 4,
  },
  expandText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
});
