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
    <div className="min-h-screen text-foreground">
      <div className="mx-auto min-h-screen w-full max-w-[1640px] px-4 py-4 sm:px-6 lg:px-10">
        <header className="premium-surface overflow-hidden rounded-[2.3rem]">
          <div className="flex flex-col gap-6 p-5 lg:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-4">
                <img
                  src={deskoneLogo}
                  alt="Deskone"
                  className="h-14 w-14 rounded-[1.35rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(237,245,255,0.96))] object-contain p-2 shadow-[0_18px_32px_-22px_rgba(55,107,255,0.42)]"
                />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="playful-chip rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-50">
                      Deskone
                    </Badge>
                    <Badge variant="outline" className="rounded-full border-white/80 bg-white/70 px-3 py-1 text-slate-600">
                      Workspace operating system
                    </Badge>
                  </div>
                  <p className="premium-display mt-3 text-[2rem] font-semibold tracking-tight text-slate-950 sm:text-[2.45rem]">
                    A calmer, brighter way to move through rooms, offices and daily flow.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Navigation stays light, while the workspace gets a more atmospheric, premium rhythm.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[460px]">
                <div className="rounded-[1.6rem] border border-white/75 bg-white/78 p-4 shadow-[0_24px_54px_-34px_rgba(15,23,42,0.18)] backdrop-blur">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Active environment</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">
                    {activeOrganization?.name ?? "No organization yet"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {activeOrganization
                      ? `${activeOrganization.slug} | ${activeOrganization.membershipRole}`
                      : "Choose the workspace you want to operate in."}
                  </p>
                  <select
                    className="mt-4 h-11 w-full rounded-2xl border border-white/80 bg-[linear-gradient(180deg,rgba(244,247,255,0.92),rgba(255,255,255,0.98))] px-3 text-sm text-slate-700 outline-none transition focus:border-sky-300"
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

                <div className="premium-dark rounded-[1.6rem] border border-slate-900/80 p-4 text-slate-50">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Signed in</p>
                    <Badge className="rounded-full bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-100 hover:bg-white/10">
                      Live
                    </Badge>
                  </div>
                  <p className="mt-2 text-base font-semibold text-white">
                    {user?.displayName ?? user?.fullName ?? "Unknown user"}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {user?.username ?? "unknown"} | {user?.role ?? "unknown"}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">{user?.email ?? "No email linked yet"}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-full border-white/15 bg-white/10 px-4 text-slate-100 hover:bg-white/15 hover:text-white"
                      onClick={() => void logout()}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-full border-white/15 bg-transparent px-4 text-slate-200 hover:bg-white/10 hover:text-white"
                      onClick={() => void revokeAllSessions()}
                    >
                      Revoke all sessions
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.8rem] border border-white/80 bg-white/78 p-3 shadow-[0_24px_54px_-36px_rgba(15,23,42,0.18)] backdrop-blur">
              <nav className="flex flex-wrap gap-2">
                {visibleNavigation.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "rounded-full border px-4 py-3 text-sm font-medium transition-all",
                        isActive
                          ? "border-white/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(235,244,255,0.96))] text-sky-800 shadow-[0_18px_34px_-24px_rgba(55,107,255,0.46)]"
                          : "border-transparent bg-transparent text-slate-600 hover:border-white/70 hover:bg-white/65 hover:text-slate-950",
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
