import { describe, it, expect } from 'vitest';
import { CommandParser } from '../../src/command/parser.js';
import { helpCommand, quitCommand, dimensionsCommand } from '../../src/command/handlers/builtin.js';

describe('CommandParser', () => {
  function createParser() {
    const parser = new CommandParser();
    parser.register(helpCommand);
    parser.register(quitCommand);
    parser.register(dimensionsCommand);
    return parser;
  }

  it('should detect commands by / prefix', () => {
    const parser = createParser();
    expect(parser.isCommand('/help')).toBe(true);
    expect(parser.isCommand('hello')).toBe(false);
  });

  it('should execute /help', async () => {
    const parser = createParser();
    const result = await parser.execute('/help', { sessionId: 's1', app: null });
    expect(result.shouldContinue).toBe(true);
    expect(result.output).toContain('/help');
  });

  it('should execute /quit', async () => {
    const parser = createParser();
    const result = await parser.execute('/quit', { sessionId: 's1', app: null });
    expect(result.shouldContinue).toBe(false);
  });

  it('should resolve aliases', async () => {
    const parser = createParser();
    const result = await parser.execute('/q', { sessionId: 's1', app: null });
    expect(result.shouldContinue).toBe(false);
  });

  it('should handle unknown commands', async () => {
    const parser = createParser();
    const result = await parser.execute('/unknown', { sessionId: 's1', app: null });
    expect(result.output).toContain('未知命令');
  });

  it('should execute /dimensions with alias', async () => {
    const parser = createParser();
    const result = await parser.execute('/dim', { sessionId: 's1', app: null });
    expect(result.output).toContain('架构设计');
  });
});
