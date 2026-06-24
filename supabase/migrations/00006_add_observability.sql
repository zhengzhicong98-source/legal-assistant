-- 1. consult_history 表新增反馈和性能字段
ALTER TABLE consult_history
ADD COLUMN IF NOT EXISTS feedback SMALLINT DEFAULT NULL CHECK (feedback IN (1, -1)),
ADD COLUMN IF NOT EXISTS response_time_ms INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rag_hit_count SMALLINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS token_estimate INTEGER DEFAULT NULL;

-- 2. 新建 ai_call_logs 表，追踪每次 AI 调用
CREATE TABLE IF NOT EXISTS ai_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  function_name TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_length INTEGER,
  response_length INTEGER,
  token_estimate INTEGER,
  response_time_ms INTEGER,
  rag_used BOOLEAN DEFAULT FALSE,
  rag_hit_count SMALLINT DEFAULT 0,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS：仅允许用户查看自己的日志，管理员可查全部
ALTER TABLE ai_call_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users can insert own logs" ON ai_call_logs;
DROP POLICY IF EXISTS "users can view own logs" ON ai_call_logs;
CREATE POLICY "users can insert own logs" ON ai_call_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "users can view own logs" ON ai_call_logs
  FOR SELECT USING (auth.uid() = user_id);
