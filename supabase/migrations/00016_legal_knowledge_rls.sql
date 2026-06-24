-- legal_knowledge 从 DISABLE RLS 改为启用 + 公开只读 + 认证写
ALTER TABLE legal_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lk_select ON legal_knowledge;
CREATE POLICY lk_select ON legal_knowledge FOR SELECT USING (true);

DROP POLICY IF EXISTS lk_insert ON legal_knowledge;
CREATE POLICY lk_insert ON legal_knowledge FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS lk_update ON legal_knowledge;
CREATE POLICY lk_update ON legal_knowledge FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS lk_delete ON legal_knowledge;
CREATE POLICY lk_delete ON legal_knowledge FOR DELETE USING (auth.role() = 'authenticated');
