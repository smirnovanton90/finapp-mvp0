import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

async function refreshGoogleToken(token: any) {
  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshed = await response.json();

    if (!response.ok) {
      throw refreshed;
    }

    return {
      ...token,
      accessToken: refreshed.access_token ?? token.accessToken,
      idToken: refreshed.id_token ?? token.idToken,
      expiresAt: refreshed.expires_in
        ? Date.now() + refreshed.expires_in * 1000
        : token.expiresAt,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // важно: чтобы Google точно возвращал id_token
      authorization: {
        params: {
          scope: "openid email profile",
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // account доступен только при логине/обновлении     
      if (account) {
        (token as any).idToken = (account as any).id_token;
        (token as any).accessToken = (account as any).access_token;
        (token as any).refreshToken =
          (account as any).refresh_token ?? (token as any).refreshToken;
        (token as any).expiresAt = (account as any).expires_at
          ? (account as any).expires_at * 1000
          : (account as any).expires_in
            ? Date.now() + (account as any).expires_in * 1000
            : (token as any).expiresAt;
        return token;
      }

      if (
        (token as any).expiresAt &&
        Date.now() < (token as any).expiresAt - TOKEN_REFRESH_BUFFER_MS
      ) {
        return token;
      }

      if (!(token as any).refreshToken) {
        return token;
      }

      return refreshGoogleToken(token);
    },
    async session({ session, token }) {
      // прокидываем idToken в session, чтобы фронт мог его взять
      (session as any).idToken = (token as any).idToken;
      return session;
    },
  },
});

export { handler as GET, handler as POST };