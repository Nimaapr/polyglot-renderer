import { App, MarkdownView, TFile, setIcon } from "obsidian";
import type { FormatRegistry } from "registry/format-registry";

const PROCESSED_ATTR = "data-polyglot-embed";

/**
 * Sets up a MutationObserver on the workspace container that watches for
 * newly added .internal-embed elements and attaches render toggles.
 * Returns a disconnect function for cleanup on plugin unload.
 */
export function startEmbedObserver(
	app: App,
	registry: FormatRegistry
): () => void {
	const workspaceEl = (app.workspace as unknown as { containerEl: HTMLElement }).containerEl;
	if (!workspaceEl) return () => { /* no-op */ };

	// Process any embeds already in the DOM
	scanForEmbeds(workspaceEl, app, registry);

	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (let i = 0; i < mutation.addedNodes.length; i++) {
				const node = mutation.addedNodes[i];
				if (node instanceof HTMLElement) {
					scanForEmbeds(node, app, registry);
				}
			}
		}
	});

	observer.observe(workspaceEl, { childList: true, subtree: true });

	return () => observer.disconnect();
}

/**
 * Post-processor entry point. Scans the given element for embeds.
 */
export function processEmbeds(
	el: HTMLElement,
	app: App,
	registry: FormatRegistry
): void {
	scanForEmbeds(el, app, registry);
}

function scanForEmbeds(
	root: HTMLElement,
	app: App,
	registry: FormatRegistry
): void {
	const candidates: HTMLElement[] = [];

	if (root.matches && root.matches(`.internal-embed:not([${PROCESSED_ATTR}])`)) {
		candidates.push(root);
	}

	const children = root.querySelectorAll<HTMLElement>(
		`.internal-embed:not([${PROCESSED_ATTR}])`
	);
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child) candidates.push(child);
	}

	for (const embed of candidates) {
		const src = embed.getAttribute("src");
		if (!src) continue;

		const ext = src.split(".").pop()?.toLowerCase();
		if (!ext) continue;

		const renderer = registry.getByExtension(ext);
		if (!renderer || !renderer.renderEmbed) continue;

		embed.setAttribute(PROCESSED_ATTR, "");
		attachToggle(embed, src, app, renderer.renderEmbed.bind(renderer));
	}
}

function attachToggle(
	embed: HTMLElement,
	src: string,
	app: App,
	renderEmbed: (content: string, container: HTMLElement) => void
): void {
	embed.style.position = "relative";

	const btn = embed.createEl("button", {
		cls: "polyglot-embed-toggle",
		attr: { "aria-label": "Render inline" },
	});
	btn.style.cssText =
		"position:absolute;top:4px;right:4px;z-index:10;" +
		"cursor:pointer;background:var(--background-secondary);" +
		"border:1px solid var(--background-modifier-border);" +
		"border-radius:4px;padding:4px;display:flex;align-items:center;" +
		"color:var(--text-muted);";
	setIcon(btn, "eye");

	let rendered = false;
	let renderContainer: HTMLElement | null = null;
	let savedChildren: Node[] = [];

	btn.addEventListener("click", (evt) => {
		evt.preventDefault();
		evt.stopPropagation();

		if (rendered) {
			// Collapse: remove rendered content, restore original children
			if (renderContainer) {
				renderContainer.remove();
				renderContainer = null;
			}
			for (const child of savedChildren) {
				embed.insertBefore(child, btn);
			}
			savedChildren = [];
			setIcon(btn, "eye");
			btn.setAttribute("aria-label", "Render inline");
			rendered = false;
		} else {
			// Save and remove original children (except the toggle button)
			savedChildren = [];
			const nodesToRemove: Node[] = [];
			for (let i = 0; i < embed.childNodes.length; i++) {
				const node = embed.childNodes[i];
				if (node && node !== btn) {
					savedChildren.push(node);
					nodesToRemove.push(node);
				}
			}
			for (const node of nodesToRemove) {
				embed.removeChild(node);
			}

			renderContainer = embed.createEl("div", {
				cls: "polyglot-embed-content",
			});

			const file = app.metadataCache.getFirstLinkpathDest(src, "");
			if (file && file instanceof TFile) {
				void app.vault.cachedRead(file).then((content) => {
					if (renderContainer) {
						renderEmbed(content, renderContainer);
					}
				});
			}

			setIcon(btn, "eye-off");
			btn.setAttribute("aria-label", "Collapse");
			rendered = true;
		}
	});
}
