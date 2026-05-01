import { NavLink, Outlet } from "react-router-dom";
import {
  CalendarDays,
  ChevronDown,
  DoorClosed,
  Home,
  LayoutGrid,
  LifeBuoy,
  LineChart,
  LogOut,
  NotebookTabs,
  Settings2,
  Shield,
  ShieldCheck,
  SquareCheckBig,
  UserCog,
} from "lucide-react";

import deskoneWordmark from "@/assets/deskone-wordmark.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const { user, logout, revokeAllSessions, organizations, activeOrganizationId, setActiveOrganizationId } =
    useAuth();

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
          <div className="flex flex-col gap-4 px-1 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-6">
              <img
                src={deskoneWordmark}
                alt="Deskone"
                className="h-14 w-auto shrink-0 object-contain sm:h-16"
              />

              <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-2">
                {visibleNavigation.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "rounded-full px-4 py-2.5 text-sm font-medium transition-all",
                        isActive
                          ? "bg-white text-slate-950 shadow-[0_18px_36px_-26px_rgba(55,107,255,0.28)]"
                          : "text-slate-600 hover:bg-white/80 hover:text-slate-950",
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

            <div className="flex items-center justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-full border-slate-200 bg-white px-4 text-slate-700 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.22)] hover:bg-white hover:text-slate-950"
                  >
                    <UserCog className="mr-2 h-4 w-4" />
                    Admin
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  className="w-[340px] rounded-[1.5rem] border border-slate-200/80 bg-white/96 p-3 shadow-[0_30px_80px_-34px_rgba(15,23,42,0.22)]"
                >
                  <DropdownMenuLabel className="px-2 pb-3 pt-1">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-950">
                          {user?.displayName ?? user?.fullName ?? "Unknown user"}
                        </p>
                        <Badge className="rounded-full bg-slate-950 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white hover:bg-slate-950">
                          Live
                        </Badge>
                      </div>
                      <p className="text-xs font-normal text-slate-500">
                        {user?.username ?? "unknown"} · {user?.role ?? "unknown"}
                      </p>
                    </div>
                  </DropdownMenuLabel>

                  <DropdownMenuSeparator className="bg-slate-100" />

                  <div className="px-2 py-3">
                    <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">Active environment</p>
                    <select
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 text-sm text-slate-700 outline-none transition focus:border-sky-300"
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

                  <DropdownMenuSeparator className="bg-slate-100" />

                  <div className="space-y-1 p-1">
                    <DropdownMenuItem
                      className="rounded-xl px-3 py-2.5 text-slate-700 focus:bg-slate-50 focus:text-slate-950"
                      onSelect={() => void revokeAllSessions()}
                    >
                      Revoke all sessions
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="rounded-xl px-3 py-2.5 text-red-600 focus:bg-red-50 focus:text-red-700"
                      onSelect={() => void logout()}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
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
