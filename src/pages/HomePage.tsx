import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  DoorClosed,
  LayoutGrid,
  LoaderCircle,
  MessageSquareMore,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/context/useAuth";
import { getOfficesOverview } from "@/features/offices/api";
import { getReports } from "@/features/reports/api";
import { listAccessibleRooms } from "@/features/rooms/api";
import { getMySchedule } from "@/features/schedule/api";

function buildTodayWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return {
    date: start.toISOString().slice(0, 10),
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
  };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card className="rounded-[1.8rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
          </div>
          <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  const { user, session, activeOrganization, activeOrganizationId } = useAuth();
  const todayWindow = useMemo(() => buildTodayWindow(), []);
  const canManageWorkspace =
    user?.role === "super_admin" || activeOrganization?.membershipRole === "admin";

  const roomsQuery = useQuery({
    queryKey: ["dashboard-rooms", activeOrganizationId],
    enabled: Boolean(activeOrganizationId),
    queryFn: async () => (await listAccessibleRooms(activeOrganizationId!)).rooms,
  });

  const officesQuery = useQuery({
    queryKey: ["dashboard-offices", activeOrganizationId, todayWindow.date],
    enabled: Boolean(activeOrganizationId),
    queryFn: () =>
      getOfficesOverview({
        organizationId: activeOrganizationId!,
        date: todayWindow.date,
        windowStart: todayWindow.windowStart,
        windowEnd: todayWindow.windowEnd,
      }),
  });

  const reportsQuery = useQuery({
    queryKey: ["dashboard-reports", activeOrganizationId],
    enabled: Boolean(activeOrganizationId),
    queryFn: () => getReports(activeOrganizationId!),
  });

  const scheduleQuery = useQuery({
    queryKey: ["dashboard-schedule", activeOrganizationId, todayWindow.date],
    enabled: Boolean(activeOrganizationId),
    queryFn: () =>
      getMySchedule({
        organizationId: activeOrganizationId!,
        fromDate: todayWindow.date,
        toDate: todayWindow.date,
      }),
  });

  const rooms = roomsQuery.data ?? [];
  const offices = officesQuery.data?.offices ?? [];
  const reports = reportsQuery.data?.reports ?? [];
  const roomReservations = scheduleQuery.data?.roomReservations ?? [];
  const officeBookings = scheduleQuery.data?.officeBookings ?? [];
  const activeOfficeBookings = offices.flatMap((office) => office.bookings).filter((booking) => booking.status === "active");
  const openReports = reports.filter((report) => report.status === "open");
  const primaryProvider = session?.user.primaryIdentityProvider ?? "local";
  const nextDeskReservation = roomReservations[0] ?? null;
  const nextOfficeBooking = officeBookings[0] ?? null;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2.5rem] border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(248,250,252,0.9)_48%,rgba(224,242,254,0.66))] p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.18fr,0.82fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-sky-100 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-100">
                Workspace operations
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
                {activeOrganization?.name ?? "No environment"}
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
                Provider: {primaryProvider}
              </Badge>
            </div>

            <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              A calmer workspace experience for desks, private offices and everyday operational flow.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              {activeOrganization
                ? `You are working inside ${activeOrganization.name}. From here your team can book desks, manage office availability and keep support requests visible without switching between tools.`
                : "As soon as an organization is active, the workspace modules will become available here."}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800">
                <Link to="/rooms">
                  Open rooms
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-full border-slate-300 bg-white px-5 text-slate-700 hover:bg-slate-50"
              >
                <Link to="/offices">Open offices</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-full border-slate-300 bg-white px-5 text-slate-700 hover:bg-slate-50"
              >
                <Link to="/reports">Open support</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-full border-slate-300 bg-white px-5 text-slate-700 hover:bg-slate-50"
              >
                <Link to="/my-bookings">My bookings</Link>
              </Button>
            </div>
          </div>

          <Card className="rounded-[2rem] border-slate-200/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(15,23,42,0.82))] text-white shadow-none">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Today at a glance</p>
                <Badge className="rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-100 hover:bg-white/10">
                  Live view
                </Badge>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-100">
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  {rooms.length} rooms currently available in the active environment.
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  {activeOfficeBookings.length} active office bookings in today&apos;s window.
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  {roomReservations.length + officeBookings.length} personal bookings visible today.
                </div>
                <div className="rounded-[1.4rem] border border-sky-400/20 bg-sky-400/10 p-4 text-sky-50">
                  Primary identity provider: <span className="font-semibold text-white">{primaryProvider}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={LayoutGrid}
          label="Rooms"
          value={String(rooms.length)}
          helper="Desk-booking spaces currently visible for this environment."
        />
        <MetricCard
          icon={DoorClosed}
          label="Offices"
          value={String(offices.length)}
          helper="Private offices with release windows and owner/admin control."
        />
        <MetricCard
          icon={CalendarClock}
          label="Active bookings"
          value={String(roomReservations.length + officeBookings.length)}
          helper="Desk and office bookings already attached to your current day."
        />
        <MetricCard
          icon={MessageSquareMore}
          label="Open support"
          value={String(openReports.length)}
          helper="Items that still need review or a closing action."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <LayoutGrid className="h-5 w-5 text-sky-700" />
              Core modules
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Link
              to="/rooms"
              className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5 transition-colors hover:bg-white"
            >
              <p className="text-lg font-semibold text-slate-950">Rooms</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Book a desk, inspect availability and move through the room map with real access control.
              </p>
            </Link>

            <Link
              to="/offices"
              className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5 transition-colors hover:bg-white"
            >
              <p className="text-lg font-semibold text-slate-950">Offices</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Handle owner/admin release windows, short bookings and protected occupancy rules.
              </p>
            </Link>

            <Link
              to="/my-bookings"
              className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5 transition-colors hover:bg-white"
            >
              <p className="text-lg font-semibold text-slate-950">My bookings</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Keep your desks and offices in one timeline instead of checking each module separately.
              </p>
            </Link>

            <Link
              to="/reports"
              className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5 transition-colors hover:bg-white"
            >
              <p className="text-lg font-semibold text-slate-950">Support</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Keep operational comments light for users and actionable for admins.
              </p>
            </Link>

            {canManageWorkspace ? (
              <Link
                to={user?.role === "super_admin" ? "/super-admin" : "/admin-studio"}
                className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5 transition-colors hover:bg-white"
              >
                <p className="text-lg font-semibold text-slate-950">
                  {user?.role === "super_admin" ? "Platform controls" : "Workspace administration"}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {user?.role === "super_admin"
                    ? "Manage organizations, users and platform-wide access."
                    : "Design room layouts, groups and operating rules for this workspace."}
                </p>
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <ShieldCheck className="h-5 w-5 text-sky-700" />
              Your day
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {reportsQuery.isLoading || officesQuery.isLoading || scheduleQuery.isLoading ? (
              <div className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-6 text-sm text-slate-600">
                <LoaderCircle className="mb-3 h-5 w-5 animate-spin text-sky-700" />
                Loading your schedule...
              </div>
            ) : null}

            {!reportsQuery.isLoading && !scheduleQuery.isLoading && !nextDeskReservation && !nextOfficeBooking && !reports.length ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                Nothing urgent is on your desk today.
              </div>
            ) : null}

            {nextDeskReservation ? (
              <article className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">Next desk reservation</p>
                  <Badge className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 hover:bg-emerald-100">
                    {nextDeskReservation.segment}
                  </Badge>
                </div>
                <p className="mt-3 text-lg font-semibold text-slate-950">
                  {nextDeskReservation.roomName} • {nextDeskReservation.deskLabel ?? "Desk"}
                </p>
                <p className="mt-2 text-sm text-slate-600">{formatDateTime(`${nextDeskReservation.dateStart}T09:00:00`)}</p>
              </article>
            ) : null}

            {nextOfficeBooking ? (
              <article className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">Next office booking</p>
                  <Badge className="rounded-full bg-sky-100 px-3 py-1 text-sky-800 hover:bg-sky-100">
                    {nextOfficeBooking.status}
                  </Badge>
                </div>
                <p className="mt-3 text-lg font-semibold text-slate-950">{nextOfficeBooking.officeName}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {formatDateTime(nextOfficeBooking.startsAt)} → {formatDateTime(nextOfficeBooking.endsAt)}
                </p>
              </article>
            ) : null}

            {reports.slice(0, 4).map((report) => (
              <article key={report.id} className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">
                    {report.targetType}
                    {report.targetId ? ` | ${report.targetId}` : ""}
                  </p>
                  <Badge
                    className={
                      report.status === "open"
                        ? "rounded-full bg-amber-100 px-3 py-1 text-amber-800 hover:bg-amber-100"
                        : "rounded-full bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-200"
                    }
                  >
                    {report.status}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{report.comment}</p>
                <div className="mt-4 flex flex-wrap gap-3 text-xs uppercase tracking-[0.16em] text-slate-500">
                  <span>{report.authorLabel ?? "Unknown"}</span>
                  <span>{formatDateTime(report.createdAt)}</span>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
