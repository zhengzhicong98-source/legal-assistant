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

/** 口语→法律术语查询扩展（缩小语义 gap）
 *  ⚠️ 保持与 supabase/functions/legal-chat/index.ts 的 QUERY_EXPANSIONS 同步！
 *  未来重构应把这份 pattern list 抽成单独的 JSON/JS 文件被两处共同 import。
 */
const QUERY_EXPANSIONS = [
  // ==== 劳动法：解除/辞退/纪律 ====
  [/朋友圈|吐槽|网上发言|发了.*不好|说.*坏话/,
   '在社交媒体发表不当言论 严重违反规章制度 用人单位单方解除劳动合同'],
  [/无故.*辞退|无故.*开除|被.*炒|被.*开掉|突然.*开除|随便.*辞退/,
   '违法解除劳动合同 用人单位单方解除 经济补偿金 赔偿金 二倍'],
  [/裁员|大裁员|经济性裁员|优化|变相裁员/,
   '经济性裁员 用人单位裁减人员 经济补偿 劳动合同法第四十一条'],
  [/试用期.*辞|试用期.*开|试用.*不合格/,
   '试用期不符合录用条件 用人单位解除劳动合同 试用期解除'],
  [/主动.*辞|想辞职|辞职.*通知|离职.*提前/,
   '劳动者单方解除劳动合同 提前三十日书面通知 试用期提前三日'],
  // ==== 劳动法：工资/加班/福利 ====
  [/拖欠.*工资|工资.*不发|工资.*拖|欠薪|讨薪/,
   '未及时足额支付劳动报酬 拖欠工资 劳动报酬'],
  [/加班|996|007|周末上班|节假日上班|超时工作/,
   '延长工作时间 加班工资 一点五倍 二倍 三倍 法定标准工作时间'],
  [/五险一金|社保|公积金|不交社保/,
   '社会保险 缴纳社会保险费 用人单位法定义务'],
  [/年终奖|十三薪|绩效奖金|奖金.*不发/,
   '劳动报酬 工资总额 奖金 用人单位应当支付'],
  [/病假|产假|婚假|年假|事假|带薪休假/,
   '休假权利 病假工资 产假 婚假 带薪年休假'],
  [/工伤|工作时.*受伤|上班.*出事|职业病/,
   '工伤保险 工伤认定 工伤赔偿 工伤保险条例'],
  [/竞业协议|竞业限制|离职.*不能去/,
   '竞业限制 经济补偿 违约金 劳动合同法第二十三条'],
  // ==== 帮信 / 刑事高频 ====
  [/帮.*取.*快递|帮.*取.*包裹|帮.*收货.*诈骗|帮.*送货.*诈骗/,
   '帮助信息网络犯罪活动 明知他人利用信息网络实施犯罪 提供帮助'],
  [/被诈骗|电信诈骗|网络诈骗|杀猪盘|骗钱/,
   '诈骗罪 电信网络诈骗 非法占有 数额较大'],
  [/借出银行卡|出租银行卡|卖卡/,
   '妨害信用卡管理 帮助信息网络犯罪 出借金融账户'],
  // ==== 租房：合同/押金/转租 ====
  [/押一付三|押一付几|押金.*月.*租金/,
   '租赁押金 预付租金 租赁合同 意思自治 合同自由'],
  [/涨房租|房租.*涨|加租|租金提高|提高租金/,
   '变更租金 租赁合同变更 调整租金 合同修改 协商一致'],
  [/退押金|不退押金|扣押金|押金.*拿不回/,
   '租赁合同 押金返还 承租人正常使用致自然损耗 出租人不得扣留'],
  [/转租|二房东|把房子.*租出去/,
   '承租人转租 出租人同意 未经同意 租赁合同解除'],
  // ==== 婚姻家庭 ====
  [/离婚|离婚.*财产|谁的钱|财产分割/,
   '夫妻共同财产 分割 离婚协议 婚前个人财产 民法典婚姻家庭编'],
  [/婚前财产|婚前买房|婚前存款/,
   '婚前个人财产 婚后共同财产 夫妻财产约定'],
  [/彩礼|返还彩礼|要彩礼/,
   '彩礼返还 婚约财产 民法典婚姻家庭编 司法解释'],
  [/家暴|家庭暴力|老公打人|老婆打人/,
   '家庭暴力 反家庭暴力法 人身安全保护令 离婚'],
  [/遗产|继承|遗嘱|老人去世.*财产/,
   '继承 法定继承 遗嘱继承 民法典继承编'],
  [/抚养费|抚养权|孩子归谁|离婚孩子/,
   '子女抚养权 抚养费 未成年子女 民法典婚姻家庭编'],
  // ==== 消费者/合同 ====
  [/网购|网上买|淘宝|京东|拼多多|七天无理由/,
   '消费者权益保护法 七日无理由退货 网络交易 电子商务法'],
  [/假货|山寨|以次充好|三无产品/,
   '欺诈行为 消费者权益保护法第五十五条 退一赔三 三倍赔偿 最低五百'],
  [/食品.*问题|吃出.*异物|食品安全|食物中毒/,
   '食品安全法 消费者权益 十倍赔偿 食品经营者'],
  [/预付卡|预付款|会员卡.*跑路|健身卡.*倒闭/,
   '预付款 预收款方式 消费者权益保护法第五十三条 经营者法定义务'],
  [/借钱|欠条|不还钱|要债|讨债|民间借贷/,
   '民间借贷 借款合同 债务 债权 民法典合同编 借款合同章'],
  [/定金|订金|违约金|合同违约/,
   '定金罚则 违约金 合同违约 民法典合同编'],
  // ==== 侵权 / 名誉 / 肖像 ====
  [/造谣|诽谤|说我坏话|散布谣言|名誉受损/,
   '名誉权 侵害名誉权 诽谤 民法典人格权编'],
  [/照片被用|肖像.*擅自|广告用我照片|我照片被印/,
   '肖像权 未经同意使用 民法典人格权编 侵害肖像权'],
  [/网暴|人肉|开盒|隐私被曝光|个人信息.*泄露/,
   '隐私权 个人信息保护 民法典人格权编 个人信息保护法'],
  [/打人|殴打|人身伤害|打伤|轻伤/,
   '侵权责任 人身损害赔偿 民法典侵权责任编 医疗费误工费'],
  [/交通事故|车祸|撞人|机动车事故/,
   '道路交通事故 机动车交通事故责任强制保险 侵权责任'],
  // ==== 学生 / 校园高频 ====
  [/实习|实习生|三方协议/,
   '实习生 劳动关系 三方协议 就业协议'],
  [/学历造假|简历造假|入职.*欺诈/,
   '欺诈订立劳动合同 劳动合同无效 用人单位解除'],
  [/校园贷|裸贷|培训贷|套路贷/,
   '非法金融活动 高利贷 民间借贷利率 套路贷'],
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
