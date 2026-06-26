-- 启用 pg_net 扩展（Supabase 已内置，用于在数据库触发器中发起 HTTP 请求）
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 创建告警检查函数
CREATE OR REPLACE FUNCTION check_ai_call_failures()
RETURNS TRIGGER AS $$
DECLARE
  failure_count INTEGER;
  avg_response_time FLOAT;
  supabase_url TEXT;
BEGIN
  supabase_url := current_setting('app.settings.supabase_url', true);
  IF supabase_url IS NULL OR supabase_url = '' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO failure_count
  FROM ai_call_logs
  WHERE created_at > NOW() - INTERVAL '5 minutes'
    AND success = FALSE;

  SELECT AVG(response_time_ms) INTO avg_response_time
  FROM ai_call_logs
  WHERE created_at > NOW() - INTERVAL '10 minutes'
    AND success = TRUE;

  IF failure_count >= 3 THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/alert-notify',
      body := json_build_object(
        'level', 'error',
        'title', 'AI调用连续失败',
        'message', format('最近5分钟内AI调用失败%s次，请检查服务状态', failure_count),
        'details', json_build_object('failure_count', failure_count)
      )::text,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  END IF;

  IF avg_response_time IS NOT NULL AND avg_response_time > 15000 THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/alert-notify',
      body := json_build_object(
        'level', 'warning',
        'title', '响应时间过长',
        'message', format('最近10分钟平均响应时间%.0fms，超过15秒阈值', avg_response_time),
        'details', json_build_object('avg_ms', avg_response_time)
      )::text,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 绑定触发器
DROP TRIGGER IF EXISTS ai_call_alert_trigger ON ai_call_logs;
CREATE TRIGGER ai_call_alert_trigger
  AFTER INSERT ON ai_call_logs
  FOR EACH ROW
  EXECUTE FUNCTION check_ai_call_failures();

-- 设置 Supabase URL 供触发器使用
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://isaoxdrzcyjisfodssfw.supabase.co';
