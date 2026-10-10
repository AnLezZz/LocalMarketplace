import { convexAuthNextjsMiddleware, createRouteMatcher, nextjsMiddlewareRedirect } from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/signin"]);
const needsSignIn = createRouteMatcher(["/account", "/favourites", "/notifications", "/provider", "/provider/(.*)", "/bookings", "/bookings/(.*)", "/admin", "/admin/(.*)"]);

// Only a convenience redirect. The real enforcement is in the Convex functions.
export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const signedIn = await convexAuth.isAuthenticated();
  if (isSignInPage(request) && signedIn) return nextjsMiddlewareRedirect(request, "/");
  if (needsSignIn(request) && !signedIn) return nextjsMiddlewareRedirect(request, "/signin");
});

export const config = { matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"] };
