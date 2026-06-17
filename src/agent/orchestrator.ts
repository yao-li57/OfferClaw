import type { QueryEngine } from '../query-engine/engine.js';
import { ConcurrencyPool } from './pool.js';
import { SubAgent } from './sub-agent.js';
import type { DiagnosisDimension, DiagnosisTask, DimensionResult, OrchestratedDiagnosis } from './types.js';

const WEIGHTS: Record<DiagnosisDimension, number> = {
  content: 0.4,
  expression: 0.4,
  speech: 0.2,
};

export class DiagnosisOrchestrator {
  private subAgent: SubAgent;
  private pool: ConcurrencyPool;

  constructor(queryEngine: QueryEngine, pool: ConcurrencyPool, model?: string) {
    this.subAgent = new SubAgent(queryEngine, model);
    this.pool = pool;
  }

  async diagnose(task: DiagnosisTask): Promise<OrchestratedDiagnosis> {
    const wallStart = Date.now();

    const dimensions: DiagnosisDimension[] = ['content', 'expression'];
    if (task.audioTranscript) dimensions.push('speech');

    // Run all dimensions in parallel; SubAgent never throws
    const results = await Promise.all(
      dimensions.map((dim) => this.pool.run(() => this.subAgent.run(dim, task))),
    );

    return this.mergeResults(task, results, Date.now() - wallStart);
  }

  private mergeResults(
    task: DiagnosisTask,
    results: DimensionResult[],
    walltime: number,
  ): OrchestratedDiagnosis {
    const completed = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    // Weighted average across completed dimensions, normalised
    let totalWeight = 0;
    let weightedScore = 0;
    for (const r of completed) {
      const w = WEIGHTS[r.dimension] ?? 0.33;
      weightedScore += r.score * w;
      totalWeight += w;
    }
    const overallScore =
      totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 10) / 10 : 0;

    // Merge suggestions with deduplication
    const seen = new Set<string>();
    const topSuggestions: string[] = [];
    for (const r of completed) {
      for (const s of r.suggestions) {
        if (!seen.has(s)) {
          seen.add(s);
          topSuggestions.push(s);
        }
      }
    }

    const sumDurations = results.reduce((s, r) => s + r.duration, 0);
    const parallelSpeedup = walltime > 0 ? Math.round((sumDurations / walltime) * 10) / 10 : 1;

    const dimMap: Partial<Record<DiagnosisDimension, DimensionResult>> = {};
    for (const r of results) dimMap[r.dimension] = r;

    return {
      question: task.question,
      overallScore,
      maxScore: 10,
      dimensions: dimMap,
      topSuggestions: topSuggestions.slice(0, 5),
      completedDimensions: completed.map((r) => r.dimension),
      failedDimensions: failed.map((r) => r.dimension),
      totalWalltime: walltime,
      totalTokens: results.reduce((s, r) => s + r.tokenUsage.input + r.tokenUsage.output, 0),
      parallelSpeedup,
    };
  }
}
