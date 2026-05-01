import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppShell } from "@/app/shell/AppShell";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { PublicOnlyRoute } from "@/features/auth/components/PublicOnlyRoute";

const HomePage = lazy(() => import("@/pages/HomePage"));
const AdminStudioPage = lazy(() => import("@/pages/AdminStudioPage"));
const InsightPage = lazy(() => import("@/pages/InsightPage"));
const MyBookingsPage = lazy(() => import("@/pages/MyBookingsPage"));
const OfficeModulePage = lazy(() => import("@/pages/OfficeModulePage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));
const PendingApprovalsPage = lazy(() => import("@/pages/PendingApprovalsPage"));
const PlannerPage = lazy(() => import("@/pages/PlannerPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const RoomsPage = lazy(() => import("@/pages/RoomsPage"));
const SuperAdminConsolePage = lazy(() => import("@/pages/SuperAdminConsolePage"));
const SetPasswordPage = lazy(() => import("@/pages/SetPasswordPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center rounded-[2rem] border border-slate-200/80 bg-white/80 text-sm text-slate-500 shadow-sm">
      Loading v2 workspace...
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/set-password"
            element={
              <ProtectedRoute allowPasswordSetup>
                <SetPasswordPage />
              </ProtectedRoute>
            }
          />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<HomePage />} />
            <Route path="/calendar" element={<MyBookingsPage />} />
            <Route path="/my-bookings" element={<MyBookingsPage />} />
            <Route path="/shared-rooms" element={<RoomsPage />} />
            <Route path="/rooms" element={<RoomsPage />} />
            <Route path="/reservations" element={<MyBookingsPage />} />
            <Route path="/calendar-view" element={<MyBookingsPage />} />
            <Route
              path="/super-admin"
              element={
                <ProtectedRoute requiredRole="super_admin">
                  <SuperAdminConsolePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute requiredRole="super_admin">
                  <SuperAdminConsolePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin-studio"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminStudioPage />
                </ProtectedRoute>
              }
            />
            <Route path="/offices" element={<OfficeModulePage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route
              path="/planner"
              element={
                <ProtectedRoute requiredRole="admin">
                  <PlannerPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/approvals"
              element={
                <ProtectedRoute requiredRole="admin">
                  <PendingApprovalsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/insight"
              element={
                <ProtectedRoute requiredRole="admin">
                  <InsightPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
