import { App, Plugin, PluginSettingTab, Setting, TextAreaComponent } from 'obsidian';
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

import { Rulesets, RULESETS } from './rulesets';


interface CutTheFluffPluginSettings {
	enabled: boolean,
	enableTooltips: boolean,
	highlightStyle: string,
	customWordList: string,
	enableRulesetWeakQualifiers: boolean,
	enableRulesetJargon: boolean,
	enableRulesetComplexity: boolean,
	enableRulesetRedudancies: boolean,

}

const DEFAULT_SETTINGS: CutTheFluffPluginSettings = {
	enabled: true,
	enableTooltips: false,
	highlightStyle: 'dim',
	enableRulesetWeakQualifiers: true,
	enableRulesetJargon: true,
	enableRulesetComplexity: true,
	enableRulesetRedudancies: true,
	customWordList: ''
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

		const customRules: string[] = [];
		const customExceptions: string[] = [];



		this.settings.customWordList.trim().split(/\r?\n/).forEach(str => {
			if (str.startsWith('-')) {
				customExceptions.push(str.substring(1));
			} else {
				customRules.push(str);
			}
		  });


		//const filteredArray = stringArray.filter(str => str.startsWith('-'));

		let words: string[] = [];

		const rulesetSettingMap: Record<string, string> = {
			"enableRulesetWeakQualifiers": 'weakQualifiers',
			"enableRulesetJargon": 'jargon',
			"enableRulesetComplexity": 'complexity',
			"enableRulesetRedudancies": 'redundancies'
		}


		


		for (let key in rulesetSettingMap) {
			let rulesetToggleSettingKey = key as keyof CutTheFluffPluginSettings;
			if (typeof this.settings[rulesetToggleSettingKey] === 'boolean') {
				if (this.settings[rulesetToggleSettingKey]) {
					let typedKey = rulesetSettingMap[key] as keyof Rulesets;

					words = words.concat(Object.keys(RULESETS[typedKey]).filter(value => {
						return !customExceptions.includes(value);
					}));
				}
			}
		}

		

		if(this.settings.customWordList.length > 0) {
			words = words.concat(customRules.map(
				line => line.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			));
		}

	

		//const words = this.settings.wordlist.trim().split(/\r?\n/).map(line => line.trim());

		const pattern = `\\b(?:${words.join("|")})\\b`
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

				let formattingClass: string;

				switch (plugin.settings.highlightStyle) {
					case 'dim':
						formattingClass = ' fluff-dim';
						break;
					case 'wavy-underline':
						formattingClass = ' fluff-wavy-underline';
						break;
					default:
						formattingClass = '';
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




						if(plugin.settings.enableTooltips) {
							builder.add(start, end, Decoration.mark({
								class: `fluff${formattingClass}`,
								attributes: {
									'aria-label': "Much longer \nworld",
									'data-tooltip-position': "bottom"
								}
							}));
						} else {
							builder.add(start, end, Decoration.mark({
								class: `fluff${formattingClass}`,
							}));
						}


						
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

	async hide(): Promise<void> {
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
			.setName('Highlight style')
			.setDesc('Selecting none will add CSS classes to matches but no formatting to allow you to format from your user stylesheet')
			.addDropdown(dropdown => {
				dropdown.addOption('dim', 'Dim');
				dropdown.addOption('wavy-underline', 'Wavy underline');
				dropdown.addOption('none', 'None');

				dropdown.setValue(this.plugin.settings.highlightStyle);

				dropdown.onChange(async (newValue) => {

					this.plugin.settings.highlightStyle = newValue;
					// Save the updated settings
					await this.plugin.saveSettings();
				});
			});
		
		/*
		new Setting(containerEl)
			.setName('Enable tooltips')

			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableTooltips) // Set the initial state of the toggle from loaded settings
				.onChange(async (value) => { // This function runs whenever the toggle is changed
					this.plugin.settings.enableTooltips = value;
					await this.plugin.saveSettings();
				}));
		*/

		new Setting(containerEl).setName('Built-in rulesets').setHeading();

		new Setting(containerEl)
			.setName('Weak qualifiers')
			.setDesc('eg. very, quite, really')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRulesetWeakQualifiers) // Set the initial state of the toggle from loaded settings
				.onChange(async (value) => { // This function runs whenever the toggle is changed
					this.plugin.settings.enableRulesetWeakQualifiers = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Clichés, jargon and metaphors')
			.setDesc('eg. move the needle, double-edged sword, paradigm shift')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRulesetJargon) // Set the initial state of the toggle from loaded settings
				.onChange(async (value) => { // This function runs whenever the toggle is changed
					this.plugin.settings.enableRulesetJargon = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Unnecessary complexity or clutter')
			.setDesc('eg. erroneous (wrong), pertaining to (about), utalize (use), due to the fact that (due to)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRulesetComplexity) // Set the initial state of the toggle from loaded settings
				.onChange(async (value) => { // This function runs whenever the toggle is changed
					this.plugin.settings.enableRulesetComplexity = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Redudancies')
			.setDesc('eg. combine together, basic fundamentals, critically important, final conclusion')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRulesetRedudancies) // Set the initial state of the toggle from loaded settings
				.onChange(async (value) => { // This function runs whenever the toggle is changed
					this.plugin.settings.enableRulesetRedudancies = value;
					await this.plugin.saveSettings();
				}));


		/*
		new Setting(containerEl)
			.setName('Custom')
			.setDesc('Seperate each item with a line break. Prefix an item with a dash to add an exception for a built-in rule')
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
			*/

		new Setting(containerEl).setName('Custom rules').setDesc('Seperate each item with a line break. Prefix an item with a dash to add an exception for a built-in rule').setHeading();

		new TextAreaComponent(containerEl)
			.setValue(this.plugin.settings.customWordList)
			.setPlaceholder("one rule\nper line\n-exception")
			.onChange(value => {
				this.plugin.settings.customWordList = value;
				// Don't save setting here because of partial edits
			})
			.then(textArea => {
				textArea.inputEl.style.width = "100%";
				textArea.inputEl.rows = 10;
				textArea.inputEl.style.resize = "none";
			});


	}
}





