import { GuardianReport } from '../types/index.js';
export declare class MarkdownReporter {
    /**
     * Generates a GitHub Pull Request comment or CI summary report in markdown.
     */
    generate(report: GuardianReport): string;
    private escapeHtml;
    private detectLanguage;
}
