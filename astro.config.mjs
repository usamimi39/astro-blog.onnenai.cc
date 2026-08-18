// @ts-check

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig, fontProviders } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

import rehypeEmbed from './src/plugins/rehype-embed/index.mjs';
import ogImages from './src/integrations/og-images.mjs';

// https://astro.build/config
export default defineConfig({
  site: "https://example.com",
  integrations: [mdx(), sitemap(), ogImages()],

  // 本文中の「URL だけの段落」を YouTube / Spotify / Twitter / Misskey の
  // 埋め込みに自動変換する。MDX も markdown 設定を継承するため両方に適用される。
  markdown: {
    rehypePlugins: [rehypeEmbed],
  },

  fonts: [
    {
      provider: fontProviders.local(),
      name: "Atkinson",
      cssVariable: "--font-atkinson",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/atkinson-regular.woff"],
            weight: 400,
            style: "normal",
            display: "swap",
          },
          {
            src: ["./src/assets/fonts/atkinson-bold.woff"],
            weight: 700,
            style: "normal",
            display: "swap",
          },
        ],
      },
    },
    {
      provider: fontProviders.google(),
      name: "Noto Sans JP",
      cssVariable: "--font-noto-sans-jp",
      weights: [400, 700],
      subsets: ["japanese"],
      fallbacks: [
        "Hiragino Kaku Gothic ProN",
        "Hiragino Sans",
        "Yu Gothic",
        "YuGothic",
        "Meiryo",
        "sans-serif",
      ],
    },
  ],

  adapter: cloudflare({
    imageService: 'compile'
  }),
});
