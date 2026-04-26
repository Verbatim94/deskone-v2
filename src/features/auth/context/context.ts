import { createContext } from "react";

import type { LoginInput, OrganizationSummary, SessionResponse, SessionUser } from "@/features/auth/types";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type AuthContextValue = {
  status: AuthStatus;
  user: SessionUser | null;
  session: SessionResponse | null;
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
  activeOrganization: OrganizationSummary | null;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<SessionResponse>;
  logout: () => Promise<void>;
  revokeAllSessions: () => Promise<void>;
  refreshSession: () => Promise<SessionResponse | null>;
  setActiveOrganizationId: (organizationId: string) => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
