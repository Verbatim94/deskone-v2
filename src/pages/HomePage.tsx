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
    <Card className="rounded-[1.9rem] border-slate-200/80 bg-white/92 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.58)]">
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
  const activeOfficeBookings = offices
    .flatMap((office) => office.bookings)
    .filter((booking) => booking.status === "active");
  const openReports = reports.filter((report) => report.status === "open");
  const primaryProvider = session?.user.primaryIdentityProvider ?? "local";
  const nextDeskReservation = roomReservations[0] ?? null;
  const nextOfficeBooking = officeBookings[0] ?? null;
  const totalTodayItems = roomReservations.length + officeBookings.length;

  return (
    <div className="mx-auto max-w-[1560px] space-y-8">
      <section className="premium-surface overflow-hidden rounded-[3rem] p-7 sm:p-9">
        <div className="grid gap-8 xl:grid-cols-[1.15fr,0.85fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="playful-chip rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-50">
                Workspace operations
              </Badge>
              <Badge variant="outline" className="rounded-full border-white/80 bg-white/70 px-3 py-1 text-slate-600">
                {activeOrganization?.name ?? "No environment"}
              </Badge>
              <Badge variant="outline" className="rounded-full border-white/80 bg-white/70 px-3 py-1 text-slate-600">
                Provider: {primaryProvider}
              </Badge>
            </div>

            <h1 className="premium-display mt-5 max-w-3xl text-[2.55rem] font-semibold tracking-tight text-slate-950 sm:text-[4.45rem] sm:leading-[1.02]">
              The workspace OS that makes planning feel effortless, polished and a little more alive.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              {activeOrganization
                ? `You are inside ${activeOrganization.name}. Book the right neighborhood, release private offices and keep daily operations visible from one atmospheric surface.`
                : "As soon as an organization is active, the workspace modules will become available here."}
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:max-w-[760px] xl:grid-cols-4">
              {[
                {
                  to: "/rooms",
                  label: "Rooms",
                  helper: "Open the flagship booking surface.",
                  emphasis: true,
                },
                {
                  to: "/offices",
                  label: "Offices",
                  helper: "Handle private office access and release windows.",
                },
                {
                  to: "/reports",
                  label: "Support",
                  helper: "Review or submit operational comments.",
                },
                {
                  to: "/my-bookings",
                  label: "My bookings",
                  helper: "Keep desks and offices in one timeline.",
                },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={
                    item.emphasis
                      ? "rounded-[1.8rem] border border-sky-300/25 bg-[linear-gradient(135deg,rgba(55,107,255,0.98),rgba(31,62,168,0.96)_70%,rgba(139,109,255,0.92))] p-4 text-white shadow-[0_30px_60px_-34px_rgba(55,107,255,0.62)] transition-transform hover:-translate-y-0.5"
                      : "rounded-[1.8rem] border border-white/80 bg-white/78 p-4 text-slate-900 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.16)] backdrop-blur transition-transform hover:-translate-y-0.5"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={item.emphasis ? "text-sm font-semibold text-white" : "text-sm font-semibold text-slate-950"}>
                        {item.label}
                      </p>
                      <p className={item.emphasis ? "mt-2 text-xs leading-5 text-slate-300" : "mt-2 text-xs leading-5 text-slate-500"}>
                        {item.helper}
                      </p>
                    </div>
                    <ArrowRight className={item.emphasis ? "h-4 w-4 text-white" : "h-4 w-4 text-slate-500"} />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <Card className="premium-dark rounded-[2.25rem] border-slate-900/80 text-white shadow-none">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">Today at a glance</p>
                  <Badge className="rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-100 hover:bg-white/10">
                    Live view
                  </Badge>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Environment</p>
                    <p className="mt-2 text-lg font-semibold text-white">{activeOrganization?.name ?? "Not selected"}</p>
                    <p className="mt-1 text-sm text-slate-300">{rooms.length} rooms currently visible</p>
                  </div>
                  <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Identity</p>
                    <p className="mt-2 text-lg font-semibold text-white">{primaryProvider}</p>
                    <p className="mt-1 text-sm text-slate-300">{user?.displayName ?? user?.fullName}</p>
                  </div>
                  <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Bookings today</p>
                    <p className="mt-2 text-lg font-semibold text-white">{totalTodayItems}</p>
                    <p className="mt-1 text-sm text-slate-300">
                      {activeOfficeBookings.length} office windows are active right now
                    </p>
                  </div>
                  <div className="rounded-[1.4rem] border border-sky-400/20 bg-sky-400/10 p-4 text-sky-50">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-sky-100/80">Support queue</p>
                    <p className="mt-2 text-lg font-semibold text-white">{openReports.length} open items</p>
                    <p className="mt-1 text-sm text-sky-100/80">
                      Keep comments visible without leaving the workspace surface.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

              <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.8rem] border border-white/85 bg-white/76 p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.16)] backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Next desk</p>
                <p className="mt-3 text-lg font-semibold text-slate-950">
                  {nextDeskReservation ? `${nextDeskReservation.roomName} | ${nextDeskReservation.deskLabel ?? "Desk"}` : "No desk booking yet"}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {nextDeskReservation ? formatDateTime(`${nextDeskReservation.dateStart}T09:00:00`) : "The room map is clear for a new reservation."}
                </p>
              </div>

              <div className="rounded-[1.8rem] border border-white/85 bg-white/76 p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.16)] backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Next office</p>
                <p className="mt-3 text-lg font-semibold text-slate-950">
                  {nextOfficeBooking ? nextOfficeBooking.officeName : "No office booking yet"}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {nextOfficeBooking ? formatDateTime(nextOfficeBooking.startsAt) : "Private office time will appear here."}
                </p>
              </div>

              <div className="rounded-[1.8rem] border border-white/85 bg-white/76 p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.16)] backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Workspace control</p>
                <p className="mt-3 text-lg font-semibold text-slate-950">
                  {canManageWorkspace ? "Administrative access enabled" : "Member surface active"}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {canManageWorkspace
                    ? "You can move from product use to operating control without changing application context."
                    : "Booking, offices and support are ready without extra admin noise."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
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
          value={String(totalTodayItems)}
          helper="Desk and office bookings already attached to your current day."
        />
        <MetricCard
          icon={MessageSquareMore}
          label="Open support"
          value={String(openReports.length)}
          helper="Items that still need review or a closing action."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.02fr,0.98fr]">
        <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <LayoutGrid className="h-5 w-5 text-sky-700" />
              Core modules
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {[
              {
                to: "/rooms",
                title: "Rooms",
                description: "Book a desk, inspect availability and move through the room map with real access control.",
              },
              {
                to: "/offices",
                title: "Offices",
                description: "Handle owner/admin release windows, short bookings and protected occupancy rules.",
              },
              {
                to: "/my-bookings",
                title: "My bookings",
                description: "Keep your desks and offices in one timeline instead of checking each module separately.",
              },
              {
                to: "/reports",
                title: "Support",
                description: "Keep operational comments light for users and actionable for admins.",
              },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-[1.6rem] border border-slate-200/70 bg-slate-50/80 p-5 transition-all hover:-translate-y-0.5 hover:bg-white"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 text-slate-400" />
                </div>
              </Link>
            ))}

            {canManageWorkspace ? (
              <Link
                to={user?.role === "super_admin" ? "/super-admin" : "/admin-studio"}
                className="rounded-[1.6rem] border border-slate-200/70 bg-slate-50/80 p-5 transition-all hover:-translate-y-0.5 hover:bg-white"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">
                      {user?.role === "super_admin" ? "Platform controls" : "Workspace administration"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {user?.role === "super_admin"
                        ? "Manage organizations, users and platform-wide access."
                        : "Design room layouts, groups and operating rules for this workspace."}
                    </p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 text-slate-400" />
                </div>
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
                  {nextDeskReservation.roomName} | {nextDeskReservation.deskLabel ?? "Desk"}
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
                  {formatDateTime(nextOfficeBooking.startsAt)} {"→"} {formatDateTime(nextOfficeBooking.endsAt)}
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
