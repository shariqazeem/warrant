/**
 * `/@0x…/export` — a company's payments, grants and releases as one CSV for its accountant.
 *
 * Public, like the record it is made from: every row is already on X Layer and on the
 * company's page. Nothing here is computed that the chain did not record.
 */
import {readExport, toCsv} from "@/lib/export";

type Params = {params: Promise<{company: string}>};

export async function GET(_req: Request, {params}: Params) {
  const {company} = await params;
  const address = decodeURIComponent(company).replace(/^@/, "");
  const read = readExport(address);
  if (!read.ok) return new Response(read.why, {status: 404, headers: {"Content-Type": "text/plain; charset=utf-8"}});

  const day = new Date().toISOString().slice(0, 10);
  const name = `warrant-${address.slice(0, 8).toLowerCase()}-${day}.csv`;
  return new Response(toCsv(read.value), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
