import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const accept = request.headers.get("accept") || "";

  // Apply only to document navigations.
  if (accept.includes("text/html")) {
    // Force clients to fetch fresh app shell/assets metadata.
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");

    // Clear browser-side state for this origin so stale cookies/cache are removed automatically.
    response.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"]
};
