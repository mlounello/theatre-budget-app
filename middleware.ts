import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const VIEW_AS_COOKIE = "tba_view_as";

function viewAsRole(request: NextRequest): "viewer" | "procurement_tracker" | null {
  const token = request.cookies.get(VIEW_AS_COOKIE)?.value;
  const encoded = token?.split(".")[0];
  if (!encoded) return null;
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(normalized)) as { targetRole?: unknown; expiresAt?: unknown };
    if (Number(payload.expiresAt ?? 0) <= Date.now()) return null;
    return payload.targetRole === "viewer" || payload.targetRole === "procurement_tracker"
      ? payload.targetRole
      : null;
  } catch {
    return null;
  }
}

const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/auth/denied",
  "/api/auth/magic-link",
  "/api/calendar/contracts",
  "/api/integrations/production-management/budget-access-link"
];

export async function middleware(request: NextRequest) {
  type CookieToSet = { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] };
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  let user = null;
  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    });

    const {
      data: { user: resolvedUser }
    } = await supabase.auth.getUser();
    user = resolvedUser;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 160) : "unknown";
    console.warn("[middleware] auth.getUser failed", {
      pathname: request.nextUrl.pathname,
      message
    });
    user = null;
  }

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const isAsset = pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.includes(".");
  const impersonatedRole = viewAsRole(request);

  if (impersonatedRole && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    return new NextResponse("View as User is read-only. Exit impersonation to make changes.", { status: 403 });
  }

  if (impersonatedRole && !isAsset) {
    const isExit = pathname === "/api/admin/impersonation/exit";
    const isAllowed =
      isExit ||
      (impersonatedRole === "viewer" && (pathname === "/" || pathname === "/my-budget")) ||
      (impersonatedRole === "procurement_tracker" && pathname === "/procurement-tracker");
    if (!isAllowed) {
      const url = request.nextUrl.clone();
      url.pathname = impersonatedRole === "procurement_tracker" ? "/procurement-tracker" : "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (!user && !isPublic && !isAsset) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
