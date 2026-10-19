import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { getMessagesApi, sendSupportReplyApi, toggleContactBotApi } from '../../api/client';
import { subscribeToMessages } from '../../socket/socketService';
import { Contact, Message } from '../../types';
import { COLORS } from '../../constants/theme';

const QUICK_REPLIES = [
  'Hello! How can we assist you today?',
  'Thank you for reaching out to Falcus Media.',
  'We have received your payment and are processing your order.',
  'Could you please provide your page or profile link?',
];

export const ChatScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const initialContact: Contact = route.params?.contact;

  const [contact, setContact] = useState<Contact>(initialContact);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [botToggling, setBotToggling] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // Load message history
  useEffect(() => {
    let isMounted = true;
    const fetchChat = async () => {
      try {
        const data = await getMessagesApi(contact.id);
        if (isMounted) {
          setMessages(data);
        }
      } catch (err: any) {
        console.error('Error fetching chat messages:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchChat();

    // Listen to real-time incoming or outgoing messages for this contact
    const unsubscribe = subscribeToMessages((newMsg: Message) => {
      if (newMsg.contactId === contact.id) {
        setMessages((prev) => {
          // Prevent duplicates
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [contact.id]);

  // Set custom navigation header
  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {contact.name || contact.phoneNumber}
          </Text>
          <Text style={styles.headerSubtitle}>
            {contact.customerId ? `ID: ${contact.customerId} • ` : ''}
            {contact.accountStatus}
          </Text>
        </View>
      ),
      headerRight: () => (
        <TouchableOpacity
          style={[styles.botSwitchBtn, contact.botEnabled ? styles.botBtnActive : styles.botBtnPaused]}
          onPress={handleToggleBot}
          disabled={botToggling}
        >
          {botToggling ? (
            <ActivityIndicator size="small" color={contact.botEnabled ? '#065f46' : '#92400e'} />
          ) : (
            <>
              <Ionicons
                name={contact.botEnabled ? 'hardware-chip' : 'pause-circle'}
                size={14}
                color={contact.botEnabled ? '#065f46' : '#92400e'}
              />
              <Text style={[styles.botSwitchText, { color: contact.botEnabled ? '#065f46' : '#92400e' }]}>
                {contact.botEnabled ? 'AI Active' : 'AI Paused'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      ),
    });
  }, [contact, botToggling]);

  const handleToggleBot = async () => {
    const nextState = !contact.botEnabled;
    setBotToggling(true);
    try {
      await toggleContactBotApi(contact.id, nextState);
      setContact((prev) => ({ ...prev, botEnabled: nextState }));
      Alert.alert(
        nextState ? 'AI Bot Resumed 🤖' : 'Human Takeover Activated 👤',
        nextState
          ? 'The AI bot will now automatically respond to messages from this customer.'
          : 'The AI bot is now paused for this customer. Only human agent replies will be sent.'
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to toggle bot status.');
    } finally {
      setBotToggling(false);
    }
  };

  const handleSendMessage = async () => {
    const textToSend = inputText.trim();
    if (!textToSend || sending) return;

    setInputText('');
    setSending(true);

    try {
      const res = await sendSupportReplyApi(contact.id, textToSend);
      if (res && res.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.message.id)) return prev;
          return [...prev, res.message];
        });
      }
    } catch (err: any) {
      Alert.alert('Failed to Send', err.message || 'Could not send WhatsApp message.');
      setInputText(textToSend); // Restore on error
    } finally {
      setSending(false);
    }
  };

  const renderMessageBubble = ({ item }: { item: Message }) => {
    const isOutbound = item.direction === 'OUTBOUND';
    const textBody =
      item.content?.body ||
      item.content?.text?.body ||
      item.content?.caption ||
      (item.content?.interactive ? 'Interactive Menu Sent' : 'Message');

    const formattedTime = new Date(item.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <View style={[styles.bubbleWrapper, isOutbound ? styles.bubbleRight : styles.bubbleLeft]}>
        <View style={[styles.bubble, isOutbound ? styles.bubbleOutbound : styles.bubbleInbound]}>
          <Text style={[styles.bubbleText, isOutbound ? styles.textOutbound : styles.textInbound]}>
            {textBody}
          </Text>
          <View style={styles.bubbleFooter}>
            <Text style={[styles.timeText, isOutbound ? styles.timeOutbound : styles.timeInbound]}>
              {formattedTime}
            </Text>
            {isOutbound && (
              <Ionicons
                name={item.status === 'READ' ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={item.status === 'READ' ? '#93c5fd' : 'rgba(255,255,255,0.7)'}
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Bot Takeover Banner Notice */}
      {!contact.botEnabled && (
        <View style={styles.banner}>
          <Ionicons name="information-circle" size={16} color="#92400e" />
          <Text style={styles.bannerText}>
            Human agent takeover active. Bot is paused for this conversation.
          </Text>
        </View>
      )}

      {/* Message Feed */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading conversation history...</Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={48} color={COLORS.textLight} />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySubtitle}>Start the conversation below.</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageBubble}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      {/* Quick Reply Suggestions */}
      <View style={styles.quickRepliesContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRepliesScroll}>
          {QUICK_REPLIES.map((reply, index) => (
            <TouchableOpacity
              key={index}
              style={styles.quickReplyChip}
              onPress={() => setInputText(reply)}
            >
              <Text style={styles.quickReplyText} numberOfLines={1}>
                {reply}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Input Bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          placeholder="Type WhatsApp reply..."
          placeholderTextColor={COLORS.textLight}
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSendMessage}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="send" size={18} color="#ffffff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#efeae2', // WhatsApp style warm neutral background
  },
  headerTitleBox: {
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  botSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    marginRight: 10,
  },
  botBtnActive: {
    backgroundColor: '#d1fae5',
  },
  botBtnPaused: {
    backgroundColor: '#fef3c7',
  },
  botSwitchText: {
    fontSize: 11,
    fontWeight: '700',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  bannerText: {
    fontSize: 12,
    color: '#92400e',
    flex: 1,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingBottom: 8,
  },
  bubbleWrapper: {
    marginBottom: 8,
    flexDirection: 'row',
  },
  bubbleLeft: {
    justifyContent: 'flex-start',
  },
  bubbleRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleInbound: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 2,
  },
  bubbleOutbound: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 2,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  textInbound: {
    color: COLORS.text,
  },
  textOutbound: {
    color: '#ffffff',
  },
  bubbleFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
  },
  timeText: {
    fontSize: 10,
  },
  timeInbound: {
    color: COLORS.textLight,
  },
  timeOutbound: {
    color: 'rgba(255,255,255,0.7)',
  },
  quickRepliesContainer: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 6,
  },
  quickRepliesScroll: {
    paddingHorizontal: 12,
    gap: 8,
  },
  quickReplyChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickReplyText: {
    fontSize: 12,
    color: COLORS.text,
    maxWidth: 240,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  sendBtnDisabled: {
    opacity: 0.5,
    backgroundColor: COLORS.textLight,
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
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
});
