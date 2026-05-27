
-- profiles 表
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  openid text,
  nickname text DEFAULT '法律学长',
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_insert ON profiles;
DROP POLICY IF EXISTS profiles_update ON profiles;

CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (auth.uid() = id);

-- 新用户自动同步到 profiles 的触发器
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, openid, nickname)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'openid')::text,
    COALESCE((NEW.raw_user_meta_data->>'nickname')::text, '法律学长')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- consult_history 表（咨询历史）
CREATE TABLE IF NOT EXISTS consult_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  rag_used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consult_history_user ON consult_history(user_id, created_at DESC);
ALTER TABLE consult_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consult_history_select ON consult_history;
DROP POLICY IF EXISTS consult_history_insert ON consult_history;
DROP POLICY IF EXISTS consult_history_delete ON consult_history;

CREATE POLICY consult_history_select ON consult_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY consult_history_insert ON consult_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY consult_history_delete ON consult_history FOR DELETE USING (auth.uid() = user_id);

-- saved_laws 表（收藏法条）
CREATE TABLE IF NOT EXISTS saved_laws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  knowledge_id uuid REFERENCES legal_knowledge(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, knowledge_id)
);
ALTER TABLE saved_laws ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_laws_select ON saved_laws;
DROP POLICY IF EXISTS saved_laws_insert ON saved_laws;
DROP POLICY IF EXISTS saved_laws_delete ON saved_laws;

CREATE POLICY saved_laws_select ON saved_laws FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY saved_laws_insert ON saved_laws FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY saved_laws_delete ON saved_laws FOR DELETE USING (auth.uid() = user_id);
