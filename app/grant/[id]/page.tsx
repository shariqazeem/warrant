import {redirect} from "next/navigation";

/**
 * `/grant/[id]` was a grant's public record before the certificate. Every link to it keeps
 * working: it is the certificate now, at `/g/[id]`. (next.config redirects it too; this is
 * the fallback.)
 */
export default async function OldGrantLink({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  redirect(`/g/${encodeURIComponent(id)}`);
}
