import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "@/features/auth/context/useAuth";

export function PublicOnlyRoute({ children }: PropsWithChildren) {
  const { status, isAuthenticated } = useAuth();

  if (status === "loading") {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
