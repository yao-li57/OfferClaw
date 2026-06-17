import OpenAI from 'openai';

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 100;

export class EmbeddingService {
  private client: OpenAI | null = null;
  private model: string;

  constructor() {
    this.model = process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;

    const openaiKey = process.env.OPENAI_API_KEY;
    const llmKey = process.env.LLM_API_KEY;
    const llmBase = process.env.LLM_BASE_URL;

    if (openaiKey) {
      this.client = new OpenAI({ apiKey: openaiKey });
    } else if (llmKey && llmBase) {
      this.client = new OpenAI({ apiKey: llmKey, baseURL: llmBase });
    }
  }

  get available(): boolean {
    return this.client !== null;
  }

  async embed(text: string): Promise<Float32Array | null> {
    if (!this.client) return null;
    try {
      const res = await this.client.embeddings.create({
        model: this.model,
        input: text.slice(0, 500),
      });
      return new Float32Array(res.data[0].embedding);
    } catch (err) {
      process.stderr.write(`[embedding] embed error: ${(err as Error).message}\n`);
      return null;
    }
  }

  async embedBatch(texts: string[]): Promise<(Float32Array | null)[]> {
    if (!this.client || texts.length === 0) return texts.map(() => null);

    const results: (Float32Array | null)[] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const chunk = texts.slice(i, i + BATCH_SIZE).map((t) => t.slice(0, 500));
      try {
        const res = await this.client.embeddings.create({
          model: this.model,
          input: chunk,
        });
        for (const item of res.data) {
          results.push(new Float32Array(item.embedding));
        }
      } catch (err) {
        process.stderr.write(`[embedding] batch error at offset ${i}: ${(err as Error).message}\n`);
        for (let j = 0; j < chunk.length; j++) results.push(null);
      }
    }

    return results;
  }

  static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  static serializeVector(v: Float32Array): Buffer {
    return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  }

  static deserializeVector(buf: Buffer): Float32Array {
    const copy = Buffer.allocUnsafe(buf.length);
    buf.copy(copy);
    return new Float32Array(copy.buffer, copy.byteOffset, copy.length / 4);
  }
}
