import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

/**
 * Markdown for assistant replies inside a chat bubble.
 *
 * Deliberately not `MarkdownContent`: that one wraps its output in a bordered
 * card with its own scroll area, which is right for a document panel and wrong
 * inside a bubble. Spacing here is tight, the last block never adds a trailing
 * margin, and colours are inherited so the same component works on any bubble.
 *
 * Only assistant messages are rendered as markdown — a user's own text is shown
 * verbatim, so typing `*` or `_` cannot silently reformat what they wrote.
 */
const components: Components = {
    p: ({ children }) => <p className="mb-1.5 leading-relaxed last:mb-0">{children}</p>,

    ul: ({ children }) => <ul className="mb-1.5 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>,
    ol: ({ children }) => <ol className="mb-1.5 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,

    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,

    // Headings inside a chat reply should read as emphasis, not as page
    // structure — a bubble is not a document.
    h1: ({ children }) => <p className="mb-1.5 font-semibold last:mb-0">{children}</p>,
    h2: ({ children }) => <p className="mb-1.5 font-semibold last:mb-0">{children}</p>,
    h3: ({ children }) => <p className="mb-1 font-semibold last:mb-0">{children}</p>,

    code: ({ className, children }) => {
        const isBlock = className?.includes("language-");
        if (isBlock) {
            return (
                <code className="my-1.5 block overflow-x-auto whitespace-pre rounded-lg bg-gray-900 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-gray-100">
                    {children}
                </code>
            );
        }
        // `bg-black/5` rather than a fixed grey so the chip stays legible on
        // both the light assistant bubble and a dark one.
        return <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>;
    },
    pre: ({ children }) => <pre className="my-0">{children}</pre>,

    blockquote: ({ children }) => (
        <blockquote className="my-1.5 border-l-2 border-current/30 pl-2.5 italic opacity-80">{children}</blockquote>
    ),

    hr: () => <hr className="my-2 border-current/20" />,

    a: ({ href, children }) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-current/40 underline-offset-2 hover:decoration-current"
        >
            {children}
        </a>
    ),

    // GFM tables — the assistant reaches for these when listing counts.
    table: ({ children }) => (
        <div className="my-1.5 overflow-x-auto">
            <table className="w-full border-collapse text-left">{children}</table>
        </div>
    ),
    th: ({ children }) => <th className="border-b border-current/20 px-2 py-1 font-semibold">{children}</th>,
    td: ({ children }) => <td className="border-b border-current/10 px-2 py-1">{children}</td>,
};

export function ChatMarkdown({ content }: { content: string }) {
    return (
        <div className="text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {content}
            </ReactMarkdown>
        </div>
    );
}
