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
		function escapeRegex(str: string): string {
			return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		}

		const enabledRuleTypes: RuleType[] = [
			...(this.settings.enableRulesetWeakQualifiers ? [RuleType.WeakQualifier] : []),
			...(this.settings.enableRulesetFillerWords ? [RuleType.FillerWord] : []),
			...(this.settings.enableRulesetWeaselWords ? [RuleType.WeaselWord] : []),
			...(this.settings.enableRulesetJargon ? [RuleType.Jargon] : []),
			...(this.settings.enableRulesetComplexity ? [RuleType.Complexity] : []),
			...(this.settings.enableRulesetRedundancies ? [RuleType.Redundancy] : []),
		];

		this.rules.resetCustomRules();
		const customExceptions: string[] = [];

		if(this.settings.customWordList.trim().length > 0) {
			this.settings.customWordList.trim().split(/\r?\n/).forEach(str => {
				const s = str.trim();
				if (!s) return; // skip empty
				if (s.startsWith('-')) {
					customExceptions.push(s.substring(1));
				} else {
					this.rules.addCustomRule(s);
				}
			});
		}

		let words: string[] = this.rules.getMatchStrings(enabledRuleTypes, customExceptions)
			.map(w => w.trim())
			.filter(Boolean)
			.map(escapeRegex);

		if(words.length > 0) {
			const pattern = `\\b(?:${words.join("|")})\\b`;
			try {
				this.regex = new RegExp(pattern, 'gi');
			} catch (e) {
				console.error('Invalid regex pattern for Cut the Fluff plugin:', pattern, e);
				this.regex = null;
			}
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

						const matchingRule: Rule | undefined = plugin.rules.getRuleByMatchString(match[0]);
						if (!matchingRule) {
							console.warn('No matching rule found for:', match[0]);
							continue;
						}

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
			.setName('Hervorhebung aktivieren')
			.setDesc('Du kannst das Hervorheben auch über die Befehlspalette ein- und ausschalten')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enabled)
				.onChange(async (value) => {
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Hervorhebungsstil')
			.setDesc('Wenn "Keine" gewählt wird, werden nur CSS-Klassen zu Treffern hinzugefügt, aber keine Formatierung. Du kannst dann selbst im User-Stylesheet formatieren.')
			.addDropdown(dropdown => {
				dropdown.addOption('dim', 'Abgeblendet');
				dropdown.addOption('wavy-underline', 'Gewellte Unterstreichung');
				dropdown.addOption('strikethrough', 'Durchgestrichen');
				dropdown.addOption('none', 'Keine');

				dropdown.setValue(this.plugin.settings.highlightStyle);

				dropdown.onChange(async (newValue) => {

					this.plugin.settings.highlightStyle = newValue;
					await this.plugin.saveSettings();
				});
			});

		/*
		new Setting(containerEl)
			.setName('Tooltips aktivieren')

			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableTooltips) // Set the initial state of the toggle from loaded settings
				.onChange(async (value) => { // This function runs whenever the toggle is changed
					this.plugin.settings.enableTooltips = value;
					await this.plugin.saveSettings();
				}));
		*/

		new Setting(containerEl).setName('Eingebaute Regelsets').setHeading();

		new Setting(containerEl)
			.setName('Schwache Qualifizierer')
			.setDesc('z.B. sehr, ziemlich, wirklich')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRulesetWeakQualifiers) // Set the initial state of the toggle from loaded settings
				.onChange(async (value) => { // This function runs whenever the toggle is changed
					this.plugin.settings.enableRulesetWeakQualifiers = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Klischees, Jargon und Metaphern')
			.setDesc('z.B. das Rad neu erfinden, doppelte Buchführung, Paradigmenwechsel')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRulesetJargon) // Set the initial state of the toggle from loaded settings
				.onChange(async (value) => { // This function runs whenever the toggle is changed
					this.plugin.settings.enableRulesetJargon = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Unnötige Komplexität oder Überfrachtung')
			.setDesc('z.B. irrtümlich (falsch), bezüglich (über), nutzen (verwenden), aufgrund der Tatsache, dass (weil)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRulesetComplexity) // Set the initial state of the toggle from loaded settings
				.onChange(async (value) => { // This function runs whenever the toggle is changed
					this.plugin.settings.enableRulesetComplexity = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Redundanzen')
			.setDesc('z.B. gemeinsam zusammen, grundlegende Grundlagen, äußerst wichtig, endgültiges Fazit')
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
			.setName('Benutzerdefiniert')
			.setDesc('Trenne jeden Eintrag mit einem Zeilenumbruch. Ein Eintrag mit einem Bindestrich am Anfang fügt eine Ausnahme für eine eingebaute Regel hinzu.')
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

		new Setting(containerEl).setName('Eigene Regeln').setDesc('Trenne jeden Eintrag mit einem Zeilenumbruch. Ein Eintrag mit einem Bindestrich am Anfang fügt eine Ausnahme für eine eingebaute Regel hinzu.').setHeading();

		new TextAreaComponent(containerEl)
			.setValue(this.plugin.settings.customWordList)
			.setPlaceholder("eine Regel\nje Zeile\n-Ausnahme")
			.onChange(async (value) => {
				this.plugin.settings.customWordList = value;
				await this.plugin.saveSettings();
			})
			.then(textArea => {
				textArea.inputEl.addClass("settings-full-width-textarea");
			});

		new Setting(containerEl)
			.setName('Sprache')
			.setDesc('Wähle die Sprache für die Prüfregeln')
			.addDropdown(dropdown => {
				dropdown.addOption('en', 'Englisch');
				dropdown.addOption('de', 'Deutsch');
				dropdown.setValue(this.plugin.settings.language || 'en');
				dropdown.onChange(async (value) => {
					this.plugin.settings.language = value as 'en' | 'de';
					await this.plugin.saveSettings();
				});
			});


	}
}





