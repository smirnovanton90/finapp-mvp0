import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const BACKEND_BASE =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:8000";

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
      // Р?Р°РР?Р?: С╪С'Р?Р+С< Google С'Р?С╪Р?Р? Р?Р?Р·Р?С?Р°С%Р°Р> id_token
      authorization: {
        params: {
          scope: "openid email profile",
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        login: { label: "Login", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const login = credentials?.login?.trim();
        const password = credentials?.password ?? "";
        if (!login || !password) return null;

        const response = await fetch(`${BACKEND_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login, password }),
        });

        if (!response.ok) return null;

        const data = await response.json();
        return {
          id: String(data.user?.id ?? ""),
          name: data.user?.name ?? data.user?.login ?? login,
          login: data.user?.login ?? login,
          idToken: data.access_token,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      // account Р?Р?С?С'С?РїРчР? С'Р?Р>С?РєР? РїС?Рё Р>Р?Р?РёР?Рч/Р?Р+Р?Р?Р?Р>РчР?РёРё
      if (account?.provider === "google") {
        (token as any).provider = "google";
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

      if ((user as any)?.idToken) {
        (token as any).provider = account?.provider ?? "credentials";
        (token as any).idToken = (user as any).idToken;
        return token;
      }

      if ((token as any).provider !== "google") {
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
      // РїС?Р?РєРёР?С<Р?Р°РчР? idToken Р? session, С╪С'Р?Р+С< С"С?Р?Р?С' Р?Р?Р? РчР?Р? Р?Р·С?С'С?
      (session as any).idToken = (token as any).idToken;
      if (session.user) {
        (session.user as any).id = token.sub ?? (session.user as any).id;
      } else {
        (session as any).user = { id: token.sub };
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
