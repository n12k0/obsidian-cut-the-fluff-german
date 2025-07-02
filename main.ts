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

import { Rules, Rule, RuleType } from './rulesets';
import { GermanRules } from './rulesets.de';


interface CutTheFluffPluginSettings {
	enabled: boolean,
	highlightStyle: string,
	customWordList: string,
	enableRulesetWeakQualifiers: boolean,
	enableRulesetJargon: boolean,
	enableRulesetComplexity: boolean,
	enableRulesetRedundancies: boolean,
	enableRulesetFillerWords: boolean; // New setting
	enableRulesetWeaselWords: boolean; // New setting for weasel words
	language?: 'en' | 'de'; // Add language selection
}

const DEFAULT_SETTINGS: CutTheFluffPluginSettings = {
	enabled: true,
	highlightStyle: 'dim',
	enableRulesetWeakQualifiers: true,
	enableRulesetJargon: true,
	enableRulesetComplexity: true,
	enableRulesetRedundancies: true,
	enableRulesetFillerWords: true, // Default enable filler words
	enableRulesetWeaselWords: true, // Default enable weasel words
	customWordList: '',
	language: 'de', // Default to German
}



export default class CutTheFluffPlugin extends Plugin {
	settings: CutTheFluffPluginSettings;
	forceViewUpdate: boolean;
	regex: RegExp | null;
	rules: Rules;

	async onload() {

		await this.loadSettings();
		this.setRulesByLanguage();
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

	setRulesByLanguage() {
		if (this.settings.language === 'de') {
			this.rules = new GermanRules();
		} else {
			this.rules = new Rules();
		}
	}

	buildRegex() {


		const enabledRuleTypes: RuleType[] = [
			...(this.settings.enableRulesetWeakQualifiers ? [RuleType.WeakQualifier] : []),
			...(this.settings.enableRulesetFillerWords ? [RuleType.FillerWord] : []),
			...(this.settings.enableRulesetWeaselWords ? [RuleType.WeaselWord] : []), // Include weasel words
			...(this.settings.enableRulesetJargon ? [RuleType.Jargon] : []),
			...(this.settings.enableRulesetComplexity ? [RuleType.Complexity] : []),
			...(this.settings.enableRulesetRedundancies ? [RuleType.Redundancy] : []),
		];

		this.rules.resetCustomRules();
		const customExceptions: string[] = [];

		if(this.settings.customWordList.trim().length > 0) {
			this.settings.customWordList.trim().split(/\r?\n/).forEach(str => {
				if (str.startsWith('-')) {
					customExceptions.push(str.substring(1));
				} else {
					this.rules.addCustomRule(str);
				}
			});
		}


		let words: string[] = this.rules.getMatchStrings(enabledRuleTypes, customExceptions);

		if(words.length > 0) {
			const pattern = `\\b(?:${words.join("|")})\\b`
			this.regex = new RegExp(pattern, 'gi');
		} else {
			this.regex = null;
		}

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.setRulesByLanguage();
		this.buildRegex();
		this.forceViewUpdate = true;
		document.body.classList.toggle('cut-the-fluff-active', this.settings.enabled);
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
					plugin.forceViewUpdate = false;
				}
			}

			buildDecorations(view: EditorView): DecorationSet {

				if (!plugin.settings.enabled || plugin.regex == null) {
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
					case 'strikethrough':
						formattingClass = ' fluff-strikethrough';
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

				

				let match;

				for (const { from, to } of view.visibleRanges) {


					
					plugin.regex.lastIndex = 0; // Important

					const doc = view.state.doc

					const visibleText = doc.sliceString(from, to);

					while ((match = plugin.regex.exec(visibleText)) !== null) {

						const matchingRule: Rule = plugin.rules.getRuleByMatchString(match[0]);

						let start: number;
						start = match.index + from + matchingRule.highlightOffset;

						let end: number;
						if (matchingRule.highlightLength != null) {
							end = start + matchingRule.highlightLength - matchingRule.highlightOffset
						} else {
							end = start + match[0].length - matchingRule.highlightOffset;
						}

						if (skipRanges.some(range => start >= range.min && start <= range.max)) {
							continue;
						}

						builder.add(start, end, Decoration.mark({
							class: `fluff${formattingClass}`,
						}));

					}


				}

				

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
				dropdown.addOption('strikethrough', 'Strikethrough');
				dropdown.addOption('none', 'None');

				dropdown.setValue(this.plugin.settings.highlightStyle);

				dropdown.onChange(async (newValue) => {

					this.plugin.settings.highlightStyle = newValue;
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
			.setName('Redundancies')
			.setDesc('eg. combine together, basic fundamentals, critically important, final conclusion')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRulesetRedundancies) // Set the initial state of the toggle from loaded settings
				.onChange(async (value) => { // This function runs whenever the toggle is changed
					this.plugin.settings.enableRulesetRedundancies = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Füllwörter')
			.setDesc('Erkennt häufige Füllwörter in deutschen Texten')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRulesetFillerWords)
				.onChange(async (value) => {
					this.plugin.settings.enableRulesetFillerWords = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Weasel Words')
			.setDesc('Erkennt inhaltslose Buzzwords und Phrasen (Weasel Words)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRulesetWeaselWords)
				.onChange(async (value) => {
					this.plugin.settings.enableRulesetWeaselWords = value;
					await this.plugin.saveSettings();
				})
			);

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
				textArea.inputEl.addClass("settings-full-width-textarea");
			});


		new Setting(containerEl)
			.setName('Language')
			.setDesc('Select the language for linting rules')
			.addDropdown(dropdown => {
				dropdown.addOption('en', 'English');
				dropdown.addOption('de', 'German');
				dropdown.setValue(this.plugin.settings.language || 'en');
				dropdown.onChange(async (value) => {
					this.plugin.settings.language = value as 'en' | 'de';
					await this.plugin.saveSettings();
				});
			});


	}
}





