export const COLORS = {
  primary: '#2563eb', // Chatmagal Brand Blue
  primaryDark: '#1d4ed8',
  primaryLight: '#dbeafe',
  secondary: '#0f172a',
  background: '#f8fafc',
  card: '#ffffff',
  text: '#0f172a',
  textSecondary: '#64748b',
  textLight: '#94a3b8',
  border: '#e2e8f0',
  borderDark: '#cbd5e1',
  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  danger: '#ef4444',
  dangerLight: '#fee2e2',
  info: '#06b6d4',
  infoLight: '#cffafe',
  chatBubbleIn: '#f1f5f9',
  chatBubbleOut: '#2563eb',
  chatTextOut: '#ffffff',
  chatTextIn: '#0f172a',
  badgeBot: '#10b981',
  badgeHuman: '#f59e0b',
};

export const SENTIMENT_COLORS: Record<string, { bg: string; text: string }> = {
  HAPPY: { bg: '#d1fae5', text: '#065f46' },
  NEUTRAL: { bg: '#f1f5f9', text: '#475569' },
  ANGRY: { bg: '#fee2e2', text: '#991b1b' },
  URGENT: { bg: '#ffedd5', text: '#9a3412' },
};

export const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  URGENT: { bg: '#fee2e2', text: '#b91c1c' },
  HIGH: { bg: '#fef3c7', text: '#92400e' },
  STANDARD: { bg: '#e0f2fe', text: '#0369a1' },
};

export const DEFAULT_SERVER_URL = 'https://chatmagal.com';
