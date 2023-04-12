
import NextAuth, { User } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

export const authOptions = {
  secret: process.env.AUTH_SECRET,
  providers: [
    CredentialsProvider({
      // The name to display on the sign in form (e.g. "Sign in with...")
      name: "Password",
      // `credentials` is used to generate a form on the sign in page.
      // You can specify which fields should be submitted, by adding keys to the `credentials` object.
      // e.g. domain, username, password, 2FA token, etc.
      // You can pass any HTML attribute to the <input> tag through the object.
      credentials: {
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if (credentials?.password !== process.env.PASSWORD) {
          return null;
        }
        return { email: "yay" } as User;
      }
    }),
  ],
}

export default NextAuth(authOptions)