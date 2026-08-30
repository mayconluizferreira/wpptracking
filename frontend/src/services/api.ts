import axios from 'axios';
import type {
  Lead,
  Message,
  Settings,
  Stats,
  WebhookLog,
  WebhookUrls,
  LeadFilters,
  Connection,
  TriggerPhrase,
  LeadStatus,
} from '../types';

const api = axios.create({ baseURL: '/api' });

// Attach Bearer token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to /login on 401
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authService = {
  login: (email: string, password: string) =>
    api.post<{ token: string }>('/auth/login', { email, password }),
  register: (companyName: string, email: string, password: string, name?: string) =>
    api.post<{ token: string }>('/auth/register', { companyName, email, password, name }),
  logout: () => api.post('/auth/logout'),
};

// Leads
export const leadsService = {
  list: (params: LeadFilters) =>
    api.get<{ leads: Lead[]; total: number; page: number; limit: number }>('/leads', { params }),

  getById: (id: number) => api.get<Lead>(`/leads/${id}`),

  update: (id: number, data: { status?: string; nome?: string; valor?: number; moeda?: string }) =>
    api.patch<Lead>(`/leads/${id}`, data),

  getMessages: (id: number, page = 1, limit = 50) =>
    api.get<{ messages: Message[]; total: number }>(`/leads/${id}/messages`, {
      params: { page, limit },
    }),
};

// Settings
export const settingsService = {
  get: () => api.get<Settings>('/settings'),
  save: (data: Partial<Settings>) => api.post('/settings', data),
  getWebhookUrls: () => api.get<WebhookUrls>('/settings/webhook-urls'),
  testMeta: () => api.post<{ ok: boolean; pixelId?: string; name?: string; error?: string }>('/settings/test-meta'),
};

// Stats
export const statsService = {
  get: () => api.get<Stats>('/stats'),
};

// Connections
export const connectionsService = {
  list: () => api.get<Connection[]>('/connections'),
  create: (data: Partial<Connection>) => api.post<Connection>('/connections', data),
  update: (id: number, data: Partial<Connection>) => api.patch<Connection>(`/connections/${id}`, data),
  remove: (id: number) => api.delete(`/connections/${id}`),
};

// Trigger Phrases
export const triggerPhrasesService = {
  list: () => api.get<TriggerPhrase[]>('/trigger-phrases'),
  create: (data: { status: LeadStatus; phrase: string }) =>
    api.post<TriggerPhrase>('/trigger-phrases', data),
  delete: (id: number) => api.delete(`/trigger-phrases/${id}`),
};

// Logs
export const logsService = {
  list: (params: { source?: string; processed?: string; page?: number; limit?: number }) =>
    api.get<{ logs: WebhookLog[]; total: number }>('/logs', { params }),
};
