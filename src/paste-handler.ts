import { App, Editor, MarkdownFileInfo, MarkdownView, TFile, normalizePath } from "obsidian";

/**
 * Handles paste events in the editor.
 *
 * - text/html clipboard: wraps the HTML source in a ```html code block
 *   so the inline renderer picks it up immediately.
 * - .html file blob (e.g. drag-drop from Finder): creates a .html file
 *   beside the current note and inserts a markdown link to it.
 */
export function handlePaste(
	evt: ClipboardEvent,
	editor: Editor,
	info: MarkdownView | MarkdownFileInfo,
	app: App
): void {
	const clipboard = evt.clipboardData;
	if (!clipboard) return;

	// --- Case 1: pasted HTML file/blob (e.g. from Finder) ---
	const htmlFile = findHtmlFile(clipboard);
	if (htmlFile) {
		evt.preventDefault();
		void handleHtmlFilePaste(htmlFile, editor, info, app);
		return;
	}

	// --- Case 2: pasted text/html content (e.g. copy from browser) ---
	// Only intercept if there's HTML but also check it's not just plain text
	// wrapped in trivial HTML by the OS. We look for actual tags beyond <meta>.
	const htmlContent = clipboard.getData("text/html");
	const plainContent = clipboard.getData("text/plain");
	if (htmlContent && looksLikeRealHtml(htmlContent, plainContent)) {
		evt.preventDefault();
		handleHtmlTextPaste(htmlContent, editor);
		return;
	}

	// Otherwise, let Obsidian handle the paste normally.
}

/**
 * Check clipboard files for an .html/.htm file.
 */
function findHtmlFile(clipboard: DataTransfer): File | null {
	for (let i = 0; i < clipboard.files.length; i++) {
		const file = clipboard.files[i];
		if (file && /\.html?$/i.test(file.name)) {
			return file;
		}
	}
	return null;
}

/**
 * Heuristic: distinguish real HTML content from OS-wrapped plain text.
 * When you copy plain text, macOS often wraps it in minimal HTML.
 * We only intercept if the HTML has meaningful structure beyond that.
 */
function looksLikeRealHtml(html: string, plain: string): boolean {
	// Strip the common meta/span wrappers that macOS adds to plain text copies
	const stripped = html
		.replace(/<meta[^>]*>/gi, "")
		.replace(/<\/?html>/gi, "")
		.replace(/<\/?head>/gi, "")
		.replace(/<\/?body>/gi, "")
		.replace(/<\/?span[^>]*>/gi, "")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/\s+/g, " ")
		.trim();

	// If after stripping wrappers the content is basically the plain text,
	// it's not "real" HTML — let Obsidian paste it as plain text.
	const normalizedPlain = plain.replace(/\s+/g, " ").trim();
	if (stripped === normalizedPlain) return false;

	// Check for meaningful HTML tags
	return /<(div|table|ul|ol|h[1-6]|img|a\s|form|section|article|nav|header|footer|style|svg)/i.test(html);
}

/**
 * Embed pasted HTML text inline as a ```html code block.
 */
function handleHtmlTextPaste(html: string, editor: Editor): void {
	const codeBlock = "```html\n" + html.trim() + "\n```\n";
	editor.replaceSelection(codeBlock);
}

/**
 * Create a .html file beside the current note and insert a link.
 */
async function handleHtmlFilePaste(
	file: File,
	editor: Editor,
	info: MarkdownView | MarkdownFileInfo,
	app: App
): Promise<void> {
	const noteFile = info.file;

	// Resolve the directory: use the note's folder, or vault root as fallback
	// for unsaved/new notes
	const noteDir = noteFile?.parent?.path ?? "";
	const notePath = noteFile?.path ?? "";

	// Read the file content
	const content = await file.text();

	// Generate a unique filename to avoid collisions
	const baseName = file.name.replace(/\.html?$/i, "");
	const fileName = await uniqueFileName(app, noteDir, baseName, "html");
	const filePath = normalizePath(noteDir ? `${noteDir}/${fileName}` : fileName);

	// Create the file in the vault
	await app.vault.create(filePath, content);

	// Insert a link to the new file (clicking opens it in our file view)
	const createdFile = app.vault.getAbstractFileByPath(filePath);
	if (createdFile instanceof TFile) {
		const link = app.fileManager.generateMarkdownLink(
			createdFile,
			notePath
		);
		editor.replaceSelection(link + "\n");
	}
}

/**
 * Find a filename that doesn't collide with existing files.
 */
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
