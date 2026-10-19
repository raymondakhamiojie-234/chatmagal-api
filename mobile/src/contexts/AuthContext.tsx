import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserRole, Workspace, ClientProfile } from '../types';
import { DEFAULT_SERVER_URL } from '../constants/theme';
import {
  setServerUrl,
  setAuthToken,
  loginWorkspaceApi,
  clientLoginApi,
  getWorkspaceApi,
} from '../api/client';
import { connectSocket, disconnectSocket } from '../socket/socketService';

interface AuthContextType {
  role: UserRole | null;
  workspace: Workspace | null;
  client: ClientProfile | null;
  token: string | null;
  serverUrl: string;
  isLoading: boolean;
  loginAgent: (name: string, pass: string) => Promise<void>;
  loginClient: (identifier: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  updateServerUrl: (url: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEYS = {
  ROLE: '@chatmagal_role',
  TOKEN: '@chatmagal_token',
  WORKSPACE: '@chatmagal_workspace',
  CLIENT: '@chatmagal_client',
  SERVER_URL: '@chatmagal_server_url',
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<UserRole | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrlState] = useState<string>(DEFAULT_SERVER_URL);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore stored session on mount
  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const storedUrl = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_URL);
        const activeUrl = storedUrl || DEFAULT_SERVER_URL;
        setServerUrlState(activeUrl);
        setServerUrl(activeUrl);

        const storedRole = (await AsyncStorage.getItem(STORAGE_KEYS.ROLE)) as UserRole | null;
        const storedToken = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);

        if (storedRole === 'AGENT' && storedToken) {
          setAuthToken(storedToken);
          setToken(storedToken);
          const storedWs = await AsyncStorage.getItem(STORAGE_KEYS.WORKSPACE);
          if (storedWs) {
            const parsedWs = JSON.parse(storedWs);
            setWorkspace(parsedWs);
            setRole('AGENT');
            connectSocket(activeUrl, { workspaceId: parsedWs.id });
          }
        } else if (storedRole === 'CLIENT') {
          const storedClient = await AsyncStorage.getItem(STORAGE_KEYS.CLIENT);
          if (storedClient) {
            const parsedClient = JSON.parse(storedClient);
            setClient(parsedClient);
            setRole('CLIENT');
            connectSocket(activeUrl, { contactId: parsedClient.id });
          }
        }
      } catch (err) {
        console.warn('Failed to restore session:', err);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrapAsync();
  }, []);

  const loginAgent = async (name: string, pass: string) => {
    setIsLoading(true);
    try {
      const result = await loginWorkspaceApi(name, pass);
      const ws = result.workspace;
      const t = result.token;

      setAuthToken(t);
      setToken(t);
      setWorkspace(ws);
      setRole('AGENT');

      await AsyncStorage.setItem(STORAGE_KEYS.ROLE, 'AGENT');
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, t);
      await AsyncStorage.setItem(STORAGE_KEYS.WORKSPACE, JSON.stringify(ws));

      connectSocket(serverUrl, { workspaceId: ws.id });
    } finally {
      setIsLoading(false);
    }
  };

  const loginClient = async (identifier: string, pass: string) => {
    setIsLoading(true);
    try {
      const result = await clientLoginApi(identifier, pass);
      const c = result.client;

      setClient(c);
      setRole('CLIENT');

      await AsyncStorage.setItem(STORAGE_KEYS.ROLE, 'CLIENT');
      await AsyncStorage.setItem(STORAGE_KEYS.CLIENT, JSON.stringify(c));

      connectSocket(serverUrl, { contactId: c.id });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      disconnectSocket();
      setAuthToken(null);
      setRole(null);
      setWorkspace(null);
      setClient(null);
      setToken(null);

      await AsyncStorage.removeItem(STORAGE_KEYS.ROLE);
      await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
      await AsyncStorage.removeItem(STORAGE_KEYS.WORKSPACE);
      await AsyncStorage.removeItem(STORAGE_KEYS.CLIENT);
    } finally {
      setIsLoading(false);
    }
  };

  const updateServerUrl = async (newUrl: string) => {
    const cleaned = newUrl.trim();
    setServerUrlState(cleaned);
    setServerUrl(cleaned);
    await AsyncStorage.setItem(STORAGE_KEYS.SERVER_URL, cleaned);
    disconnectSocket();
    if (role === 'AGENT' && workspace) {
      connectSocket(cleaned, { workspaceId: workspace.id });
    } else if (role === 'CLIENT' && client) {
      connectSocket(cleaned, { contactId: client.id });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        role,
        workspace,
        client,
        token,
        serverUrl,
        isLoading,
        loginAgent,
        loginClient,
        logout,
        updateServerUrl,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
