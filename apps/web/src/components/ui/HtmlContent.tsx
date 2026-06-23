import DOMPurify from 'dompurify';
import { ScrollArea } from '@/components/ui/ScrollArea';

interface HtmlContentProps {
  html: string;
  className?: string;
}

export function HtmlContent({ html, className = '' }: HtmlContentProps) {
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

  return (
    <ScrollArea
      maxHeight="max-h-96"
      className={`prose-html rounded-xl border border-gray-100 bg-white p-4 text-sm leading-relaxed text-gray-800 ${className}`}
    >
      <div dangerouslySetInnerHTML={{ __html: clean }} />
    </ScrollArea>
  );
}
