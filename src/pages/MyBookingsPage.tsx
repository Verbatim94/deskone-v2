import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Circle, DoorClosed, LayoutGrid, Loader2 } from "lucide-react";
import { eachDayOfInterval, endOfMonth, format, isSameMonth, isToday, parseISO, startOfMonth } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/context/useAuth";
import { getMySchedule } from "@/features/schedule/api";
import { cn } from "@/lib/utils";

function getCalendarRange(anchorMonth: Date) {
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

export default function MyBookingsPage() {
  const { activeOrganization, activeOrganizationId } = useAuth();
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get("date");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const range = useMemo(() => getCalendarRange(currentMonth), [currentMonth]);

  const scheduleQuery = useQuery({
    queryKey: ["my-schedule-calendar", activeOrganizationId, range.fromDate, range.toDate],
    enabled: Boolean(activeOrganizationId),
    queryFn: () =>
      getMySchedule({
        organizationId: activeOrganizationId!,
        fromDate: range.fromDate,
        toDate: range.toDate,
      }),
  });

  const roomReservations = scheduleQuery.data?.roomReservations ?? [];
  const officeBookings = scheduleQuery.data?.officeBookings ?? [];

  useEffect(() => {
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return;
    }

    const parsedDay = parseISO(dateParam);
    if (Number.isNaN(parsedDay.getTime())) {
      return;
    }

    setCurrentMonth(new Date(parsedDay.getFullYear(), parsedDay.getMonth(), 1));
    setSelectedDay(parsedDay);
  }, [dateParam]);

  const allDays = useMemo(() => {
    const monthDays = eachDayOfInterval({ start: range.monthStart, end: range.monthEnd });
    const startDay = range.monthStart.getDay();
    const daysFromPrevMonth = startDay === 0 ? 6 : startDay - 1;
    const days: Date[] = [];

    for (let index = daysFromPrevMonth; index > 0; index -= 1) {
      const day = new Date(range.monthStart);
      day.setDate(day.getDate() - index);
      days.push(day);
    }

    days.push(...monthDays);

    const remaining = 42 - days.length;
    for (let index = 1; index <= remaining; index += 1) {
      const day = new Date(range.monthEnd);
      day.setDate(day.getDate() + index);
      days.push(day);
    }

    return days;
  }, [range.monthEnd, range.monthStart]);

  const getDayItems = (day: Date) => {
    const roomItems = roomReservations.filter((reservation) => {
      if (reservation.status === "cancelled" || reservation.status === "rejected") {
        return false;
      }
      return format(day, "yyyy-MM-dd") === reservation.dateStart;
    });

    const officeItems = officeBookings.filter(
      (booking) => format(new Date(booking.startsAt), "yyyy-MM-dd") === format(day, "yyyy-MM-dd"),
    );

    return { roomItems, officeItems };
  };

  const handleDayClick = (day: Date) => {
    const { roomItems, officeItems } = getDayItems(day);
    if (!roomItems.length && !officeItems.length) {
      return;
    }
    setSelectedDay(day);
    setIsDialogOpen(true);
  };

  const selectedDayItems = selectedDay ? getDayItems(selectedDay) : { roomItems: [], officeItems: [] };

  useEffect(() => {
    if (!selectedDay) {
      return;
    }

    const { roomItems, officeItems } = getDayItems(selectedDay);
    setIsDialogOpen(roomItems.length > 0 || officeItems.length > 0);
  }, [selectedDay, roomReservations, officeBookings]);

  if (scheduleQuery.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="rounded-full bg-violet-100 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-violet-700 hover:bg-violet-100">
              My Reservations
            </Badge>
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
              {activeOrganization?.name ?? "No environment"}
            </Badge>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Personal schedule</h1>
        </div>
        <Button
          onClick={() => setCurrentMonth(new Date())}
          className="rounded-full bg-violet-600 px-6 text-white shadow-[0_18px_40px_-26px_rgba(124,58,237,0.45)] hover:bg-violet-700"
        >
          Today
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <Card className="rounded-[2rem] border-white/80 bg-white/96 shadow-[0_28px_72px_-40px_rgba(91,74,255,0.18)]">
          <CardContent className="p-6">
            <div className="mb-5 flex items-center justify-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full bg-violet-50 text-violet-700 hover:bg-violet-100 hover:text-violet-800"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-[220px] rounded-full border border-slate-200/80 bg-slate-50/90 px-5 py-2.5 text-center shadow-inner">
                <h2 className="text-2xl font-bold capitalize text-slate-950">{format(currentMonth, "MMMM yyyy")}</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            <div className="mb-3 grid grid-cols-7 gap-2">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div key={day} className="py-2 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {allDays.map((day, index) => {
                const { roomItems, officeItems } = getDayItems(day);
                const hasItems = roomItems.length > 0 || officeItems.length > 0;
                const currentMonthDay = isSameMonth(day, currentMonth);
                const today = isToday(day);

                return (
                  <button
                    key={`${format(day, "yyyy-MM-dd")}-${index}`}
                    type="button"
                    onClick={() => handleDayClick(day)}
                    className={cn(
                      "relative min-h-[96px] rounded-[1.2rem] border p-3 text-left transition-all",
                      currentMonthDay ? "border-white/80 bg-white text-slate-950" : "border-transparent bg-white/40 text-slate-400",
                      hasItems && "hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-28px_rgba(91,74,255,0.2)]",
                      today && "ring-2 ring-violet-400 ring-offset-0",
                    )}
                  >
                    <div className={cn("text-sm font-semibold", today && currentMonthDay && "text-violet-600")}>
                      {format(day, "d")}
                    </div>

                    {hasItems ? (
                      <div className="mt-5 space-y-1.5">
                        {roomItems.slice(0, 2).map((reservation) => (
                          <div key={reservation.id} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                            <Circle className="h-2 w-2 fill-current text-violet-500" />
                            <span className="truncate">{reservation.roomName}</span>
                          </div>
                        ))}
                        {officeItems.slice(0, Math.max(0, 2 - roomItems.length)).map((booking) => (
                          <div key={booking.id} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                            <Circle className="h-2 w-2 fill-current text-orange-400" />
                            <span className="truncate">{booking.officeName}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[2rem] border-white/80 bg-white/96 shadow-[0_28px_72px_-40px_rgba(91,74,255,0.18)]">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-slate-950">Overview</h2>
              <div className="mt-5 grid gap-4">
                <div className="rounded-[1.4rem] border border-violet-100 bg-[linear-gradient(180deg,#faf7ff,#f4edff)] p-4 shadow-[0_18px_44px_-36px_rgba(124,58,237,0.28)]">
                  <p className="text-xs uppercase tracking-[0.18em] text-violet-500">Desk reservations</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">{roomReservations.length}</p>
                </div>
                <div className="rounded-[1.4rem] border border-orange-100 bg-[linear-gradient(180deg,#fff7f2,#fff2ea)] p-4 shadow-[0_18px_44px_-36px_rgba(249,115,22,0.22)]">
                  <p className="text-xs uppercase tracking-[0.18em] text-orange-500">Office bookings</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">{officeBookings.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md rounded-[1.8rem] border-white/80 bg-white/98">
          <DialogHeader>
            <DialogTitle>Reservations for {selectedDay && format(selectedDay, "MMMM d, yyyy")}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            {selectedDayItems.roomItems.map((reservation) => (
              <div key={reservation.id} className="space-y-2 rounded-[1.2rem] border border-slate-100 bg-[#f6f2ff] p-4">
                <div className="space-y-1">
                  <div className="font-semibold text-slate-950">{reservation.roomName}</div>
                  <div className="text-sm text-slate-500">Desk {reservation.deskLabel ?? "Unlabelled"}</div>
                  <div className="text-xs uppercase tracking-[0.16em] text-violet-500">{reservation.segment}</div>
                </div>
              </div>
            ))}

            {selectedDayItems.officeItems.map((booking) => (
              <div key={booking.id} className="space-y-2 rounded-[1.2rem] border border-slate-100 bg-[#fff5f3] p-4">
                <div className="space-y-1">
                  <div className="font-semibold text-slate-950">{booking.officeName}</div>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>
                      {formatDateTime(booking.startsAt)} - {formatDateTime(booking.endsAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <DoorClosed className="h-3.5 w-3.5" />
                    <span>{booking.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
