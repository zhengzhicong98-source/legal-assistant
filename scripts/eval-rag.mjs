#!/usr/bin/env node
// @ts-check
/**
 * eval-rag.mjs
 * ------------------------------------------------------------
 * RAG 检索质量评估器
 * ------------------------------------------------------------
 * 输入：data/eval/eval-set.jsonl（评估集，每行一条 QA）
 * 输出：控制台报告 + data/eval/latest-report.json（可写入 README）
 *
 * 评估指标：
 *   - Top-K 命中率（HitRate@K）：期望法条是否出现在 Top-K
 *   - MRR（Mean Reciprocal Rank）：命中位置的倒数均值
 *   - 平均 Top-1 相似度：反映匹配置信度
 *   - 分类命中率：按 category 分组
 *
 * 用法：
 *   node scripts/eval-rag.mjs                     # 全量评估
 *   node scripts/eval-rag.mjs --k 5               # Top-K 阈值
 *   node scripts/eval-rag.mjs --tag baseline      # 打标签存档
 *   node scripts/eval-rag.mjs --diff baseline     # 与基线对比
 *
 * 环境变量：与 seed-knowledge.mjs 相同
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

// ---- .env 加载 --------------------------------------------
function loadDotEnv(rootDir) {
  const envPath = join(rootDir, '.env')
  if (!existsSync(envPath)) return
  const raw = readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    const eq = s.indexOf('=')
    if (eq < 0) continue
    const k = s.slice(0, eq).trim()
    let v = s.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!(k in process.env)) process.env[k] = v
  }
  process.env.SUPABASE_URL ??= process.env.TARO_APP_SUPABASE_URL
  process.env.ZHIPU_API_KEY ??= process.env.INTEGRATIONS_API_KEY
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..')
loadDotEnv(ROOT)
const EVAL_FILE = join(ROOT, 'data', 'eval', 'eval-set.jsonl')
const REPORT_DIR = join(ROOT, 'data', 'eval')

const EMBED_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/embeddings'
const EMBED_MODEL = 'embedding-3'
const EMBED_DIM = 2000

const argv = process.argv.slice(2)
const args = {
  k: Number(pickArg('--k')) || 5,
  tag: pickArg('--tag'),
  diff: pickArg('--diff'),
  minSimilarity: Number(pickArg('--min-similarity')) || 0.1,
}
function pickArg(name) {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : null
}

const log = {
  info: (m) => console.log(`\x1b[36m[info]\x1b[0m ${m}`),
  ok: (m) => console.log(`\x1b[32m[ ok ]\x1b[0m ${m}`),
  warn: (m) => console.log(`\x1b[33m[warn]\x1b[0m ${m}`),
  err: (m) => console.error(`\x1b[31m[err ]\x1b[0m ${m}`),
  step: (m) => console.log(`\n\x1b[35m▸\x1b[0m \x1b[1m${m}\x1b[0m`),
}

/** 口语→法律术语查询扩展（缩小语义 gap） */
const QUERY_EXPANSIONS = [
  [/朋友圈|吐槽|网上发言|发了.*不好|说.*坏话/,
   '在社交媒体发表不当言论 严重违反规章制度 用人单位单方解除劳动合同'],
  [/帮.*取.*快递|帮.*取.*包裹|帮.*收货.*诈骗|帮.*送货.*诈骗/,
   '帮助信息网络犯罪活动 明知他人利用信息网络实施犯罪 提供帮助'],
  [/押一付三|押一付几|押金.*月.*租金/,
   '租赁押金 预付租金 租赁合同 意思自治 合同自由'],
  [/涨房租|房租.*涨|加租|租金提高|提高租金/,
   '变更租金 租赁合同变更 调整租金 合同修改 协商一致'],
  [/拖欠.*工资|工资.*不发|工资.*拖/,
   '未及时足额支付劳动报酬 拖欠工资 劳动报酬'],
  [/无故.*辞退|无故.*开除|被.*炒|被.*开掉/,
   '违法解除劳动合同 用人单位单方解除 经济补偿金'],
]

function expandQuery(query) {
  let expanded = query
  for (const [pattern, terms] of QUERY_EXPANSIONS) {
    if (pattern.test(query)) {
      expanded += ' ' + terms
      break // 只匹配第一条，避免追加过多噪音
    }
  }
  return expanded
}

async function embedQuery(text, apiKey) {
  const res = await fetch(EMBED_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: text, dimensions: EMBED_DIM }),
  })
  if (!res.ok) throw new Error(`Embedding ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data?.data?.[0]?.embedding
}

async function searchRag(supabaseUrl, serviceKey, vec, k, minSim, queryText) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/match_legal_docs_hybrid`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      query_embedding: `[${vec.join(',')}]`,
      query_text: queryText || '',
      match_count: k,
      min_similarity: minSim,
    }),
  })
  if (!res.ok) throw new Error(`RPC ${res.status}: ${await res.text()}`)
  return await res.json()
}

/** 判断 hit：期望关键词是否全部出现在 source 或 title 中 */
function isHit(row, expectedTokens) {
  const text = `${row.source || ''}\n${row.title || ''}\n${row.content || ''}`
  return expectedTokens.every((tok) => text.includes(tok))
}

async function loadEvalSet() {
  if (!existsSync(EVAL_FILE)) {
    log.err(`评估集不存在：${EVAL_FILE}`)
    process.exit(1)
  }
  const raw = await readFile(EVAL_FILE, 'utf8')
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .map((l, i) => {
      try {
        return JSON.parse(l)
      } catch (e) {
        log.warn(`  eval-set.jsonl 第 ${i + 1} 行 JSON 解析失败，跳过`)
        return null
      }
    })
    .filter(Boolean)
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

async function main() {
  log.step('RAG 评估器 启动')

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ZHIPU_API_KEY } = process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ZHIPU_API_KEY) {
    log.err('缺少必要环境变量')
    process.exit(1)
  }

  const evalSet = await loadEvalSet()
  log.ok(`加载 ${evalSet.length} 条评估问题`)

  // 库大小
  const countRes = await fetch(
    `${SUPABASE_URL}/rest/v1/legal_knowledge?select=id&limit=1`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Prefer: 'count=exact' } },
  )
  const totalDocs = Number(countRes.headers.get('content-range')?.split('/')?.[1]) || 0
  log.info(`知识库现有条数：${totalDocs}`)

  log.step(`第 2 步：跑评估（K=${args.k}, min_sim=${args.minSimilarity}）`)

  const perCase = []
  for (let i = 0; i < evalSet.length; i++) {
    const q = evalSet[i]
    process.stdout.write(`\r  进度 ${i + 1}/${evalSet.length} — ${q.id}`.padEnd(80))
    try {
      const expanded = expandQuery(q.question)
      const vec = await embedQuery(expanded, ZHIPU_API_KEY)
      const rows = await searchRag(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, vec, args.k, args.minSimilarity, expanded)

      const expected = q.expected_source_contains || []
      let hitRank = -1
      for (let j = 0; j < rows.length; j++) {
        if (isHit(rows[j], expected)) {
          hitRank = j + 1
          break
        }
      }
      const top1Sim = rows[0]?.similarity ?? 0
      perCase.push({
        id: q.id,
        category: q.category,
        question: q.question,
        expected,
        top1Source: rows[0]?.source || '',
        top1Sim: Number(top1Sim.toFixed(4)),
        hitRank,
        rowsReturned: rows.length,
      })
    } catch (e) {
      log.err(`  ${q.id} 失败：${e.message}`)
      perCase.push({ id: q.id, category: q.category, error: e.message, hitRank: -1, top1Sim: 0 })
    }
  }
  process.stdout.write('\n')

  // ---- 计算指标 ----
  const total = perCase.length
  const hit1 = perCase.filter((c) => c.hitRank === 1).length
  const hit3 = perCase.filter((c) => c.hitRank > 0 && c.hitRank <= 3).length
  const hitK = perCase.filter((c) => c.hitRank > 0 && c.hitRank <= args.k).length
  const miss = perCase.filter((c) => c.hitRank === -1)
  const mrr =
    perCase
      .filter((c) => c.hitRank > 0)
      .reduce((s, c) => s + 1 / c.hitRank, 0) / total
  const sims = perCase.map((c) => c.top1Sim).filter((s) => s > 0)
  const avgSim = sims.length ? sims.reduce((a, b) => a + b, 0) / sims.length : 0
  const medSim = sims.length ? median(sims) : 0

  // 按类目分组
  const byCategory = {}
  for (const c of perCase) {
    if (!byCategory[c.category]) byCategory[c.category] = { total: 0, hit: 0 }
    byCategory[c.category].total++
    if (c.hitRank > 0) byCategory[c.category].hit++
  }

  // ---- 报告 ----
  log.step('评估报告')
  console.log(`\n  知识库条数    : ${totalDocs}`)
  console.log(`  评估问题数    : ${total}`)
  console.log(`  Top-1 命中率  : ${((hit1 / total) * 100).toFixed(1)}%  (${hit1}/${total})`)
  console.log(`  Top-3 命中率  : ${((hit3 / total) * 100).toFixed(1)}%  (${hit3}/${total})`)
  console.log(`  Top-${args.k} 命中率  : ${((hitK / total) * 100).toFixed(1)}%  (${hitK}/${total})`)
  console.log(`  MRR           : ${mrr.toFixed(4)}`)
  console.log(`  平均 Top-1 相似度: ${avgSim.toFixed(4)}`)
  console.log(`  中位 Top-1 相似度: ${medSim.toFixed(4)}`)

  console.log(`\n  按类目命中率：`)
  for (const [cat, s] of Object.entries(byCategory)) {
    console.log(`    ${cat.padEnd(10)} ${((s.hit / s.total) * 100).toFixed(1)}%  (${s.hit}/${s.total})`)
  }

  if (miss.length) {
    console.log(`\n  未命中 case（${miss.length} 条，前 5）:`)
    for (const c of miss.slice(0, 5)) {
      console.log(`    [${c.id}] ${c.question}`)
      console.log(`       期望: ${(c.expected || []).join(' + ')}`)
      console.log(`       实得: ${c.top1Source || '(无)'}`)
    }
  }

  // ---- 保存报告 ----
  const report = {
    timestamp: new Date().toISOString(),
    tag: args.tag || 'ad-hoc',
    kbSize: totalDocs,
    k: args.k,
    minSimilarity: args.minSimilarity,
    metrics: {
      total,
      hit1,
      hit3,
      hitK,
      hit1Rate: hit1 / total,
      hit3Rate: hit3 / total,
      hitKRate: hitK / total,
      mrr,
      avgTop1Sim: avgSim,
      medTop1Sim: medSim,
    },
    byCategory,
    perCase,
  }

  await mkdir(REPORT_DIR, { recursive: true })
  const latestPath = join(REPORT_DIR, 'latest-report.json')
  await writeFile(latestPath, JSON.stringify(report, null, 2))
  log.ok(`报告已存：${latestPath}`)

  if (args.tag) {
    const taggedPath = join(REPORT_DIR, `report-${args.tag}.json`)
    await writeFile(taggedPath, JSON.stringify(report, null, 2))
    log.ok(`基线快照：${taggedPath}`)
  }

  // ---- diff 模式 ----
  if (args.diff) {
    const basePath = join(REPORT_DIR, `report-${args.diff}.json`)
    if (!existsSync(basePath)) {
      log.warn(`基线报告不存在：${basePath}，跳过 diff`)
      return
    }
    const base = JSON.parse(await readFile(basePath, 'utf8'))
    log.step(`对比基线：${args.diff}`)
    const delta = (a, b) => {
      const d = a - b
      const sign = d > 0 ? '+' : ''
      return `${sign}${(d * 100).toFixed(1)}pp`
    }
    console.log(`  知识库    : ${base.kbSize} → ${totalDocs}  (${totalDocs - base.kbSize > 0 ? '+' : ''}${totalDocs - base.kbSize})`)
    console.log(`  Top-1 命中: ${(base.metrics.hit1Rate * 100).toFixed(1)}% → ${(report.metrics.hit1Rate * 100).toFixed(1)}%  (${delta(report.metrics.hit1Rate, base.metrics.hit1Rate)})`)
    console.log(`  Top-3 命中: ${(base.metrics.hit3Rate * 100).toFixed(1)}% → ${(report.metrics.hit3Rate * 100).toFixed(1)}%  (${delta(report.metrics.hit3Rate, base.metrics.hit3Rate)})`)
    console.log(`  MRR       : ${base.metrics.mrr.toFixed(3)} → ${report.metrics.mrr.toFixed(3)}`)
    console.log(`  平均相似度: ${base.metrics.avgTop1Sim.toFixed(3)} → ${report.metrics.avgTop1Sim.toFixed(3)}`)
  }
}

main().catch((err) => {
  log.err(err.stack || err.message)
  process.exit(1)
})
