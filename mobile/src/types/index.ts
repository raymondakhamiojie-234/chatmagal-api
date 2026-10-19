export type UserRole = 'AGENT' | 'CLIENT';

export interface Workspace {
  id: string;
  name: string;
  businessName?: string;
  subscriptionPlan: string;
  walletBalance: string | number;
  autoDraft: boolean;
  systemTone: string;
}

export interface Contact {
  id: string;
  workspaceId: string;
  phoneNumber: string;
  name?: string | null;
  optInStatus: boolean;
  assignedAgent?: string | null;
  botEnabled: boolean;
  unreadCount: number;
  sentiment: 'HAPPY' | 'NEUTRAL' | 'ANGRY' | 'URGENT' | string;
  priority: 'STANDARD' | 'HIGH' | 'URGENT' | string;
  customerId?: string | null;
  email?: string | null;
  accountStatus: 'GUEST' | 'REGISTERED' | 'VERIFIED' | 'SUSPENDED' | string;
  emailVerified: boolean;
  messages?: Message[];
}

export interface Message {
  id: string;
  workspaceId: string;
  contactId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  lane: 'SUPPORT' | 'MARKETING';
  content: {
    body?: string;
    caption?: string;
    mediaUrl?: string;
    [key: string]: any;
  };
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  createdAt: string;
}

export interface Order {
  id: string;
  workspaceId: string;
  contactId: string;
  orderNumber: string;
  serviceName: string;
  status: string; // 'Pending' | 'In Progress' | 'Completed' | 'Cancelled'
  price?: string | null;
  details?: any;
  createdAt: string;
  contact?: Contact;
}

export interface ClientProfile {
  id: string;
  name?: string | null;
  email?: string | null;
  phoneNumber: string;
  customerId?: string | null;
  accountStatus: string;
  emailVerified: boolean;
  workspaceId: string;
}

export interface AuthState {
  role: UserRole | null;
  token?: string | null;
  workspace?: Workspace | null;
  client?: ClientProfile | null;
  isLoading: boolean;
  serverUrl: string;
}
