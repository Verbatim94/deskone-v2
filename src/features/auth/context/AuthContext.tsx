import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import {
  getActiveSession,
  login as loginRequest,
  logout as logoutRequest,
  revokeAllSessions as revokeAllSessionsRequest,
} from "@/features/auth/api";
import {
  clearActiveOrganizationId,
  persistActiveOrganizationId,
  readActiveOrganizationId,
} from "@/features/auth/session-store";
import type { LoginInput, SessionResponse } from "@/features/auth/types";
import { AuthContext, type AuthContextValue, type AuthStatus } from "@/features/auth/context/context";

function resolveActiveOrganizationId(session: SessionResponse | null, currentOrganizationId: string | null) {
  if (!session?.organizations.length) {
    return null;
  }

  if (
    currentOrganizationId &&
    session.organizations.some((organization) => organization.id === currentOrganizationId)
  ) {
    return currentOrganizationId;
  }

  const storedOrganizationId = readActiveOrganizationId();

  if (
    storedOrganizationId &&
    session.organizations.some((organization) => organization.id === storedOrganizationId)
  ) {
    return storedOrganizationId;
  }

  return session.organizations[0]?.id ?? null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [activeOrganizationId, setActiveOrganizationIdState] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    const nextSession = await getActiveSession();

    startTransition(() => {
      setSession(nextSession);
      setStatus(nextSession ? "authenticated" : "unauthenticated");
      setActiveOrganizationIdState((currentOrganizationId) =>
        resolveActiveOrganizationId(nextSession, currentOrganizationId),
      );
    });

    return nextSession;
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const loginResponse = await loginRequest(input);
    const nextSession: SessionResponse = {
      sessionId: "pending-bootstrap",
      expiresAt: loginResponse.expiresAt,
      identityProviders: loginResponse.identityProviders,
      user: loginResponse.user,
      organizations: loginResponse.organizations,
    };

    startTransition(() => {
      setSession(nextSession);
      setStatus("authenticated");
      setActiveOrganizationIdState(resolveActiveOrganizationId(nextSession, null));
    });

    const hydratedSession = await refreshSession();
    return hydratedSession ?? nextSession;
  }, [refreshSession]);

  const logout = useCallback(async () => {
    await logoutRequest();

    startTransition(() => {
      setSession(null);
      setStatus("unauthenticated");
      setActiveOrganizationIdState(null);
    });

    clearActiveOrganizationId();
  }, []);

  const revokeAllSessions = useCallback(async () => {
    await revokeAllSessionsRequest();

    startTransition(() => {
      setSession(null);
      setStatus("unauthenticated");
      setActiveOrganizationIdState(null);
    });

    clearActiveOrganizationId();
  }, []);

  const setActiveOrganizationId = useCallback(
    (organizationId: string) => {
      if (!session?.organizations.some((organization) => organization.id === organizationId)) {
        return;
      }

      persistActiveOrganizationId(organizationId);
      setActiveOrganizationIdState(organizationId);
    },
    [session],
  );

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const nextSession = await getActiveSession();

      if (!isMounted) {
        return;
      }

      startTransition(() => {
        setSession(nextSession);
        setStatus(nextSession ? "authenticated" : "unauthenticated");
        setActiveOrganizationIdState(resolveActiveOrganizationId(nextSession, null));
      });
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeOrganizationId) {
      clearActiveOrganizationId();
      return;
    }

    persistActiveOrganizationId(activeOrganizationId);
  }, [activeOrganizationId]);

  const activeOrganization = useMemo(
    () => session?.organizations.find((organization) => organization.id === activeOrganizationId) ?? null,
    [activeOrganizationId, session?.organizations],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      organizations: session?.organizations ?? [],
      activeOrganizationId,
      activeOrganization,
      isAuthenticated: status === "authenticated",
      login,
      logout,
      revokeAllSessions,
      refreshSession,
      setActiveOrganizationId,
    }),
    [
      activeOrganization,
      activeOrganizationId,
      login,
      logout,
      refreshSession,
      revokeAllSessions,
      session,
      setActiveOrganizationId,
      status,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
