-- 收紧案例广场 RLS 写入策略：要求已登录用户
-- 与前端 plaza/post.tsx 和 plaza/detail.tsx 的登录强制保持一致

-- case_posts：插入时校验 user_id 等于当前登录用户
DROP POLICY IF EXISTS case_posts_insert ON case_posts;
CREATE POLICY case_posts_insert ON case_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- case_likes：插入时校验 user_id 等于当前登录用户
DROP POLICY IF EXISTS case_likes_insert ON case_likes;
CREATE POLICY case_likes_insert ON case_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- case_saves：插入时校验 user_id 等于当前登录用户
DROP POLICY IF EXISTS case_saves_insert ON case_saves;
CREATE POLICY case_saves_insert ON case_saves
  FOR INSERT WITH CHECK (auth.uid() = user_id);
