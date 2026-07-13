-- ============================================================
-- 00030_allow_anon_question_count.sql
-- 允许匿名（anon）角色调用 increment_question_count RPC
--
-- 背景：
--   00026 定义的 RPC 在函数体里做了 auth.role() <> 'authenticated'
--   的强校验，导致匿名调用返回 400 unauthorized。
--   00029 只回退了 RLS 策略，没有覆盖到 RPC 函数体本身。
--
-- 决策：
--   放开匿名统计（统计更全面），可能被刷但业务侧可接受。
--   保留输入长度校验（防止垃圾数据 / 过长字符串）。
--   保留 SECURITY DEFINER：RPC 内部写 question_stats 时绕过 RLS。
--
-- 变更范围：
--   仅 increment_question_count 一个函数 + 其 GRANT。
--   不动其他 RPC，不动任何表 / RLS 策略。
-- ============================================================

CREATE OR REPLACE FUNCTION increment_question_count(
  p_question_text text,
  p_category text,
  p_week_number int,
  p_year int
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 输入长度限制，防止滥用
  IF length(p_question_text) = 0 OR length(p_question_text) > 100 THEN
    RAISE EXCEPTION 'invalid question_text length';
  END IF;

  INSERT INTO question_stats (question_text, category, week_number, year, count, updated_at)
  VALUES (p_question_text, p_category, p_week_number, p_year, 1, now())
  ON CONFLICT (question_text, week_number, year)
  DO UPDATE SET count = question_stats.count + 1, updated_at = now();
END;
$$;

-- 先撤销 PUBLIC，再显式授权 anon + authenticated
REVOKE ALL ON FUNCTION increment_question_count(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_question_count(text, text, int, int) TO anon, authenticated;
