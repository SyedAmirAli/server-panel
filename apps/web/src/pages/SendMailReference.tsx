import { useState, type ReactNode } from "react";

export const EXAMPLE_TABS = [
    {
        label: "JSON / No Attachments",
        description: (
            <>
                Use <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">application/json</code> when
                you have no file attachments. Simplest approach.
            </>
        ),
        code: `const API_BASE = "https://app.mail.appszonebd.com/api/v1";
const API_KEY  = process.env.APPSZONE_MAIL_KEY; // server-side only

async function sendEmail() {
  const res = await fetch(\`\${API_BASE}/mails/send\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${API_KEY}\`,
    },
    body: JSON.stringify({
      from:     "sales@appszonebd.com",
      to:       ["jon@gmail.com", "doe@gmail.com"],
      cc:       ["boss@appszonebd.com"],
      subject:  "Welcome aboard 🎉",
      bodyType: "EMBED_HTML",
      body:     "<h1>Hi there</h1><p>Thanks for signing up.</p>",
    }),
  });

  const body = await res.json();
  if (!res.ok) throw new Error(\`Send failed (\${res.status}): \${body.message}\`);
  return body.data;
}`,
    },
    {
        label: "Multipart + Files",
        description: (
            <>
                Use <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">FormData</code> with
                attachments. <strong>Do not</strong> set{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">Content-Type</code> — the runtime
                adds the multipart boundary automatically.
            </>
        ),
        code: `const form = new FormData();
form.append("from", "sales@appszonebd.com");
form.append("to", "jon@gmail.com");
form.append("subject", "Your invoice");
form.append("bodyType", "PLAIN_TEXT");
form.append("body", "Invoice attached. Thanks!");
form.append("attachments", file, "invoice.pdf");

const res = await fetch(\`\${API_BASE}/mails/send\`, {
  method: "POST",
  headers: { Authorization: \`Bearer \${API_KEY}\` },
  body: form,
});`,
    },
    {
        label: "Node.js (disk file)",
        description: (
            <>
                Node 20+ has <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">fetch</code>,{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">FormData</code>, and{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">Blob</code> built in — no extra
                packages needed.
            </>
        ),
        code: `import { readFile } from "node:fs/promises";

const buffer = await readFile("./invoice.pdf");
const form = new FormData();
form.append("attachments", new Blob([buffer], { type: "application/pdf" }), "invoice.pdf");

const res = await fetch(\`\${API_BASE}/mails/send\`, {
  method: "POST",
  headers: { Authorization: \`Bearer \${API_KEY}\` },
  body: form,
});`,
    },
    {
        label: "cURL",
        description: (
            <>
                Quick test from the terminal. Set{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">APPSZONE_MAIL_KEY</code> in your
                shell first.
            </>
        ),
        code: `curl -X POST "http://localhost:3000/api/v1/mails/send" \\
  -H "Authorization: Bearer $APPSZONE_MAIL_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "sales@appszonebd.com",
    "to": ["jon@gmail.com"],
    "subject": "Hello from cURL",
    "bodyType": "PLAIN_TEXT",
    "body": "Hi from AppsZone Mail"
  }'`,
    },
] as const;

function FaqItem({ question, children }: { question: ReactNode; children: ReactNode }) {
    return (
        <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-black/5">
            <summary className="flex cursor-pointer select-none items-center justify-between px-6 py-4 transition-colors hover:bg-slate-50/50">
                <span className="text-sm font-medium text-slate-900">{question}</span>
                <svg
                    className="faq-chevron size-4 shrink-0 text-slate-400 transition-transform duration-200"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </summary>
            <div className="border-t border-slate-100 px-6 pb-5 pt-4 text-sm leading-relaxed text-slate-600">
                {children}
            </div>
        </details>
    );
}

export function SendMailReference() {
    const [exampleTab, setExampleTab] = useState(0);

    return (
        <div className="space-y-12 pb-16">
            <section id="api-ref">
                <div className="mb-5 flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-brand-50">
                        <svg
                            className="size-4 text-brand-600"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h8M4 18h8" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-900">Request Field Reference</h2>
                        <p className="text-sm text-slate-500">
                            Every parameter the <code>/mails/send</code> endpoint accepts
                        </p>
                    </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-black/5">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="w-32 px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                    Field
                                </th>
                                <th className="w-44 px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                    Type
                                </th>
                                <th className="w-24 px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                    Required
                                </th>
                                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                    Notes
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {[
                                [
                                    "from",
                                    "string (email)",
                                    "Yes",
                                    "Must be permitted by the key's allowedFrom list, if set.",
                                ],
                                [
                                    "to",
                                    "string[]",
                                    "Yes",
                                    "1–50 recipients. In multipart, a comma-separated string also works.",
                                ],
                                ["cc", "string[]", "Optional", "Up to 50 addresses. Recipients visible to each other."],
                                ["bcc", "string[]", "Optional", "Up to 50 addresses. Hidden from other recipients."],
                                ["subject", "string", "Yes", "Maximum 2000 characters."],
                                ["bodyType", "PLAIN_TEXT | EMBED_HTML", "Yes", "Controls how body is interpreted."],
                                ["body", "string", "Yes", "Plain text or HTML per bodyType. Max ~1 MB."],
                                [
                                    "attachments",
                                    "file[]",
                                    "Optional",
                                    "multipart only. Up to 10 files, 10 MB each, 25 MB total.",
                                ],
                            ].map(([field, type, req, notes]) => (
                                <tr key={field} className="transition-colors hover:bg-slate-50/50">
                                    <td className="px-6 py-4">
                                        <code className="font-mono font-semibold text-brand-600">{field}</code>
                                    </td>
                                    <td className="px-4 py-4">
                                        <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600">
                                            {type}
                                        </code>
                                    </td>
                                    <td className="px-4 py-4">
                                        {req === "Yes" ? (
                                            <span className="badge-red">Yes</span>
                                        ) : (
                                            <span className="text-xs text-slate-400">{req}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-4 text-slate-600">{notes}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section>
                <div className="mb-5 flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50">
                        <svg
                            className="size-4 text-emerald-600"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                            />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-900">Code Examples</h2>
                        <p className="text-sm text-slate-500">Copy-paste ready snippets for common use cases</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-black/5">
                        <div className="flex gap-0 border-b border-slate-100 px-6">
                            {EXAMPLE_TABS.map((tab, i) => (
                                <button
                                    key={tab.label}
                                    type="button"
                                    onClick={() => setExampleTab(i)}
                                    className={`-mb-px border-b-2 px-4 py-3.5 text-sm font-medium transition-colors ${
                                        exampleTab === i
                                            ? "border-brand-500 text-brand-600"
                                            : "border-transparent text-slate-500 hover:text-slate-700"
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <div className="space-y-3 p-6">
                            <p className="mb-3 text-sm text-slate-600">{EXAMPLE_TABS[exampleTab].description}</p>
                            <pre className="code-block scroll-area-pre whitespace-pre-wrap">
                                {EXAMPLE_TABS[exampleTab].code}
                            </pre>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm shadow-black/5">
                            <div className="flex items-center gap-2 border-b border-emerald-100 px-5 py-3.5">
                                <span className="badge-green">201 Created</span>
                                <span className="text-sm font-medium text-slate-700">Success response</span>
                            </div>
                            <pre className="code-block rounded-none p-5 text-xs">{`{
  "status": "queued",
  "message": "Email queued for delivery",
  "data": { "id": "cmqq...id", "status": "queued" }
}`}</pre>
                        </div>
                        <div className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm shadow-black/5">
                            <div className="flex items-center gap-2 border-b border-red-100 px-5 py-3.5">
                                <span className="badge-red">400 Bad Request</span>
                                <span className="text-sm font-medium text-slate-700">Validation error</span>
                            </div>
                            <pre className="code-block rounded-none p-5 text-xs">{`{
  "status": "error",
  "message": "each value in to must be an email",
  "data": { "errors": ["..."] }
}`}</pre>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <div className="mb-5 flex items-center gap-3">
                    <h2 className="text-base font-bold text-slate-900">Tips &amp; Best Practices</h2>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    {[
                        [
                            "Keep keys server-side",
                            "Calling the API from browser code exposes your key. Proxy through your own backend instead.",
                        ],
                        [
                            "Arrays in multipart",
                            "Repeat the field name (to twice) or send one comma-separated string — both normalize server-side.",
                        ],
                        [
                            "Poll for delivery status",
                            "A 201 means accepted/queued, not necessarily delivered. Use data.id to track status.",
                        ],
                    ].map(([title, text]) => (
                        <div
                            key={title}
                            className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-black/5"
                        >
                            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                            <p className="text-xs leading-relaxed text-slate-600">{text}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section>
                <div className="mb-5 flex items-center gap-3">
                    <h2 className="text-base font-bold text-slate-900">Frequently Asked Questions</h2>
                </div>
                <div className="space-y-3">
                    <FaqItem question="Where can I find my API key?">
                        <p>
                            Go to <strong>Admin → API Keys</strong> in the sidebar. Create a key and copy it from the
                            list — full keys are stored for admin retrieval.
                        </p>
                    </FaqItem>
                    <FaqItem
                        question={
                            <>
                                What does{" "}
                                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-brand-600">
                                    allowedFrom
                                </code>{" "}
                                do?
                            </>
                        }
                    >
                        <p>
                            If set, the key may only send from those addresses; otherwise any verified domain sender
                            works.
                        </p>
                    </FaqItem>
                    <FaqItem question="Can I send from the browser / frontend?">
                        <p>
                            <strong>Not recommended.</strong> Your API key would be visible in network inspector. Use a
                            server-side proxy instead.
                        </p>
                    </FaqItem>
                </div>
            </section>
        </div>
    );
}

export const ATTACHMENT_LIMITS = {
    maxFiles: 10,
    maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB per file
    maxTotalBytes: 100 * 1024 * 1024, // 100 MB total
};
