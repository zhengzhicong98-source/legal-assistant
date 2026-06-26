-- 修复 match_legal_docs 函数的向量维度：1536 → 1024
-- 根因：00003 迁移将 embedding 列从 vector(1536) 改为 vector(1024)，
--       但 RPC 函数的参数声明未同步更新，导致维度不匹配错误被静默吞掉

CREATE OR REPLACE FUNCTION match_legal_docs(
  query_embedding vector(1024),    -- 修复：1536 → 1024
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
