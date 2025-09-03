import { z } from 'zod';
import logger from '../utils/logger';

export const CodeReviewSchema = z.object({
  summary: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.enum(['security', 'performance', 'style', 'bug', 'complexity', 'maintainability']),
  issues: z.array(z.object({
    title: z.string(),
    description: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    category: z.enum(['security', 'performance', 'style', 'bug', 'complexity', 'maintainability']),
    file: z.string().optional(),
    line: z.number().optional(),
    code: z.string().optional(),
    suggestion: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })),
  recommendations: z.array(z.string()).optional(),
  overall_score: z.number().min(0).max(10).optional(),
});

export type CodeReview = z.infer<typeof CodeReviewSchema>;

export const CommitReviewSchema = z.object({
  summary: z.string(),
  impact: z.enum(['low', 'medium', 'high', 'critical']),
  categories: z.array(z.enum(['security', 'performance', 'style', 'bug', 'complexity', 'maintainability'])),
  files_changed: z.array(z.object({
    file: z.string(),
    changes: z.string(),
    issues: z.array(z.object({
      type: z.string(),
      description: z.string(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      suggestion: z.string().optional(),
    })),
  })),
  recommendations: z.array(z.string()).optional(),
  should_block: z.boolean().optional(),
});

export type CommitReview = z.infer<typeof CommitReviewSchema>;

export function extractJsonFromResponse(responseText: string): { json: any; raw: string } | null {
  if (!responseText || typeof responseText !== 'string') {
    return null;
  }

  const trimmed = responseText.trim();

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const jsonText = codeBlockMatch[1].trim();
    try {
      const parsed = JSON.parse(jsonText);
      return { json: parsed, raw: jsonText };
    } catch (error) {
      logger.debug('Failed to parse JSON from code block', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  const jsonStart = trimmed.indexOf('{');
  if (jsonStart !== -1) {
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let jsonEnd = jsonStart;

    for (let i = jsonStart; i < trimmed.length; i++) {
      const char = trimmed[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
    }

    if (braceCount === 0 && jsonEnd > jsonStart) {
      const jsonText = trimmed.substring(jsonStart, jsonEnd);
      try {
        const parsed = JSON.parse(jsonText);
        return { json: parsed, raw: jsonText };
      } catch (error) {
        logger.debug('Failed to parse extracted JSON', { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  try {
    const parsed = JSON.parse(trimmed);
    return { json: parsed, raw: trimmed };
  } catch (error) {
    logger.debug('Failed to parse entire response as JSON', { error: error instanceof Error ? error.message : String(error) });
  }

  logger.warn('Could not extract valid JSON from response', {
    responseLength: responseText.length,
    responsePreview: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''),
  });

  return null;
}

export function parseCodeReviewResponse(responseText: string): CodeReview | null {
  const extracted = extractJsonFromResponse(responseText);
  if (!extracted) {
    return null;
  }

  try {
    const validated = CodeReviewSchema.parse(extracted.json);
    logger.debug('Successfully parsed code review response', {
      issueCount: validated.issues.length,
      severity: validated.severity,
      category: validated.category,
    });
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Code review validation failed', {
        errors: error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
        jsonPreview: JSON.stringify(extracted.json).substring(0, 500) + '...',
      });
    } else {
      logger.error('Unexpected validation error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

export function parseCommitReviewResponse(responseText: string): CommitReview | null {
  const extracted = extractJsonFromResponse(responseText);
  if (!extracted) {
    return null;
  }

  try {
    const validated = CommitReviewSchema.parse(extracted.json);
    logger.debug('Successfully parsed commit review response', {
      filesChanged: validated.files_changed.length,
      categories: validated.categories,
      impact: validated.impact,
    });
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Commit review validation failed', {
        errors: error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
        jsonPreview: JSON.stringify(extracted.json).substring(0, 500) + '...',
      });
    } else {
      logger.error('Unexpected validation error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

export function extractMultipleJsonObjects(responseText: string): Array<{ json: any; raw: string }> {
  const results: Array<{ json: any; raw: string }> = [];
  let remainingText = responseText;

  while (remainingText.length > 0) {
    const extracted = extractJsonFromResponse(remainingText);
    if (!extracted) {
      break;
    }

    results.push(extracted);

    const index = remainingText.indexOf(extracted.raw);
    if (index !== -1) {
      remainingText = remainingText.substring(index + extracted.raw.length).trim();
    } else {
      break;
    }
  }

  return results;
}

export function cleanResponseText(text: string): string {
  return text
    
    .replace(/\*\*([^*]+)\*\*/g, '$1')  
    .replace(/\*([^*]+)\*/g, '$1')      
    .replace(/`([^`]+)`/g, '$1')        
    .replace(/^\s*[-*+]\s+/gm, '')     
    .replace(/^\s*\d+\.\s+/gm, '')     
    .replace(/^\s*#{1,6}\s+/gm, '')    
    .replace(/^\s*>\s+/gm, '')         
    .replace(/^\s*[-*_]{3,}\s*$/gm, '') 
    
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateJsonStructure(json: any, schema: z.ZodSchema): boolean {
  try {
    schema.parse(json);
    return true;
  } catch (error) {
    return false;
  }
}

export function getValidationErrors(json: any, schema: z.ZodSchema): string[] {
  try {
    schema.parse(json);
    return [];
  } catch (error) {
    if (error instanceof z.ZodError) {
      return error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    }
    return [error instanceof Error ? error.message : String(error)];
  }
}
