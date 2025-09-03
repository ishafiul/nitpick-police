import {
  RetrievedChunk,
  RetrievalResult,
} from '../../types/retrieval';
import {
  PromptOptions,
  ContextSummary,
  DiffSummary,
  InsightsSummary,
} from '../../types/prompt';
import {
  estimateTokens,
  truncateText,
} from '../../utils/tokens';
import logger from '../../utils/logger';

export function buildPreamble(options: PromptOptions, maxTokens: number): string {
  const parts: string[] = [];

  if (options.systemPrompt) {
    parts.push(`## System Instructions\n${options.systemPrompt}\n`);
  }

  if (options.guidelines) {
    parts.push(`## Code Review Guidelines\n${options.guidelines}\n`);
  }

  if (options.repositoryInfo) {
    const repo = options.repositoryInfo;
    parts.push(`## Repository Context\n- Repository: ${repo.name}\n- Branch: ${repo.branch}\n- Primary Language: ${repo.language}\n`);
  }

  if (options.customContext) {
    const customParts: string[] = [];
    for (const [key, value] of Object.entries(options.customContext)) {
      if (typeof value === 'string') {
        customParts.push(`- ${key}: ${value}`);
      } else if (typeof value === 'object') {
        customParts.push(`- ${key}: ${JSON.stringify(value, null, 2)}`);
      }
    }
    if (customParts.length > 0) {
      parts.push(`## Additional Context\n${customParts.join('\n')}\n`);
    }
  }

  const preambleText = parts.join('\n');

  if (estimateTokens(preambleText).tokenCount > maxTokens) {
    const truncated = truncateText(preambleText, maxTokens);
    logger.warn('Preamble truncated due to token budget', {
      originalTokens: truncated.originalTokens,
      truncatedTokens: truncated.truncatedTokens,
    });
    return truncated.truncatedText;
  }

  return preambleText;
}

export function summarizeContext(
  chunks: RetrievedChunk[],
  maxTokens: number
): ContextSummary {
  if (!chunks || chunks.length === 0) {
    return {
      originalChunks: 0,
      summarizedChunks: 0,
      totalTokens: 0,
      summary: '',
      keyFunctions: [],
      keyClasses: [],
      patterns: [],
      dependencies: [],
    };
  }

  const chunksByFile = new Map<string, RetrievedChunk[]>();
  for (const chunk of chunks) {
    const file = chunk.metadata.file;
    if (!chunksByFile.has(file)) {
      chunksByFile.set(file, []);
    }
    chunksByFile.get(file)!.push(chunk);
  }

  const summaryParts: string[] = [];
  const keyFunctions: string[] = [];
  const keyClasses: string[] = [];
  const patterns: string[] = [];
  const dependencies = new Set<string>();

  for (const [filePath, fileChunks] of chunksByFile.entries()) {
    const relativePath = filePath.split('/').slice(-3).join('/'); 
    summaryParts.push(`### ${relativePath}\n`);

    for (const chunk of fileChunks) {
      const metadata = chunk.metadata;

      const chunkType = metadata.chunkType.toUpperCase();
      const lines = `${metadata.startLine}-${metadata.endLine}`;
      summaryParts.push(`#### ${chunkType} (${lines})\n`);

      const contentPreview = chunk.content
        .split('\n')
        .slice(0, 10) 
        .join('\n');

      if (chunk.content.split('\n').length > 10) {
        summaryParts.push(`\`\`\`${metadata.language}\n${contentPreview}\n\`\`\`\n`);
      } else {
        summaryParts.push(`\`\`\`${metadata.language}\n${contentPreview}\n\`\`\`\n`);
      }

      if (metadata.chunkType === 'function' || metadata.chunkType === 'method') {
        keyFunctions.push(`${metadata.chunkType}: ${metadata.file}:${metadata.startLine}`);
      }

      if (metadata.chunkType === 'class') {
        keyClasses.push(`class: ${metadata.file}:${metadata.startLine}`);
      }

      if (metadata.dependencies) {
        metadata.dependencies.forEach(dep => dependencies.add(dep));
      }

      const content = chunk.content.toLowerCase();
      if (content.includes('async') && content.includes('await')) {
        patterns.push(`async/await pattern in ${metadata.file}`);
      }
      if (content.includes('try') && content.includes('catch')) {
        patterns.push(`error handling in ${metadata.file}`);
      }
      if (content.includes('interface') || content.includes('type')) {
        patterns.push(`type definitions in ${metadata.file}`);
      }
    }
  }

  const fullSummary = summaryParts.join('\n');

  let finalSummary = fullSummary;
  let totalTokens = estimateTokens(fullSummary).tokenCount;

  if (totalTokens > maxTokens) {
    const truncated = truncateText(fullSummary, maxTokens);
    finalSummary = truncated.truncatedText;
    totalTokens = truncated.truncatedTokens;

    logger.warn('Context summary truncated', {
      originalTokens: truncated.originalTokens,
      truncatedTokens: truncated.truncatedTokens,
      maxTokens,
    });
  }

  return {
    originalChunks: chunks.length,
    summarizedChunks: chunks.length, 
    totalTokens,
    summary: finalSummary,
    keyFunctions: keyFunctions.slice(0, 5), 
    keyClasses: keyClasses.slice(0, 5),
    patterns: [...new Set(patterns)].slice(0, 5), 
    dependencies: Array.from(dependencies).slice(0, 10), 
  };
}

export function summarizeDiffs(
  commitRange: { from: string; to: string } | undefined,
  maxTokens: number
): DiffSummary {

  const summary = `## Code Changes Summary

${commitRange ? `Changes from ${commitRange.from} to ${commitRange.to}:` : 'Recent code changes:'}

### Files Modified
- No specific diff information available yet
- This will be populated when Git integration is complete

### Key Changes
- Code structure modifications
- New functionality additions
- Bug fixes and improvements

### Areas of Focus
- Review new code additions carefully
- Check for potential breaking changes
- Verify error handling is adequate
`;

  const tokenCount = estimateTokens(summary).tokenCount;

  if (tokenCount > maxTokens) {
    const truncated = truncateText(summary, maxTokens);
    return {
      commits: 1, 
      filesChanged: 1, 
      additions: 0,
      deletions: 0,
      summary: truncated.truncatedText,
      keyChanges: [{
        file: 'unknown',
        type: 'modified',
        description: 'Changes detected but details not available',
      }],
    };
  }

  return {
    commits: 1, 
    filesChanged: 1, 
    additions: 0,
    deletions: 0,
    summary,
    keyChanges: [{
      file: 'unknown',
      type: 'modified',
      description: 'Changes detected but details not available',
    }],
  };
}

export function formatInsights(
  insights: RetrievalResult['insights'],
  maxTokens: number
): InsightsSummary {
  if (!insights || insights.length === 0) {
    return {
      totalInsights: 0,
      categories: {},
      severities: {},
      summary: '## Prior Review Insights\n\nNo prior insights available for this code.\n',
      keyIssues: [],
    };
  }

  const categories: Record<string, number> = {};
  const severities: Record<string, number> = {};
  const keyIssues: Array<{
    category: string;
    severity: string;
    summary: string;
  }> = [];

  let totalInsights = 0;

  for (const fileInsight of insights) {
    totalInsights += fileInsight.totalInsights;

    Object.entries(fileInsight.categories).forEach(([cat, count]) => {
      categories[cat] = (categories[cat] || 0) + count;
    });

    Object.entries(fileInsight.severities).forEach(([sev, count]) => {
      severities[sev] = (severities[sev] || 0) + count;
    });
  }

  const summaryParts: string[] = [];
  summaryParts.push('## Prior Review Insights\n');

  if (totalInsights > 0) {
    summaryParts.push(`Found ${totalInsights} prior review findings across ${insights.length} files.\n`);

    const severityOrder = ['critical', 'high', 'medium', 'low'];
    summaryParts.push('### Issues by Severity:');
    for (const sev of severityOrder) {
      if (severities[sev]) {
        summaryParts.push(`- ${sev.toUpperCase()}: ${severities[sev]} issues`);
      }
    }
    summaryParts.push('');

    summaryParts.push('### Issues by Category:');
    const sortedCategories = Object.entries(categories)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5); 

    for (const [cat, count] of sortedCategories) {
      summaryParts.push(`- ${cat}: ${count} issues`);
    }
    summaryParts.push('');

    summaryParts.push('### Key Recommendations:');
    summaryParts.push('- Pay special attention to issues in the categories above');
    summaryParts.push('- Review similar patterns in new code');
    summaryParts.push('- Ensure consistent error handling and validation');
    summaryParts.push('');

  } else {
    summaryParts.push('No significant issues found in prior reviews.\n');
  }

  const summary = summaryParts.join('\n');
  const tokenCount = estimateTokens(summary).tokenCount;

  if (tokenCount > maxTokens) {
    const truncated = truncateText(summary, maxTokens);
    logger.warn('Insights summary truncated', {
      originalTokens: truncated.originalTokens,
      truncatedTokens: truncated.truncatedTokens,
    });
    return {
      totalInsights,
      categories,
      severities,
      summary: truncated.truncatedText,
      keyIssues,
    };
  }

  return {
    totalInsights,
    categories,
    severities,
    summary,
    keyIssues,
  };
}

export function buildInstructions(options: PromptOptions, maxTokens: number): string {
  const parts: string[] = [];

  parts.push('## Response Instructions\n');

  switch (options.responseFormat) {
    case 'json':
      parts.push('Please provide your response in the following JSON format:');
      parts.push('```json');
      parts.push('{');
      parts.push('  "summary": "Brief summary of findings",');
      parts.push('  "issues": [');
      parts.push('    {');
      parts.push('      "file": "path/to/file",');
      parts.push('      "line": 123,');
      parts.push('      "category": "security|performance|style|bug|complexity|documentation|maintainability",');
      parts.push('      "severity": "low|medium|high|critical",');
      parts.push('      "comment": "Description of the issue",');
      parts.push('      "suggestion": "How to fix it (optional)"');
      parts.push('    }');
      parts.push('  ],');
      parts.push('  "recommendations": ["General suggestions"],');
      parts.push('  "overall_assessment": "good|needs_improvement|requires_attention"');
      parts.push('}');
      parts.push('```');

      if (options.jsonSchema) {
        parts.push('\nUse this JSON schema for validation:');
        parts.push('```json');
        parts.push(JSON.stringify(options.jsonSchema, null, 2));
        parts.push('```');
      }
      break;

    case 'markdown':
      parts.push('Please provide your response in markdown format with:');
      parts.push('- A summary section');
      parts.push('- Detailed issues with file/line references');
      parts.push('- Code examples where relevant');
      parts.push('- Actionable recommendations');
      break;

    case 'text':
      parts.push('Please provide a clear, structured text response covering:');
      parts.push('- Summary of findings');
      parts.push('- Specific issues with file and line references');
      parts.push('- Suggested improvements');
      parts.push('- Overall assessment');
      break;
  }

  if (options.maxIssues) {
    parts.push(`\nLimit your response to a maximum of ${options.maxIssues} issues.`);
    parts.push('Focus on the most important findings.');
  }

  parts.push('\nBe specific with file paths and line numbers when referencing code.');
  parts.push('Provide actionable suggestions for improvement.');
  parts.push('Explain the reasoning behind your assessments.');

  const instructionsText = parts.join('\n');
  const tokenCount = estimateTokens(instructionsText).tokenCount;

  if (tokenCount > maxTokens) {
    const truncated = truncateText(instructionsText, maxTokens);
    return truncated.truncatedText;
  }

  return instructionsText;
}

export function extractCodePatterns(content: string): string[] {
  const patterns: string[] = [];

  if (content.includes('async') && content.includes('await')) {
    patterns.push('async/await');
  }
  if (content.includes('try') && content.includes('catch')) {
    patterns.push('error handling');
  }
  if (content.includes('interface') || content.includes('type')) {
    patterns.push('type definitions');
  }
  if (content.includes('class')) {
    patterns.push('object-oriented');
  }
  if (content.includes('function') || content.includes('=>')) {
    patterns.push('functional programming');
  }

  return patterns;
}

export function prioritizeChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  return chunks.sort((a, b) => {
    
    const typePriority: Record<string, number> = {
      'function': 5,
      'class': 4,
      'method': 3,
      'module': 2,
      'block': 1,
      'statement': 0,
      'expression': 0,
      'file': 0,
    };

    const aPriority = typePriority[a.metadata.chunkType] || 0;
    const bPriority = typePriority[b.metadata.chunkType] || 0;

    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }

    return b.score - a.score;
  });
}
