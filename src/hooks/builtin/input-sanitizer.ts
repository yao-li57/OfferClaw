import type { Hook } from '../types.js';

export const inputSanitizerHook: Hook = {
  name: 'input-sanitizer',
  stage: 'pre-tool',
  priority: 10,
  async execute(ctx) {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(ctx.input)) {
      if (typeof value === 'string') {
        sanitized[key] = value.trim().slice(0, 10000);
      } else {
        sanitized[key] = value;
      }
    }

    return { action: 'modify', modifiedInput: sanitized };
  },
};
