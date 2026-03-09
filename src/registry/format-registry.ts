import type { FormatRenderer } from "registry/format-renderer";

export function viewTypeFor(lang: string): string {
	return `polyglot-view-${lang}`;
}

export class FormatRegistry {
	private renderers: FormatRenderer[] = [];
	private byLang = new Map<string, FormatRenderer>();
	private byExt = new Map<string, FormatRenderer>();

	register(renderer: FormatRenderer): void {
		this.renderers.push(renderer);
		this.byLang.set(renderer.lang, renderer);
		for (const ext of renderer.extensions) {
			this.byExt.set(ext, renderer);
		}
	}

	getByLang(lang: string): FormatRenderer | undefined {
		return this.byLang.get(lang);
	}

	getByExtension(ext: string): FormatRenderer | undefined {
		return this.byExt.get(ext);
	}

	all(): FormatRenderer[] {
		return this.renderers;
	}
}
