import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Traffic RakeBet",
    short_name: "Traffic RakeBet",
    description: "Painel de gastos de Meta Ads por BM e conta de anúncio",
    start_url: "/",
    display: "standalone",
    background_color: "#131318",
    theme_color: "#131318",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
