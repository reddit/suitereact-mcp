export const LOCAL_PROXY_BASE_URL = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_BASE_URL || undefined
  : undefined;

export const LOCAL_PROXY_TOKEN = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_TOKEN || undefined
  : undefined;
