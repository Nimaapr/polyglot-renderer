import { App, PluginSettingTab, Setting } from "obsidian";
import type PolyglotRendererPlugin from "./main";

export type HtmlSecurityMode = "sandbox" | "trusted";

export interface PolyglotSettings {
	enableInlineHtml: boolean;
	htmlSecurityMode: HtmlSecurityMode;
}

export const DEFAULT_SETTINGS: PolyglotSettings = {
	enableInlineHtml: true,
	htmlSecurityMode: "sandbox",
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
			.setName("HTML security mode")
			.setDesc("Sandbox (default): renders in an isolated iframe, blocks scripts. Trusted: renders directly, allows all HTML.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("sandbox", "Sandbox (safe)")
					.addOption("trusted", "Trusted (unsafe)")
					.setValue(this.plugin.settings.htmlSecurityMode)
					.onChange(async (value) => {
						this.plugin.settings.htmlSecurityMode = value as HtmlSecurityMode;
						await this.plugin.saveSettings();
					})
			);
	}
}
