import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, FileText, Paperclip, Pencil, Star, Trash2, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListPageCard, ListTableHead } from "@/components/ui/ListPageCard";
import { Modal } from "@/components/ui/Modal";
import { SearchBar } from "@/components/ui/SearchBar";
import { RowMenu, type RowMenuItem } from "@/components/ui/RowMenu";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { peopleApi, type PeoplePage, type PersonRow } from "@/lib/people";
import { toastError, toastSuccess } from "@/lib/toast";

export function PeopleList() {
    const navigate = useNavigate();

    const [search, setSearch] = useState("");
    const [result, setResult] = useState<PeoplePage | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ name: "", headline: "", email: "", location: "" });

    const [confirmDelete, setConfirmDelete] = useState<PersonRow | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setResult(await peopleApi.list({ search: search || undefined }));
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not load people");
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        // Debounced so typing a search does not fire a request per keystroke.
        const timer = setTimeout(() => void load(), 250);
        return () => clearTimeout(timer);
    }, [load]);

    async function handleCreate() {
        if (!form.name.trim()) return;
        setCreating(true);
        try {
            const person = await peopleApi.create({
                name: form.name.trim(),
                headline: form.headline.trim() || undefined,
                email: form.email.trim() || undefined,
                location: form.location.trim() || undefined,
            });
            toastSuccess("Person created");
            setCreateOpen(false);
            setForm({ name: "", headline: "", email: "", location: "" });
            navigate(`/people/${person.id}`);
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not create person");
        } finally {
            setCreating(false);
        }
    }

    async function handleSetDefault(person: PersonRow) {
        setBusyId(person.id);
        try {
            await peopleApi.setDefault(person.id);
            toastSuccess(`${person.name} is now the default candidate`);
            await load();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not set default");
        } finally {
            setBusyId(null);
        }
    }

    async function handleDelete(person: PersonRow) {
        setBusyId(person.id);
        try {
            const res = await peopleApi.remove(person.id);
            toastSuccess(
                res.removedApplications > 0
                    ? `Deleted — also removed ${res.removedApplications} application(s) and ${res.removedDocuments} document(s)`
                    : "Person deleted"
            );
            setConfirmDelete(null);
            await load();
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Could not delete person");
        } finally {
            setBusyId(null);
        }
    }

    function menuFor(person: PersonRow): RowMenuItem[] {
        return [
            { key: "edit", label: "Open profile", icon: Pencil, onClick: () => navigate(`/people/${person.id}`) },
            {
                key: "default",
                label: person.isDefault ? "Already the default" : "Set as default candidate",
                icon: Star,
                onClick: () => void handleSetDefault(person),
                disabled: person.isDefault,
                loading: busyId === person.id,
            },
            {
                key: "delete",
                label: "Delete person",
                icon: Trash2,
                tone: "danger",
                onClick: () => setConfirmDelete(person),
            },
        ];
    }

    const rows = result?.data ?? [];

    return (
        <div>
            <PageHeader
                title="People"
                description="Candidates the Studio builds resumes for. Projects and their technology tags decide which work surfaces for a given job."
                onRefresh={() => void load()}
                refreshing={loading}
                actions={
                    <button
                        onClick={() => setCreateOpen(true)}
                        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                    >
                        <UserPlus size={15} />
                        Add person
                    </button>
                }
            />

            <div className="mb-4">
                <SearchBar value={search} onChange={setSearch} placeholder="Search by name, headline or email…" />
            </div>

            <ListPageCard>
                {loading && !result ? (
                    <div className="flex justify-center py-16">
                        <Spinner />
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={Users}
                        title={search ? "No matching people" : "No people yet"}
                        description={
                            search
                                ? "Try a different search."
                                : "Add a candidate, then attach their projects, experience and supporting documents."
                        }
                    />
                ) : (
                    <table className="w-full">
                        <thead className="border-b border-gray-200 bg-gray-50">
                            <tr>
                                {/* Row menu leads the first column, next to the name. */}
                                <ListTableHead>Name</ListTableHead>
                                <ListTableHead>Contact</ListTableHead>
                                <ListTableHead>Content</ListTableHead>
                                <ListTableHead>Activity</ListTableHead>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.map((person) => (
                                <tr key={person.id} className="transition-colors hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <RowMenu items={menuFor(person)} align="left" />
                                            <div className="min-w-0">
                                                <button
                                                    onClick={() => navigate(`/people/${person.id}`)}
                                                    className="block truncate text-sm font-medium text-gray-900 hover:text-indigo-600"
                                                >
                                                    {person.name}
                                                </button>
                                                <div className="flex items-center gap-1.5">
                                                    {person.isDefault && (
                                                        <Badge variant="info">
                                                            <Star size={10} className="mr-0.5" />
                                                            Default
                                                        </Badge>
                                                    )}
                                                    {person.headline && (
                                                        <span className="truncate text-xs text-gray-500">
                                                            {person.headline}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="text-sm text-gray-700">{person.email ?? "—"}</div>
                                        <div className="text-xs text-gray-400">{person.location ?? ""}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                                            <span className="inline-flex items-center gap-1">
                                                <Briefcase size={12} className="text-gray-400" />
                                                {person._count.projectItems} projects
                                            </span>
                                            <span>·</span>
                                            <span>{person._count.experienceItems} roles</span>
                                            <span>·</span>
                                            <span>{person._count.skillItems} skills</span>
                                            <span>·</span>
                                            <span className="inline-flex items-center gap-1">
                                                <Paperclip size={12} className="text-gray-400" />
                                                {person._count.infoItems}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3 text-xs text-gray-500">
                                            <span className="inline-flex items-center gap-1">
                                                <FileText size={12} className="text-gray-400" />
                                                {person._count.documents} docs
                                            </span>
                                            <span>{person._count.applications} applications</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </ListPageCard>

            <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Add person">
                <div className="space-y-3">
                    <Field label="Full name" required>
                        <input
                            autoFocus
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className={inputClass}
                            placeholder="Syed Amir Ali"
                        />
                    </Field>
                    <Field label="Headline">
                        <input
                            value={form.headline}
                            onChange={(e) => setForm({ ...form, headline: e.target.value })}
                            className={inputClass}
                            placeholder="Full Stack Developer"
                        />
                    </Field>
                    <Field label="Email">
                        <input
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            className={inputClass}
                            placeholder="name@example.com"
                        />
                    </Field>
                    <Field label="Location">
                        <input
                            value={form.location}
                            onChange={(e) => setForm({ ...form, location: e.target.value })}
                            className={inputClass}
                            placeholder="Dhaka, Bangladesh"
                        />
                    </Field>
                    <p className="text-xs text-gray-500">
                        Projects, experience and documents are added on the profile page once this is created.
                    </p>
                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            onClick={() => setCreateOpen(false)}
                            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => void handleCreate()}
                            disabled={creating || !form.name.trim()}
                            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {creating ? "Creating…" : "Create"}
                        </button>
                    </div>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={confirmDelete !== null}
                onClose={() => setConfirmDelete(null)}
                onConfirm={() => confirmDelete && void handleDelete(confirmDelete)}
                title={`Delete ${confirmDelete?.name ?? ""}?`}
                message={
                    confirmDelete
                        ? `This removes their ${confirmDelete._count.projectItems} project(s), ${confirmDelete._count.experienceItems} role(s), ${confirmDelete._count.infoItems} attachment(s), ${confirmDelete._count.documents} generated document(s) and ${confirmDelete._count.applications} application(s). This cannot be undone.`
                        : ""
                }
                confirmLabel="Delete"
                tone="danger"
                busy={busyId === confirmDelete?.id}
            />
        </div>
    );
}

const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">
                {label}
                {required && <span className="text-red-500"> *</span>}
            </span>
            {children}
        </label>
    );
}
