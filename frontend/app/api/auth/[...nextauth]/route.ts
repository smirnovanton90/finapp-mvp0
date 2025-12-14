import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // важно: чтобы Google точно возвращал id_token
      authorization: { params: { scope: "openid email profile" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // account доступен только при логине/обновлении
      if (account) {
        // Google кладёт id_token именно сюда
        (token as any).idToken = (account as any).id_token;
      }
      return token;
    },
    async session({ session, token }) {
      // прокидываем idToken в session, чтобы фронт мог его взять
      (session as any).idToken = (token as any).idToken;
      return session;
    },
  },
});

export { handler as GET, handler as POST };