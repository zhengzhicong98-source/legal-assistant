-- 补充维权导航所需的 RPC 函数
-- 前端 src/db/api.ts 调用 get_provinces / get_cities_by_province，
-- 但此前迁移未定义这两个函数，导致省市级联选择报错。

-- 获取所有有维权机构的省份（去重、按拼音/字典序排序）
CREATE OR REPLACE FUNCTION get_provinces()
RETURNS TABLE (province text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT rc.province
  FROM rights_centers rc
  WHERE rc.province IS NOT NULL AND rc.province <> ''
  ORDER BY rc.province;
$$;

-- 按省份获取其下所有有维权机构的城市
CREATE OR REPLACE FUNCTION get_cities_by_province(p_province text)
RETURNS TABLE (city text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT rc.city
  FROM rights_centers rc
  WHERE rc.province = p_province
    AND rc.city IS NOT NULL AND rc.city <> ''
  ORDER BY rc.city;
$$;
