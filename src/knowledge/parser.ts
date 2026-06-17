import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import type { KnowledgeEntry } from './types.js';

interface ParsedQuestion {
  question: string;
  noviceAnswer?: string;
  expertAnswer?: string;
  tags?: string[];
}

function stableId(sourceFile: string, key: string): string {
  return createHash('sha256').update(sourceFile + '\x00' + key).digest('hex').slice(0, 36);
}

export function parseKnowledgeDir(dirPath: string): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  const files = walkMarkdownFiles(dirPath);

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const relPath = relative(dirPath, file);
    const dimension = detectDimension(relPath);
    const questions = extractQuestions(content);

    if (questions.length > 0) {
      for (const q of questions) {
        entries.push({
          id: stableId(relPath, q.question),
          title: q.question.slice(0, 100),
          dimension,
          content: buildContent(q),
          sourceFile: relPath,
          question: q.question,
          expertAnswer: q.expertAnswer,
          noviceAnswer: q.noviceAnswer,
          tags: q.tags,
        });
      }
    } else {
      entries.push({
        id: stableId(relPath, relPath),
        title: extractTitle(content) ?? relPath,
        dimension,
        content,
        sourceFile: relPath,
      });
    }
  }

  return entries;
}

function walkMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  const items = readdirSync(dir);

  for (const item of items) {
    const full = join(dir, item);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkMarkdownFiles(full));
    } else if (item.endsWith('.md')) {
      results.push(full);
    }
  }

  return results;
}

function detectDimension(path: string): string {
  const dimensionMap: Record<string, string> = {
    '01-architecture': 'architecture',
    '01-arch': 'architecture',
    '02-tool': 'engineering',
    '02-eng': 'engineering',
    '03-fault': 'engineering',
    '03-model': 'model',
    '04-memory': 'memory',
    '04-rag': 'rag',
    '05-eval': 'evaluation',
    '05-multi': 'multi-agent',
    '06-multi': 'multi-agent',
    '06-eval': 'evaluation',
    '07-eng': 'engineering',
    '07-full': 'full-stack',
    '08-prompt': 'model',
    '09-rag': 'rag',
    '10-train': 'model',
    '11-ai': 'engineering',
    '12-busi': 'engineering',
    '13-proj': 'general',
    '14-comp': 'general',
    '15-agent': 'architecture',
  };

  for (const [prefix, dim] of Object.entries(dimensionMap)) {
    if (path.includes(prefix)) return dim;
  }
  return 'general';
}

function extractQuestions(content: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  const qBlocks = content.split(/^## Q[：:]/m).slice(1);

  for (const block of qBlocks) {
    const lines = block.trim();
    const questionMatch = lines.match(/^(.+?)(?:\n|$)/);
    if (!questionMatch) continue;

    const question = questionMatch[1].trim();
    const noviceMatch = lines.match(/\*\*新手答\*\*[：:]?\s*"?(.+?)"?\s*(?:\n|$)/);
    const expertMatch = lines.match(/\*\*高手答\*\*[：:]?\s*\n([\s\S]+?)(?=\n\*\*|$)/);

    questions.push({
      question,
      noviceAnswer: noviceMatch?.[1]?.trim(),
      expertAnswer: expertMatch?.[1]?.trim(),
    });
  }

  return questions;
}

function extractTitle(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function buildContent(q: ParsedQuestion): string {
  let text = `问题：${q.question}\n`;
  if (q.noviceAnswer) text += `\n新手答：${q.noviceAnswer}\n`;
  if (q.expertAnswer) text += `\n高手答：${q.expertAnswer}\n`;
  return text;
}
