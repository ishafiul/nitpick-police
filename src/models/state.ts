import { z } from 'zod';

const isValidFilePath = (path: string): boolean => {

  if (path.includes('..') || path.includes('\n') || path.includes('\r')) {
    return false;
  }

  const invalidChars = /[<>:"|?*\x00-\x1f]/;
  if (invalidChars.test(path)) return false;

  if (path.startsWith('/') || path.startsWith('\\')) return false;
  
  return true;
};

const isValidLineNumber = (line: number): boolean => {
  return line > 0 && line <= 1000000;
};

const BaseEntity = z.object({
  id: z.string().uuid(),
  created_at: z.date().or(z.string().datetime()).transform(val => 
    typeof val === 'string' ? new Date(val) : val
  ),
  updated_at: z.date().or(z.string().datetime()).transform(val => 
    typeof val === 'string' ? new Date(val) : val
  ),
});

export const ReviewStatus = z.enum([
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'cancelled'
]);

export const CommentSeverity = z.enum([
  'low',
  'medium',
  'high',
  'critical'
]);

export const CommentCategory = z.enum([
  'security',
  'performance',
  'style',
  'bug',
  'complexity'
]);

export const CommentStatus = z.enum([
  'open',
  'resolved',
  'acknowledged',
  'dismissed'
]);

export const ReviewComment = BaseEntity.extend({
  file_path: z.string().min(1).refine(
    isValidFilePath,
    { message: 'Invalid file path: contains invalid characters or path traversal' }
  ),
  line_number: z.number().int().positive().refine(
    isValidLineNumber,
    { message: 'Line number must be between 1 and 1,000,000' }
  ),
  severity: CommentSeverity,
  category: CommentCategory,
  message: z.string().min(1).max(10000),
  status: CommentStatus,
  resolved_at: z.date().or(z.string().datetime()).optional().transform(val => 
    val ? (typeof val === 'string' ? new Date(val) : val) : undefined
  ),
});

export const ReviewState = BaseEntity.extend({
  commit_sha: z.string().min(7).max(40).refine(
    (sha) => /^[a-f0-9]+$/i.test(sha),
    { message: 'Invalid commit SHA format' }
  ),
  status: ReviewStatus,
  comments: z.array(ReviewComment).default([]),
  metadata: z.record(z.unknown()).optional(),
});

export const CommitIndex = BaseEntity.extend({
  sha: z.string().min(7).max(40).refine(
    (sha) => /^[a-f0-9]+$/i.test(sha),
    { message: 'Invalid commit SHA format' }
  ),
  summary: z.string().min(1).max(1000),
  embeddings: z.array(z.number()).optional(),
  indexed_at: z.date().or(z.string().datetime()).transform(val => 
    typeof val === 'string' ? new Date(val) : val
  ),
});

export const AppState = z.object({
  version: z.string().default('1.0.0'),
  schema_version: z.string().default('1.0.0'),
  last_updated: z.date().or(z.string().datetime()).transform(val => 
    typeof val === 'string' ? new Date(val) : val
  ),
  reviews: z.array(ReviewState).default([]),
  commits: z.array(CommitIndex).default([]),
  settings: z.object({
    backup_enabled: z.boolean().default(true),
    max_backups: z.number().int().positive().default(5),
    auto_backup: z.boolean().default(true),
    backup_interval_hours: z.number().int().positive().default(24),
  }).default({}),
});

export type ReviewCommentType = z.infer<typeof ReviewComment>;
export type ReviewStateType = z.infer<typeof ReviewState>;
export type CommitIndexType = z.infer<typeof CommitIndex>;
export type AppStateType = z.infer<typeof AppState>;
export type ReviewStatusType = z.infer<typeof ReviewStatus>;
export type CommentSeverityType = z.infer<typeof CommentSeverity>;
export type CommentCategoryType = z.infer<typeof CommentCategory>;
export type CommentStatusType = z.infer<typeof CommentStatus>;

export const serializeState = (state: AppStateType): string => {
  return JSON.stringify(state, null, 2);
};

export const deserializeState = (data: string): AppStateType => {
  const parsed = JSON.parse(data);
  return AppState.parse(parsed);
};

export const validateReviewComment = (data: unknown): ReviewCommentType => {
  return ReviewComment.parse(data);
};

export const validateReviewState = (data: unknown): ReviewStateType => {
  return ReviewState.parse(data);
};

export const validateCommitIndex = (data: unknown): CommitIndexType => {
  return CommitIndex.parse(data);
};

export const validateAppState = (data: unknown): AppStateType => {
  return AppState.parse(data);
};

export const getReviewCommentSchema = () => ReviewComment._def;
export const getReviewStateSchema = () => ReviewState._def;
export const getCommitIndexSchema = () => CommitIndex._def;
export const getAppStateSchema = () => AppState._def;

export const getAllSchemas = () => ({
  ReviewComment: ReviewComment._def,
  ReviewState: ReviewState._def,
  CommitIndex: CommitIndex._def,
  AppState: AppState._def,
  CommentSeverity: CommentSeverity._def,
  CommentCategory: CommentCategory._def,
  CommentStatus: CommentStatus._def,
  ReviewStatus: ReviewStatus._def,
});
