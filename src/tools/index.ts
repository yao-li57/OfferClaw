export { ToolRegistry } from './registry.js';
export type { ToolDefinition, ToolContext, ToolResult, RiskLevel } from './types.js';

import { ToolRegistry } from './registry.js';
import { searchKnowledge } from './builtin/search-knowledge.js';
import { diagnoseAnswer } from './builtin/diagnose-answer.js';
import { generateFollowup } from './builtin/generate-followup.js';
import { scoreRubric } from './builtin/score-rubric.js';
import { compareAnswers } from './builtin/compare-answers.js';
import { listDimensions } from './builtin/list-dimensions.js';
import { sessionReport } from './builtin/session-report.js';
import { suggestStudyPath } from './builtin/suggest-study-path.js';

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(searchKnowledge);
  registry.register(diagnoseAnswer);
  registry.register(generateFollowup);
  registry.register(scoreRubric);
  registry.register(compareAnswers);
  registry.register(listDimensions);
  registry.register(sessionReport);
  registry.register(suggestStudyPath);
  return registry;
}
