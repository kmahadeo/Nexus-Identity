// Shared type stubs used across the app
export type AuthEvent = {
  id: string;
  type: string;
  timestamp: number;
  ip: string;
  device: string;
  success: boolean;
};

export type PolicyReference = {
  id: string;
  name: string;
};

export type TeamReference = {
  id: string;
  name: string;
};
