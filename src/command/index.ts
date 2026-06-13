export { CommandParser } from './parser.js';
export type { CommandHandler, CommandResult, CommandContext } from './types.js';
export {
  helpCommand,
  statusCommand,
  dimensionsCommand,
  quitCommand,
  resetCommand,
} from './handlers/builtin.js';
