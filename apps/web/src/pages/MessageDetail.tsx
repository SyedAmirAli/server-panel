import { useParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";

export function MessageDetail() {
  const { id } = useParams();
  return (
    <>
      <PageHeader title="Message" subtitle={`Message ${id}`} />
      <p className="text-sm text-slate-500">Message detail wired in Phase 4.</p>
    </>
  );
}
