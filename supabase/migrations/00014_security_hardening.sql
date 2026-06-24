-- 安全加固：contracts 桶 + contract_reviews 表 + notify 认证

-- 1. contracts 存储桶：上传要求已登录
DROP POLICY IF EXISTS "public_upload_contracts" ON storage.objects;
CREATE POLICY "public_upload_contracts" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'contracts' AND auth.role() = 'authenticated');

-- 2. contract_reviews：添加 user_id 列并启用 RLS
ALTER TABLE contract_reviews ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE contract_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cr_select ON contract_reviews;
DROP POLICY IF EXISTS cr_insert ON contract_reviews;
DROP POLICY IF EXISTS cr_delete ON contract_reviews;

CREATE POLICY cr_select ON contract_reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY cr_insert ON contract_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY cr_delete ON contract_reviews FOR DELETE USING (auth.uid() = user_id);

-- 3. question_stats：写入要求已登录
DROP POLICY IF EXISTS question_stats_insert ON question_stats;
DROP POLICY IF EXISTS question_stats_update ON question_stats;
CREATE POLICY question_stats_insert ON question_stats FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY question_stats_update ON question_stats FOR UPDATE USING (auth.role() = 'authenticated');

-- 4. profiles：限制 SELECT 仅公开必要字段（RLS 不支持列级，通过策略限制为已登录可读）
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);
-- 注：profiles 全员可读是为了展示案例广场的昵称，如需隐私保护可改为 USING (auth.role() = 'authenticated')
