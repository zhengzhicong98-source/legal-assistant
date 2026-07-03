-- 向量维度从 1024 升级到 2048，提升 RAG 检索区分度
-- 背景：1630 条法律条文在 1024 维下噪声过多，query→正确条文直接 sim=0.75
--       但检索返回 0 条命中（Top-20 里全是高 sim 的噪声条文）
-- 目标：2048 维提供更强的法律语义区分度

-- 1. 修改表结构
ALTER TABLE legal_knowledge ALTER COLUMN embedding TYPE vector(2000);

-- 2. 删除旧索引（IVFFlat 不支持 ALTER，需重建）
DROP INDEX IF EXISTS legal_knowledge_embedding_idx;

-- 3. 重建索引（list 数随数据量调整）
CREATE INDEX IF NOT EXISTS legal_knowledge_embedding_idx
  ON legal_knowledge USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 80);

-- 4. 更新 RPC 函数
CREATE OR REPLACE FUNCTION match_legal_docs(
  query_embedding vector(2000),
  match_count int DEFAULT 3,
  min_similarity float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  title text,
  source text,
  category text,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lk.id,
    lk.title,
    lk.source,
    lk.category,
    lk.content,
    1 - (lk.embedding <=> query_embedding) AS similarity
  FROM legal_knowledge lk
  WHERE lk.embedding IS NOT NULL
    AND 1 - (lk.embedding <=> query_embedding) >= min_similarity
  ORDER BY lk.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 5. 清空旧 embedding（1024 维），等待重新向量化
UPDATE legal_knowledge SET embedding = NULL;

-- 6. 重建完成后运行 ANALYZE
ANALYZE legal_knowledge;
