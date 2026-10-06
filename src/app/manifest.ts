import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hotmart",
    short_name: "Hotmart",
    description: "Hotmart",
    start_url: "/",
    display: "standalone",
    background_color: "#FF5400",
    theme_color: "#FF5400",
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
