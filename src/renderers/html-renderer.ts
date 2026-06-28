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
			iframe.setAttribute("sandbox", "allow-scripts");
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

	iframe.setAttribute("sandbox", "allow-scripts");
	iframe.setAttribute("referrerpolicy", "no-referrer");
	iframe.setAttribute("scrolling", "no");
	iframe.srcdoc = buildSandboxDocument(source);

	attachResizeListener(iframe, container);

	return iframe;
}

/**
 * Auto-resizes a sandboxed iframe from height reports the frame posts about
 * itself. The frame runs in an opaque origin (no allow-same-origin), so its
 * contentDocument cannot be read from here; instead buildSandboxDocument
 * injects a script that measures its own height and posts
 * { type: "polyglot-resize", height } to the parent.
 *
 * Messages are matched by frame identity (e.source === iframe.contentWindow),
 * which stays readable cross-origin even though contentDocument does not.
 * The listener is torn down once the iframe leaves the DOM, reusing a cleanup
 * MutationObserver on the container.
 */
function attachResizeListener(
	iframe: HTMLIFrameElement,
	container: HTMLElement
): void {
	const onMessage = (e: MessageEvent) => {
		if (e.source !== iframe.contentWindow) {
			return;
		}
		if (e.data?.type !== "polyglot-resize") {
			return;
		}
		const height = Number(e.data.height);
		if (Number.isFinite(height) && height > 0) {
			iframe.style.height = height + "px";
		}
	};

	window.addEventListener("message", onMessage);

	const cleanupObserver = new MutationObserver(() => {
		if (!iframe.isConnected) {
			window.removeEventListener("message", onMessage);
			cleanupObserver.disconnect();
		}
	});

	cleanupObserver.observe(container, { childList: true, subtree: true });
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
<script>
document.addEventListener('click', function(e) {
	var a = e.target.closest('a[href]');
	if (!a) return;
	var href = a.getAttribute('href');
	if (!href) return;
	e.preventDefault();
	e.stopPropagation();
	if (href.charAt(0) === '#') {
		// Hash link: scroll to the target element manually
		// (default navigation breaks in srcdoc iframes on Electron)
		var target = document.querySelector(href);
		if (target) target.scrollIntoView({behavior: 'smooth'});
	} else {
		// External link: ask parent to open in system browser
		window.parent.postMessage({type: 'polyglot-open-url', url: href}, '*');
	}
});

// Self-measure and report height to the parent. The frame is sandboxed
// without allow-same-origin, so the parent cannot read this document; it
// resizes the iframe from these messages instead.
(function() {
	function reportHeight() {
		var de = document.documentElement;
		var body = document.body;
		var height = Math.max(
			de ? de.scrollHeight : 0,
			body ? body.scrollHeight : 0,
			de ? de.offsetHeight : 0,
			body ? body.offsetHeight : 0
		);
		window.parent.postMessage({type: 'polyglot-resize', height: height}, '*');
	}
	document.addEventListener('DOMContentLoaded', reportHeight);
	window.addEventListener('load', reportHeight);
	if (typeof ResizeObserver !== 'undefined') {
		new ResizeObserver(reportHeight).observe(document.documentElement);
	}
	// Images change layout once they finish loading; capture so we see
	// load/error for every <img> without per-element listeners.
	document.addEventListener('load', function(e) {
		if (e.target && e.target.tagName === 'IMG') reportHeight();
	}, true);
	document.addEventListener('error', function(e) {
		if (e.target && e.target.tagName === 'IMG') reportHeight();
	}, true);
})();
</script>
</head>
<body>${source}</body>
</html>`;
}
