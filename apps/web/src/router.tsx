import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { SendMail } from "@/pages/SendMail";
import { MailMessages } from "@/pages/MailMessages";
import { MailboxInbox } from "@/pages/MailboxInbox";
import { ApiKeys } from "@/pages/ApiKeys";
import { EmailConfigs } from "@/pages/EmailConfigs";
import { AuditLog } from "@/pages/AuditLog";
import { SentMessages } from "@/pages/SentMessages";
import { Mailboxes } from "@/pages/Mailboxes";
import { ApiDocs } from "@/pages/ApiDocs";
import { FoundJobs } from "@/pages/jobs/FoundJobs";
import { JobDetail } from "@/pages/jobs/JobDetail";
import { JobFinderSettings } from "@/pages/jobs/JobFinderSettings";
import { PeopleList } from "@/pages/people/PeopleList";
import { PersonDetail } from "@/pages/people/PersonDetail";
import { PrintResume } from "@/pages/PrintResume";
import { Studio } from "@/pages/studio/Studio";
import { Buckets } from "@/pages/storage/Buckets";
import { BucketDetail } from "@/pages/storage/BucketDetail";
import { StorageKeys } from "@/pages/storage/StorageKeys";

export const router = createBrowserRouter([
    // Outside the app shell on purpose — this is what Chromium prints and what
    // the Studio preview iframe loads, so it must carry no chrome of its own.
    { path: "/print/resume/:documentId", element: <PrintResume /> },
    {
        path: "/",
        element: <AppShell />,
        children: [
            { index: true, element: <Dashboard /> },
            { path: "send", element: <SendMail /> },
            { path: "inbox", element: <MailMessages /> },
            { path: "mailboxes/:id/inbox", element: <MailboxInbox /> },
            { path: "keys", element: <ApiKeys /> },
            { path: "email-configs", element: <EmailConfigs /> },
            { path: "jobs", element: <FoundJobs /> },
            { path: "jobs/settings", element: <JobFinderSettings /> },
            { path: "jobs/:id", element: <JobDetail /> },
            { path: "people", element: <PeopleList /> },
            { path: "people/:id", element: <PersonDetail /> },
            { path: "studio", element: <Studio /> },
            { path: "studio/:conversationId", element: <Studio /> },
            { path: "storage", element: <Buckets /> },
            { path: "storage/keys", element: <StorageKeys /> },
            { path: "storage/:publicId", element: <BucketDetail /> },
            { path: "audit-log", element: <AuditLog /> },
            { path: "sent-messages", element: <SentMessages /> },
            { path: "mailboxes", element: <Mailboxes /> },
            { path: "docs", element: <ApiDocs /> },
            { path: "docs/:docId", element: <ApiDocs /> },
            // legacy alias
            { path: "settings/mailboxes", element: <Mailboxes /> },
        ],
    },
]);
