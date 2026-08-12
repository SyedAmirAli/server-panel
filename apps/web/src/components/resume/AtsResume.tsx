import React from "react";
import type { DocumentBlock, ResumeDocumentContent } from "@appszone/shared";

/**
 * ATS-safe resume, ported from the standalone resume repo and rewired to render
 * from document JSON instead of a hard-coded constants file.
 *
 * The design version of a CV is built to be looked at; this one is built to be
 * *parsed*. One column (multi-column layouts get scrambled by resume parsers),
 * no photo, no icons, no colour, and conventional section headings the parser
 * knows how to bucket. Body text stays at 16px+; it may run long but must stay
 * within two pages.
 *
 * This exact component is what Chromium prints, and what the Studio preview
 * shows in an iframe — so the preview is the artifact, not an approximation.
 */

// Parsers key off these exact words — don't rename them to anything clever.
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mt-3">
        <h2 className="mb-1.5 border-b border-gray-400 pb-0.5 text-lg font-bold uppercase tracking-wider">{title}</h2>
        {children}
    </section>
);

/** A plain " · " in a string collapses to one space in HTML — render it as its
 *  own spaced element so the gap actually shows on the page. */
const DotJoin: React.FC<{ parts: string[] }> = ({ parts }) => (
    <>
        {parts
            .flatMap((p) => p.split("·").map((s) => s.trim()))
            .filter(Boolean)
            .map((part, i, arr) => (
                <React.Fragment key={i}>
                    {part}
                    {i < arr.length - 1 && <span className="mx-2 text-gray-400">·</span>}
                </React.Fragment>
            ))}
    </>
);

const Bullets: React.FC<{ points: string[]; block?: (text: string) => DocumentBlock | undefined }> = ({
    points,
    block,
}) => (
    <ul className="mt-0.5">
        {points.map((point, i) => (
            <li key={i} className="mb-0.5 flex items-start text-base leading-[1.35]" data-block={block?.(point)?.id}>
                <span className="mr-2">•</span>
                <span>{point}</span>
            </li>
        ))}
    </ul>
);

export function AtsResume({ content, blocks }: { content: ResumeDocumentContent; blocks?: DocumentBlock[] | null }) {
    // Blocks are addressed by the chat ("fix line 12"), so each rendered element
    // carries its stable block id rather than a positional index.
    const byText = new Map((blocks ?? []).map((b) => [b.text, b]));
    const blockFor = (text: string) => byText.get(text);

    return (
        <div className="a4-page bg-white shadow-lg print:shadow-none">
            {/* @page margin is 0, so these paddings are the printed page margins */}
            <div className="px-10 py-6 text-black print:px-10 print:py-6">
                <header>
                    <h1 className="text-3xl font-bold leading-tight">{content.name}</h1>
                    {content.headline && (
                        <p className="mt-1 text-base">
                            <DotJoin parts={[content.headline]} />
                        </p>
                    )}
                    {content.contacts.length > 0 && (
                        <p className="mt-1 text-base leading-[1.5]">
                            <DotJoin parts={content.contacts} />
                        </p>
                    )}
                </header>

                {content.summary.length > 0 && (
                    <Section title="Summary">
                        {content.summary.map((point, i) => (
                            <p
                                key={i}
                                data-block={blockFor(point)?.id}
                                className="mb-0.5 text-base leading-[1.35]"
                            >
                                {point}
                            </p>
                        ))}
                    </Section>
                )}

                {content.experience.length > 0 && (
                    <Section title="Experience">
                        {content.experience.map((job) => (
                            <div key={job.id} className="mb-2 last:mb-0 print:break-inside-avoid">
                                <div className="flex items-baseline justify-between gap-4">
                                    <p className="text-lg font-bold">
                                        {job.position} — {job.company}
                                    </p>
                                    <p className="whitespace-nowrap text-base">{job.period}</p>
                                </div>
                                {(job.location || job.employmentType) && (
                                    <p className="text-base text-gray-600">
                                        <DotJoin
                                            parts={[job.location, job.employmentType].filter(Boolean) as string[]}
                                        />
                                    </p>
                                )}
                                {/* Two pages is the hard constraint — bullets are ordered
                                    strongest-first, so capping the tail costs the least. */}
                                <Bullets points={(job.points ?? []).slice(0, 5)} block={blockFor} />
                            </div>
                        ))}
                    </Section>
                )}

                {content.projects.length > 0 && (
                    <Section title="Projects">
                        {content.projects.map((project) => (
                            <div key={project.id} className="mb-1.5 last:mb-0 print:break-inside-avoid">
                                <p className="text-lg font-bold">{project.name}</p>
                                {project.description && (
                                    <p
                                        data-block={blockFor(project.description)?.id}
                                        className="text-base leading-[1.35]"
                                    >
                                        {project.description}
                                    </p>
                                )}
                                {/* Prose gets skimmed by parsers; the stack list is the part
                                    that actually matches a job description's keywords. */}
                                {project.stack?.length > 0 && (
                                    <p className="text-base leading-[1.35]">{project.stack.join(", ")}</p>
                                )}
                            </div>
                        ))}
                    </Section>
                )}

                {/* Education sits above Skills so that Skills — a flowing keyword list
                    that survives a page break intact — absorbs any overflow. */}
                {content.education.length > 0 && (
                    <Section title="Education">
                        {content.education.map((edu) => (
                            <div key={edu.id} className="print:break-inside-avoid">
                                <div className="flex items-baseline justify-between gap-4">
                                    <p className="text-lg font-bold">
                                        {edu.degree} — {edu.institution}
                                    </p>
                                    <p className="whitespace-nowrap text-base">{edu.period}</p>
                                </div>
                                {edu.note && <p className="text-base leading-[1.35]">{edu.note}</p>}
                            </div>
                        ))}
                    </Section>
                )}

                {content.skills.length > 0 && (
                    <Section title="Skills">
                        {groupSkills(content.skills).map(([category, names]) => (
                            <p key={category} className="mb-0.5 text-base leading-[1.35]">
                                <b>{category}:</b> {names.join(", ")}
                            </p>
                        ))}
                    </Section>
                )}
            </div>
        </div>
    );
}

/** Group skills by category, keeping entry order within each group. */
function groupSkills(skills: ResumeDocumentContent["skills"]): Array<[string, string[]]> {
    const groups = new Map<string, string[]>();
    for (const skill of skills) {
        const key = titleCase(skill.category ?? "Other");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(skill.name);
    }
    return [...groups.entries()];
}

function titleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
