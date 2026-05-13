import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { addDays, format, subDays } from "date-fns";
import {
  ArrowRight,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/features/auth/context/useAuth";
import { getRoomAvailability, listAccessibleRooms } from "@/features/rooms/api";
import { getMySchedule } from "@/features/schedule/api";
import { cn } from "@/lib/utils";

function getToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function formatIsoDate(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function getAvailabilityBar(percentage: number) {
  if (percentage >= 70) return "bg-sky-500";
  if (percentage >= 30) return "bg-orange-400";
  return "bg-pink-500";
}

export default function SharedRoomsPage() {
  const navigate = useNavigate();
  const { activeOrganization, activeOrganizationId } = useAuth();
  const [date, setDate] = useState<Date>(getToday);
  const [activityFocus, setActivityFocus] = useState<"all" | "full" | "am" | "pm" | "offices">("all");
  const dateIso = useMemo(() => formatIsoDate(date), [date]);
  const weeklyWindow = useMemo(
    () => ({
      fromDate: formatIsoDate(subDays(date, 3)),
      toDate: formatIsoDate(addDays(date, 3)),
    }),
    [date],
  );

  const roomsQuery = useQuery({
    queryKey: ["shared-rooms-overview", activeOrganizationId],
    enabled: Boolean(activeOrganizationId),
    queryFn: async () => (await listAccessibleRooms(activeOrganizationId!)).rooms,
  });

  const activityQuery = useQuery({
    queryKey: ["shared-rooms-activity", activeOrganizationId, dateIso],
    enabled: Boolean(activeOrganizationId),
    queryFn: () =>
      getMySchedule({
        organizationId: activeOrganizationId!,
        fromDate: dateIso,
        toDate: dateIso,
      }),
  });

  const weeklyActivityQuery = useQuery({
    queryKey: ["shared-rooms-activity-week", activeOrganizationId, weeklyWindow.fromDate, weeklyWindow.toDate],
    enabled: Boolean(activeOrganizationId),
    queryFn: () =>
      getMySchedule({
        organizationId: activeOrganizationId!,
        fromDate: weeklyWindow.fromDate,
        toDate: weeklyWindow.toDate,
      }),
  });

  const rooms = roomsQuery.data ?? [];

  const availabilityQueries = useQueries({
    queries: rooms.map((room) => ({
      queryKey: ["shared-room-availability", activeOrganizationId, room.id, dateIso],
      enabled: Boolean(activeOrganizationId),
      queryFn: () =>
        getRoomAvailability({
          organizationId: activeOrganizationId!,
          roomId: room.id,
          date: dateIso,
          segment: "full" as const,
        }),
      staleTime: 10_000,
    })),
  });

  const roomsWithAvailability = rooms.map((room, index) => {
    const availability = availabilityQueries[index]?.data;
    const totalDesks = availability?.summary.totalDesks ?? room.deskCount ?? 0;
    const availableDesks = availability?.summary.availableDesks ?? 0;
    const percentage = totalDesks > 0 ? Math.round((availableDesks / totalDesks) * 100) : 0;

    return {
      ...room,
      totalDesks,
      availableDesks,
      percentage,
    };
  });

  const roomReservations = activityQuery.data?.roomReservations ?? [];
  const officeBookings = activityQuery.data?.officeBookings ?? [];
  const weeklyRoomReservations = weeklyActivityQuery.data?.roomReservations ?? [];
  const weeklyOfficeBookings = weeklyActivityQuery.data?.officeBookings ?? [];
  const totalActivities = roomReservations.length + officeBookings.length;
  const roomShare = totalActivities ? Math.round((roomReservations.length / totalActivities) * 100) : 0;
  const focusedRooms = useMemo(() => {
    if (activityFocus === "all" || activityFocus === "offices") {
      return roomsWithAvailability;
    }

    return roomsWithAvailability.filter((room) =>
      roomReservations.some((reservation) => reservation.roomName === room.name && reservation.segment === activityFocus),
    );
  }, [activityFocus, roomReservations, roomsWithAvailability]);
  const roomActivityBreakdown = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const reservation of roomReservations) {
      grouped.set(reservation.roomName, (grouped.get(reservation.roomName) ?? 0) + 1);
    }

    return Array.from(grouped.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 4);
  }, [roomReservations]);
  const segmentActivityBreakdown = useMemo(() => {
    const counters = {
      full: 0,
      am: 0,
      pm: 0,
      offices: officeBookings.length,
    };

    for (const reservation of roomReservations) {
      counters[reservation.segment] += 1;
    }

    return [
      { key: "full", label: "Full day", count: counters.full, tone: "bg-violet-500" },
      { key: "am", label: "Morning", count: counters.am, tone: "bg-sky-500" },
      { key: "pm", label: "Afternoon", count: counters.pm, tone: "bg-pink-500" },
      { key: "offices", label: "Offices", count: counters.offices, tone: "bg-orange-400" },
    ];
  }, [officeBookings.length, roomReservations]);
  const weeklyActivityTrend = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => addDays(subDays(date, 3), index));

    return days.map((day) => {
      const dayKey = formatIsoDate(day);
      const roomCount = weeklyRoomReservations.filter((reservation) => reservation.dateStart === dayKey).length;
      const officeCount = weeklyOfficeBookings.filter(
        (booking) => format(new Date(booking.startsAt), "yyyy-MM-dd") === dayKey,
      ).length;
      return {
        day,
        label: format(day, "EE"),
        dateLabel: format(day, "dd MMM"),
        total: roomCount + officeCount,
        roomCount,
        officeCount,
        isCurrent: dayKey === dateIso,
      };
    });
  }, [date, dateIso, weeklyOfficeBookings, weeklyRoomReservations]);
  const maxWeeklyTotal = Math.max(...weeklyActivityTrend.map((entry) => entry.total), 1);
  const isLoadingAvailability =
    roomsQuery.isLoading || availabilityQueries.some((query) => query.isLoading && !query.data);

  return (
    <div className="mx-auto max-w-[1380px] space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="rounded-full bg-violet-100 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-violet-700 hover:bg-violet-100">
              Shared Rooms
            </Badge>
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
              {activeOrganization?.name ?? "No environment"}
            </Badge>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Check availability for today</h1>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/95 p-1.5 shadow-[0_18px_48px_-34px_rgba(91,74,255,0.18)]">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full bg-violet-50 text-violet-700 hover:bg-violet-100 hover:text-violet-800"
            onClick={() => setDate(subDays(date, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="w-[240px] justify-start rounded-full bg-white font-medium text-slate-700 hover:bg-slate-50"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(date, "PPP")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto rounded-2xl border-slate-200 p-0" align="end">
              <Calendar mode="single" selected={date} onSelect={(value) => value && setDate(value)} initialFocus />
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
            onClick={() => setDate(addDays(date, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="rounded-[1.8rem] border-white/80 bg-[linear-gradient(180deg,#eef6ff,#ffffff)] shadow-[0_24px_54px_-34px_rgba(91,74,255,0.16)]">
              <CardContent className="p-5">
                <p className="text-sm text-slate-500">Room reservations</p>
                <p className="mt-3 text-3xl font-bold text-slate-950">{roomReservations.length}</p>
              </CardContent>
            </Card>
            <Card className="rounded-[1.8rem] border-white/80 bg-[linear-gradient(180deg,#fff5f3,#ffffff)] shadow-[0_24px_54px_-34px_rgba(255,110,199,0.14)]">
              <CardContent className="p-5">
                <p className="text-sm text-slate-500">Office bookings</p>
                <p className="mt-3 text-3xl font-bold text-slate-950">{officeBookings.length}</p>
              </CardContent>
            </Card>
          </div>

          {isLoadingAvailability ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {focusedRooms.map((room, index) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => navigate(`/rooms?room=${room.id}`)}
                  className={cn(
                    "rounded-[1.8rem] p-5 text-left shadow-[0_24px_52px_-34px_rgba(91,74,255,0.16)] transition hover:-translate-y-0.5",
                    index % 2 === 0
                      ? "border border-white/80 bg-[linear-gradient(180deg,#eef6ff,#ffffff)]"
                      : "border border-white/80 bg-[linear-gradient(180deg,#fff5f3,#ffffff)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-slate-500">{room.accessRole}</p>
                      <h2 className="mt-2 text-xl font-semibold text-slate-950">{room.name}</h2>
                    </div>
                    <div className={cn("rounded-2xl p-2.5", index % 2 === 0 ? "bg-pink-100 text-pink-500" : "bg-violet-100 text-violet-500")}>
                      <Grid3x3 className="h-4 w-4" />
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    {room.description ??
                      (activityFocus === "offices"
                        ? "Desk map available even when your office activity is the main focus."
                        : "Shared room ready for booking.")}
                  </p>

                  <div className="mt-5 h-1.5 rounded-full bg-slate-100">
                    <div className={cn("h-full rounded-full", getAvailabilityBar(room.percentage))} style={{ width: `${room.percentage}%` }} />
                  </div>

                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-slate-500">
                      {room.availableDesks}/{room.totalDesks} desks free
                    </span>
                    <span className="font-semibold text-slate-950">{room.percentage}%</span>
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <div className="flex gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">{room.zoneCount} zones</span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">{room.groupAccessCount} groups</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <Card className="rounded-[2rem] border-white/80 bg-white/96 shadow-[0_28px_72px_-40px_rgba(91,74,255,0.18)]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-950">Your activity</h2>
              <span className="text-sm text-violet-500">{format(date, "dd MMM")}</span>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-4 md:grid-cols-[0.92fr,1.08fr]">
                <div className="rounded-[1.5rem] border border-violet-100 bg-[linear-gradient(180deg,#faf7ff,#f4edff)] p-5 shadow-[0_18px_44px_-36px_rgba(124,58,237,0.28)]">
                  <p className="text-xs uppercase tracking-[0.18em] text-violet-500">Environment</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{activeOrganization?.name ?? "No environment"}</p>
                  <div className="mt-5 flex items-center gap-4">
                    <div
                      className="grid h-28 w-28 place-items-center rounded-full"
                      style={{
                        background: `conic-gradient(#7c3aed 0 ${roomShare}%, #fb923c ${roomShare}% 100%)`,
                      }}
                    >
                      <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-center shadow-inner">
                        <span className="text-2xl font-semibold text-slate-950">{totalActivities}</span>
                        <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">items</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                        <span>Desk reservations</span>
                        <span className="font-semibold text-slate-950">{roomReservations.length}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-full bg-orange-400" />
                        <span>Office bookings</span>
                        <span className="font-semibold text-slate-950">{officeBookings.length}</span>
                      </div>
                      <p className="text-xs leading-5 text-slate-500">
                        A quick split of your day across shared rooms and private offices.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-5 shadow-[0_18px_44px_-36px_rgba(15,23,42,0.16)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Today by room</p>
                      <p className="mt-1 text-sm font-medium text-slate-950">Where your reservations are concentrated</p>
                    </div>
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
                      {roomActivityBreakdown.length || roomReservations.length ? "Live" : "Empty"}
                    </Badge>
                  </div>
                  <div className="mt-5 space-y-3">
                    {roomActivityBreakdown.length ? (
                      roomActivityBreakdown.map((entry) => {
                        const percentage = roomReservations.length ? Math.round((entry.count / roomReservations.length) * 100) : 0;
                        const linkedRoom = roomsWithAvailability.find((room) => room.name === entry.label);

                        return (
                          <button
                            key={entry.label}
                            type="button"
                            onClick={() => linkedRoom && navigate(`/rooms?room=${linkedRoom.id}`)}
                            className="w-full space-y-2 text-left transition hover:opacity-90"
                          >
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="truncate font-medium text-slate-700">{entry.label}</span>
                              <span className="text-slate-500">{entry.count}</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-[linear-gradient(90deg,#7c3aed,#4f46e5)]"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-[1.15rem] border border-dashed border-slate-200 bg-white/80 p-4 text-sm text-slate-500">
                        No room reservations yet for this date. If you book a desk, it will show up here room by room.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-sky-100 bg-[linear-gradient(180deg,#f5faff,#eef6ff)] p-5 shadow-[0_18px_44px_-36px_rgba(14,165,233,0.2)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-sky-500">Activity mix</p>
                    <p className="mt-1 text-sm font-medium text-slate-950">Reservations by segment and module</p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Day view</span>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-4">
                  {segmentActivityBreakdown.map((entry) => (
                    <button
                      key={entry.label}
                      type="button"
                      onClick={() =>
                        setActivityFocus((current) =>
                          current === entry.key ? "all" : (entry.key as "full" | "am" | "pm" | "offices"),
                        )
                      }
                      className={cn(
                        "rounded-[1.2rem] border border-white/80 bg-white/90 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5",
                        activityFocus === entry.key && "border-sky-200 ring-2 ring-sky-100",
                      )}
                    >
                      <div className={cn("h-2 rounded-full", entry.tone)} />
                      <p className="mt-4 text-2xl font-semibold text-slate-950">{entry.count}</p>
                      <p className="mt-1 text-sm text-slate-500">{entry.label}</p>
                    </button>
                  ))}
                </div>
                <div className="mt-5 rounded-[1.3rem] border border-white/80 bg-white/90 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">7-day pulse</p>
                      <p className="mt-1 text-sm font-medium text-slate-950">
                        {weeklyActivityTrend.some((entry) => entry.total > 0)
                          ? "A compact look at your activity rhythm around this day"
                          : "No bookings in this 7-day window yet"}
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
                      {activityFocus === "all" ? "All activity" : "Focused view"}
                    </Badge>
                  </div>
                  <div className="mt-5 grid grid-cols-7 gap-3">
                    {weeklyActivityTrend.map((entry) => (
                      <button
                        key={entry.dateLabel}
                        type="button"
                        onClick={() => setDate(entry.day)}
                        className={cn(
                          "rounded-[1rem] border border-slate-100 bg-slate-50/80 px-2 py-3 text-center transition-all hover:-translate-y-0.5 hover:bg-white",
                          entry.isCurrent && "border-violet-200 bg-violet-50/90",
                        )}
                      >
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{entry.label}</p>
                        <div className="mx-auto mt-3 flex h-16 w-4 items-end rounded-full bg-slate-100 p-1">
                          <div
                            className="w-full rounded-full bg-[linear-gradient(180deg,#7c3aed,#38bdf8)]"
                            style={{ height: `${Math.max(16, Math.round((entry.total / maxWeeklyTotal) * 100))}%` }}
                          />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-950">{entry.total}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
