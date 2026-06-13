import type { CommandHandler } from '../types.js';

export const helpCommand: CommandHandler = {
  name: 'help',
  aliases: ['h', '?'],
  description: '显示帮助信息',
  async execute() {
    return {
      output: `可用命令：
  /help       显示帮助
  /status     查看当前会话状态
  /dimensions 列出所有考察维度
  /score      查看当前得分
  /report     生成会话报告
  /reset      重新开始会话
  /model      切换模型
  /quit       退出`,
      shouldContinue: true,
    };
  },
};

export const statusCommand: CommandHandler = {
  name: 'status',
  aliases: ['s'],
  description: '查看当前会话状态',
  async execute(_args, ctx) {
    return {
      output: `会话 ID: ${ctx.sessionId}`,
      shouldContinue: true,
      metadata: { command: 'status' },
    };
  },
};

export const dimensionsCommand: CommandHandler = {
  name: 'dimensions',
  aliases: ['dim', 'd'],
  description: '列出所有考察维度',
  async execute() {
    const dims = [
      '1. 架构设计 (architecture)',
      '2. Harness 工程 (engineering)',
      '3. 模型能力 (model)',
      '4. RAG 知识增强 (rag)',
      '5. 多 Agent (multi-agent)',
      '6. 评测 (evaluation)',
      '7. 全栈工程 (full-stack)',
    ];
    return { output: `考察维度：\n${dims.join('\n')}`, shouldContinue: true };
  },
};

export const quitCommand: CommandHandler = {
  name: 'quit',
  aliases: ['exit', 'q'],
  description: '退出会话',
  async execute() {
    return { output: '会话结束', shouldContinue: false };
  },
};

export const resetCommand: CommandHandler = {
  name: 'reset',
  aliases: ['restart'],
  description: '重新开始会话',
  async execute() {
    return {
      output: '会话已重置',
      shouldContinue: true,
      metadata: { action: 'reset' },
    };
  },
};
