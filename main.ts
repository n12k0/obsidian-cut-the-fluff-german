import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import {
	ViewUpdate,
	PluginValue,
	EditorView,
	ViewPlugin,
	Decoration,
	DecorationSet
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

interface CutTheFluffPluginSettings {
	wordlist: string,
	enabled: boolean
}

const DEFAULT_SETTINGS: CutTheFluffPluginSettings = {
	enabled: true,
	wordlist: `basically
just
basically
actually
actual
literally
really
very
quite
honestly
simply
like
combine together`
}

export default class CutTheFluffPlugin extends Plugin {
	settings: CutTheFluffPluginSettings;
	forceViewUpdate: boolean;
	regex: RegExp;

	async onload() {
		await this.loadSettings();
		this.buildRegex();

		this.addCommand({
			id: 'toggle',
			name: 'Toggle highlighting',
			callback: () => {
				this.settings.enabled = !this.settings.enabled;
				this.saveSettings();
			}
		});

		this.addSettingTab(new CutTheFluggSettingsTab(this.app, this));
		this.registerEditorExtension(this.createViewPlugin());
		this.updateStyles();
	}

	updateStyles() {
		document.documentElement.style.setProperty("--sentence-length-highlight-color-xs", this.settings.xsColor);
		document.documentElement.style.setProperty("--sentence-length-highlight-color-sm", this.settings.smColor);
		document.documentElement.style.setProperty("--sentence-length-highlight-color-md", this.settings.mdColor);
		document.documentElement.style.setProperty("--sentence-length-highlight-color-lg", this.settings.lgColor);
		document.documentElement.style.setProperty("--sentence-length-highlight-color-xl", this.settings.xlColor);
	}

	onunload() {

	}

	buildRegex() {
		/*const words = [
			'basically',
			'just',
			'basically',
			'actually',
			'actual',
			'literally',
			'really',
			'very',
			'quite',
			'honestly',
			'simply',
			'like',
			'combine together'
		];*/

		const words = this.settings.wordlist.trim().split(/\r?\n/).map(line => line.trim());
		
		const pattern = `\\b(?:${ words.join("|") })\\b`
		this.regex = new RegExp(pattern, 'gi');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.buildRegex();
		this.forceViewUpdate = true;
		document.body.classList.toggle('sentence-length-highlighting-active', this.settings.enabled);
		this.app.workspace.updateOptions();
	}

	createViewPlugin() {
		const plugin = this;

		class CutTheFluffViewPlugin implements PluginValue {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged || plugin.forceViewUpdate) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {

				if (!plugin.settings.enabled) {
					return Decoration.none;
				}

				const builder = new RangeSetBuilder<Decoration>();
				const text = view.state.doc.toString();

				// Skip highlighting inside code blocks, comments, etc.

				interface NumberRange {
					min: number;
					max: number;
				}
				const skipRanges: NumberRange[] = [];

				for (let { from, to } of view.visibleRanges) {
					syntaxTree(view.state).iterate({
						from,
						to,
						enter(node) {
							if ((node.name.includes("code") || node.name.includes("comment") || node.name.includes("link") || node.name.includes("url"))) {
								skipRanges.push({ min: node.from, max: node.to });
							}
						},
					});
				}

				//const words = ["just", "sample", "is"];

				//const sentenceRegex = /\bbasically\b|\btext\b/gi
				
				let match;

				for (const { from, to } of view.visibleRanges) {
					

					// IMPORTANT: Reset lastIndex for global regexes when searching new strings/slices
					plugin.regex.lastIndex = 0;

					const doc = view.state.doc

					const visibleText = doc.sliceString(from, to);

					while ((match = plugin.regex.exec(visibleText)) !== null) {

						//console.log(text.length);

						let start: number;
						
							start = match.index + from;
						
						const end = start + match[0].length;
	
						if (skipRanges.some(range => start >= range.min && start <= range.max)) {
							continue;
						}
	
						
						
	
						
	
	
						builder.add(start, end, Decoration.mark({
							class: 'fluff',
						}));
					}


				}

				/*
				while ((match = sentenceRegex.exec(text)) !== null) {

					let start: number;
					
						start = match.index;
					
					const end = start + match[0].length;

					if (skipRanges.some(range => start >= range.min && start <= range.max)) {
						continue;
					}

					
					

					


					builder.add(start, end, Decoration.mark({
						class: 'fluff',
					}));
				}
				*/

				return builder.finish();
			}
		}

		return ViewPlugin.fromClass(CutTheFluffViewPlugin, {
			decorations: (value: CutTheFluffViewPlugin) => value.decorations,
		});
	}
}

class CutTheFluggSettingsTab extends PluginSettingTab {
	plugin: CutTheFluffPlugin;

	constructor(app: App, plugin: CutTheFluffPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async hide(): void {
		await this.plugin.saveSettings();
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Enable highlighting')
			.setDesc('You can also toggle on and off from the command palette')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enabled) // Set the initial state of the toggle from loaded settings
				.onChange(async (value) => { // This function runs whenever the toggle is changed
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettings();
				}));



		new Setting(containerEl)
			.setName('Word list')
			.setDesc('')
			.addTextArea((text) =>
				text
				.setValue(this.plugin.settings.wordlist)
				.onChange(async (value) => {
					this.plugin.settings.wordlist = value;
					// Don't want to build the regex here because of partial edits
				})
				.then(textArea => {
					textArea.inputEl.style.width = "100%";
					textArea.inputEl.rows = 10;
				})
				
			);




	}
}





