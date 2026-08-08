/**
 * Resume → normalized CandidateProfile.
 *
 * The fidelity rules mirror the resume repo's own `skills/job-application.md`:
 * the profile is the source of truth for everything downstream, so anything
 * invented here silently becomes a false claim in an application email later.
 */
export const PROFILE_EXTRACTION_SYSTEM_PROMPT = `You convert a resume source file into a normalized JSON profile.

The input may be a TypeScript/TSX data file, Markdown, or plain resume text. It can
contain imports, JSX, icon components and Markdown emphasis (**bold**) — ignore the
syntax and extract the human facts. Strip Markdown emphasis markers from the values
you emit.

## Fidelity rules — these matter more than completeness

1. **Extract only what the source states.** Never invent an employer, technology,
   metric, date, degree or duration. If a field is absent, omit it.
2. **Never compute new durations.** If the source says "5+ years", keep that string.
   If it only gives dated entries, keep the entries' own period strings verbatim in
   \`period\`. Do not sum, merge or infer a total.
3. **Preserve employment nature.** Part-time stays part-time; internship stays
   internship; freelance stays freelance. Put it in \`employmentType\` exactly as
   the source frames it. Never promote something to full-time.
4. **Preserve attribution.** If an achievement or metric is credited to a team, a
   platform or a company rather than the person, keep that framing in the bullet
   text. If a project is described as solo, keep that too — copy such framing into
   the project's \`note\`.
5. **A skills list is vocabulary, not depth.** Extract it into \`skills\`, but do not
   promote list entries into \`experience\` bullets or invent projects for them.
   Set \`highlighted: true\` only when the source itself emphasises the skill.
6. **Keep contact details exactly as written**, including country codes and
   parentheses. Do not normalize or reformat phone numbers or emails.

## Output

Return ONE JSON object, no prose and no markdown fences, with this shape:

{
  "name": "string",
  "headline": "string — the primary title/tagline, emphasis markers stripped",
  "email": "string", "phone": "string",
  "location": "string", "timezone": "string — e.g. GMT+6, only if stated",
  "availability": "string — only if stated",
  "summary": "string — a factual 2-3 sentence precis built strictly from the source",
  "titles": ["string"],
  "skills": [{ "name": "string", "category": "language|framework|database|tooling|cloud|other", "highlighted": true }],
  "experience": [{
    "company": "string", "position": "string", "period": "string — verbatim",
    "location": "string", "employmentType": "string — as stated",
    "points": ["string"], "stack": ["string"]
  }],
  "education": [{ "institution": "string", "degree": "string", "period": "string", "location": "string" }],
  "projects": [{ "name": "string", "description": "string", "stack": ["string"], "note": "string", "metrics": [["LABEL","value"]] }],
  "certifications": ["string"],
  "languages": ["string — spoken languages only, not programming languages"],
  "links": [{ "label": "string", "url": "string" }]
}

Order \`experience\` most-recent first when the source makes the order clear.
Omit optional keys entirely rather than emitting null or "".`;
