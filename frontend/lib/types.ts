export type Role = "admin" | "viewer";
export type VehicleStatus = "available" | "reserved" | "sold";

export const VEHICLE_STATUSES: VehicleStatus[] = ["available", "reserved", "sold"];

export interface Dealership {
  id: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  dealership: Dealership;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  expires_at: string;
  user: User;
}

export interface Vehicle {
  id: string;
  stock_number: string;
  make: string;
  model: string;
  year: number;
  status: VehicleStatus;
  version: number;
  updated_at: string;
  updated_by_name: string | null;
}

export interface VehicleUpdate {
  make: string;
  model: string;
  year: number;
  status: VehicleStatus;
  /** The version the user loaded before editing. The API rejects the save (409) if stale. */
  version: number;
}

/** Error envelope returned by the API for every non-2xx response. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ConflictDetails {
  your_version: number;
  current: Vehicle;
}

export interface FieldError {
  field: string;
  message: string;
}
