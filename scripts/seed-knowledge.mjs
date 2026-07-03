#!/usr/bin/env node
// @ts-check
/**
 * seed-knowledge.mjs
 * ------------------------------------------------------------
 * 法律语料入库流水线
 * ------------------------------------------------------------
 * 输入：data/raw/*.txt|*.md（官方法律原文）
 * 输出：Supabase legal_knowledge 表（含 1024 维 embedding）
 *
 * 功能：
 *   - 按「第 X 条」切片（超长条按 500 字滑窗）
 *   - 幂等：按 (source, title 前 40 字) 去重
 *   - 断点续传：checkpoint 落盘到 data/.cache/seed-checkpoint.json
 *   - 429 退避：指数退避重试 embedding API
 *   - 进度可视化：吞吐 + ETA
 *   - dry-run：只统计不入库
 *
 * 用法：
 *   node scripts/seed-knowledge.mjs                          # 全量入库
 *   node scripts/seed-knowledge.mjs --dry-run                # 只切片不入库
 *   node scripts/seed-knowledge.mjs --file civil-code.txt    # 只处理一个文件
 *   node scripts/seed-knowledge.mjs --resume                 # 从断点续传
 *   node scripts/seed-knowledge.mjs --limit 100              # 只入库前 N 条（调试）
 *
 * 环境变量：
 *   SUPABASE_URL           必填
 *   SUPABASE_SERVICE_ROLE_KEY  必填（脚本直接写库，绕过 RLS）
 *   ZHIPU_API_KEY          必填（智谱 embedding-3）
 */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import process from 'node:process'

// ---- .env 加载（极简，无依赖） -----------------------------

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
  // 常见别名兜底
  process.env.SUPABASE_URL ??= process.env.TARO_APP_SUPABASE_URL
  process.env.ZHIPU_API_KEY ??= process.env.INTEGRATIONS_API_KEY
}

// ---- 常量 --------------------------------------------------

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..')
loadDotEnv(ROOT)
const RAW_DIR = join(ROOT, 'data', 'raw')
const CACHE_DIR = join(ROOT, 'data', '.cache')
const CHECKPOINT_FILE = join(CACHE_DIR, 'seed-checkpoint.json')

const CHUNK_MAX = 500      // 超长条文的切片长度
const CHUNK_OVERLAP = 50   // 重叠字数
const EMBED_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/embeddings'
const EMBED_MODEL = 'embedding-3'
const EMBED_DIM = 2000
const CONCURRENCY = 3        // embedding 并发（避免 429）
const MAX_RETRIES = 6        // 429/网络错误重试
const BACKOFF_BASE_MS = 800  // 指数退避基数

// 法律文件名 → category 映射（可扩展）
const CATEGORY_MAP = {
  'civil-code': '民法',
  'labor-contract-law': '劳动法',
  'labor-dispute-law': '劳动法',
  'consumer-protection-law': '消费者权益',
  'e-commerce-law': '消费者权益',
  'criminal-law': '刑事',
  'marriage-family-code': '婚姻家庭',
  'tort-law': '侵权',
  'rental-code': '租房',
  'labor-law': '劳动法',
  'public-security-admin-law': '治安',
  'hr-market-regulations': '劳动法',
  'labor-dispute-interpretation-1': '劳动法',
  'labor-dispute-interpretation-2': '劳动法',
}

// 法律文件名 → 官方全称
const LAW_TITLE_MAP = {
  'civil-code': '中华人民共和国民法典',
  'labor-contract-law': '中华人民共和国劳动合同法',
  'labor-dispute-law': '中华人民共和国劳动争议调解仲裁法',
  'consumer-protection-law': '中华人民共和国消费者权益保护法',
  'e-commerce-law': '中华人民共和国电子商务法',
  'criminal-law': '中华人民共和国刑法',
  'marriage-family-code': '中华人民共和国民法典·婚姻家庭编',
  'tort-law': '中华人民共和国民法典·侵权责任编',
  'rental-code': '中华人民共和国民法典·合同编·租赁合同章',
  'labor-law': '中华人民共和国劳动法',
  'public-security-admin-law': '中华人民共和国治安管理处罚法',
  'hr-market-regulations': '人力资源市场暂行条例',
  'labor-dispute-interpretation-1': '劳动争议司法解释（一）',
  'labor-dispute-interpretation-2': '劳动争议司法解释（二）',
}

// ---- CLI 参数 ----------------------------------------------

const argv = process.argv.slice(2)
const args = {
  dryRun: argv.includes('--dry-run'),
  resume: argv.includes('--resume'),
  file: pickArg('--file'),
  limit: Number(pickArg('--limit')) || Infinity,
  concurrency: Number(pickArg('--concurrency')) || CONCURRENCY,
}

function pickArg(name) {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : null
}

// ---- 工具函数 ----------------------------------------------

const log = {
  info: (m) => console.log(`\x1b[36m[info]\x1b[0m ${m}`),
  ok: (m) => console.log(`\x1b[32m[ ok ]\x1b[0m ${m}`),
  warn: (m) => console.log(`\x1b[33m[warn]\x1b[0m ${m}`),
  err: (m) => console.error(`\x1b[31m[err ]\x1b[0m ${m}`),
  step: (m) => console.log(`\n\x1b[35m▸\x1b[0m \x1b[1m${m}\x1b[0m`),
}

async function ensureDir(p) {
  if (!existsSync(p)) await mkdir(p, { recursive: true })
}

async function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_FILE)) return { processed: [], stats: {} }
  try {
    return JSON.parse(await readFile(CHECKPOINT_FILE, 'utf8'))
  } catch {
    return { processed: [], stats: {} }
  }
}

async function saveCheckpoint(ckpt) {
  await ensureDir(CACHE_DIR)
  await writeFile(CHECKPOINT_FILE, JSON.stringify(ckpt, null, 2), 'utf8')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ---- 切片器 ------------------------------------------------

/**
 * 把一部法律的原文切成 knowledge 数组
 * 输入：文件内容 + 文件基名（无扩展名，用于识别法律）
 * 输出：Array<{ title, source, category, content }>
 */
function sliceLawText(rawText, fileBase) {
  const lawTitle = LAW_TITLE_MAP[fileBase] || `《${fileBase}》`
  const category = CATEGORY_MAP[fileBase] || '通用'
  const shortTitle = lawTitle.replace(/^中华人民共和国/, '').replace(/《|》/g, '')

  // 归一化：全角空格 → 半角、多余空行压缩
  const text = rawText
    .replace(/\r\n/g, '\n')
    .replace(/　/g, ' ')
    .replace(/\n{3,}/g, '\n\n')

  // 跳过目录页：若文本中含"目录/目　　录"标记，从该处扫到第一个「第X条」为止的内容都是目录，
  // 目录里出现的"第一章/第一节 XXX"是无正文的孤立标题，不能污染章节上下文。
  const tocMarkerRe = /^\s*目\s*录\s*$/m
  const firstArticleRe = /^第[一二三四五六七八九十百千零〇○两\d]+条(?:之[一二三四五六七八九十]+)?[\s ]/m
  let bodyText = text
  const tocMatch = text.match(tocMarkerRe)
  if (tocMatch) {
    const afterToc = text.slice(tocMatch.index + tocMatch[0].length)
    const firstArt = afterToc.match(firstArticleRe)
    if (firstArt) {
      // 从"目录"下一行开始，找到目录之后的下一个「第X条」的行首之前所有内容
      const artOffsetInAfter = firstArt.index
      // 再往前回溯到该行所属章节的行首（如果有）
      const beforeArt = afterToc.slice(0, artOffsetInAfter)
      const chapterBeforeArt = beforeArt.match(/(第[一二三四五六七八九十百]+[编章][\s\S]*?)$/)
      const cutoffOffsetInAfter = chapterBeforeArt ? chapterBeforeArt.index : artOffsetInAfter
      bodyText = afterToc.slice(cutoffOffsetInAfter)
    }
  }

  // 识别章节标记（用于附加到 source）
  const lines = bodyText.split('\n')
  let currentPart = ''    // 编（第X编）
  let currentChapter = '' // 章（第X章）
  let currentSection = '' // 节（第X节）

  // 按「第X条」切片：先收集每条的行范围
  const articles = [] // { articleNo, articleTitle, contentLines, part, chapter, section }
  let cur = null

  const articleReg = /^第[一二三四五六七八九十百千零〇○两\d]+条(?:之[一二三四五六七八九十]+)?[\s ]/

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // 更新章节上下文
    // 遇到新的 编 → 清空 章 + 节；遇到新的 章 → 清空 节。
    // 这样即便目录页里出现「第X章/第X节」的裸标题，也不会污染后续条文的 source。
    if (/^第[一二三四五六七八九十百]+编/.test(line) && !articleReg.test(line)) {
      currentPart = line
      currentChapter = ''
      currentSection = ''
      continue
    }
    if (/^第[一二三四五六七八九十百]+分编/.test(line)) {
      currentPart = line
      currentChapter = ''
      currentSection = ''
      continue
    }
    if (/^第[一二三四五六七八九十百]+章/.test(line) && !articleReg.test(line)) {
      currentChapter = line
      currentSection = ''
      continue
    }
    if (/^第[一二三四五六七八九十百]+节/.test(line) && !articleReg.test(line)) {
      currentSection = line
      continue
    }

    if (articleReg.test(line)) {
      // 新一条开始
      if (cur) articles.push(cur)
      const m = line.match(/^(第[一二三四五六七八九十百千零〇○两\d]+条(?:之[一二三四五六七八九十]+)?)[\s ]+(.*)$/)
      cur = {
        articleNo: m ? m[1] : line.split(/\s/)[0],
        contentLines: m && m[2] ? [m[2]] : [line],
        part: currentPart,
        chapter: currentChapter,
        section: currentSection,
      }
    } else if (cur) {
      cur.contentLines.push(line)
    }
    // else：条文开始前的目录/序言忽略
  }
  if (cur) articles.push(cur)

  // 转成 knowledge 记录
  const results = []
  for (const a of articles) {
    const body = a.contentLines.join('\n').trim()
    if (!body || body.length < 8) continue

    const scopeParts = [a.part, a.chapter, a.section].filter(Boolean).join('·')
    const source = scopeParts
      ? `《${shortTitle}》${scopeParts}·${a.articleNo}`
      : `《${shortTitle}》${a.articleNo}`

    const titleHead = body.replace(/\s/g, '').slice(0, 20)
    const baseTitle = `${a.articleNo}：${titleHead}`

    if (body.length <= CHUNK_MAX + 100) {
      results.push({
        title: baseTitle,
        source,
        category,
        content: body,
      })
    } else {
      // 超长条按滑窗切
      let start = 0
      let idx = 1
      while (start < body.length) {
        const end = Math.min(start + CHUNK_MAX, body.length)
        results.push({
          title: `${baseTitle}（第${idx}段）`,
          source,
          category,
          content: body.slice(start, end),
        })
        if (end >= body.length) break
        start += CHUNK_MAX - CHUNK_OVERLAP
        idx++
      }
    }
  }

  return results
}

// ---- Embedding + 上传 -------------------------------------

async function embedText(text, apiKey, attempt = 0) {
  try {
    const res = await fetch(EMBED_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: text,
        dimensions: EMBED_DIM,
      }),
    })

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= MAX_RETRIES) throw new Error(`Embedding ${res.status} 超过最大重试次数`)
      const wait = BACKOFF_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 300)
      log.warn(`  ↳ ${res.status}，${wait}ms 后重试（第 ${attempt + 1} 次）`)
      await sleep(wait)
      return embedText(text, apiKey, attempt + 1)
    }

    if (!res.ok) {
      const t = await res.text()
      throw new Error(`Embedding API ${res.status}: ${t}`)
    }

    const data = await res.json()
    const vec = data?.data?.[0]?.embedding
    if (!Array.isArray(vec) || vec.length !== EMBED_DIM) {
      throw new Error(`Embedding 返回维度异常：期望 ${EMBED_DIM}，实际 ${vec?.length}`)
    }
    return vec
  } catch (err) {
    if (attempt < MAX_RETRIES && (err.name === 'AbortError' || /network|fetch/i.test(String(err.message)))) {
      const wait = BACKOFF_BASE_MS * 2 ** attempt
      log.warn(`  ↳ 网络异常，${wait}ms 后重试：${err.message}`)
      await sleep(wait)
      return embedText(text, apiKey, attempt + 1)
    }
    throw err
  }
}

async function upsertKnowledge(supabaseUrl, serviceKey, record, embedding) {
  const url = `${supabaseUrl}/rest/v1/legal_knowledge`
  const body = {
    title: record.title,
    source: record.source,
    category: record.category,
    content: record.content,
    embedding: `[${embedding.join(',')}]`,
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`插入失败 ${res.status}: ${t}`)
  }
  const arr = await res.json()
  return arr?.[0]?.id
}

/** 幂等检查：库中是否已有相同 (source, title 前 40 字) */
async function existsInDb(supabaseUrl, serviceKey, source, title) {
  const q = new URL(`${supabaseUrl}/rest/v1/legal_knowledge`)
  q.searchParams.set('select', 'id')
  q.searchParams.set('source', `eq.${source}`)
  q.searchParams.set('title', `eq.${title}`)
  q.searchParams.set('limit', '1')
  const res = await fetch(q, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  if (!res.ok) return false
  const arr = await res.json()
  return Array.isArray(arr) && arr.length > 0
}

// ---- 并发池（简易 p-limit） --------------------------------

function pLimit(n) {
  const queue = []
  let active = 0
  const next = () => {
    if (active >= n || !queue.length) return
    active++
    const { fn, resolve, reject } = queue.shift()
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--
        next()
      })
  }
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject })
      next()
    })
}

// ---- 主流程 ------------------------------------------------

async function main() {
  log.step('法律语料入库流水线 启动')
  console.log(`  dry-run: ${args.dryRun}`)
  console.log(`  resume:  ${args.resume}`)
  console.log(`  file:    ${args.file || '(全部)'}`)
  console.log(`  limit:   ${args.limit === Infinity ? '(无限制)' : args.limit}`)
  console.log(`  concurrency: ${args.concurrency}`)

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ZHIPU_API_KEY } = process.env
  if (!args.dryRun) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      log.err('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 环境变量')
      process.exit(1)
    }
    if (!ZHIPU_API_KEY) {
      log.err('缺少 ZHIPU_API_KEY 环境变量')
      process.exit(1)
    }
  }

  // ---- 1. 扫描 data/raw ----
  log.step('第 1 步：扫描原始语料')
  if (!existsSync(RAW_DIR)) {
    log.err(`目录不存在：${RAW_DIR}`)
    process.exit(1)
  }
  const allFiles = (await readdir(RAW_DIR)).filter((f) => /\.(txt|md)$/i.test(f))
  const files = args.file ? allFiles.filter((f) => f === args.file) : allFiles
  if (!files.length) {
    log.err(`data/raw 下没有可处理的 .txt/.md 文件${args.file ? `（--file ${args.file} 未匹配）` : ''}`)
    log.info('请先按 data/raw/README.md 说明放入法律原文文件')
    process.exit(1)
  }
  log.ok(`发现 ${files.length} 个文件：${files.join(', ')}`)

  // ---- 2. 切片 ----
  log.step('第 2 步：切片')
  const allRecords = []
  const perFileStats = {}
  for (const f of files) {
    const base = basename(f, extname(f))
    const raw = await readFile(join(RAW_DIR, f), 'utf8')
    const records = sliceLawText(raw, base)
    perFileStats[f] = records.length
    log.info(`  ${f}: 切出 ${records.length} 条`)
    for (const r of records) allRecords.push(r)
  }
  log.ok(`合计 ${allRecords.length} 条`)

  // ---- 3. dry-run 模式 ----
  if (args.dryRun) {
    log.step('DRY-RUN 结束（未入库）')
    console.log('\n每部法律条数统计:')
    for (const [f, n] of Object.entries(perFileStats)) {
      console.log(`  ${f.padEnd(35)} ${n}`)
    }
    console.log(`\n示例前 3 条:`)
    for (const r of allRecords.slice(0, 3)) {
      console.log(`  ─ title:    ${r.title}`)
      console.log(`    source:   ${r.source}`)
      console.log(`    category: ${r.category}`)
      console.log(`    content:  ${r.content.slice(0, 60)}...\n`)
    }
    return
  }

  // ---- 4. 断点续传 ----
  const ckpt = args.resume ? await loadCheckpoint() : { processed: [], stats: {} }
  const processedSet = new Set(ckpt.processed)
  if (args.resume) {
    log.info(`  断点：已处理 ${processedSet.size} 条`)
  }

  // ---- 5. 入库（并发 + 限速） ----
  log.step(`第 3 步：向量化 + 入库（并发 ${args.concurrency}）`)
  const limit = pLimit(args.concurrency)
  const startTime = Date.now()
  let done = 0
  let inserted = 0
  let skipped = 0
  let failed = 0
  const total = Math.min(allRecords.length, args.limit)

  const tasks = allRecords.slice(0, args.limit).map((rec, idx) => {
    const key = `${rec.source}|${rec.title}`
    return limit(async () => {
      done++
      // 断点跳过
      if (processedSet.has(key)) {
        skipped++
        return
      }
      // DB 幂等
      try {
        const exists = await existsInDb(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, rec.source, rec.title)
        if (exists) {
          skipped++
          processedSet.add(key)
          if (done % 20 === 0) await saveCheckpoint({ processed: [...processedSet], stats: { inserted, skipped, failed } })
          return
        }
      } catch (e) {
        log.warn(`  幂等检查失败（继续尝试插入）：${e.message}`)
      }

      // 向量化
      const text = `${rec.title}\n${rec.content}`
      try {
        const vec = await embedText(text, ZHIPU_API_KEY)
        await upsertKnowledge(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, rec, vec)
        inserted++
        processedSet.add(key)
      } catch (e) {
        failed++
        log.err(`  [${idx}] 失败：${rec.title} — ${e.message}`)
      }

      // 进度输出
      if (done % 10 === 0 || done === total) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = done / elapsed
        const eta = rate > 0 ? Math.round((total - done) / rate) : 0
        process.stdout.write(
          `\r  进度 ${done}/${total} · ins=${inserted} skip=${skipped} fail=${failed} · ${rate.toFixed(1)}/s · ETA ${eta}s   `,
        )
      }
      if (done % 30 === 0) {
        await saveCheckpoint({ processed: [...processedSet], stats: { inserted, skipped, failed } })
      }
    })
  })

  await Promise.all(tasks)
  await saveCheckpoint({ processed: [...processedSet], stats: { inserted, skipped, failed } })
  process.stdout.write('\n')

  // ---- 6. 总结 ----
  log.step('完成')
  const seconds = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`  总计    : ${total}`)
  console.log(`  新入库  : ${inserted}`)
  console.log(`  已存在  : ${skipped}`)
  console.log(`  失败    : ${failed}`)
  console.log(`  耗时    : ${seconds}s`)
  console.log(`  平均    : ${(total / Number(seconds)).toFixed(1)} 条/s`)

  if (failed > 0) {
    log.warn(`有 ${failed} 条失败，重新运行 --resume 可续传`)
    process.exit(2)
  }
}

main().catch((err) => {
  log.err(err.stack || err.message)
  process.exit(1)
})
