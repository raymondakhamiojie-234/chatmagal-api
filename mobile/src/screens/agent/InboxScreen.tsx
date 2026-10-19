import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getContactsApi } from '../../api/client';
import { subscribeToMessages } from '../../socket/socketService';
import { Contact, Message } from '../../types';
import { COLORS, SENTIMENT_COLORS, PRIORITY_COLORS } from '../../constants/theme';

export const InboxScreen = () => {
  const navigation = useNavigation<any>();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'UNREAD' | 'URGENT' | 'HUMAN'>('ALL');

  const fetchContacts = useCallback(async () => {
    try {
      const data = await getContactsApi();
      setContacts(data);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();

    // Subscribe to incoming messages over Socket.IO to refresh conversation list live!
    const unsubscribe = subscribeToMessages((newMessage: Message) => {
      setContacts((prevContacts) => {
        const index = prevContacts.findIndex((c) => c.id === newMessage.contactId);
        if (index !== -1) {
          const updated = [...prevContacts];
          const contact = { ...updated[index] };
          contact.unreadCount = (contact.unreadCount || 0) + (newMessage.direction === 'INBOUND' ? 1 : 0);
          // Move contact to top of list
          updated.splice(index, 1);
          return [contact, ...updated];
        } else {
          // If a brand new contact messaged, re-fetch full list
          fetchContacts();
          return prevContacts;
        }
      });
    });

    return () => {
      unsubscribe();
    };
  }, [fetchContacts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchContacts();
  };

  const filteredContacts = contacts.filter((c) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      (c.name && c.name.toLowerCase().includes(query)) ||
      c.phoneNumber.includes(query) ||
      (c.customerId && c.customerId.toLowerCase().includes(query));

    if (!matchesSearch) return false;

    if (activeFilter === 'UNREAD') return c.unreadCount > 0;
    if (activeFilter === 'URGENT') return c.priority === 'URGENT' || c.sentiment === 'URGENT' || c.sentiment === 'ANGRY';
    if (activeFilter === 'HUMAN') return !c.botEnabled;

    return true;
  });

  const renderContactItem = ({ item }: { item: Contact }) => {
    const sentimentStyle = SENTIMENT_COLORS[item.sentiment] || SENTIMENT_COLORS.NEUTRAL;
    const priorityStyle = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.STANDARD;

    return (
      <TouchableOpacity
        style={styles.contactCard}
        onPress={() => navigation.navigate('Chat', { contact: item })}
        activeOpacity={0.7}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(item.name ? item.name.charAt(0) : item.phoneNumber.slice(-2)).toUpperCase()}
          </Text>
        </View>

        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.contactName} numberOfLines={1}>
              {item.name || item.phoneNumber}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>

          <Text style={styles.contactPhone}>{item.phoneNumber}</Text>

          {/* Badges Row */}
          <View style={styles.badgesRow}>
            {/* Bot Status Badge */}
            <View style={[styles.badge, item.botEnabled ? styles.badgeBotActive : styles.badgeHumanTakeover]}>
              <Ionicons
                name={item.botEnabled ? 'hardware-chip-outline' : 'person-outline'}
                size={11}
                color={item.botEnabled ? '#065f46' : '#92400e'}
              />
              <Text style={[styles.badgeText, { color: item.botEnabled ? '#065f46' : '#92400e' }]}>
                {item.botEnabled ? 'AI Active' : 'Human Only'}
              </Text>
            </View>

            {/* Sentiment Badge */}
            <View style={[styles.badge, { backgroundColor: sentimentStyle.bg }]}>
              <Text style={[styles.badgeText, { color: sentimentStyle.text }]}>{item.sentiment}</Text>
            </View>

            {/* Priority Badge */}
            {item.priority === 'URGENT' && (
              <View style={[styles.badge, { backgroundColor: priorityStyle.bg }]}>
                <Text style={[styles.badgeText, { color: priorityStyle.text }]}>URGENT</Text>
              </View>
            )}

            {/* Account Status */}
            {item.accountStatus === 'VERIFIED' && (
              <View style={[styles.badge, { backgroundColor: '#e0e7ff' }]}>
                <Ionicons name="checkmark-circle" size={11} color="#3730a3" />
                <Text style={[styles.badgeText, { color: '#3730a3' }]}>Verified</Text>
              </View>
            )}
          </View>
        </View>

        <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
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
          placeholder="Search by name, phone or Customer ID..."
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
        {(['ALL', 'UNREAD', 'URGENT', 'HUMAN'] as const).map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[styles.filterPill, activeFilter === filter && styles.filterPillActive]}
            onPress={() => setActiveFilter(filter)}
          >
            <Text style={[styles.filterText, activeFilter === filter && styles.filterTextActive]}>
              {filter === 'ALL'
                ? 'All'
                : filter === 'UNREAD'
                ? 'Unread'
                : filter === 'URGENT'
                ? 'Urgent 🔥'
                : 'Human Takeover'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Conversation List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading conversations...</Text>
        </View>
      ) : filteredContacts.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="chatbubbles-outline" size={54} color={COLORS.textLight} />
          <Text style={styles.emptyTitle}>No conversations found</Text>
          <Text style={styles.emptySubtitle}>Inbound WhatsApp messages will appear here in real-time.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredContacts}
          keyExtractor={(item) => item.id}
          renderItem={renderContactItem}
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
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
  },
  cardContent: {
    flex: 1,
    marginRight: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  contactPhone: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: 6,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  badgeBotActive: {
    backgroundColor: '#d1fae5',
  },
  badgeHumanTakeover: {
    backgroundColor: '#fef3c7',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
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
