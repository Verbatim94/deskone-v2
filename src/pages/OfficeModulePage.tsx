import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DoorClosed,
  LoaderCircle,
  ShieldCheck,
  UnlockKeyhole,
  UserRoundCheck,
  Users,
} from "lucide-react";

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
import { ScrollArea } from "@/components/ui/scroll-area";
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

function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return getDateInputValue(date);
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

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${value}T00:00:00`));
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof EdgeClientError ? error.message : fallback;
}

function ReleasePresetButton({
  preset,
  activePreset,
  onClick,
}: {
  preset: Exclude<OfficeReleaseKind, "custom">;
  activePreset: Exclude<OfficeReleaseKind, "custom">;
  onClick: (preset: Exclude<OfficeReleaseKind, "custom">) => void;
}) {
  const config = releasePresetConfig[preset];

  return (
    <button
      type="button"
      onClick={() => onClick(preset)}
      className={cn(
        "rounded-[1.2rem] border px-3 py-3 text-sm font-medium shadow-sm transition-all",
        activePreset === preset
          ? "border-cyan-300 bg-[linear-gradient(180deg,#f1fbff,#e7f8ff)] text-cyan-800 shadow-[0_14px_30px_-24px_rgba(14,165,233,0.45)]"
          : "border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-800",
      )}
    >
      <span className="block">{config.label}</span>
      <span className="mt-1 block text-xs text-slate-500">
        {config.start} - {config.end}
      </span>
    </button>
  );
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
  const offices = officesQuery.data?.offices ?? [];
  const totalReleaseWindows = offices.reduce((sum, office) => sum + office.releaseWindows.length, 0);
  const totalActiveBookings = offices.reduce(
    (sum, office) => sum + office.bookings.filter((booking) => booking.status === "active").length,
    0,
  );
  const ownerControlledCount = offices.filter((office) => office.isOwnedByCurrentUser).length;
  const selectedOfficeActiveBookings = selectedOffice?.bookings.filter((booking) => booking.status === "active") ?? [];

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
      toast.error(getErrorMessage(error, "Unable to create the release window."));
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
      toast.error(getErrorMessage(error, "Unable to remove the release window."));
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
      toast.error(getErrorMessage(error, "Unable to create the booking."));
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
      toast.error(getErrorMessage(error, "Unable to cancel the booking."));
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
    <div className="mx-auto max-w-[1540px] space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="rounded-full bg-sky-100 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-100">
            Offices
          </Badge>
          <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
            {activeOrganization.name}
          </Badge>
          <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
            {ownerControlledCount} owned
          </Badge>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-full border border-white/80 bg-white/96 p-1 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.18)]">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full bg-violet-50 text-violet-700 hover:bg-violet-100 hover:text-violet-800"
              onClick={() => setSelectedDate((current) => shiftIsoDate(current, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="h-9 w-[190px] rounded-full border-0 bg-transparent px-2 font-medium text-slate-700 shadow-none focus-visible:ring-0"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
              onClick={() => setSelectedDate((current) => shiftIsoDate(current, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full border-slate-200 bg-white px-4 text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => setSelectedDate(getDateInputValue())}
          >
            Today
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[1.7rem] border border-white/80 bg-[linear-gradient(180deg,#ffffff,#f9fbff)] p-5 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.16)]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Portfolio</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{offices.length}</p>
          <p className="mt-1 text-sm text-slate-500">Offices visible for this environment.</p>
        </div>
        <div className="rounded-[1.7rem] border border-white/80 bg-[linear-gradient(180deg,#f1fbff,#ffffff)] p-5 shadow-[0_18px_42px_-34px_rgba(14,165,233,0.18)]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Open windows</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{totalReleaseWindows}</p>
          <p className="mt-1 text-sm text-slate-500">Release windows on {formatDateLabel(selectedDate)}.</p>
        </div>
        <div className="rounded-[1.7rem] border border-slate-900/85 bg-[linear-gradient(180deg,#111827,#0f172a)] p-5 text-white shadow-[0_20px_44px_-30px_rgba(15,23,42,0.38)]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Focus</p>
          <p className="mt-2 text-lg font-semibold text-white">{selectedOffice?.name ?? "Pick an office"}</p>
          <p className="mt-1 text-sm text-slate-300">{selectedOfficeActiveBookings.length} active bookings.</p>
        </div>
      </div>

      <section className="hidden overflow-hidden rounded-[2.8rem] border border-white/65 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.9)_46%,rgba(224,242,254,0.58))] p-7 shadow-[0_28px_90px_-50px_rgba(15,23,42,0.42)] backdrop-blur sm:p-9">
        <div className="grid gap-8 xl:grid-cols-[1.14fr,0.86fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-sky-100 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-100">
                Offices
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
                {activeOrganization.name}
              </Badge>
            </div>

            <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Open private offices with measured control, then let bookings move through a calm and precise timeline.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              Owners and admins can release part of the day or the full day, while office bookings stay constrained to
              15-minute increments and a maximum of 8 hours. The result should feel private, trustworthy and easy to
              read.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 p-1 shadow-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  onClick={() => setSelectedDate((current) => shiftIsoDate(current, -1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="h-9 w-[190px] rounded-full border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  onClick={() => setSelectedDate((current) => shiftIsoDate(current, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-full border-slate-200 bg-white/95 px-4 text-slate-700 hover:bg-slate-50"
                onClick={() => setSelectedDate(getDateInputValue())}
              >
                Today
              </Button>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.7rem] border border-white/80 bg-white/82 p-5 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Portfolio</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{offices.length}</p>
                <p className="mt-1 text-sm text-slate-500">Offices visible for this environment.</p>
              </div>
              <div className="rounded-[1.7rem] border border-white/80 bg-white/82 p-5 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Open windows</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{totalReleaseWindows}</p>
                <p className="mt-1 text-sm text-slate-500">Release windows on {formatDateLabel(selectedDate)}.</p>
              </div>
              <div className="rounded-[1.7rem] border border-white/80 bg-white/82 p-5 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Active bookings</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{totalActiveBookings}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {ownerControlledCount} offices currently under your direct ownership.
                </p>
              </div>
            </div>
          </div>

          <Card className="rounded-[2rem] border-slate-200/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(15,23,42,0.82))] text-white shadow-none">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Office focus</p>
                <Badge className="rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-100 hover:bg-white/10">
                  {formatDateLabel(selectedDate)}
                </Badge>
              </div>
              <div className="mt-5 grid gap-3 text-sm text-slate-100">
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  <span className="font-semibold text-white">{selectedOffice?.name ?? "Pick an office"}</span>
                  <span className="mt-1 block text-slate-300">
                    {selectedOffice
                      ? `${selectedOffice.ownerLabel ?? "No owner"} | ${selectedOffice.capacity} seats`
                      : "The timeline and release controls will adapt here."}
                  </span>
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  <span className="font-semibold text-white">
                    {selectedOffice?.isManageableByCurrentUser ? "Management enabled" : "Consumer view"}
                  </span>
                  <span className="mt-1 block text-slate-300">
                    {selectedOffice?.isManageableByCurrentUser
                      ? "You can open and close release windows for this office."
                      : "Only the owner or an org admin can change release state."}
                  </span>
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  <span className="font-semibold text-white">{selectedOfficeActiveBookings.length} active bookings</span>
                  <span className="mt-1 block text-slate-300">Bookings stay capped at 8 hours and 15-minute increments.</span>
                </div>
                <div className="rounded-[1.4rem] border border-sky-400/20 bg-sky-400/10 p-4 text-sky-50">
                  Primary goal: keep private office access elegant without turning it into a heavy planner.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
        <Card className="rounded-[2rem] border-slate-200/80 bg-white/92 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <DoorClosed className="h-5 w-5 text-sky-700" />
              Executive offices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {officesQuery.isLoading ? (
              <div className="rounded-[1.3rem] border border-slate-200 bg-white p-4 text-sm text-slate-500">
                <LoaderCircle className="mb-3 h-4 w-4 animate-spin text-sky-700" />
                Loading office portfolio...
              </div>
            ) : null}

            {!officesQuery.isLoading && !offices.length ? (
              <div className="rounded-[1.3rem] border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                No offices exist yet for this organization.
              </div>
            ) : null}

            <ScrollArea className="h-[760px] rounded-[1.4rem] border border-slate-200 bg-slate-50/70">
              <div className="grid gap-3 p-3">
                {offices.map((office) => (
                  <button
                    key={office.id}
                    type="button"
                    onClick={() => setSelectedOfficeId(office.id)}
                    className={cn(
                      "rounded-[1.4rem] border p-4 text-left transition-all",
                      office.id === selectedOffice?.id
                        ? "border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.92),rgba(255,255,255,0.98))] text-sky-900 shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold">{office.name}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {office.ownerLabel ?? "No owner"} | {office.floorLabel ?? "Floor unset"}
                        </p>
                      </div>
                      <Badge className="rounded-full bg-slate-950 px-3 py-1 text-white hover:bg-slate-950">
                        {office.capacity}
                      </Badge>
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {office.locationLabel ?? "Location unset"}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      {office.isOwnedByCurrentUser ? (
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-violet-700">
                          Owner
                        </span>
                      ) : null}
                      {office.isManageableByCurrentUser ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                          Manageable
                        </span>
                      ) : (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                          Book-only
                        </span>
                      )}
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                        {office.releaseWindows.length} windows
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                        {office.bookings.filter((booking) => booking.status === "active").length} active
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[2rem] border-slate-200/80 bg-white/92 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
            <CardHeader className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
                    <Clock3 className="h-5 w-5 text-sky-700" />
                    {selectedOffice?.name ?? "Office timeline"}
                  </CardTitle>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {selectedOffice
                      ? `Follow release windows, occupant flow and booking density for ${selectedOffice.name} on ${formatDateLabel(selectedDate)}.`
                      : "Pick an office to inspect its release windows, booking density and ownership state."}
                  </p>
                </div>
                {selectedOffice ? (
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                      {selectedOffice.capacity} seats
                    </Badge>
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                      {selectedOffice.isManageableByCurrentUser ? "Control enabled" : "Booking view"}
                    </Badge>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Release windows</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{selectedOffice?.releaseWindows.length ?? 0}</p>
                </div>
                <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Bookings</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{selectedOffice?.bookings.length ?? 0}</p>
                </div>
                <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Owner</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{selectedOffice?.ownerLabel ?? "Unassigned"}</p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {!selectedOffice ? (
                <div className="rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                  Pick an office to inspect its release windows and bookings.
                </div>
              ) : (
                <>
                  <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
                    <div className="rounded-[1.6rem] border border-slate-200/70 bg-slate-50 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">Release control</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {selectedOffice.isManageableByCurrentUser
                              ? "You can open availability because you are the owner or an org admin."
                              : "Only the owner or an org admin can change release state."}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600"
                        >
                          {selectedOffice.isOwnedByCurrentUser ? "Owner view" : "Reader view"}
                        </Badge>
                      </div>

                      <div className="mt-5 grid grid-cols-3 gap-3">
                        {(Object.keys(releasePresetConfig) as Exclude<OfficeReleaseKind, "custom">[]).map((preset) => (
                          <ReleasePresetButton
                            key={preset}
                            preset={preset}
                            activePreset={selectedReleasePreset}
                            onClick={setSelectedReleasePreset}
                          />
                        ))}
                      </div>

                      <div className="mt-5 grid gap-2">
                        <label className="text-sm font-medium text-slate-700" htmlFor="release-note">
                          Release note
                        </label>
                        <textarea
                          id="release-note"
                          value={releaseNote}
                          onChange={(event) => setReleaseNote(event.target.value)}
                          className="min-h-[100px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-sky-300"
                          placeholder="Optional context for the release window"
                          disabled={!selectedOffice.isManageableByCurrentUser}
                        />
                      </div>

                      <div className="mt-5">
                        <Button
                          type="button"
                          className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                          onClick={() => createReleaseMutation.mutate()}
                          disabled={!selectedOffice.isManageableByCurrentUser || createReleaseMutation.isPending}
                        >
                          <UnlockKeyhole className="mr-2 h-4 w-4" />
                          {createReleaseMutation.isPending ? "Releasing..." : "Release office"}
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-[1.6rem] border border-slate-200/70 bg-slate-50 p-5">
                      <p className="text-sm font-semibold text-slate-950">Timeline</p>
                      <div className="mt-4 space-y-3">
                        {selectedOffice.releaseWindows.length ? (
                          selectedOffice.releaseWindows.map((releaseWindow) => (
                            <div
                              key={releaseWindow.id}
                              className="rounded-[1.2rem] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="font-medium capitalize">{releaseWindow.releaseKind.replaceAll("_", " ")}</p>
                                  <p className="mt-1 text-emerald-800">
                                    {formatTimeRange(releaseWindow.startsAt, releaseWindow.endsAt)}
                                  </p>
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
                                    Close release
                                  </Button>
                                ) : null}
                              </div>
                              {releaseWindow.note ? <p className="mt-3 text-sm text-emerald-900">{releaseWindow.note}</p> : null}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[1.2rem] border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-500">
                            No release windows yet for this date.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
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
                          className="min-h-[100px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-sky-300"
                          placeholder="Optional context for the booking"
                        />
                      </div>
                      <div className="mt-5">
                        <Button
                          type="button"
                          className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800"
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
                        {selectedOffice.bookings.length ? (
                          selectedOffice.bookings.map((booking) => (
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
                          ))
                        ) : (
                          <div className="rounded-[1.2rem] border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-500">
                            No bookings yet for this date.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="flex items-center gap-2 font-medium text-slate-950">
                    <UserRoundCheck className="h-4 w-4 text-sky-700" />
                    Ownership
                  </div>
                  <p className="mt-2">The owner can release the office directly and intervene on active bookings when needed.</p>
                </div>
                <div className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="flex items-center gap-2 font-medium text-slate-950">
                    <ShieldCheck className="h-4 w-4 text-sky-700" />
                    Admin override
                  </div>
                  <p className="mt-2">Organization admins can operate the same controls for continuity and operational support.</p>
                </div>
                <div className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-4 text-sm text-slate-600">
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
