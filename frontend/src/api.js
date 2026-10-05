import axios from 'axios';

export const isPublicAuthRequest = (url = '') =>
  /(?:^|\/)auth\/(?:login|esqueci-senha|reset-senha)(?:[/?#]|$)/.test(url);

const renderBackendUrl = 'https://erp-construtora-back.onrender.com';
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

const normalizeApiBaseUrl = (value) => {
  if (!value) return value;
  const withoutTrailingSlash = value.replace(/\/$/, '');
  return withoutTrailingSlash.endsWith('/api') ? withoutTrailingSlash : `${withoutTrailingSlash}/api`;
};

const resolveApiBaseUrl = () => {
  if (configuredApiUrl) return normalizeApiBaseUrl(configuredApiUrl);

  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/api';
  }

  if (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com')) {
    return `${renderBackendUrl}/api`;
  }

  return '/api';
};

const api = axios.create({
  baseURL: resolveApiBaseUrl()
});

// Injeta token JWT em toda requisicao
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !isPublicAuthRequest(err.config?.url)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    if (import.meta.env.DEV) {
      console.error('[API Error]', err.config?.url, err.response?.status, err.response?.statusText, err.message);
    }
    return Promise.reject(err);
  }
);

export const fmtMoeda = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

export const fmtData = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '-';



export default api;
