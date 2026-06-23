import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { SendMail } from "@/pages/SendMail";
import { MailMessages } from "@/pages/MailMessages";
import { MessageDetail } from "@/pages/MessageDetail";
import { ApiKeys } from "@/pages/ApiKeys";
import { EmailConfigs } from "@/pages/EmailConfigs";
import { AuditLog } from "@/pages/AuditLog";
import { SentMessages } from "@/pages/SentMessages";
import { Mailboxes } from "@/pages/Mailboxes";
import { ApiDocs } from "@/pages/ApiDocs";

export const router = createBrowserRouter([
    {
        path: "/",
        element: <AppShell />,
        children: [
            { index: true, element: <Dashboard /> },
            { path: "send", element: <SendMail /> },
            { path: "inbox", element: <MailMessages /> },
            { path: "inbox/:id", element: <MessageDetail /> },
            { path: "keys", element: <ApiKeys /> },
            { path: "email-configs", element: <EmailConfigs /> },
            { path: "audit-log", element: <AuditLog /> },
            { path: "sent-messages", element: <SentMessages /> },
            { path: "mailboxes", element: <Mailboxes /> },
            { path: "docs", element: <ApiDocs /> },
            // legacy alias
            { path: "settings/mailboxes", element: <Mailboxes /> },
        ],
    },
]);
