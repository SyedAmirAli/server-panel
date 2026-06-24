import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
    h1: ({ children }) => (
        <h1 className="mb-4 mt-0 border-b border-slate-200 pb-3 text-2xl font-semibold tracking-tight text-slate-900 break-anywhere">
            {children}
        </h1>
    ),
    h2: ({ children }) => (
        <h2 className="mb-3 mt-8 scroll-mt-6 text-lg font-semibold text-slate-900 break-anywhere first:mt-0">{children}</h2>
    ),
    h3: ({ children }) => (
        <h3 className="mb-2 mt-6 scroll-mt-6 text-sm font-semibold text-slate-800 break-anywhere">{children}</h3>
    ),
    p: ({ children }) => <p className="mb-4 text-sm leading-relaxed text-slate-700 break-anywhere">{children}</p>,
    ul: ({ children }) => <ul className="mb-4 ml-5 list-disc space-y-1.5 text-sm text-slate-700">{children}</ul>,
    ol: ({ children }) => <ol className="mb-4 ml-5 list-decimal space-y-1.5 text-sm text-slate-700">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed break-anywhere">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
    code: ({ className, children }) => {
        const isBlock = className?.includes("language-");
        if (isBlock) {
            return (
                <code className="my-3 block overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 font-mono text-xs leading-relaxed text-slate-100">
                    {children}
                </code>
            );
        }
        return (
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800">{children}</code>
        );
    },
    pre: ({ children }) => <pre className="my-3 overflow-x-auto">{children}</pre>,
    blockquote: ({ children }) => (
        <blockquote className="my-4 rounded-r-lg border-l-4 border-indigo-300 bg-indigo-50/60 px-4 py-2 text-sm text-slate-700">
            {children}
        </blockquote>
    ),
    hr: () => <hr className="my-8 border-slate-200" />,
    table: ({ children }) => (
        <div className="my-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
        </div>
    ),
    thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
    tbody: ({ children }) => <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>,
    tr: ({ children }) => <tr>{children}</tr>,
    th: ({ children }) => (
        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>
    ),
    td: ({ children }) => <td className="px-4 py-2.5 text-slate-700 break-anywhere">{children}</td>,
    a: ({ href, children }) => {
        if (href?.startsWith("/docs")) {
            return (
                <Link to={href} className="font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-800">
                    {children}
                </Link>
            );
        }
        if (href?.startsWith("/")) {
            return (
                <a href={href} className="font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-800">
                    {children}
                </a>
            );
        }
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-800"
            >
                {children}
            </a>
        );
    },
};

interface DocsMarkdownProps {
    content: string;
}

export function DocsMarkdown({ content }: DocsMarkdownProps) {
    return (
        <article className="docs-markdown min-w-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {content}
            </ReactMarkdown>
        </article>
    );
}
