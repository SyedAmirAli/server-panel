/**
 * Posting + profile → 1–5 star fit assessment.
 *
 * The rating drives what the candidate spends time on, so the prompt is
 * deliberately conservative: unevidenced skills count as gaps, and a listed
 * technology is not treated as demonstrated experience.
 */
export const JOB_MATCH_SYSTEM_PROMPT = `You rate how well ONE candidate fits ONE job posting.

You are given a normalized candidate profile and a job description. Judge only
from what the profile actually evidences.

## Rules

1. **The profile is the only evidence.** Never assume a skill the profile does
   not show. A technology that appears only in a skills list is *vocabulary*,
   not demonstrated experience — a role or project entry must back it for you to
   count it as a strength.
2. **Do not invent or compute durations.** If the posting demands "5+ years" and
   the profile does not state a total, treat the requirement as unproven and say
   so in \`gaps\` — do not add up dated entries yourself.
3. **Respect stated employment nature.** Part-time, internship and freelance
   entries are real experience but must not be counted as full-time senior work.
4. **Respect attribution.** Achievements the profile credits to a team or
   platform are not the candidate's individual accomplishments.
5. **Be honest about gaps.** \`gaps\` is written for the candidate, to help them
   decide whether to apply — never soften it.

## Star scale

- **5** — Meets essentially every core requirement with directly evidenced work. Apply now.
- **4** — Strong fit; one or two secondary requirements unproven.
- **3** — Plausible fit; core overlap exists but several requirements are unevidenced.
- **2** — Stretch; the profile misses multiple core requirements.
- **1** — Weak; different discipline, seniority, or domain.

Also weigh hard blockers: an explicit on-site requirement in a country the
candidate is not in, a seniority level far from theirs, or a required language
they do not list. These cap the rating at 2 regardless of technical overlap.

## Output

Return ONE JSON object, no prose and no markdown fences:

{
  "stars": 1-5,
  "score": 0-100,
  "verdict": "strong" | "good" | "stretch" | "weak",
  "summary": "1-2 sentences, addressed to the candidate, on why this rating",
  "strengths": ["specific overlaps, each traceable to a profile entry"],
  "gaps": ["requirements the profile does not evidence"],
  "matchedSkills": ["skills required by the posting AND evidenced in the profile"],
  "missingSkills": ["skills required by the posting but absent from the profile"]
}

\`score\` should order jobs within a star band: keep it consistent with \`stars\`
(1★ 0-20, 2★ 21-40, 3★ 41-60, 4★ 61-80, 5★ 81-100).`;

/** Compact profile rendering — full JSON wastes context and buries the signal. */
export function renderProfileForMatching(profile: {
    name: string;
    headline: string | null;
    location: string | null;
    timezone: string | null;
    availability: string | null;
    summary: string | null;
    titles: unknown;
    skills: unknown;
    experience: unknown;
    projects: unknown;
    education: unknown;
}): string {
    const skills = asArray<{ name?: string }>(profile.skills)
        .map((s) => s?.name)
        .filter(Boolean)
        .join(", ");

    const experience = asArray<{
        company?: string;
        position?: string;
        period?: string;
        employmentType?: string;
        points?: string[];
        stack?: string[];
    }>(profile.experience)
        .map((role) => {
            const header = [role.position, "at", role.company, `(${role.period ?? "period not stated"}`]
                .filter(Boolean)
                .join(" ");
            const type = role.employmentType ? `, ${role.employmentType})` : ")";
            const points = (role.points ?? []).map((p) => `    - ${p}`).join("\n");
            const stack = role.stack?.length ? `\n    Stack: ${role.stack.join(", ")}` : "";
            return `  • ${header}${type}${stack}\n${points}`;
        })
        .join("\n");

    const projects = asArray<{ name?: string; description?: string; stack?: string[]; note?: string }>(profile.projects)
        .map(
            (p) =>
                `  • ${p.name}${p.note ? ` [${p.note}]` : ""}: ${p.description ?? ""}` +
                (p.stack?.length ? `\n    Stack: ${p.stack.join(", ")}` : "")
        )
        .join("\n");

    const education = asArray<{ degree?: string; institution?: string; period?: string }>(profile.education)
        .map((e) => `  • ${e.degree} — ${e.institution} (${e.period ?? "period not stated"})`)
        .join("\n");

    return [
        `Name: ${profile.name}`,
        profile.headline && `Headline: ${profile.headline}`,
        profile.location && `Location: ${profile.location}${profile.timezone ? ` (${profile.timezone})` : ""}`,
        profile.availability && `Availability: ${profile.availability}`,
        profile.summary && `Summary: ${profile.summary}`,
        skills && `\nSkills (vocabulary — not proof of depth):\n  ${skills}`,
        experience && `\nExperience:\n${experience}`,
        projects && `\nProjects:\n${projects}`,
        education && `\nEducation:\n${education}`,
    ]
        .filter(Boolean)
        .join("\n");
}

function asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
}
