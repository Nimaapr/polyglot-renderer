import { App, PluginSettingTab, Setting } from "obsidian";
import type PolyglotRendererPlugin from "./main";

export interface PolyglotSettings {
	enableInlineHtml: boolean;
}

export const DEFAULT_SETTINGS: PolyglotSettings = {
	enableInlineHtml: true,
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
	}
}
