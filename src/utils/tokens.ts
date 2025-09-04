import {
  TokenBudget,
  TokenEstimation,
  PromptOptions,
  DefaultTokenAllocations
} from '../types/prompt';
import logger from './logger';

export function estimateTokens(text: string): TokenEstimation {
  if (!text || typeof text !== 'string') {
    return {
      text: text || '',
      tokenCount: 0,
      method: 'approximation',
    };
  }

  const charCount = text.length;
  const tokenCount = Math.ceil(charCount / 4);

  logger.debug('Token estimation', {
    charCount,
    estimatedTokens: tokenCount,
    method: 'approximation',
  });

  return {
    text,
    tokenCount,
    method: 'approximation',
  };
}

export function estimateTokensBatch(texts: string[]): TokenEstimation[] {
  return texts.map(text => estimateTokens(text));
}

export function getTotalTokenCount(estimations: TokenEstimation[]): number {
  return estimations.reduce((total, est) => total + est.tokenCount, 0);
}

export function createTokenBudget(options: PromptOptions): TokenBudget {
  const allocations = options.tokenAllocations || DefaultTokenAllocations;

  const alloc = allocations || {};
  const allocated = {
    preamble: Math.floor(options.tokenBudget * (alloc.preamble || 0.10)),
    context: Math.floor(options.tokenBudget * (alloc.context || 0.60)),
    diffs: Math.floor(options.tokenBudget * (alloc.diffs || 0.20)),
    insights: Math.floor(options.tokenBudget * (alloc.insights || 0.10)),
    instructions: Math.floor(options.tokenBudget * (alloc.instructions || 0.10)),
  };

  const allocatedTotal = Object.values(allocated).reduce((sum, val) => sum + val, 0);
  const remaining = options.tokenBudget - allocatedTotal;

  // Distribute remaining tokens proportionally to avoid exceeding budget
  if (remaining > 0) {
    // Add remaining tokens to context, but cap at total budget
    allocated.context = Math.min(allocated.context + remaining, options.tokenBudget - (allocatedTotal - allocated.context));
  } else if (remaining < 0) {
    // If we exceeded budget due to flooring, reduce context proportionally
    const excess = Math.abs(remaining);
    allocated.context = Math.max(0, allocated.context - excess);
  }

  const totalAllocated = Object.values(allocated).reduce((sum, val) => sum + val, 0);

  return {
    total: options.tokenBudget,
    allocated,
    remaining: options.tokenBudget - totalAllocated,
  };
}

export function validateTokenBudget(budget: TokenBudget): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const allocatedTotal = Object.values(budget.allocated).reduce((sum, val) => sum + val, 0);

  if (allocatedTotal > budget.total) {
    errors.push(`Allocated tokens (${allocatedTotal}) exceed total budget (${budget.total})`);
  }

  if (budget.remaining < 0) {
    errors.push(`Negative remaining tokens: ${budget.remaining}`);
  }

  Object.entries(budget.allocated).forEach(([section, tokens]) => {
    if (tokens < 0) {
      errors.push(`Negative allocation for ${section}: ${tokens}`);
    }
    if (tokens > budget.total) {
      errors.push(`Allocation for ${section} (${tokens}) exceeds total budget (${budget.total})`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function truncateText(text: string, maxTokens: number): {
  truncatedText: string;
  originalTokens: number;
  truncatedTokens: number;
  wasTruncated: boolean;
} {
  const originalEstimation = estimateTokens(text);
  const originalTokens = originalEstimation.tokenCount;

  if (originalTokens <= maxTokens) {
    return {
      truncatedText: text,
      originalTokens,
      truncatedTokens: originalTokens,
      wasTruncated: false,
    };
  }

  const targetChars = maxTokens * 4;

  let truncatedText = text.substring(0, targetChars);

  const lastNewline = truncatedText.lastIndexOf('\n');
  const lastSpace = truncatedText.lastIndexOf(' ');
  const lastPeriod = truncatedText.lastIndexOf('.');

  let stopIndex = targetChars;
  if (lastNewline > targetChars * 0.8) {
    stopIndex = lastNewline;
  } else if (lastSpace > targetChars * 0.8) {
    stopIndex = lastSpace;
  } else if (lastPeriod > targetChars * 0.8) {
    stopIndex = lastPeriod;
  }

  truncatedText = text.substring(0, stopIndex);
  const truncatedEstimation = estimateTokens(truncatedText);

  logger.debug('Text truncation', {
    originalChars: text.length,
    originalTokens,
    targetTokens: maxTokens,
    truncatedChars: truncatedText.length,
    truncatedTokens: truncatedEstimation.tokenCount,
  });

  return {
    truncatedText: truncatedText + '\n\n[Content truncated due to token budget]',
    originalTokens,
    truncatedTokens: truncatedEstimation.tokenCount,
    wasTruncated: true,
  };
}

export function truncateTexts(
  texts: Array<{ content: string; priority: number }>,
  totalBudget: number
): {
  truncatedTexts: Array<{ content: string; originalTokens: number; truncatedTokens: number; wasTruncated: boolean }>;
  totalOriginalTokens: number;
  totalTruncatedTokens: number;
  budgetUsed: number;
} {
  
  const sortedTexts = [...texts].sort((a, b) => b.priority - a.priority);

  const withEstimations = sortedTexts.map(item => ({
    ...item,
    estimation: estimateTokens(item.content),
  }));

  const totalOriginalTokens = withEstimations.reduce(
    (sum, item) => sum + item.estimation.tokenCount,
    0
  );

  if (totalOriginalTokens <= totalBudget) {
    return {
      truncatedTexts: withEstimations.map(item => ({
        content: item.content,
        originalTokens: item.estimation.tokenCount,
        truncatedTokens: item.estimation.tokenCount,
        wasTruncated: false,
      })),
      totalOriginalTokens,
      totalTruncatedTokens: totalOriginalTokens,
      budgetUsed: totalOriginalTokens,
    };
  }

  const totalTokens = withEstimations.reduce(
    (sum, item) => sum + item.estimation.tokenCount,
    0
  );

  let truncatedTexts: Array<{ content: string; originalTokens: number; truncatedTokens: number; wasTruncated: boolean }> = [];
  let budgetUsed = 0;

  for (const item of withEstimations) {
    const proportion = item.estimation.tokenCount / totalTokens;
    const allocatedBudget = Math.floor(totalBudget * proportion);

    if (allocatedBudget <= 0) {
      
      continue;
    }

    const truncation = truncateText(item.content, allocatedBudget);
    truncatedTexts.push({
      content: truncation.truncatedText,
      originalTokens: truncation.originalTokens,
      truncatedTokens: truncation.truncatedTokens,
      wasTruncated: truncation.wasTruncated,
    });
    budgetUsed += truncation.truncatedTokens;
  }

  return {
    truncatedTexts,
    totalOriginalTokens,
    totalTruncatedTokens: budgetUsed,
    budgetUsed,
  };
}

export function formatTokenBudget(budget: TokenBudget): string {
  const allocated = Object.entries(budget.allocated)
    .map(([section, tokens]) => `${section}: ${tokens}`)
    .join(', ');

  return `Total: ${budget.total}, Allocated: {${allocated}}, Remaining: ${budget.remaining}`;
}

export function fitsInBudget(text: string, maxTokens: number): boolean {
  const estimation = estimateTokens(text);
  return estimation.tokenCount <= maxTokens;
}

export function calculateCompressionRatio(
  originalTokens: number,
  truncatedTokens: number
): number {
  if (originalTokens === 0) return 1;
  return truncatedTokens / originalTokens;
}

export const TOKEN_ESTIMATION_METHODS = {
  APPROXIMATION: 'approximation' as const,
  TIKTOKEN: 'tiktoken' as const,
} as const;

export const TOKEN_MULTIPLIERS = {
  code: 0.25,        
  natural_text: 0.3, 
  mixed: 0.27,       
} as const;
