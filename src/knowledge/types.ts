export interface KnowledgeEntry {
  id: string;
  title: string;
  dimension: string;
  content: string;
  sourceFile?: string;
  question?: string;
  expertAnswer?: string;
  noviceAnswer?: string;
  tags?: string[];
}

export interface SearchResult {
  entry: KnowledgeEntry;
  score: number;
  matchType: 'fts' | 'embedding' | 'hybrid';
}

export interface SearchOptions {
  query: string;
  dimension?: string;
  limit?: number;
  minScore?: number;
  method?: 'fts' | 'embedding' | 'hybrid';
}
