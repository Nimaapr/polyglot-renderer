import { FileView, TFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import type { FormatRenderer } from "registry/format-renderer";
import { inlineAssets } from "asset-inliner";

export class PolyglotFileView extends FileView {
	private renderer: FormatRenderer;
	private viewType: string;
	private hasRegisteredVaultEvents = false;
	private lastScroll = 0;
	private pendingScroll: number | null = null;
	private restoring = false;
	private restoreCleanup: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, renderer: FormatRenderer, viewType: string) {
		super(leaf);
		this.renderer = renderer;
		this.viewType = viewType;
	}

	getViewType(): string {
		return this.viewType;
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : "Preview";
	}

	getIcon(): string {
		return this.renderer.icon;
	}

	canAcceptExtension(extension: string): boolean {
		return this.renderer.extensions.includes(extension);
	}

	protected onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("polyglot-file-view");

		if (!this.hasRegisteredVaultEvents) {
			this.setupVisibilityRestore();

			this.registerEvent(
				this.app.vault.on("modify", async (modifiedFile) => {
					if (modifiedFile instanceof TFile && modifiedFile === this.file) {
						let content = await this.app.vault.cachedRead(modifiedFile);
						content = await inlineAssets(content, this.app, modifiedFile.path);
						// Preserve the current scroll across the live reload.
						this.pendingScroll = this.lastScroll;
						this.renderContent(content);
					}
				})
			);
			this.hasRegisteredVaultEvents = true;
		}
		return Promise.resolve();
	}

	async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);
		let content = await this.app.vault.cachedRead(file);
		content = await inlineAssets(content, this.app, file.path);
		this.renderContent(content);
	}

	async onUnloadFile(file: TFile): Promise<void> {
		this.endRestore();
		this.contentEl.empty();
		await super.onUnloadFile(file);
	}

	protected onClose(): Promise<void> {
		this.endRestore();
		this.contentEl.empty();
		return Promise.resolve();
	}

	// --- Scroll persistence ---------------------------------------------------
	// The HTML content scrolls *inside* the sandboxed iframe (the iframe fills
	// the pane). That internal scroll is invisible to Obsidian and resets to 0
	// whenever the tab is hidden (display:none collapses the iframe). So we:
	//   1. continuously track the position while visible (`lastScroll`),
	//   2. feed it through the view-state hooks (deferred reconstruction +
	//      app restart), and
	//   3. restore it when the view becomes visible again (plain tab hide/show).
	// The restore yields immediately to any user input and never runs for more
	// than a moment, so it can't fight you while you read or expand sections.

	getState(): Record<string, unknown> {
		const state = super.getState();
		if (this.lastScroll) state.scroll = this.lastScroll;
		return state;
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
		this.captureScrollFromState(state);
	}

	getEphemeralState(): Record<string, unknown> {
		const state = super.getEphemeralState();
		if (this.lastScroll) state.scroll = this.lastScroll;
		return state;
	}

	setEphemeralState(state: unknown): void {
		super.setEphemeralState(state);
		this.captureScrollFromState(state);
	}

	private captureScrollFromState(state: unknown): void {
		const scroll = (state as { scroll?: unknown } | null)?.scroll;
		if (typeof scroll === "number") {
			this.lastScroll = scroll;
			this.pendingScroll = scroll;
			this.applyPendingScroll();
		}
	}

	private renderContent(content: string): void {
		this.renderer.renderFile(content, this.contentEl);
		const iframe = this.getIframe();
		if (iframe) {
			iframe.addEventListener("load", () => {
				this.attachScrollTracker(iframe);
				this.applyPendingScroll();
			}, { once: true });
		}
	}

	/**
	 * Re-apply the saved scroll when the view goes from hidden back to visible
	 * (a plain tab switch hides the pane with display:none without
	 * reconstructing the view, which collapses the iframe and resets its scroll).
	 */
	private setupVisibilityRestore(): void {
		if (typeof ResizeObserver === "undefined") return;
		let wasHidden = this.contentEl.clientHeight === 0;
		const ro = new ResizeObserver(() => {
			const visible = this.contentEl.clientHeight > 0;
			if (visible && wasHidden && this.lastScroll > 0) {
				this.pendingScroll = this.lastScroll;
				this.applyPendingScroll();
			}
			wasHidden = !visible;
		});
		ro.observe(this.contentEl);
		this.register(() => ro.disconnect());
	}

	/**
	 * Track the iframe's scroll position — only while it is visible (so the
	 * display:none teardown reset doesn't clobber it) and not mid-restore (so
	 * our own scrollTo calls aren't mistaken for the user scrolling).
	 */
	private attachScrollTracker(iframe: HTMLIFrameElement): void {
		const win = iframe.contentWindow;
		if (!win) return;
		win.addEventListener("scroll", () => {
			if (iframe.clientHeight > 0 && !this.restoring) {
				this.lastScroll = win.scrollY;
			}
		}, true);
	}

	private getIframe(): HTMLIFrameElement | null {
		return this.contentEl.querySelector("iframe");
	}

	/**
	 * Restore the pending scroll into the iframe. The document may still be
	 * growing (images decoding) so the target isn't always reachable on the
	 * first try — re-apply for a short, bounded window. Crucially, abort the
	 * instant the user interacts (wheel/click/key/touch) so the restore can
	 * never trap the view at a position the user is trying to leave.
	 */
	private applyPendingScroll(): void {
		if (this.pendingScroll === null) return;
		const y = this.pendingScroll;
		const win = this.getIframe()?.contentWindow;
		if (!win) return;

		this.endRestore();
		this.restoring = true;

		const deadline = Date.now() + 1500;
		let rafId = 0;

		const finish = (): void => {
			cancelAnimationFrame(rafId);
			win.removeEventListener("wheel", onUserInput, true);
			win.removeEventListener("keydown", onUserInput, true);
			win.removeEventListener("mousedown", onUserInput, true);
			win.removeEventListener("touchstart", onUserInput, true);
			this.restoreCleanup = null;
			this.restoring = false;
		};

		const onUserInput = (): void => finish();

		const tick = (): void => {
			if (this.getIframe()?.contentWindow !== win) { finish(); return; }
			win.scrollTo(0, y);
			if (Math.abs(safeScrollY(win) - y) <= 1 || Date.now() > deadline) { finish(); return; }
			rafId = requestAnimationFrame(tick);
		};

		win.addEventListener("wheel", onUserInput, true);
		win.addEventListener("keydown", onUserInput, true);
		win.addEventListener("mousedown", onUserInput, true);
		win.addEventListener("touchstart", onUserInput, true);

		this.restoreCleanup = () => finish();
		tick();
	}

	private endRestore(): void {
		this.restoreCleanup?.();
		this.restoring = false;
	}
}

function safeScrollY(win: Window): number {
	try {
		return win.scrollY;
	} catch {
		return 0;
	}
}
