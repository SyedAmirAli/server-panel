import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { ScrollArea } from '@/components/ui/ScrollArea';

const components: Components = {
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-base font-bold text-gray-900 first:mt-0 break-anywhere">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-sm font-bold text-gray-900 first:mt-0 break-anywhere">{children}</h2>,
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 text-xs font-bold uppercase tracking-wide text-gray-500 first:mt-0 break-anywhere">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2 text-sm leading-relaxed text-gray-700 last:mb-0 break-anywhere">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5 text-sm text-gray-700 break-anywhere">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5 text-sm text-gray-700 break-anywhere">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed break-anywhere">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code className="my-2 block rounded-lg bg-gray-900 px-3 py-2.5 font-mono text-xs leading-relaxed text-gray-100 break-anywhere whitespace-pre-wrap">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-gray-200/80 px-1 py-0.5 font-mono text-[0.8em] text-gray-800 break-anywhere">{children}</code>
    );
  },
  pre: ({ children }) => <pre className="my-2 break-anywhere whitespace-pre-wrap">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-indigo-300 pl-3 text-sm italic text-gray-600 break-anywhere">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-gray-200" />,
  img: ({ src, alt }) => (
    <img
      src={typeof src === 'string' ? src : undefined}
      alt={alt ?? ''}
      loading="lazy"
      className="my-3 max-w-full rounded-lg border border-gray-200 shadow-sm"
    />
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="break-anywhere text-indigo-600 underline hover:text-indigo-800">
      {children}
    </a>
  ),
};

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  return (
    <ScrollArea maxHeight="max-h-96" className={`markdown-body rounded-xl border border-gray-100 bg-white p-4 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </ScrollArea>
  );
}
