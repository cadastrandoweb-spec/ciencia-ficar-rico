/// <reference types="vite/client" />

declare global {
  interface Window {
    MercadoPago?: any;
  }
}

interface ImportMetaEnv {
  readonly VITE_MP_PUBLIC_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
