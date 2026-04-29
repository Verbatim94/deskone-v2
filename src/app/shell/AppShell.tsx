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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.1),_transparent_24%),linear-gradient(180deg,_#f8fbff,_#f7f8fb_48%,_#f8fafc)] text-foreground">
      <div className="mx-auto min-h-screen w-full max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,255,255,0.76))] shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="flex flex-col gap-6 p-5 lg:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-4">
                <img
                  src={deskoneLogo}
                  alt="Deskone"
                  className="h-14 w-14 rounded-2xl border border-slate-200/70 bg-white object-contain p-2 shadow-sm"
                />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full bg-sky-100 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-100">
                      Deskone
                    </Badge>
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
                      Workspace operating system
                    </Badge>
                  </div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                    A calmer workspace surface for rooms, offices and operations.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Navigation stays light, while the page itself gets the room it needs to feel premium and useful.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[460px]">
                <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/85 p-4 shadow-sm">
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

                <div className="rounded-[1.4rem] border border-slate-900/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.88))] p-4 text-slate-50 shadow-sm">
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

            <div className="rounded-[1.6rem] border border-slate-200/80 bg-white/85 p-3 shadow-sm">
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
                          ? "border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.92),rgba(255,255,255,0.98))] text-sky-800 shadow-sm"
                          : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950",
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
