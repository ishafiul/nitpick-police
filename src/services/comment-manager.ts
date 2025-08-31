import { 
  ReviewCommentType, 
  CommentStatusType, 
  CommentSeverityType, 
  CommentCategoryType,
  validateReviewComment
} from '../models/state';
import { StateManager } from '../core/state-manager';
import logger from '../utils/logger';

export interface CommentFilter {
  severity?: CommentSeverityType[];
  category?: CommentCategoryType[];
  status?: CommentStatusType[];
  filePath?: string;
  lineNumber?: number;
  createdAfter?: Date;
  createdBefore?: Date;
  updatedAfter?: Date;
  updatedBefore?: Date;
  message?: string;
}

export interface CommentSort {
  field: 'created_at' | 'updated_at' | 'severity' | 'line_number' | 'file_path' | 'status';
  direction: 'asc' | 'desc';
}

export interface CommentSearchParams {
  query: string;
  fields?: ('message' | 'file_path')[];
  fuzzy?: boolean;
  caseSensitive?: boolean;
}

export interface BulkOperationResult {
  success: number;
  failed: number;
  errors: Array<{ commentId: string; error: string }>;
}

export interface CommentHistory {
  commentId: string;
  changes: Array<{
    timestamp: Date;
    field: string;
    oldValue: unknown;
    newValue: unknown;
    userId?: string;
  }>;
}

export interface CommentExport {
  version: string;
  exportedAt: Date;
  comments: ReviewCommentType[];
  metadata: {
    totalCount: number;
    filterApplied?: CommentFilter | undefined;
    exportFormat: 'json' | 'csv';
  };
}

export class CommentManager {
  private stateManager: StateManager;
  private commentHistory: Map<string, CommentHistory>;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.commentHistory = new Map();
  }

  async createComment(
    reviewId: string,
    commentData: Omit<ReviewCommentType, 'id' | 'created_at' | 'updated_at'>
  ): Promise<ReviewCommentType> {
    try {
      const state = await this.stateManager.getState();
      const review = state.reviews.find(r => r.id === reviewId);
      
      if (!review) {
        throw new Error(`Review with ID ${reviewId} not found`);
      }

      const newComment: ReviewCommentType = {
        ...commentData,
        id: crypto.randomUUID(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const validatedComment = validateReviewComment(newComment);
      
      review.comments.push(validatedComment);
      review.updated_at = new Date();
      
      await this.stateManager.updateState({ reviews: state.reviews });
      
      this.commentHistory.set(validatedComment.id, {
        commentId: validatedComment.id,
        changes: [{
          timestamp: new Date(),
          field: 'created',
          oldValue: null,
          newValue: validatedComment,
        }]
      });

      logger.info(`Created comment ${validatedComment.id} in review ${reviewId}`);
      return validatedComment;
    } catch (error) {
      logger.error(`Failed to create comment: ${error}`);
      throw error;
    }
  }

  async getComment(commentId: string): Promise<ReviewCommentType | null> {
    try {
      const state = await this.stateManager.getState();
      
      for (const review of state.reviews) {
        if (!review) continue;
        const comment = review.comments.find(c => c.id === commentId);
        if (comment) {
          return comment;
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Failed to get comment ${commentId}: ${error}`);
      throw error;
    }
  }

  async updateComment(
    commentId: string,
    updates: Partial<Omit<ReviewCommentType, 'id' | 'created_at'>>
  ): Promise<ReviewCommentType> {
    try {
      const state = await this.stateManager.getState();
      let reviewIndex = -1;
      let commentIndex = -1;

      for (let i = 0; i < state.reviews.length; i++) {
        const review = state.reviews[i];
        if (!review) continue;
        const commentIdx = review.comments.findIndex(c => c.id === commentId);
        if (commentIdx !== -1) {
          reviewIndex = i;
          commentIndex = commentIdx;
          break;
        }
      }

      if (reviewIndex === -1 || commentIndex === -1) {
        throw new Error(`Comment with ID ${commentId} not found`);
      }

      const review = state.reviews[reviewIndex];
      if (!review) {
        throw new Error(`Review not found at index ${reviewIndex}`);
      }

      const oldComment = review.comments[commentIndex];
      if (!oldComment) {
        throw new Error(`Comment with ID ${commentId} not found`);
      }
      
      const updatedComment: ReviewCommentType = {
        id: oldComment.id,
        created_at: oldComment.created_at,
        updated_at: new Date(),
        severity: updates.severity ?? oldComment.severity,
        line_number: updates.line_number ?? oldComment.line_number,
        file_path: updates.file_path ?? oldComment.file_path,
        status: updates.status ?? oldComment.status,
        message: updates.message ?? oldComment.message,
        category: updates.category ?? oldComment.category,
        resolved_at: 'resolved_at' in updates ? updates.resolved_at : oldComment.resolved_at,
      };

      const validatedComment = validateReviewComment(updatedComment);
      
      review.comments[commentIndex] = validatedComment;
      review.updated_at = new Date();
      
      await this.stateManager.updateState({ reviews: state.reviews });
      
      this.trackCommentChanges(commentId, oldComment, validatedComment, updates);
      
      logger.info(`Updated comment ${commentId}`);
      return validatedComment;
    } catch (error) {
      logger.error(`Failed to update comment ${commentId}: ${error}`);
      throw error;
    }
  }

  async deleteComment(commentId: string): Promise<boolean> {
    try {
      const state = await this.stateManager.getState();
      let deleted = false;

      for (let i = 0; i < state.reviews.length; i++) {
        const review = state.reviews[i];
        if (!review) continue;
        const commentIndex = review.comments.findIndex(c => c.id === commentId);
        
        if (commentIndex !== -1) {
          review.comments.splice(commentIndex, 1);
          review.updated_at = new Date();
          deleted = true;
          break;
        }
      }

      if (!deleted) {
        throw new Error(`Comment with ID ${commentId} not found`);
      }

      await this.stateManager.updateState({ reviews: state.reviews });
      
      this.commentHistory.delete(commentId);
      
      logger.info(`Deleted comment ${commentId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete comment ${commentId}: ${error}`);
      throw error;
    }
  }

  async updateCommentStatus(
    commentId: string,
    status: CommentStatusType,
    resolvedAt?: Date
  ): Promise<ReviewCommentType> {
    const updates: Partial<ReviewCommentType> = {
      status,
      updated_at: new Date(),
    };

    if (status === 'resolved' && resolvedAt) {
      updates.resolved_at = resolvedAt;
    } else if (status !== 'resolved') {
      updates.resolved_at = undefined;
    }

    return this.updateComment(commentId, updates);
  }

  async filterComments(filter: CommentFilter): Promise<ReviewCommentType[]> {
    try {
      const state = await this.stateManager.getState();
      const allComments: ReviewCommentType[] = [];
      
      state.reviews.forEach(review => {
        if (review) {
          allComments.push(...review.comments);
        }
      });

      return allComments.filter(comment => {
        if (filter.severity && !filter.severity.includes(comment.severity)) {
          return false;
        }

        if (filter.category && !filter.category.includes(comment.category)) {
          return false;
        }

        if (filter.status && !filter.status.includes(comment.status)) {
          return false;
        }

        if (filter.filePath && !comment.file_path.includes(filter.filePath)) {
          return false;
        }

        if (filter.lineNumber && comment.line_number !== filter.lineNumber) {
          return false;
        }

        if (filter.createdAfter && comment.created_at < filter.createdAfter) {
          return false;
        }

        if (filter.createdBefore && comment.created_at > filter.createdBefore) {
          return false;
        }

        if (filter.updatedAfter && comment.updated_at < filter.updatedAfter) {
          return false;
        }

        if (filter.updatedBefore && comment.updated_at > filter.updatedBefore) {
          return false;
        }

        if (filter.message && !comment.message.toLowerCase().includes(filter.message.toLowerCase())) {
          return false;
        }

        return true;
      });
    } catch (error) {
      logger.error(`Failed to filter comments: ${error}`);
      throw error;
    }
  }

  async sortComments(
    comments: ReviewCommentType[],
    sort: CommentSort
  ): Promise<ReviewCommentType[]> {
    return [...comments].sort((a, b) => {
      let aValue: string | number | Date;
      let bValue: string | number | Date;

      switch (sort.field) {
        case 'created_at':
          aValue = a.created_at;
          bValue = b.created_at;
          break;
        case 'updated_at':
          aValue = a.updated_at;
          bValue = b.updated_at;
          break;
        case 'severity':
          aValue = this.getSeverityWeight(a.severity);
          bValue = this.getSeverityWeight(b.severity);
          break;
        case 'line_number':
          aValue = a.line_number;
          bValue = b.line_number;
          break;
        case 'file_path':
          aValue = a.file_path;
          bValue = b.file_path;
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sort.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sort.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  async searchComments(params: CommentSearchParams): Promise<ReviewCommentType[]> {
    try {
      const state = await this.stateManager.getState();
      const allComments: ReviewCommentType[] = [];
      
      state.reviews.forEach(review => {
        if (review) {
          allComments.push(...review.comments);
        }
      });

      const searchFields = params.fields || ['message', 'file_path'];
      const query = params.caseSensitive ? params.query : params.query.toLowerCase();

      return allComments.filter(comment => {
        return searchFields.some(field => {
          let value: string;
          
          switch (field) {
            case 'message':
              value = comment.message;
              break;
            case 'file_path':
              value = comment.file_path;
              break;
            default:
              return false;
          }

          if (!params.caseSensitive) {
            value = value.toLowerCase();
          }

          if (params.fuzzy) {
            let queryIndex = 0;
            for (let i = 0; i < value.length && queryIndex < query.length; i++) {
              if (value[i] === query[queryIndex]) {
                queryIndex++;
              }
            }
            return queryIndex === query.length;
          } else {
            return value.includes(query);
          }
        });
      });
    } catch (error) {
      logger.error(`Failed to search comments: ${error}`);
      throw error;
    }
  }

  async bulkUpdateStatus(
    commentIds: string[],
    status: CommentStatusType,
    resolvedAt?: Date
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const commentId of commentIds) {
      try {
        await this.updateCommentStatus(commentId, status, resolvedAt);
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          commentId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.info(`Bulk status update completed: ${result.success} success, ${result.failed} failed`);
    return result;
  }

  async bulkDeleteComments(commentIds: string[]): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const commentId of commentIds) {
      try {
        await this.deleteComment(commentId);
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          commentId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.info(`Bulk delete completed: ${result.success} success, ${result.failed} failed`);
    return result;
  }

  getCommentHistory(commentId: string): CommentHistory | null {
    return this.commentHistory.get(commentId) || null;
  }

  async exportComments(
    filter?: CommentFilter,
    format: 'json' | 'csv' = 'json'
  ): Promise<CommentExport> {
    try {
      const comments = filter ? await this.filterComments(filter) : await this.getAllComments();
      
      const exportData: CommentExport = {
        version: '1.0.0',
        exportedAt: new Date(),
        comments,
        metadata: {
          totalCount: comments.length,
          filterApplied: filter,
          exportFormat: format,
        }
      };

      return exportData;
    } catch (error) {
      logger.error(`Failed to export comments: ${error}`);
      throw error;
    }
  }

  async importComments(exportData: CommentExport): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const comment of exportData.comments) {
      try {
        const { id, created_at, updated_at, ...commentData } = comment;
        
        const state = await this.stateManager.getState();
        let review = state.reviews.find(r => r?.commit_sha === 'imported');
        
        if (!review) {
          review = {
            id: crypto.randomUUID(),
            commit_sha: 'imported',
            status: 'completed',
            comments: [],
            created_at: new Date(),
            updated_at: new Date(),
          };
          state.reviews.push(review);
        }

        await this.createComment(review.id, commentData);
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          commentId: comment.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return result;
  }

  private async getAllComments(): Promise<ReviewCommentType[]> {
    const state = await this.stateManager.getState();
    const allComments: ReviewCommentType[] = [];
    
    state.reviews.forEach(review => {
      if (review) {
        allComments.push(...review.comments);
      }
    });
    
    return allComments;
  }

  private trackCommentChanges(
    commentId: string,
    oldComment: ReviewCommentType,
    newComment: ReviewCommentType,
    updates: Partial<ReviewCommentType>
  ): void {
    const history = this.commentHistory.get(commentId);
    if (!history) return;

    const changes = Object.keys(updates).map(field => {
      const oldValue = (oldComment as any)[field];
      const newValue = (newComment as any)[field];
      
      if (oldValue !== newValue) {
        return {
          timestamp: new Date(),
          field,
          oldValue,
          newValue,
        };
      }
      return null;
    }).filter((change): change is NonNullable<typeof change> => change !== null);

    history.changes.push(...changes);
  }

  private getSeverityWeight(severity: CommentSeverityType): number {
    switch (severity) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }

  async getCommentStats(): Promise<{
    total: number;
    byStatus: Record<CommentStatusType, number>;
    bySeverity: Record<CommentSeverityType, number>;
    byCategory: Record<CommentCategoryType, number>;
  }> {
    try {
      const comments = await this.getAllComments();
      
      const stats = {
        total: comments.length,
        byStatus: {} as Record<CommentStatusType, number>,
        bySeverity: {} as Record<CommentSeverityType, number>,
        byCategory: {} as Record<CommentCategoryType, number>,
      };

      ['open', 'resolved', 'acknowledged', 'dismissed'].forEach(status => {
        stats.byStatus[status as CommentStatusType] = 0;
      });

      ['low', 'medium', 'high', 'critical'].forEach(severity => {
        stats.bySeverity[severity as CommentSeverityType] = 0;
      });

      ['security', 'performance', 'style', 'bug', 'complexity'].forEach(category => {
        stats.byCategory[category as CommentCategoryType] = 0;
      });

      comments.forEach(comment => {
        stats.byStatus[comment.status]++;
        stats.bySeverity[comment.severity]++;
        stats.byCategory[comment.category]++;
      });

      return stats;
    } catch (error) {
      logger.error(`Failed to get comment stats: ${error}`);
      throw error;
    }
  }
}
