import type { FormatRenderer } from "registry/format-renderer";
import type { PolyglotSettings } from "settings";

const IFRAME_ATTR = "data-polyglot-iframe";

export const htmlRenderer: FormatRenderer = {
	lang: "html",
	extensions: ["html", "htm"],
	icon: "code",

	renderInline(source: string, container: HTMLElement, settings: PolyglotSettings): void {
		if (!settings.enableInlineHtml) {
			const pre = container.createEl("pre");
			pre.createEl("code", { text: source });
			return;
		}
		createSandboxedIframe(source, container);
	},

	renderEmbed(content: string, container: HTMLElement): void {
		createSandboxedIframe(content, container);
	},

	renderFile(content: string, container: HTMLElement): void {
		// Reuse existing iframe if present, otherwise create one
		let iframe = container.querySelector<HTMLIFrameElement>(`iframe[${IFRAME_ATTR}]`);
		if (iframe) {
			iframe.srcdoc = buildSandboxDocument(content);
		} else {
			iframe = container.createEl("iframe", { cls: "polyglot-html-file-iframe" });
			iframe.setAttribute(IFRAME_ATTR, "");
			iframe.setAttribute("sandbox", "allow-same-origin");
			iframe.setAttribute("referrerpolicy", "no-referrer");
			iframe.srcdoc = buildSandboxDocument(content);
		}
	},
};

/**
 * Creates a sandboxed iframe with auto-resize, suitable for
 * inline code blocks and embed post-processing.
 */
export function createSandboxedIframe(
	source: string,
	container: HTMLElement
): HTMLIFrameElement {
	const iframe = container.createEl("iframe", {
		cls: "polyglot-html-sandbox",
	});

	iframe.setAttribute("sandbox", "allow-same-origin");
	iframe.setAttribute("referrerpolicy", "no-referrer");
	iframe.setAttribute("scrolling", "no");
	iframe.srcdoc = buildSandboxDocument(source);

	let resizeObserver: ResizeObserver | null = null;

	iframe.addEventListener(
		"load",
		() => {
			const doc = iframe.contentDocument;
			if (!doc) {
				return;
			}

			resizeIframe(iframe);

			if (typeof ResizeObserver !== "undefined") {
				resizeObserver = new ResizeObserver(() => resizeIframe(iframe));
				resizeObserver.observe(doc.documentElement);
			}

			for (const image of Array.from(doc.images)) {
				image.addEventListener("load", () => resizeIframe(iframe));
				image.addEventListener("error", () => resizeIframe(iframe));
			}
		},
		{ once: true }
	);

	const cleanupObserver = new MutationObserver(() => {
		if (!iframe.isConnected) {
			resizeObserver?.disconnect();
			cleanupObserver.disconnect();
		}
	});

	cleanupObserver.observe(container, { childList: true, subtree: true });

	return iframe;
}

export function buildSandboxDocument(source: string): string {
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
	:root {
		color-scheme: light dark;
	}
	body {
		margin: 0;
		padding: 8px;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	}
	img, svg, video, canvas {
		max-width: 100%;
	}
	pre {
		white-space: pre-wrap;
	}
</style>
</head>
<body>${source}</body>
</html>`;
}

function resizeIframe(iframe: HTMLIFrameElement): void {
	const doc = iframe.contentDocument;
	if (!doc) {
		return;
	}

	const height = Math.max(
		doc.documentElement.scrollHeight,
		doc.body?.scrollHeight ?? 0,
		doc.documentElement.offsetHeight,
		doc.body?.offsetHeight ?? 0
	);

	iframe.style.height = height + "px";
}
