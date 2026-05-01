import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, DoorClosed, LayoutGrid, LoaderCircle, MapPin, Sparkles, Users } from "lucide-react";

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
  const nextDesk = roomReservations[0] ?? null;
  const nextOffice = officeBookings[0] ?? null;

  return (
    <div className="space-y-8">
      <section className="premium-surface overflow-hidden rounded-[3rem] p-6 sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="playful-chip rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-50">
                My bookings
              </Badge>
              <Badge variant="outline" className="rounded-full border-white/80 bg-white/70 px-3 py-1 text-slate-600">
                {activeOrganization?.name ?? "No environment"}
              </Badge>
            </div>

            <h1 className="premium-display mt-5 max-w-3xl text-[2.45rem] font-semibold tracking-tight text-slate-950 sm:text-[4rem] sm:leading-[1.02]">
              A personal planning view that keeps desks, offices and the next few weeks in one calm rhythm.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              This is your personal runway. Instead of checking separate modules, you can see where you are expected to
              be, what is next and where the schedule still has room to breathe.
            </p>
          </div>

          <Card className="premium-dark rounded-[2.25rem] border-slate-900/80 text-white shadow-none">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Next 30 days</p>
                <Badge className="rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-100 hover:bg-white/10">
                  Personal view
                </Badge>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-100">
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">{roomReservations.length} desk reservations</div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">{officeBookings.length} office bookings</div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  Window: {formatDay(range.fromDate)} - {formatDay(range.toDate)}
                </div>
                <div className="rounded-[1.4rem] border border-sky-400/20 bg-sky-400/10 p-4 text-sky-50">
                  {totalItems ? `${totalItems} items are already shaping your personal timeline.` : "No bookings yet in this horizon."}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {scheduleQuery.isError ? (
        <Card className="rounded-[1.9rem] border-amber-200/80 bg-amber-50/90 shadow-none">
          <CardContent className="p-5 text-sm leading-7 text-amber-950">
            The personal timeline surface is ready, but this environment is still waiting for a fully healthy schedule
            response. Rooms and Offices remain operational while we keep that endpoint under watch.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[1.8rem] border border-white/85 bg-white/76 p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.16)] backdrop-blur">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Next desk</p>
          <p className="mt-3 text-lg font-semibold text-slate-950">
            {nextDesk ? `${nextDesk.roomName} · ${nextDesk.deskLabel ?? "Desk"}` : "No desk booking yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {nextDesk ? `${formatDay(nextDesk.dateStart)} · ${nextDesk.segment}` : "Your next desk moment will appear here."}
          </p>
        </div>
        <div className="rounded-[1.8rem] border border-white/85 bg-white/76 p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.16)] backdrop-blur">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Next office</p>
          <p className="mt-3 text-lg font-semibold text-slate-950">
            {nextOffice ? nextOffice.officeName : "No office booking yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {nextOffice ? formatDateTime(nextOffice.startsAt) : "Private office time will appear when it exists."}
          </p>
        </div>
        <div className="rounded-[1.8rem] border border-white/85 bg-white/76 p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.16)] backdrop-blur">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Planning mood</p>
          <p className="mt-3 text-lg font-semibold text-slate-950">
            {totalItems ? "Structured and visible" : "Still open and flexible"}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Keep one elegant horizon instead of juggling separate booking surfaces.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="premium-surface rounded-[2.2rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <LayoutGrid className="h-5 w-5 text-sky-700" />
              Desk reservations
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {scheduleQuery.isLoading ? (
              <div className="rounded-[1.6rem] border border-slate-200/70 bg-white/80 p-6 text-sm text-slate-600">
                <LoaderCircle className="mb-3 h-5 w-5 animate-spin text-sky-700" />
                Loading your room timeline...
              </div>
            ) : null}

            {!scheduleQuery.isLoading && !roomReservations.length ? (
              <div className="rounded-[1.6rem] border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-500">
                No desk reservations in the next 30 days.
              </div>
            ) : null}

            {roomReservations.map((reservation) => (
              <article
                key={reservation.id}
                className="rounded-[1.65rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(244,247,255,0.9))] p-5 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.14)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{reservation.roomName}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Desk {reservation.deskLabel ?? "Unlabelled"} · {reservation.segment}
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

        <Card className="premium-surface rounded-[2.2rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <DoorClosed className="h-5 w-5 text-sky-700" />
              Office bookings
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!scheduleQuery.isLoading && !officeBookings.length ? (
              <div className="rounded-[1.6rem] border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-500">
                No office bookings in the next 30 days.
              </div>
            ) : null}

            {officeBookings.map((booking) => (
              <article
                key={booking.id}
                className="rounded-[1.65rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(244,247,255,0.9))] p-5 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.14)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{booking.officeName}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {booking.floorLabel ?? "Floor unset"}
                      {booking.locationLabel ? ` · ${booking.locationLabel}` : ""}
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
                    {formatDateTime(booking.startsAt)} - {formatDateTime(booking.endsAt)}
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
