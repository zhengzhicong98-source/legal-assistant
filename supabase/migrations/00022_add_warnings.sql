-- 热门避雷指南动态内容表
CREATE TABLE IF NOT EXISTS warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 99,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 初始数据：从前端硬编码迁移到数据库
INSERT INTO warnings (content, sort_order) VALUES
  ('避雷 | 中介要求签"独家委托"并收取高额手续费，均属违规，可向住建局投诉', 1),
  ('避雷 | 试用期工资低于转正工资50%违法，可要求补发差额', 2),
  ('避雷 | 培训机构"概不退费"条款无效，7天冷静期内可全额退款', 3),
  ('避雷 | 押金超过2个月租金属违规，可向市场监管局举报', 4),
  ('避雷 | 求职被要求缴纳保证金/押金/培训费，均属违法行为', 5),
  ('避雷 | 房东不提供书面合同即收租，拒付前请先拍照留存付款记录', 6),
  ('避雷 | 网签合同与纸质合同内容不符，以网签备案版本为准', 7),
  ('避雷 | 不签劳动合同满1个月，公司须支付2倍工资', 8);

ALTER TABLE warnings ENABLE ROW LEVEL SECURITY;

-- 所有人可读
CREATE POLICY "warnings select" ON warnings FOR SELECT USING (is_active = true);

-- 管理员可增删改
CREATE POLICY "admin insert warnings" ON warnings FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin update warnings" ON warnings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin delete warnings" ON warnings FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
