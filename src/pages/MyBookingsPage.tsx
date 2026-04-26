import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, DoorClosed, LayoutGrid, LoaderCircle, MapPin, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/context/useAuth";
import { getMySchedule } from "@/features/schedule/api";

function getDateRange() {
  const today = new Date();
  const from = new Date(today);
  const to = new Date(today);
  to.setDate(to.getDate() + 30);

  const formatDate = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  return {
    fromDate: formatDate(from),
    toDate: formatDate(to),
  };
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));
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
  const range = useMemo(() => getDateRange(), []);

  const scheduleQuery = useQuery({
    queryKey: ["my-schedule", activeOrganizationId, range.fromDate, range.toDate],
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
  const totalItems = roomReservations.length + officeBookings.length;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2.5rem] border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9)_48%,rgba(224,242,254,0.64))] p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-sky-100 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-100">
                My bookings
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
                {activeOrganization?.name ?? "No environment"}
              </Badge>
            </div>

            <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Keep the next few weeks of desks and offices in one calm, readable planning surface.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              This view pulls together your room reservations and office bookings so you can quickly see where you are
              expected to work, what is coming next and what still needs attention.
            </p>
          </div>

          <Card className="rounded-[2rem] border-slate-200/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(15,23,42,0.82))] text-white shadow-none">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Next 30 days</p>
                <Badge className="rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-100 hover:bg-white/10">
                  Personal view
                </Badge>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-100">
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">{roomReservations.length} room reservations</div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">{officeBookings.length} office bookings</div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  Window: {formatDay(range.fromDate)} | {formatDay(range.toDate)}
                </div>
                <div className="rounded-[1.4rem] border border-sky-400/20 bg-sky-400/10 p-4 text-sky-50">
                  {totalItems
                    ? `${totalItems} items currently tracked in your personal timeline.`
                    : "No bookings scheduled yet in this horizon."}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {scheduleQuery.isError ? (
        <Card className="rounded-[1.8rem] border-amber-200/80 bg-amber-50/90 shadow-none">
          <CardContent className="p-5 text-sm leading-7 text-amber-950">
            Your personal timeline is already designed and ready, but the backend endpoint for this view is not fully
            live yet in this environment. Rooms and Offices remain fully operational while we finish that last step.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <LayoutGrid className="h-5 w-5 text-sky-700" />
              Desk reservations
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {scheduleQuery.isLoading ? (
              <div className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-6 text-sm text-slate-600">
                <LoaderCircle className="mb-3 h-5 w-5 animate-spin text-sky-700" />
                Loading your reservations...
              </div>
            ) : null}

            {!scheduleQuery.isLoading && !roomReservations.length ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                No desk reservations in the next 30 days.
              </div>
            ) : null}

            {roomReservations.map((reservation) => (
              <article key={reservation.id} className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{reservation.roomName}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Desk {reservation.deskLabel ?? "Unlabelled"} | {reservation.segment}
                    </p>
                  </div>
                  <Badge
                    className={
                      reservation.status === "approved"
                        ? "rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 hover:bg-emerald-100"
                        : reservation.status === "pending"
                          ? "rounded-full bg-amber-100 px-3 py-1 text-amber-800 hover:bg-amber-100"
                          : "rounded-full bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-200"
                    }
                  >
                    {reservation.status}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-sky-700" />
                    {formatDay(reservation.dateStart)}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-sky-700" />
                    {reservation.roomSlug}
                  </span>
                </div>

                {reservation.notes ? <p className="mt-4 text-sm leading-6 text-slate-600">{reservation.notes}</p> : null}
              </article>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <DoorClosed className="h-5 w-5 text-sky-700" />
              Office bookings
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!scheduleQuery.isLoading && !officeBookings.length ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                No office bookings in the next 30 days.
              </div>
            ) : null}

            {officeBookings.map((booking) => (
              <article key={booking.id} className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{booking.officeName}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {booking.floorLabel ?? "Floor unset"}
                      {booking.locationLabel ? ` | ${booking.locationLabel}` : ""}
                    </p>
                  </div>
                  <Badge
                    className={
                      booking.status === "active"
                        ? "rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 hover:bg-emerald-100"
                        : "rounded-full bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-200"
                    }
                  >
                    {booking.status}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-sky-700" />
                    {formatDateTime(booking.startsAt)} | {formatDateTime(booking.endsAt)}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Users className="h-4 w-4 text-sky-700" />
                    {booking.attendeeCount} people
                  </span>
                </div>

                {booking.note ? <p className="mt-4 text-sm leading-6 text-slate-600">{booking.note}</p> : null}
              </article>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
