import { v4 as uuidv4 } from 'uuid';
import {
  CommentSeverityType,
  CommentCategoryType,
  CommentStatusType,
  ReviewCommentType,
  ReviewStateType,
  CommitIndexType,
  AppStateType,
} from './state';

// Sample data generators for testing and development

export const generateSampleReviewComment = (overrides: Partial<ReviewCommentType> = {}): ReviewCommentType => {
  const defaults: ReviewCommentType = {
    id: uuidv4(),
    created_at: new Date(),
    updated_at: new Date(),
    file_path: 'src/components/Button.tsx',
    line_number: 42,
    severity: 'medium',
    category: 'style',
    message: 'Consider using const instead of let for this variable',
    status: 'open',
  };

  return { ...defaults, ...overrides };
};

export const generateSampleReviewState = (overrides: Partial<ReviewStateType> = {}): ReviewStateType => {
  const defaults: ReviewStateType = {
    id: uuidv4(),
    created_at: new Date(),
    updated_at: new Date(),
    commit_sha: 'a1b2c3d4e5f6789012345678901234567890abcd',
    status: 'pending',
    comments: [],
  };

  return { ...defaults, ...overrides };
};

export const generateSampleCommitIndex = (overrides: Partial<CommitIndexType> = {}): CommitIndexType => {
  const defaults: CommitIndexType = {
    id: uuidv4(),
    created_at: new Date(),
    updated_at: new Date(),
    sha: 'a1b2c3d4e5f6789012345678901234567890abcd',
    summary: 'Fix memory leak in user authentication module',
    indexed_at: new Date(),
  };

  return { ...defaults, ...overrides };
};

export const generateSampleAppState = (overrides: Partial<AppStateType> = {}): AppStateType => {
  const defaults: AppStateType = {
    version: '1.0.0',
    schema_version: '1.0.0',
    last_updated: new Date(),
    reviews: [],
    commits: [],
    settings: {
      backup_enabled: true,
      max_backups: 5,
      auto_backup: true,
      backup_interval_hours: 24,
    },
  };

  return { ...defaults, ...overrides };
};

// Generate multiple sample comments for a review
export const generateSampleComments = (count: number = 3): ReviewCommentType[] => {
  const comments: ReviewCommentType[] = [];
  
  for (let i = 0; i < count; i++) {
    comments.push(generateSampleReviewComment({
      file_path: `src/components/Component${i + 1}.tsx`,
      line_number: (i + 1) * 10,
      severity: ['low', 'medium', 'high', 'critical'][i % 4] as CommentSeverityType,
      category: ['security', 'performance', 'style', 'bug', 'complexity'][i % 5] as CommentCategoryType,
      message: `Sample comment ${i + 1} for testing purposes`,
      status: ['open', 'resolved', 'acknowledged', 'dismissed'][i % 4] as CommentStatusType,
    }));
  }
  
  return comments;
};

// Generate a complete review state with comments
export const generateSampleReviewWithComments = (commentCount: number = 3): ReviewStateType => {
  const comments = generateSampleComments(commentCount);
  
  return generateSampleReviewState({
    comments,
    status: 'in_progress',
  });
};

// Generate multiple commits for testing
export const generateSampleCommits = (count: number = 5): CommitIndexType[] => {
  const commits: CommitIndexType[] = [];
  
  for (let i = 0; i < count; i++) {
    commits.push(generateSampleCommitIndex({
      sha: `a1b2c3d4e5f6789012345678901234567890abc${i}`,
      summary: `Sample commit ${i + 1}: ${['Fix', 'Add', 'Update', 'Refactor', 'Remove'][i % 5]} ${['bug', 'feature', 'test', 'documentation', 'performance'][i % 5]}`,
      indexed_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000), // Each commit 1 day apart
    }));
  }
  
  return commits;
};

// Generate a complete app state with reviews and commits
export const generateSampleAppStateWithData = (
  reviewCount: number = 2,
  commitCount: number = 5,
  commentsPerReview: number = 3
): AppStateType => {
  const reviews: ReviewStateType[] = [];
  const commits: CommitIndexType[] = [];
  
  // Generate reviews
  for (let i = 0; i < reviewCount; i++) {
    reviews.push(generateSampleReviewWithComments(commentsPerReview));
  }
  
  // Generate commits
  commits.push(...generateSampleCommits(commitCount));
  
  return generateSampleAppState({
    reviews,
    commits,
  });
};

// Generate realistic code review scenarios
export const generateRealisticReviewScenario = (): {
  review: ReviewStateType;
  comments: ReviewCommentType[];
} => {
  const review = generateSampleReviewState({
    commit_sha: 'f8e7d6c5b4a39876543210987654321098765432',
    status: 'in_progress',
  });

  const comments: ReviewCommentType[] = [
    generateSampleReviewComment({
      file_path: 'src/auth/login.ts',
      line_number: 45,
      severity: 'high',
      category: 'security',
      message: 'Potential SQL injection vulnerability. Use parameterized queries instead of string concatenation.',
      status: 'open',
    }),
    generateSampleReviewComment({
      file_path: 'src/components/UserProfile.tsx',
      line_number: 23,
      severity: 'medium',
      category: 'performance',
      message: 'Consider memoizing this component to prevent unnecessary re-renders.',
      status: 'acknowledged',
    }),
    generateSampleReviewComment({
      file_path: 'src/utils/helpers.ts',
      line_number: 67,
      severity: 'low',
      category: 'style',
      message: 'Function name should follow camelCase convention.',
      status: 'resolved',
      resolved_at: new Date(),
    }),
    generateSampleReviewComment({
      file_path: 'src/api/endpoints.ts',
      line_number: 89,
      severity: 'critical',
      category: 'bug',
      message: 'Missing error handling for network failures. This could cause the app to crash.',
      status: 'open',
    }),
    generateSampleReviewComment({
      file_path: 'src/models/User.ts',
      line_number: 156,
      severity: 'medium',
      category: 'complexity',
      message: 'This method is doing too many things. Consider breaking it into smaller, focused methods.',
      status: 'open',
    }),
  ];

  review.comments = comments;
  
  return { review, comments };
};

// Export types for convenience
export type {
  ReviewCommentType,
  ReviewStateType,
  CommitIndexType,
  AppStateType,
} from './state';
