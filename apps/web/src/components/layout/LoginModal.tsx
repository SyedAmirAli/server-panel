import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/ui/Spinner";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { toastError, toastSuccess } from "@/lib/toast";

export function LoginModal() {
    const { login } = useAuth();
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        try {
            await login(password);
            toastSuccess("Signed in successfully");
        } catch (err) {
            toastError(err instanceof Error ? err.message : "Login failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
            <div className="w-full max-w-sm px-4">
                <div className="mb-8 flex flex-col items-center text-center">
                    <div className="mb-5 flex items-center justify-center rounded-2xl bg-indigo-600 px-6 py-3.5 shadow-lg shadow-indigo-200/60">
                        <img
                            src="https://temporary.syedamirali.me/krishidoctor/brand/logo-horizontal.png"
                            alt="Amir's Panel"
                            className="h-6 w-auto"
                            draggable={false}
                        />
                    </div>
                    <h1 className="text-lg font-semibold text-gray-900">Amir's Panel</h1>
                    <p className="mt-1 text-sm text-gray-500">Sign in to your admin panel</p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <form onSubmit={onSubmit} className="space-y-4">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-700">Password</label>
                            <div className="relative">
                                <Lock
                                    size={14}
                                    className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-gray-400"
                                />
                                <PasswordInput
                                    value={password}
                                    onChange={setPassword}
                                    placeholder="Admin password"
                                    autoComplete="current-password"
                                    className="h-10! pl-9!"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={busy || !password}
                            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {busy && <Spinner size="sm" />}
                            {busy ? "Signing in…" : "Sign in"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
