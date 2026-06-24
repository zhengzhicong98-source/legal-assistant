-- 扩展维权机构类型：新增劳动监察大队、市场监督管理局、人民法院立案庭
-- 步骤：先删旧约束 → 加新值 → 重建 CHECK

ALTER TABLE rights_centers DROP CONSTRAINT IF EXISTS rights_centers_type_check;

ALTER TABLE rights_centers ADD CONSTRAINT rights_centers_type_check
  CHECK (type IN (
    '劳动仲裁委',
    '消费者协会',
    '法律援助中心',
    '劳动监察大队',
    '市场监督管理局',
    '人民法院立案庭'
  ));
