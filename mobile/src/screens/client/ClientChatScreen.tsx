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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getClientMessagesApi, sendClientMessageApi } from '../../api/client';
import { subscribeToMessages } from '../../socket/socketService';
import { Message } from '../../types';
import { COLORS } from '../../constants/theme';

export const ClientChatScreen = () => {
  const { client } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!client?.id) return;
    let isMounted = true;

    const loadChat = async () => {
      try {
        const msgs = await getClientMessagesApi(client.id);
        if (isMounted) setMessages(msgs);
      } catch (err: any) {
        console.error('Failed to load client chat:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadChat();

    // Listen to real-time incoming messages
    const unsubscribe = subscribeToMessages((newMsg: Message) => {
      if (newMsg.contactId === client.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [client?.id]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !client?.id || sending) return;

    setInputText('');
    setSending(true);

    try {
      const res = await sendClientMessageApi(client.id, text);
      if (res && res.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.message.id)) return prev;
          return [...prev, res.message];
        });
      }
    } catch (err: any) {
      Alert.alert('Send Error', err.message || 'Could not send message.');
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const renderBubble = ({ item }: { item: Message }) => {
    // For the client, INBOUND means the client sent it, OUTBOUND means support/bot sent it!
    const isMine = item.direction === 'INBOUND';
    const textBody =
      item.content?.body ||
      item.content?.text?.body ||
      item.content?.caption ||
      (item.content?.interactive ? 'Interactive Menu' : 'Message');

    const formattedTime = new Date(item.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <View style={[styles.bubbleWrapper, isMine ? styles.bubbleRight : styles.bubbleLeft]}>
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={[styles.bubbleText, isMine ? styles.textMine : styles.textTheirs]}>
            {textBody}
          </Text>
          <View style={styles.bubbleFooter}>
            <Text style={[styles.timeText, isMine ? styles.timeMine : styles.timeTheirs]}>
              {formattedTime}
            </Text>
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
      {/* Support Header */}
      <View style={styles.chatHeader}>
        <View style={styles.assistantAvatar}>
          <Ionicons name="sparkles" size={18} color="#ffffff" />
        </View>
        <View>
          <Text style={styles.assistantName}>Falcus Media Support & AI</Text>
          <Text style={styles.assistantStatus}>Online • Typically replies instantly</Text>
        </View>
      </View>

      {/* Message List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Connecting to support chat...</Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="chatbubbles-outline" size={54} color={COLORS.textLight} />
          <Text style={styles.emptyTitle}>How can we help you today?</Text>
          <Text style={styles.emptySubtitle}>
            Ask about your order status, inquire about new services, or speak with an agent.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderBubble}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      {/* Input Bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          placeholder="Type your message..."
          placeholderTextColor={COLORS.textLight}
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
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
    backgroundColor: '#f8fafc',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  assistantAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assistantName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  assistantStatus: {
    fontSize: 12,
    color: COLORS.success,
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
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
  },
  bubbleTheirs: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bubbleMine: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 2,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  textTheirs: {
    color: COLORS.text,
  },
  textMine: {
    color: '#ffffff',
  },
  bubbleFooter: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  timeText: {
    fontSize: 10,
  },
  timeTheirs: {
    color: COLORS.textLight,
  },
  timeMine: {
    color: 'rgba(255,255,255,0.7)',
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
    textAlign: 'center',
    marginTop: 4,
  },
});
