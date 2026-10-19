import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SERVER_URL } from '../constants/theme';
import { Workspace, Contact, Message, Order, ClientProfile } from '../types';

let currentServerUrl = DEFAULT_SERVER_URL;
let authToken: string | null = null;

export const setServerUrl = (url: string) => {
  currentServerUrl = url.replace(/\/+$/, '');
  apiClient.defaults.baseURL = `${currentServerUrl}/api`;
};

export const getServerUrl = () => currentServerUrl;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
};

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${currentServerUrl}/api`,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response error handler
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.response?.data?.message || error.message || 'Network error occurred';
    return Promise.reject(new Error(message));
  }
);

// ==========================================
// WORKSPACE / AGENT API
// ==========================================

export const loginWorkspaceApi = async (name: string, password: string): Promise<{ token: string; workspace: Workspace }> => {
  const res = await apiClient.post('/workspaces/login', { name, password });
  return res.data;
};

export const getWorkspaceApi = async (): Promise<Workspace> => {
  const res = await apiClient.get('/workspace');
  return res.data;
};

export const getContactsApi = async (): Promise<Contact[]> => {
  const res = await apiClient.get('/contacts');
  return res.data;
};

export const getMessagesApi = async (contactId: string): Promise<Message[]> => {
  const res = await apiClient.get(`/messages/${contactId}`);
  return res.data;
};

export const sendSupportReplyApi = async (contactId: string, messageText: string): Promise<{ success: boolean; message: Message }> => {
  const res = await apiClient.post('/support/send', { contactId, messageText });
  return res.data;
};

export const toggleContactBotApi = async (contactId: string, botEnabled: boolean): Promise<{ success: boolean; botEnabled: boolean }> => {
  const res = await apiClient.post(`/contacts/${contactId}/bot-toggle`, { botEnabled });
  return res.data;
};

export const getWorkspaceOrdersApi = async (): Promise<Order[]> => {
  const res = await apiClient.get('/orders');
  return res.data.orders || [];
};

// ==========================================
// CLIENT PORTAL API
// ==========================================

export const clientLoginApi = async (identifier: string, password: string): Promise<{ success: boolean; client: ClientProfile; orders: Order[] }> => {
  const res = await apiClient.post('/account/client-login', { identifier, password });
  return res.data;
};

export const getClientOrdersApi = async (contactId: string): Promise<Order[]> => {
  const res = await apiClient.get('/account/client-orders', { params: { contactId } });
  return res.data.orders || [];
};

export const getClientMessagesApi = async (contactId: string): Promise<Message[]> => {
  const res = await apiClient.get('/account/client-messages', { params: { contactId } });
  return res.data.messages || [];
};

export const sendClientMessageApi = async (contactId: string, messageText: string): Promise<{ success: boolean; message: Message }> => {
  const res = await apiClient.post('/account/client-message', { contactId, messageText });
  return res.data;
};
