-- 先删除列上的向量索引（如有），再修改列类型
DROP INDEX IF EXISTS legal_knowledge_embedding_idx;

-- 将 embedding 列从 vector(1536) 改为 vector(1024)
-- 由于维度变化，已有的 embedding 数据全部置 null，需重新向量化
ALTER TABLE legal_knowledge ALTER COLUMN embedding TYPE vector(1024);
UPDATE legal_knowledge SET embedding = NULL WHERE embedding IS NOT NULL;

-- 重建 HNSW 索引（使用新维度）
CREATE INDEX IF NOT EXISTS legal_knowledge_embedding_idx
  ON legal_knowledge USING hnsw (embedding vector_cosine_ops);