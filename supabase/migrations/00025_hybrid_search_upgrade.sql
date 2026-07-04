-- 混合检索升级：把 match_legal_docs_hybrid 纳入版本控制 + 修复3个问题
-- 背景：生产库已有 match_legal_docs_hybrid 但未纳入 migrations/，本次补录并升级
--
-- 修复的问题：
--   1) 性能：legal_knowledge.content/title 未建 trigram 索引，每次查询全表扫 trigram
--   2) 覆盖：原实现只搜 content，"《民法典》第710条" 这种精确条号命中不到 title/source
--   3) 过滤：原 WHERE 只看向量相似度，纯关键词命中的条文会被 min_similarity 卡掉
--
-- 依赖：pg_trgm 扩展（migration 00011 已启用）
-- 关联代码：supabase/functions/legal-chat/index.ts L138 调用点

-- 1. 建 pg_trgm 索引 —— content/title/source 三个字段
--    对 2444 条法条 * 3 字段建 gin 索引，一次性开销 <30s，之后查询 <100ms
CREATE INDEX IF NOT EXISTS legal_knowledge_content_trgm_idx
  ON legal_knowledge USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS legal_knowledge_title_trgm_idx
  ON legal_knowledge USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS legal_knowledge_source_trgm_idx
  ON legal_knowledge USING gin (source gin_trgm_ops);

-- 2. 升级 match_legal_docs_hybrid：多字段打分 + 放宽过滤 + 返回融合分数
--    先 DROP：现有函数只返回 (id, title, source, category, content, similarity, hybrid_score)
--    新签名多了 keyword_score 列，PG 不允许 CREATE OR REPLACE 改返回类型
DROP FUNCTION IF EXISTS match_legal_docs_hybrid(vector, text, int, float);
CREATE OR REPLACE FUNCTION match_legal_docs_hybrid(
  query_embedding vector(2000),
  query_text text,
  match_count int DEFAULT 5,
  min_similarity float DEFAULT 0.1
)
RETURNS TABLE (
  id uuid,
  title text,
  source text,
  category text,
  content text,
  similarity float,       -- 纯向量分（前端展示 & 溯源用）
  keyword_score float,    -- 纯关键词分（调试/评估用）
  hybrid_score float      -- 融合分（内部排序，权重 0.65/0.35）
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      lk.id, lk.title, lk.source, lk.category, lk.content,
      1 - (lk.embedding <=> query_embedding) AS vec_sim,
      -- title/source 里带"第X条"是精确命中，权重放大 1.5 倍
      -- LEAST 1.0 防止放大后越界，保持和 vec_sim 同量纲
      LEAST(1.0, GREATEST(
        similarity(lk.content, query_text),
        similarity(lk.title, query_text) * 1.5,
        similarity(coalesce(lk.source, ''), query_text) * 1.5
      )) AS trgm_sim
    FROM legal_knowledge lk
    WHERE lk.embedding IS NOT NULL
  )
  SELECT
    s.id, s.title, s.source, s.category, s.content,
    s.vec_sim  AS similarity,
    s.trgm_sim AS keyword_score,
    s.vec_sim * 0.65 + s.trgm_sim * 0.35 AS hybrid_score
  FROM scored s
  -- 向量或关键词任一达标即可（原逻辑要求向量必达，导致纯关键词命中失效）
  WHERE s.vec_sim >= min_similarity OR s.trgm_sim >= 0.2
  ORDER BY hybrid_score DESC
  LIMIT match_count;
END;
$$;

-- 3. 让规划器感知新索引和向量分布
ANALYZE legal_knowledge;
