import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, PolyglotSettings, PolyglotSettingTab } from "./settings";
import { FormatRegistry, viewTypeFor } from "registry/format-registry";
import { PolyglotFileView } from "views/polyglot-file-view";
import { htmlRenderer } from "renderers/html-renderer";
import { handlePaste, findHtmlFiles, handleHtmlFilesPaste } from "paste-handler";
import { processEmbeds, startEmbedObserver } from "embed-processor";

export default class PolyglotRendererPlugin extends Plugin {
	settings: PolyglotSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new PolyglotSettingTab(this.app, this));

		// Build format registry
		const registry = new FormatRegistry();
		registry.register(htmlRenderer);

		// Register all format renderers
		for (const renderer of registry.all()) {
			// inline code block rendering
			this.registerMarkdownCodeBlockProcessor(renderer.lang, (source, el, _ctx) => {
				renderer.renderInline(source, el, this.settings);
			});

			// file view for each format
			const viewType = viewTypeFor(renderer.lang);
			this.registerView(
				viewType,
				(leaf: WorkspaceLeaf) => new PolyglotFileView(leaf, renderer, viewType)
			);
			this.registerExtensions(renderer.extensions, viewType);
		}

		// embed post-processor: adds render toggle to ![[file.html]] embeds
		this.registerMarkdownPostProcessor((el, ctx) => {
			processEmbeds(el, this.app, registry, ctx.sourcePath);
		});

		// MutationObserver to catch embeds added/re-rendered during live editing
		const disconnectObserver = startEmbedObserver(this.app, registry);
		this.register(() => disconnectObserver());

		// smart paste handler for HTML content
		this.registerEvent(
			this.app.workspace.on("editor-paste", (evt, editor, info) => {
				handlePaste(evt, editor, info, this.app, this.settings);
			})
		);

		// smart drop handler for HTML files dragged from Finder
		this.registerEvent(
			this.app.workspace.on("editor-drop", (evt, editor, info) => {
				const dataTransfer = evt.dataTransfer;
				if (!dataTransfer) return;

				const htmlFiles = findHtmlFiles(dataTransfer);
				if (htmlFiles.length === 0) return;

				evt.preventDefault();
				void handleHtmlFilesPaste(htmlFiles, editor, info, this.app, this.settings);
			})
		);

		// Listen for link-open requests from sandboxed iframes.
		// Do not filter on e.origin: opaque sandboxed frames report origin
		// "null". Validate the URL scheme instead and only open http(s),
		// ignoring javascript:, file:, and anything else.
		const onMessage = (e: MessageEvent) => {
			if (e.data?.type === "polyglot-open-url" && typeof e.data.url === "string") {
				let parsed: URL;
				try {
					parsed = new URL(e.data.url);
				} catch {
					return;
				}
				if (parsed.protocol === "http:" || parsed.protocol === "https:") {
					window.open(e.data.url);
				}
			}
		};
		window.addEventListener("message", onMessage);
		this.register(() => window.removeEventListener("message", onMessage));

	}

	onunload() {
		console.debug("Polyglot Renderer unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<PolyglotSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
