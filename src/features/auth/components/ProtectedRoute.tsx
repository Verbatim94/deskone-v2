import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/features/auth/context/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import type { AppRole } from "@/features/auth/types";

type ProtectedRouteProps = PropsWithChildren<{
  requiredRole?: AppRole;
  allowPasswordSetup?: boolean;
}>;

const roleRank: Record<AppRole, number> = {
  user: 0,
  admin: 1,
  super_admin: 2,
};

export function ProtectedRoute({ children, requiredRole, allowPasswordSetup = false }: ProtectedRouteProps) {
  const location = useLocation();
  const { status, user, session } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <Card className="w-full max-w-md rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
          <CardContent className="p-8 text-center text-sm text-slate-600">
            Checking your session and preparing the v2 workspace...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status !== "authenticated" || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (session?.user.mustChangePassword && !allowPasswordSetup) {
    return <Navigate to="/set-password" replace />;
  }

  if (requiredRole && roleRank[user.role] < roleRank[requiredRole]) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
