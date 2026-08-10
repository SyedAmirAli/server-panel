import { NavLink } from "react-router-dom";
import {
    LayoutDashboard,
    Inbox,
    Send,
    Key,
    Server,
    ScrollText,
    CheckCheck,
    HardDrive,
    Database,
    KeyRound,
    BookOpen,
    Briefcase,
    SlidersHorizontal,
    Users,
    Sparkles,
    LogOut,
    type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface NavItemDef {
    to: string;
    label: string;
    icon: LucideIcon;
    end?: boolean;
}

const mailItems: NavItemDef[] = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/inbox", label: "Inbox", icon: Inbox },
    { to: "/send", label: "Send Mail", icon: Send },
];

const adminItems: NavItemDef[] = [
    { to: "/keys", label: "API Keys", icon: Key },
    { to: "/email-configs", label: "Email Configs", icon: Server },
];

const jobItems: NavItemDef[] = [
    { to: "/jobs", label: "Found Jobs", icon: Briefcase, end: true },
    { to: "/jobs/settings", label: "Job Settings", icon: SlidersHorizontal },
];

// AI Studio — the one AI surface in an otherwise conventional admin panel, so
// the section label carries a subtle animated gradient to set it apart.
const studioItems: NavItemDef[] = [
    { to: "/studio", label: "Studio", icon: Sparkles, end: true },
    { to: "/people", label: "People", icon: Users, end: true },
];

const storageItems: NavItemDef[] = [
    { to: "/storage", label: "Buckets", icon: Database, end: true },
    { to: "/storage/keys", label: "Storage Keys", icon: KeyRound },
];

const logItems: NavItemDef[] = [
    { to: "/audit-log", label: "Audit Log", icon: ScrollText },
    { to: "/sent-messages", label: "Sent Messages", icon: CheckCheck },
    { to: "/mailboxes", label: "Mailboxes", icon: HardDrive },
];

function NavItem({ to, label, icon: Icon, end }: NavItemDef) {
    return (
        <NavLink
            to={to}
            end={end}
            className={({ isActive }) =>
                `group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`
            }
        >
            {({ isActive }) => (
                <>
                    <Icon
                        size={15}
                        className={isActive ? "text-indigo-500" : "text-gray-400 group-hover:text-gray-600"}
                    />
                    {label}
                </>
            )}
        </NavLink>
    );
}

function NavSection({ label, items, glow }: { label: string; items: NavItemDef[]; glow?: boolean }) {
    return (
        <div>
            <p
                className={
                    glow
                        ? "mb-1 flex items-center gap-1 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-indigo-500 bg-[length:200%_auto] bg-clip-text px-3 text-[10px] font-semibold uppercase tracking-widest text-transparent [animation:studio-glow_4s_linear_infinite]"
                        : "mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400"
                }
            >
                {glow && <Sparkles size={10} className="text-fuchsia-500" />}
                {label}
            </p>
            <div className="space-y-0.5">
                {items.map((item) => (
                    <NavItem key={item.to} {...item} />
                ))}
            </div>
        </div>
    );
}

export function Sidebar() {
    const { logout } = useAuth();

    return (
        <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
            {/* Logo */}
            <div className="flex flex-col items-center gap-1.5 border-b border-gray-200 px-5 py-4">
                <img
                    src="https://temporary.syedamirali.me/krishidoctor/brand/logo-horizontal.png"
                    alt="Amir's Panel"
                    className="h-10 w-auto max-w-full object-contain"
                    draggable={false}
                />
                <p className="text-[11px] font-medium leading-none text-gray-400">Admin Panel</p>
            </div>

            {/* Nav */}
            <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
                <NavSection label="Mail" items={mailItems} />
                <NavSection label="Admin" items={adminItems} />
                <NavSection label="Job Finder" items={jobItems} />
                <NavSection label="AI Studio" items={studioItems} glow />
                <NavSection label="Storage" items={storageItems} />
                <NavSection label="Logs" items={logItems} />
                <NavSection label="Docs" items={[{ to: "/docs", label: "API Docs", icon: BookOpen }]} />
            </nav>

            {/* Footer */}
            <div className="border-t border-gray-100 p-3">
                <button
                    onClick={logout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                    <LogOut size={15} className="text-gray-400" />
                    Log out
                </button>
            </div>
        </aside>
    );
}
