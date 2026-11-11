// @ts-check

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

import rehypeEmbed from './src/plugins/rehype-embed/index.mjs';
import ogImages from './src/integrations/og-images.mjs';

// https://astro.build/config
export default defineConfig({
  site: "https://blog.onnenai.cc",
  integrations: [mdx(), sitemap(), ogImages()],

  // 本文中の「URL だけの段落」を YouTube / Spotify / Twitter / Misskey の
  // 埋め込みに自動変換する。MDX も markdown 設定を継承するため両方に適用される。
  markdown: {
    rehypePlugins: [rehypeEmbed],
  },


  adapter: cloudflare({
    imageService: 'compile'
  }),
});
