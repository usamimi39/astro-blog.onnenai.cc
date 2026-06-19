/**
 * リンクカード用に、対象ページの OGP メタデータを取得するユーティリティ。
 *
 * ブログ記事は getStaticPaths による静的生成なので、この fetch は
 * ビルド時に 1 回だけ走る（実行時コスト・クライアント JS はゼロ）。
 * 同一 URL の重複 fetch を避けるため、ビルドプロセス内で Promise をメモ化する。
 */

export type Ogp = {
	url: string;
	title: string;
	description: string;
	image?: string;
	favicon?: string;
	siteName?: string;
};

const cache = new Map<string, Promise<Ogp>>();

/** 対象 URL の OGP を取得する（ビルド時メモ化付き） */
export function fetchOgp(url: string): Promise<Ogp> {
	let p = cache.get(url);
	if (!p) {
		p = load(url);
		cache.set(url, p);
	}
	return p;
}

async function load(rawUrl: string): Promise<Ogp> {
	const host = safeHost(rawUrl);
	// 取得失敗時にも最低限カードとして成立するフォールバック。
	const fallback: Ogp = {
		url: rawUrl,
		title: rawUrl,
		description: '',
		siteName: host,
		favicon: host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : undefined,
	};

	try {
		const ac = new AbortController();
		const timer = setTimeout(() => ac.abort(), 8000);
		const res = await fetch(rawUrl, {
			headers: {
				// bot 判定で 403 を返すサイトがあるため UA を明示する。
				'user-agent': 'Mozilla/5.0 (compatible; blog-linkcard/1.0; +https://onnenai.cc)',
				accept: 'text/html,application/xhtml+xml',
			},
			signal: ac.signal,
			redirect: 'follow',
		}).finally(() => clearTimeout(timer));

		if (!res.ok) return fallback;

		// <head> に必要な情報が収まるため、巨大ページの全読み込みは避ける。
		const html = (await res.text()).slice(0, 500_000);

		const meta = (key: string): string | undefined => {
			// property / name のどちらでも、content が前後どちらの順でも拾う。
			const re = new RegExp(
				`<meta[^>]+(?:property|name)=["']${escapeRe(key)}["'][^>]*>`,
				'i',
			);
			const tag = html.match(re)?.[0];
			if (!tag) return undefined;
			return decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1]?.trim());
		};

		const titleTag = decodeEntities(
			html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim(),
		);

		const abs = (u?: string): string | undefined => {
			if (!u) return undefined;
			try {
				return new URL(u, rawUrl).href;
			} catch {
				return undefined;
			}
		};

		return {
			url: rawUrl,
			title: meta('og:title') || titleTag || rawUrl,
			description: meta('og:description') || meta('description') || '',
			image: abs(meta('og:image') || meta('og:image:url') || meta('twitter:image')),
			siteName: meta('og:site_name') || host || undefined,
			// data: や空アイコンを宣言するサイトがあるため、http(s) のみ採用し
			// それ以外は Google の favicon サービスにフォールバックする。
			favicon: httpOnly(abs(findFavicon(html))) || fallback.favicon,
		};
	} catch {
		return fallback;
	}
}

function httpOnly(u?: string): string | undefined {
	return u && /^https?:\/\//i.test(u) ? u : undefined;
}

function findFavicon(html: string): string | undefined {
	// <link rel="icon" href="..."> / "shortcut icon" / "apple-touch-icon"
	const m = html.match(
		/<link[^>]+rel=["'][^"']*\b(?:icon|shortcut icon|apple-touch-icon)\b[^"']*["'][^>]*>/i,
	);
	if (!m) return undefined;
	return m[0].match(/href=["']([^"']*)["']/i)?.[1];
}

function safeHost(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return '';
	}
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** OGP 文字列内の最低限の HTML エンティティを復元する */
function decodeEntities(s?: string): string | undefined {
	if (!s) return s;
	return s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/&#x?[0-9a-f]+;/gi, (e) => {
			const hex = /^&#x/i.test(e);
			const code = parseInt(e.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
			return Number.isFinite(code) ? String.fromCodePoint(code) : e;
		});
}
