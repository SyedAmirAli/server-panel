import readme from "../../../../docs/README.md?raw";
import adminApi from "../../../../docs/admin-api.md?raw";
import sendEmail from "../../../../docs/send-email.md?raw";
import responseConvention from "../../../../docs/api-response-convention.md?raw";
import storageApi from "../../../../docs/storage-api.md?raw";
// Image assets resolve to served URLs so screenshots render in the SPA too.
import storageKeysList from "../../../../docs/assets/storage-images/storage-api-keys-list.jpg";
import storageKeyForm from "../../../../docs/assets/storage-images/create-api-key-form.jpg";
import storageKeyCreated from "../../../../docs/assets/storage-images/successfully-created-the-api-key.jpg";

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
        .replace(/\]\(\.\/storage-api\.md\)/g, "](/docs/storage-api)")
        .replace(/\]\(\.\/api-response-convention\.md\)/g, "](/docs/response-convention)")
        .replace(/\]\(\.\/README\.md\)/g, "](/docs)");
}

/** Point repo-relative image paths at the bundled/served asset URLs. */
function rewriteStorageImages(markdown: string): string {
    return markdown
        .replace("./assets/storage-images/storage-api-keys-list.jpg", storageKeysList)
        .replace("./assets/storage-images/create-api-key-form.jpg", storageKeyForm)
        .replace("./assets/storage-images/successfully-created-the-api-key.jpg", storageKeyCreated);
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
        id: "storage-api",
        path: "/docs/storage-api",
        title: "Storage API",
        description: "Upload files, get CDN/presigned URLs and metadata, list, delete, and show live upload progress.",
        content: rewriteStorageImages(rewriteDocLinks(storageApi)),
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
