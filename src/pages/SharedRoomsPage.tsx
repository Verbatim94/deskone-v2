import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { addDays, format, subDays } from "date-fns";
import { ArrowRight, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Grid3x3, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function getAvailabilityColor(percentage: number) {
  if (percentage >= 70) return "text-emerald-600";
  if (percentage >= 30) return "text-amber-600";
  return "text-rose-600";
}

function getAvailabilityBar(percentage: number) {
  if (percentage >= 70) return "from-emerald-500 to-cyan-400";
  if (percentage >= 30) return "from-amber-400 to-orange-400";
  return "from-rose-500 to-red-400";
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
      loading: availabilityQueries[index]?.isLoading ?? false,
    };
  });

  const isLoadingAvailability =
    roomsQuery.isLoading || availabilityQueries.some((query) => query.isLoading && !query.data);

  const roomReservations = activityQuery.data?.roomReservations ?? [];
  const officeBookings = activityQuery.data?.officeBookings ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Shared Rooms</h1>
          <p className="mt-1 text-sm text-slate-500">Check availability and book desks in shared spaces.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm font-medium text-slate-600">Check Availability for:</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setDate(subDays(date, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[240px] justify-start rounded-full border-white/80 bg-white/70 text-left font-normal",
                    !date && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="single" selected={date} onSelect={(value) => value && setDate(value)} initialFocus />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" onClick={() => setDate(addDays(date, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="md:col-span-3 min-h-0">
          {isLoadingAvailability ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !roomsWithAvailability.length ? (
            <Card className="premium-surface rounded-[2rem]">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Grid3x3 className="mb-4 h-12 w-12 text-slate-400" />
                <h3 className="text-lg font-semibold text-slate-950">No shared rooms</h3>
                <p className="mt-2 text-sm text-slate-500">You do not have access to any shared rooms yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {roomsWithAvailability.map((room) => (
                <Card key={room.id} className="overflow-hidden border-slate-100 bg-white transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                      <Grid3x3 className="h-5 w-5 shrink-0 text-primary" />
                      <span className="truncate">{room.name}</span>
                    </CardTitle>
                    {room.description ? <p className="line-clamp-2 text-sm text-slate-500">{room.description}</p> : null}
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between gap-4">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Availability</span>
                          <span className={cn("font-bold", getAvailabilityColor(room.percentage))}>{room.percentage}% Free</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", getAvailabilityBar(room.percentage))}
                            style={{ width: `${room.percentage}%` }}
                          />
                        </div>
                        <div className="mt-1 flex justify-between text-xs text-slate-500">
                          <span>{room.availableDesks} desks free</span>
                          <span>{room.totalDesks} total</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="rounded-full bg-slate-50">
                          {room.zoneCount} zones
                        </Badge>
                        <Badge variant="outline" className="rounded-full bg-slate-50">
                          {room.accessRole}
                        </Badge>
                      </div>
                    </div>

                    <Button
                      className="mt-2 w-full"
                      onClick={() => navigate(`/rooms?room=${room.id}`)}
                    >
                      View & Book <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 border-l pl-6">
          <Card className="premium-surface rounded-[2rem]">
            <CardHeader>
              <CardTitle className="text-base text-slate-950">Your activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-[1.2rem] border border-slate-200 bg-white/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Environment</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{activeOrganization?.name ?? "No environment"}</p>
              </div>
              <div className="rounded-[1.2rem] border border-slate-200 bg-white/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Desk reservations</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{roomReservations.length}</p>
              </div>
              <div className="rounded-[1.2rem] border border-slate-200 bg-white/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Office bookings</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{officeBookings.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
