import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FinApp — финансы",
    short_name: "FinApp",
    description: "Учёт активов, транзакций и планирование финансов",
    start_url: "/",
    display: "standalone",
    background_color: "#1E2128",
    theme_color: "#1E2128",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
        purpose: "any",
      },
      {
        src: "/favicon.ico",
        sizes: "192x192",
        type: "image/x-icon",
        purpose: "any",
      },
      {
        src: "/favicon.ico",
        sizes: "512x512",
        type: "image/x-icon",
        purpose: "any",
      },
    ],
  };
}
