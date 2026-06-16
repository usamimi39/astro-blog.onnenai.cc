// @ts-check
import { h } from 'hastscript';
import { SKIP, visit } from 'unist-util-visit';
import { renderEmbed } from './providers.mjs';

/**
 * 「URL だけの段落」を各 Web サービスの埋め込みに自動変換する rehype プラグイン。
 *
 * Markdown / MDX 本文に対象サービスの URL を単独の行で貼ると、GFM の
 * オートリンクによって `<p><a href="URL">URL</a></p>` という HAST になる。
 * この形（= 裸の URL のみで構成された段落）を検出し、対応する埋め込み
 * （iframe / blockquote など）に置き換える。
 *
 * 対応: YouTube / Spotify / Twitter(X) / Misskey （providers.mjs で拡張可能）
 */
export default function rehypeEmbed() {
	return (tree) => {
		/** 外部スクリプトの重複読み込みを防ぐための Map（src => 属性） */
		const ctx = { scripts: new Map() };

		visit(tree, 'element', (node, index, parent) => {
			if (node.tagName !== 'p' || !parent || index === null) return;

			// 空白のみのテキストを除いた実質的な子要素を取り出す
			const children = node.children.filter(
				(c) => !(c.type === 'text' && c.value.trim() === ''),
			);
			if (children.length !== 1) return;

			const anchor = children[0];
			if (anchor.type !== 'element' || anchor.tagName !== 'a') return;

			const href = anchor.properties?.href;
			if (typeof href !== 'string') return;

			// 裸のリンク（リンク文字列が href と一致）だけを対象にする。
			// 任意のテキストを持つリンクは変換しない（意図しない置換を防ぐ）。
			const text = anchor.children
				.filter((c) => c.type === 'text')
				.map((c) => c.value)
				.join('')
				.trim();
			if (text !== '' && text !== href) return;

			const embed = renderEmbed(href, ctx);
			if (!embed) return;

			parent.children[index] = embed;
			return [SKIP, index];
		});

		// 必要だった外部スクリプトをドキュメント末尾に一度だけ追加する
		if (ctx.scripts.size > 0 && Array.isArray(tree.children)) {
			for (const attrs of ctx.scripts.values()) {
				tree.children.push(h('script', attrs));
			}
		}
	};
}
