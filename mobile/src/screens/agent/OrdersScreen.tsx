import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getWorkspaceOrdersApi } from '../../api/client';
import { Order } from '../../types';
import { COLORS } from '../../constants/theme';

export const OrdersScreen = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Pending' | 'In Progress' | 'Completed'>('ALL');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await getWorkspaceOrdersApi();
      setOrders(data);
    } catch (err: any) {
      console.error('Failed to load workspace orders:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const filteredOrders = orders.filter((order) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(query) ||
      order.serviceName.toLowerCase().includes(query) ||
      (order.contact?.name && order.contact.name.toLowerCase().includes(query)) ||
      (order.contact?.phoneNumber && order.contact.phoneNumber.includes(query));

    if (!matchesSearch) return false;
    if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;

    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return { bg: '#d1fae5', text: '#065f46', border: '#a7f3d0' };
      case 'in progress':
      case 'processing':
        return { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' };
      case 'cancelled':
        return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' };
      default: // Pending
        return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' };
    }
  };

  const renderOrderItem = ({ item }: { item: Order }) => {
    const isExpanded = expandedOrderId === item.id;
    const statusStyle = getStatusColor(item.status);
    const dateFormatted = new Date(item.createdAt).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => setExpandedOrderId(isExpanded ? null : item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={styles.orderNumberRow}>
            <Ionicons name="receipt-outline" size={18} color={COLORS.primary} style={{ marginRight: 6 }} />
            <Text style={styles.orderNumber}>{item.orderNumber}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>{item.status}</Text>
          </View>
        </View>

        <Text style={styles.serviceName}>{item.serviceName}</Text>

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Ionicons name="person-outline" size={13} color={COLORS.textSecondary} />
            <Text style={styles.detailText} numberOfLines={1}>
              {item.contact?.name || item.contact?.phoneNumber || 'Customer'}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Ionicons name="calendar-outline" size={13} color={COLORS.textSecondary} />
            <Text style={styles.detailText}>{dateFormatted}</Text>
          </View>
        </View>

        {item.price && (
          <View style={styles.priceContainer}>
            <Text style={styles.priceLabel}>Price Quote:</Text>
            <Text style={styles.priceValue}>{item.price}</Text>
          </View>
        )}

        {/* Expandable Info */}
        {isExpanded && item.details && (
          <View style={styles.expandedContent}>
            <Text style={styles.expandedTitle}>Submitted Request Details:</Text>
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
          <Text style={styles.expandText}>{isExpanded ? 'Hide Details' : 'View Details'}</Text>
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
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={COLORS.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by order #, service, customer..."
          placeholderTextColor={COLORS.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['ALL', 'Pending', 'In Progress', 'Completed'] as const).map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[styles.filterPill, statusFilter === filter && styles.filterPillActive]}
            onPress={() => setStatusFilter(filter)}
          >
            <Text style={[styles.filterText, statusFilter === filter && styles.filterTextActive]}>
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Orders List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="cube-outline" size={54} color={COLORS.textLight} />
          <Text style={styles.emptyTitle}>No orders found</Text>
          <Text style={styles.emptySubtitle}>Orders submitted by customers via WhatsApp will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  filterTextActive: {
    color: '#ffffff',
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
    marginBottom: 8,
  },
  orderNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginBottom: 10,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  detailText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    gap: 6,
  },
  priceLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  priceValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  expandedContent: {
    marginTop: 8,
    paddingTop: 8,
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
    marginTop: 6,
    paddingTop: 6,
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
