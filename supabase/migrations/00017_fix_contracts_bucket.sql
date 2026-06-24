-- 回退 00014 中 contracts 桶 INSERT 的 authenticated 要求
-- 原因：合同审查功能支持匿名上传（contract/index.tsx 未使用 useAuth）
-- 安全边界由文件大小(10MB)和 MIME 类型限制保障

DROP POLICY IF EXISTS "public_upload_contracts" ON storage.objects;
CREATE POLICY "public_upload_contracts" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'contracts');
