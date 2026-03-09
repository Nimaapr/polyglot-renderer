import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, PolyglotSettings, PolyglotSettingTab } from "./settings";
import { FormatRegistry, viewTypeFor } from "registry/format-registry";
import { PolyglotFileView } from "views/polyglot-file-view";
import { htmlRenderer } from "renderers/html-renderer";
import { handlePaste } from "paste-handler";
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

	}

	onunload() {
		console.log("Polyglot Renderer unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<PolyglotSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
