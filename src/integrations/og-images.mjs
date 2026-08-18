// Generates a 1200x630 OGP image per blog post (`public/og/<id>.png`) using
// astro-og-canvas, so every post gets a proper social-share card instead of
// the raw heroImage.
//
// This runs as an Astro integration hook (`astro:build:start` / dev's
// `astro:server:setup`) rather than as a prerendered endpoint route, because
// the Cloudflare adapter runs *all* prerendering — even for fully static
// routes — through a Workers (miniflare) simulation for runtime parity, and
// canvaskit-wasm (astro-og-canvas's renderer) needs real Node filesystem
// access to load its .wasm binary and font files that that sandbox can't
// reliably provide. Running here, as a plain Node build step, sidesteps
// that entirely: the PNGs are written straight into `public/`, which Astro
// then just copies into the final output like any other static asset.
import fs from 'node:fs';
import path from 'node:path';
import { generateOpenGraphImage } from 'astro-og-canvas';
import { SITE_TITLE } from '../consts.ts';

const BLOG_DIR = 'src/content/blog';
const OUTPUT_DIR = 'public/og';

const JP_FONTS = [
	'./src/assets/fonts/noto-sans-jp/NotoSansJP-Regular.ttf',
	'./src/assets/fonts/noto-sans-jp/NotoSansJP-Bold.ttf',
];

/** Minimal frontmatter reader — we only need a few flat scalar fields. */
function readFrontmatter(filePath) {
	const source = fs.readFileSync(filePath, 'utf-8');
	const frontmatter = source.split('---')[1] ?? '';
	const pick = (key) => frontmatter.match(new RegExp(`^${key}:\\s*['"]?(.+?)['"]?\\s*$`, 'm'))?.[1];
	return {
		title: pick('title'),
		pubDate: pick('pubDate'),
		heroImage: pick('heroImage'),
	};
}

async function generateAll(logger) {
	if (!fs.existsSync(BLOG_DIR)) return;
	fs.mkdirSync(OUTPUT_DIR, { recursive: true });

	const files = fs.readdirSync(BLOG_DIR).filter((file) => /\.(md|mdx)$/.test(file));

	for (const file of files) {
		const id = file.replace(/\.(md|mdx)$/, '');
		const filePath = path.posix.join(BLOG_DIR, file);
		const post = readFrontmatter(filePath);
		if (!post.title) continue;

		const formattedDate = post.pubDate
			? new Date(post.pubDate).toLocaleDateString('en-us', {
					year: 'numeric',
					month: 'short',
					day: 'numeric',
					timeZone: 'UTC',
				})
			: undefined;

		const heroImagePath = post.heroImage
			? path.posix.normalize(path.posix.join(path.posix.dirname(filePath), post.heroImage))
			: undefined;

		const buffer = await generateOpenGraphImage({
			title: post.title,
			description: formattedDate ? `${SITE_TITLE} · ${formattedDate}` : SITE_TITLE,
			// JPEG instead of the default PNG: these are photo backgrounds, and
			// PNG (lossless) makes them ~4-5x larger for no visible benefit.
			format: 'JPEG',
			quality: 82,
			fonts: JP_FONTS,
			font: {
				title: {
					families: ['Noto Sans JP'],
					weight: 'Bold',
					size: 64,
					lineHeight: 1.3,
					color: [255, 255, 255],
				},
				description: {
					families: ['Noto Sans JP'],
					weight: 'Normal',
					size: 32,
					color: [229, 233, 240],
				},
			},
			// Posts with a hero image use it as the card background;
			// posts without one fall back to a plain brand-color card.
			...(heroImagePath
				? { bgImage: { path: heroImagePath, fit: 'cover', position: 'center' } }
				: { bgGradient: [[0, 13, 138], [35, 55, 255]] }),
		});

		fs.writeFileSync(path.join(OUTPUT_DIR, `${id}.jpg`), buffer);
	}

	logger?.info(`generated ${files.length} OGP image(s) in ${OUTPUT_DIR}/`);
}

export default function ogImages() {
	return {
		name: 'og-images',
		hooks: {
			'astro:build:start': async ({ logger }) => {
				await generateAll(logger);
			},
			'astro:server:setup': async ({ logger }) => {
				await generateAll(logger);
			},
		},
	};
}
