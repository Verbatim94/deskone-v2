import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Circle, DoorClosed, LayoutGrid, Loader2 } from "lucide-react";
import { eachDayOfInterval, endOfMonth, format, isSameMonth, isToday, parseISO, startOfMonth } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function normalizeToDate(value: string) {
  return parseISO(`${value}T00:00:00`);
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

  const allDays = useMemo(() => {
    const daysInMonth = eachDayOfInterval({ start: range.monthStart, end: range.monthEnd });
    const startDayOfWeek = range.monthStart.getDay();
    const daysFromPrevMonth = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const calendarDays: Date[] = [];
    for (let index = daysFromPrevMonth; index > 0; index -= 1) {
      const day = new Date(range.monthStart);
      day.setDate(day.getDate() - index);
      calendarDays.push(day);
    }

    calendarDays.push(...daysInMonth);

    const remainingDays = 42 - calendarDays.length;
    for (let index = 1; index <= remainingDays; index += 1) {
      const day = new Date(range.monthEnd);
      day.setDate(day.getDate() + index);
      calendarDays.push(day);
    }

    return calendarDays;
  }, [range.monthEnd, range.monthStart]);

  const getDayItems = (day: Date) => {
    const roomItems = roomReservations.filter((reservation) => {
      if (reservation.status === "cancelled" || reservation.status === "rejected") {
        return false;
      }
      return format(day, "yyyy-MM-dd") === reservation.dateStart;
    });

    const officeItems = officeBookings.filter((booking) => format(new Date(booking.startsAt), "yyyy-MM-dd") === format(day, "yyyy-MM-dd"));

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

  if (scheduleQuery.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full space-y-3 overflow-hidden px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950 md:text-2xl">My Reservations</h1>
          <p className="mt-1 text-xs text-slate-500">View your desk bookings in calendar format.</p>
        </div>
        <Button onClick={() => setCurrentMonth(new Date())} className="self-start rounded-full px-6 sm:self-auto" size="sm">
          Today
        </Button>
      </div>

      <div className="flex-1 overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex h-full flex-col overflow-y-auto p-3 md:p-4">
          <div className="mb-4 flex flex-shrink-0 items-center justify-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="h-9 w-9 rounded-full hover:bg-accent">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="min-w-[180px] text-center text-lg font-semibold md:text-xl">{format(currentMonth, "MMMM yyyy")}</h2>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="h-9 w-9 rounded-full hover:bg-accent">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1 md:gap-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="py-2 text-center text-xs font-medium text-muted-foreground md:text-sm">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 md:gap-2">
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
                  disabled={!hasItems}
                  className={cn(
                    "relative flex min-h-[80px] flex-col items-start rounded-md border border-border bg-background p-2 transition-all md:min-h-[100px] md:p-3",
                    currentMonthDay ? "text-foreground" : "text-muted-foreground/40",
                    hasItems && "cursor-pointer hover:border-primary/40 hover:bg-accent/30",
                    !hasItems && "cursor-default",
                    today && "ring-2 ring-primary ring-offset-0",
                  )}
                >
                  <div className={cn("mb-auto text-sm font-medium md:text-base", today && currentMonthDay && "font-bold text-primary")}>
                    {format(day, "d")}
                  </div>

                  {hasItems ? (
                    <div className="mt-1 w-full space-y-1">
                      {roomItems.slice(0, 2).map((reservation) => (
                        <div key={reservation.id} className="flex items-center gap-1 text-[10px] md:text-xs" title={`${reservation.roomName} - ${reservation.status}`}>
                          <Circle className={cn("h-2 w-2 flex-shrink-0 fill-current", reservation.status === "approved" && "text-primary", reservation.status === "pending" && "text-muted-foreground")} />
                          <span className={cn("truncate", reservation.status === "approved" && "text-primary", reservation.status === "pending" && "text-muted-foreground")}>
                            {reservation.roomName}
                          </span>
                        </div>
                      ))}
                      {officeItems.slice(0, Math.max(0, 2 - roomItems.length)).map((booking) => (
                        <div key={booking.id} className="flex items-center gap-1 text-[10px] md:text-xs" title={`${booking.officeName} - ${booking.status}`}>
                          <Circle className="h-2 w-2 flex-shrink-0 fill-current text-emerald-500" />
                          <span className="truncate text-emerald-600">{booking.officeName}</span>
                        </div>
                      ))}
                      {roomItems.length + officeItems.length > 2 ? <div className="text-[10px] text-muted-foreground">...</div> : null}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 border-t pt-6 md:gap-6">
            <div className="flex items-center gap-2">
              <Circle className="h-3 w-3 fill-primary text-primary" />
              <span className="text-xs text-muted-foreground md:text-sm">Desk reservations</span>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="h-3 w-3 fill-emerald-500 text-emerald-500" />
              <span className="text-xs text-muted-foreground md:text-sm">Office bookings</span>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reservations for {selectedDay && format(selectedDay, "MMMM d, yyyy")}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            {selectedDayItems.roomItems.map((reservation) => (
              <div key={reservation.id} className="space-y-2 rounded-lg border p-4 transition-colors hover:bg-accent/50">
                <div className="space-y-1">
                  <div className="font-semibold text-slate-950">{reservation.roomName}</div>
                  <div className="text-sm text-muted-foreground">Desk {reservation.deskLabel ?? "Unlabelled"}</div>
                  <div className="flex items-center gap-2">
                    <Badge className={cn("rounded-full", reservation.status === "approved" ? "bg-primary/10 text-primary hover:bg-primary/10" : "bg-secondary text-secondary-foreground hover:bg-secondary")}>
                      {reservation.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{reservation.segment}</span>
                  </div>
                </div>
              </div>
            ))}

            {selectedDayItems.officeItems.map((booking) => (
              <div key={booking.id} className="space-y-2 rounded-lg border p-4 transition-colors hover:bg-accent/50">
                <div className="space-y-1">
                  <div className="font-semibold text-slate-950">{booking.officeName}</div>
                  <div className="text-sm text-muted-foreground">{booking.floorLabel ?? "Office booking"}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>{formatDateTime(booking.startsAt)} - {formatDateTime(booking.endsAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
