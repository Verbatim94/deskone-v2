import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, DoorClosed, LoaderCircle, ShieldCheck, UnlockKeyhole, UserRoundCheck } from "lucide-react";

import { useAuth } from "@/features/auth/context/useAuth";
import {
  cancelOfficeBooking,
  createOfficeBooking,
  createOfficeReleaseWindow,
  deleteOfficeReleaseWindow,
  getOfficesOverview,
  type OfficeOverview,
  type OfficeReleaseKind,
} from "@/features/offices/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { EdgeClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const releasePresetConfig: Record<Exclude<OfficeReleaseKind, "custom">, { label: string; start: string; end: string }> = {
  morning: { label: "Morning", start: "08:00", end: "13:00" },
  afternoon: { label: "Afternoon", start: "13:00", end: "18:00" },
  full_day: { label: "Full day", start: "08:00", end: "18:00" },
};

function getDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalIso(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
}

function getOverviewWindow(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return {
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
  };
}

function formatTimeLabel(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTimeRange(startsAt: string, endsAt: string) {
  return `${formatTimeLabel(startsAt)} - ${formatTimeLabel(endsAt)}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function OfficeModulePage() {
  const queryClient = useQueryClient();
  const { activeOrganization, activeOrganizationId } = useAuth();
  const [selectedDate, setSelectedDate] = useState(getDateInputValue);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null);
  const [selectedReleasePreset, setSelectedReleasePreset] = useState<Exclude<OfficeReleaseKind, "custom">>("morning");
  const [releaseNote, setReleaseNote] = useState("");
  const [bookingStartTime, setBookingStartTime] = useState("09:00");
  const [bookingEndTime, setBookingEndTime] = useState("10:00");
  const [attendeeCount, setAttendeeCount] = useState("1");
  const [bookingNote, setBookingNote] = useState("");

  const overviewWindow = useMemo(() => getOverviewWindow(selectedDate), [selectedDate]);

  const officesQuery = useQuery({
    queryKey: ["offices-overview", activeOrganizationId, selectedDate],
    enabled: Boolean(activeOrganizationId),
    queryFn: () =>
      getOfficesOverview({
        organizationId: activeOrganizationId!,
        date: selectedDate,
        windowStart: overviewWindow.windowStart,
        windowEnd: overviewWindow.windowEnd,
      }),
  });

  useEffect(() => {
    const offices = officesQuery.data?.offices ?? [];

    if (!offices.length) {
      setSelectedOfficeId(null);
      return;
    }

    if (!selectedOfficeId || !offices.some((office) => office.id === selectedOfficeId)) {
      setSelectedOfficeId(offices[0]?.id ?? null);
    }
  }, [officesQuery.data?.offices, selectedOfficeId]);

  const selectedOffice = useMemo<OfficeOverview | null>(
    () => officesQuery.data?.offices.find((office) => office.id === selectedOfficeId) ?? null,
    [officesQuery.data?.offices, selectedOfficeId],
  );

  const officesOverviewKey = ["offices-overview", activeOrganizationId, selectedDate] as const;

  const createReleaseMutation = useMutation({
    mutationFn: async () => {
      if (!activeOrganizationId || !selectedOffice) {
        throw new Error("Pick an office first.");
      }

      const preset = releasePresetConfig[selectedReleasePreset];

      return createOfficeReleaseWindow({
        organizationId: activeOrganizationId,
        officeId: selectedOffice.id,
        releaseKind: selectedReleasePreset,
        startsAt: toLocalIso(selectedDate, preset.start),
        endsAt: toLocalIso(selectedDate, preset.end),
        note: releaseNote || null,
      });
    },
    onSuccess: () => {
      toast.success("Office release window created.");
      setReleaseNote("");
      void queryClient.invalidateQueries({ queryKey: officesOverviewKey });
    },
    onError: (error) => {
      const message = error instanceof EdgeClientError ? error.message : "Unable to create the release window.";
      toast.error(message);
    },
  });

  const removeReleaseMutation = useMutation({
    mutationFn: async (releaseWindowId: string) => {
      if (!activeOrganizationId) {
        throw new Error("Missing organization.");
      }

      return deleteOfficeReleaseWindow({
        organizationId: activeOrganizationId,
        releaseWindowId,
      });
    },
    onSuccess: () => {
      toast.success("Release window removed.");
      void queryClient.invalidateQueries({ queryKey: officesOverviewKey });
    },
    onError: (error) => {
      const message = error instanceof EdgeClientError ? error.message : "Unable to remove the release window.";
      toast.error(message);
    },
  });

  const createBookingMutation = useMutation({
    mutationFn: async () => {
      if (!activeOrganizationId || !selectedOffice) {
        throw new Error("Pick an office first.");
      }

      return createOfficeBooking({
        organizationId: activeOrganizationId,
        officeId: selectedOffice.id,
        startsAt: toLocalIso(selectedDate, bookingStartTime),
        endsAt: toLocalIso(selectedDate, bookingEndTime),
        attendeeCount: Number(attendeeCount),
        note: bookingNote || null,
      });
    },
    onSuccess: () => {
      toast.success("Office booking created.");
      setBookingNote("");
      void queryClient.invalidateQueries({ queryKey: officesOverviewKey });
    },
    onError: (error) => {
      const message = error instanceof EdgeClientError ? error.message : "Unable to create the booking.";
      toast.error(message);
    },
  });

  const cancelBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      if (!activeOrganizationId) {
        throw new Error("Missing organization.");
      }

      return cancelOfficeBooking({
        organizationId: activeOrganizationId,
        bookingId,
      });
    },
    onSuccess: () => {
      toast.success("Office booking cancelled.");
      void queryClient.invalidateQueries({ queryKey: officesOverviewKey });
    },
    onError: (error) => {
      const message = error instanceof EdgeClientError ? error.message : "Unable to cancel the booking.";
      toast.error(message);
    },
  });

  if (!activeOrganizationId || !activeOrganization) {
    return (
      <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
        <CardContent className="p-8 text-sm leading-7 text-slate-600">
          Offices need an active organization. Once the super-admin creates the first environment and assigns your
          membership, this module will become operational.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2.5rem] border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88)_50%,rgba(224,242,254,0.62))] p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.12fr,0.88fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-sky-700">Offices</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Manage executive spaces with tight control, then open them in elegant, precise booking windows.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              Offices belong to <span className="font-medium text-slate-900">{activeOrganization.name}</span>. Owners
              and admins can open availability for part of the day or the full day, while bookings stay constrained to
              15-minute increments and a maximum of 8 hours.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-slate-700">
            <div className="rounded-[1.4rem] border border-white/70 bg-white/80 p-4 shadow-sm">
              Morning maps to 08:00-13:00, afternoon to 13:00-18:00 and full day to 08:00-18:00.
            </div>
            <div className="rounded-[1.4rem] border border-white/70 bg-white/80 p-4 shadow-sm">
              Booking overlap is blocked before confirmation, so office occupancy stays reliable.
            </div>
            <div className="rounded-[1.4rem] border border-white/70 bg-white/80 p-4 shadow-sm">
              Owners and admins keep control of release windows without turning the flow into a complicated planner.
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-xl text-slate-950">Release control</CardTitle>
              <Input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-11 max-w-[190px] rounded-xl border-slate-200"
              />
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {officesQuery.isLoading ? (
              <div className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-6 text-sm text-slate-600">
                <LoaderCircle className="mb-3 h-5 w-5 animate-spin text-sky-700" />
                Loading offices for {activeOrganization.name}...
              </div>
            ) : null}

            {!officesQuery.isLoading && !officesQuery.data?.offices.length ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                No offices exist yet for this organization.
              </div>
            ) : null}

            {officesQuery.data?.offices.map((office) => (
              <button
                key={office.id}
                type="button"
                onClick={() => setSelectedOfficeId(office.id)}
                className={cn(
                  "rounded-[1.5rem] border p-5 text-left transition-colors",
                  office.id === selectedOffice?.id
                    ? "border-sky-200 bg-sky-50 shadow-sm"
                    : "border-slate-200/70 bg-slate-50 hover:bg-white",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{office.name}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Owner: {office.ownerLabel ?? "Not assigned"} | {office.floorLabel ?? "Floor unset"}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {office.locationLabel ?? "Location unset"}
                    </p>
                  </div>
                  <Badge className="rounded-full bg-slate-950 px-3 py-1 text-white hover:bg-slate-950">
                    {office.capacity} seats
                  </Badge>
                </div>
              </button>
            ))}

            {selectedOffice ? (
              <div className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Release preset</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {selectedOffice.isManageableByCurrentUser
                        ? "You can release this office because you are the owner or an org admin."
                        : "Only the owner or an org admin can release this office."}
                    </p>
                  </div>
                  <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
                    {selectedOffice.isOwnedByCurrentUser ? "Owner view" : "Consumer view"}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  {(Object.entries(releasePresetConfig) as [Exclude<OfficeReleaseKind, "custom">, { label: string; start: string; end: string }][]).map(
                    ([preset, config]) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setSelectedReleasePreset(preset)}
                        className={cn(
                          "rounded-xl border px-3 py-3 text-sm font-medium transition-colors",
                          selectedReleasePreset === preset
                            ? "border-cyan-400 bg-cyan-50 text-cyan-700"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                        )}
                      >
                        <span className="block">{config.label}</span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {config.start} - {config.end}
                        </span>
                      </button>
                    ),
                  )}
                </div>

                <div className="mt-4 grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="release-note">
                    Release note
                  </label>
                  <textarea
                    id="release-note"
                    value={releaseNote}
                    onChange={(event) => setReleaseNote(event.target.value)}
                    className="min-h-[92px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-sky-300"
                    placeholder="Optional context for the release window"
                    disabled={!selectedOffice.isManageableByCurrentUser}
                  />
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                    onClick={() => createReleaseMutation.mutate()}
                    disabled={!selectedOffice.isManageableByCurrentUser || createReleaseMutation.isPending}
                  >
                    <UnlockKeyhole className="mr-2 h-4 w-4" />
                    {createReleaseMutation.isPending ? "Releasing..." : "Release office"}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">Booking timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {selectedOffice ? (
                <>
                  <div className="rounded-[1.6rem] border border-slate-200/70 bg-slate-50 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{selectedOffice.name}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {selectedOffice.ownerLabel ?? "No owner"} | Capacity {selectedOffice.capacity}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
                        <Clock3 className="h-4 w-4 text-sky-700" />
                        15-minute increments
                      </div>
                    </div>

                    <div className="mt-6 space-y-3">
                      {(selectedOffice.releaseWindows.length ? selectedOffice.releaseWindows : [null]).map((releaseWindow, index) =>
                        releaseWindow ? (
                          <div
                            key={releaseWindow.id}
                            className="rounded-[1.2rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="font-medium capitalize">{releaseWindow.releaseKind.replaceAll("_", " ")}</p>
                                <p className="mt-1 text-emerald-800">{formatTimeRange(releaseWindow.startsAt, releaseWindow.endsAt)}</p>
                                <p className="mt-1 text-xs text-emerald-700">
                                  Released by {releaseWindow.releasedBy ?? "Unknown"} | {formatDateTime(releaseWindow.createdAt)}
                                </p>
                              </div>
                              {selectedOffice.isManageableByCurrentUser ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-xl border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-100"
                                  onClick={() => removeReleaseMutation.mutate(releaseWindow.id)}
                                  disabled={removeReleaseMutation.isPending}
                                >
                                  <DoorClosed className="mr-2 h-4 w-4" />
                                  Close release
                                </Button>
                              ) : null}
                            </div>
                            {releaseWindow.note ? <p className="mt-3 text-sm text-emerald-900">{releaseWindow.note}</p> : null}
                          </div>
                        ) : (
                          <div
                            key={`empty-release-${index}`}
                            className="rounded-[1.2rem] border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-500"
                          >
                            No release windows yet for this date.
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.6rem] border border-slate-200/70 bg-slate-50 p-5">
                    <p className="text-sm font-semibold text-slate-950">New booking</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-700" htmlFor="booking-start">
                          Start
                        </label>
                        <Input
                          id="booking-start"
                          type="time"
                          step={900}
                          value={bookingStartTime}
                          onChange={(event) => setBookingStartTime(event.target.value)}
                          className="h-11 rounded-xl border-slate-200"
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-700" htmlFor="booking-end">
                          End
                        </label>
                        <Input
                          id="booking-end"
                          type="time"
                          step={900}
                          value={bookingEndTime}
                          onChange={(event) => setBookingEndTime(event.target.value)}
                          className="h-11 rounded-xl border-slate-200"
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-700" htmlFor="attendee-count">
                          People
                        </label>
                        <Input
                          id="attendee-count"
                          type="number"
                          min={1}
                          max={selectedOffice.capacity}
                          value={attendeeCount}
                          onChange={(event) => setAttendeeCount(event.target.value)}
                          className="h-11 rounded-xl border-slate-200"
                        />
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="booking-note">
                        Booking note
                      </label>
                      <textarea
                        id="booking-note"
                        value={bookingNote}
                        onChange={(event) => setBookingNote(event.target.value)}
                        className="min-h-[92px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-sky-300"
                        placeholder="Optional context for the booking"
                      />
                    </div>
                    <div className="mt-4">
                      <Button
                        type="button"
                        className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                        onClick={() => createBookingMutation.mutate()}
                        disabled={createBookingMutation.isPending}
                      >
                        {createBookingMutation.isPending ? "Booking..." : "Book office"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-[1.6rem] border border-slate-200/70 bg-slate-50 p-5">
                    <p className="text-sm font-semibold text-slate-950">Active bookings</p>
                    <div className="mt-4 grid gap-3">
                      {(selectedOffice.bookings.length ? selectedOffice.bookings : [null]).map((booking, index) =>
                        booking ? (
                          <article
                            key={booking.id}
                            className="rounded-[1.2rem] border border-slate-200/70 bg-white px-4 py-4 text-sm text-slate-600"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-slate-950">{booking.bookedBy}</p>
                                <p className="mt-1">{formatTimeRange(booking.startsAt, booking.endsAt)}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                                  {booking.attendeeCount} people | {booking.status}
                                </p>
                              </div>
                              {booking.canCancel ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-xl border-slate-200 bg-slate-50"
                                  onClick={() => cancelBookingMutation.mutate(booking.id)}
                                  disabled={cancelBookingMutation.isPending}
                                >
                                  Cancel
                                </Button>
                              ) : null}
                            </div>
                            {booking.note ? <p className="mt-3 text-slate-600">{booking.note}</p> : null}
                          </article>
                        ) : (
                          <div
                            key={`empty-booking-${index}`}
                            className="rounded-[1.2rem] border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-500"
                          >
                            No bookings yet for this date.
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                  Pick an office to inspect its release windows and bookings.
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[1.4rem] border border-slate-200/70 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="flex items-center gap-2 font-medium text-slate-950">
                    <UserRoundCheck className="h-4 w-4 text-sky-700" />
                    Ownership
                  </div>
                  <p className="mt-2">The owner can release the office directly and intervene on active bookings when needed.</p>
                </div>
                <div className="rounded-[1.4rem] border border-slate-200/70 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="flex items-center gap-2 font-medium text-slate-950">
                    <ShieldCheck className="h-4 w-4 text-sky-700" />
                    Admin override
                  </div>
                  <p className="mt-2">Organization admins can operate the same controls for continuity and operational support.</p>
                </div>
                <div className="rounded-[1.4rem] border border-slate-200/70 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="flex items-center gap-2 font-medium text-slate-950">
                    <Clock3 className="h-4 w-4 text-sky-700" />
                    Hard limits
                  </div>
                  <p className="mt-2">No booking goes beyond 8 hours, and the database itself blocks overlapping office reservations.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
