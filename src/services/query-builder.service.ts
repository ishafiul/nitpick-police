import { RetrievalFilter, RetrievalQuery } from '../types/retrieval';
import logger from '../utils/logger';

export interface QdrantFilter {
  must?: Array<Record<string, any>>;
  must_not?: Array<Record<string, any>>;
  should?: Array<Record<string, any>>;
  min_should?: {
    match: {
      [key: string]: any;
    };
  };
}

export interface FilterBuildResult {
  filter: QdrantFilter;
  appliedFilters: string[];
  warnings: string[];
}

export class QueryBuilderService {
  private queryBuilderInitialized: boolean = false;

  constructor() {
    // Service doesn't need initialization for now
    this.queryBuilderInitialized = true;
  }

  /**
   * Build Qdrant filter from retrieval query
   */
  buildFilter(query: RetrievalQuery): FilterBuildResult {
    const filter: QdrantFilter = {
      must: [],
      must_not: [],
      should: [],
    };

    const appliedFilters: string[] = [];
    const warnings: string[] = [];

    if (!query.filter) {
      return {
        filter: {},
        appliedFilters: [],
        warnings: ['No filters specified'],
      };
    }

    const f = query.filter;

    // File-based filters
    if (f.files && f.files.length > 0) {
      filter.must!.push({
        key: 'file',
        match: {
          any: f.files,
        },
      });
      appliedFilters.push(`files: ${f.files.length} specified`);
    }

    if (f.filePatterns && f.filePatterns.length > 0) {
      for (const pattern of f.filePatterns) {
        filter.must!.push(this.buildPatternFilter('file', pattern));
      }
      appliedFilters.push(`filePatterns: ${f.filePatterns.length} patterns`);
    }

    if (f.excludeFiles && f.excludeFiles.length > 0) {
      filter.must_not!.push({
        key: 'file',
        match: {
          any: f.excludeFiles,
        },
      });
      appliedFilters.push(`excludeFiles: ${f.excludeFiles.length} excluded`);
    }

    if (f.excludePatterns && f.excludePatterns.length > 0) {
      for (const pattern of f.excludePatterns) {
        filter.must_not!.push(this.buildPatternFilter('file', pattern));
      }
      appliedFilters.push(`excludePatterns: ${f.excludePatterns.length} patterns`);
    }

    // Language filters
    if (f.languages && f.languages.length > 0) {
      filter.must!.push({
        key: 'language',
        match: {
          any: f.languages,
        },
      });
      appliedFilters.push(`languages: ${f.languages.join(', ')}`);
    }

    if (f.excludeLanguages && f.excludeLanguages.length > 0) {
      filter.must_not!.push({
        key: 'language',
        match: {
          any: f.excludeLanguages,
        },
      });
      appliedFilters.push(`excludeLanguages: ${f.excludeLanguages.join(', ')}`);
    }

    // Chunk type filters
    if (f.chunkTypes && f.chunkTypes.length > 0) {
      filter.must!.push({
        key: 'chunkType',
        match: {
          any: f.chunkTypes,
        },
      });
      appliedFilters.push(`chunkTypes: ${f.chunkTypes.join(', ')}`);
    }

    if (f.excludeChunkTypes && f.excludeChunkTypes.length > 0) {
      filter.must_not!.push({
        key: 'chunkType',
        match: {
          any: f.excludeChunkTypes,
        },
      });
      appliedFilters.push(`excludeChunkTypes: ${f.excludeChunkTypes.join(', ')}`);
    }

    // Date-based filters
    if (f.createdAfter) {
      filter.must!.push({
        key: 'createdAt',
        range: {
          gte: f.createdAfter,
        },
      });
      appliedFilters.push(`createdAfter: ${f.createdAfter}`);
    }

    if (f.createdBefore) {
      filter.must!.push({
        key: 'createdAt',
        range: {
          lte: f.createdBefore,
        },
      });
      appliedFilters.push(`createdBefore: ${f.createdBefore}`);
    }

    // Commit-based filters
    if (f.commit) {
      filter.must!.push({
        key: 'commit',
        match: {
          value: f.commit,
        },
      });
      appliedFilters.push(`commit: ${f.commit}`);
    }

    if (f.commitRange) {
      // For commit ranges, we might need to get all commits in range
      // This is a simplified version - in practice, you'd want to resolve the range
      warnings.push('Commit range filtering not fully implemented');
      appliedFilters.push(`commitRange: ${f.commitRange.from}..${f.commitRange.to}`);
    }

    // Author filter
    if (f.author) {
      filter.must!.push({
        key: 'author',
        match: {
          value: f.author,
        },
      });
      appliedFilters.push(`author: ${f.author}`);
    }

    // Branch filter
    if (f.branch) {
      filter.must!.push({
        key: 'branch',
        match: {
          value: f.branch,
        },
      });
      appliedFilters.push(`branch: ${f.branch}`);
    }

    // Complexity filters
    if (f.minComplexity !== undefined) {
      filter.must!.push({
        key: 'complexityScore',
        range: {
          gte: f.minComplexity,
        },
      });
      appliedFilters.push(`minComplexity: ${f.minComplexity}`);
    }

    if (f.maxComplexity !== undefined) {
      filter.must!.push({
        key: 'complexityScore',
        range: {
          lte: f.maxComplexity,
        },
      });
      appliedFilters.push(`maxComplexity: ${f.maxComplexity}`);
    }

    // Dependency/Import filters
    if (f.hasDependencies === true) {
      filter.must!.push({
        key: 'dependencies',
        is_empty: false,
      });
      appliedFilters.push('hasDependencies: true');
    } else if (f.hasDependencies === false) {
      filter.must!.push({
        key: 'dependencies',
        is_empty: true,
      });
      appliedFilters.push('hasDependencies: false');
    }

    if (f.hasImports === true) {
      filter.must!.push({
        key: 'imports',
        is_empty: false,
      });
      appliedFilters.push('hasImports: true');
    } else if (f.hasImports === false) {
      filter.must!.push({
        key: 'imports',
        is_empty: true,
      });
      appliedFilters.push('hasImports: false');
    }

    // Custom filters
    if (f.custom) {
      for (const [key, value] of Object.entries(f.custom)) {
        if (typeof value === 'object' && value !== null) {
          // Handle complex custom filters
          filter.must!.push({
            key,
            ...value,
          });
        } else {
          // Handle simple value filters
          filter.must!.push({
            key,
            match: {
              value,
            },
          });
        }
        appliedFilters.push(`custom.${key}: ${JSON.stringify(value)}`);
      }
    }

    // Clean up empty filter arrays
    if (filter.must!.length === 0) {
      delete filter.must;
    }
    if (filter.must_not!.length === 0) {
      delete filter.must_not;
    }
    if (filter.should!.length === 0) {
      delete filter.should;
    }

    // Log filter building result
    logger.debug('QueryBuilderService: Built Qdrant filter', {
      appliedFilters: appliedFilters.length,
      filterKeys: Object.keys(filter),
      warnings: warnings.length,
    });

    return {
      filter,
      appliedFilters,
      warnings,
    };
  }

  /**
   * Build pattern-based filter for glob patterns
   */
  private buildPatternFilter(field: string, pattern: string): Record<string, any> {
    // Convert glob pattern to Qdrant pattern
    // This is a simplified version - in practice, you'd want more sophisticated pattern matching
    const qdrantPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\./g, '\\.')
      .replace(/\{([^}]+)\}/g, '($1)');

    return {
      key: field,
      match: {
        text: qdrantPattern,
      },
    };
  }

  /**
   * Validate and optimize filter
   */
  validateAndOptimizeFilter(filter: QdrantFilter): { filter: QdrantFilter; optimizations: string[] } {
    const optimizations: string[] = [];
    const optimizedFilter = { ...filter };

    // Check for redundant filters
    if (filter.must && filter.must_not) {
      const mustFields = new Set(filter.must.map(f => Object.keys(f)[0]));
      const mustNotFields = new Set(filter.must_not.map(f => Object.keys(f)[0]));

      for (const field of mustFields) {
        if (mustNotFields.has(field)) {
          optimizations.push(`Conflicting filters on field: ${field}`);
        }
      }
    }

    // Check for empty filter arrays
    if (optimizedFilter.must && optimizedFilter.must.length === 0) {
      delete optimizedFilter.must;
      optimizations.push('Removed empty must array');
    }

    if (optimizedFilter.must_not && optimizedFilter.must_not.length === 0) {
      delete optimizedFilter.must_not;
      optimizations.push('Removed empty must_not array');
    }

    if (optimizedFilter.should && optimizedFilter.should.length === 0) {
      delete optimizedFilter.should;
      optimizations.push('Removed empty should array');
    }

    // Check for overly broad patterns
    if (optimizedFilter.must) {
      for (const condition of optimizedFilter.must) {
        if (condition['key'] === 'file' && condition['match']?.text === '.*') {
          optimizations.push('Broad file pattern detected - consider narrowing search scope');
        }
      }
    }

    logger.debug('QueryBuilderService: Validated and optimized filter', {
      optimizations: optimizations.length,
    });

    return {
      filter: optimizedFilter,
      optimizations,
    };
  }

  /**
   * Build filter for file-specific queries
   */
  buildFileFilter(filePath: string, additionalFilters?: RetrievalFilter): FilterBuildResult {
    const baseFilter: RetrievalFilter = {
      files: [filePath],
      ...additionalFilters,
    };

    const query: RetrievalQuery = {
      filter: baseFilter,
    };

    return this.buildFilter(query);
  }

  /**
   * Build filter for language-specific queries
   */
  buildLanguageFilter(language: string, additionalFilters?: RetrievalFilter): FilterBuildResult {
    const baseFilter: RetrievalFilter = {
      languages: [language],
      ...additionalFilters,
    };

    const query: RetrievalQuery = {
      filter: baseFilter,
    };

    return this.buildFilter(query);
  }

  /**
   * Build filter for commit-specific queries
   */
  buildCommitFilter(commitHash: string, additionalFilters?: RetrievalFilter): FilterBuildResult {
    const baseFilter: RetrievalFilter = {
      commit: commitHash,
      ...additionalFilters,
    };

    const query: RetrievalQuery = {
      filter: baseFilter,
    };

    return this.buildFilter(query);
  }

  /**
   * Build filter for directory-based queries
   */
  buildDirectoryFilter(directoryPath: string, additionalFilters?: RetrievalFilter): FilterBuildResult {
    const baseFilter: RetrievalFilter = {
      filePatterns: [`${directoryPath}/**`],
      ...additionalFilters,
    };

    const query: RetrievalQuery = {
      filter: baseFilter,
    };

    return this.buildFilter(query);
  }

  /**
   * Estimate filter selectivity (rough estimate of result size)
   */
  estimateFilterSelectivity(filter: QdrantFilter): {
    selectivity: 'low' | 'medium' | 'high';
    estimatedResults: 'few' | 'moderate' | 'many';
    reasoning: string[];
  } {
    const reasoning: string[] = [];
    let selectivityScore = 0; // 0 = very selective, 100 = very broad

    // Analyze must conditions
    if (filter.must) {
      for (const condition of filter.must) {
        if (condition['key'] === 'file' && condition['match']) {
          if (condition['match'].any) {
            selectivityScore += condition['match'].any.length * 10;
            reasoning.push(`Specific files: ${condition['match'].any.length}`);
          } else if (condition['match'].value) {
            selectivityScore += 5;
            reasoning.push('Single file specified');
          }
        } else if (condition['key'] === 'language') {
          selectivityScore += 20;
          reasoning.push('Language filter applied');
        } else if (condition['key'] === 'commit') {
          selectivityScore += 15;
          reasoning.push('Commit filter applied');
        } else if (condition['key'] === 'createdAt' && condition['range']) {
          selectivityScore += 25;
          reasoning.push('Date range filter applied');
        }
      }
    }

    // Analyze must_not conditions
    if (filter.must_not) {
      selectivityScore += filter.must_not.length * 5;
      reasoning.push(`${filter.must_not.length} exclusion filters`);
    }

    // Determine selectivity level
    let selectivity: 'low' | 'medium' | 'high';
    let estimatedResults: 'few' | 'moderate' | 'many';

    if (selectivityScore <= 20) {
      selectivity = 'low';
      estimatedResults = 'few';
    } else if (selectivityScore <= 50) {
      selectivity = 'medium';
      estimatedResults = 'moderate';
    } else {
      selectivity = 'high';
      estimatedResults = 'many';
    }

    return {
      selectivity,
      estimatedResults,
      reasoning,
    };
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.queryBuilderInitialized;
  }
}
