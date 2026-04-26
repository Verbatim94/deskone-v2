import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "@/features/auth/context/useAuth";

export function PublicOnlyRoute({ children }: PropsWithChildren) {
  const { status, isAuthenticated, session } = useAuth();

  if (status === "loading") {
    return null;
  }

  if (isAuthenticated) {
    if (session?.user.mustChangePassword) {
      return <Navigate to="/set-password" replace />;
    }

    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
