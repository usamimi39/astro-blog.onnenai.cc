// @ts-check
import { h } from 'hastscript';

/**
 * 埋め込み対応プロバイダーの定義。
 *
 * 各プロバイダーは以下を持つ:
 *  - name:  識別用の名前
 *  - match: (url: URL) => データ or null   URL を解析しマッチすればデータを返す
 *  - render: (data, ctx) => hast ノード     埋め込み用の hast 要素を返す
 *
 * `ctx.scripts` は Set で、外部スクリプトを一度だけ読み込むための重複排除に使う。
 * render 内で `ctx.scripts.add(src)` するとドキュメント末尾に <script src> が
 * 1 本だけ追加される。
 */

/**
 * Misskey は連合型で多数のインスタンスが存在するため、URL だけでは
 * 任意サイトの `/notes/xxx` と区別できない。誤検出を避けるため
 * ホスト名のallowlistで判定する。自分の使うインスタンスをここに追加する。
 */
const MISSKEY_HOSTS = new Set([
	'social.onnenai.cc', // 自分のインスタンス
	'misskey.io',
	'misskey.design',
	'misskey.systems',
	'mk.absturztau.be',
	'submisskey.org',
]);

/** 16:9 のレスポンシブ iframe を div でラップして返す */
function responsiveIframe(src, { title, allow } = {}) {
	return h('div', { class: 'embed embed--video' }, [
		h('iframe', {
			src,
			title: title ?? 'embed',
			loading: 'lazy',
			frameborder: '0',
			allow:
				allow ??
				'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
			allowfullscreen: true,
			referrerpolicy: 'strict-origin-when-cross-origin',
		}),
	]);
}

/** @type {Array<{name: string, match: (url: URL) => any, render: (data: any, ctx: any) => any}>} */
export const providers = [
	// ---- YouTube --------------------------------------------------------
	{
		name: 'youtube',
		match(url) {
			const host = url.hostname.replace(/^www\./, '');
			let id = null;
			if (host === 'youtu.be') {
				id = url.pathname.slice(1);
			} else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
				if (url.pathname === '/watch') id = url.searchParams.get('v');
				else {
					const m = url.pathname.match(/^\/(?:embed|shorts|v)\/([^/?#]+)/);
					if (m) id = m[1];
				}
			}
			if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
			const start = url.searchParams.get('t') ?? url.searchParams.get('start');
			return { id, start: start ? String(parseInt(start, 10) || 0) : null };
		},
		render({ id, start }) {
			const params = new URLSearchParams();
			if (start) params.set('start', start);
			const qs = params.toString();
			const src = `https://www.youtube-nocookie.com/embed/${id}${qs ? `?${qs}` : ''}`;
			return responsiveIframe(src, { title: 'YouTube video player' });
		},
	},

	// ---- Spotify --------------------------------------------------------
	{
		name: 'spotify',
		match(url) {
			if (url.hostname.replace(/^www\./, '') !== 'open.spotify.com') return null;
			const m = url.pathname.match(/^\/(?:intl-\w+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);
			if (!m) return null;
			return { type: m[1], id: m[2] };
		},
		render({ type, id }) {
			const compact = type === 'track' || type === 'episode';
			return h('div', { class: 'embed embed--spotify' }, [
				h('iframe', {
					src: `https://open.spotify.com/embed/${type}/${id}`,
					title: 'Spotify',
					width: '100%',
					height: compact ? 152 : 352,
					loading: 'lazy',
					frameborder: '0',
					allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
					style: 'border-radius:12px',
				}),
			]);
		},
	},

	// ---- Twitter / X ----------------------------------------------------
	{
		name: 'twitter',
		match(url) {
			const host = url.hostname.replace(/^www\./, '');
			if (host !== 'twitter.com' && host !== 'x.com' && host !== 'mobile.twitter.com') return null;
			const m = url.pathname.match(/^\/([^/]+)\/status(?:es)?\/(\d+)/);
			if (!m) return null;
			return { user: m[1], id: m[2] };
		},
		render({ user, id }, ctx) {
			ctx.scripts.set('https://platform.twitter.com/widgets.js', {
				src: 'https://platform.twitter.com/widgets.js',
				async: true,
			});
			return h('div', { class: 'embed embed--tweet' }, [
				h('blockquote', { class: 'twitter-tweet', 'data-dnt': 'true' }, [
					h('a', { href: `https://twitter.com/${user}/status/${id}` }, `https://twitter.com/${user}/status/${id}`),
				]),
			]);
		},
	},

	// ---- Misskey --------------------------------------------------------
	{
		name: 'misskey',
		match(url) {
			if (!MISSKEY_HOSTS.has(url.hostname)) return null;
			const m = url.pathname.match(/^(?:\/embed)?\/notes\/([0-9a-z]+)\/?$/i);
			if (!m) return null;
			return { host: url.hostname, id: m[1] };
		},
		render({ host, id }, ctx) {
			// embed.js は対象 iframe を data-misskey-embed-id で特定し高さを自動調整する。
			// defer 付きでホスト毎に 1 本だけ読み込む（公式の埋め込みコードに準拠）。
			ctx.scripts.set(`https://${host}/embed.js`, {
				src: `https://${host}/embed.js`,
				defer: true,
			});
			const embedId = `v1_${Math.random().toString(36).slice(2, 12)}`;
			return h('div', { class: 'embed embed--misskey' }, [
				h('iframe', {
					src: `https://${host}/embed/notes/${id}`,
					'data-misskey-embed-id': embedId,
					loading: 'lazy',
					referrerpolicy: 'strict-origin-when-cross-origin',
					style:
						'border: none; width: 100%; max-width: 500px; height: 300px; color-scheme: light dark;',
				}),
			]);
		},
	},
];

/**
 * URL 文字列を各プロバイダーに照合し、最初にマッチしたものの埋め込みノードを返す。
 * @returns {any | null} hast ノード、マッチしなければ null
 */
export function renderEmbed(href, ctx) {
	let url;
	try {
		url = new URL(href);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	for (const provider of providers) {
		const data = provider.match(url);
		if (data) return provider.render(data, ctx);
	}
	return null;
}
