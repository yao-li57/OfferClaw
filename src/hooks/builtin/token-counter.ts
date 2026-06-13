import type { Hook } from '../types.js';

export const tokenCounterHook: Hook = {
  name: 'token-counter',
  stage: 'post-tool',
  priority: 100,
  async execute(ctx) {
    const outputLength = ctx.result?.output?.length ?? 0;
    const estimatedTokens = Math.ceil(outputLength / 3.5);

    return {
      action: 'modify',
      modifiedResult: {
        ...ctx.result!,
        metadata: {
          ...ctx.result!.metadata,
          estimatedOutputTokens: estimatedTokens,
        },
      },
    };
  },
};
