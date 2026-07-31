import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session at the edge and returns the current user.
 * Standard @supabase/ssr middleware pattern: cookies flow through the response so
 * access tokens stay fresh. The caller scopes this to /merchant, so the tourism
 * site never pays the auth cost.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() re-validates the JWT with Supabase (unlike getSession, which only
  // reads the cookie), so this is the trustworthy check.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
