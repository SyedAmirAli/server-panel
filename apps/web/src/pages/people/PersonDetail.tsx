import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    Briefcase,
    GraduationCap,
    Link2,
    Plus,
    Save,
    Send,
    Sparkles,
    Trash2,
    User,
    Wrench,
} from "lucide-react";
import type { ProfileEducation, ProfileExperience, ProfileLink, ProfileProject, ProfileSkill } from "@appszone/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { TagInput } from "@/components/people/TagInput";
import { AttachmentsPanel } from "@/components/people/AttachmentsPanel";
import { ApplicationHistory } from "@/components/people/ApplicationHistory";
import { peopleApi, type PersonDetail as PersonDetailType } from "@/lib/people";
import { toastError, toastSuccess } from "@/lib/toast";

type Section = "details" | "projects" | "experience" | "education" | "skills" | "links" | "documents" | "applications";

const SECTIONS: Array<{ key: Section; label: string; icon: typeof User }> = [
    { key: "details", label: "Details", icon: User },
    { key: "projects", label: "Projects", icon: Briefcase },
    { key: "experience", label: "Experience", icon: Briefcase },
    { key: "education", label: "Education", icon: GraduationCap },
    { key: "skills", label: "Skills", icon: Wrench },
    { key: "links", label: "Links", icon: Link2 },
    { key: "documents", label: "Documents & facts", icon: Sparkles },
    { key: "applications", label: "Applications", icon: Send },
];

export function PersonDetail() {
    const { id = "" } = useParams();
    const navigate = useNavigate();

    const [person, setPerson] = useState<PersonDetailType | null>(null);
    const [loading, setLoading] = useState(true);
    const [section, setSection] = useState<Section>("details");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setPerson(await peopleApi.get(id));
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not load person");
            navigate("/people");
        } finally {
            setLoading(false);
        }
    }, [id, navigate]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading && !person) {
        return (
            <div className="flex justify-center py-24">
                <Spinner />
            </div>
        );
    }
    if (!person) return null;

    return (
        <div>
            <PageHeader
                title={person.name}
                description={person.headline ?? "No headline yet"}
                breadcrumb={[{ label: "People" }, { label: person.name, active: true }]}
                onRefresh={() => void load()}
                refreshing={loading}
                actions={
                    <div className="flex items-center gap-2">
                        {person.isDefault && <Badge variant="info">Default candidate</Badge>}
                        {person.pendingFacts > 0 && (
                            <Badge variant="warning">{person.pendingFacts} facts to review</Badge>
                        )}
                    </div>
                }
            />

            <div className="mb-5 flex flex-wrap gap-1 border-b border-gray-200">
                {SECTIONS.map(({ key, label, icon: Icon }) => {
                    const count = countFor(person, key);
                    return (
                        <button
                            key={key}
                            onClick={() => setSection(key)}
                            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                                section === key
                                    ? "border-indigo-600 text-indigo-600"
                                    : "border-transparent text-gray-500 hover:text-gray-800"
                            }`}
                        >
                            <Icon size={14} />
                            {label}
                            {count !== null && <span className="text-xs text-gray-400">{count}</span>}
                        </button>
                    );
                })}
            </div>

            {section === "details" && <DetailsSection person={person} onSaved={load} />}
            {section === "projects" && <ProjectsSection person={person} onChanged={load} />}
            {section === "experience" && <ExperienceSection person={person} onChanged={load} />}
            {section === "education" && <EducationSection person={person} onChanged={load} />}
            {section === "skills" && <SkillsSection person={person} onChanged={load} />}
            {section === "links" && <LinksSection person={person} onChanged={load} />}
            {section === "documents" && <AttachmentsPanel profileId={person.id} onProfileChanged={load} />}
            {section === "applications" && <ApplicationHistory profileId={person.id} />}
        </div>
    );
}

function countFor(p: PersonDetailType, key: Section): number | null {
    switch (key) {
        case "projects":
            return p.projectItems.length;
        case "experience":
            return p.experienceItems.length;
        case "education":
            return p.educationItems.length;
        case "skills":
            return p.skillItems.length;
        case "links":
            return p.linkItems.length;
        case "documents":
            return p._count.infoItems;
        case "applications":
            return p._count.applications;
        default:
            return null;
    }
}

/* ─── details ────────────────────────────────────────────────── */

function DetailsSection({ person, onSaved }: { person: PersonDetailType; onSaved: () => Promise<void> }) {
    const [form, setForm] = useState({
        name: person.name,
        headline: person.headline ?? "",
        email: person.email ?? "",
        phone: person.phone ?? "",
        location: person.location ?? "",
        timezone: person.timezone ?? "",
        availability: person.availability ?? "",
        summary: person.summary ?? "",
        bio: person.bio ?? "",
    });
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            await peopleApi.update(person.id, form as never);
            toastSuccess("Profile saved");
            await onSaved();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not save");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name">
                    <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Headline">
                    <input className={input} value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
                </Field>
                <Field label="Email">
                    <input className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label="Phone">
                    <input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </Field>
                <Field label="Location">
                    <input className={input} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                </Field>
                <Field label="Timezone">
                    <input className={input} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
                </Field>
                <Field label="Availability" hint="Printed in the resume header when set">
                    <input className={input} value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} />
                </Field>
            </div>

            <Field label="Summary" hint="Appears in the resume">
                <textarea rows={4} className={input} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </Field>
            <Field label="Bio" hint="Context for the Studio chat — never printed verbatim into a resume">
                <textarea rows={3} className={input} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </Field>

            <div className="flex justify-end">
                <button onClick={() => void save()} disabled={saving} className={primaryBtn}>
                    <Save size={14} />
                    {saving ? "Saving…" : "Save details"}
                </button>
            </div>
        </Card>
    );
}

/* ─── projects ───────────────────────────────────────────────── */

const emptyProject = { name: "", description: "", role: "", period: "", stack: [] as string[], url: "", note: "" };

function ProjectsSection({ person, onChanged }: { person: PersonDetailType; onChanged: () => Promise<void> }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<ProfileProject | null>(null);
    const [form, setForm] = useState(emptyProject);
    const [saving, setSaving] = useState(false);
    const [confirm, setConfirm] = useState<ProfileProject | null>(null);

    function startNew() {
        setEditing(null);
        setForm(emptyProject);
        setOpen(true);
    }
    function startEdit(p: ProfileProject) {
        setEditing(p);
        setForm({
            name: p.name,
            description: p.description ?? "",
            role: p.role ?? "",
            period: p.period ?? "",
            stack: p.stack ?? [],
            url: p.url ?? "",
            note: p.note ?? "",
        });
        setOpen(true);
    }

    async function save() {
        if (!form.name.trim()) return;
        if (!form.stack.length) {
            toastError("Add at least one technology tag — tags are how a project gets matched to a job.");
            return;
        }
        setSaving(true);
        try {
            const body = { ...form, description: form.description || undefined, url: form.url || undefined };
            if (editing) await peopleApi.updateProject(editing.id, body as never);
            else await peopleApi.addProject(person.id, body as never);
            toastSuccess(editing ? "Project updated" : "Project added");
            setOpen(false);
            await onChanged();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not save project");
        } finally {
            setSaving(false);
        }
    }

    async function remove(p: ProfileProject) {
        try {
            await peopleApi.removeProject(p.id);
            toastSuccess("Project removed");
            setConfirm(null);
            await onChanged();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not remove project");
        }
    }

    return (
        <>
            <SectionHeader
                title="Projects"
                hint="Technology tags decide which projects surface for a given job — a Laravel role leads with Laravel work."
                onAdd={startNew}
                addLabel="Add project"
            />
            {person.projectItems.length === 0 ? (
                <EmptyCard text="No projects yet. Add them one at a time, each with the technologies it actually used." />
            ) : (
                <div className="space-y-2">
                    {person.projectItems.map((p) => (
                        <Card key={p.id}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-semibold text-gray-900">{p.name}</h3>
                                        {p.period && <span className="text-xs text-gray-400">{p.period}</span>}
                                        {!p.isActive && <Badge variant="neutral">Hidden</Badge>}
                                    </div>
                                    {p.description && <p className="mt-1 text-sm text-gray-600">{p.description}</p>}
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {(p.stack ?? []).map((t) => (
                                            <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <RowActions onEdit={() => startEdit(p)} onDelete={() => setConfirm(p)} />
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? "Edit project" : "Add project"}>
                <div className="space-y-3">
                    <Field label="Name" required>
                        <input autoFocus className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </Field>
                    <Field label="Description">
                        <textarea rows={3} className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </Field>
                    <Field label="Technologies" required hint="What this project actually used. This is the matching key.">
                        <TagInput value={form.stack} onChange={(stack) => setForm({ ...form, stack })} />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Your role">
                            <input className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
                        </Field>
                        <Field label="Period">
                            <input className={input} value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="2024 - now" />
                        </Field>
                    </div>
                    <Field label="URL">
                        <input className={input} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
                    </Field>
                    <Field label="Note" hint="Attribution as it really is — solo vs team. Keeps generated resumes honest.">
                        <input className={input} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                    </Field>
                    <ModalActions onCancel={() => setOpen(false)} onSave={() => void save()} saving={saving} />
                </div>
            </Modal>

            <ConfirmModal
                isOpen={confirm !== null}
                onClose={() => setConfirm(null)}
                onConfirm={() => confirm && void remove(confirm)}
                title={`Remove ${confirm?.name ?? ""}?`}
                message="This project will no longer be considered for any future resume."
                confirmLabel="Remove"
            />
        </>
    );
}

/* ─── experience ─────────────────────────────────────────────── */

const emptyExperience = {
    company: "",
    position: "",
    period: "",
    location: "",
    employmentType: "",
    points: [] as string[],
    stack: [] as string[],
};

function ExperienceSection({ person, onChanged }: { person: PersonDetailType; onChanged: () => Promise<void> }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<ProfileExperience | null>(null);
    const [form, setForm] = useState(emptyExperience);
    const [pointsText, setPointsText] = useState("");
    const [saving, setSaving] = useState(false);
    const [confirm, setConfirm] = useState<ProfileExperience | null>(null);

    function startNew() {
        setEditing(null);
        setForm(emptyExperience);
        setPointsText("");
        setOpen(true);
    }
    function startEdit(x: ProfileExperience) {
        setEditing(x);
        setForm({
            company: x.company,
            position: x.position,
            period: x.period,
            location: x.location ?? "",
            employmentType: x.employmentType ?? "",
            points: x.points ?? [],
            stack: x.stack ?? [],
        });
        setPointsText((x.points ?? []).join("\n"));
        setOpen(true);
    }

    async function save() {
        if (!form.company.trim() || !form.position.trim() || !form.period.trim()) {
            toastError("Company, position and period are required");
            return;
        }
        setSaving(true);
        try {
            const body = {
                ...form,
                points: pointsText.split("\n").map((l) => l.trim()).filter(Boolean),
            };
            if (editing) await peopleApi.updateExperience(editing.id, body as never);
            else await peopleApi.addExperience(person.id, body as never);
            toastSuccess(editing ? "Experience updated" : "Experience added");
            setOpen(false);
            await onChanged();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not save");
        } finally {
            setSaving(false);
        }
    }

    async function remove(x: ProfileExperience) {
        try {
            await peopleApi.removeExperience(x.id);
            toastSuccess("Experience removed");
            setConfirm(null);
            await onChanged();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not remove");
        }
    }

    return (
        <>
            <SectionHeader title="Experience" onAdd={startNew} addLabel="Add role" />
            {person.experienceItems.length === 0 ? (
                <EmptyCard text="No roles yet." />
            ) : (
                <div className="space-y-2">
                    {person.experienceItems.map((x) => (
                        <Card key={x.id}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-sm font-semibold text-gray-900">
                                            {x.position} · {x.company}
                                        </h3>
                                        <span className="text-xs text-gray-400">{x.period}</span>
                                        {x.employmentType && <Badge variant="neutral">{x.employmentType}</Badge>}
                                    </div>
                                    <ul className="mt-1.5 space-y-0.5">
                                        {(x.points ?? []).map((pt, i) => (
                                            <li key={i} className="text-sm text-gray-600">
                                                • {pt}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <RowActions onEdit={() => startEdit(x)} onDelete={() => setConfirm(x)} />
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? "Edit role" : "Add role"}>
                <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Company" required>
                            <input autoFocus className={input} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                        </Field>
                        <Field label="Position" required>
                            <input className={input} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
                        </Field>
                        <Field label="Period" required hint="Stored exactly as written">
                            <input className={input} value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="Jan 2024 - Present" />
                        </Field>
                        <Field label="Employment type" hint="Part-time stays part-time in every generated resume">
                            <input className={input} value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} placeholder="full-time / part-time / contract" />
                        </Field>
                    </div>
                    <Field label="Location">
                        <input className={input} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                    </Field>
                    <Field label="Bullet points" hint="One per line">
                        <textarea rows={5} className={input} value={pointsText} onChange={(e) => setPointsText(e.target.value)} />
                    </Field>
                    <Field label="Technologies">
                        <TagInput value={form.stack} onChange={(stack) => setForm({ ...form, stack })} />
                    </Field>
                    <ModalActions onCancel={() => setOpen(false)} onSave={() => void save()} saving={saving} />
                </div>
            </Modal>

            <ConfirmModal
                isOpen={confirm !== null}
                onClose={() => setConfirm(null)}
                onConfirm={() => confirm && void remove(confirm)}
                title="Remove this role?"
                message="It will no longer appear in generated resumes."
                confirmLabel="Remove"
            />
        </>
    );
}

/* ─── education ──────────────────────────────────────────────── */

const emptyEducation = { institution: "", degree: "", period: "", location: "", note: "" };

function EducationSection({ person, onChanged }: { person: PersonDetailType; onChanged: () => Promise<void> }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<ProfileEducation | null>(null);
    const [form, setForm] = useState(emptyEducation);
    const [saving, setSaving] = useState(false);
    const [confirm, setConfirm] = useState<ProfileEducation | null>(null);

    async function save() {
        if (!form.institution.trim() || !form.degree.trim() || !form.period.trim()) {
            toastError("Institution, degree and period are required");
            return;
        }
        setSaving(true);
        try {
            if (editing) await peopleApi.updateEducation(editing.id, form as never);
            else await peopleApi.addEducation(person.id, form as never);
            toastSuccess(editing ? "Education updated" : "Education added");
            setOpen(false);
            await onChanged();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not save");
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <SectionHeader
                title="Education"
                onAdd={() => {
                    setEditing(null);
                    setForm(emptyEducation);
                    setOpen(true);
                }}
                addLabel="Add education"
            />
            {person.educationItems.length === 0 ? (
                <EmptyCard text="No education entries yet." />
            ) : (
                <div className="space-y-2">
                    {person.educationItems.map((e) => (
                        <Card key={e.id}>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900">{e.degree}</h3>
                                    <p className="text-sm text-gray-600">
                                        {e.institution} · <span className="text-gray-400">{e.period}</span>
                                    </p>
                                </div>
                                <RowActions
                                    onEdit={() => {
                                        setEditing(e);
                                        setForm({
                                            institution: e.institution,
                                            degree: e.degree,
                                            period: e.period,
                                            location: e.location ?? "",
                                            note: e.note ?? "",
                                        });
                                        setOpen(true);
                                    }}
                                    onDelete={() => setConfirm(e)}
                                />
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? "Edit education" : "Add education"}>
                <div className="space-y-3">
                    <Field label="Institution" required>
                        <input autoFocus className={input} value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} />
                    </Field>
                    <Field label="Degree" required>
                        <input className={input} value={form.degree} onChange={(e) => setForm({ ...form, degree: e.target.value })} />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Period" required>
                            <input className={input} value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
                        </Field>
                        <Field label="Location">
                            <input className={input} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                        </Field>
                    </div>
                    <ModalActions onCancel={() => setOpen(false)} onSave={() => void save()} saving={saving} />
                </div>
            </Modal>

            <ConfirmModal
                isOpen={confirm !== null}
                onClose={() => setConfirm(null)}
                onConfirm={async () => {
                    if (!confirm) return;
                    await peopleApi.removeEducation(confirm.id);
                    toastSuccess("Education removed");
                    setConfirm(null);
                    await onChanged();
                }}
                title="Remove this entry?"
                message="It will no longer appear in generated resumes."
                confirmLabel="Remove"
            />
        </>
    );
}

/* ─── skills ─────────────────────────────────────────────────── */

function SkillsSection({ person, onChanged }: { person: PersonDetailType; onChanged: () => Promise<void> }) {
    const [bulk, setBulk] = useState("");
    const [category, setCategory] = useState("");
    const [saving, setSaving] = useState(false);

    async function add() {
        const names = bulk
            .split(/[,\n]/)
            .map((s) => s.trim())
            .filter(Boolean);
        if (!names.length) return;
        setSaving(true);
        try {
            const res = await peopleApi.addSkills(
                person.id,
                names.map((name) => ({ name, category: category || undefined }))
            );
            const skipped = res.submitted - res.added;
            toastSuccess(skipped ? `${res.added} added, ${skipped} already present` : `${res.added} added`);
            setBulk("");
            await onChanged();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not add skills");
        } finally {
            setSaving(false);
        }
    }

    async function remove(s: ProfileSkill) {
        await peopleApi.removeSkill(s.id);
        await onChanged();
    }

    return (
        <>
            <Card>
                <Field label="Add skills" hint="Comma or newline separated. Duplicates are skipped automatically.">
                    <textarea rows={2} className={input} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="TypeScript, NestJS, PostgreSQL" />
                </Field>
                <div className="flex items-end gap-2">
                    <Field label="Category (optional)">
                        <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
                            <option value="">—</option>
                            {["language", "framework", "database", "tooling", "cloud"].map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <button onClick={() => void add()} disabled={saving || !bulk.trim()} className={primaryBtn}>
                        <Plus size={14} />
                        Add
                    </button>
                </div>
            </Card>

            {person.skillItems.length === 0 ? (
                <EmptyCard text="No skills yet." />
            ) : (
                <Card>
                    <div className="flex flex-wrap gap-1.5">
                        {person.skillItems.map((s) => (
                            <span
                                key={s.id}
                                className="group inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                            >
                                {s.name}
                                {s.category && <span className="text-gray-400">{s.category}</span>}
                                <button onClick={() => void remove(s)} className="text-gray-300 hover:text-red-600">
                                    <Trash2 size={11} />
                                </button>
                            </span>
                        ))}
                    </div>
                </Card>
            )}
        </>
    );
}

/* ─── links ──────────────────────────────────────────────────── */

function LinksSection({ person, onChanged }: { person: PersonDetailType; onChanged: () => Promise<void> }) {
    const [label, setLabel] = useState("");
    const [url, setUrl] = useState("");
    const [saving, setSaving] = useState(false);

    async function add() {
        if (!label.trim() || !url.trim()) return;
        setSaving(true);
        try {
            await peopleApi.addLink(person.id, { label, url } as never);
            toastSuccess("Link added");
            setLabel("");
            setUrl("");
            await onChanged();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not add link");
        } finally {
            setSaving(false);
        }
    }

    async function remove(l: ProfileLink) {
        await peopleApi.removeLink(l.id);
        await onChanged();
    }

    return (
        <>
            <Card>
                <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
                    <Field label="Label">
                        <input className={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="LinkedIn" />
                    </Field>
                    <Field label="URL" hint="Must include https://">
                        <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://linkedin.com/in/…" />
                    </Field>
                    <button onClick={() => void add()} disabled={saving} className={primaryBtn}>
                        <Plus size={14} />
                        Add
                    </button>
                </div>
            </Card>

            {person.linkItems.length === 0 ? (
                <EmptyCard text="No links yet." />
            ) : (
                <Card>
                    <div className="space-y-2">
                        {person.linkItems.map((l) => (
                            <div key={l.id} className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <span className="text-sm font-medium text-gray-900">{l.label}</span>
                                    <Badge variant="neutral">{l.kind}</Badge>
                                    <div className="truncate text-xs text-gray-500">{l.url}</div>
                                </div>
                                <button onClick={() => void remove(l)} className="text-gray-300 hover:text-red-600">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </>
    );
}

/* ─── shared bits ────────────────────────────────────────────── */

const input =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";
const primaryBtn =
    "flex h-[38px] shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50";

export function Card({ children }: { children: React.ReactNode }) {
    return <div className="mb-3 space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">{children}</div>;
}

export function Field({
    label,
    hint,
    required,
    children,
}: {
    label: string;
    hint?: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">
                {label}
                {required && <span className="text-red-500"> *</span>}
            </span>
            {children}
            {hint && <span className="mt-1 block text-[11px] text-gray-400">{hint}</span>}
        </label>
    );
}

function SectionHeader({
    title,
    hint,
    onAdd,
    addLabel,
}: {
    title: string;
    hint?: string;
    onAdd: () => void;
    addLabel: string;
}) {
    return (
        <div className="mb-3 flex items-start justify-between gap-3">
            <div>
                <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
                {hint && <p className="text-xs text-gray-500">{hint}</p>}
            </div>
            <button onClick={onAdd} className={primaryBtn}>
                <Plus size={14} />
                {addLabel}
            </button>
        </div>
    );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
    return (
        <div className="flex shrink-0 items-center gap-1">
            <button onClick={onEdit} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <Save size={14} />
            </button>
            <button onClick={onDelete} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                <Trash2 size={14} />
            </button>
        </div>
    );
}

function ModalActions({ onCancel, onSave, saving }: { onCancel: () => void; onSave: () => void; saving: boolean }) {
    return (
        <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                Cancel
            </button>
            <button onClick={onSave} disabled={saving} className={primaryBtn}>
                {saving ? "Saving…" : "Save"}
            </button>
        </div>
    );
}

function EmptyCard({ text }: { text: string }) {
    return (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
            {text}
        </div>
    );
}
