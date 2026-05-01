import { NavLink, Outlet } from "react-router-dom";
import {
  CalendarDays,
  DoorClosed,
  Home,
  LineChart,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  NotebookTabs,
  ShieldCheck,
  Settings2,
  Shield,
  SquareCheckBig,
} from "lucide-react";

import deskoneLogo from "@/assets/deskone-logo.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/context/useAuth";
import type { AppRole } from "@/features/auth/types";
import { cn } from "@/lib/utils";

const navigation = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/shared-rooms", label: "Shared Rooms", icon: LayoutGrid },
  { to: "/my-bookings", label: "My Reservations", icon: NotebookTabs },
  { to: "/offices", label: "Offices", icon: DoorClosed },
  { to: "/reports", label: "Support", icon: LifeBuoy },
  { to: "/planner", label: "Planner", icon: CalendarDays, minimumRole: "admin" as AppRole },
  { to: "/approvals", label: "Approvals", icon: SquareCheckBig, minimumRole: "admin" as AppRole },
  { to: "/insight", label: "Insight", icon: LineChart, minimumRole: "admin" as AppRole },
  { to: "/users", label: "Users", icon: ShieldCheck, minimumRole: "super_admin" as AppRole },
  { to: "/super-admin", label: "Platform", icon: Shield, minimumRole: "super_admin" as AppRole },
  { to: "/admin-studio", label: "Rooms Admin", icon: Settings2, minimumRole: "admin" as AppRole },
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
    <div className="min-h-screen text-foreground">
      <div className="mx-auto min-h-screen w-full max-w-[1640px] px-4 py-4 sm:px-6 lg:px-10">
        <header className="border-b border-sky-100/80 bg-white/72 backdrop-blur-xl">
          <div className="flex flex-col gap-4 px-2 py-4 lg:px-1">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center">
                <img
                  src={deskoneLogo}
                  alt="Deskone"
                  className="h-12 w-12 rounded-[1rem] border border-white bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(241,247,255,0.98))] object-contain p-2 shadow-[0_18px_32px_-22px_rgba(55,107,255,0.2)]"
                />
              </div>

              <div className="flex flex-col gap-3 xl:items-end">
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    className="h-10 min-w-[220px] rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-sky-300"
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

                  <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-[0_12px_24px_-18px_rgba(55,107,255,0.14)]">
                    <div className="min-w-0 leading-tight">
                      <p className="truncate text-[15px] font-semibold text-slate-950">
                        {user?.displayName ?? user?.fullName ?? "Unknown user"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {user?.username ?? "unknown"} · {user?.role ?? "unknown"}
                      </p>
                    </div>
                    <Badge className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white hover:bg-slate-950">
                      Live
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-full border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                    onClick={() => void revokeAllSessions()}
                  >
                    Revoke all sessions
                  </Button>
                  <Button
                    type="button"
                    className="h-9 rounded-full bg-slate-950 px-4 text-white hover:bg-slate-800"
                    onClick={() => void logout()}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-sky-100/80 pt-4">
              <nav className="flex flex-wrap gap-2">
                {visibleNavigation.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "rounded-full border px-4 py-2.5 text-sm font-medium transition-all",
                        isActive
                          ? "border-sky-100 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(240,247,255,0.98))] text-sky-800 shadow-[0_16px_30px_-24px_rgba(55,107,255,0.28)]"
                          : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950",
                      )
                    }
                  >
                    <span className="flex items-center gap-2.5">
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </span>
                  </NavLink>
                ))}
              </nav>

              <div className="hidden text-right text-sm text-slate-500 xl:block">
                {activeOrganization
                  ? `${activeOrganization.slug} · ${activeOrganization.membershipRole}`
                  : ""}
              </div>
            </div>
          </div>
        </header>

        <main className="pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
