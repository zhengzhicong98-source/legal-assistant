-- 维权进度追踪
CREATE TABLE IF NOT EXISTS rights_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT '其他',
  status text NOT NULL DEFAULT '准备中' CHECK (status IN ('准备中', '投诉阶段', '调解阶段', '仲裁阶段', '诉讼阶段', '已结案')),
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rights_cases_user ON rights_cases(user_id, created_at DESC);

-- 维权时间线节点
CREATE TABLE IF NOT EXISTS rights_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES rights_cases(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text,
  node_date date DEFAULT CURRENT_DATE,
  is_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rights_timeline_case ON rights_timeline(case_id, node_date);

ALTER TABLE rights_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rc_select ON rights_cases;
DROP POLICY IF EXISTS rc_insert ON rights_cases;
DROP POLICY IF EXISTS rc_update ON rights_cases;
DROP POLICY IF EXISTS rc_delete ON rights_cases;
CREATE POLICY rc_select ON rights_cases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY rc_insert ON rights_cases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY rc_update ON rights_cases FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY rc_delete ON rights_cases FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE rights_timeline ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rtl_select ON rights_timeline;
DROP POLICY IF EXISTS rtl_insert ON rights_timeline;
DROP POLICY IF EXISTS rtl_update ON rights_timeline;
DROP POLICY IF EXISTS rtl_delete ON rights_timeline;
CREATE POLICY rtl_select ON rights_timeline FOR SELECT USING (EXISTS (SELECT 1 FROM rights_cases WHERE id = case_id AND user_id = auth.uid()));
CREATE POLICY rtl_insert ON rights_timeline FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM rights_cases WHERE id = case_id AND user_id = auth.uid()));
CREATE POLICY rtl_update ON rights_timeline FOR UPDATE USING (EXISTS (SELECT 1 FROM rights_cases WHERE id = case_id AND user_id = auth.uid()));
CREATE POLICY rtl_delete ON rights_timeline FOR DELETE USING (EXISTS (SELECT 1 FROM rights_cases WHERE id = case_id AND user_id = auth.uid()));
