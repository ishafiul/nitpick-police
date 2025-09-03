import {
  PromptOptions,
  ComposedPrompt,
  PromptCompositionResult,
  PromptSection,
  validatePromptOptions,
  DefaultTokenAllocations,
} from '../../types/prompt';
import {
  RetrievalResult,
} from '../../types/retrieval';
import {
  buildPreamble,
  summarizeContext,
  summarizeDiffs,
  formatInsights,
  buildInstructions,
  prioritizeChunks,
} from './section-builders';
import {
  createTokenBudget,
  validateTokenBudget,
  estimateTokens,
  truncateText,
} from '../../utils/tokens';
import logger from '../../utils/logger';

export class PromptComposer {
  private composerInitialized: boolean = false;

  constructor() {
    this.composerInitialized = true;
  }

  async composePrompt(
    retrievalResult: RetrievalResult,
    options: PromptOptions
  ): Promise<PromptCompositionResult> {
    try {
      
      const validatedOptions = validatePromptOptions(options);

      logger.info('Starting prompt composition', {
        tokenBudget: validatedOptions.tokenBudget,
        responseFormat: validatedOptions.responseFormat,
        chunksCount: retrievalResult.chunks?.length || 0,
        insightsCount: retrievalResult.insights?.length || 0,
      });

      const budget = createTokenBudget(validatedOptions);
      const budgetValidation = validateTokenBudget(budget);

      if (!budgetValidation.isValid) {
        return {
          success: false,
          errors: [{
            type: 'token_budget_exceeded',
            message: 'Invalid token budget allocation',
            details: budgetValidation.errors,
          }],
        };
      }

      const sections = await this.buildSections(retrievalResult, validatedOptions, budget);

      const assembledPrompt = this.assemblePrompt(sections);

      const finalEstimation = estimateTokens(assembledPrompt);
      const budgetUsed = finalEstimation.tokenCount;
      const budgetRemaining = validatedOptions.tokenBudget - budgetUsed;

      let finalPrompt = assembledPrompt;
      let truncated = false;
      let originalTokenCount: number | undefined;

      if (budgetUsed > validatedOptions.tokenBudget) {
        logger.warn('Prompt exceeds token budget, truncating', {
          budgetUsed,
          tokenBudget: validatedOptions.tokenBudget,
          excess: budgetUsed - validatedOptions.tokenBudget,
        });

        const truncatedResult = this.truncatePrompt(assembledPrompt, validatedOptions.tokenBudget);
        finalPrompt = truncatedResult.prompt;
        truncated = true;
        originalTokenCount = finalEstimation.tokenCount;
      }

      const composedPrompt: ComposedPrompt = {
        text: finalPrompt,
        tokenCount: estimateTokens(finalPrompt).tokenCount,
        sections,
        metadata: {
          truncated,
          originalTokenCount,
          budgetUsed,
          budgetRemaining,
          timestamp: new Date().toISOString(),
          allocations: validatedOptions.tokenAllocations || DefaultTokenAllocations,
        },
      };

      logger.info('Prompt composition completed', {
        finalTokenCount: composedPrompt.tokenCount,
        truncated,
        budgetUsed,
        budgetRemaining,
      });

      return {
        success: true,
        prompt: composedPrompt,
      };

    } catch (error) {
      logger.error('Prompt composition failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        errors: [{
          type: 'composition_failed',
          message: error instanceof Error ? error.message : 'Unknown composition error',
          details: error,
        }],
      };
    }
  }

  private async buildSections(
    retrievalResult: RetrievalResult,
    options: PromptOptions,
    budget: any
  ): Promise<PromptSection> {
    
    const preamble = buildPreamble(options, budget.allocated.preamble);

    const prioritizedChunks = prioritizeChunks(retrievalResult.chunks || []);
    const contextSummary = summarizeContext(prioritizedChunks, budget.allocated.context);
    const context = this.formatContextSection(contextSummary);

    const diffsSummary = summarizeDiffs(options.commitRange, budget.allocated.diffs);
    const diffs = this.formatDiffsSection(diffsSummary);

    const insightsSummary = formatInsights(retrievalResult.insights, budget.allocated.insights);
    const insights = insightsSummary.summary;

    const instructions = buildInstructions(options, budget.allocated.instructions);

    return {
      preamble,
      context,
      diffs,
      insights,
      instructions,
    };
  }

  private formatContextSection(summary: any): string {
    if (summary.originalChunks === 0) {
      return '## Code Context\n\nNo relevant code context found for this query.\n';
    }

    const parts: string[] = [];
    parts.push('## Code Context\n');
    parts.push(`Found ${summary.originalChunks} relevant code chunks:\n`);

    parts.push(summary.summary);

    if (summary.keyFunctions.length > 0) {
      parts.push('\n### Key Functions:');
      summary.keyFunctions.forEach((func: string) => {
        parts.push(`- ${func}`);
      });
      parts.push('');
    }

    if (summary.keyClasses.length > 0) {
      parts.push('### Key Classes:');
      summary.keyClasses.forEach((cls: string) => {
        parts.push(`- ${cls}`);
      });
      parts.push('');
    }

    if (summary.patterns.length > 0) {
      parts.push('### Code Patterns Detected:');
      summary.patterns.forEach((pattern: string) => {
        parts.push(`- ${pattern}`);
      });
      parts.push('');
    }

    return parts.join('\n');
  }

  private formatDiffsSection(summary: any): string {
    const parts: string[] = [];
    parts.push('## Code Changes\n');
    parts.push(summary.summary);

    if (summary.keyChanges.length > 0) {
      parts.push('\n### Key Changes:');
      summary.keyChanges.forEach((change: any) => {
        parts.push(`- **${change.type.toUpperCase()}**: ${change.file} - ${change.description}`);
      });
      parts.push('');
    }

    return parts.join('\n');
  }

  private assemblePrompt(sections: PromptSection): string {
    const parts: string[] = [];

    if (sections.preamble.trim()) {
      parts.push(sections.preamble);
    }

    if (sections.context.trim()) {
      parts.push(sections.context);
    }

    if (sections.diffs.trim()) {
      parts.push(sections.diffs);
    }

    if (sections.insights.trim()) {
      parts.push(sections.insights);
    }

    if (sections.instructions.trim()) {
      parts.push(sections.instructions);
    }

    return parts.join('\n\n');
  }

  private truncatePrompt(prompt: string, maxTokens: number): {
    prompt: string;
    originalTokens: number;
    truncatedTokens: number;
  } {
    const truncated = truncateText(prompt, maxTokens);

    logger.warn('Prompt truncated due to token limit', {
      originalTokens: truncated.originalTokens,
      truncatedTokens: truncated.truncatedTokens,
      maxTokens,
      reductionPercent: ((truncated.originalTokens - truncated.truncatedTokens) / truncated.originalTokens * 100).toFixed(1),
    });

    return {
      prompt: truncated.truncatedText,
      originalTokens: truncated.originalTokens,
      truncatedTokens: truncated.truncatedTokens,
    };
  }

  getCompositionStats(): {
    sectionsBuilt: number;
    averageCompositionTime: number;
    truncationRate: number;
    budgetUtilization: number;
  } {
    
    return {
      sectionsBuilt: 0,
      averageCompositionTime: 0,
      truncationRate: 0,
      budgetUtilization: 0,
    };
  }

  async previewComposition(
    retrievalResult: RetrievalResult,
    options: PromptOptions
  ): Promise<{
    estimatedTokenCount: number;
    sectionsBreakdown: Record<string, number>;
    budgetUtilization: number;
    warnings: string[];
  }> {
    try {
      const validatedOptions = validatePromptOptions(options);
      const budget = createTokenBudget(validatedOptions);

      const preambleTokens = estimateTokens(buildPreamble(validatedOptions, budget.allocated.preamble)).tokenCount;
      const contextTokens = estimateTokens(this.formatContextSection(summarizeContext(retrievalResult.chunks || [], budget.allocated.context))).tokenCount;
      const diffsTokens = estimateTokens(this.formatDiffsSection(summarizeDiffs(validatedOptions.commitRange, budget.allocated.diffs))).tokenCount;
      const insightsTokens = estimateTokens(formatInsights(retrievalResult.insights, budget.allocated.insights).summary).tokenCount;
      const instructionsTokens = estimateTokens(buildInstructions(validatedOptions, budget.allocated.instructions)).tokenCount;

      const totalEstimated = preambleTokens + contextTokens + diffsTokens + insightsTokens + instructionsTokens;
      const budgetUtilization = (totalEstimated / validatedOptions.tokenBudget) * 100;

      const warnings: string[] = [];
      if (budgetUtilization > 100) {
        warnings.push(`Estimated tokens (${totalEstimated}) exceed budget (${validatedOptions.tokenBudget})`);
      } else if (budgetUtilization > 80) {
        warnings.push(`High budget utilization: ${budgetUtilization.toFixed(1)}%`);
      }

      return {
        estimatedTokenCount: totalEstimated,
        sectionsBreakdown: {
          preamble: preambleTokens,
          context: contextTokens,
          diffs: diffsTokens,
          insights: insightsTokens,
          instructions: instructionsTokens,
        },
        budgetUtilization,
        warnings,
      };

    } catch (error) {
      throw new Error(`Preview failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  isInitialized(): boolean {
    return this.composerInitialized;
  }
}
