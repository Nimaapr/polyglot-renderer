import { App, Editor, MarkdownFileInfo, MarkdownView, Modal, Notice, Setting, htmlToMarkdown, normalizePath } from "obsidian";
import type { PolyglotSettings } from "settings";

export function handlePaste(
	evt: ClipboardEvent,
	editor: Editor,
	info: MarkdownView | MarkdownFileInfo,
	app: App,
	settings: PolyglotSettings
): void {
	const clipboard = evt.clipboardData;
	if (!clipboard) return;

	// --- Case 1: pasted HTML file/blob (e.g. from Finder) ---
	const htmlFiles = findHtmlFiles(clipboard);
	if (htmlFiles.length > 0) {
		evt.preventDefault();
		void handleHtmlFilesPaste(htmlFiles, editor, info, app, settings);
		return;
	}

	// --- Case 2: pasted text/html content (e.g. copy from browser) ---
	const htmlContent = clipboard.getData("text/html");
	const plainContent = clipboard.getData("text/plain");
	if (htmlContent && looksLikeRealHtml(htmlContent, plainContent)) {
		if (settings.htmlContentPasteBehavior === "render") {
			evt.preventDefault();
			handleHtmlTextPaste(htmlContent, editor);
			return;
		}
		if (settings.htmlContentPasteBehavior === "ask") {
			evt.preventDefault();
			void openContentPasteBehaviorModal(app).then((choice) => {
				if (choice === "render") {
					handleHtmlTextPaste(htmlContent, editor);
				} else if (choice === "markdown") {
					editor.replaceSelection(htmlToMarkdown(htmlContent));
				} else {
					editor.replaceSelection(plainContent);
				}
			}).catch(() => {
				// Cancelled — do not paste anything.
			});
			return;
		}
		// "default" — fall through, let Obsidian handle it
	}
}

function findHtmlFiles(clipboard: DataTransfer): File[] {
	const files: File[] = [];
	for (let i = 0; i < clipboard.files.length; i++) {
		const file = clipboard.files[i];
		if (file && /\.html?$/i.test(file.name)) {
			files.push(file);
		}
	}
	return files;
}

function looksLikeRealHtml(html: string, plain: string): boolean {
	// Extract pure text content by stripping ALL HTML tags
	const textContent = html
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<[^>]*>/g, "")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, "\"")
		.replace(/\s+/g, " ")
		.trim();

	const normalizedPlain = plain.replace(/\s+/g, " ").trim();

	// If text content matches the plain text, the HTML is just a
	// formatted wrapper (e.g. copying within Obsidian). Only flag it
	// if it has rich indicators that markdown can't represent.
	if (textContent === normalizedPlain) {
		return /<style[\s>]/i.test(html)
			|| /<svg[\s>]/i.test(html)
			|| /style\s*=\s*"/i.test(html);
	}

	// Text content differs — HTML has extra content (images, etc.)
	// Only flag on elements that suggest real web content, not basic
	// document structure that any copy produces.
	return /<(table|img|svg|canvas|video|audio|iframe|style|form)/i.test(html)
		|| /style\s*=\s*"/i.test(html);
}

function handleHtmlTextPaste(html: string, editor: Editor): void {
	const codeBlock = "```html\n" + html.trim() + "\n```\n";
	editor.replaceSelection(codeBlock);
}

async function handleHtmlFilesPaste(
	files: File[],
	editor: Editor,
	info: MarkdownView | MarkdownFileInfo,
	app: App,
	settings: PolyglotSettings
): Promise<void> {
	const noteFile = info.file;
	const noteDir = noteFile?.parent?.path ?? "";
	const notePath = noteFile?.path ?? "";

	const fileNames = files.map((f) => f.name).join(", ");
	let targetDir: string;

	if (settings.pasteDestination === "ask") {
		try {
			targetDir = await openPasteDestinationModal(app, fileNames, noteDir, settings.defaultPasteFolder);
		} catch {
			// User cancelled the modal
			return;
		}
	} else if (settings.pasteDestination === "default-folder") {
		if (!settings.defaultPasteFolder.trim()) {
			new Notice("Set a default paste folder or switch the paste destination mode.");
			return;
		}
		targetDir = settings.defaultPasteFolder.trim();
	} else {
		// "note-folder"
		targetDir = noteDir;
	}

	try {
		// Ensure the target directory exists
		if (targetDir && !app.vault.getAbstractFileByPath(targetDir)) {
			await app.vault.createFolder(targetDir);
		}

		const links: string[] = [];
		for (const file of files) {
			const content = await file.text();
			const baseName = file.name.replace(/\.html?$/i, "");
			const fileName = await uniqueFileName(app, targetDir, baseName, "html");
			const filePath = normalizePath(targetDir ? `${targetDir}/${fileName}` : fileName);

			const createdFile = await app.vault.create(filePath, content);
			const link = app.fileManager.generateMarkdownLink(createdFile, notePath);
			// Prepend ! to make it an embed link so the render toggle works
			const embedLink = link.startsWith("!") ? link : "!" + link;
			links.push(embedLink);
		}
		editor.replaceSelection(links.join("\n") + "\n");
	} catch (error) {
		console.error("Polyglot Renderer: failed to handle pasted HTML files", error);
		new Notice("Failed to save pasted HTML files.");
	}
}

/**
 * Modal that asks the user where to save the pasted HTML file.
 * Returns the chosen directory path, or rejects if cancelled.
 */
function openPasteDestinationModal(
	app: App,
	fileName: string,
	noteDir: string,
	defaultFolder: string
): Promise<string> {
	return new Promise((resolve, reject) => {
		const modal = new PasteDestinationModal(app, fileName, noteDir, defaultFolder, resolve, reject);
		modal.open();
	});
}

class PasteDestinationModal extends Modal {
	private fileName: string;
	private noteDir: string;
	private defaultFolder: string;
	private resolve: (dir: string) => void;
	private reject: () => void;
	private resolved = false;

	constructor(
		app: App,
		fileName: string,
		noteDir: string,
		defaultFolder: string,
		resolve: (dir: string) => void,
		reject: () => void
	) {
		super(app);
		this.fileName = fileName;
		this.noteDir = noteDir;
		this.defaultFolder = defaultFolder;
		this.resolve = resolve;
		this.reject = reject;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: `Choose where to save "${this.fileName}"` });

		const noteDirLabel = this.noteDir || "/";

		new Setting(contentEl)
			.setName("Current note folder")
			.setDesc(noteDirLabel)
			.addButton((btn) =>
				btn.setButtonText("Save here").setCta().onClick(() => {
					this.resolved = true;
					this.resolve(this.noteDir);
					this.close();
				})
			);

		new Setting(contentEl)
			.setName("Vault root")
			.setDesc("/")
			.addButton((btn) =>
				btn.setButtonText("Save here").onClick(() => {
					this.resolved = true;
					this.resolve("");
					this.close();
				})
			);

		if (this.defaultFolder) {
			new Setting(contentEl)
				.setName("Default folder")
				.setDesc(this.defaultFolder)
				.addButton((btn) =>
					btn.setButtonText("Save here").onClick(() => {
						this.resolved = true;
						this.resolve(this.defaultFolder);
						this.close();
					})
				);
		}

		let customPath = "";
		new Setting(contentEl)
			.setName("Custom folder")
			.addText((text) =>
				text.setPlaceholder("path/to/folder").onChange((value) => {
					customPath = value;
				})
			)
			.addButton((btn) =>
				btn.setButtonText("Save here").onClick(() => {
					const normalized = normalizePath(customPath.trim());
					if (!normalized) {
						new Notice("Please enter a folder path.");
						return;
					}
					this.resolved = true;
					this.resolve(normalized);
					this.close();
				})
			);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) {
			this.reject();
		}
	}
}

type ContentPasteChoice = "render" | "markdown" | "plain";

function openContentPasteBehaviorModal(app: App): Promise<ContentPasteChoice> {
	return new Promise((resolve, reject) => {
		const modal = new ContentPasteBehaviorModal(app, resolve, reject);
		modal.open();
	});
}

class ContentPasteBehaviorModal extends Modal {
	private resolve: (choice: ContentPasteChoice) => void;
	private reject: () => void;
	private resolved = false;

	constructor(
		app: App,
		resolve: (choice: ContentPasteChoice) => void,
		reject: () => void
	) {
		super(app);
		this.resolve = resolve;
		this.reject = reject;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Pasted HTML content detected" });
		contentEl.createEl("p", { text: "How would you like to paste this?" });

		new Setting(contentEl)
			.setName("Render as HTML")
			.setDesc("Insert as a live-rendered ```html code block.")
			.addButton((btn) =>
				btn.setButtonText("Render").setCta().onClick(() => {
					this.resolved = true;
					this.resolve("render");
					this.close();
				})
			);

		new Setting(contentEl)
			.setName("Convert to Markdown")
			.setDesc("Let Obsidian convert the HTML to formatted markdown.")
			.addButton((btn) =>
				btn.setButtonText("Markdown").onClick(() => {
					this.resolved = true;
					this.resolve("markdown");
					this.close();
				})
			);

		new Setting(contentEl)
			.setName("Paste as plain text")
			.setDesc("Insert the raw text without any formatting.")
			.addButton((btn) =>
				btn.setButtonText("Plain text").onClick(() => {
					this.resolved = true;
					this.resolve("plain");
					this.close();
				})
			);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) {
			this.reject();
		}
	}
}

async function uniqueFileName(
	app: App,
	dir: string,
	baseName: string,
	ext: string
): Promise<string> {
	let candidate = `${baseName}.${ext}`;
	let counter = 1;
	while (app.vault.getAbstractFileByPath(normalizePath(dir ? `${dir}/${candidate}` : candidate))) {
		candidate = `${baseName}-${counter}.${ext}`;
		counter++;
	}
	return candidate;
}
