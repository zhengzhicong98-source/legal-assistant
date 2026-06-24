-- 案例分享广场相关表

CREATE TABLE IF NOT EXISTS case_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  nickname text NOT NULL DEFAULT '匿名学长',
  category text NOT NULL CHECK (category IN ('租房', '劳动', '消费', '其他')),
  title text NOT NULL,
  content text NOT NULL,
  question text,
  solution text,
  result text CHECK (result IN ('维权成功', '协商解决', '待处理')),
  likes_count int DEFAULT 0,
  saves_count int DEFAULT 0,
  is_anonymous boolean DEFAULT true,
  status text DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS case_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES case_posts(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS case_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES case_posts(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE OR REPLACE FUNCTION update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE case_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE case_posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_case_likes ON case_likes;
CREATE TRIGGER trg_case_likes
AFTER INSERT OR DELETE ON case_likes
FOR EACH ROW EXECUTE FUNCTION update_likes_count();

CREATE OR REPLACE FUNCTION update_saves_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE case_posts SET saves_count = saves_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE case_posts SET saves_count = saves_count - 1 WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_case_saves ON case_saves;
CREATE TRIGGER trg_case_saves
AFTER INSERT OR DELETE ON case_saves
FOR EACH ROW EXECUTE FUNCTION update_saves_count();

CREATE INDEX IF NOT EXISTS idx_case_posts_category ON case_posts(category);
CREATE INDEX IF NOT EXISTS idx_case_posts_status ON case_posts(status);
CREATE INDEX IF NOT EXISTS idx_case_posts_created_at ON case_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_posts_likes ON case_posts(likes_count DESC);
CREATE INDEX IF NOT EXISTS idx_case_likes_post ON case_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_case_likes_user ON case_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_case_saves_post ON case_saves(post_id);
CREATE INDEX IF NOT EXISTS idx_case_saves_user ON case_saves(user_id);

ALTER TABLE case_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS case_posts_select ON case_posts;
DROP POLICY IF EXISTS case_posts_insert ON case_posts;
DROP POLICY IF EXISTS case_posts_update ON case_posts;
DROP POLICY IF EXISTS case_posts_delete ON case_posts;
CREATE POLICY case_posts_select ON case_posts FOR SELECT USING (status = 'published');
CREATE POLICY case_posts_insert ON case_posts FOR INSERT WITH CHECK (true);
CREATE POLICY case_posts_update ON case_posts FOR UPDATE USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
CREATE POLICY case_posts_delete ON case_posts FOR DELETE USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

DROP POLICY IF EXISTS case_likes_select ON case_likes;
DROP POLICY IF EXISTS case_likes_insert ON case_likes;
DROP POLICY IF EXISTS case_likes_delete ON case_likes;
CREATE POLICY case_likes_select ON case_likes FOR SELECT USING (true);
CREATE POLICY case_likes_insert ON case_likes FOR INSERT WITH CHECK (true);
CREATE POLICY case_likes_delete ON case_likes FOR DELETE USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

DROP POLICY IF EXISTS case_saves_select ON case_saves;
DROP POLICY IF EXISTS case_saves_insert ON case_saves;
DROP POLICY IF EXISTS case_saves_delete ON case_saves;
CREATE POLICY case_saves_select ON case_saves FOR SELECT USING (true);
CREATE POLICY case_saves_insert ON case_saves FOR INSERT WITH CHECK (true);
CREATE POLICY case_saves_delete ON case_saves FOR DELETE USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE TABLE IF NOT EXISTS question_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text text NOT NULL,
  count int DEFAULT 1,
  category text,
  week_number int,
  year int,
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_question_stats_unique ON question_stats(question_text, week_number, year);
CREATE INDEX IF NOT EXISTS idx_question_stats_week ON question_stats(year DESC, week_number DESC);
CREATE INDEX IF NOT EXISTS idx_question_stats_count ON question_stats(count DESC);

ALTER TABLE question_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS question_stats_select ON question_stats;
DROP POLICY IF EXISTS question_stats_insert ON question_stats;
DROP POLICY IF EXISTS question_stats_update ON question_stats;
CREATE POLICY question_stats_select ON question_stats FOR SELECT USING (true);
CREATE POLICY question_stats_insert ON question_stats FOR INSERT WITH CHECK (true);
CREATE POLICY question_stats_update ON question_stats FOR UPDATE USING (true);
