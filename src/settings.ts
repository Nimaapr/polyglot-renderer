import { App, PluginSettingTab, Setting } from "obsidian";
import type PolyglotRendererPlugin from "./main";

export type PasteDestination = "ask" | "note-folder" | "default-folder";
export type HtmlContentPasteBehavior = "ask" | "render" | "default";

export interface PolyglotSettings {
	enableInlineHtml: boolean;
	pasteDestination: PasteDestination;
	defaultPasteFolder: string;
	htmlContentPasteBehavior: HtmlContentPasteBehavior;
}

export const DEFAULT_SETTINGS: PolyglotSettings = {
	enableInlineHtml: true,
	pasteDestination: "ask",
	defaultPasteFolder: "",
	htmlContentPasteBehavior: "ask",
};

export class PolyglotSettingTab extends PluginSettingTab {
	plugin: PolyglotRendererPlugin;

	constructor(app: App, plugin: PolyglotRendererPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Enable inline HTML rendering")
			.setDesc("Render ```html code blocks as live HTML instead of showing source.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableInlineHtml)
					.onChange(async (value) => {
						this.plugin.settings.enableInlineHtml = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("HTML file paste destination")
			.setDesc("Where to save HTML files when pasted into a note.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("ask", "Ask every time")
					.addOption("note-folder", "Current note folder")
					.addOption("default-folder", "Default folder")
					.setValue(this.plugin.settings.pasteDestination)
					.onChange(async (value) => {
						this.plugin.settings.pasteDestination = value as PasteDestination;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		new Setting(containerEl)
			.setName("HTML content paste behavior")
			.setDesc("When pasting HTML content (e.g. from a browser), render it as a live HTML block or use Obsidian's default paste.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("ask", "Ask every time")
					.addOption("render", "Render as HTML block")
					.addOption("default", "Obsidian default (markdown)")
					.setValue(this.plugin.settings.htmlContentPasteBehavior)
					.onChange(async (value) => {
						this.plugin.settings.htmlContentPasteBehavior = value as HtmlContentPasteBehavior;
						await this.plugin.saveSettings();
					})
			);

		if (this.plugin.settings.pasteDestination === "default-folder") {
			new Setting(containerEl)
				.setName("Default paste folder")
				.setDesc("Folder path relative to vault root (e.g. \"assets/html\"). Created automatically if it doesn't exist.")
				.addText((text) =>
					text
						.setPlaceholder("assets/html")
						.setValue(this.plugin.settings.defaultPasteFolder)
						.onChange(async (value) => {
							this.plugin.settings.defaultPasteFolder = value.trim();
							await this.plugin.saveSettings();
						})
				);
		}
	}
}
