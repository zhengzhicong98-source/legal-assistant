# Supabase 后端服务

本项目使用 Supabase 作为后端服务，包含 PostgreSQL 数据库（含 pgvector 向量扩展）、Edge Functions（Deno 运行时）和 Storage 存储。

## Edge Functions

所有函数均部署在 Supabase Edge Functions（Deno 运行时），通过 `callEdgeFunction` 工具函数从前端调用。

### legal-chat — AI 法律咨询（含 RAG）

调用智谱 AI 进行法律问答，支持 RAG（检索增强生成）和 SSE 流式输出。

**入参：**
```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "mode": "chat"
}
```

**出参（非流式）：**
```json
{
  "content": "法律咨询回复内容...",
  "references": [{ "id": 1, "title": "...", "source": "..." }]
}
```

**RAG 流程：**
1. 接收用户问题，调用智谱 embedding-3 生成 1024 维查询向量
2. 在 `legal_knowledge` 表中执行 pgvector 余弦相似度检索
3. 将检索到的相关法条注入 System Prompt 作为上下文
4. 调用 glm-4-flash 生成带法律依据的回答
5. 支持 SSE 流式输出，实时返回生成内容

**限制：** 最多 5 轮对话历史，单次最多 3000 tokens

---

### embed-document — 文档向量化

将知识库文档文本转换为 1024 维向量存储到 pgvector。

**入参：**
```json
{
  "id": "knowledge-uuid",
  "text": "要向量化的文本内容"
}
```

**出参：**
```json
{
  "success": true,
  "message": "向量化完成"
}
```

---

### contract-review — 合同审查

接收合同图片，调用智谱 AI 多模态模型识别条款并进行风险评估。

**入参：**
```json
{
  "image_url": "https://..."
}
```

**出参：**
```json
{
  "summary": "整体评价",
  "risk_level": "高风险 | 中风险 | 低风险",
  "score": 85,
  "risks": [{ "clause": "...", "risk_level": "...", "description": "...", "law_basis": "...", "suggestion": "..." }],
  "advice": "总体建议"
}
```

---

### ai-search — AI 联网搜索

调用智谱 AI 进行联网搜索，获取最新法律法规信息。

**入参：**
```json
{
  "query": "搜索关键词"
}
```

**出参：**
```json
{
  "content": "搜索结果...",
  "references": [{ "id": 1, "title": "...", "url": "..." }]
}
```

---

### geocoding — 地理编码

将结构化地址转换为经纬度坐标（bd09ll 坐标系）。

**入参：**
```json
{
  "address": "北京市西城区枣林前街68号",
  "city": "北京市"
}
```

**出参：**
```json
{
  "status": "1",
  "geocodes": [{ "location": "116.123,39.456", "level": "门牌号" }]
}
```

---

### reverse-geocoding — 反向地理编码

将经纬度坐标转换为省市区地址信息。

**入参：**
```json
{
  "location": "116.123,39.456"
}
```

**出参：**
```json
{
  "status": "1",
  "regeocode": {
    "addressComponent": { "province": "北京市", "city": "北京市", "district": "西城区" }
  }
}
```

---

### route-direction — 路线规划

查询两点之间的驾车/步行/公交路线。

**入参：**
```json
{
  "mode": "driving | walking | transit",
  "origin": "116.123,39.456",
  "destination": "116.789,39.012"
}
```

**出参（驾车/步行）：**
```json
{
  "status": "1",
  "route": {
    "paths": [{ "distance": "5000", "duration": "600" }]
  }
}
```

**出参（公交）：**
```json
{
  "status": "1",
  "route": {
    "transits": [{ "distance": "5000", "duration": "900" }]
  }
}
```

---

### route-matrix — 距离矩阵

批量计算多个起点到多个终点的步行距离和时间。

**入参：**
```json
{
  "mode": "walking",
  "origins": ["39.456,116.123"],
  "destinations": ["39.789,116.456", "39.012,116.789"]
}
```

**出参：**
```json
{
  "status": 0,
  "result": [
    { "distance": { "text": "500米", "value": 500 }, "duration": { "text": "6分钟", "value": 360 } }
  ]
}
```

---

### place-search — 地点搜索

搜索附近或指定区域的维权机构。

**请求方式 A — 附近搜索（GET）：**
```
GET /functions/v1/place-search?mode=nearby&lat=39.456&lng=116.123&radius=5000
```

**请求方式 B — 区域搜索（GET）：**
```
GET /functions/v1/place-search?mode=region&query=劳动仲裁委&region=北京市
```

**出参：**
```json
{
  "results": [
    {
      "name": "机构名称",
      "address": "地址",
      "uid": "唯一标识",
      "location": { "lat": 39.456, "lng": 116.123 },
      "detail_info": { "distance": 500, "shop_hours": "9:00-17:00" }
    }
  ]
}
```

---

### ip-location — IP 定位

根据请求 IP 获取用户当前城市（用于自动定位维权导航）。

**入参：** 无

**出参：**
```json
{
  "status": "1",
  "province": "北京市",
  "city": "北京市"
}
```

---

### wechat_miniapp_login — 微信登录

微信小程序登录，换取 OpenID 并创建/更新用户资料。

**入参：**
```json
{
  "code": "微信登录code"
}
```

**出参：**
```json
{
  "user": { "id": "...", "openid": "...", "nickname": "..." },
  "session": { "access_token": "...", "refresh_token": "..." }
}
```

---

## 数据库表结构

### rights_centers — 维权机构

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 主键 |
| `province` | text | 省份 |
| `city` | text | 城市 |
| `name` | text | 机构名称 |
| `type` | text | 类型（劳动仲裁委/消费者协会/法律援助中心） |
| `address` | text | 地址 |
| `phone` | text | 电话 |
| `website` | text | 网站 |
| `process` | text | 办事流程 |
| `working_hours` | text | 工作时间 |
| `created_at` | timestamptz | 创建时间 |

### legal_knowledge — RAG 知识库

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 主键 |
| `title` | text | 标题 |
| `source` | text | 来源 |
| `category` | text | 分类 |
| `content` | text | 正文内容 |
| `embedding` | vector(1024) | 文本向量（智谱 embedding-3） |
| `created_at` | timestamptz | 创建时间 |

### contract_reviews — 合同审查记录

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 主键 |
| `file_url` | text | 合同文件 URL |
| `file_name` | text | 文件名 |
| `review_result` | jsonb | 审查结果 JSON |
| `created_at` | timestamptz | 创建时间 |

### profiles — 用户信息

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 主键 |
| `openid` | text | 微信 OpenID（唯一） |
| `nickname` | text | 昵称 |
| `avatar_url` | text | 头像 URL |
| `created_at` | timestamptz | 创建时间 |

### consult_history — 咨询历史

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 主键 |
| `user_id` | uuid | 用户 ID（外键 → profiles） |
| `question` | text | 用户问题 |
| `answer` | text | AI 回答 |
| `rag_used` | boolean | 是否使用了 RAG |
| `created_at` | timestamptz | 创建时间 |

### case_posts — 案例帖子

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 主键 |
| `user_id` | uuid | 作者 ID |
| `nickname` | text | 作者昵称 |
| `category` | text | 分类 |
| `title` | text | 标题 |
| `content` | text | 正文 |
| `question` | text | 问题描述 |
| `solution` | text | 解决方案 |
| `result` | jsonb | 维权结果 |
| `is_anonymous` | boolean | 是否匿名 |
| `status` | text | 状态（published/draft） |
| `likes_count` | int | 点赞数 |
| `created_at` | timestamptz | 创建时间 |

### case_likes / case_saves — 点赞/收藏

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 主键 |
| `post_id` | uuid | 帖子 ID |
| `user_id` | uuid | 用户 ID |
| `created_at` | timestamptz | 创建时间 |

### saved_laws — 收藏法条

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 主键 |
| `user_id` | uuid | 用户 ID |
| `knowledge_id` | uuid | 法条 ID（外键 → legal_knowledge） |
| `created_at` | timestamptz | 创建时间 |

### question_stats — 热点问题统计

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 主键 |
| `question_text` | text | 问题文本 |
| `category` | text | 分类 |
| `week_number` | int | 周数 |
| `year` | int | 年份 |
| `count` | int | 提问次数 |
| `updated_at` | timestamptz | 更新时间 |

---

## 本地开发

### 前置条件

```bash
# 安装 Supabase CLI
npm install -g supabase
# 或
brew install supabase/tap/supabase
```

### 启动本地 Supabase

```bash
# 启动本地 Supabase（需要 Docker）
supabase start

# 启动 Edge Functions 本地调试
supabase functions serve

# 部署单个函数到生产环境
supabase functions deploy <function-name>

# 部署所有函数
supabase functions deploy

# 配置生产环境 Secrets
supabase secrets set INTEGRATIONS_API_KEY=your-key
supabase secrets set AMAP_KEY=your-key
```

### 数据库迁移

迁移文件位于 `supabase/migrations/` 目录，按顺序命名：

1. `00001_init_legal_assistant.sql` — 初始化维权机构表、合同审查表、存储桶
2. `00002_add_legal_knowledge_rag.sql` — 添加 RAG 知识库表和向量函数
3. `00003_change_embedding_vector_1536_to_1024.sql` — 将向量维度从 1536 改为 1024（适配智谱 embedding-3）
4. `00004_add_plaza_and_hot_questions.sql` — 添加案例广场和热点问题表
5. `00005_add_login_and_profile.sql` — 添加微信登录和用户资料表
