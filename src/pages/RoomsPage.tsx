import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  MapPinned,
  Search,
  Sparkles,
  SquareMousePointer,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/features/auth/context/useAuth";
import {
  cancelRoomReservation,
  createRoomReservation,
  getRoomAvailability,
  listAccessibleRooms,
} from "@/features/rooms/api";
import type { RoomBookingSegment, RoomDesk, RoomDeskStatus } from "@/features/rooms/types";
import { EdgeClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const GRID_CELL_SIZE = 24;

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${value}T00:00:00`));
}

function formatSegmentLabel(segment: RoomBookingSegment) {
  return segment === "full" ? "Full day" : segment === "am" ? "Morning" : "Afternoon";
}

function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof EdgeClientError ? error.message : fallback;
}

function statusClasses(status: RoomDeskStatus) {
  switch (status) {
    case "available":
      return "border-cyan-500 bg-white text-cyan-700 shadow-sm";
    case "yours":
      return "border-violet-500 bg-violet-50 text-violet-700 shadow-sm";
    case "reserved":
      return "border-rose-300 bg-rose-50 text-rose-500";
    case "restricted":
      return "border-slate-300 bg-slate-100 text-slate-400";
    default:
      return "border-slate-300 bg-white text-slate-500";
  }
}

function describeDeskStatus(status: RoomDeskStatus) {
  switch (status) {
    case "available":
      return "Available now";
    case "yours":
      return "Reserved by you";
    case "reserved":
      return "Held by another teammate";
    case "restricted":
      return "Restricted desk";
    default:
      return "Unavailable";
  }
}

function SegmentButton({
  segment,
  activeSegment,
  onClick,
}: {
  segment: RoomBookingSegment;
  activeSegment: RoomBookingSegment;
  onClick: (segment: RoomBookingSegment) => void;
}) {
  const label = segment === "full" ? "Full day" : segment === "am" ? "Morning" : "Afternoon";

  return (
    <button
      type="button"
      onClick={() => onClick(segment)}
      className={cn(
        "rounded-full border px-4 py-2 text-sm font-medium shadow-sm transition-all",
        activeSegment === segment
          ? "border-sky-200 bg-[linear-gradient(180deg,#f0f8ff,#e7f3ff)] text-sky-800 shadow-[0_12px_28px_-20px_rgba(14,165,233,0.45)]"
          : "border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-800",
      )}
    >
      {label}
    </button>
  );
}

function DeskFilterButton({
  label,
  value,
  activeValue,
  onClick,
}: {
  label: string;
  value: "all" | "available" | "reserved" | "yours";
  activeValue: "all" | "available" | "reserved" | "yours";
  onClick: (value: "all" | "available" | "reserved" | "yours") => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "rounded-full border px-3 py-2 text-xs font-medium shadow-sm transition-all",
        activeValue === value
          ? "border-sky-200 bg-[linear-gradient(180deg,#f0f8ff,#e7f3ff)] text-sky-800 shadow-[0_12px_28px_-20px_rgba(14,165,233,0.45)]"
          : "border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-800",
      )}
    >
      {label}
    </button>
  );
}

export default function RoomsPage() {
  const queryClient = useQueryClient();
  const { activeOrganization, activeOrganizationId, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [roomSearch, setRoomSearch] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayIsoDate);
  const [selectedSegment, setSelectedSegment] = useState<RoomBookingSegment>("full");
  const [reservationNotes, setReservationNotes] = useState("");
  const [deskSearch, setDeskSearch] = useState("");
  const [deskFilter, setDeskFilter] = useState<"all" | "available" | "reserved" | "yours">("all");
  const deferredRoomSearch = useDeferredValue(roomSearch);
  const deferredDeskSearch = useDeferredValue(deskSearch);

  const roomsQuery = useQuery({
    queryKey: ["rooms-overview", activeOrganizationId],
    enabled: Boolean(activeOrganizationId),
    queryFn: () => listAccessibleRooms(activeOrganizationId!),
    staleTime: 30_000,
  });

  const rooms = useMemo(() => roomsQuery.data?.rooms ?? [], [roomsQuery.data?.rooms]);
  const requestedRoomId = searchParams.get("room");

  useEffect(() => {
    if (!rooms.length) {
      return;
    }

    if (requestedRoomId && rooms.some((room) => room.id === requestedRoomId) && requestedRoomId !== selectedRoomId) {
      setSelectedRoomId(requestedRoomId);
      setSelectedDeskId(null);
      return;
    }

    if (!selectedRoomId || !rooms.some((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(rooms[0].id);
      setSelectedDeskId(null);
    }
  }, [requestedRoomId, rooms, selectedRoomId]);

  const filteredRooms = useMemo(() => {
    const search = deferredRoomSearch.trim().toLowerCase();
    if (!search) {
      return rooms;
    }

    return rooms.filter((room) =>
      `${room.name} ${room.slug} ${room.description ?? ""}`.toLowerCase().includes(search),
    );
  }, [deferredRoomSearch, rooms]);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  const availabilityQuery = useQuery({
    queryKey: ["room-availability", activeOrganizationId, selectedRoomId, selectedDate, selectedSegment],
    enabled: Boolean(activeOrganizationId && selectedRoomId),
    queryFn: () =>
      getRoomAvailability({
        organizationId: activeOrganizationId!,
        roomId: selectedRoomId!,
        date: selectedDate,
        segment: selectedSegment,
      }),
    staleTime: 5_000,
  });

  const selectedDesk = useMemo(
    () => availabilityQuery.data?.desks.find((desk) => desk.id === selectedDeskId) ?? null,
    [availabilityQuery.data?.desks, selectedDeskId],
  );

  useEffect(() => {
    const desks = availabilityQuery.data?.desks ?? [];
    if (!desks.length) {
      return;
    }

    if (!selectedDeskId || !desks.some((desk) => desk.id === selectedDeskId)) {
      setSelectedDeskId(desks[0].id);
    }
  }, [availabilityQuery.data?.desks, selectedDeskId]);

  const reserveMutation = useMutation({
    mutationFn: async (desk: RoomDesk) =>
      createRoomReservation({
        organizationId: activeOrganizationId!,
        roomId: availabilityQuery.data!.room.id,
        deskId: desk.id,
        date: selectedDate,
        segment: selectedSegment,
        notes: reservationNotes || null,
      }),
    onSuccess: (reservation) => {
      toast.success(`Desk ${reservation.deskLabel ?? "selected"} booked.`);
      setReservationNotes("");
      void queryClient.invalidateQueries({ queryKey: ["room-availability", activeOrganizationId, selectedRoomId] });
      void queryClient.invalidateQueries({ queryKey: ["rooms-overview", activeOrganizationId] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Unable to create the reservation."));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (reservationId: string) =>
      cancelRoomReservation({
        organizationId: activeOrganizationId!,
        reservationId,
      }),
    onSuccess: () => {
      toast.success("Reservation cancelled.");
      void queryClient.invalidateQueries({ queryKey: ["room-availability", activeOrganizationId, selectedRoomId] });
      void queryClient.invalidateQueries({ queryKey: ["rooms-overview", activeOrganizationId] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Unable to cancel the reservation."));
    },
  });

  const canvasWidth = (availabilityQuery.data?.room.gridWidth ?? 18) * GRID_CELL_SIZE;
  const canvasHeight = (availabilityQuery.data?.room.gridHeight ?? 14) * GRID_CELL_SIZE;
  const currentReservation = availabilityQuery.data?.currentUserReservation ?? null;
  const segmentLabel = formatSegmentLabel(selectedSegment);
  const totalAccessibleDesks = rooms.reduce((sum, room) => sum + room.deskCount, 0);
  const roomMixLabel = rooms.length
    ? `${rooms.filter((room) => room.accessRole === "admin").length} admin-controlled`
    : "No rooms yet";
  const statusSummary = availabilityQuery.data?.summary;
  const visibleDesks = useMemo(() => {
    const normalizedSearch = deferredDeskSearch.trim().toLowerCase();
    const selectedRoomDesks = availabilityQuery.data?.desks ?? [];

    return selectedRoomDesks
      .filter((desk) => {
        const matchesSearch = !normalizedSearch
          || `${desk.label ?? ""} ${desk.occupantLabel ?? ""} ${desk.amenities.join(" ")}`
            .toLowerCase()
            .includes(normalizedSearch);

        if (!matchesSearch) {
          return false;
        }

        if (deskFilter === "all") {
          return true;
        }

        return desk.status === deskFilter;
      })
      .sort((left, right) => {
        const leftLabel = left.label ?? left.id;
        const rightLabel = right.label ?? right.id;
        return leftLabel.localeCompare(rightLabel, "en", { numeric: true, sensitivity: "base" });
      });
  }, [availabilityQuery.data?.desks, deferredDeskSearch, deskFilter]);
  const visibleDeskCount = visibleDesks.length;
  const todayIsoDate = getTodayIsoDate();

  return (
    <div className="mx-auto max-w-[1580px] space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="playful-chip rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-50">
            Premium booking
          </Badge>
          <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
            {activeOrganization?.name ?? "No organization"}
          </Badge>
          <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
            {roomMixLabel}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <SegmentButton segment="full" activeSegment={selectedSegment} onClick={setSelectedSegment} />
          <SegmentButton segment="am" activeSegment={selectedSegment} onClick={setSelectedSegment} />
          <SegmentButton segment="pm" activeSegment={selectedSegment} onClick={setSelectedSegment} />
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
            onClick={() => setSelectedDate(todayIsoDate)}
          >
            Today
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[1.8rem] border border-white/85 bg-white/76 p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.16)] backdrop-blur">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Accessible rooms</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{rooms.length}</p>
          <p className="mt-1 text-sm text-slate-500">Visible in your current environment.</p>
        </div>
        <div className="rounded-[1.8rem] border border-white/85 bg-white/76 p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.16)] backdrop-blur">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Desk capacity</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{totalAccessibleDesks}</p>
          <p className="mt-1 text-sm text-slate-500">Total desks across your accessible neighborhoods.</p>
        </div>
        <div className="rounded-[1.8rem] border border-slate-900/85 bg-slate-950 p-5 text-white shadow-[0_20px_40px_-28px_rgba(15,23,42,0.3)]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Booking focus</p>
          <p className="mt-2 text-lg font-semibold text-white">{selectedRoom?.name ?? "Pick a room"}</p>
          <p className="mt-1 text-sm text-slate-300">
            {currentReservation
              ? `${currentReservation.roomName} / ${currentReservation.deskLabel ?? "Desk"} already secured.`
              : `Viewing ${formatDateLabel(selectedDate)} / ${segmentLabel}.`}
          </p>
        </div>
      </div>

      <section className="hidden premium-surface overflow-hidden rounded-[3rem] p-7 sm:p-9">
        <div className="grid gap-8 xl:grid-cols-[1.12fr,0.88fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="playful-chip rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-50">
                Premium booking
              </Badge>
              <Badge variant="outline" className="rounded-full border-white/80 bg-white/70 px-3 py-1 text-slate-600">
                {activeOrganization?.name ?? "No organization"}
              </Badge>
            </div>

            <h1 className="premium-display mt-5 max-w-3xl text-[2.55rem] font-semibold tracking-tight text-slate-950 sm:text-[4.25rem] sm:leading-[1.02]">
              Choose the right neighborhood, read the map instantly and claim the best spot with confidence.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              Rooms should feel like the signature moment of Deskone: curated access, living availability and a booking flow that feels more rewarding than transactional.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <SegmentButton segment="full" activeSegment={selectedSegment} onClick={setSelectedSegment} />
              <SegmentButton segment="am" activeSegment={selectedSegment} onClick={setSelectedSegment} />
              <SegmentButton segment="pm" activeSegment={selectedSegment} onClick={setSelectedSegment} />
              <div className="flex items-center gap-2 rounded-full border border-white/85 bg-white/80 p-1 shadow-[0_20px_42px_-26px_rgba(55,107,255,0.24)] backdrop-blur">
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
                onClick={() => setSelectedDate(todayIsoDate)}
              >
                Today
              </Button>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.8rem] border border-white/85 bg-white/76 p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.16)] backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Accessible rooms</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{rooms.length}</p>
                <p className="mt-1 text-sm text-slate-500">Visible in your current environment.</p>
              </div>
              <div className="rounded-[1.8rem] border border-white/85 bg-white/76 p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.16)] backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Desk capacity</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{totalAccessibleDesks}</p>
                <p className="mt-1 text-sm text-slate-500">Total desks across your accessible neighborhoods.</p>
              </div>
              <div className="rounded-[1.8rem] border border-white/85 bg-white/76 p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.16)] backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Access profile</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{roomMixLabel}</p>
                <p className="mt-1 text-sm text-slate-500">Direct admin control and shared room access combined.</p>
              </div>
            </div>
          </div>

          <Card className="premium-dark rounded-[2.2rem] border-slate-900/80 text-white shadow-none">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Booking focus</p>
                <Badge className="rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-sky-100 hover:bg-white/10">
                  {segmentLabel}
                </Badge>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-100">
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  <span className="font-semibold text-white">{user?.displayName ?? user?.fullName}</span>
                  <span className="mt-1 block text-slate-300">{user?.username}</span>
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  <span className="font-semibold text-white">{formatDateLabel(selectedDate)}</span>
                  <span className="mt-1 block text-slate-300">{segmentLabel}</span>
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  {currentReservation ? (
                    <>
                      <span className="font-semibold text-white">
                        {currentReservation.roomName} · {currentReservation.deskLabel ?? "Desk"}
                      </span>
                      <span className="mt-1 block text-slate-300">Your spot is already secured for this view.</span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-white">No active booking for this view</span>
                      <span className="mt-1 block text-slate-300">Pick an available desk to reserve it instantly.</span>
                    </>
                  )}
                </div>
                <div className="rounded-[1.4rem] border border-sky-400/20 bg-sky-400/10 p-4 text-sky-50">
                  <p className="text-xs uppercase tracking-[0.2em] text-sky-100/80">Selected room</p>
                  <p className="mt-2 text-lg font-semibold text-white">{selectedRoom?.name ?? "Pick a room"}</p>
                  <p className="mt-1 text-sm text-sky-100/80">
                    {selectedRoom
                      ? `${selectedRoom.deskCount} desks · ${selectedRoom.zoneCount} zones · ${selectedRoom.accessRole} access`
                      : "The map and inspector will adapt as soon as you choose a neighborhood."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[310px,minmax(0,1fr),360px]">
        <Card className="rounded-[2rem] border-slate-200/80 bg-white/92 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <MapPinned className="h-5 w-5 text-sky-700" />
              Curated rooms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={roomSearch}
                onChange={(event) => setRoomSearch(event.target.value)}
                placeholder="Search rooms, slugs or descriptions..."
                className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-11"
              />
            </div>

            <ScrollArea className="h-[620px] rounded-[1.4rem] border border-slate-200 bg-slate-50/70">
              <div className="grid gap-3 p-3">
                {roomsQuery.isLoading ? (
                    <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4 text-sm text-slate-500">
                      <LoaderCircle className="mb-3 h-4 w-4 animate-spin text-sky-700" />
                      Building your room directory...
                    </div>
                  ) : null}

                {!roomsQuery.isLoading && !filteredRooms.length ? (
                  <div className="rounded-[1.2rem] border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                    Nothing matched this search inside your accessible rooms.
                  </div>
                ) : null}

                {filteredRooms.map((room) => {
                  const isActive = room.id === selectedRoomId;

                  return (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => {
                        setSelectedRoomId(room.id);
                        setSelectedDeskId(null);
                      }}
                      className={cn(
                        "rounded-[1.4rem] border p-4 text-left transition-all",
                        isActive
                          ? "border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.92),rgba(255,255,255,0.98))] text-sky-900 shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold">{room.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{room.slug}</p>
                        </div>
                        <Badge
                          className={cn(
                            "rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]",
                            room.accessRole === "admin"
                              ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-100"
                              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
                          )}
                        >
                          {room.accessRole}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {room.description ?? "No description yet, but the room is ready for booking."}
                      </p>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-xl bg-slate-50 px-2 py-2 text-slate-600">
                          <span className="block font-semibold text-slate-900">{room.deskCount}</span>
                          desks
                        </div>
                        <div className="rounded-xl bg-slate-50 px-2 py-2 text-slate-600">
                          <span className="block font-semibold text-slate-900">{room.zoneCount}</span>
                          zones
                        </div>
                        <div className="rounded-xl bg-slate-50 px-2 py-2 text-slate-600">
                          <span className="block font-semibold text-slate-900">{room.groupAccessCount}</span>
                          groups
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-slate-200/80 bg-white/92 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
          <CardHeader className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
                  <SquareMousePointer className="h-5 w-5 text-sky-700" />
                  {availabilityQuery.data?.room.name ?? "Room map"}
                </CardTitle>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedRoom?.description ??
                    "Inspect the live desk map, compare desk states and book the right spot without leaving the page."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                  {selectedRoom?.deskCount ?? 0} desks
                </Badge>
                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                  {segmentLabel}
                </Badge>
                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                  {formatDateLabel(selectedDate)}
                </Badge>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Open</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{statusSummary?.availableDesks ?? 0}</p>
              </div>
              <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Reserved</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{statusSummary?.reservedDesks ?? 0}</p>
              </div>
              <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Your desks</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{statusSummary?.yourDesks ?? 0}</p>
              </div>
              <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Restricted</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{statusSummary?.restrictedDesks ?? 0}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {availabilityQuery.isLoading ? (
              <div className="flex min-h-[540px] items-center justify-center rounded-[1.6rem] border border-slate-200 bg-slate-50 text-sm text-slate-500">
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin text-sky-700" />
                Calibrating the live room map...
              </div>
            ) : null}

            {!availabilityQuery.isLoading && !availabilityQuery.data ? (
              <div className="flex min-h-[540px] items-center justify-center rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                Pick a room to inspect its desks.
              </div>
            ) : null}

            {availabilityQuery.data ? (
              <div className="space-y-5">
                <div className="overflow-x-auto rounded-[1.6rem] border border-slate-200 bg-slate-50/70 p-4">
                  <div
                    className="relative rounded-[1.8rem] border border-slate-200 bg-[linear-gradient(0deg,transparent_23px,rgba(226,232,240,0.8)_24px),linear-gradient(90deg,transparent_23px,rgba(226,232,240,0.8)_24px)] [background-size:24px_24px] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
                    style={{
                      width: canvasWidth,
                      height: canvasHeight,
                    }}
                  >
                    {availabilityQuery.data.zones.map((zone) => (
                      <div
                        key={zone.id}
                        className="absolute rounded-[1.5rem] border-2 border-dashed bg-white/60 px-4 py-3 shadow-sm"
                        style={{
                          left: zone.x * GRID_CELL_SIZE,
                          top: zone.y * GRID_CELL_SIZE,
                          width: zone.width * GRID_CELL_SIZE,
                          height: zone.height * GRID_CELL_SIZE,
                          borderColor: zone.color ?? "#94A3B8",
                        }}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: zone.color ?? "#334155" }}>
                          {zone.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{zone.zoneType}</p>
                      </div>
                    ))}

                    {availabilityQuery.data.desks.map((desk) => (
                      <button
                        key={desk.id}
                        type="button"
                        onClick={() => setSelectedDeskId(desk.id)}
                        className={cn(
                          "absolute flex items-center justify-center rounded-xl border-2 text-xs font-semibold transition-all duration-150 hover:-translate-y-0.5",
                          statusClasses(desk.status),
                          selectedDeskId === desk.id && "ring-4 ring-sky-200",
                        )}
                        style={{
                          left: desk.x * GRID_CELL_SIZE,
                          top: desk.y * GRID_CELL_SIZE,
                          width: desk.width * GRID_CELL_SIZE,
                          height: desk.height * GRID_CELL_SIZE,
                          transform: `rotate(${desk.rotationDegrees}deg)`,
                        }}
                      >
                        {desk.label ?? "Desk"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  {[
                    { key: "available", label: "Available", className: "bg-white text-cyan-700 border-cyan-500" },
                    { key: "reserved", label: "Reserved", className: "bg-rose-50 text-rose-600 border-rose-300" },
                    { key: "yours", label: "Your spot", className: "bg-violet-50 text-violet-700 border-violet-500" },
                    { key: "restricted", label: "Restricted", className: "bg-slate-100 text-slate-500 border-slate-300" },
                  ].map((item) => (
                    <span key={item.key} className={cn("rounded-full border px-3 py-2", item.className)}>
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-slate-200/80 bg-white/92 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <Sparkles className="h-5 w-5 text-sky-700" />
              Desk console
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {selectedDesk ? (
              <>
                <div className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-950">{selectedDesk.label ?? "Desk"}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Status: <span className="font-medium capitalize text-slate-700">{describeDeskStatus(selectedDesk.status)}</span>
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        "rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]",
                        statusClasses(selectedDesk.status),
                      )}
                    >
                      {selectedDesk.status}
                    </Badge>
                  </div>
                  {selectedDesk.occupantLabel ? (
                    <p className="mt-2 text-sm text-slate-600">Occupied by {selectedDesk.occupantLabel}</p>
                  ) : null}
                </div>

                <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Amenities</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedDesk.amenities.length ? (
                      selectedDesk.amenities.map((amenity) => (
                        <Badge key={amenity} variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1">
                          {amenity}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">No amenities tagged yet.</span>
                    )}
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Booking notes</p>
                  <Textarea
                    value={reservationNotes}
                    onChange={(event) => setReservationNotes(event.target.value)}
                    placeholder="Optional context for this booking"
                    className="mt-3 min-h-[110px] rounded-2xl border-slate-200"
                  />
                </div>

                {selectedDesk.status === "available" ? (
                  <Button
                    type="button"
                    className="h-11 w-full rounded-xl bg-slate-950 text-white shadow-[0_16px_40px_-28px_rgba(15,23,42,0.85)] hover:bg-slate-800"
                    disabled={reserveMutation.isPending || Boolean(currentReservation && currentReservation.deskId !== selectedDesk.id)}
                    onClick={() => void reserveMutation.mutate(selectedDesk)}
                  >
                    {reserveMutation.isPending ? "Booking..." : "Book this desk"}
                  </Button>
                ) : null}

                {selectedDesk.status === "yours" && selectedDesk.reservationId ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full rounded-xl border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    disabled={cancelMutation.isPending}
                    onClick={() => void cancelMutation.mutate(selectedDesk.reservationId!)}
                  >
                    {cancelMutation.isPending ? "Cancelling..." : "Cancel reservation"}
                  </Button>
                ) : null}

                {currentReservation && currentReservation.deskId !== selectedDesk.id ? (
                  <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    You already have a booking for this room and segment. Cancel it first if you want to switch desk.
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-500">
                Select a desk from the live map to review its details, amenities and booking options.
              </div>
            )}

            {currentReservation ? (
              <div className="rounded-[1.4rem] border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
                <p className="font-medium">
                  Current booking: {currentReservation.roomName} / {currentReservation.deskLabel ?? "Desk"}
                </p>
                <p className="mt-2">
                  Segment: {currentReservation.segment} on {formatDateLabel(currentReservation.dateStart)}
                </p>
              </div>
            ) : null}

            <div className="rounded-[1.4rem] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc,#f2f6fb)] p-4 text-sm text-slate-600 shadow-[0_18px_42px_-36px_rgba(15,23,42,0.16)]">
              <p className="font-medium text-slate-950">Access</p>
              <p className="mt-2">
                Availability reflects organization membership, direct room access and sharing groups automatically.
              </p>
            </div>

            <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Desk directory</p>
                  <p className="mt-1 text-sm font-medium text-slate-950">{visibleDeskCount} desks in view</p>
                </div>
                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                  {selectedRoom?.name ?? "No room"}
                </Badge>
              </div>

              <div className="mt-4 space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={deskSearch}
                    onChange={(event) => setDeskSearch(event.target.value)}
                    placeholder="Search desk label, occupant or amenity..."
                    className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-10"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <DeskFilterButton label="All" value="all" activeValue={deskFilter} onClick={setDeskFilter} />
                  <DeskFilterButton label="Available" value="available" activeValue={deskFilter} onClick={setDeskFilter} />
                  <DeskFilterButton label="Reserved" value="reserved" activeValue={deskFilter} onClick={setDeskFilter} />
                  <DeskFilterButton label="Mine" value="yours" activeValue={deskFilter} onClick={setDeskFilter} />
                </div>
              </div>

              <ScrollArea className="mt-4 h-[320px] rounded-[1.1rem] border border-slate-200 bg-slate-50/70">
                <div className="grid gap-2 p-3">
                  {!visibleDesks.length ? (
                    <div className="rounded-[1rem] border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                      No desks match the current filters.
                    </div>
                  ) : null}

                  {visibleDesks.map((desk) => {
                    const isSelected = desk.id === selectedDeskId;
                    const canBookDesk = desk.status === "available";
                    const canCancelDesk = desk.status === "yours" && Boolean(desk.reservationId);

                    return (
                      <button
                        key={desk.id}
                        type="button"
                        onClick={() => setSelectedDeskId(desk.id)}
                        className={cn(
                          "rounded-[1.1rem] border p-3 text-left transition-all",
                          isSelected
                            ? "border-sky-200 bg-white shadow-sm"
                            : "border-slate-200 bg-white hover:bg-slate-50",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{desk.label ?? "Desk"}</p>
                            <p className="mt-1 text-xs text-slate-500">{describeDeskStatus(desk.status)}</p>
                          </div>
                          <Badge
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]",
                              statusClasses(desk.status),
                            )}
                          >
                            {desk.status}
                          </Badge>
                        </div>

                        {desk.occupantLabel ? (
                          <p className="mt-2 truncate text-xs text-slate-500">Occupant: {desk.occupantLabel}</p>
                        ) : null}

                        {desk.amenities.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {desk.amenities.slice(0, 2).map((amenity) => (
                              <Badge
                                key={`${desk.id}-${amenity}`}
                                variant="outline"
                                className="rounded-full border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600"
                              >
                                {amenity}
                              </Badge>
                            ))}
                            {desk.amenities.length > 2 ? (
                              <Badge
                                variant="outline"
                                className="rounded-full border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600"
                              >
                                +{desk.amenities.length - 2}
                              </Badge>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="mt-3 flex gap-2">
                          {canBookDesk ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 rounded-full bg-slate-950 px-3 text-xs text-white hover:bg-slate-800"
                              disabled={reserveMutation.isPending || Boolean(currentReservation && currentReservation.deskId !== desk.id)}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedDeskId(desk.id);
                                void reserveMutation.mutate(desk);
                              }}
                            >
                              Book
                            </Button>
                          ) : null}

                          {canCancelDesk ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-full border-rose-200 bg-rose-50 px-3 text-xs text-rose-700 hover:bg-rose-100"
                              disabled={cancelMutation.isPending}
                              onClick={(event) => {
                                event.stopPropagation();
                                void cancelMutation.mutate(desk.reservationId!);
                              }}
                            >
                              Cancel
                            </Button>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
