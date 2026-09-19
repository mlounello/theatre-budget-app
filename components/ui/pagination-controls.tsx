import Link from "next/link";

export function PaginationControls({
  page,
  totalPages,
  totalCount,
  itemLabel = "items",
  hrefForPage
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  itemLabel?: string;
  hrefForPage: (page: number) => string;
}) {
  return (
    <nav className="uiPagination" aria-label={`${itemLabel} pages`}>
      <p>
        Page {page} of {totalPages} · {totalCount} {itemLabel}
      </p>
      <div>
        {page > 1 ? (
          <Link className="buttonLink" href={hrefForPage(page - 1)} rel="prev">
            Previous
          </Link>
        ) : (
          <span className="buttonLink isDisabled" aria-disabled="true">
            Previous
          </span>
        )}
        {page < totalPages ? (
          <Link className="buttonLink" href={hrefForPage(page + 1)} rel="next">
            Next
          </Link>
        ) : (
          <span className="buttonLink isDisabled" aria-disabled="true">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
