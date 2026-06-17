export { SkillRegistry } from './registry.js';
export type { Skill, SkillContext, SkillEvent, SkillInput } from './types.js';
export { fullDiagnosis } from './builtin/full-diagnosis.js';
export { jdFullAnalysis } from './builtin/jd-full-analysis.js';
export { quickMock } from './builtin/quick-mock.js';

import { SkillRegistry } from './registry.js';
import { fullDiagnosis } from './builtin/full-diagnosis.js';
import { jdFullAnalysis } from './builtin/jd-full-analysis.js';
import { quickMock } from './builtin/quick-mock.js';

export function createSkillRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  registry.register(fullDiagnosis);
  registry.register(jdFullAnalysis);
  registry.register(quickMock);
  return registry;
}
