import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { CrossrefResult, ProcurementConversation, ProcurementMessage, ProcurementPart, PriceIntelResult } from '../types';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auth
export const login = async (email: string, password: string) => {
  const { data } = await api.post('/auth/login', { email, password });
  await SecureStore.setItemAsync('access_token', data.access_token);
  return data;
};
export const register = async (email: string, password: string, name?: string) => {
  const { data } = await api.post('/auth/register', { email, password, name });
  await SecureStore.setItemAsync('access_token', data.access_token);
  return data;
};
export const logout = async () => { await SecureStore.deleteItemAsync('access_token'); };
export const getToken = () => SecureStore.getItemAsync('access_token');

// Vendors / Search
export const searchParts = async (query: string) => {
  const { data } = await api.get('/vendors/search', { params: { q: query } });
  return data;
};
export const getPricesForPart = async (partNumber: string) => {
  const { data } = await api.get(`/vendors/prices/${encodeURIComponent(partNumber)}`);
  return data;
};

// Quotes
export const getQuotes = async () => { const { data } = await api.get('/quotes'); return data; };
export const getQuote = async (id: string) => { const { data } = await api.get(`/quotes/${id}`); return data; };
export const createQuote = async (title: string, notes?: string) => {
  const { data } = await api.post('/quotes', { title, notes }); return data;
};
export const addLineItem = async (quoteId: string, item: {
  partNumber: string; vendorSlug: string; vendorName: string;
  vendorSku?: string; description?: string; quantity: number;
  unitPrice: number; availability?: string; leadTimeDays?: number; productUrl?: string;
}) => { const { data } = await api.post(`/quotes/${quoteId}/items`, item); return data; };
export const removeLineItem = async (quoteId: string, itemId: string) => {
  const { data } = await api.delete(`/quotes/${quoteId}/items/${itemId}`); return data;
};
export const deleteQuote = async (id: string) => { const { data } = await api.delete(`/quotes/${id}`); return data; };

// Vision
export const identifyPart = async (base64Image: string, mode: 'label' | 'part') => {
  const { data } = await api.post('/vision/identify', { image: base64Image, mode });
  return data as { partNumber: string; manufacturer: string; description: string; confidence: string };
};

// Alerts
export const getAlerts = async () => { const { data } = await api.get('/alerts'); return data; };
export const createAlert = async (alert: { partNumber: string; vendorSlug?: string; alertType: string; thresholdValue?: number }) => {
  const { data } = await api.post('/alerts', alert); return data;
};
export const toggleAlert = async (id: string) => { const { data } = await api.patch(`/alerts/${id}/toggle`); return data; };
export const deleteAlert = async (id: string) => { const { data } = await api.delete(`/alerts/${id}`); return data; };

// Cross-referencing
export const findEquivalents = async (
  partNumber: string,
  manufacturer?: string,
  description?: string,
): Promise<CrossrefResult> => {
  const { data } = await api.post('/crossref', { partNumber, manufacturer, description });
  return data as CrossrefResult;
};

// Procurement
export const createConversation = async (): Promise<ProcurementConversation> => {
  const { data } = await api.post('/procurement');
  return data as ProcurementConversation;
};
export const getConversations = async (): Promise<ProcurementConversation[]> => {
  const { data } = await api.get('/procurement');
  return data as ProcurementConversation[];
};
export const getConversation = async (id: string): Promise<ProcurementConversation> => {
  const { data } = await api.get(`/procurement/${id}`);
  return data as ProcurementConversation;
};
export const sendProcurementMessage = async (
  id: string,
  content: string,
  imageBase64?: string,
): Promise<ProcurementMessage> => {
  const { data } = await api.post(`/procurement/${id}/messages`, {
    content,
    ...(imageBase64 ? { imageBase64 } : {}),
  });
  return data as ProcurementMessage;
};
export const deleteProcurementConversation = async (id: string): Promise<void> => {
  await api.delete(`/procurement/${id}`);
};

// Price Intelligence
export const analyzePrices = async (
  partNumber: string,
  description: string | undefined,
  prices: { vendorName: string; price: number; source: string }[],
): Promise<PriceIntelResult> => {
  const { data } = await api.post('/price-intel', { partNumber, description, prices });
  return data as PriceIntelResult;
};

export default api;
