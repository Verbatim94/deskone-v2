import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { eachDayOfInterval, endOfMonth, format, isSameMonth, isToday, startOfMonth } from "date-fns";
import {
  ArrowRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  DoorClosed,
  LayoutGrid,
  MessageSquareMore,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/features/auth/context/useAuth";
import { getOfficesOverview } from "@/features/offices/api";
import { getReports } from "@/features/reports/api";
import { listAccessibleRooms } from "@/features/rooms/api";
import { getDashboardCalendar, getMySchedule } from "@/features/schedule/api";
import { cn } from "@/lib/utils";

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

function getMonthRange(anchorMonth: Date) {
  const monthStart = startOfMonth(anchorMonth);
  const monthEnd = endOfMonth(anchorMonth);
  const fromDate = format(monthStart, "yyyy-MM-dd");
  const toDate = format(monthEnd, "yyyy-MM-dd");

  return { monthStart, monthEnd, fromDate, toDate };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildCalendarTooltip(input: { hasUserBooking: boolean; fullyBooked: boolean; bookingRoomNames: string[] }) {
  if (input.hasUserBooking) {
    if (input.bookingRoomNames.length === 1) {
      return `Booked in ${input.bookingRoomNames[0]}`;
    }

    if (input.bookingRoomNames.length > 1) {
      return `Booked in ${input.bookingRoomNames.slice(0, 2).join(", ")}`;
    }

    return "You already have a desk booking";
  }

  if (input.fullyBooked) {
    return "All accessible desks are occupied";
  }

  return "Open My Reservations";
}

function getInitials(name: string | null | undefined) {
  if (!name) {
    return "D";
  }

  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function HomePage() {
  const { user, activeOrganization, activeOrganizationId } = useAuth();
  const todayWindow = useMemo(() => buildTodayWindow(), []);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const monthRange = useMemo(() => getMonthRange(calendarMonth), [calendarMonth]);
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

  const dashboardCalendarQuery = useQuery({
    queryKey: ["dashboard-calendar", activeOrganizationId, monthRange.fromDate, monthRange.toDate],
    enabled: Boolean(activeOrganizationId),
    queryFn: () =>
      getDashboardCalendar({
        organizationId: activeOrganizationId!,
        fromDate: monthRange.fromDate,
        toDate: monthRange.toDate,
      }),
  });

  const rooms = roomsQuery.data ?? [];
  const offices = officesQuery.data?.offices ?? [];
  const reports = reportsQuery.data?.reports ?? [];
  const roomReservations = scheduleQuery.data?.roomReservations ?? [];
  const officeBookings = scheduleQuery.data?.officeBookings ?? [];
  const calendarDaysData = dashboardCalendarQuery.data?.days ?? [];
  const openReports = reports.filter((report) => report.status === "open");
  const nextDeskReservation = roomReservations[0] ?? null;
  const nextOfficeBooking = officeBookings[0] ?? null;
  const totalTodayItems = roomReservations.length + officeBookings.length;
  const completion = Math.min(100, Math.max(12, totalTodayItems * 22 || 42));
  const displayName = user?.displayName ?? user?.fullName ?? "Deskone user";
  const initials = getInitials(displayName);
  const calendarDayState = new Map(calendarDaysData.map((day) => [day.date, day]));

  const miniCalendarDays = useMemo(() => {
    const monthDays = eachDayOfInterval({ start: monthRange.monthStart, end: monthRange.monthEnd });
    const startDay = monthRange.monthStart.getDay();
    const daysFromPrevMonth = startDay === 0 ? 6 : startDay - 1;
    const days: Date[] = [];

    for (let index = daysFromPrevMonth; index > 0; index -= 1) {
      const day = new Date(monthRange.monthStart);
      day.setDate(day.getDate() - index);
      days.push(day);
    }

    days.push(...monthDays);

    const remaining = 35 - days.length <= 7 ? 35 - days.length : 42 - days.length;
    for (let index = 1; index <= remaining; index += 1) {
      const day = new Date(monthRange.monthEnd);
      day.setDate(day.getDate() + index);
      days.push(day);
    }

    return days;
  }, [monthRange.monthEnd, monthRange.monthStart]);

  const taskGroups = [
    {
      label: "Shared rooms",
      helper: `${rooms.length} visible`,
      value: `${Math.max(38, rooms.length * 9)}%`,
      tone: "bg-pink-50 text-pink-500",
      to: "/shared-rooms",
    },
    {
      label: "Private offices",
      helper: `${offices.length} managed`,
      value: `${Math.max(24, offices.length * 13)}%`,
      tone: "bg-violet-50 text-violet-500",
      to: "/offices",
    },
    {
      label: "Support queue",
      helper: `${openReports.length} open`,
      value: `${Math.max(15, openReports.length * 17)}%`,
      tone: "bg-orange-50 text-orange-500",
      to: "/reports",
    },
  ];

  return (
    <div className="mx-auto max-w-[1380px] space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
        <div className="space-y-6">
          <Card className="rounded-[2rem] border-white/80 bg-white/96 shadow-[0_32px_90px_-48px_rgba(111,85,190,0.22)]">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(91,74,255,0.95),rgba(255,110,199,0.85))] text-lg font-semibold text-white shadow-[0_18px_34px_-20px_rgba(111,85,190,0.45)]">
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Hello!</p>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950">{displayName}</h1>
                    <p className="mt-1 text-sm text-slate-500">
                      {activeOrganization?.name ?? "No environment selected"}
                    </p>
                  </div>
                </div>
                <Badge className="rounded-full bg-violet-100 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-violet-700 hover:bg-violet-100">
                  Live
                </Badge>
              </div>

              <div className="mt-6 rounded-[1.8rem] bg-[linear-gradient(135deg,rgba(111,74,255,1),rgba(91,74,255,0.96)_55%,rgba(149,92,255,0.92))] p-5 text-white shadow-[0_34px_72px_-36px_rgba(93,64,198,0.46)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="max-w-[280px] text-lg font-semibold leading-7">
                      Your workspace day is already moving.
                    </p>
                    <p className="mt-2 text-sm text-violet-100">
                      {totalTodayItems
                        ? `${totalTodayItems} active items between rooms and offices.`
                        : "No booking yet today, so this is a good moment to plan ahead."}
                    </p>
                  </div>
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-white/10">
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `conic-gradient(#ffffff ${completion}%, rgba(255,255,255,0.18) ${completion}% 100%)`,
                        WebkitMask:
                          "radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 7px))",
                        mask: "radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 7px))",
                      }}
                    />
                    <span className="relative text-lg font-semibold">{completion}%</span>
                  </div>
                </div>

                <div className="mt-5">
                  <Link
                    to="/shared-rooms"
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
                  >
                    View Workspace
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-slate-950">In Progress</h2>
              <span className="text-sm text-violet-500">{totalTodayItems}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="rounded-[1.7rem] border-white/80 bg-[linear-gradient(180deg,#eef6ff,#ffffff)] shadow-[0_20px_44px_-28px_rgba(91,74,255,0.16)]">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-slate-500">Desk booking</p>
                      <p className="mt-2 text-xl font-semibold leading-8 text-slate-950">
                        {nextDeskReservation
                          ? `${nextDeskReservation.roomName} desk ${nextDeskReservation.deskLabel ?? ""}`
                          : "Choose your next desk"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-pink-100 p-2.5 text-pink-500">
                      <LayoutGrid className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-4 h-1.5 rounded-full bg-sky-100">
                    <div className="h-full w-[78%] rounded-full bg-sky-500" />
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    {nextDeskReservation
                      ? formatDateTime(`${nextDeskReservation.dateStart}T09:00:00`)
                      : "Rooms stay open and ready from one map."}
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-[1.7rem] border-white/80 bg-[linear-gradient(180deg,#fff5f3,#ffffff)] shadow-[0_20px_44px_-28px_rgba(255,110,199,0.14)]">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-slate-500">Office booking</p>
                      <p className="mt-2 text-xl font-semibold leading-8 text-slate-950">
                        {nextOfficeBooking ? nextOfficeBooking.officeName : "Release or book an office"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-orange-100 p-2.5 text-orange-500">
                      <DoorClosed className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-4 h-1.5 rounded-full bg-orange-100">
                    <div className="h-full w-[64%] rounded-full bg-orange-400" />
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    {nextOfficeBooking
                      ? formatDateTime(nextOfficeBooking.startsAt)
                      : "Private office windows stay visible all day."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-slate-950">Task Groups</h2>
              <span className="text-sm text-violet-500">{taskGroups.length}</span>
            </div>
            <div className="space-y-4">
              {taskGroups.map((group, index) => (
                <Link
                  key={group.label}
                  to={group.to}
                  className="flex items-center justify-between rounded-[1.55rem] border border-white/80 bg-white/96 px-5 py-4 shadow-[0_20px_44px_-30px_rgba(91,74,255,0.16)] transition hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${group.tone}`}>
                      {index === 0 ? <LayoutGrid className="h-4 w-4" /> : index === 1 ? <DoorClosed className="h-4 w-4" /> : <MessageSquareMore className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-950">{group.label}</p>
                      <p className="text-sm text-slate-500">{group.helper}</p>
                    </div>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-violet-400 text-sm font-semibold text-slate-950">
                    {group.value}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[2rem] border-white/80 bg-white/96 shadow-[0_28px_72px_-40px_rgba(91,74,255,0.18)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-950">Booking calendar</h2>
                <CalendarClock className="h-5 w-5 text-violet-500" />
              </div>
              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={() =>
                      setCalendarMonth(
                        new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
                      )
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Overview</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">
                      {format(calendarMonth, "MMMM yyyy")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={() =>
                      setCalendarMonth(
                        new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
                      )
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div
                      key={day}
                      className="py-1 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                <TooltipProvider delayDuration={120}>
                  <div className="grid grid-cols-7 gap-2">
                    {miniCalendarDays.map((day) => {
                      const isoDate = format(day, "yyyy-MM-dd");
                      const state = calendarDayState.get(isoDate) ?? {
                        hasUserBooking: false,
                        fullyBooked: false,
                        bookingRoomNames: [],
                      };
                      const isCurrentMonth = isSameMonth(day, calendarMonth);
                      const isCurrentDay = isToday(day);

                      return (
                        <Tooltip key={isoDate}>
                          <TooltipTrigger asChild>
                            <Link
                              to={`/my-bookings?date=${isoDate}`}
                              className={cn(
                                "flex min-h-[52px] flex-col items-center justify-start rounded-[1.1rem] px-2 py-2 text-sm transition",
                                isCurrentMonth ? "bg-slate-50/90 text-slate-900 hover:bg-white" : "bg-transparent text-slate-300 hover:bg-white/50",
                                isCurrentDay && "ring-2 ring-violet-400/70 ring-offset-0",
                              )}
                            >
                              <span className={cn("font-medium", isCurrentDay && isCurrentMonth && "text-violet-700")}>
                                {format(day, "d")}
                              </span>
                              <span className="mt-2 flex h-2.5 items-center justify-center">
                                {state.hasUserBooking ? (
                                  <span className="h-2.5 w-2.5 rounded-full bg-violet-500 shadow-[0_0_0_4px_rgba(139,92,246,0.14)]" />
                                ) : state.fullyBooked ? (
                                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.14)]" />
                                ) : (
                                  <span className="h-1.5 w-1.5 rounded-full bg-slate-200/0" />
                                )}
                              </span>
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent className="rounded-xl border-white/80 bg-white/96 px-3 py-2 text-sm text-slate-700 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.2)]">
                            {buildCalendarTooltip(state)}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </TooltipProvider>

                <div className="rounded-[1.4rem] bg-slate-50/90 p-4">
                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                      Your booking
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                      Fully booked
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {activeOrganization?.name ?? "No environment"}
                      </p>
                      <p className="text-sm text-slate-500">
                        {canManageWorkspace ? "Administrative control available" : "Member view active"}
                      </p>
                    </div>
                    <Link
                      to="/my-bookings"
                      className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
                    >
                      Open calendar
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-white/80 bg-white/96 shadow-[0_28px_72px_-40px_rgba(91,74,255,0.18)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-950">Quick Actions</h2>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="mt-5 space-y-3">
                <Link
                  to="/shared-rooms"
                  className="flex items-center justify-between rounded-[1.4rem] bg-[#f6f2ff] px-4 py-4 text-slate-950 transition hover:bg-[#efe7ff]"
                >
                  <div>
                    <p className="font-semibold">Shared Rooms</p>
                    <p className="text-sm text-slate-500">Browse availability and book fast.</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-violet-500" />
                </Link>
                <Link
                  to="/my-bookings"
                  className="flex items-center justify-between rounded-[1.4rem] bg-[#fff6f3] px-4 py-4 text-slate-950 transition hover:bg-[#ffefe9]"
                >
                  <div>
                    <p className="font-semibold">My Reservations</p>
                    <p className="text-sm text-slate-500">See the calendar and upcoming items.</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-orange-500" />
                </Link>
                <Link
                  to="/users"
                  className="flex items-center justify-between rounded-[1.4rem] bg-[#eef7ff] px-4 py-4 text-slate-950 transition hover:bg-[#e5f2ff]"
                >
                  <div>
                    <p className="font-semibold">Users</p>
                    <p className="text-sm text-slate-500">Access governance and activation flow.</p>
                  </div>
                  <ShieldCheck className="h-4 w-4 text-sky-500" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
