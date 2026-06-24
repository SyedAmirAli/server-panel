import readme from "../../../../docs/README.md?raw";
import adminApi from "../../../../docs/admin-api.md?raw";
import sendEmail from "../../../../docs/send-email.md?raw";
import responseConvention from "../../../../docs/api-response-convention.md?raw";

export interface DocSection {
    id: string;
    path: string;
    title: string;
    description: string;
    content: string;
}

/** Rewrite repo-relative markdown links to in-app /docs routes. */
function rewriteDocLinks(markdown: string): string {
    return markdown
        .replace(/\]\(\.\/admin-api\.md\)/g, "](/docs/admin-api)")
        .replace(/\]\(\.\/send-email\.md\)/g, "](/docs/send-email)")
        .replace(/\]\(\.\/api-response-convention\.md\)/g, "](/docs/response-convention)")
        .replace(/\]\(\.\/README\.md\)/g, "](/docs)");
}

export const DOC_SECTIONS: DocSection[] = [
    {
        id: "overview",
        path: "/docs",
        title: "Overview",
        description: "Guides for integrating with the AppsZone Mail API.",
        content: rewriteDocLinks(readme),
    },
    {
        id: "admin-api",
        path: "/docs/admin-api",
        title: "Admin Panel API",
        description: "Authentication, API keys, email configs, and observability endpoints.",
        content: rewriteDocLinks(adminApi),
    },
    {
        id: "send-email",
        path: "/docs/send-email",
        title: "Send an Email",
        description: "Authenticate with an API key and send mail (JSON or multipart).",
        content: rewriteDocLinks(sendEmail),
    },
    {
        id: "response-convention",
        path: "/docs/response-convention",
        title: "Response Convention",
        description: "The { status, message, data } envelope rules for every endpoint.",
        content: rewriteDocLinks(responseConvention),
    },
];

export function findDocSection(docId: string | undefined): DocSection {
    return DOC_SECTIONS.find((s) => s.id === docId) ?? DOC_SECTIONS[0];
}
