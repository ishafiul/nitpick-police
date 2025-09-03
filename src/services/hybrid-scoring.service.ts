import {
  ScoringFactors,
  ScoringWeights,
  HybridScore,
  RetrievedChunk,
  RetrievalQuery,
} from '../types/retrieval';

import logger from '../utils/logger';

export interface ScoringConfig {
  weights: ScoringWeights;
  recencyDecayFactor: number; 
  maxFileImportanceScore: number; 
  complexityBonus: number; 
  languagePreferences: Record<string, number>; 
  fileTypePreferences: Record<string, number>; 
}

export class HybridScoringService {
  private config: ScoringConfig;
  private scoringInitialized: boolean = false;

  constructor(config?: Partial<ScoringConfig>) {
    this.config = {
      weights: {
        semanticWeight: 0.7,
        recencyWeight: 0.2,
        fileImportanceWeight: 0.1,
        codeQualityWeight: 0.0,
        relevanceWeight: 0.0,
        customWeights: {},
      },
      recencyDecayFactor: 0.9,
      maxFileImportanceScore: 1.0,
      complexityBonus: 0.1,
      languagePreferences: {
        typescript: 1.0,
        javascript: 0.9,
        python: 0.95,
        java: 0.9,
        go: 0.95,
        rust: 0.95,
        dart: 0.85,
        cpp: 0.8,
        c: 0.7,
        other: 0.5,
      },
      fileTypePreferences: {
        'component': 1.0,
        'service': 0.95,
        'util': 0.9,
        'model': 0.9,
        'config': 0.7,
        'test': 0.6,
        'other': 0.5,
      },
      ...config,
    };

  }

  calculateHybridScore(
    chunk: RetrievedChunk,
    semanticScore: number,
    query: RetrievalQuery
  ): HybridScore {
    const factors = this.calculateScoringFactors(chunk, semanticScore, query);
    const weights = this.getEffectiveWeights(query);

    let totalScore = 0;
    const breakdown: Record<string, number> = {};

    const semanticContribution = factors.semanticSimilarity * weights.semanticWeight;
    totalScore += semanticContribution;
    breakdown['semantic'] = semanticContribution;

    const recencyContribution = factors.recency * weights.recencyWeight;
    totalScore += recencyContribution;
    breakdown['recency'] = recencyContribution;

    const fileImportanceContribution = factors.fileImportance * weights.fileImportanceWeight;
    totalScore += fileImportanceContribution;
    breakdown['fileImportance'] = fileImportanceContribution;

    const codeQualityContribution = factors.codeQuality * weights.codeQualityWeight;
    totalScore += codeQualityContribution;
    breakdown['codeQuality'] = codeQualityContribution;

    const relevanceContribution = factors.relevance * weights.relevanceWeight;
    totalScore += relevanceContribution;
    breakdown['relevance'] = relevanceContribution;

    for (const [factorName, factorValue] of Object.entries(factors.custom)) {
      const weight = weights.customWeights[factorName] || 0;
      const contribution = factorValue * weight;
      totalScore += contribution;
      breakdown[factorName] = contribution;
    }

    const normalizedScore = Math.max(0, Math.min(1, totalScore));

    return {
      totalScore: normalizedScore,
      factors,
      weights,
      breakdown,
    };
  }

  private calculateScoringFactors(
    chunk: RetrievedChunk,
    semanticScore: number,
    query: RetrievalQuery
  ): ScoringFactors {
    const factors: ScoringFactors = {
      semanticSimilarity: semanticScore,
      recency: this.calculateRecencyScore(chunk.metadata.createdAt),
      fileImportance: this.calculateFileImportanceScore(chunk.metadata.file),
      codeQuality: this.calculateCodeQualityScore(chunk),
      relevance: this.calculateRelevanceScore(chunk, query),
      custom: {},
    };

    if (query.text) {
      factors.custom['queryTermMatch'] = this.calculateQueryTermMatch(chunk, query.text);
    }

    if (query.filter?.languages) {
      factors.custom['languageMatch'] = this.calculateLanguageMatch(chunk, query.filter.languages);
    }

    if (query.filter?.files) {
      factors.custom['fileMatch'] = this.calculateFileMatch(chunk, query.filter.files);
    }

    return factors;
  }

  private calculateRecencyScore(createdAt: string): number {
    try {
      const createdDate = new Date(createdAt);
      const now = new Date();
      const daysSinceCreation = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

      const recencyScore = Math.pow(this.config.recencyDecayFactor, daysSinceCreation / 30); 

      return Math.max(0, Math.min(1, recencyScore));
    } catch (error) {
      logger.warn('HybridScoringService: Failed to calculate recency score', {
        createdAt,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0.5; 
    }
  }

  private calculateFileImportanceScore(filePath: string): number {
    const fileName = filePath.split('/').pop()?.toLowerCase() || '';
    const directory = filePath.split('/').slice(-2, -1)[0]?.toLowerCase() || '';

    let importanceScore = 0.5; 

    if (fileName.includes('component') || fileName.includes('comp')) {
      importanceScore = Math.max(importanceScore, this.config.fileTypePreferences['component'] || 1.0);
    } else if (fileName.includes('service') || fileName.includes('svc')) {
      importanceScore = Math.max(importanceScore, this.config.fileTypePreferences['service'] || 0.95);
    } else if (fileName.includes('util') || fileName.includes('helper') || fileName.includes('lib')) {
      importanceScore = Math.max(importanceScore, this.config.fileTypePreferences['util'] || 0.9);
    } else if (fileName.includes('model') || fileName.includes('entity') || fileName.includes('dto')) {
      importanceScore = Math.max(importanceScore, this.config.fileTypePreferences['model'] || 0.9);
    } else if (fileName.includes('config') || fileName.includes('conf')) {
      importanceScore = Math.max(importanceScore, this.config.fileTypePreferences['config'] || 0.7);
    } else if (fileName.includes('test') || fileName.includes('spec')) {
      importanceScore = Math.max(importanceScore, this.config.fileTypePreferences['test'] || 0.6);
    }

    if (directory.includes('component') || directory.includes('ui') || directory.includes('view')) {
      importanceScore = Math.max(importanceScore, 0.9);
    } else if (directory.includes('service') || directory.includes('business')) {
      importanceScore = Math.max(importanceScore, 0.85);
    } else if (directory.includes('util') || directory.includes('common')) {
      importanceScore = Math.max(importanceScore, 0.8);
    } else if (directory.includes('model') || directory.includes('entity')) {
      importanceScore = Math.max(importanceScore, 0.8);
    } else if (directory.includes('config')) {
      importanceScore = Math.max(importanceScore, 0.6);
    }

    if (fileName === 'index.ts' || fileName === 'main.ts' || fileName === 'app.ts') {
      importanceScore = Math.max(importanceScore, 0.95);
    }

    return Math.max(0, Math.min(1, importanceScore));
  }

  private calculateCodeQualityScore(chunk: RetrievedChunk): number {
    let qualityScore = 0.5; 

    const metadata = chunk.metadata;

    if (metadata.complexityScore !== undefined) {
      if (metadata.complexityScore > 0 && metadata.complexityScore < 10) {
        
        qualityScore += this.config.complexityBonus * 0.5;
      } else if (metadata.complexityScore >= 10 && metadata.complexityScore < 20) {
        
        qualityScore += this.config.complexityBonus * 0.2;
      }
      
    }

    if (metadata.dependencies && metadata.dependencies.length > 0) {
      qualityScore += 0.1;
    }

    if (metadata.imports && metadata.imports.length > 0) {
      qualityScore += 0.1;
    }

    switch (metadata.chunkType) {
      case 'function':
        qualityScore += 0.1; 
        break;
      case 'class':
        qualityScore += 0.15; 
        break;
      case 'method':
        qualityScore += 0.05; 
        break;
      case 'module':
        qualityScore += 0.1; 
        break;
      case 'statement':
        qualityScore += 0.02; 
        break;
    }

    return Math.max(0, Math.min(1, qualityScore));
  }

  private calculateRelevanceScore(chunk: RetrievedChunk, query: RetrievalQuery): number {
    if (!query.text) {
      return 0.5; 
    }

    const queryTerms = query.text.toLowerCase().split(/\s+/);
    const content = chunk.content.toLowerCase();
    const metadata = chunk.metadata;

    let relevanceScore = 0;
    let totalTerms = queryTerms.length;
    let matchedTerms = 0;

    for (const term of queryTerms) {
      if (content.includes(term)) {
        matchedTerms++;
      }
    }

    if (matchedTerms === totalTerms) {
      relevanceScore = 0.9;
    } else if (matchedTerms > 0) {
      relevanceScore = (matchedTerms / totalTerms) * 0.7;
    }

    const fileName = metadata.file.toLowerCase();
    for (const term of queryTerms) {
      if (fileName.includes(term)) {
        relevanceScore += 0.1;
        break; 
      }
    }

    if (metadata.chunkType === 'function' || metadata.chunkType === 'class' || metadata.chunkType === 'method') {

      relevanceScore += 0.05;
    }

    return Math.max(0, Math.min(1, relevanceScore));
  }

  private calculateQueryTermMatch(chunk: RetrievedChunk, queryText: string): number {
    const queryTerms = queryText.toLowerCase().split(/\s+/);
    const content = chunk.content.toLowerCase();

    let matchedTerms = 0;
    for (const term of queryTerms) {
      if (content.includes(term)) {
        matchedTerms++;
      }
    }

    return matchedTerms / queryTerms.length;
  }

  private calculateLanguageMatch(chunk: RetrievedChunk, preferredLanguages: string[]): number {
    const chunkLanguage = chunk.metadata.language.toLowerCase();

    for (const preferred of preferredLanguages) {
      if (chunkLanguage.includes(preferred.toLowerCase())) {
        return 1.0;
      }
    }

    return 0.0;
  }

  private calculateFileMatch(chunk: RetrievedChunk, preferredFiles: string[]): number {
    const chunkFile = chunk.metadata.file;

    for (const preferred of preferredFiles) {
      if (chunkFile.includes(preferred)) {
        return 1.0;
      }
    }

    return 0.0;
  }

  private getEffectiveWeights(query: RetrievalQuery): ScoringWeights {
    const baseWeights = { ...this.config.weights };

    if (query.scoring) {
      return {
        ...baseWeights,
        ...query.scoring,
        customWeights: {
          ...baseWeights.customWeights,
          ...query.scoring.customWeights,
        },
      };
    }

    return baseWeights;
  }

  rankChunks(
    chunks: RetrievedChunk[],
    semanticScores: number[],
    query: RetrievalQuery
  ): RetrievedChunk[] {
    if (chunks.length !== semanticScores.length) {
      throw new Error('Chunks and semantic scores arrays must have the same length');
    }

    const scoredChunks = chunks.map((chunk, index) => {
      const semanticScore = semanticScores[index];
      const hybridScore = this.calculateHybridScore(chunk, semanticScore || 0, query);

      return {
        ...chunk,
        score: hybridScore.totalScore,
        semanticScore: semanticScore || 0,
        hybridScore: hybridScore.totalScore,
      };
    });

    scoredChunks.sort((a, b) => b.score - a.score);

    logger.debug('HybridScoringService: Ranked chunks', {
      totalChunks: chunks.length,
      topScore: scoredChunks[0]?.score || 0,
      averageScore: scoredChunks.reduce((sum, chunk) => sum + chunk.score, 0) / scoredChunks.length,
    });

    return scoredChunks;
  }

  updateConfig(newConfig: Partial<ScoringConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
      weights: {
        ...this.config.weights,
        ...newConfig.weights,
      },
      languagePreferences: {
        ...this.config.languagePreferences,
        ...newConfig.languagePreferences,
      },
      fileTypePreferences: {
        ...this.config.fileTypePreferences,
        ...newConfig.fileTypePreferences,
      },
    };

    logger.info('HybridScoringService: Configuration updated');
  }

  getConfig(): ScoringConfig {
    return { ...this.config };
  }

  isInitialized(): boolean {
    return this.scoringInitialized;
  }

  explainScoring(
    chunk: RetrievedChunk,
    semanticScore: number,
    query: RetrievalQuery
  ): {
    score: HybridScore;
    explanation: string[];
  } {
    const score = this.calculateHybridScore(chunk, semanticScore, query);
    const explanation: string[] = [];

    explanation.push(`Total Score: ${score.totalScore.toFixed(3)}`);
    explanation.push(`Semantic Similarity: ${score.factors.semanticSimilarity.toFixed(3)} (weight: ${score.weights.semanticWeight})`);
    explanation.push(`Recency: ${score.factors.recency.toFixed(3)} (weight: ${score.weights.recencyWeight})`);
    explanation.push(`File Importance: ${score.factors.fileImportance.toFixed(3)} (weight: ${score.weights.fileImportanceWeight})`);
    explanation.push(`Code Quality: ${score.factors.codeQuality.toFixed(3)} (weight: ${score.weights.codeQualityWeight})`);
    explanation.push(`Relevance: ${score.factors.relevance.toFixed(3)} (weight: ${score.weights.relevanceWeight})`);

    for (const [factorName, factorValue] of Object.entries(score.factors.custom)) {
      const weight = score.weights.customWeights[factorName] || 0;
      explanation.push(`${factorName}: ${factorValue.toFixed(3)} (weight: ${weight})`);
    }

    return {
      score,
      explanation,
    };
  }
}
