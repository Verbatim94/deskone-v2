import { NavLink, Outlet } from "react-router-dom";
import {
  DoorClosed,
  Home,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  NotebookTabs,
  Settings2,
  Shield,
} from "lucide-react";

import deskoneLogo from "@/assets/deskone-logo.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/context/useAuth";
import type { AppRole } from "@/features/auth/types";
import { cn } from "@/lib/utils";

const navigation = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/rooms", label: "Rooms", icon: LayoutGrid },
  { to: "/my-bookings", label: "My bookings", icon: NotebookTabs },
  { to: "/offices", label: "Offices", icon: DoorClosed },
  { to: "/reports", label: "Support", icon: LifeBuoy },
  { to: "/super-admin", label: "Platform", icon: Shield, minimumRole: "super_admin" as AppRole },
  { to: "/admin-studio", label: "Workspace Admin", icon: Settings2, minimumRole: "admin" as AppRole },
] as const;

const roleRank: Record<AppRole, number> = {
  user: 0,
  admin: 1,
  super_admin: 2,
};

export function AppShell() {
  const {
    user,
    logout,
    revokeAllSessions,
    organizations,
    activeOrganizationId,
    activeOrganization,
    setActiveOrganizationId,
  } = useAuth();
  const visibleNavigation = navigation.filter((item) => {
    if (!item.minimumRole || !user) {
      return true;
    }

    return roleRank[user.role] >= roleRank[item.minimumRole];
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.12),_transparent_24%),linear-gradient(180deg,_#f8fbff,_#f7f8fb_48%,_#f8fafc)] text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-4 sm:px-6 lg:flex-row lg:px-8">
        <aside className="mb-6 shrink-0 rounded-[2rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.72))] p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur lg:mb-0 lg:w-[320px] lg:p-6">
          <div className="flex items-center gap-4">
            <img
              src={deskoneLogo}
              alt="Deskone"
              className="h-14 w-14 rounded-2xl border border-slate-200/70 bg-white object-contain p-2 shadow-sm"
            />
            <div>
              <Badge className="rounded-full bg-sky-100 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-100">
                Deskone
              </Badge>
              <p className="mt-3 text-xl font-semibold tracking-tight text-slate-950">Workspace operating system</p>
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-[1.8rem] border border-slate-900/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.88))] p-5 text-slate-50">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.24em] text-sky-200/90">Today</p>
              <Badge className="rounded-full bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-100 hover:bg-white/10">
                Live
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              Booking, offices, support and workspace administration now live in one calmer, more premium product
              surface.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">User</p>
                <p className="mt-1 text-sm font-medium text-white">{user?.displayName ?? user?.username ?? "Guest"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Environment</p>
                <p className="mt-1 text-sm font-medium text-white">{activeOrganization?.name ?? "Not selected"}</p>
              </div>
            </div>
          </div>

          <nav className="mt-8 grid gap-2">
            {visibleNavigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "rounded-2xl border px-4 py-3 text-sm font-medium transition-all",
                    isActive
                      ? "border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.9),rgba(255,255,255,0.98))] text-sky-800 shadow-sm"
                      : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950",
                  )
                }
              >
                <span className="flex items-center gap-3">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-8 rounded-[1.6rem] border border-slate-200/80 bg-white/90 p-5 text-sm text-slate-700">
            <p className="font-semibold text-slate-950">Active environment</p>
            <p className="mt-2 leading-6 text-slate-600">
              Each organization stays isolated by design, so rooms, offices, groups and support workflows scale
              cleanly without cross-environment leakage.
            </p>
          </div>

          <div className="mt-8 rounded-[1.6rem] border border-slate-200/80 bg-white p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Environment</p>
            <p className="mt-3 text-base font-semibold text-slate-950">{activeOrganization?.name ?? "No organization yet"}</p>
            <p className="mt-1 text-sm text-slate-500">
              {activeOrganization
                ? `${activeOrganization.slug} · ${activeOrganization.membershipRole}`
                : "Choose the workspace you want to operate in."}
            </p>
            <select
              className="mt-4 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-sky-300"
              value={activeOrganizationId ?? ""}
              onChange={(event) => setActiveOrganizationId(event.target.value)}
              disabled={!organizations.length}
            >
              {organizations.length ? null : <option value="">No organization available</option>}
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name} ({organization.membershipRole})
                </option>
              ))}
            </select>
          </div>

          <div className="mt-8 rounded-[1.6rem] border border-slate-200/80 bg-white p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Signed in</p>
            <p className="mt-3 text-base font-semibold text-slate-950">{user?.displayName ?? user?.fullName ?? "Unknown user"}</p>
            <p className="mt-1 text-sm text-slate-600">{user?.username ?? "unknown"} · {user?.role ?? "unknown"}</p>
            <p className="mt-1 text-sm text-slate-500">{user?.email ?? "No email linked yet"}</p>
            <p className="mt-1 text-sm text-slate-500">
              {user?.role === "super_admin" ? "Platform governance enabled" : "Organization-scoped access"}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full rounded-xl border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              onClick={() => void revokeAllSessions()}
            >
              Revoke all sessions
            </Button>
          </div>
        </aside>

        <main className="flex-1 lg:pl-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
