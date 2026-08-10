import { api, getToken } from "@/lib/api";
import type {
    CandidateProfile,
    ProfileEducation,
    ProfileExperience,
    ProfileFactProposal,
    ProfileInfoItem,
    ProfileLink,
    ProfileProject,
    ProfileSkill,
} from "@appszone/shared";

/** People API surface — all routes live under /admin/people. */
const BASE = "/admin/people";

export interface PersonRow {
    id: string;
    name: string;
    headline: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
    _count: {
        projectItems: number;
        experienceItems: number;
        skillItems: number;
        infoItems: number;
        documents: number;
        applications: number;
    };
}

export interface PeoplePage {
    data: PersonRow[];
    total: number;
}

export interface PersonDetail extends CandidateProfile {
    projectItems: ProfileProject[];
    experienceItems: ProfileExperience[];
    educationItems: ProfileEducation[];
    skillItems: ProfileSkill[];
    linkItems: ProfileLink[];
    pendingFacts: number;
    _count: { infoItems: number; documents: number; applications: number };
}

export interface InfoItemRow extends Omit<ProfileInfoItem, "rawText"> {
    _count: { proposals: number };
}

export interface InfoItemsPage {
    data: InfoItemRow[];
    total: number;
}

export interface FactProposalRow extends ProfileFactProposal {
    infoItem: { id: string; title: string | null; kind: string; fileName: string | null } | null;
}

export interface ExtractionResult {
    itemId: string;
    status: string;
    chars: number;
    pages?: number;
    message?: string;
}

function query(params: Record<string, unknown>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
    }
    const qs = search.toString();
    return qs ? `?${qs}` : "";
}

export const peopleApi = {
    /* People */
    list: (params: { search?: string; limit?: number; offset?: number } = {}) =>
        api<PeoplePage>(`${BASE}${query(params)}`),
    get: (id: string) => api<PersonDetail>(`${BASE}/${id}`),
    create: (body: { name: string; headline?: string; email?: string; phone?: string; location?: string }) =>
        api<CandidateProfile>(BASE, { method: "POST", body }),
    update: (id: string, body: Partial<CandidateProfile>) =>
        api<CandidateProfile>(`${BASE}/${id}`, { method: "PUT", body }),
    setDefault: (id: string) => api<CandidateProfile>(`${BASE}/${id}/default`, { method: "PATCH", body: {} }),
    remove: (id: string) =>
        api<{ id: string; removedApplications: number; removedDocuments: number }>(`${BASE}/${id}`, {
            method: "DELETE",
        }),

    /* Projects */
    addProject: (id: string, body: Partial<ProfileProject>) =>
        api<ProfileProject>(`${BASE}/${id}/projects`, { method: "POST", body }),
    updateProject: (projectId: string, body: Partial<ProfileProject>) =>
        api<ProfileProject>(`${BASE}/projects/${projectId}`, { method: "PUT", body }),
    removeProject: (projectId: string) =>
        api<{ id: string }>(`${BASE}/projects/${projectId}`, { method: "DELETE" }),

    /* Experience */
    addExperience: (id: string, body: Partial<ProfileExperience>) =>
        api<ProfileExperience>(`${BASE}/${id}/experience`, { method: "POST", body }),
    updateExperience: (experienceId: string, body: Partial<ProfileExperience>) =>
        api<ProfileExperience>(`${BASE}/experience/${experienceId}`, { method: "PUT", body }),
    removeExperience: (experienceId: string) =>
        api<{ id: string }>(`${BASE}/experience/${experienceId}`, { method: "DELETE" }),

    /* Education */
    addEducation: (id: string, body: Partial<ProfileEducation>) =>
        api<ProfileEducation>(`${BASE}/${id}/education`, { method: "POST", body }),
    updateEducation: (educationId: string, body: Partial<ProfileEducation>) =>
        api<ProfileEducation>(`${BASE}/education/${educationId}`, { method: "PUT", body }),
    removeEducation: (educationId: string) =>
        api<{ id: string }>(`${BASE}/education/${educationId}`, { method: "DELETE" }),

    /* Skills */
    addSkills: (id: string, skills: Array<Partial<ProfileSkill>>) =>
        api<{ added: number; submitted: number }>(`${BASE}/${id}/skills`, { method: "POST", body: { skills } }),
    updateSkill: (skillId: string, body: Partial<ProfileSkill>) =>
        api<ProfileSkill>(`${BASE}/skills/${skillId}`, { method: "PUT", body }),
    removeSkill: (skillId: string) => api<{ id: string }>(`${BASE}/skills/${skillId}`, { method: "DELETE" }),

    /* Links */
    addLink: (id: string, body: Partial<ProfileLink>) =>
        api<ProfileLink>(`${BASE}/${id}/links`, { method: "POST", body }),
    updateLink: (linkId: string, body: Partial<ProfileLink>) =>
        api<ProfileLink>(`${BASE}/links/${linkId}`, { method: "PUT", body }),
    removeLink: (linkId: string) => api<{ id: string }>(`${BASE}/links/${linkId}`, { method: "DELETE" }),

    reorder: (id: string, collection: string, ids: string[]) =>
        api<{ reordered: number }>(`${BASE}/${id}/reorder/${collection}`, { method: "PATCH", body: { ids } }),

    /* Info items */
    listInfoItems: (id: string, params: { kind?: string; status?: string } = {}) =>
        api<InfoItemsPage>(`${BASE}/${id}/info-items${query(params)}`),
    getInfoItem: (itemId: string) =>
        api<ProfileInfoItem & { proposals: ProfileFactProposal[] }>(`${BASE}/info-items/${itemId}`),
    downloadInfoItem: (itemId: string) => api<{ url: string }>(`${BASE}/info-items/${itemId}/download`),
    addNote: (id: string, body: { title?: string; text: string }) =>
        api<ProfileInfoItem>(`${BASE}/${id}/info-items/note`, { method: "POST", body }),
    removeInfoItem: (itemId: string) => api<{ id: string }>(`${BASE}/info-items/${itemId}`, { method: "DELETE" }),
    extractInfoItem: (itemId: string) =>
        api<ExtractionResult>(`${BASE}/info-items/${itemId}/extract`, { method: "POST", body: {} }),
    extractPending: (id: string) =>
        api<ExtractionResult[]>(`${BASE}/${id}/info-items/extract-pending`, { method: "POST", body: {} }),

    /* Facts */
    listFacts: (id: string, status = "pending") => api<{ data: FactProposalRow[]; total: number }>(
        `${BASE}/${id}/facts${query({ status })}`
    ),
    proposeFacts: (itemId: string) =>
        api<{ proposed: number; skippedDuplicates: number; discarded: number; model: string }>(
            `${BASE}/info-items/${itemId}/propose-facts`,
            { method: "POST", body: {} }
        ),
    acceptFact: (factId: string) => api<ProfileFactProposal>(`${BASE}/facts/${factId}/accept`, { method: "POST", body: {} }),
    rejectFact: (factId: string) => api<ProfileFactProposal>(`${BASE}/facts/${factId}/reject`, { method: "POST", body: {} }),
    rejectAllFacts: (id: string) => api<{ rejected: number }>(`${BASE}/${id}/facts/reject-all`, { method: "POST", body: {} }),
};

/**
 * File upload needs multipart, which the JSON `api()` helper cannot express —
 * setting Content-Type manually would drop the boundary and break the parse.
 */
export async function uploadInfoItem(
    profileId: string,
    file: File,
    title?: string
): Promise<ProfileInfoItem> {
    const base = import.meta.env.VITE_API_BASE_URL || "/api/v1";
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);

    const res = await fetch(`${base}${BASE}/${profileId}/info-items/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        body: form,
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.message ?? `Upload failed (${res.status})`);
    return payload.data as ProfileInfoItem;
}
