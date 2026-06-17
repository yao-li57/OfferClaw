import type Database from 'better-sqlite3';
import type { KnowledgeEntry, SearchOptions, SearchResult } from './types.js';
import { EmbeddingService } from './embedding.js';

const RRF_K = 60;

export class KnowledgeSearch {
  private db: Database.Database;
  private embedService: EmbeddingService | undefined;

  constructor(db: Database.Database, embedService?: EmbeddingService) {
    this.db = db;
    this.embedService = embedService;
  }

  async search(opts: SearchOptions): Promise<SearchResult[]> {
    const { query, dimension, limit = 5, method = 'hybrid' } = opts;

    if (method === 'fts') return this.ftsSearch(query, dimension, limit);
    if (method === 'embedding') return this.embeddingSearch(query, dimension, limit);

    const [ftsResults, embResults] = await Promise.all([
      this.ftsSearch(query, dimension, limit),
      this.embeddingSearch(query, dimension, limit),
    ]);

    if (embResults.length === 0) return ftsResults;

    return this.mergeWithRRF(ftsResults, embResults, limit);
  }

  private ftsSearch(query: string, dimension: string | undefined, limit: number): SearchResult[] {
    const ftsQuery = query
      .replace(/[^\w一-鿿\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"`)
      .join(' OR ');

    if (!ftsQuery) return [];

    let sql = `
      SELECT k.*, rank
      FROM knowledge_fts f
      JOIN knowledge k ON k.rowid = f.rowid
      WHERE knowledge_fts MATCH ?
    `;
    const params: unknown[] = [ftsQuery];

    if (dimension) {
      sql += ` AND k.dimension = ?`;
      params.push(dimension);
    }

    sql += ` ORDER BY rank LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as (Record<string, unknown> & { rank: number })[];

    return rows.map((row) => ({
      entry: this.rowToEntry(row),
      score: Math.abs(row.rank),
      matchType: 'fts' as const,
    }));
  }

  private async embeddingSearch(
    query: string,
    dimension: string | undefined,
    limit: number,
  ): Promise<SearchResult[]> {
    if (!this.embedService?.available) return [];

    const queryVec = await this.embedService.embed(query);
    if (!queryVec) return [];

    let sql = `
      SELECT k.*, e.vector
      FROM knowledge k
      JOIN embeddings e ON e.knowledge_id = k.id
    `;
    const params: unknown[] = [];

    if (dimension) {
      sql += ` WHERE k.dimension = ?`;
      params.push(dimension);
    }

    const rows = this.db.prepare(sql).all(...params) as (Record<string, unknown> & {
      vector: Buffer;
    })[];

    const scored = rows
      .map((row) => ({
        entry: this.rowToEntry(row),
        score: EmbeddingService.cosineSimilarity(
          queryVec,
          EmbeddingService.deserializeVector(row.vector),
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((r) => ({ ...r, matchType: 'embedding' as const }));
  }

  private mergeWithRRF(fts: SearchResult[], emb: SearchResult[], limit: number): SearchResult[] {
    const scores = new Map<string, { result: SearchResult; score: number }>();

    const addRanks = (results: SearchResult[]) => {
      results.forEach((r, rank) => {
        const rrfScore = 1 / (RRF_K + rank + 1);
        const existing = scores.get(r.entry.id);
        if (existing) {
          existing.score += rrfScore;
        } else {
          scores.set(r.entry.id, { result: r, score: rrfScore });
        }
      });
    };

    addRanks(fts);
    addRanks(emb);

    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ result, score }) => ({ ...result, score, matchType: 'hybrid' as const }));
  }

  async generateEmbeddings(embedService: EmbeddingService): Promise<number> {
    const rows = this.db
      .prepare(
        `SELECT k.id, k.content, k.question
         FROM knowledge k
         LEFT JOIN embeddings e ON e.knowledge_id = k.id
         WHERE e.knowledge_id IS NULL`,
      )
      .all() as { id: string; content: string; question: string }[];

    if (rows.length === 0) return 0;

    const texts = rows.map((r) =>
      // Only embed the question for compact representation; stella has 512-token limit
      (r.question || r.title || '').slice(0, 500),
    );

    const vectors = await embedService.embedBatch(texts);

    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO embeddings (knowledge_id, vector, model) VALUES (?, ?, ?)`,
    );

    const tx = this.db.transaction(() => {
      let count = 0;
      for (let i = 0; i < rows.length; i++) {
        const vec = vectors[i];
        if (vec) {
          insert.run(rows[i].id, EmbeddingService.serializeVector(vec), 'text-embedding-3-small');
          count++;
        }
      }
      return count;
    });

    return tx() as number;
  }

  insert(entry: KnowledgeEntry): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO knowledge (id, title, dimension, content, source_file, question, expert_answer, novice_answer, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.title,
        entry.dimension,
        entry.content,
        entry.sourceFile ?? null,
        entry.question ?? null,
        entry.expertAnswer ?? null,
        entry.noviceAnswer ?? null,
        entry.tags?.join(',') ?? null,
      );
  }

  bulkInsert(entries: KnowledgeEntry[]): void {
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO knowledge (id, title, dimension, content, source_file, question, expert_answer, novice_answer, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const tx = this.db.transaction((items: KnowledgeEntry[]) => {
      for (const entry of items) {
        insert.run(
          entry.id,
          entry.title,
          entry.dimension,
          entry.content,
          entry.sourceFile ?? null,
          entry.question ?? null,
          entry.expertAnswer ?? null,
          entry.noviceAnswer ?? null,
          entry.tags?.join(',') ?? null,
        );
      }
    });

    tx(entries);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM knowledge').get() as { cnt: number };
    return row.cnt;
  }

  private rowToEntry(row: Record<string, unknown>): KnowledgeEntry {
    return {
      id: row.id as string,
      title: row.title as string,
      dimension: row.dimension as string,
      content: row.content as string,
      sourceFile: row.source_file as string | undefined,
      question: row.question as string | undefined,
      expertAnswer: row.expert_answer as string | undefined,
      noviceAnswer: row.novice_answer as string | undefined,
      tags: (row.tags as string)?.split(',').filter(Boolean),
    };
  }
}
