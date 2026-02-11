export const CANISTER_ID_BACKEND = import.meta.env.VITE_CANISTER_ID_BACKEND || '';
export const CANISTER_ID_INTERNET_IDENTITY = import.meta.env.VITE_CANISTER_ID_INTERNET_IDENTITY || '';
export const DFX_NETWORK = import.meta.env.VITE_DFX_NETWORK || 'local';
export const IS_LOCAL = DFX_NETWORK !== 'ic';
export const ICP_HOST = IS_LOCAL ? 'http://127.0.0.1:4943' : 'https://icp-api.io';
