import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Blocks,
  Building2,
  Grid2x2,
  LoaderCircle,
  Move,
  Plus,
  Save,
  ScanLine,
  ShieldCheck,
  Tag,
  Users,
} from "lucide-react";

import {
  createStudioRoom,
  createStudioSharingGroup,
  getStudioRoomLayout,
  getStudioSharingGroups,
  listStudioRooms,
  updateStudioRoomLayout,
  updateStudioSharingGroup,
} from "@/features/admin-studio/api";
import type {
  CreateStudioSharingGroupInput,
  SaveStudioRoomLayoutInput,
  StudioAmenity,
  StudioDeskStatus,
  StudioGroupOption,
  StudioOrganizationMember,
  StudioRoomDesk,
  StudioRoomLayout,
  StudioRoomSummary,
  StudioRoomZone,
  StudioSharingGroup,
} from "@/features/admin-studio/types";
import { useAuth } from "@/features/auth/context/useAuth";
import type { OrganizationMembershipRole } from "@/features/auth/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { EdgeClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type StudioTab = "rooms" | "groups" | "designer";
type CanvasSelection =
  | { kind: "desk"; id: string }
  | { kind: "zone"; id: string }
  | null;

type ScopedSelection = Record<
  string,
  {
    enabled: boolean;
    role: OrganizationMembershipRole;
  }
>;

type RoomFormState = {
  name: string;
  slug: string;
  description: string;
  gridWidth: string;
  gridHeight: string;
};

type GroupFormState = {
  name: string;
  slug: string;
  description: string;
  memberUserIds: string[];
  roomAccessSelection: ScopedSelection;
};

type LayoutEditorState = {
  room: StudioRoomLayout["room"];
  desks: StudioRoomDesk[];
  zones: StudioRoomZone[];
  walls: StudioRoomLayout["walls"];
  amenityCatalog: StudioAmenity[];
  roomUserSelection: ScopedSelection;
  roomGroupSelection: ScopedSelection;
};

const defaultRoomForm: RoomFormState = {
  name: "",
  slug: "",
  description: "",
  gridWidth: "24",
  gridHeight: "24",
};

const defaultGroupForm: GroupFormState = {
  name: "",
  slug: "",
  description: "",
  memberUserIds: [],
  roomAccessSelection: {},
};

const GRID_CELL_SIZE = 24;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof EdgeClientError ? error.message : fallback;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function createScopedSelection(ids: string[]) {
  return Object.fromEntries(
    ids.map((id) => [
      id,
      {
        enabled: false,
        role: "member" as const,
      },
    ]),
  );
}

function mergeScopedSelection(ids: string[], currentSelection: ScopedSelection) {
  const nextSelection = createScopedSelection(ids);

  for (const id of ids) {
    if (currentSelection[id]) {
      nextSelection[id] = currentSelection[id];
    }
  }

  return nextSelection;
}

function buildScopedSelection(ids: string[], access: Array<{ id: string; role: OrganizationMembershipRole }>) {
  const selection = createScopedSelection(ids);

  for (const entry of access) {
    if (!selection[entry.id]) {
      continue;
    }

    selection[entry.id] = {
      enabled: true,
      role: entry.role,
    };
  }

  return selection;
}

function extractScopedSelection(selection: ScopedSelection) {
  return Object.entries(selection)
    .filter(([, item]) => item.enabled)
    .map(([id, item]) => ({
      id,
      role: item.role,
    }));
}

function buildGroupFormState(group: StudioSharingGroup | null, rooms: StudioRoomSummary[]): GroupFormState {
  if (!group) {
    return {
      ...defaultGroupForm,
      roomAccessSelection: createScopedSelection(rooms.map((room) => room.id)),
    };
  }

  return {
    name: group.name,
    slug: group.slug,
    description: group.description ?? "",
    memberUserIds: group.members.map((member) => member.userId),
    roomAccessSelection: buildScopedSelection(
      rooms.map((room) => room.id),
      group.roomAccess.map((access) => ({
        id: access.roomId,
        role: access.role,
      })),
    ),
  };
}

function buildLayoutEditorState(layout: StudioRoomLayout): LayoutEditorState {
  return {
    room: layout.room,
    desks: layout.desks,
    zones: layout.zones,
    walls: layout.walls,
    amenityCatalog: layout.amenityCatalog,
    roomUserSelection: buildScopedSelection(
      layout.organizationMembers.map((member) => member.userId),
      layout.roomUserAccess.map((entry) => ({
        id: entry.userId,
        role: entry.role,
      })),
    ),
    roomGroupSelection: buildScopedSelection(
      layout.organizationGroups.map((group) => group.id),
      layout.roomGroupAccess.map((entry) => ({
        id: entry.groupId,
        role: entry.role,
      })),
    ),
  };
}

function nextDeskLabel(desks: StudioRoomDesk[]) {
  return `A${String(desks.length + 101)}`;
}

function nextZoneName(zones: StudioRoomZone[]) {
  return `Neighborhood ${zones.length + 1}`;
}

function normalizeNumericInput(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureAmenityInCatalog(catalog: StudioAmenity[], amenityName: string) {
  const trimmedName = amenityName.trim();

  if (!trimmedName) {
    return catalog;
  }

  if (catalog.some((amenity) => amenity.name.toLowerCase() === trimmedName.toLowerCase())) {
    return catalog;
  }

  return [
    ...catalog,
    {
      id: `draft:${trimmedName.toLowerCase().replace(/\s+/g, "-")}`,
      name: trimmedName,
      slug: trimmedName.toLowerCase().replace(/\s+/g, "-"),
      description: null,
      icon: null,
    },
  ];
}

function StudioMetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card className="rounded-[1.6rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{title}</p>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </CardContent>
    </Card>
  );
}

function MemberSelectionList({
  members,
  selectedUserIds,
  onToggle,
  disabled,
  emptyMessage,
}: {
  members: StudioOrganizationMember[];
  selectedUserIds: string[];
  onToggle: (userId: string, enabled: boolean) => void;
  disabled?: boolean;
  emptyMessage: string;
}) {
  if (!members.length) {
    return <div className="rounded-[1.2rem] border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">{emptyMessage}</div>;
  }

  return (
    <ScrollArea className="h-[260px] rounded-[1.25rem] border border-slate-200 bg-white">
      <div className="grid gap-3 p-3">
        {members.map((member) => {
          const isSelected = selectedUserIds.includes(member.userId);

          return (
            <label
              key={member.userId}
              className="flex items-start gap-3 rounded-[1rem] border border-slate-200/80 bg-slate-50 p-3"
            >
              <Checkbox
                checked={isSelected}
                disabled={disabled}
                onCheckedChange={(checked) => onToggle(member.userId, checked === true)}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-950">{member.displayName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {member.username} | {member.membershipRole}
                  {member.email ? ` | ${member.email}` : ""}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function ScopedAccessEditor({
  items,
  selection,
  onSelectionChange,
  disabled,
  emptyMessage,
}: {
  items: Array<{
    id: string;
    label: string;
    subtitle?: string | null;
  }>;
  selection: ScopedSelection;
  onSelectionChange: (nextSelection: ScopedSelection) => void;
  disabled?: boolean;
  emptyMessage: string;
}) {
  if (!items.length) {
    return <div className="rounded-[1.2rem] border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">{emptyMessage}</div>;
  }

  return (
    <ScrollArea className="h-[260px] rounded-[1.25rem] border border-slate-200 bg-white">
      <div className="grid gap-3 p-3">
        {items.map((item) => {
          const current = selection[item.id] ?? { enabled: false, role: "member" as const };

          return (
            <div
              key={item.id}
              className="rounded-[1rem] border border-slate-200/80 bg-slate-50 p-3"
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={current.enabled}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onSelectionChange({
                      ...selection,
                      [item.id]: {
                        ...current,
                        enabled: checked === true,
                      },
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-950">{item.label}</p>
                  {item.subtitle ? <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p> : null}
                </div>
              </div>

              <div className="mt-3">
                <select
                  value={current.role}
                  disabled={disabled || !current.enabled}
                  onChange={(event) =>
                    onSelectionChange({
                      ...selection,
                      [item.id]: {
                        enabled: current.enabled,
                        role: event.target.value as OrganizationMembershipRole,
                      },
                    })
                  }
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300 disabled:bg-slate-100"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

export default function AdminStudioPage() {
  const queryClient = useQueryClient();
  const { activeOrganization, activeOrganizationId, user } = useAuth();

  const [activeTab, setActiveTab] = useState<StudioTab>("rooms");
  const [roomForm, setRoomForm] = useState<RoomFormState>(defaultRoomForm);
  const [createGroupForm, setCreateGroupForm] = useState<GroupFormState>(defaultGroupForm);
  const [editGroupForm, setEditGroupForm] = useState<GroupFormState>(defaultGroupForm);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [layoutEditorState, setLayoutEditorState] = useState<LayoutEditorState | null>(null);
  const [canvasSelection, setCanvasSelection] = useState<CanvasSelection>(null);
  const [draftAmenityName, setDraftAmenityName] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");

  const deferredRoomSearch = useDeferredValue(roomSearch);
  const deferredGroupSearch = useDeferredValue(groupSearch);

  const hasOrganizationScope = Boolean(activeOrganizationId);
  const hasAdminScope = Boolean(
    activeOrganization && (user?.role === "super_admin" || activeOrganization.membershipRole === "admin"),
  );

  const roomsQuery = useQuery({
    queryKey: ["studio-rooms", activeOrganizationId],
    queryFn: () => listStudioRooms(activeOrganizationId!),
    enabled: hasOrganizationScope && hasAdminScope,
    staleTime: 30_000,
  });

  const groupsQuery = useQuery({
    queryKey: ["studio-groups", activeOrganizationId],
    queryFn: () => getStudioSharingGroups(activeOrganizationId!),
    enabled: hasOrganizationScope && hasAdminScope,
    staleTime: 30_000,
  });

  const layoutQuery = useQuery({
    queryKey: ["studio-layout", activeOrganizationId, selectedRoomId],
    queryFn: () => getStudioRoomLayout(activeOrganizationId!, selectedRoomId!),
    enabled: hasOrganizationScope && hasAdminScope && Boolean(selectedRoomId),
    staleTime: 10_000,
  });

  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);
  const groupsPayload = groupsQuery.data;
  const sharingGroups = useMemo(() => groupsPayload?.groups ?? [], [groupsPayload]);
  const availableUsers = useMemo(() => groupsPayload?.availableUsers ?? [], [groupsPayload]);
  const availableRooms = useMemo(() => groupsPayload?.availableRooms ?? [], [groupsPayload]);

  const filteredRooms = useMemo(() => {
    const search = deferredRoomSearch.trim().toLowerCase();

    if (!search) {
      return rooms;
    }

    return rooms.filter((room) =>
      `${room.name} ${room.slug} ${room.description ?? ""}`.toLowerCase().includes(search),
    );
  }, [deferredRoomSearch, rooms]);

  const filteredGroups = useMemo(() => {
    const search = deferredGroupSearch.trim().toLowerCase();

    if (!search) {
      return sharingGroups;
    }

    return sharingGroups.filter((group) =>
      `${group.name} ${group.slug} ${group.description ?? ""}`.toLowerCase().includes(search),
    );
  }, [deferredGroupSearch, sharingGroups]);

  const selectedGroup = useMemo(
    () => sharingGroups.find((group) => group.id === selectedGroupId) ?? null,
    [selectedGroupId, sharingGroups],
  );

  useEffect(() => {
    if (!rooms.length) {
      setSelectedRoomId(null);
      return;
    }

    if (!selectedRoomId || !rooms.some((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(rooms[0]?.id ?? null);
    }
  }, [rooms, selectedRoomId]);

  useEffect(() => {
    if (!sharingGroups.length) {
      setSelectedGroupId(null);
      return;
    }

    if (!selectedGroupId || !sharingGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(sharingGroups[0]?.id ?? null);
    }
  }, [selectedGroupId, sharingGroups]);

  useEffect(() => {
    const roomIds = availableRooms.map((room) => room.id);
    const allowedUserIds = new Set(availableUsers.map((member) => member.userId));

    setCreateGroupForm((currentForm) => ({
      ...currentForm,
      memberUserIds: currentForm.memberUserIds.filter((userId) => allowedUserIds.has(userId)),
      roomAccessSelection: mergeScopedSelection(roomIds, currentForm.roomAccessSelection),
    }));
  }, [availableRooms, availableUsers]);

  useEffect(() => {
    setEditGroupForm(buildGroupFormState(selectedGroup, rooms));
  }, [rooms, selectedGroup]);

  useEffect(() => {
    if (!layoutQuery.data) {
      return;
    }

    setLayoutEditorState(buildLayoutEditorState(layoutQuery.data));
    setCanvasSelection(null);
    setDraftAmenityName("");
  }, [layoutQuery.data]);

  const selectedDesk = useMemo(
    () =>
      canvasSelection?.kind === "desk"
        ? layoutEditorState?.desks.find((desk) => desk.id === canvasSelection.id) ?? null
        : null,
    [canvasSelection, layoutEditorState?.desks],
  );

  const selectedZone = useMemo(
    () =>
      canvasSelection?.kind === "zone"
        ? layoutEditorState?.zones.find((zone) => zone.id === canvasSelection.id) ?? null
        : null,
    [canvasSelection, layoutEditorState?.zones],
  );

  useEffect(() => {
    if (!canvasSelection || !layoutEditorState) {
      return;
    }

    if (canvasSelection.kind === "desk" && !layoutEditorState.desks.some((desk) => desk.id === canvasSelection.id)) {
      setCanvasSelection(null);
    }

    if (canvasSelection.kind === "zone" && !layoutEditorState.zones.some((zone) => zone.id === canvasSelection.id)) {
      setCanvasSelection(null);
    }
  }, [canvasSelection, layoutEditorState]);

  const roomCreateMutation = useMutation({
    mutationFn: async () =>
      createStudioRoom({
        organizationId: activeOrganizationId!,
        name: roomForm.name,
        slug: roomForm.slug || undefined,
        description: roomForm.description || null,
        gridWidth: normalizeNumericInput(roomForm.gridWidth, 24),
        gridHeight: normalizeNumericInput(roomForm.gridHeight, 24),
      }),
    onSuccess: (room) => {
      toast.success(`Room ${room.name} created.`);
      setRoomForm(defaultRoomForm);
      setSelectedRoomId(room.id);
      setActiveTab("designer");
      void queryClient.invalidateQueries({ queryKey: ["studio-rooms", activeOrganizationId] });
      void queryClient.invalidateQueries({ queryKey: ["studio-groups", activeOrganizationId] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Unable to create the room."));
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const payload: CreateStudioSharingGroupInput = {
        organizationId: activeOrganizationId!,
        name: createGroupForm.name,
        slug: createGroupForm.slug || undefined,
        description: createGroupForm.description || null,
        memberUserIds: createGroupForm.memberUserIds,
        roomAccess: extractScopedSelection(createGroupForm.roomAccessSelection).map((entry) => ({
          roomId: entry.id,
          role: entry.role,
        })),
      };

      return createStudioSharingGroup(payload);
    },
    onSuccess: (group) => {
      toast.success(`Sharing group ${group.name} created.`);
      setCreateGroupForm({
        ...defaultGroupForm,
        roomAccessSelection: createScopedSelection(availableRooms.map((room) => room.id)),
      });
      setSelectedGroupId(group.id);
      void queryClient.invalidateQueries({ queryKey: ["studio-groups", activeOrganizationId] });
      void queryClient.invalidateQueries({ queryKey: ["studio-rooms", activeOrganizationId] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Unable to create the sharing group."));
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroupId) {
        throw new Error("Select a group first.");
      }

      return updateStudioSharingGroup({
        groupId: selectedGroupId,
        organizationId: activeOrganizationId!,
        name: editGroupForm.name,
        slug: editGroupForm.slug || undefined,
        description: editGroupForm.description || null,
        memberUserIds: editGroupForm.memberUserIds,
        roomAccess: extractScopedSelection(editGroupForm.roomAccessSelection).map((entry) => ({
          roomId: entry.id,
          role: entry.role,
        })),
      });
    },
    onSuccess: (group) => {
      toast.success(`Sharing group ${group.name} updated.`);
      void queryClient.invalidateQueries({ queryKey: ["studio-groups", activeOrganizationId] });
      void queryClient.invalidateQueries({ queryKey: ["studio-rooms", activeOrganizationId] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Unable to update the sharing group."));
    },
  });

  const saveLayoutMutation = useMutation({
    mutationFn: async () => {
      if (!layoutEditorState || !selectedRoomId) {
        throw new Error("Select a room first.");
      }

      const payload: SaveStudioRoomLayoutInput = {
        organizationId: activeOrganizationId!,
        roomId: selectedRoomId,
        room: {
          name: layoutEditorState.room.name,
          slug: layoutEditorState.room.slug,
          description: layoutEditorState.room.description,
          gridWidth: layoutEditorState.room.gridWidth,
          gridHeight: layoutEditorState.room.gridHeight,
          isActive: layoutEditorState.room.isActive,
        },
        desks: layoutEditorState.desks,
        zones: layoutEditorState.zones,
        roomUserAccess: extractScopedSelection(layoutEditorState.roomUserSelection).map((entry) => ({
          userId: entry.id,
          role: entry.role,
        })),
        roomGroupAccess: extractScopedSelection(layoutEditorState.roomGroupSelection).map((entry) => ({
          groupId: entry.id,
          role: entry.role,
        })),
      };

      return updateStudioRoomLayout(payload);
    },
    onSuccess: (response) => {
      toast.success(`Room ${response.room.name} saved.`);
      setLayoutEditorState(buildLayoutEditorState(response));
      void queryClient.invalidateQueries({ queryKey: ["studio-layout", activeOrganizationId, selectedRoomId] });
      void queryClient.invalidateQueries({ queryKey: ["studio-rooms", activeOrganizationId] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Unable to save the room layout."));
    },
  });

  function invalidateActiveOrganizationQueries() {
    void queryClient.invalidateQueries({ queryKey: ["studio-rooms", activeOrganizationId] });
    void queryClient.invalidateQueries({ queryKey: ["studio-groups", activeOrganizationId] });
    void queryClient.invalidateQueries({ queryKey: ["studio-layout", activeOrganizationId, selectedRoomId] });
  }

  function updateDesk(deskId: string, updater: (desk: StudioRoomDesk) => StudioRoomDesk) {
    setLayoutEditorState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      return {
        ...currentState,
        desks: currentState.desks.map((desk) => (desk.id === deskId ? updater(desk) : desk)),
      };
    });
  }

  function updateZone(zoneId: string, updater: (zone: StudioRoomZone) => StudioRoomZone) {
    setLayoutEditorState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      return {
        ...currentState,
        zones: currentState.zones.map((zone) => (zone.id === zoneId ? updater(zone) : zone)),
      };
    });
  }

  function addDesk() {
    setLayoutEditorState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      const nextDesk: StudioRoomDesk = {
        id: crypto.randomUUID(),
        label: nextDeskLabel(currentState.desks),
        x: 2,
        y: 9,
        width: 3,
        height: 2,
        rotationDegrees: 0,
        zIndex: currentState.desks.length + 1,
        defaultStatus: "available",
        amenities: [],
      };

      setCanvasSelection({ kind: "desk", id: nextDesk.id });
      return {
        ...currentState,
        desks: [...currentState.desks, nextDesk],
      };
    });
  }

  function deleteDesk(deskId: string) {
    setLayoutEditorState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      return {
        ...currentState,
        desks: currentState.desks.filter((desk) => desk.id !== deskId),
      };
    });
    setCanvasSelection(null);
  }

  function addZone() {
    setLayoutEditorState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      const nextZone: StudioRoomZone = {
        id: crypto.randomUUID(),
        name: nextZoneName(currentState.zones),
        zoneType: "neighborhood",
        x: 14,
        y: 10,
        width: 8,
        height: 4,
        color: "#BBA5FF",
      };

      setCanvasSelection({ kind: "zone", id: nextZone.id });
      return {
        ...currentState,
        zones: [...currentState.zones, nextZone],
      };
    });
  }

  function deleteZone(zoneId: string) {
    setLayoutEditorState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      return {
        ...currentState,
        zones: currentState.zones.filter((zone) => zone.id !== zoneId),
      };
    });
    setCanvasSelection(null);
  }

  function toggleGroupFormMember(formKey: "create" | "edit", userId: string, enabled: boolean) {
    const setter = formKey === "create" ? setCreateGroupForm : setEditGroupForm;

    setter((currentForm) => ({
      ...currentForm,
      memberUserIds: enabled
        ? Array.from(new Set([...currentForm.memberUserIds, userId]))
        : currentForm.memberUserIds.filter((currentUserId) => currentUserId !== userId),
    }));
  }

  function addDeskAmenity() {
    if (!selectedDesk || !draftAmenityName.trim()) {
      return;
    }

    const amenityName = draftAmenityName.trim();

    updateDesk(selectedDesk.id, (desk) => ({
      ...desk,
      amenities: desk.amenities.some((entry) => entry.toLowerCase() === amenityName.toLowerCase())
        ? desk.amenities
        : [...desk.amenities, amenityName],
    }));

    setLayoutEditorState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      return {
        ...currentState,
        amenityCatalog: ensureAmenityInCatalog(currentState.amenityCatalog, amenityName),
      };
    });

    setDraftAmenityName("");
  }

  const totalDeskCount = useMemo(
    () => rooms.reduce((runningTotal, room) => runningTotal + room.deskCount, 0),
    [rooms],
  );

  const canvasDimensions = useMemo(() => {
    const gridWidth = layoutEditorState?.room.gridWidth ?? 24;
    const gridHeight = layoutEditorState?.room.gridHeight ?? 24;

    return {
      width: Math.max(gridWidth * GRID_CELL_SIZE + 120, 920),
      height: Math.max(gridHeight * GRID_CELL_SIZE + 120, 620),
    };
  }, [layoutEditorState?.room.gridHeight, layoutEditorState?.room.gridWidth]);

  if (!hasOrganizationScope) {
    return (
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2.5rem] border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(248,250,252,0.9)_50%,rgba(224,242,254,0.64))] p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-sky-700">Admin studio</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Pick an organization to start designing rooms and managing shared access.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
            The designer is organization-scoped by design, so we never cross environments by accident.
          </p>
        </section>
      </div>
    );
  }

  if (!hasAdminScope) {
    return (
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2.5rem] border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(248,250,252,0.9)_50%,rgba(254,243,199,0.42))] p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-700">Admin studio</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            This organization is in read-only mode for your current scope.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
            Switch to an organization where you are admin, or keep the current one only for browsing.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2.5rem] border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(248,250,252,0.9)_48%,rgba(224,242,254,0.68))] p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-sky-700">Organization admin studio</p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Design rooms, govern sharing groups and keep access scoped to {activeOrganization?.name ?? "your environment"}.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              This is the real admin workspace for the `v2`: room creation is visual, access is group-first, and every
              mutation passes through typed APIs and audited Edge Functions.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-slate-700">
              <div className="rounded-[1.4rem] border border-white/70 bg-white/85 p-4 shadow-sm">
              Organization admins only operate inside their active environment.
            </div>
              <div className="rounded-[1.4rem] border border-white/70 bg-white/85 p-4 shadow-sm">
              Sharing groups accelerate large rollouts without duplicating room access one user at a time.
            </div>
              <div className="rounded-[1.4rem] border border-white/70 bg-white/85 p-4 shadow-sm">
              The designer writes typed desks, zones and scoped memberships instead of opaque blobs.
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <StudioMetricCard
          title="Rooms"
          value={String(rooms.length)}
          description="Each room remains a first-class record with grid metadata, access scope and designer state."
        />
        <StudioMetricCard
          title="Desk footprint"
          value={String(totalDeskCount)}
          description="The room list stays lightweight while the designer loads the deeper layout only when we need it."
        />
        <StudioMetricCard
          title="Sharing groups"
          value={String(sharingGroups.length)}
          description="Groups are organization-scoped and ready to speed up desk sharing and future directory sync."
        />
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as StudioTab)} className="space-y-6">
        <TabsList className="h-auto rounded-2xl bg-white/85 p-2 shadow-sm">
          <TabsTrigger value="rooms" className="rounded-xl px-4 py-2.5">
            Rooms
          </TabsTrigger>
          <TabsTrigger value="groups" className="rounded-xl px-4 py-2.5">
            Sharing groups
          </TabsTrigger>
          <TabsTrigger value="designer" className="rounded-xl px-4 py-2.5">
            Designer
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rooms" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
            <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
                  <Building2 className="h-5 w-5 text-sky-700" />
                  Create room
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="room-name">
                    Name
                  </label>
                  <Input
                    id="room-name"
                    value={roomForm.name}
                    onChange={(event) => setRoomForm((currentForm) => ({ ...currentForm, name: event.target.value }))}
                    placeholder="Sales neighborhood"
                    className="rounded-xl border-slate-200"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="room-slug">
                    Slug
                  </label>
                  <Input
                    id="room-slug"
                    value={roomForm.slug}
                    onChange={(event) => setRoomForm((currentForm) => ({ ...currentForm, slug: event.target.value }))}
                    placeholder="sales-neighborhood"
                    className="rounded-xl border-slate-200"
                  />
                  <p className="text-xs text-slate-500">Leave empty and the backend derives a safe slug.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="room-grid-width">
                      Grid width
                    </label>
                    <Input
                      id="room-grid-width"
                      type="number"
                      value={roomForm.gridWidth}
                      onChange={(event) =>
                        setRoomForm((currentForm) => ({
                          ...currentForm,
                          gridWidth: event.target.value,
                        }))
                      }
                      className="rounded-xl border-slate-200"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="room-grid-height">
                      Grid height
                    </label>
                    <Input
                      id="room-grid-height"
                      type="number"
                      value={roomForm.gridHeight}
                      onChange={(event) =>
                        setRoomForm((currentForm) => ({
                          ...currentForm,
                          gridHeight: event.target.value,
                        }))
                      }
                      className="rounded-xl border-slate-200"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="room-description">
                    Description
                  </label>
                  <Textarea
                    id="room-description"
                    value={roomForm.description}
                    onChange={(event) =>
                      setRoomForm((currentForm) => ({
                        ...currentForm,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Optional context for planners and admins"
                    className="min-h-[140px] rounded-2xl border-slate-200"
                  />
                </div>

                <Button
                  type="button"
                  className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  onClick={() => roomCreateMutation.mutate()}
                  disabled={roomCreateMutation.isPending}
                >
                  {roomCreateMutation.isPending ? "Creating..." : "Create room"}
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
                  <Grid2x2 className="h-5 w-5 text-sky-700" />
                  Room directory
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Input
                  value={roomSearch}
                  onChange={(event) => setRoomSearch(event.target.value)}
                  placeholder="Search rooms by name, slug or description"
                  className="rounded-xl border-slate-200"
                />

                {roomsQuery.isLoading ? (
                  <div className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-6 text-sm text-slate-600">
                    <LoaderCircle className="mb-3 h-5 w-5 animate-spin text-sky-700" />
                    Loading organization rooms...
                  </div>
                ) : null}

                {roomsQuery.error ? (
                  <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
                    {getErrorMessage(roomsQuery.error, "Unable to load the room directory.")}
                  </div>
                ) : null}

                {!roomsQuery.isLoading && !roomsQuery.error && !filteredRooms.length ? (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                    No rooms match the current filter yet.
                  </div>
                ) : null}

                {!roomsQuery.isLoading && !roomsQuery.error && filteredRooms.length ? (
                  <ScrollArea className="h-[560px] rounded-[1.5rem] border border-slate-200 bg-slate-50/80">
                    <div className="grid gap-3 p-4">
                      {filteredRooms.map((room) => (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => setSelectedRoomId(room.id)}
                          className={cn(
                            "rounded-[1.4rem] border bg-white p-4 text-left transition-colors",
                            selectedRoomId === room.id
                              ? "border-sky-200 bg-sky-50 shadow-sm"
                              : "border-slate-200 hover:border-slate-300",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold text-slate-950">{room.name}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{room.slug}</p>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-full px-3 py-1",
                                room.isActive
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-slate-100 text-slate-600",
                              )}
                            >
                              {room.isActive ? "active" : "inactive"}
                            </Badge>
                          </div>

                          <p className="mt-3 text-sm leading-6 text-slate-600">
                            {room.description || "Structured room ready for visual design and scoped access."}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                            <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1">
                              {room.gridWidth} x {room.gridHeight}
                            </Badge>
                            <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1">
                              {room.deskCount} desks
                            </Badge>
                            <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1">
                              {room.zoneCount} zones
                            </Badge>
                            <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1">
                              {room.groupAccessCount} groups
                            </Badge>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-slate-200/70 bg-slate-50 p-4">
                  <div className="text-sm text-slate-600">
                    {selectedRoomId
                      ? "The selected room is ready to open in the designer."
                      : "Select or create a room to start the layout flow."}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-slate-200 bg-white"
                    onClick={() => setActiveTab("designer")}
                    disabled={!selectedRoomId}
                  >
                    Open designer
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="groups" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
            <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
                  <Blocks className="h-5 w-5 text-sky-700" />
                  Create sharing group
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5">
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="group-name">
                    Group name
                  </label>
                  <Input
                    id="group-name"
                    value={createGroupForm.name}
                    onChange={(event) =>
                      setCreateGroupForm((currentForm) => ({
                        ...currentForm,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Sales Core Team"
                    className="rounded-xl border-slate-200"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="group-slug">
                    Slug
                  </label>
                  <Input
                    id="group-slug"
                    value={createGroupForm.slug}
                    onChange={(event) =>
                      setCreateGroupForm((currentForm) => ({
                        ...currentForm,
                        slug: event.target.value,
                      }))
                    }
                    placeholder="sales-core-team"
                    className="rounded-xl border-slate-200"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="group-description">
                    Description
                  </label>
                  <Textarea
                    id="group-description"
                    value={createGroupForm.description}
                    onChange={(event) =>
                      setCreateGroupForm((currentForm) => ({
                        ...currentForm,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Optional context for why this sharing cohort exists"
                    className="min-h-[120px] rounded-2xl border-slate-200"
                  />
                </div>

                <div className="grid gap-2">
                  <p className="text-sm font-medium text-slate-700">Members</p>
                  <MemberSelectionList
                    members={availableUsers}
                    selectedUserIds={createGroupForm.memberUserIds}
                    onToggle={(userId, enabled) => toggleGroupFormMember("create", userId, enabled)}
                    disabled={createGroupMutation.isPending}
                    emptyMessage="Organization members will appear here once the directory has been assigned."
                  />
                </div>

                <div className="grid gap-2">
                  <p className="text-sm font-medium text-slate-700">Room access</p>
                  <ScopedAccessEditor
                    items={availableRooms.map((room) => ({
                      id: room.id,
                      label: room.name,
                      subtitle: `${room.slug} | ${room.gridWidth} x ${room.gridHeight}`,
                    }))}
                    selection={createGroupForm.roomAccessSelection}
                    onSelectionChange={(nextSelection) =>
                      setCreateGroupForm((currentForm) => ({
                        ...currentForm,
                        roomAccessSelection: nextSelection,
                      }))
                    }
                    disabled={createGroupMutation.isPending}
                    emptyMessage="Rooms will appear here as soon as the organization has at least one room."
                  />
                </div>

                <Button
                  type="button"
                  className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  onClick={() => createGroupMutation.mutate()}
                  disabled={createGroupMutation.isPending}
                >
                  {createGroupMutation.isPending ? "Creating..." : "Create sharing group"}
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
                  <Users className="h-5 w-5 text-sky-700" />
                  Existing groups
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Input
                  value={groupSearch}
                  onChange={(event) => setGroupSearch(event.target.value)}
                  placeholder="Search sharing groups"
                  className="rounded-xl border-slate-200"
                />

                {groupsQuery.isLoading ? (
                  <div className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-6 text-sm text-slate-600">
                    <LoaderCircle className="mb-3 h-5 w-5 animate-spin text-sky-700" />
                    Loading sharing groups...
                  </div>
                ) : null}

                {groupsQuery.error ? (
                  <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
                    {getErrorMessage(groupsQuery.error, "Unable to load sharing groups.")}
                  </div>
                ) : null}

                {!groupsQuery.isLoading && !groupsQuery.error ? (
                  <div className="grid gap-6 xl:grid-cols-[0.78fr,1.22fr]">
                    <ScrollArea className="h-[780px] rounded-[1.5rem] border border-slate-200 bg-slate-50/80">
                      <div className="grid gap-3 p-4">
                        {!filteredGroups.length ? (
                          <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                            No sharing groups match the current filter.
                          </div>
                        ) : null}

                        {filteredGroups.map((group) => (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => setSelectedGroupId(group.id)}
                            className={cn(
                              "rounded-[1.3rem] border bg-white p-4 text-left transition-colors",
                              selectedGroupId === group.id
                                ? "border-sky-200 bg-sky-50 shadow-sm"
                                : "border-slate-200 hover:border-slate-300",
                            )}
                          >
                            <p className="text-base font-semibold text-slate-950">{group.name}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{group.slug}</p>
                            <p className="mt-3 text-sm leading-6 text-slate-600">
                              {group.description || "Group-based room sharing for faster rollouts."}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1">
                                {group.members.length} members
                              </Badge>
                              <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1">
                                {group.roomAccess.length} room scopes
                              </Badge>
                            </div>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>

                    <div className="space-y-4">
                      {!selectedGroup ? (
                        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                          Select a sharing group to edit members and room access.
                        </div>
                      ) : (
                        <>
                          <div className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5">
                            <p className="text-lg font-semibold text-slate-950">{selectedGroup.name}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{selectedGroup.slug}</p>
                            <p className="mt-3 text-sm leading-6 text-slate-600">
                              {selectedGroup.description || "Editing the selected sharing cohort and its room reach."}
                            </p>
                          </div>

                          <div className="grid gap-4">
                            <div className="grid gap-2">
                              <label className="text-sm font-medium text-slate-700" htmlFor="edit-group-name">
                                Group name
                              </label>
                              <Input
                                id="edit-group-name"
                                value={editGroupForm.name}
                                onChange={(event) =>
                                  setEditGroupForm((currentForm) => ({
                                    ...currentForm,
                                    name: event.target.value,
                                  }))
                                }
                                className="rounded-xl border-slate-200"
                              />
                            </div>

                            <div className="grid gap-2">
                              <label className="text-sm font-medium text-slate-700" htmlFor="edit-group-slug">
                                Slug
                              </label>
                              <Input
                                id="edit-group-slug"
                                value={editGroupForm.slug}
                                onChange={(event) =>
                                  setEditGroupForm((currentForm) => ({
                                    ...currentForm,
                                    slug: event.target.value,
                                  }))
                                }
                                className="rounded-xl border-slate-200"
                              />
                            </div>

                            <div className="grid gap-2">
                              <label className="text-sm font-medium text-slate-700" htmlFor="edit-group-description">
                                Description
                              </label>
                              <Textarea
                                id="edit-group-description"
                                value={editGroupForm.description}
                                onChange={(event) =>
                                  setEditGroupForm((currentForm) => ({
                                    ...currentForm,
                                    description: event.target.value,
                                  }))
                                }
                                className="min-h-[120px] rounded-2xl border-slate-200"
                              />
                            </div>

                            <div className="grid gap-2">
                              <p className="text-sm font-medium text-slate-700">Members</p>
                              <MemberSelectionList
                                members={availableUsers}
                                selectedUserIds={editGroupForm.memberUserIds}
                                onToggle={(userId, enabled) => toggleGroupFormMember("edit", userId, enabled)}
                                disabled={updateGroupMutation.isPending}
                                emptyMessage="Organization members will appear here once the directory has been assigned."
                              />
                            </div>

                            <div className="grid gap-2">
                              <p className="text-sm font-medium text-slate-700">Room access</p>
                              <ScopedAccessEditor
                                items={availableRooms.map((room) => ({
                                  id: room.id,
                                  label: room.name,
                                  subtitle: `${room.slug} | ${room.gridWidth} x ${room.gridHeight}`,
                                }))}
                                selection={editGroupForm.roomAccessSelection}
                                onSelectionChange={(nextSelection) =>
                                  setEditGroupForm((currentForm) => ({
                                    ...currentForm,
                                    roomAccessSelection: nextSelection,
                                  }))
                                }
                                disabled={updateGroupMutation.isPending}
                                emptyMessage="Rooms will appear here as soon as the organization has at least one room."
                              />
                            </div>

                            <Button
                              type="button"
                              className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                              onClick={() => updateGroupMutation.mutate()}
                              disabled={updateGroupMutation.isPending}
                            >
                              {updateGroupMutation.isPending ? "Saving..." : "Save sharing group"}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="designer" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[0.82fr,1.18fr]">
            <div className="space-y-6">
              <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
                    <ScanLine className="h-5 w-5 text-sky-700" />
                    Designer scope
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="designer-room">
                      Active room
                    </label>
                    <select
                      id="designer-room"
                      value={selectedRoomId ?? ""}
                      onChange={(event) => setSelectedRoomId(event.target.value || null)}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300"
                    >
                      {!rooms.length ? <option value="">No room available</option> : null}
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-[1.4rem] border border-slate-200/70 bg-slate-50 p-4 text-sm text-slate-600">
                    Layout changes are scoped to the active organization, audited server-side and validated against desk
                    dependencies before destructive updates.
                  </div>

                  <Button
                    type="button"
                    className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                    onClick={() => saveLayoutMutation.mutate()}
                    disabled={!layoutEditorState || saveLayoutMutation.isPending}
                  >
                    <Save className="h-4 w-4" />
                    {saveLayoutMutation.isPending ? "Saving layout..." : "Save room layout"}
                  </Button>
                </CardContent>
              </Card>

              {layoutQuery.isLoading ? (
                <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
                  <CardContent className="p-6 text-sm text-slate-600">
                    <LoaderCircle className="mb-3 h-5 w-5 animate-spin text-sky-700" />
                    Loading room layout...
                  </CardContent>
                </Card>
              ) : null}

              {layoutQuery.error ? (
                <Card className="rounded-[2rem] border-rose-200 bg-rose-50 shadow-none">
                  <CardContent className="p-6 text-sm text-rose-800">
                    {getErrorMessage(layoutQuery.error, "Unable to load the room layout.")}
                  </CardContent>
                </Card>
              ) : null}

              {layoutEditorState ? (
                <>
                  <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
                        <ShieldCheck className="h-5 w-5 text-sky-700" />
                        Room settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-700" htmlFor="designer-room-name">
                          Room name
                        </label>
                        <Input
                          id="designer-room-name"
                          value={layoutEditorState.room.name}
                          onChange={(event) =>
                            setLayoutEditorState((currentState) =>
                              currentState
                                ? {
                                    ...currentState,
                                    room: {
                                      ...currentState.room,
                                      name: event.target.value,
                                    },
                                  }
                                : currentState,
                            )
                          }
                          className="rounded-xl border-slate-200"
                        />
                      </div>

                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-700" htmlFor="designer-room-slug">
                          Room slug
                        </label>
                        <Input
                          id="designer-room-slug"
                          value={layoutEditorState.room.slug}
                          onChange={(event) =>
                            setLayoutEditorState((currentState) =>
                              currentState
                                ? {
                                    ...currentState,
                                    room: {
                                      ...currentState.room,
                                      slug: event.target.value,
                                    },
                                  }
                                : currentState,
                            )
                          }
                          className="rounded-xl border-slate-200"
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                          <label className="text-sm font-medium text-slate-700" htmlFor="designer-room-grid-width">
                            Grid width
                          </label>
                          <Input
                            id="designer-room-grid-width"
                            type="number"
                            value={layoutEditorState.room.gridWidth}
                            onChange={(event) =>
                              setLayoutEditorState((currentState) =>
                                currentState
                                  ? {
                                      ...currentState,
                                      room: {
                                        ...currentState.room,
                                        gridWidth: Number(event.target.value) || 4,
                                      },
                                    }
                                  : currentState,
                              )
                            }
                            className="rounded-xl border-slate-200"
                          />
                        </div>

                        <div className="grid gap-2">
                          <label className="text-sm font-medium text-slate-700" htmlFor="designer-room-grid-height">
                            Grid height
                          </label>
                          <Input
                            id="designer-room-grid-height"
                            type="number"
                            value={layoutEditorState.room.gridHeight}
                            onChange={(event) =>
                              setLayoutEditorState((currentState) =>
                                currentState
                                  ? {
                                      ...currentState,
                                      room: {
                                        ...currentState.room,
                                        gridHeight: Number(event.target.value) || 4,
                                      },
                                    }
                                  : currentState,
                              )
                            }
                            className="rounded-xl border-slate-200"
                          />
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-700" htmlFor="designer-room-description">
                          Description
                        </label>
                        <Textarea
                          id="designer-room-description"
                          value={layoutEditorState.room.description ?? ""}
                          onChange={(event) =>
                            setLayoutEditorState((currentState) =>
                              currentState
                                ? {
                                    ...currentState,
                                    room: {
                                      ...currentState.room,
                                      description: event.target.value,
                                    },
                                  }
                                : currentState,
                            )
                          }
                          className="min-h-[110px] rounded-2xl border-slate-200"
                        />
                      </div>

                      <div className="flex h-11 items-center justify-between rounded-xl border border-slate-200 bg-white px-4">
                        <div>
                          <p className="text-sm font-medium text-slate-700">Room active</p>
                          <p className="text-xs text-slate-500">Inactive rooms stay hidden from planners.</p>
                        </div>
                        <Switch
                          checked={layoutEditorState.room.isActive}
                          onCheckedChange={(checked) =>
                            setLayoutEditorState((currentState) =>
                              currentState
                                ? {
                                    ...currentState,
                                    room: {
                                      ...currentState.room,
                                      isActive: checked,
                                    },
                                  }
                                : currentState,
                            )
                          }
                        />
                      </div>

                      <div className="rounded-[1.4rem] border border-slate-200/70 bg-slate-50 p-4 text-sm text-slate-600">
                        Last saved {formatDateTime(layoutEditorState.room.updatedAt)} | {layoutEditorState.walls.length} walls currently remain read-only in this first designer slice.
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
                        <Users className="h-5 w-5 text-sky-700" />
                        Room access
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-5">
                      <div className="grid gap-2">
                        <p className="text-sm font-medium text-slate-700">Direct user access</p>
                        <ScopedAccessEditor
                          items={layoutQuery.data?.organizationMembers.map((member) => ({
                            id: member.userId,
                            label: member.displayName,
                            subtitle: `${member.username} | ${member.membershipRole}${member.email ? ` | ${member.email}` : ""}`,
                          })) ?? []}
                          selection={layoutEditorState.roomUserSelection}
                          onSelectionChange={(nextSelection) =>
                            setLayoutEditorState((currentState) =>
                              currentState
                                ? {
                                    ...currentState,
                                    roomUserSelection: nextSelection,
                                  }
                                : currentState,
                            )
                          }
                          emptyMessage="No organization members are available for direct room access."
                        />
                      </div>

                      <div className="grid gap-2">
                        <p className="text-sm font-medium text-slate-700">Group access</p>
                        <ScopedAccessEditor
                          items={layoutQuery.data?.organizationGroups.map((group) => ({
                            id: group.id,
                            label: group.name,
                            subtitle: group.slug,
                          })) ?? []}
                          selection={layoutEditorState.roomGroupSelection}
                          onSelectionChange={(nextSelection) =>
                            setLayoutEditorState((currentState) =>
                              currentState
                                ? {
                                    ...currentState,
                                    roomGroupSelection: nextSelection,
                                  }
                                : currentState,
                            )
                          }
                          emptyMessage="Create sharing groups first to apply group-based room access."
                        />
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : null}
            </div>

            <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
              <CardContent className="grid min-h-[860px] gap-0 xl:grid-cols-[72px,1fr,320px]">
                <div className="flex flex-col items-center gap-4 border-r border-slate-200/80 py-6">
                  {[
                    { icon: Move, active: Boolean(selectedDesk || selectedZone) },
                    { icon: ScanLine, active: false },
                    { icon: Grid2x2, active: false },
                    { icon: Tag, active: false },
                  ].map(({ icon: Icon, active }, index) => (
                    <button
                      key={index}
                      type="button"
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors",
                        active
                          ? "border-cyan-300 bg-cyan-100 text-cyan-700 shadow-sm"
                          : "border-transparent bg-slate-50 text-slate-500 hover:border-slate-200 hover:bg-white",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  ))}
                </div>

                <div className="border-r border-slate-200/80 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Interactive layout canvas</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {layoutEditorState?.room.name ?? "Select a room"} | {activeOrganization?.name}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        onClick={addDesk}
                        disabled={!layoutEditorState}
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Add desk
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        onClick={addZone}
                        disabled={!layoutEditorState}
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Add zone
                      </Button>
                    </div>
                  </div>

                  {!layoutEditorState ? (
                    <div className="mt-6 rounded-[2rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                      Pick a room from the selector to load the designer.
                    </div>
                  ) : (
                    <div className="mt-6 rounded-[2rem] border border-slate-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.95),_rgba(248,250,252,0.95))] p-5 shadow-inner">
                      <div className="overflow-auto rounded-[1.8rem] border border-slate-200">
                        <div
                          className="relative bg-[linear-gradient(0deg,transparent_23px,rgba(226,232,240,0.85)_24px),linear-gradient(90deg,transparent_23px,rgba(226,232,240,0.85)_24px)] [background-size:24px_24px]"
                          style={{
                            width: canvasDimensions.width,
                            height: canvasDimensions.height,
                          }}
                        >
                        <div className="absolute inset-x-5 top-5 rounded-[1.6rem] border border-slate-200/80 bg-white/90 px-4 py-3 text-sm text-slate-500 shadow-sm">
                          Active groups:
                          {sharingGroups.slice(0, 3).map((group) => (
                            <span
                              key={group.id}
                              className="ml-2 inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700"
                            >
                              {group.name}
                            </span>
                          ))}
                          {!sharingGroups.length ? (
                            <span className="ml-2 text-xs text-slate-400">Create a sharing group to preview scoped access.</span>
                          ) : null}
                        </div>

                        {layoutEditorState.zones.map((zone) => (
                          <button
                            key={zone.id}
                            type="button"
                            onClick={() => setCanvasSelection({ kind: "zone", id: zone.id })}
                            className={cn(
                              "absolute rounded-[1.6rem] border-2 border-dashed bg-white/55 px-4 py-3 text-left shadow-sm transition-shadow",
                              canvasSelection?.kind === "zone" && canvasSelection.id === zone.id
                                ? "border-indigo-400 shadow-[0_0_0_4px_rgba(99,102,241,0.12)]"
                                : "border-slate-300",
                            )}
                            style={{
                              left: zone.x * GRID_CELL_SIZE,
                              top: zone.y * GRID_CELL_SIZE,
                              width: zone.width * GRID_CELL_SIZE,
                              height: zone.height * GRID_CELL_SIZE,
                            }}
                          >
                            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: zone.color ?? "#6366F1" }}>
                              {zone.name}
                            </p>
                            <p className="mt-2 text-xs text-slate-500">{zone.zoneType}</p>
                          </button>
                        ))}

                        {layoutEditorState.desks.map((desk) => (
                          <button
                            key={desk.id}
                            type="button"
                            onClick={() => setCanvasSelection({ kind: "desk", id: desk.id })}
                            className={cn(
                              "absolute flex items-center justify-center rounded-xl border-2 text-xs font-semibold shadow-sm transition-all",
                              desk.defaultStatus === "available"
                                ? "border-cyan-600 bg-white text-cyan-700"
                                : "border-slate-300 bg-slate-100 text-slate-400",
                              canvasSelection?.kind === "desk" && canvasSelection.id === desk.id && "ring-4 ring-indigo-200",
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
                    </div>
                  )}
                </div>

                <div className="bg-white/80 p-6">
                  <p className="text-sm font-semibold text-slate-950">Inspector</p>
                  <p className="mt-1 text-sm text-slate-600">Edit the selected desk or zone without leaving the canvas.</p>

                  {selectedDesk ? (
                    <div className="mt-6 grid gap-5">
                      <div className="grid gap-2">
                        <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Workspace label</span>
                        <Input
                          value={selectedDesk.label ?? ""}
                          onChange={(event) =>
                            updateDesk(selectedDesk.id, (desk) => ({
                              ...desk,
                              label: event.target.value.toUpperCase(),
                            }))
                          }
                          className="rounded-xl border-slate-200"
                        />
                      </div>

                      <div className="grid gap-2">
                        <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Default status</span>
                        <div className="grid grid-cols-2 gap-3">
                          {(["available", "restricted"] as const).map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() =>
                                updateDesk(selectedDesk.id, (desk) => ({
                                  ...desk,
                                  defaultStatus: status as StudioDeskStatus,
                                }))
                              }
                              className={cn(
                                "rounded-xl border px-3 py-3 text-sm font-medium transition-colors",
                                selectedDesk.defaultStatus === status
                                  ? "border-cyan-400 bg-cyan-50 text-cyan-700"
                                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                              )}
                            >
                              {status === "available" ? "Available" : "Restricted"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                          <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Grid X</span>
                          <Input
                            type="number"
                            value={selectedDesk.x}
                            onChange={(event) =>
                              updateDesk(selectedDesk.id, (desk) => ({
                                ...desk,
                                x: Number(event.target.value) || 0,
                              }))
                            }
                            className="rounded-xl border-slate-200"
                          />
                        </div>
                        <div className="grid gap-2">
                          <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Grid Y</span>
                          <Input
                            type="number"
                            value={selectedDesk.y}
                            onChange={(event) =>
                              updateDesk(selectedDesk.id, (desk) => ({
                                ...desk,
                                y: Number(event.target.value) || 0,
                              }))
                            }
                            className="rounded-xl border-slate-200"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                          <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Grid width</span>
                          <Input
                            type="number"
                            value={selectedDesk.width}
                            onChange={(event) =>
                              updateDesk(selectedDesk.id, (desk) => ({
                                ...desk,
                                width: Number(event.target.value) || 1,
                              }))
                            }
                            className="rounded-xl border-slate-200"
                          />
                        </div>
                        <div className="grid gap-2">
                          <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Grid height</span>
                          <Input
                            type="number"
                            value={selectedDesk.height}
                            onChange={(event) =>
                              updateDesk(selectedDesk.id, (desk) => ({
                                ...desk,
                                height: Number(event.target.value) || 1,
                              }))
                            }
                            className="rounded-xl border-slate-200"
                          />
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Amenities</span>
                        <div className="flex flex-wrap gap-2">
                          {layoutEditorState?.amenityCatalog.map((amenity) => {
                            const isActive = selectedDesk.amenities.some(
                              (deskAmenity) => deskAmenity.toLowerCase() === amenity.name.toLowerCase(),
                            );

                            return (
                              <button
                                key={amenity.id}
                                type="button"
                                onClick={() =>
                                  updateDesk(selectedDesk.id, (desk) => ({
                                    ...desk,
                                    amenities: isActive
                                      ? desk.amenities.filter(
                                          (deskAmenity) =>
                                            deskAmenity.toLowerCase() !== amenity.name.toLowerCase(),
                                        )
                                      : [...desk.amenities, amenity.name],
                                  }))
                                }
                                className={cn(
                                  "inline-flex items-center rounded-full border px-3 py-2 text-xs font-medium transition-colors",
                                  isActive
                                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                                )}
                              >
                                <Tag className="mr-1 h-3.5 w-3.5" />
                                {amenity.name}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Input
                            value={draftAmenityName}
                            onChange={(event) => setDraftAmenityName(event.target.value)}
                            placeholder="Add new amenity tag"
                            className="rounded-xl border-slate-200"
                          />
                          <Button type="button" variant="outline" className="rounded-xl" onClick={addDeskAmenity}>
                            Add
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-[1.4rem] border border-slate-200/70 bg-slate-50 p-4 text-sm text-slate-600">
                        <p className="font-medium text-slate-950">Sharing preview</p>
                        <p className="mt-2">
                          This workstation inherits room-level user and group scope, with desk attributes preserved as
                          structured data.
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-xl border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        onClick={() => deleteDesk(selectedDesk.id)}
                      >
                        Delete desk
                      </Button>
                    </div>
                  ) : selectedZone ? (
                    <div className="mt-6 grid gap-5">
                      <div className="grid gap-2">
                        <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Zone name</span>
                        <Input
                          value={selectedZone.name}
                          onChange={(event) =>
                            updateZone(selectedZone.id, (zone) => ({
                              ...zone,
                              name: event.target.value,
                            }))
                          }
                          className="rounded-xl border-slate-200"
                        />
                      </div>

                      <div className="grid gap-2">
                        <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Zone type</span>
                        <Input
                          value={selectedZone.zoneType}
                          onChange={(event) =>
                            updateZone(selectedZone.id, (zone) => ({
                              ...zone,
                              zoneType: event.target.value,
                            }))
                          }
                          className="rounded-xl border-slate-200"
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                          <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Grid width</span>
                          <Input
                            type="number"
                            value={selectedZone.width}
                            onChange={(event) =>
                              updateZone(selectedZone.id, (zone) => ({
                                ...zone,
                                width: Number(event.target.value) || 1,
                              }))
                            }
                            className="rounded-xl border-slate-200"
                          />
                        </div>
                        <div className="grid gap-2">
                          <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Grid height</span>
                          <Input
                            type="number"
                            value={selectedZone.height}
                            onChange={(event) =>
                              updateZone(selectedZone.id, (zone) => ({
                                ...zone,
                                height: Number(event.target.value) || 1,
                              }))
                            }
                            className="rounded-xl border-slate-200"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                          <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Grid X</span>
                          <Input
                            type="number"
                            value={selectedZone.x}
                            onChange={(event) =>
                              updateZone(selectedZone.id, (zone) => ({
                                ...zone,
                                x: Number(event.target.value) || 0,
                              }))
                            }
                            className="rounded-xl border-slate-200"
                          />
                        </div>
                        <div className="grid gap-2">
                          <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Grid Y</span>
                          <Input
                            type="number"
                            value={selectedZone.y}
                            onChange={(event) =>
                              updateZone(selectedZone.id, (zone) => ({
                                ...zone,
                                y: Number(event.target.value) || 0,
                              }))
                            }
                            className="rounded-xl border-slate-200"
                          />
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Color</span>
                        <Input
                          value={selectedZone.color ?? ""}
                          onChange={(event) =>
                            updateZone(selectedZone.id, (zone) => ({
                              ...zone,
                              color: event.target.value,
                            }))
                          }
                          placeholder="#BBA5FF"
                          className="rounded-xl border-slate-200"
                        />
                      </div>

                      <div className="rounded-[1.4rem] border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
                        Zones let us define neighborhoods, quiet areas and special sections without encoding meaning in
                        desk labels.
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-xl border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        onClick={() => deleteZone(selectedZone.id)}
                      >
                        Delete zone
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                      Select a desk or zone to edit its attributes. Save commits both geometry and scoped access in one
                      backend transaction.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

