/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROXY_SERVER_BASE_URL?: string;
  readonly VITE_PROXY_SERVER_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
