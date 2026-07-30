import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { getAccessContext } from "@/lib/access";
import { GET as getInstallmentCheckRequest } from "@/app/contracts/[contractId]/installments/[installmentId]/check-request/route";
import { GET as getUnionCheckRequest } from "@/app/contracts/[contractId]/union-contributions/[contributionId]/check-request/route";

export const runtime = "nodejs";

type SelectedCheckRequest =
  | { kind: "installment"; contractId: string; itemId: string }
  | { kind: "union"; contractId: string; itemId: string };

function parseItem(value: FormDataEntryValue): SelectedCheckRequest | null {
  if (typeof value !== "string") return null;
  const [kind, contractId, itemId] = value.split(":");
  if (!contractId || !itemId) return null;
  if (kind === "installment") return { kind, contractId, itemId };
  if (kind === "union") return { kind, contractId, itemId };
  return null;
}

export async function POST(request: Request) {
  const access = await getAccessContext();
  if (!access.userId) return NextResponse.redirect(new URL("/login", request.url));
  if (!["admin", "project_manager"].includes(access.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const formData = await request.formData();
  const selected = formData
    .getAll("items")
    .map(parseItem)
    .filter((item): item is SelectedCheckRequest => Boolean(item));

  if (selected.length === 0) {
    return new NextResponse("Select at least one check request.", { status: 400 });
  }
  if (selected.length > 50) {
    return new NextResponse("Select no more than 50 check requests at a time.", { status: 400 });
  }

  const merged = await PDFDocument.create();
  for (const item of selected) {
    const response =
      item.kind === "installment"
        ? await getInstallmentCheckRequest(request, {
            params: Promise.resolve({ contractId: item.contractId, installmentId: item.itemId })
          })
        : await getUnionCheckRequest(request, {
            params: Promise.resolve({ contractId: item.contractId, contributionId: item.itemId })
          });

    if (!response.ok) {
      const detail = (await response.text()).trim();
      return new NextResponse(detail || "One of the selected check requests could not be generated.", {
        status: response.status
      });
    }

    const source = await PDFDocument.load(await response.arrayBuffer());
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

    const bytes = await merged.save({ useObjectStreams: false });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="contract-check-requests-${date}.pdf"`,
      "Cache-Control": "no-store"
    }
  });
}
