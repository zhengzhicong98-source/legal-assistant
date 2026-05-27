
-- 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 法律知识库表
CREATE TABLE IF NOT EXISTS legal_knowledge (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,            -- 文档标题，如"劳动合同法第X条"
  source text NOT NULL DEFAULT '', -- 来源，如"《劳动合同法》第37条"
  category text NOT NULL DEFAULT '通用', -- 分类：劳动法/租房/消费者权益/通用
  content text NOT NULL,          -- 原始法律条文/知识内容
  embedding vector(1536),         -- 向量嵌入
  created_at timestamptz DEFAULT now()
);

-- 向量相似度检索索引（IVFFlat，适合中小规模知识库）
CREATE INDEX IF NOT EXISTS legal_knowledge_embedding_idx
  ON legal_knowledge USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- 禁用 RLS（无登录体系，管理员通过 service_role key 操作）
ALTER TABLE legal_knowledge DISABLE ROW LEVEL SECURITY;

-- 向量检索函数：返回最相近的 K 条法律知识
CREATE OR REPLACE FUNCTION match_legal_docs(
  query_embedding vector(1536),
  match_count int DEFAULT 3,
  min_similarity float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  title text,
  source text,
  category text,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lk.id,
    lk.title,
    lk.source,
    lk.category,
    lk.content,
    1 - (lk.embedding <=> query_embedding) AS similarity
  FROM legal_knowledge lk
  WHERE lk.embedding IS NOT NULL
    AND 1 - (lk.embedding <=> query_embedding) >= min_similarity
  ORDER BY lk.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 插入初始种子数据（常用法律条文，用零向量占位，部署 embed-document 后可重新向量化）
INSERT INTO legal_knowledge (title, source, category, content) VALUES
(
  '劳动合同法第十条：订立劳动合同',
  '《中华人民共和国劳动合同法》第十条',
  '劳动法',
  '建立劳动关系，应当订立书面劳动合同。已建立劳动关系，未同时订立书面劳动合同的，应当自用工之日起一个月内订立书面劳动合同。用人单位与劳动者在用工前订立劳动合同的，劳动关系自用工之日起建立。'
),
(
  '劳动合同法第十九条：试用期限定',
  '《中华人民共和国劳动合同法》第十九条',
  '劳动法',
  '劳动合同期限三个月以上不满一年的，试用期不得超过一个月；劳动合同期限一年以上不满三年的，试用期不得超过二个月；三年以上固定期限和无固定期限的劳动合同，试用期不得超过六个月。同一用人单位与同一劳动者只能约定一次试用期。以完成一定工作任务为期限的劳动合同或者劳动合同期限不满三个月的，不得约定试用期。试用期包含在劳动合同期限内。劳动合同仅约定试用期的，试用期不成立，该期限为劳动合同期限。'
),
(
  '劳动合同法第二十条：试用期工资标准',
  '《中华人民共和国劳动合同法》第二十条',
  '劳动法',
  '劳动者在试用期的工资不得低于本单位相同岗位最低档工资或者劳动合同约定工资的百分之八十，并不得低于用人单位所在地的最低工资标准。'
),
(
  '劳动合同法第三十七条：劳动者解除合同',
  '《中华人民共和国劳动合同法》第三十七条',
  '劳动法',
  '劳动者提前三十日以书面形式通知用人单位，可以解除劳动合同。劳动者在试用期内提前三日通知用人单位，可以解除劳动合同。'
),
(
  '劳动合同法第四十七条：经济补偿标准',
  '《中华人民共和国劳动合同法》第四十七条',
  '劳动法',
  '经济补偿按劳动者在本单位工作的年限，每满一年支付一个月工资的标准向劳动者支付。六个月以上不满一年的，按一年计算；不满六个月的，向劳动者支付半个月工资的经济补偿。劳动者月工资高于用人单位所在直辖市、设区的市级人民政府公布的本地区上年度职工月平均工资三倍的，向其支付经济补偿的标准按职工月平均工资三倍的数额支付，向其支付经济补偿的年限最高不超过十二年。本条所称月工资是指劳动者在劳动合同解除或者终止前十二个月的平均工资。'
),
(
  '消费者权益保护法第二十四条：退换货规则',
  '《中华人民共和国消费者权益保护法》第二十四条',
  '消费者权益',
  '经营者提供的商品或者服务不符合质量要求的，消费者可以依照国家规定、当事人约定退货，或者要求经营者履行更换、修理等义务。没有国家规定和当事人约定的，消费者可以自收到商品之日起七日内退货；七日后符合法定解除合同条件的，消费者可以及时退货，不符合法定解除合同条件的，可以要求经营者履行更换、修理等义务。'
),
(
  '民法典第七百一十条：租赁合同押金规定',
  '《中华人民共和国民法典》第七百一十条',
  '租房',
  '承租人按照约定的方法或者租赁物的性质使用租赁物，致使租赁物受到损耗的，不承担赔偿责任。'
),
(
  '民法典第七百一十五条：租赁物改善义务',
  '《中华人民共和国民法典》第七百一十五条',
  '租房',
  '承租人经出租人同意，可以对租赁物进行改善或者增设他物。承租人未经出租人同意，对租赁物进行改善或者增设他物的，出租人可以请求承租人恢复原状或者赔偿损失。'
),
(
  '民法典第七百二十二条：提前解除租赁合同',
  '《中华人民共和国民法典》第七百二十二条',
  '租房',
  '承租人无正当理由未支付或者迟延支付租金的，出租人可以请求承租人在合理期限内支付；承租人逾期不支付的，出租人可以解除合同。'
),
(
  '劳动争议调解仲裁法第二条：劳动争议范围',
  '《中华人民共和国劳动争议调解仲裁法》第二条',
  '劳动法',
  '中华人民共和国境内的用人单位与劳动者发生的下列劳动争议，适用本法：（一）因确认劳动关系发生的争议；（二）因订立、履行、变更、解除和终止劳动合同发生的争议；（三）因除名、辞退和辞职、离职发生的争议；（四）因工作时间、休息休假、社会保险、福利、培训以及劳动保护发生的争议；（五）因劳动报酬、工伤医疗费、经济补偿或者赔偿金等发生的争议；（六）法律、法规规定的其他劳动争议。'
);

-- 启用 Realtime（管理员上传后实时刷新列表）
ALTER PUBLICATION supabase_realtime ADD TABLE legal_knowledge;
