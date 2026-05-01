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
  const dateIso = useMemo(() => formatIsoDate(date), [date]);

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

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => setDate(subDays(date, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[230px] justify-start rounded-full border-slate-200 bg-white font-medium text-slate-700">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(date, "PPP")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto rounded-2xl border-slate-200 p-0" align="end">
              <Calendar mode="single" selected={date} onSelect={(value) => value && setDate(value)} initialFocus />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => setDate(addDays(date, 1))}>
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
              {roomsWithAvailability.map((room, index) => (
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
                    {room.description ?? "Shared room ready for booking."}
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
              <div className="rounded-[1.4rem] bg-[#f6f2ff] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-violet-500">Environment</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{activeOrganization?.name ?? "No environment"}</p>
              </div>
              <div className="rounded-[1.4rem] bg-[#eef6ff] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-sky-500">Reservations</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{roomReservations.length}</p>
              </div>
              <div className="rounded-[1.4rem] bg-[#fff5f3] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-orange-500">Office bookings</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{officeBookings.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
