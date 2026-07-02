import { App, MarkdownView, TFile, setIcon } from "obsidian";
import type { FormatRegistry } from "registry/format-registry";

const PROCESSED_ATTR = "data-polyglot-embed";
const SOURCE_PATH_ATTR = "data-polyglot-source-path";
const TOGGLE_CLASS = "polyglot-embed-toggle";

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

			// Reading view loads embed content asynchronously and replaces the
			// embed's children once the file resolves, which removes a toggle
			// attached earlier. Re-ensure the toggle on the embed whose subtree
			// just changed so it reappears (this is why it previously showed in
			// live preview but not reading view).
			const target = mutation.target;
			if (target instanceof HTMLElement) {
				const embed = target.closest<HTMLElement>(".internal-embed");
				if (embed) ensureEmbedToggle(embed, app, registry);
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
	registry: FormatRegistry,
	sourcePath?: string
): void {
	scanForEmbeds(el, app, registry, sourcePath);
}

function scanForEmbeds(
	root: HTMLElement,
	app: App,
	registry: FormatRegistry,
	sourcePath?: string
): void {
	const candidates: HTMLElement[] = [];

	if (root.matches && root.matches(".internal-embed")) {
		candidates.push(root);
	}

	const children = root.querySelectorAll<HTMLElement>(".internal-embed");
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child) candidates.push(child);
	}

	for (const embed of candidates) {
		ensureEmbedToggle(embed, app, registry, sourcePath);
	}
}

/**
 * Ensures a single render toggle is present on a renderable embed.
 *
 * Idempotent and safe to call repeatedly: it is a no-op when the toggle is
 * already a child of the embed. The presence of the button (not a marker
 * attribute) is the guard, so a toggle removed when Obsidian replaces the
 * embed's children is re-added on the next call rather than skipped forever.
 */
function ensureEmbedToggle(
	embed: HTMLElement,
	app: App,
	registry: FormatRegistry,
	sourcePath?: string
): void {
	const src = embed.getAttribute("src");
	if (!src) return;

	const linkpath = extractLinkpath(src);
	const ext = linkpath.split(".").pop()?.toLowerCase();
	if (!ext) return;

	const renderer = registry.getByExtension(ext);
	if (!renderer || !renderer.renderEmbed) return;

	const resolvedSourcePath = sourcePath
		?? embed.getAttribute(SOURCE_PATH_ATTR)
		?? getActiveMarkdownSourcePath(app);
	if (resolvedSourcePath) {
		embed.setAttribute(SOURCE_PATH_ATTR, resolvedSourcePath);
	}

	// Already toggled: a button is present as a direct child. Nothing to do.
	if (embed.querySelector(`:scope > .${TOGGLE_CLASS}`)) return;

	embed.setAttribute(PROCESSED_ATTR, "");
	attachToggle(
		embed,
		linkpath,
		resolvedSourcePath,
		app,
		renderer.renderEmbed.bind(renderer)
	);
}

function attachToggle(
	embed: HTMLElement,
	linkpath: string,
	sourcePath: string | null,
	app: App,
	renderEmbed: (content: string, container: HTMLElement) => void
): void {
	const btn = embed.createEl("button", {
		cls: TOGGLE_CLASS,
		attr: { "aria-label": "Render inline" },
	});
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

			const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath ?? "");
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

function extractLinkpath(src: string): string {
	const withoutAlias = src.split("|")[0]?.trim() ?? "";
	return withoutAlias.split("#")[0]?.trim() ?? "";
}

function getActiveMarkdownSourcePath(app: App): string | null {
	return app.workspace.getActiveViewOfType(MarkdownView)?.file?.path ?? null;
}
