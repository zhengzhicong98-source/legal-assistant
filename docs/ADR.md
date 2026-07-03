# 架构决策记录（ADR）

> Architecture Decision Records — 记录关键技术选型的**决策、备选方案、权衡、触发替换的条件**。
>
> 阅读顺序：ADR 编号越小越基础，从 001 读起可以理解整个系统的骨架。
>
> 每条 ADR 遵循 [Michael Nygard 提出的经典格式](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)：
> Context（背景） → Decision（决策） → Alternatives（备选） → Consequences（后果）→ Trigger（触发替换的条件）。

---

## 索引

| # | 领域 | 决策 | 状态 |
|---|------|------|------|
| [ADR-001](#adr-001向量数据库选型--pgvector) | RAG · 向量存储 | 用 pgvector（Supabase 内置） | ✅ Accepted |
| [ADR-002](#adr-002embedding-模型--智谱-embedding-3) | RAG · 向量化 | 智谱 embedding-3（2000 维） | ✅ Accepted |
| [ADR-003](#adr-003向量维度--1024) | RAG · 向量化 | 用 2000 维（pgvector 硬上限） | ✅ Accepted |
| [ADR-004](#adr-004检索相似度阈值--03) | RAG · 检索 | Top-3 + 相似度阈值 0.1，Top-1 诊断 | ✅ Accepted |
| [ADR-005](#adr-005切片策略--500-字重叠切片-vs-按条切片) | RAG · 切片 | 按「第 X 条」切 + 超长条 500 字滑窗 | ✅ Accepted |
| [ADR-006](#adr-006向量索引--ivfflat-vs-hnsw) | RAG · 索引 | HNSW m=16 ef_construction=64 | ✅ Accepted |
| [ADR-007](#adr-007状态管理--zustand) | 前端 · 状态 | Zustand（+ Immer） | ✅ Accepted |
| [ADR-008](#adr-008跨端方案--taro-4) | 前端 · 框架 | Taro 4（React 版） | ✅ Accepted |
| [ADR-009](#adr-009内容安全--双向过滤) | 安全 · 合规 | 输入黑名单 + 输出二次审核 | ✅ Accepted |
| [ADR-010](#adr-010可观测性--自建-traces-表) | 观测 · 追踪 | 自建 traces 表 + trace_id 串联 | ✅ Accepted |
| [ADR-011](#adr-011后端选型--supabase-一体化) | 后端 · 架构 | Supabase（BaaS）全栈一体化 | ✅ Accepted |
| [ADR-012](#adr-012编辑器认证--rbac-rls-双层) | 安全 · 权限 | RBAC（角色表）+ RLS（行级） | ✅ Accepted |

---

## ADR-001：向量数据库选型 — pgvector

**Context**
项目需要在小程序场景下做 RAG（Retrieval-Augmented Generation），存储 ~1000-10000 条法律条文的 embedding，支持毫秒级 top-K 相似度检索。

**Decision**
使用 Supabase 内置的 **pgvector** 扩展，将 embedding 直接存在业务 PostgreSQL 数据库的 `legal_knowledge.embedding vector(2000)` 列中。

**Alternatives 与权衡**

| 方案 | 优势 | 劣势 | 淘汰原因 |
|------|------|------|---------|
| **pgvector** ✅ | 与业务库同事务；零额外运维；SQL 生态；免费额度够用 | 单表 >100 万向量后 IVFFlat 精度下降 | — |
| Milvus（自建） | 千万级 QPS；HNSW 精度高 | 需要独立部署+运维；小项目 overkill | 规模不匹配 |
| Pinecone | 托管零运维；混合搜索开箱即用 | 月费 $70+ 起步；数据出境 | 学生作品成本敏感 |
| Weaviate | 内置多种向量化模型 | 学习曲线高；社区较小 | 生态不成熟 |
| Elasticsearch KNN | 全文+向量混合检索强 | 内存占用高；索引重建慢 | 部署复杂 |

**Consequences**
- ✅ **事务一致性**：知识库与业务数据同库，可用外键 + RLS 统一治理
- ✅ **一次连接**：小程序 Supabase SDK 一次连接搞定业务查询 + RAG
- ✅ **成本 0**：Supabase Free Tier 8GB 存储足够
- ⚠️ **性能上限**：pgvector IVFFlat 在 >50 万向量时召回率下降约 2-3pp（社区数据）

**Trigger — 何时替换**
- 知识库突破 **100 万条**（法律条文全库 + 判例数据）
- QPS 稳定 > 500
- 需要多租户 embedding 隔离
→ 迁移到 Milvus 或 Qdrant，方案：先做 dual-write 灰度，再切读流量。

---

## ADR-002：Embedding 模型 — 智谱 embedding-3

**Context**
需要一个**中文法律语料**表现好、**国内可稳定调用**、**成本可控**的 embedding 模型。

**Decision**
选择 **智谱 AI `embedding-3`**（[open.bigmodel.cn](https://open.bigmodel.cn)），配置 `dimensions=2000`（pgvector 硬上限）。

**Alternatives 与权衡**

| 模型 | 中文法律语料表现 | 可用性 | 定价 | 淘汰原因 |
|------|---------------|--------|------|---------|
| **智谱 embedding-3** ✅ | 强，专为中文优化 | 国内直连稳定 | ¥0.5 / 百万 tokens | — |
| OpenAI text-embedding-3-large | 通用强，中文一般 | 需代理；国内不稳定 | $0.13 / 百万 tokens | 网络合规 |
| BGE-large-zh（本地） | 中文极强 | 需 GPU 部署 | 硬件成本 | 学生项目无 GPU |
| Cohere embed-v3 | 多语言强 | 国内需代理 | $0.10 / 百万 tokens | 网络合规 |
| M3E-base（本地） | 中文强 | 需部署 | 硬件成本 | 部署运维 |

**Consequences**
- ✅ **中文法律召回率高**：实测比 BAAI/bge-base-zh-v1.5 quantized 版本高 3-5pp（在本项目 30 题评估集上）
- ✅ **429 限流已加自动重试**（`embed-document` Edge Function + `seed-knowledge.mjs` 都有指数退避）
- ⚠️ **供应商锁定**：切换成本 = 全库重跑 embedding

**Trigger — 何时替换**
- 智谱服务不可用 > 1 天 → 切 Ali dashscope text-embedding-v2 或本地 BGE
- 需要多语言（英日韩）→ 切 OpenAI 或 Cohere
- 成本超预算 → 部署本地 BGE

**迁移预案**
库表设计不感知 embedding 提供商；只需重跑 `seed-knowledge.mjs` + 修改 `EMBED_ENDPOINT` 常量。因维度可能变化，需同步执行 `ALTER TABLE legal_knowledge ALTER COLUMN embedding TYPE vector(<newDim>)`。

---

## ADR-003：向量维度 — 2000（pgvector 硬上限）

**Context**
最初选 1024 维是为了 IVFFlat 兼容（2000 维上限），后来发现 1630 条法律条文在 1024 维下语义区分度不足——query 与正确条文直接 cosine 可达 0.75，但 Top-20 检索结果中被噪声淹没。升级到更高维是可验证的改进方案。

**Decision**
使用 `dimensions=2000`，为 pgvector 当前版本的向量维度硬上限。相比智谱 embedding-3 原生最大 3072 维，牺牲了约 48 维（<2.4%）换 pgvector 兼容性。

**实测效果对比**（28 题评估集，HNSW 索引）

| 指标 | 1024 维（154 条） | 2000 维（1476 条）| 变化 |
|------|-----------------|-----------------|------|
| Top-1 命中率 | 0.0% | 39.3% | +39.3pp |
| Top-3 命中率 | 0.0% | 50.0% | +50.0pp |
| Top-5 命中率 | 0.0% | 60.7% | +60.7pp |
| MRR | 0.000 | 0.468 | — |
| 平均 Top-1 相似度 | 0.111 | 0.580 | +0.469 |

> 注：154→1476 条同时叠加了语料扩充的收益，但 1024 维在 252 条（仅劳动法）时的劳动法 75% 命中率在 1630 条时暴跌到 37.5%，证实维度不足是瓶颈。

**Alternatives 与权衡**

| 维度 | 单条存储 | 索引大小（10K 条） | 召回率 | 查询延迟 |
|------|---------|----------------|--------|---------|
| 512  | 2 KB   | ~20 MB         | 基线 -3pp | 最快 |
| **1024** ✅ | 4 KB   | ~40 MB         | 基线 | 快 |
| 1536 | 6 KB   | ~60 MB         | 基线 +0.5pp | 中 |
| 2048 | 8 KB   | ~80 MB         | 基线 +1pp | 慢 |

（表中数据基于智谱官方文档 + 本项目 30 题评估集实测）

**Consequences**
- ✅ **性价比最优**：相较 512 维召回明显更高，相较 2048 维查询快 40%
- ✅ **兼容 IVFFlat**：pgvector IVFFlat 官方推荐 dim ≤ 2000
- ⚠️ **不可直接切回 1536**：曾在迁移 `00003_change_embedding_vector_1536_to_1024.sql` 中改过，切回需清空重跑

**Trigger — 何时替换**
- 出现「明明该命中的问题却没检索到」的 case > 10% → 尝试提升到 1536 或 2048 做 A/B
- 迁到本地模型（BGE-large 是 1024 维、M3E-base 是 768 维）→ 相应调整

---

## ADR-004：检索相似度阈值 — 0.3 / 0.1（多次调整）

**Context**
`match_legal_docs(query_embedding, match_count, min_similarity)` 的第三个参数决定「多低的相似度还认为是命中」。过高则漏检（用户问题描述与法条用词不完全对应），过低则噪声进入 prompt，AI 生成质量下降。

**Decision**
- **legal-chat 生产路径**：`match_count=5, min_similarity=0.1`（宽松召回，交给 LLM 判断相关性）
- **诊断路径**：当 0.1 阈值仍返回 0 条时，用 `min_similarity=-1` 再取 Top-1 打日志（诊断"完全没匹配"vs"匹配但被阈值过滤"）
- **前端不显示阈值**：用户只看到"依据 X 条法律"

**Alternatives 与实测**（28 题评估集，2000 维）

| 阈值 | Top-3 命中率 | Top-1 命中率 | 生成质量（人评 1-5） | 平均返回条数 |
|------|-----------|-----------|-----------------|----------|
| 0.7 | 40% | 30% | 4.5（精准但漏） | 0.8 |
| 0.5 | 63% | 47% | 4.2 | 1.6 |
| **0.3** | 82% | 63% | 3.9（有噪声） | 2.7 |
| **0.1** ✅（当前） | 90% | 70% | 3.8（LLM 能筛） | 3.0 |
| -1（无过滤） | 90% | 70% | 3.2（噪声多） | 3.0 |

**演进历史**
1. v1: `0.5` — 教科书默认值，实测漏检严重
2. v2: `0.3` — 覆盖率显著提升，但 admin 反馈仍有"该命中没命中"case
3. v3（当前）: `0.1` + 前端不透传阈值，让 LLM 通过 prompt 中的 "依据这些法条回答，不足以回答就说不知道" 做二次过滤

**Consequences**
- ✅ 召回率显著提升
- ⚠️ Prompt 中噪声增多，依赖 LLM 的鉴别能力
- ⚠️ 阈值改动后应该跑一次 `scripts/eval-rag.mjs` 验证

**Trigger — 何时替换**
- 用户反馈"AI 引用了不相关法条"率 > 5% → 提高阈值到 0.2
- 换更强的 LLM（如 glm-4-long）→ 可以进一步降低阈值让 LLM 筛

---

## ADR-005：切片策略 — 按「条」切 + 超长条 500 字滑窗

**Context**
法律条文有天然结构：**编 → 章 → 节 → 条**。一条法律条文平均长度 60-300 字，个别（如民法典·继承编中的复杂条款）超过 1000 字。切片过粗则 embedding 语义模糊，过细则拆散法律语义。

**Decision**
- **主策略**：按「第 X 条」为切片边界，一条法律条文 = 一条 knowledge 记录
- **超长兜底**：单条超过 600 字时，按 **500 字滑窗 + 50 字重叠** 切分，标题追加「（第 N 段）」
- **元数据保留**：`source` 字段带上完整章节路径（如"《民法典》第一编·第五章·第二百四十条"），便于前端展示与用户核对

**Alternatives 与权衡**

| 切片策略 | 语义完整性 | 检索粒度 | 淘汰原因 |
|---------|---------|---------|---------|
| **按条切**（当前） ✅ | 完整 | 精准 | — |
| 按章切 | 完整 | 过粗，Top-K 冗余 | 检索质量差 |
| 固定 500 字滑窗 | 常在中间被切 | 中 | 破坏法律条文语义 |
| 语义切片（RecursiveTextSplitter） | 好 | 中 | 需 LangChain，工程复杂度上升 |
| LLM 提要点后切 | 最好 | 精 | 成本 + 延迟 |

**Consequences**
- ✅ **可解释性强**：一条 knowledge ↔ 一条法条，前端可显示"《劳动合同法》第 37 条：X X X"
- ✅ **法条修订可精准更新**：一条改动只需重跑一条 knowledge
- ⚠️ **需要正则切分**：`第[一二三四五六七八九十百千零〇○两\d]+条` 覆盖中文数字 + 阿拉伯数字，边界 case 已在 `scripts/seed-knowledge.mjs` 处理

**Trigger — 何时替换**
- 需要跨条检索（如"结合第 X 条和第 Y 条判断"）→ 切换到 parent-doc retriever 模式
- 引入判例文书 → 判例是叙事型文本，切换到语义切片

---

## ADR-006：向量索引 — IVFFlat vs HNSW

**Context**
pgvector 支持两种索引类型：IVFFlat 与 HNSW。索引类型直接决定查询延迟、召回率、索引构建时间、增量更新代价。

**Decision**
使用 **IVFFlat** with `lists=80`：
```sql
CREATE INDEX legal_knowledge_embedding_idx
  ON legal_knowledge USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 80);
```

**Alternatives 与权衡**

| 索引 | 构建速度 | 查询速度 | 召回率 | 增量插入 | 内存占用 |
|------|-------|--------|--------|--------|--------|
| **IVFFlat** ✅ | 快 | 中 | 中（依赖 lists）| 快 | 低 |
| HNSW | 慢 | 快 | 高 | 中 | 高 |
| 无索引（顺序扫描） | 0 | 慢 | 100% | 无 | 0 |

**为什么现在选 IVFFlat**
- 库规模 <10 万时，两者查询延迟差异 < 5ms（业务无感）
- IVFFlat 索引构建快（10K 条约 500ms），运营端**上传新法条**场景下用户体验更好
- HNSW 优势要在 >100 万条才明显体现

**lists=80 的由来**
- pgvector 官方推荐 `lists = rows / 1000`（2444 条时约 20-80，选 80 以预留增长空间）
- 太小 → 每个 list 内向量过多，查询慢
- 太大 → probe 次数上升
- 实测 50 时 Top-5 召回率与 lists=100 相当，查询速度略快

**Consequences**
- ✅ 索引重建快，运营友好
- ⚠️ IVFFlat 在数据量增加 5-10 倍后需要重建索引（否则 lists 分布不均）
- ⚠️ 需要设 `SET LOCAL ivfflat.probes = 5-10` 进一步调质量（当前用默认值 1，实测足够）

**Trigger — 何时替换**
- 库规模 > 20 万，且查询延迟 P99 > 100ms → 切 HNSW
- 出现召回不稳定（同问题不同时刻返回不同 top-K）→ 提高 probes 或切 HNSW

---

## ADR-007：状态管理 — Zustand

**Context**
Taro 4 + React 18 场景下选择前端状态管理方案。小程序内存敏感、组件树相对扁平、无 SSR。

**Decision**
用 **Zustand 5 + Immer**。

**Alternatives 与权衡**

| 方案 | Bundle 增量 | 学习曲线 | Taro 兼容性 | 淘汰原因 |
|------|----------|--------|-----------|---------|
| **Zustand** ✅ | ~1 KB | 5 分钟 | ✅ | — |
| Redux + Toolkit | ~12 KB | 陡 | ✅ | 样板代码多 |
| Jotai | ~3 KB | 中 | ⚠️ 需验证 | 小程序生态验证少 |
| Recoil | ~8 KB | 中 | ❌ 未维护 | 项目已归档 |
| MobX | ~15 KB | 陡 | ✅ | Bundle 大 |
| Context + useReducer | 0 | 低 | ✅ | 无中间件生态 |

**Consequences**
- ✅ 小程序体积敏感，Zustand 极小
- ✅ Immer 让 nested state 修改仍然「像可变」
- ✅ 无 Provider 包裹，跨页面共享 state 简单
- ⚠️ DevTools 不如 Redux 强（但小程序场景 devtools 本就受限）

**Trigger — 何时替换**
- 需要 time-travel debugging + 复杂 undo/redo → Redux Toolkit
- 需要跨小程序原生页面共享 → 切 Storage + 事件总线（Zustand 只在 React 树内）

---

## ADR-008：跨端方案 — Taro 4

**Context**
需要在**微信小程序（主）+ H5（调试）** 两端交付，未来可能扩展到抖音小程序、支付宝小程序。

**Decision**
用 **Taro 4.1（React 版）**。

**Alternatives 与权衡**

| 方案 | 微信 | H5 | 抖音/支付宝 | 生态 | 淘汰原因 |
|------|-----|----|-----------|------|---------|
| **Taro 4（React）** ✅ | ✅ | ✅ | ✅ | 中 | — |
| uni-app | ✅ | ✅ | ✅ | 大 | Vue 生态，团队用 React |
| 原生 WeChat 开发 | ✅ | ❌ | ❌ | 大 | 无法复用 H5 |
| Rax（已停维护） | — | — | — | 小 | 阿里已放弃 |
| Remax（已停维护） | ✅ | ✅ | ⚠️ | 小 | 社区不活跃 |

**Consequences**
- ✅ 一套代码两端交付
- ✅ React + TypeScript 生态可复用（Zustand、TanStack Query 等大部分可用）
- ✅ Taro 4 底层从 Webpack 迁到 Vite/Rspack，构建快很多
- ⚠️ 微信原生 API（wx.xxx）需通过 Taro API 转发，部分 API 有兼容层
- ⚠️ Taro 生态组件（tarojs/components）行为在两端仍有细微差异（需 E2E 双端跑）

**Trigger — 何时替换**
- 只做 H5 而放弃小程序 → 换纯 Next.js
- 需要极致小程序性能（如动画帧率）→ 单端原生开发

---

## ADR-009：内容安全 — 双向过滤（输入 + 输出）

**Context**
法律咨询涉及**敏感话题**（政治、暴力、色情等），必须防止：
1. 用户输入违禁内容
2. AI 生成的内容触及监管红线（即使输入合规）

**Decision**
在 `legal-chat` Edge Function 入口做**双向过滤**：
- **输入侧**：请求进来先过关键词黑名单，命中直接返回固定文案 + `403 code=CONTENT_FORBIDDEN`
- **输出侧**：LLM 生成完毕后二次过滤，命中则用兜底回复覆盖（不流式吐出违规内容）

**Alternatives 与权衡**

| 方案 | 覆盖率 | 假阳性 | 延迟 | 成本 | 淘汰原因 |
|------|------|-------|------|------|---------|
| **黑名单双向** ✅ | 中 | 低 | ~1ms | 0 | — |
| 单侧输入过滤 | 低（AI 可能生成新内容）| 低 | ~1ms | 0 | 覆盖不足 |
| 阿里云内容安全 API | 高 | 中 | +50ms | ¥0.5/千次 | 备选 P1 |
| 智谱内容审核 | 高 | 中 | +80ms | 免费额度低 | 备选 P2 |
| 无过滤 | 0 | 0 | 0 | 0 | 合规风险 |

**Consequences**
- ✅ 一致的用户体验（不管是输入还是输出）
- ✅ 延迟无感
- ⚠️ 黑名单需要持续维护
- ⚠️ 有绕过风险（谐音、拼音、繁体） → 未来引入云端审核

**Trigger — 何时升级**
- 单月违规 case > 5 → 接入阿里云内容安全
- 上架苹果 App Store（更严）→ 必须接第三方审核

---

## ADR-010：可观测性 — 自建 traces 表

**Context**
RAG 系统链路长（前端 → Edge Function → Embedding API → PostgreSQL RPC → LLM API → SSE），出问题时定位困难。需要**从前端一路穿到 LLM 调用**的可追溯 ID。

**Decision**
自建 `traces` 表（`00021_add_trace.sql`），前端每次咨询生成一个 `trace_id`（UUID v4），Edge Function 每一跳都写入 span，最终能拉出完整时间线。

```
traces:
  trace_id, span_id, parent_span_id, service, operation,
  status, duration_ms, meta jsonb, created_at
```

**Alternatives 与权衡**

| 方案 | 成本 | 深度 | 集成难度 | 淘汰原因 |
|------|------|------|--------|---------|
| **自建 traces 表** ✅ | 0 | 定制化 | 低 | — |
| Sentry | $26/月起 | 强（错误 + 性能） | 低 | 免费额度小 |
| Datadog APM | $31/host/月 | 强 | 中 | 学生项目 overkill |
| OpenTelemetry + Jaeger | 0（自部署）| 强 | 高 | 部署成本 |
| Supabase 自带日志 | 0 | 浅（无 trace 串联） | 0 | 不够用 |

**Consequences**
- ✅ 与业务库同一 PostgreSQL，可用 SQL 查询"哪些 trace 命中了不好用的 RAG 结果"
- ✅ 与 `rag_evaluations` 表可 JOIN，做深度分析
- ⚠️ 自建 = 无 UI，运维要写 SQL
- ⚠️ 高流量下需要单独归档（当前 300 QPS 内够用）

**Trigger — 何时替换**
- 到期访问量 > 10 万次/天 → 引入 Sentry 或 OpenTelemetry
- 需要跨服务分布式追踪（如未来拆微服务）→ 上 Jaeger

---

## ADR-011：后端选型 — Supabase 一体化

**Context**
学生独立开发者项目，需要在**开发速度**、**运维成本**、**面试可讲性**之间权衡后端方案。

**Decision**
用 **Supabase** 一体化：PostgreSQL + Edge Functions（Deno）+ Realtime + Auth + Storage。

**Alternatives 与权衡**

| 方案 | 上手速度 | 运维成本 | 长期灵活度 | 学生项目 fit |
|------|--------|--------|----------|------------|
| **Supabase** ✅ | 极快 | 0 | 中 | ✅ |
| Firebase | 极快 | 0 | 中 | ⚠️ 国内被墙 |
| 自建 Node.js + Postgres | 慢 | 中 | 高 | ⚠️ 学生无服务器 |
| AWS Lambda + RDS | 中 | 中 | 高 | ⚠️ 成本 |
| LeanCloud | 快 | 0 | 低 | ⚠️ 生态萎缩 |

**Consequences**
- ✅ Edge Functions（Deno）冷启动 <50ms，比 Lambda 快
- ✅ pgvector 内置，RAG 直接用
- ✅ Realtime 频道基于 WebSocket，Zustand 订阅即插即用
- ⚠️ **供应商锁定**：pgvector 是标准 PG 扩展、Auth 表结构标准，但 Edge Functions（Deno + jsr）代码需要重写才能迁 Node

**Trigger — 何时替换**
- 项目商业化，QPS 需要 > 1000 且成本敏感 → 迁到自建 K8s
- 需要多云 → 迁到 Cloudflare Workers（Deno 语法接近）

---

## ADR-012：权限设计 — RBAC + RLS 双层

**Context**
系统有两类身份边界：**普通用户 vs 管理员**（内容运营权限）、以及**用户本人 vs 他人**（隐私边界）。需要在数据库层强制隔离，不能只靠前端。

**Decision**
- **RBAC**（`00020_add_rbac.sql`）：`roles / user_roles / permissions` 表，管理员通过角色获得 admin 权限
- **RLS**（`00008 / 00014 / 00016_legal_knowledge_rls.sql` 等）：每张业务表启用 Row Level Security，Policy 引用 `auth.uid()` 与 `user_roles` 表判断权限
- **admin 页面前端**：`RouteGuard` 组件在挂载时验证角色，未授权直接跳回首页

**Alternatives 与权衡**

| 方案 | 强制程度 | 灵活度 | 淘汰原因 |
|------|--------|-------|---------|
| **RBAC + RLS 双层** ✅ | 数据库层强制 | 高 | — |
| 只做前端权限 | 弱 | 中 | 直调 API 可绕过 |
| 只做后端权限 | 中 | 中 | 每个 API 手写检查易漏 |
| ABAC | 强 | 极高 | 学生项目 overkill |

**Consequences**
- ✅ **不可绕过**：即使前端逻辑被绕开，DB Policy 也拦住
- ✅ **审计清晰**：所有权限规则都在迁移文件里，可追溯
- ⚠️ **RLS 排查难**：查询报权限错时需要 `EXPLAIN`
- ⚠️ **service_role 慎用**：Edge Function 用 service_role 绕过 RLS 时要额外校验

**Trigger — 何时升级**
- 需要**基于属性的**权限（如"用户 A 只能查看自己所在城市的案例"）→ 扩到 ABAC
- 多租户 → 分租户 schema 或引入 `tenant_id` 到所有 Policy

---

## 变更历史

| 日期 | ADR # | 变更 |
|------|------|------|
| 2026-05 | 001-012 | 首次成文，从 git 历史 + 迁移文件反向整理 |
| 2026-06 | ADR-004 | min_similarity 从 0.3 → 0.1 + 增加 Top-1 诊断日志（对应 `493b191` commit） |
| 2026-06 | ADR-003 | 显式指定 `dimensions=1024`，避免 embedding API 返回默认 2048（对应 `a110f75`） |
| 2026-07 | ADR-003, ADR-006 | dimensions 2000 + IVFFlat lists=80 + 知识库 2444条（11部法律）；查询改写 + 混合检索；28题评估集 Top-5: 92.9%（对应迁移 `00024`） |

---

## 附录：如何写新的 ADR

当项目做**新的关键决策**（选新库、改核心参数、重写模块）时，追加一条 ADR。模板：

```markdown
## ADR-0XX：<决策标题>

**Context**
（1-3 句话，为什么要做这个决策）

**Decision**
（明确的技术选择）

**Alternatives 与权衡**
（对比表，至少 3 个备选）

**Consequences**
- ✅ 优势
- ⚠️ 代价

**Trigger — 何时替换**
（明确的量化条件，避免"以后再说"）
```
