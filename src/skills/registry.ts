import type { Skill, SkillContext, SkillEvent, SkillInput } from './types.js';

export class SkillRegistry {
  private skills = new Map<string, Skill>();

  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  has(id: string): boolean {
    return this.skills.has(id);
  }

  async *run(id: string, input: SkillInput, ctx: SkillContext): AsyncGenerator<SkillEvent> {
    const skill = this.skills.get(id);
    if (!skill) {
      yield { type: 'step_failed', step: id, error: `Skill "${id}" not found` };
      return;
    }
    yield* skill.run(input, ctx);
  }

  /** Convenience: drain the generator and return the final result. */
  async collect(
    id: string,
    input: SkillInput,
    ctx: SkillContext,
  ): Promise<{ events: SkillEvent[]; result: unknown }> {
    const events: SkillEvent[] = [];
    let result: unknown = null;
    for await (const event of this.run(id, input, ctx)) {
      events.push(event);
      if (event.type === 'result') result = event.data;
    }
    return { events, result };
  }
}
