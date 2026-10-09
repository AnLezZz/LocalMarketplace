import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { passwordProfile } from "./model/profile";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      // Convex values cannot be `undefined`, so drop an absent name rather than pass it through.
      profile: (params) => {
        const { name, ...rest } = passwordProfile(params);
        return name === undefined ? rest : { ...rest, name };
      },
    }),
  ],
});
