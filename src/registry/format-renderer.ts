import type { PolyglotSettings } from "settings";

export interface FormatRenderer {
	/** Code block language identifier, e.g. "html" */
	lang: string;
	/** File extensions this renderer handles, e.g. ["html", "htm"] */
	extensions: string[];
	/** Obsidian icon name for the file view tab */
	icon: string;

	/** Render a fenced code block inline in a note. */
	renderInline(source: string, container: HTMLElement, settings: PolyglotSettings): void;

	/**
	 * Render file content into a container element (used by the generic file view).
	 * Called on initial load and again on every file modification.
	 * The container is NOT emptied between calls — the renderer should
	 * handle updates efficiently (e.g. reuse an existing iframe).
	 */
	renderFile(content: string, container: HTMLElement): void;

	/**
	 * Render file content inline in a note (for ![[file]] embeds).
	 * Should produce an auto-resizing element suitable for embedding.
	 * If not provided, embeds for this format won't have a render toggle.
	 */
	renderEmbed?(content: string, container: HTMLElement): void;
}
