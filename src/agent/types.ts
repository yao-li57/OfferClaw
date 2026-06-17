export type DiagnosisDimension = 'content' | 'expression' | 'speech';

export interface DiagnosisTask {
  question: string;
  answer: string;
  audioTranscript?: string;
  sessionId: string;
  interviewDimension?: string;
}

export interface DimensionResult {
  dimension: DiagnosisDimension;
  score: number;
  maxScore: 10;
  strengths: string[];
  gaps: string[];
  suggestions: string[];
  success: boolean;
  error?: string;
  duration: number;
  tokenUsage: { input: number; output: number };
}

export interface OrchestratedDiagnosis {
  question: string;
  overallScore: number;
  maxScore: 10;
  dimensions: Partial<Record<DiagnosisDimension, DimensionResult>>;
  topSuggestions: string[];
  completedDimensions: DiagnosisDimension[];
  failedDimensions: DiagnosisDimension[];
  totalWalltime: number;
  totalTokens: number;
  parallelSpeedup: number;
}
