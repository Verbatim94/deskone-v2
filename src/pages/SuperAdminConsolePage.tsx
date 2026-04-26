import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Copy, KeyRound, LoaderCircle, ShieldPlus, UserCog, Users } from "lucide-react";

import {
  createGovernanceOrganization,
  createGovernanceUser,
  issueGovernanceUserAccess,
  listGovernanceOrganizations,
  listGovernanceUsers,
  updateGovernanceOrganization,
  updateGovernanceUser,
} from "@/features/governance/api";
import type {
  CreateUserInput,
  GovernanceMembershipInput,
  GovernanceOrganization,
  GovernanceUser,
  GovernanceIssuedCredentials,
  UpdateOrganizationInput,
} from "@/features/governance/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { EdgeClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type UserFormState = {
  username: string;
  password: string;
  role: "admin" | "user";
  isActive: boolean;
  loginEnabled: boolean;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  employeeCode: string;
  department: string;
  jobTitle: string;
  location: string;
  phone: string;
  timezone: string;
  notes: string;
  avatarUrl: string;
};

type MembershipSelection = Record<
  string,
  {
    enabled: boolean;
    role: "admin" | "member";
  }
>;

type OrganizationFormState = {
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
};

type OrganizationUserSelection = Record<
  string,
  {
    enabled: boolean;
    role: "admin" | "member";
  }
>;

type IssuedAccessState = {
  userId: string;
  username: string;
  credentials: GovernanceIssuedCredentials;
};

const defaultCreateUserForm: UserFormState = {
  username: "",
  password: "",
  role: "user",
  isActive: true,
  loginEnabled: false,
  firstName: "",
  lastName: "",
  displayName: "",
  email: "",
  employeeCode: "",
  department: "",
  jobTitle: "",
  location: "",
  phone: "",
  timezone: "Europe/Rome",
  notes: "",
  avatarUrl: "",
};

const defaultEditUserForm: UserFormState = {
  ...defaultCreateUserForm,
  password: "",
};

const defaultOrganizationForm: OrganizationFormState = {
  name: "",
  slug: "",
  description: "",
  isActive: true,
};

function emptyMembershipSelection(organizations: GovernanceOrganization[]): MembershipSelection {
  return Object.fromEntries(
    organizations.map((organization) => [
      organization.id,
      {
        enabled: false,
        role: "member" as const,
      },
    ]),
  );
}

function buildMembershipSelection(
  organizations: GovernanceOrganization[],
  memberships: GovernanceUser["memberships"] | GovernanceMembershipInput[],
): MembershipSelection {
  const selection = emptyMembershipSelection(organizations);

  for (const membership of memberships) {
    if (!selection[membership.organizationId]) {
      continue;
    }

    selection[membership.organizationId] = {
      enabled: true,
      role: membership.role,
    };
  }

  return selection;
}

function mergeMembershipSelection(
  organizations: GovernanceOrganization[],
  currentSelection: MembershipSelection,
): MembershipSelection {
  const nextSelection = emptyMembershipSelection(organizations);

  for (const organization of organizations) {
    if (currentSelection[organization.id]) {
      nextSelection[organization.id] = currentSelection[organization.id];
    }
  }

  return nextSelection;
}

function extractMemberships(selection: MembershipSelection): GovernanceMembershipInput[] {
  return Object.entries(selection)
    .filter(([, membership]) => membership.enabled)
    .map(([organizationId, membership]) => ({
      organizationId,
      role: membership.role,
    }));
}

function emptyOrganizationUserSelection(users: GovernanceUser[]): OrganizationUserSelection {
  return Object.fromEntries(
    users.map((user) => [
      user.id,
      {
        enabled: false,
        role: "member" as const,
      },
    ]),
  );
}

function buildOrganizationUserSelection(
  users: GovernanceUser[],
  organizationId: string,
): OrganizationUserSelection {
  const selection = emptyOrganizationUserSelection(users);

  for (const user of users) {
    const membership = user.memberships.find((entry) => entry.organizationId === organizationId);

    if (!membership) {
      continue;
    }

    selection[user.id] = {
      enabled: true,
      role: membership.role,
    };
  }

  return selection;
}

function mergeOrganizationUserSelection(
  users: GovernanceUser[],
  currentSelection: OrganizationUserSelection,
): OrganizationUserSelection {
  const nextSelection = emptyOrganizationUserSelection(users);

  for (const user of users) {
    if (currentSelection[user.id]) {
      nextSelection[user.id] = currentSelection[user.id];
    }
  }

  return nextSelection;
}

function extractOrganizationMemberships(selection: OrganizationUserSelection) {
  const adminUserIds: string[] = [];
  const memberUserIds: string[] = [];

  for (const [userId, membership] of Object.entries(selection)) {
    if (!membership.enabled) {
      continue;
    }

    if (membership.role === "admin") {
      adminUserIds.push(userId);
    } else {
      memberUserIds.push(userId);
    }
  }

  return { adminUserIds, memberUserIds };
}

function createFormStateFromUser(user: GovernanceUser): UserFormState {
  return {
    username: user.username,
    password: "",
    role: user.role === "super_admin" ? "admin" : user.role,
    isActive: user.isActive,
    loginEnabled: user.loginEnabled,
    firstName: user.profile.firstName ?? "",
    lastName: user.profile.lastName ?? "",
    displayName: user.profile.displayName ?? "",
    email: user.profile.email ?? "",
    employeeCode: user.profile.employeeCode ?? "",
    department: user.profile.department ?? "",
    jobTitle: user.profile.jobTitle ?? "",
    location: user.profile.location ?? "",
    phone: user.profile.phone ?? "",
    timezone: user.profile.timezone ?? "Europe/Rome",
    notes: user.profile.notes ?? "",
    avatarUrl: user.profile.avatarUrl ?? "",
  };
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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof EdgeClientError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function UserMembershipEditor({
  organizations,
  selection,
  onSelectionChange,
  disabled,
}: {
  organizations: GovernanceOrganization[];
  selection: MembershipSelection;
  onSelectionChange: (nextSelection: MembershipSelection) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      {organizations.map((organization) => {
        const membership = selection[organization.id] ?? { enabled: false, role: "member" as const };

        return (
          <div
            key={organization.id}
            className="rounded-[1.35rem] border border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.98))] p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-950">{organization.name}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{organization.slug}</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right text-xs text-slate-500">
                  <p>{organization.adminCount} admins</p>
                  <p>{organization.memberCount} members</p>
                </div>
                <Switch
                  checked={membership.enabled}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onSelectionChange({
                      ...selection,
                      [organization.id]: {
                        ...membership,
                        enabled: checked,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className="mt-3">
              <select
                value={membership.role}
                disabled={disabled || !membership.enabled}
                onChange={(event) =>
                  onSelectionChange({
                    ...selection,
                    [organization.id]: {
                      enabled: membership.enabled,
                      role: event.target.value as "admin" | "member",
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
  );
}

function OrganizationUserAccessEditor({
  users,
  selection,
  onSelectionChange,
  disabled,
}: {
  users: GovernanceUser[];
  selection: OrganizationUserSelection;
  onSelectionChange: (nextSelection: OrganizationUserSelection) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      {users.map((user) => {
        const membership = selection[user.id] ?? { enabled: false, role: "member" as const };

        return (
          <div
            key={user.id}
            className="rounded-[1.35rem] border border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.98))] p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-950">
                  {user.profile.displayName ?? user.fullName}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                  {user.username}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600"
                >
                  {user.role}
                </Badge>
                <Switch
                  checked={membership.enabled}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onSelectionChange({
                      ...selection,
                      [user.id]: {
                        ...membership,
                        enabled: checked,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className="mt-3">
              <select
                value={membership.role}
                disabled={disabled || !membership.enabled}
                onChange={(event) =>
                  onSelectionChange({
                    ...selection,
                    [user.id]: {
                      enabled: membership.enabled,
                      role: event.target.value as "admin" | "member",
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
  );
}

export default function SuperAdminConsolePage() {
  const queryClient = useQueryClient();
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [organizationDescription, setOrganizationDescription] = useState("");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [editOrganizationForm, setEditOrganizationForm] = useState<OrganizationFormState>(defaultOrganizationForm);
  const [organizationUserSelection, setOrganizationUserSelection] = useState<OrganizationUserSelection>({});

  const [createUserForm, setCreateUserForm] = useState<UserFormState>(defaultCreateUserForm);
  const [createMembershipSelection, setCreateMembershipSelection] = useState<MembershipSelection>({});

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editUserForm, setEditUserForm] = useState<UserFormState>(defaultEditUserForm);
  const [editMembershipSelection, setEditMembershipSelection] = useState<MembershipSelection>({});
  const [issuedAccessState, setIssuedAccessState] = useState<IssuedAccessState | null>(null);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [roleFilter, setRoleFilter] = useState<"all" | "super_admin" | "admin" | "user">("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [organizationFilter, setOrganizationFilter] = useState<string>("all");

  const organizationsQuery = useQuery({
    queryKey: ["governance-organizations"],
    queryFn: () => listGovernanceOrganizations(true),
  });

  const organizations = useMemo(() => organizationsQuery.data ?? [], [organizationsQuery.data]);
  const selectedOrganization = useMemo(
    () => organizations.find((organization) => organization.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId],
  );

  const allUsersQuery = useQuery({
    queryKey: ["governance-users", "all"],
    queryFn: () => listGovernanceUsers(),
  });

  const organizationCandidates = useMemo(
    () => allUsersQuery.data ?? [],
    [allUsersQuery.data],
  );

  useEffect(() => {
    if (!organizations.length) {
      return;
    }

    setCreateMembershipSelection((currentSelection) => {
      return mergeMembershipSelection(organizations, currentSelection);
    });
  }, [organizations]);

  useEffect(() => {
    if (!organizations.length) {
      setSelectedOrganizationId(null);
      return;
    }

    if (!selectedOrganizationId || !organizations.some((organization) => organization.id === selectedOrganizationId)) {
      setSelectedOrganizationId(organizations[0]?.id ?? null);
    }
  }, [organizations, selectedOrganizationId]);

  useEffect(() => {
    if (!selectedOrganization) {
      return;
    }

    setEditOrganizationForm({
      name: selectedOrganization.name,
      slug: selectedOrganization.slug,
      description: selectedOrganization.description ?? "",
      isActive: selectedOrganization.isActive,
    });
  }, [selectedOrganization]);

  useEffect(() => {
    if (!selectedOrganization || !organizationCandidates.length) {
      return;
    }

    setOrganizationUserSelection(buildOrganizationUserSelection(organizationCandidates, selectedOrganization.id));
  }, [organizationCandidates, selectedOrganization]);

  const usersQuery = useQuery({
    queryKey: [
      "governance-users",
      organizationFilter,
      roleFilter,
      activeFilter,
      deferredSearch,
    ],
    queryFn: () =>
      listGovernanceUsers({
        organizationId: organizationFilter === "all" ? undefined : organizationFilter,
        role: roleFilter === "all" ? undefined : roleFilter,
        isActive: activeFilter === "all" ? undefined : activeFilter === "active",
        search: deferredSearch || undefined,
      }),
  });

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  useEffect(() => {
    if (!users.length) {
      setSelectedUserId(null);
      return;
    }

    if (!selectedUserId || !users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(users[0]?.id ?? null);
    }
  }, [selectedUserId, users]);

  useEffect(() => {
    if (!selectedUser || !organizations.length) {
      return;
    }

    setEditUserForm(createFormStateFromUser(selectedUser));
    setEditMembershipSelection(buildMembershipSelection(organizations, selectedUser.memberships));
  }, [organizations, selectedUser]);

  useEffect(() => {
    if (!issuedAccessState) {
      return;
    }

    if (issuedAccessState.userId !== selectedUserId) {
      setIssuedAccessState(null);
    }
  }, [issuedAccessState, selectedUserId]);

  const createOrganizationMutation = useMutation({
    mutationFn: () =>
      createGovernanceOrganization({
        name: organizationName,
        slug: organizationSlug || undefined,
        description: organizationDescription || null,
      }),
    onSuccess: (organization) => {
      toast.success(`Organization ${organization.name} created.`);
      setOrganizationName("");
      setOrganizationSlug("");
      setOrganizationDescription("");
      setSelectedOrganizationId(organization.id);
      void queryClient.invalidateQueries({ queryKey: ["governance-organizations"] });
      void queryClient.invalidateQueries({ queryKey: ["governance-users"] });
      void queryClient.invalidateQueries({ queryKey: ["governance-users", "all"] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Unable to create the organization."));
    },
  });

  const updateOrganizationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrganization) {
        throw new Error("Select an organization first.");
      }

      const { adminUserIds, memberUserIds } = extractOrganizationMemberships(organizationUserSelection);
      const payload: UpdateOrganizationInput = {
        organizationId: selectedOrganization.id,
        name: editOrganizationForm.name,
        slug: editOrganizationForm.slug || undefined,
        description: editOrganizationForm.description || null,
        isActive: editOrganizationForm.isActive,
        adminUserIds,
        memberUserIds,
      };

      return updateGovernanceOrganization(payload);
    },
    onSuccess: (organization) => {
      toast.success(`Organization ${organization.name} updated.`);
      void queryClient.invalidateQueries({ queryKey: ["governance-organizations"] });
      void queryClient.invalidateQueries({ queryKey: ["governance-users"] });
      void queryClient.invalidateQueries({ queryKey: ["governance-users", "all"] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Unable to update the organization."));
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async () => {
      if (createUserForm.loginEnabled && !createUserForm.password.trim()) {
        throw new Error("Set a password or create the profile with login disabled, then use Issue access later.");
      }

      const payload: CreateUserInput = {
        username: createUserForm.username,
        password: createUserForm.password,
        role: createUserForm.role,
        loginEnabled: createUserForm.loginEnabled,
        firstName: createUserForm.firstName || null,
        lastName: createUserForm.lastName || null,
        displayName: createUserForm.displayName || null,
        email: createUserForm.email || null,
        employeeCode: createUserForm.employeeCode || null,
        department: createUserForm.department || null,
        jobTitle: createUserForm.jobTitle || null,
        location: createUserForm.location || null,
        phone: createUserForm.phone || null,
        timezone: createUserForm.timezone || null,
        notes: createUserForm.notes || null,
        avatarUrl: createUserForm.avatarUrl || null,
        memberships: extractMemberships(createMembershipSelection),
      };

      return createGovernanceUser(payload);
    },
    onSuccess: (user) => {
      toast.success(`User ${user.username} created.`);
      setCreateUserForm(defaultCreateUserForm);
      setCreateMembershipSelection(emptyMembershipSelection(organizations));
      setSelectedUserId(user.id);
      void queryClient.invalidateQueries({ queryKey: ["governance-users"] });
      void queryClient.invalidateQueries({ queryKey: ["governance-organizations"] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Unable to create the user."));
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) {
        throw new Error("Select a user first.");
      }

      if (
        selectedUser.role !== "super_admin" &&
        !selectedUser.loginEnabled &&
        editUserForm.loginEnabled &&
        !editUserForm.password.trim()
      ) {
        throw new Error("Use Issue access to generate a temporary password, or set a password before enabling login.");
      }

      return updateGovernanceUser({
        userId: selectedUser.id,
        username: editUserForm.username,
        password: editUserForm.password || undefined,
        role: selectedUser.role === "super_admin" ? undefined : editUserForm.role,
        isActive: selectedUser.role === "super_admin" ? true : editUserForm.isActive,
        loginEnabled: selectedUser.role === "super_admin" ? true : editUserForm.loginEnabled,
        firstName: editUserForm.firstName || null,
        lastName: editUserForm.lastName || null,
        displayName: editUserForm.displayName || null,
        email: editUserForm.email || null,
        employeeCode: editUserForm.employeeCode || null,
        department: editUserForm.department || null,
        jobTitle: editUserForm.jobTitle || null,
        location: editUserForm.location || null,
        phone: editUserForm.phone || null,
        timezone: editUserForm.timezone || null,
        notes: editUserForm.notes || null,
        avatarUrl: editUserForm.avatarUrl || null,
        memberships: selectedUser.role === "super_admin" ? undefined : extractMemberships(editMembershipSelection),
      });
    },
    onSuccess: (user) => {
      toast.success(`User ${user.username} updated.`);
      setEditUserForm((currentForm) => ({ ...currentForm, password: "" }));
      void queryClient.invalidateQueries({ queryKey: ["governance-users"] });
      void queryClient.invalidateQueries({ queryKey: ["governance-organizations"] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Unable to update the user."));
    },
  });

  const issueAccessMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) {
        throw new Error("Select a user first.");
      }

      return issueGovernanceUserAccess(selectedUser.id);
    },
    onSuccess: ({ user, issuedCredentials }) => {
      if (!issuedCredentials || !selectedUser) {
        toast.error("No temporary password was issued.");
        return;
      }

      setIssuedAccessState({
        userId: user.id,
        username: user.username,
        credentials: issuedCredentials,
      });
      setEditUserForm(createFormStateFromUser(user));
      toast.success(`Temporary access issued for ${user.username}.`);
      void queryClient.invalidateQueries({ queryKey: ["governance-users"] });
      void queryClient.invalidateQueries({ queryKey: ["governance-users", "all"] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Unable to issue temporary access."));
    },
  });

  return (
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2.5rem] border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(248,250,252,0.9)_48%,rgba(224,242,254,0.68))] p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-sky-700">Super-admin console</p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Govern environments, admins and user identity from one calm control plane.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
                This is the first real operational console for the `v2`: organizations stay separated, admins stay
                scoped, and user profiles are already modeled for future Microsoft Entra / Azure integration.
              </p>
            </div>
  
            <div className="grid gap-3 text-sm text-slate-700">
              <div className="rounded-[1.4rem] border border-white/70 bg-white/85 p-4 shadow-sm">
                Super-admin owns the platform surface. Organization admins only operate inside their environment.
              </div>
              <div className="rounded-[1.4rem] border border-white/70 bg-white/85 p-4 shadow-sm">
                User profiles and identities stay separate, so directory sync can grow later without rewriting the app.
              </div>
              <div className="rounded-[1.4rem] border border-white/70 bg-white/85 p-4 shadow-sm">
                All privileged mutations pass through Edge Functions and write audit events.
              </div>
            </div>
          </div>
        </section>

      <Tabs defaultValue="organizations" className="space-y-6">
        <TabsList className="h-auto rounded-2xl bg-white/85 p-2 shadow-sm">
          <TabsTrigger value="organizations" className="rounded-xl px-4 py-2.5">
            Organizations
          </TabsTrigger>
          <TabsTrigger value="users" className="rounded-xl px-4 py-2.5">
            Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organizations" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
            <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
                  <Building2 className="h-5 w-5 text-sky-700" />
                  Create organization
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="organization-name">
                    Name
                  </label>
                  <Input
                    id="organization-name"
                    value={organizationName}
                    onChange={(event) => setOrganizationName(event.target.value)}
                    placeholder="Deskone Milano"
                    className="rounded-xl border-slate-200"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="organization-slug">
                    Slug
                  </label>
                  <Input
                    id="organization-slug"
                    value={organizationSlug}
                    onChange={(event) => setOrganizationSlug(event.target.value)}
                    placeholder="deskone-milano"
                    className="rounded-xl border-slate-200"
                  />
                  <p className="text-xs text-slate-500">
                    Leave it empty and the backend will derive a clean slug from the name.
                  </p>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="organization-description">
                    Description
                  </label>
                  <Textarea
                    id="organization-description"
                    value={organizationDescription}
                    onChange={(event) => setOrganizationDescription(event.target.value)}
                    placeholder="Optional context for the environment"
                    className="min-h-[140px] rounded-2xl border-slate-200"
                  />
                </div>

                <Button
                  type="button"
                  className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  onClick={() => createOrganizationMutation.mutate()}
                  disabled={createOrganizationMutation.isPending}
                >
                  {createOrganizationMutation.isPending ? "Creating..." : "Create organization"}
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
                    <ShieldPlus className="h-5 w-5 text-sky-700" />
                    Organization overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {organizationsQuery.isLoading ? (
                    <div className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-6 text-sm text-slate-600">
                      <LoaderCircle className="mb-3 h-5 w-5 animate-spin text-sky-700" />
                      Loading organizations...
                    </div>
                  ) : null}

                  {!organizationsQuery.isLoading && !organizations.length ? (
                    <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                      No organizations yet.
                    </div>
                  ) : null}

                  <div className="grid gap-4">
                    {organizations.map((organization) => (
                      <button
                        key={organization.id}
                        type="button"
                        onClick={() => setSelectedOrganizationId(organization.id)}
                        className={cn(
                          "rounded-[1.5rem] border bg-slate-50 p-5 text-left transition",
                          selectedOrganizationId === organization.id
                            ? "border-sky-300 bg-sky-50/70 shadow-[0_0_0_1px_rgba(14,165,233,0.12)]"
                            : "border-slate-200/70 hover:border-slate-300 hover:bg-white",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-slate-950">{organization.name}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                              {organization.slug}
                            </p>
                          </div>
                          <Badge
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-medium",
                              organization.isActive
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                                : "bg-slate-200 text-slate-700 hover:bg-slate-200",
                            )}
                          >
                            {organization.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>

                        {organization.description ? (
                          <p className="mt-4 text-sm leading-6 text-slate-600">{organization.description}</p>
                        ) : (
                          <p className="mt-4 text-sm leading-6 text-slate-400">No description yet.</p>
                        )}

                        <div className="mt-4 flex flex-wrap gap-3 text-xs uppercase tracking-[0.16em] text-slate-500">
                          <span>{organization.adminCount} admins</span>
                          <span>{organization.memberCount} members</span>
                          <span>Updated {formatDateTime(organization.updatedAt)}</span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {organization.administrators.length ? (
                            organization.administrators.map((administrator) => (
                              <Badge
                                key={`${organization.id}-${administrator.userId}`}
                                variant="outline"
                                className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-700"
                              >
                                {administrator.displayName}
                              </Badge>
                            ))
                          ) : (
                            <Badge
                              variant="outline"
                              className="rounded-full border-dashed border-slate-300 bg-white px-3 py-1 text-slate-500"
                            >
                              No admins assigned yet
                            </Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
                    <UserCog className="h-5 w-5 text-sky-700" />
                    Edit organization
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5">
                  {!selectedOrganization ? (
                    <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                      Select an organization to edit name, state and scoped admin/member access.
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                          <label className="text-sm font-medium text-slate-700" htmlFor="edit-organization-name">
                            Name
                          </label>
                          <Input
                            id="edit-organization-name"
                            value={editOrganizationForm.name}
                            onChange={(event) =>
                              setEditOrganizationForm((currentForm) => ({
                                ...currentForm,
                                name: event.target.value,
                              }))
                            }
                            className="rounded-xl border-slate-200"
                          />
                        </div>

                        <div className="grid gap-2">
                          <label className="text-sm font-medium text-slate-700" htmlFor="edit-organization-slug">
                            Slug
                          </label>
                          <Input
                            id="edit-organization-slug"
                            value={editOrganizationForm.slug}
                            onChange={(event) =>
                              setEditOrganizationForm((currentForm) => ({
                                ...currentForm,
                                slug: event.target.value,
                              }))
                            }
                            className="rounded-xl border-slate-200"
                          />
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-700" htmlFor="edit-organization-description">
                          Description
                        </label>
                        <Textarea
                          id="edit-organization-description"
                          value={editOrganizationForm.description}
                          onChange={(event) =>
                            setEditOrganizationForm((currentForm) => ({
                              ...currentForm,
                              description: event.target.value,
                            }))
                          }
                          className="min-h-[120px] rounded-2xl border-slate-200"
                        />
                      </div>

                      <div className="flex h-11 items-center justify-between rounded-xl border border-slate-200 bg-white px-4">
                        <div>
                          <p className="text-sm font-medium text-slate-700">Organization active</p>
                        </div>
                        <Switch
                          checked={editOrganizationForm.isActive}
                          disabled={updateOrganizationMutation.isPending}
                          onCheckedChange={(checked) =>
                            setEditOrganizationForm((currentForm) => ({
                              ...currentForm,
                              isActive: checked,
                            }))
                          }
                        />
                      </div>

                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-700">Scoped access</label>
                        {allUsersQuery.isLoading ? (
                          <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50 p-4 text-sm text-slate-500">
                            Loading users...
                          </div>
                        ) : (
                          <OrganizationUserAccessEditor
                            users={organizationCandidates}
                            selection={organizationUserSelection}
                            onSelectionChange={setOrganizationUserSelection}
                            disabled={updateOrganizationMutation.isPending}
                          />
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-slate-500">
                          Updated {formatDateTime(selectedOrganization.updatedAt)}
                        </div>
                        <Button
                          type="button"
                          className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                          onClick={() => updateOrganizationMutation.mutate()}
                          disabled={updateOrganizationMutation.isPending}
                        >
                          {updateOrganizationMutation.isPending ? "Saving..." : "Save organization"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[0.88fr,1.12fr]">
            <div className="space-y-6">
              <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
                    <Users className="h-5 w-5 text-sky-700" />
                    Create user
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="create-username">
                        Username
                      </label>
                      <Input
                        id="create-username"
                        value={createUserForm.username}
                        onChange={(event) =>
                          setCreateUserForm((currentForm) => ({ ...currentForm, username: event.target.value }))
                        }
                        placeholder="m.rossi"
                        className="rounded-xl border-slate-200"
                      />
                    </div>

                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="create-password">
                        Password
                      </label>
                      <Input
                        id="create-password"
                        type="password"
                        value={createUserForm.password}
                        onChange={(event) =>
                          setCreateUserForm((currentForm) => ({ ...currentForm, password: event.target.value }))
                        }
                        placeholder="Optional unless login is enabled now"
                        className="rounded-xl border-slate-200"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="create-role">
                        Platform role
                      </label>
                      <select
                        id="create-role"
                        value={createUserForm.role}
                        onChange={(event) =>
                          setCreateUserForm((currentForm) => ({
                            ...currentForm,
                            role: event.target.value as "admin" | "user",
                          }))
                        }
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>

                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="create-email">
                        Email
                      </label>
                      <Input
                        id="create-email"
                        value={createUserForm.email}
                        onChange={(event) =>
                          setCreateUserForm((currentForm) => ({ ...currentForm, email: event.target.value }))
                        }
                        placeholder="name@company.com"
                        className="rounded-xl border-slate-200"
                      />
                    </div>
                  </div>

                  <div className="flex h-11 items-center justify-between rounded-xl border border-slate-200 bg-white px-4">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Login enabled</p>
                      <p className="text-xs text-slate-500">Turn this off to create a profile without immediate access.</p>
                    </div>
                    <Switch
                      checked={createUserForm.loginEnabled}
                      onCheckedChange={(checked) =>
                        setCreateUserForm((currentForm) => ({
                          ...currentForm,
                          loginEnabled: checked,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="create-first-name">
                        First name
                      </label>
                      <Input
                        id="create-first-name"
                        value={createUserForm.firstName}
                        onChange={(event) =>
                          setCreateUserForm((currentForm) => ({ ...currentForm, firstName: event.target.value }))
                        }
                        className="rounded-xl border-slate-200"
                      />
                    </div>

                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="create-last-name">
                        Last name
                      </label>
                      <Input
                        id="create-last-name"
                        value={createUserForm.lastName}
                        onChange={(event) =>
                          setCreateUserForm((currentForm) => ({ ...currentForm, lastName: event.target.value }))
                        }
                        className="rounded-xl border-slate-200"
                      />
                    </div>

                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="create-display-name">
                        Display name
                      </label>
                      <Input
                        id="create-display-name"
                        value={createUserForm.displayName}
                        onChange={(event) =>
                          setCreateUserForm((currentForm) => ({ ...currentForm, displayName: event.target.value }))
                        }
                        placeholder="Optional override"
                        className="rounded-xl border-slate-200"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="create-department">
                        Department
                      </label>
                      <Input
                        id="create-department"
                        value={createUserForm.department}
                        onChange={(event) =>
                          setCreateUserForm((currentForm) => ({ ...currentForm, department: event.target.value }))
                        }
                        className="rounded-xl border-slate-200"
                      />
                    </div>

                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="create-job-title">
                        Job title
                      </label>
                      <Input
                        id="create-job-title"
                        value={createUserForm.jobTitle}
                        onChange={(event) =>
                          setCreateUserForm((currentForm) => ({ ...currentForm, jobTitle: event.target.value }))
                        }
                        className="rounded-xl border-slate-200"
                      />
                    </div>

                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="create-location">
                        Location
                      </label>
                      <Input
                        id="create-location"
                        value={createUserForm.location}
                        onChange={(event) =>
                          setCreateUserForm((currentForm) => ({ ...currentForm, location: event.target.value }))
                        }
                        className="rounded-xl border-slate-200"
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700">Organization access</label>
                    {organizations.length ? (
                      <UserMembershipEditor
                        organizations={organizations}
                        selection={createMembershipSelection}
                        onSelectionChange={setCreateMembershipSelection}
                        disabled={createUserMutation.isPending}
                      />
                    ) : (
                      <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                        Create the first organization before assigning user memberships.
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="create-notes">
                      Notes
                    </label>
                    <Textarea
                      id="create-notes"
                      value={createUserForm.notes}
                      onChange={(event) =>
                        setCreateUserForm((currentForm) => ({ ...currentForm, notes: event.target.value }))
                      }
                      className="min-h-[120px] rounded-2xl border-slate-200"
                    />
                  </div>

                  <Button
                    type="button"
                    className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                    onClick={() => createUserMutation.mutate()}
                    disabled={createUserMutation.isPending || !organizations.length}
                  >
                    {createUserMutation.isPending ? "Creating..." : "Create user"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
                    <UserCog className="h-5 w-5 text-sky-700" />
                    User directory
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr,0.8fr,0.9fr]">
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search by username or full name"
                      className="rounded-xl border-slate-200"
                    />

                    <select
                      value={organizationFilter}
                      onChange={(event) => setOrganizationFilter(event.target.value)}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300"
                    >
                      <option value="all">All organizations</option>
                      {organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={roleFilter}
                      onChange={(event) =>
                        setRoleFilter(event.target.value as "all" | "super_admin" | "admin" | "user")
                      }
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300"
                    >
                      <option value="all">All roles</option>
                      <option value="super_admin">Super-admin</option>
                      <option value="admin">Admin</option>
                      <option value="user">User</option>
                    </select>

                    <select
                      value={activeFilter}
                      onChange={(event) => setActiveFilter(event.target.value as "all" | "active" | "inactive")}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300"
                    >
                      <option value="all">Active + inactive</option>
                      <option value="active">Active only</option>
                      <option value="inactive">Inactive only</option>
                    </select>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[0.86fr,1.14fr]">
                    <Card className="rounded-[1.75rem] border-slate-200/80 bg-slate-50/90 shadow-none">
                      <CardContent className="p-0">
                        <ScrollArea className="h-[620px] rounded-[1.75rem]">
                          <div className="grid gap-3 p-4">
                            {usersQuery.isLoading ? (
                              <div className="rounded-[1.25rem] border border-slate-200/70 bg-white p-5 text-sm text-slate-600">
                                <LoaderCircle className="mb-3 h-5 w-5 animate-spin text-sky-700" />
                                Loading users...
                              </div>
                            ) : null}

                            {!usersQuery.isLoading && !users.length ? (
                              <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                                No users match the current filters.
                              </div>
                            ) : null}

                            {users.map((user) => (
                              <button
                                key={user.id}
                                type="button"
                                onClick={() => setSelectedUserId(user.id)}
                                className={cn(
                                  "rounded-[1.25rem] border p-4 text-left transition-colors",
                                  user.id === selectedUser?.id
                                    ? "border-sky-200 bg-sky-50 shadow-sm"
                                    : "border-slate-200/70 bg-white hover:bg-slate-50",
                                )}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold text-slate-950">{user.profile.displayName ?? user.fullName}</p>
                                    <p className="mt-1 text-sm text-slate-600">{user.username}</p>
                                    <p className="mt-1 text-xs text-slate-500">{user.profile.email ?? "No email yet"}</p>
                                  </div>
                                  <Badge
                                    className={cn(
                                      "rounded-full px-3 py-1 text-xs font-medium",
                                      user.role === "super_admin"
                                        ? "bg-violet-100 text-violet-800 hover:bg-violet-100"
                                        : user.role === "admin"
                                          ? "bg-sky-100 text-sky-800 hover:bg-sky-100"
                                          : "bg-slate-200 text-slate-700 hover:bg-slate-200",
                                    )}
                                  >
                                    {user.role}
                                  </Badge>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Badge
                                    variant="outline"
                                    className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600"
                                  >
                                    {user.isActive ? "active" : "inactive"}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600"
                                  >
                                    {user.memberships.length} memberships
                                  </Badge>
                                </div>
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>

                    <Card className="rounded-[1.75rem] border-slate-200/80 bg-slate-50/90 shadow-none">
                      <CardContent className="p-5">
                        {!selectedUser ? (
                          <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                            Pick a user to edit profile details, organization memberships and activation status.
                          </div>
                        ) : (
                          <div className="grid gap-5">
                            <div className="flex flex-wrap items-start justify-between gap-3 rounded-[1.4rem] border border-slate-200/70 bg-white p-5">
                              <div>
                                <p className="text-lg font-semibold text-slate-950">
                                  {selectedUser.profile.displayName ?? selectedUser.fullName}
                                </p>
                                <p className="mt-1 text-sm text-slate-600">{selectedUser.username}</p>
                                <p className="mt-1 text-sm text-slate-500">
                                  Last login {formatDateTime(selectedUser.lastLoginAt)}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge
                                  className={cn(
                                    "rounded-full px-3 py-1 text-xs font-medium",
                                    selectedUser.role === "super_admin"
                                      ? "bg-violet-100 text-violet-800 hover:bg-violet-100"
                                      : selectedUser.role === "admin"
                                        ? "bg-sky-100 text-sky-800 hover:bg-sky-100"
                                        : "bg-slate-200 text-slate-700 hover:bg-slate-200",
                                  )}
                                >
                                  {selectedUser.role}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600"
                                >
                                  {selectedUser.isActive ? "active" : "inactive"}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600"
                                >
                                  {selectedUser.loginEnabled ? "login enabled" : "login disabled"}
                                </Badge>
                                {selectedUser.mustChangePassword ? (
                                  <Badge className="rounded-full bg-amber-100 px-3 py-1 text-amber-800 hover:bg-amber-100">
                                    password setup required
                                  </Badge>
                                ) : null}
                              </div>
                            </div>

                            {issuedAccessState && issuedAccessState.userId === selectedUser.id ? (
                              <div className="rounded-[1.35rem] border border-amber-200 bg-amber-50/80 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-amber-950">Temporary password issued</p>
                                    <p className="mt-1 text-sm text-amber-800">
                                      Share this password securely with {issuedAccessState.username}. The user will be
                                      forced to change it on first login.
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-xl border-amber-200 bg-white text-amber-900 hover:bg-amber-100"
                                    onClick={async () => {
                                      await navigator.clipboard.writeText(
                                        issuedAccessState.credentials.temporaryPassword,
                                      );
                                      toast.success("Temporary password copied.");
                                    }}
                                  >
                                    <Copy className="mr-2 h-4 w-4" />
                                    Copy password
                                  </Button>
                                </div>
                                <div className="mt-3 rounded-xl border border-amber-200 bg-white px-4 py-3 font-mono text-sm text-slate-900">
                                  {issuedAccessState.credentials.temporaryPassword}
                                </div>
                              </div>
                            ) : null}

                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-700" htmlFor="edit-username">
                                  Username
                                </label>
                                <Input
                                  id="edit-username"
                                  value={editUserForm.username}
                                  onChange={(event) =>
                                    setEditUserForm((currentForm) => ({
                                      ...currentForm,
                                      username: event.target.value,
                                    }))
                                  }
                                  className="rounded-xl border-slate-200"
                                />
                              </div>

                              <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-700" htmlFor="edit-password">
                                  New password
                                </label>
                                <Input
                                  id="edit-password"
                                  type="password"
                                  value={editUserForm.password}
                                  onChange={(event) =>
                                    setEditUserForm((currentForm) => ({
                                      ...currentForm,
                                      password: event.target.value,
                                    }))
                                  }
                                  placeholder="Leave empty to keep current password"
                                  className="rounded-xl border-slate-200"
                                />
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-700" htmlFor="edit-role">
                                  Platform role
                                </label>
                                <select
                                  id="edit-role"
                                  value={selectedUser.role === "super_admin" ? "super_admin" : editUserForm.role}
                                  onChange={(event) =>
                                    setEditUserForm((currentForm) => ({
                                      ...currentForm,
                                      role: event.target.value as "admin" | "user",
                                    }))
                                  }
                                  disabled={selectedUser.role === "super_admin"}
                                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300 disabled:bg-slate-100"
                                >
                                  {selectedUser.role === "super_admin" ? (
                                    <option value="super_admin">Super-admin</option>
                                  ) : null}
                                  <option value="user">User</option>
                                  <option value="admin">Admin</option>
                                </select>
                              </div>

                              <div className="flex items-end">
                                <div className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4">
                                  <div>
                                    <p className="text-sm font-medium text-slate-700">Active user</p>
                                  </div>
                                  <Switch
                                    checked={selectedUser.role === "super_admin" ? true : editUserForm.isActive}
                                    disabled={selectedUser.role === "super_admin"}
                                    onCheckedChange={(checked) =>
                                      setEditUserForm((currentForm) => ({
                                        ...currentForm,
                                        isActive: checked,
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                              <div className="flex h-14 items-center justify-between rounded-xl border border-slate-200 bg-white px-4">
                                <div>
                                  <p className="text-sm font-medium text-slate-700">Login enabled</p>
                                  <p className="text-xs text-slate-500">
                                    Disable access without removing the profile or memberships.
                                  </p>
                                </div>
                                <Switch
                                  checked={selectedUser.role === "super_admin" ? true : editUserForm.loginEnabled}
                                  disabled={selectedUser.role === "super_admin"}
                                  onCheckedChange={(checked) =>
                                    setEditUserForm((currentForm) => ({
                                      ...currentForm,
                                      loginEnabled: checked,
                                    }))
                                  }
                                />
                              </div>

                              <Button
                                type="button"
                                variant="outline"
                                className="h-14 rounded-xl border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                disabled={selectedUser.role === "super_admin" || issueAccessMutation.isPending}
                                onClick={() => issueAccessMutation.mutate()}
                              >
                                <KeyRound className="mr-2 h-4 w-4" />
                                {issueAccessMutation.isPending
                                  ? "Issuing..."
                                  : selectedUser.loginEnabled
                                    ? "Reset access"
                                    : "Issue access"}
                              </Button>
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                              <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-700" htmlFor="edit-first-name">
                                  First name
                                </label>
                                <Input
                                  id="edit-first-name"
                                  value={editUserForm.firstName}
                                  onChange={(event) =>
                                    setEditUserForm((currentForm) => ({
                                      ...currentForm,
                                      firstName: event.target.value,
                                    }))
                                  }
                                  className="rounded-xl border-slate-200"
                                />
                              </div>

                              <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-700" htmlFor="edit-last-name">
                                  Last name
                                </label>
                                <Input
                                  id="edit-last-name"
                                  value={editUserForm.lastName}
                                  onChange={(event) =>
                                    setEditUserForm((currentForm) => ({
                                      ...currentForm,
                                      lastName: event.target.value,
                                    }))
                                  }
                                  className="rounded-xl border-slate-200"
                                />
                              </div>

                              <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-700" htmlFor="edit-display-name">
                                  Display name
                                </label>
                                <Input
                                  id="edit-display-name"
                                  value={editUserForm.displayName}
                                  onChange={(event) =>
                                    setEditUserForm((currentForm) => ({
                                      ...currentForm,
                                      displayName: event.target.value,
                                    }))
                                  }
                                  className="rounded-xl border-slate-200"
                                />
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                              <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-700" htmlFor="edit-email">
                                  Email
                                </label>
                                <Input
                                  id="edit-email"
                                  value={editUserForm.email}
                                  onChange={(event) =>
                                    setEditUserForm((currentForm) => ({
                                      ...currentForm,
                                      email: event.target.value,
                                    }))
                                  }
                                  className="rounded-xl border-slate-200"
                                />
                              </div>

                              <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-700" htmlFor="edit-department">
                                  Department
                                </label>
                                <Input
                                  id="edit-department"
                                  value={editUserForm.department}
                                  onChange={(event) =>
                                    setEditUserForm((currentForm) => ({
                                      ...currentForm,
                                      department: event.target.value,
                                    }))
                                  }
                                  className="rounded-xl border-slate-200"
                                />
                              </div>

                              <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-700" htmlFor="edit-job-title">
                                  Job title
                                </label>
                                <Input
                                  id="edit-job-title"
                                  value={editUserForm.jobTitle}
                                  onChange={(event) =>
                                    setEditUserForm((currentForm) => ({
                                      ...currentForm,
                                      jobTitle: event.target.value,
                                    }))
                                  }
                                  className="rounded-xl border-slate-200"
                                />
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                              <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-700" htmlFor="edit-location">
                                  Location
                                </label>
                                <Input
                                  id="edit-location"
                                  value={editUserForm.location}
                                  onChange={(event) =>
                                    setEditUserForm((currentForm) => ({
                                      ...currentForm,
                                      location: event.target.value,
                                    }))
                                  }
                                  className="rounded-xl border-slate-200"
                                />
                              </div>

                              <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-700" htmlFor="edit-phone">
                                  Phone
                                </label>
                                <Input
                                  id="edit-phone"
                                  value={editUserForm.phone}
                                  onChange={(event) =>
                                    setEditUserForm((currentForm) => ({
                                      ...currentForm,
                                      phone: event.target.value,
                                    }))
                                  }
                                  className="rounded-xl border-slate-200"
                                />
                              </div>

                              <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-700" htmlFor="edit-timezone">
                                  Timezone
                                </label>
                                <Input
                                  id="edit-timezone"
                                  value={editUserForm.timezone}
                                  onChange={(event) =>
                                    setEditUserForm((currentForm) => ({
                                      ...currentForm,
                                      timezone: event.target.value,
                                    }))
                                  }
                                  className="rounded-xl border-slate-200"
                                />
                              </div>
                            </div>

                            <div className="grid gap-4">
                              <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-700">Organization access</label>
                                {selectedUser.role === "super_admin" ? (
                                  <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                                    Super-admin access is global. Organization memberships are not edited here.
                                  </div>
                                ) : (
                                  <UserMembershipEditor
                                    organizations={organizations}
                                    selection={editMembershipSelection}
                                    onSelectionChange={setEditMembershipSelection}
                                    disabled={updateUserMutation.isPending}
                                  />
                                )}
                              </div>

                              <div className="grid gap-2">
                                <label className="text-sm font-medium text-slate-700" htmlFor="edit-notes">
                                  Notes
                                </label>
                                <Textarea
                                  id="edit-notes"
                                  value={editUserForm.notes}
                                  onChange={(event) =>
                                    setEditUserForm((currentForm) => ({
                                      ...currentForm,
                                      notes: event.target.value,
                                    }))
                                  }
                                  className="min-h-[120px] rounded-2xl border-slate-200"
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="text-sm text-slate-500">
                                Created {formatDateTime(selectedUser.createdAt)}
                              </div>
                              <Button
                                type="button"
                                className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                                onClick={() => updateUserMutation.mutate()}
                                disabled={updateUserMutation.isPending}
                              >
                                {updateUserMutation.isPending ? "Saving..." : "Save user"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
