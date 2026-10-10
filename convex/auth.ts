import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { passwordProfile } from "./model/profile";
import { authEmailAvailable, codeProvider, verificationRequired } from "./model/authEmail";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      // Convex values cannot be `undefined`, so drop an absent name rather than pass it through.
      profile: (params) => {
        const { name, ...rest } = passwordProfile(params);
        return name === undefined ? rest : { ...rest, name };
      },
      // Reset needs a way to deliver a code. Verification is a separate switch (REQUIRE_EMAIL_VERIFICATION):
      // turning it on makes every account without a verified email enter a code at its next sign-in.
      reset: authEmailAvailable() ? codeProvider("password-reset", "Reset your Localo password", "Use this code to choose a new password for your Localo account.") : undefined,
      verify: verificationRequired() ? codeProvider("email-verify", "Verify your Localo email", "Use this code to confirm your email address and finish signing in.") : undefined,
    }),
  ],
});
