import { NavLink, useNavigate, useParams } from "react-router-dom";
import { BookOpen, ExternalLink } from "lucide-react";
import { DOC_SECTIONS, findDocSection } from "@/lib/docs";
import { DocsMarkdown } from "@/components/ui/DocsMarkdown";

export function ApiDocs() {
    const { docId } = useParams<{ docId?: string }>();
    const navigate = useNavigate();
    const section = findDocSection(docId);

    return (
        <div className="flex min-h-0 flex-1 gap-6">
            <aside className="hidden w-56 shrink-0 lg:block">
                <div className="sticky top-0 space-y-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Guides</p>
                    {DOC_SECTIONS.map((doc) => (
                        <NavLink
                            key={doc.id}
                            to={doc.path}
                            end={doc.id === "overview"}
                            className={({ isActive }) =>
                                `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                    isActive
                                        ? "bg-indigo-50 text-indigo-700"
                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                }`
                            }
                        >
                            {doc.title}
                        </NavLink>
                    ))}
                    <div className="my-2 border-t border-slate-100" />
                    <a
                        href="/swagger"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                    >
                        <ExternalLink size={14} className="shrink-0 text-slate-400" />
                        OpenAPI / Swagger
                    </a>
                </div>
            </aside>

            <div className="min-w-0 flex-1">
                <div className="mb-4 flex items-start gap-3 lg:hidden">
                    <BookOpen size={20} className="mt-1 shrink-0 text-indigo-500" />
                    <div className="min-w-0">
                        <label className="sr-only" htmlFor="docs-mobile-nav">
                            Documentation section
                        </label>
                        <select
                            id="docs-mobile-nav"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm"
                            value={section.id}
                            onChange={(e) => {
                                const next = DOC_SECTIONS.find((d) => d.id === e.target.value);
                                if (next) navigate(next.path);
                            }}
                        >
                            {DOC_SECTIONS.map((doc) => (
                                <option key={doc.id} value={doc.id}>
                                    {doc.title}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                    {section.id !== "overview" && (
                        <p className="mb-6 text-sm leading-relaxed text-slate-500">{section.description}</p>
                    )}
                    <DocsMarkdown content={section.content} />
                </div>

                <p className="mt-4 text-center text-xs text-slate-400 lg:text-left">
                    Interactive API reference:{" "}
                    <a href="/swagger" className="font-medium text-indigo-600 hover:text-indigo-800">
                        /swagger
                    </a>
                </p>
            </div>
        </div>
    );
}
