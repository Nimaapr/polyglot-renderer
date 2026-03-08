import type { PolyglotSettings } from "../settings";

export function renderHtmlBlock(
	source: string,
	container: HTMLElement,
	settings: PolyglotSettings
): void {
	if (!settings.enableInlineHtml) {
		const pre = container.createEl("pre");
		pre.createEl("code", { text: source });
		return;
	}

	if (settings.htmlSecurityMode === "trusted") {
		const wrapper = container.createDiv({ cls: "polyglot-html-trusted" });
		wrapper.innerHTML = source;
		return;
	}

	// Sandboxed mode (default): strip scripts, render in a contained div
	const wrapper = container.createDiv({ cls: "polyglot-html-sandbox" });
	wrapper.innerHTML = sanitizeHtml(source);
}

/**
 * Basic sanitizer: strips <script>, <iframe>, <object>, <embed>, <form>,
 * and on* event handler attributes.
 */
function sanitizeHtml(html: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");

	// Remove dangerous elements
	const dangerous = doc.querySelectorAll("script, iframe, object, embed, form, link[rel=import]");
	dangerous.forEach((el) => el.remove());

	// Remove event handler attributes from all elements
	const allElements = doc.body.querySelectorAll("*");
	allElements.forEach((el) => {
		const attrs = Array.from(el.attributes);
		for (const attr of attrs) {
			if (attr.name.startsWith("on") || attr.value.trimStart().startsWith("javascript:")) {
				el.removeAttribute(attr.name);
			}
		}
	});

	return doc.body.innerHTML;
}
