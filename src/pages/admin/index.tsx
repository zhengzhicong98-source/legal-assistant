import { useState, useCallback, useEffect, useRef } from 'react'
import Taro from '@tarojs/taro'
import { supabase } from '@/client/supabase'
import { getLegalKnowledgeDocs, getPendingEmbeddingDocs, deleteLegalKnowledge } from '@/db/api'
import { callEdgeFunction } from '@/utils/callEdgeFunction'
import type { LegalKnowledge } from '@/db/types'

const CATEGORIES = ['通用', '劳动法', '租房', '消费者权益', '合同法', '其他']

// 从一行文本中解析标题、来源和内容
function parseLine(line: string): { title: string; source: string; content: string } | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  if (trimmed.includes('||')) {
    const parts = trimmed.split('||')
    if (parts.length >= 3) {
      return { title: parts[0].trim(), source: parts[1].trim(), content: parts.slice(2).join('||').trim() }
    }
    if (parts.length === 2) {
      return { title: parts[0].trim(), source: '', content: parts[1].trim() }
    }
  }

  const articleMatch = trimmed.match(/^(第[^\s：:，。]{1,8}[条款项目])[：:]\s*(.+)/)
  if (articleMatch) {
    return { title: articleMatch[1], source: '', content: trimmed }
  }

  const autoTitle = trimmed.length > 20 ? `${trimmed.slice(0, 20)}…` : trimmed
  return { title: autoTitle, source: '', content: trimmed }
}

export default function Admin() {
  const [docs, setDocs] = useState<LegalKnowledge[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState<'single' | 'batch'>('single')
  const [deleting, setDeleting] = useState<string | null>(null)

  // 单条表单
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [category, setCategory] = useState('通用')
  const [content, setContent] = useState('')

  // 批量导入
  const [batchText, setBatchText] = useState('')
  const [batchCategory, setBatchCategory] = useState('通用')
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; label: string } | null>(null)
  const [batchResult, setBatchResult] = useState<{ success: number; fail: number } | null>(null)

  // 一键向量化
  const [vectorizing, setVectorizing] = useState(false)
  const [vectorProgress, setVectorProgress] = useState<{ current: number; total: number } | null>(null)
  const vectorAbortRef = useRef(false)
  // 用于实时倒计时的开始时间戳和速率快照（ms/条）
  const vectorStartTimeRef = useRef<number>(0)
  const [estimatedSecsLeft, setEstimatedSecsLeft] = useState<number | null>(null)

  const loadDocs = useCallback(async () => {
    setLoading(true)
    const data = await getLegalKnowledgeDocs()
    setDocs(data)
    setLoading(false)
  }, [])

  useEffect(() => { loadDocs() }, [loadDocs])

  // 实时订阅知识库变更
  useEffect(() => {
    const channel = supabase
      .channel('admin-legal-knowledge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'legal_knowledge' }, () => {
        loadDocs()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadDocs])

  // 统计
  const totalCount = docs.length
  const embeddedCount = docs.filter(d => d.has_embedding).length
  const pendingCount = totalCount - embeddedCount

  // ===== 一键向量化 =====
  const handleVectorizeAll = async () => {
    const pending = await getPendingEmbeddingDocs()
    if (pending.length === 0) {
      Taro.showToast({ title: '全部已向量化', icon: 'success' })
      return
    }

    setVectorizing(true)
    vectorAbortRef.current = false
    vectorStartTimeRef.current = Date.now()
    setEstimatedSecsLeft(null)
    setVectorProgress({ current: 0, total: pending.length })

    let success = 0
    let fail = 0
    let firstErrMsg = ''

    for (let i = 0; i < pending.length; i++) {
      if (vectorAbortRef.current) break
      const doc = pending[i]
      setVectorProgress({ current: i + 1, total: pending.length })

      // 每处理完一条，根据实际速率重新计算剩余时间
      if (i >= 1) {
        const elapsed = Date.now() - vectorStartTimeRef.current
        const avgMs = elapsed / i
        const remaining = pending.length - i
        setEstimatedSecsLeft(Math.ceil((avgMs * remaining) / 1000))
      }

      // 直接使用 callEdgeFunction，绕过 supabase.functions.invoke 的 body 序列化兼容问题
      const result = await callEdgeFunction('embed-document', {
        body: { vectorize_only: true, id: doc.id, title: doc.title, content: doc.content },
      })
      if (result.error) {
        console.error('向量化失败:', result.error.message)
        fail++
        if (!firstErrMsg) firstErrMsg = result.error.message
      } else {
        success++
        setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, has_embedding: true } : d))
      }

      // 适当限速，避免 API 限流
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    setVectorizing(false)
    setVectorProgress(null)
    setEstimatedSecsLeft(null)

    if (fail === 0) {
      Taro.showToast({ title: `${success} 条向量化完成`, icon: 'success' })
    } else if (success === 0) {
      // 全部失败，弹出详细错误
      Taro.showModal({
        title: '向量化失败',
        content: `全部 ${fail} 条失败。错误信息：${firstErrMsg.slice(0, 100)}`,
        showCancel: false,
        confirmText: '知道了',
      })
    } else {
      Taro.showToast({ title: `完成：${success} 成功 ${fail} 失败`, icon: 'none' })
    }
  }

  const handleStopVectorize = () => {
    vectorAbortRef.current = true
    setEstimatedSecsLeft(null)
    Taro.showToast({ title: '已停止', icon: 'none' })
  }

  /** 将秒数格式化为「X 分 XX 秒」或「XX 秒」 */
  const formatEta = (secs: number): string => {
    if (secs <= 0) return '即将完成'
    if (secs < 60) return `约 ${secs} 秒`
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return s === 0 ? `约 ${m} 分钟` : `约 ${m} 分 ${s} 秒`
  }

  // ===== 单条上传 =====
  const handleUpload = async () => {
    if (!title.trim() || !content.trim()) {
      Taro.showToast({ title: '标题和内容不能为空', icon: 'none' })
      return
    }
    setUploading(true)
    try {
      const { data, error } = await callEdgeFunction<{ inserted_count?: number }>('embed-document', {
        body: { title: title.trim(), source: source.trim(), category, content: content.trim() },
      })
      if (error) throw new Error(error.message)
      Taro.showToast({ title: `已添加 ${data?.inserted_count ?? 1} 条记录`, icon: 'success' })
      setTitle('')
      setSource('')
      setCategory('通用')
      setContent('')
      setShowForm(false)
      loadDocs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '上传失败'
      Taro.showToast({ title: msg.slice(0, 20), icon: 'none' })
    } finally {
      setUploading(false)
    }
  }

  // ===== 批量导入 =====
  const handleBatchImport = async () => {
    const lines = batchText.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    if (lines.length === 0) {
      Taro.showToast({ title: '请粘贴法律条文内容', icon: 'none' })
      return
    }

    const parsed = lines.map(parseLine).filter((p): p is NonNullable<typeof p> => p !== null)
    if (parsed.length === 0) {
      Taro.showToast({ title: '未识别到有效条文', icon: 'none' })
      return
    }

    setUploading(true)
    setBatchResult(null)
    setBatchProgress({ current: 0, total: parsed.length, label: '导入' })

    let success = 0
    let fail = 0

    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i]
      setBatchProgress({ current: i + 1, total: parsed.length, label: '导入' })
      try {
        const { error } = await callEdgeFunction('embed-document', {
          body: { title: item.title, source: item.source, category: batchCategory, content: item.content },
        })
        if (error) { fail++ } else { success++ }
      } catch { fail++ }
    }

    setBatchProgress(null)
    setBatchResult({ success, fail })
    setUploading(false)
    setBatchText('')
    loadDocs()

    if (fail === 0) {
      Taro.showToast({ title: `成功导入 ${success} 条`, icon: 'success' })
    } else {
      Taro.showToast({ title: `导入完成：${success} 成功 ${fail} 失败`, icon: 'none' })
    }
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setBatchText('')
    setBatchResult(null)
    setBatchProgress(null)
  }

  // ===== 删除 =====
  const handleDelete = async (id: string, docTitle: string) => {
    Taro.showModal({
      title: '确认删除',
      content: `删除「${docTitle}」？此操作不可撤销。`,
      success: async (res) => {
        if (!res.confirm) return
        setDeleting(id)
        const ok = await deleteLegalKnowledge(id)
        if (ok) {
          setDocs(prev => prev.filter(d => d.id !== id))
          Taro.showToast({ title: '已删除', icon: 'success' })
        } else {
          Taro.showToast({ title: '删除失败', icon: 'none' })
        }
        setDeleting(null)
      },
    })
  }

  const categoryColor: Record<string, string> = {
    '劳动法': 'bg-primary/10 text-primary',
    '租房': 'bg-accent/20 text-accent-foreground',
    '消费者权益': 'bg-secondary/20 text-secondary-foreground',
    '合同法': 'bg-muted text-muted-foreground',
    '通用': 'bg-muted text-muted-foreground',
    '其他': 'bg-muted text-muted-foreground',
  }

  const batchPreviewCount = batchText
    .split('\n').map(l => l.trim()).filter(l => l.length > 0).length

  return (
    <div className="min-h-screen bg-background">
      {/* 头部 */}
      <div className="bg-gradient-primary px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold text-primary-foreground">知识库管理</p>
            <p className="text-xl text-primary-foreground/70 mt-1">共 {totalCount} 条法律知识</p>
          </div>
          <div className="i-mdi-database-outline text-5xl text-primary-foreground/80" />
        </div>
        {/* 向量化状态统计 */}
        <div className="flex flex-row gap-3 mt-4">
          <div className="flex-1 bg-white/15 rounded-2xl px-4 py-3 flex flex-col gap-1">
            <p className="text-2xl font-bold text-primary-foreground">{embeddedCount}</p>
            <p className="text-xl text-primary-foreground/70">已向量化</p>
          </div>
          <div className="flex-1 bg-white/15 rounded-2xl px-4 py-3 flex flex-col gap-1">
            <p className={`text-2xl font-bold ${pendingCount > 0 ? 'text-yellow-300' : 'text-primary-foreground'}`}>
              {pendingCount}
            </p>
            <p className="text-xl text-primary-foreground/70">待向量化</p>
          </div>
          <div className="flex-1 bg-white/15 rounded-2xl px-4 py-3 flex flex-col gap-1">
            <p className="text-2xl font-bold text-primary-foreground">
              {totalCount > 0 ? Math.round((embeddedCount / totalCount) * 100) : 0}%
            </p>
            <p className="text-xl text-primary-foreground/70">覆盖率</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        {/* 一键向量化横幅 */}
        {pendingCount > 0 && !vectorizing && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="i-mdi-alert-circle-outline text-3xl text-yellow-500 flex-shrink-0" />
              <div>
                <p className="text-xl font-semibold text-yellow-800">{pendingCount} 条记录未向量化</p>
                <p className="text-xl text-yellow-600">向量化后才能被 RAG 检索引用</p>
              </div>
            </div>
            <button
              type="button"
              className="flex-shrink-0 flex items-center justify-center leading-none bg-yellow-500 text-white rounded-xl text-xl font-semibold"
              onClick={handleVectorizeAll}
            >
              <div className="px-4 py-3 flex items-center gap-1">
                <div className="i-mdi-lightning-bolt text-2xl" />
                <span>一键向量化</span>
              </div>
            </button>
          </div>
        )}

        {/* 向量化进度 */}
        {vectorizing && vectorProgress && (
          <div className="bg-card border border-border rounded-2xl px-4 py-4 mb-4 flex flex-col gap-3">
            {/* 标题行：进度 + 停止按钮 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="i-mdi-loading text-3xl text-primary animate-spin" />
                <p className="text-xl font-semibold text-foreground">
                  正在向量化 {vectorProgress.current} / {vectorProgress.total}
                </p>
              </div>
              <button
                type="button"
                className="flex items-center justify-center leading-none bg-muted text-muted-foreground rounded-xl text-xl px-3 py-2"
                onClick={handleStopVectorize}
              >
                停止
              </button>
            </div>

            {/* 进度条 */}
            <div className="w-full bg-muted rounded-full" style={{ height: '8px' }}>
              <div
                className="bg-primary rounded-full transition-all"
                style={{
                  height: '8px',
                  width: `${Math.round((vectorProgress.current / vectorProgress.total) * 100)}%`,
                }}
              />
            </div>

            {/* 百分比 + 倒计时 */}
            <div className="flex items-center justify-between">
              <p className="text-xl text-muted-foreground">
                {Math.round((vectorProgress.current / vectorProgress.total) * 100)}%
              </p>
              <div className="flex items-center gap-1">
                <div className="i-mdi-clock-outline text-2xl text-primary" />
                <p className="text-xl font-medium text-primary">
                  {estimatedSecsLeft === null
                    ? '预计时间计算中…'
                    : `预计还需 ${formatEta(estimatedSecsLeft)}`
                  }
                </p>
              </div>
            </div>

            <p className="text-xl text-muted-foreground text-center">请勿关闭页面</p>
          </div>
        )}

        {/* 操作按钮区（未展开时） */}
        {!showForm && (
          <div className="flex flex-row gap-3 mb-4">
            <button
              type="button"
              className="flex-1 flex items-center justify-center leading-none bg-primary text-primary-foreground text-2xl font-semibold rounded-2xl"
              onClick={() => { setFormMode('single'); setShowForm(true) }}
            >
              <div className="py-4 flex items-center gap-2">
                <div className="i-mdi-plus-circle-outline text-3xl" />
                <span>单条添加</span>
              </div>
            </button>
            <button
              type="button"
              className="flex-1 flex items-center justify-center leading-none bg-secondary text-secondary-foreground border border-border text-2xl font-semibold rounded-2xl"
              onClick={() => { setFormMode('batch'); setShowForm(true) }}
            >
              <div className="py-4 flex items-center gap-2">
                <div className="i-mdi-import text-3xl" />
                <span>批量导入</span>
              </div>
            </button>
          </div>
        )}

        {/* 表单区 */}
        {showForm && (
          <div className="bg-card border border-border rounded-2xl p-4 mb-4">
            <div className="flex flex-row bg-muted rounded-xl p-1 mb-4">
              <button
                type="button"
                className={`flex-1 flex items-center justify-center leading-none rounded-lg text-xl font-medium transition-all ${formMode === 'single' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                onClick={() => setFormMode('single')}
              >
                <div className="py-2 flex items-center gap-1">
                  <div className="i-mdi-file-plus-outline text-2xl" />
                  <span>单条添加</span>
                </div>
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center leading-none rounded-lg text-xl font-medium transition-all ${formMode === 'batch' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                onClick={() => setFormMode('batch')}
              >
                <div className="py-2 flex items-center gap-1">
                  <div className="i-mdi-import text-2xl" />
                  <span>批量导入</span>
                </div>
              </button>
            </div>

            {formMode === 'single' && (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xl text-muted-foreground mb-1">标题 *</p>
                  <div className="border border-input rounded-xl px-4 py-3 bg-background">
                    <input
                      className="w-full text-xl text-foreground bg-transparent outline-none"
                      placeholder="如：劳动合同法第十条"
                      value={title}
                      onInput={(e) => { const ev = e as unknown as { detail?: { value?: string }; target?: { value?: string } }; setTitle(ev.detail?.value ?? ev.target?.value ?? '') }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xl text-muted-foreground mb-1">法律来源</p>
                  <div className="border border-input rounded-xl px-4 py-3 bg-background">
                    <input
                      className="w-full text-xl text-foreground bg-transparent outline-none"
                      placeholder="如：《劳动合同法》第10条"
                      value={source}
                      onInput={(e) => { const ev = e as unknown as { detail?: { value?: string }; target?: { value?: string } }; setSource(ev.detail?.value ?? ev.target?.value ?? '') }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xl text-muted-foreground mb-2">分类</p>
                  <div className="flex flex-row flex-wrap gap-2">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        className={`flex items-center justify-center leading-none rounded-full border text-xl transition-all ${category === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border'}`}
                        onClick={() => setCategory(cat)}
                      >
                        <div className="px-4 py-2">{cat}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xl text-muted-foreground mb-1">法律条文内容 *</p>
                  <div className="border border-input rounded-xl px-4 py-3 bg-background">
                    <textarea
                      className="w-full text-xl text-foreground bg-transparent outline-none"
                      style={{ height: '20vh' }}
                      placeholder="粘贴完整的法律条文内容..."
                      value={content}
                      onInput={(e) => { const ev = e as unknown as { detail?: { value?: string }; target?: { value?: string } }; setContent(ev.detail?.value ?? ev.target?.value ?? '') }}
                    />
                  </div>
                </div>
                <div className="flex flex-row gap-3 mt-2">
                  <button
                    type="button"
                    className={`flex-1 flex items-center justify-center leading-none rounded-xl text-2xl font-semibold transition-all ${uploading ? 'bg-primary/50 text-primary-foreground' : 'bg-primary text-primary-foreground'}`}
                    onClick={handleUpload}
                  >
                    <div className="py-4 flex items-center gap-2">
                      {uploading
                        ? <><div className="i-mdi-loading text-3xl animate-spin" /><span>向量化中...</span></>
                        : <><div className="i-mdi-upload-outline text-3xl" /><span>上传到知识库</span></>
                      }
                    </div>
                  </button>
                  <button
                    type="button"
                    className="flex-1 flex items-center justify-center leading-none rounded-xl text-2xl text-muted-foreground bg-muted border border-border"
                    onClick={handleCloseForm}
                  >
                    <div className="py-4">取消</div>
                  </button>
                </div>
              </div>
            )}

            {formMode === 'batch' && (
              <div className="flex flex-col gap-3">
                <div className="bg-muted rounded-xl px-4 py-3 flex items-start gap-2">
                  <div className="i-mdi-lightbulb-on-outline text-2xl text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1">
                    <p className="text-xl font-medium text-foreground">粘贴格式说明</p>
                    <p className="text-xl text-muted-foreground">每行一条，空行自动跳过</p>
                    <p className="text-xl text-muted-foreground">· 直接粘贴条文内容</p>
                    <p className="text-xl text-muted-foreground">· 标题||来源||内容（更精准）</p>
                  </div>
                </div>
                <div>
                  <p className="text-xl text-muted-foreground mb-2">统一分类</p>
                  <div className="flex flex-row flex-wrap gap-2">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        className={`flex items-center justify-center leading-none rounded-full border text-xl transition-all ${batchCategory === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border'}`}
                        onClick={() => setBatchCategory(cat)}
                      >
                        <div className="px-4 py-2">{cat}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xl text-muted-foreground">粘贴法律条文 *</p>
                    {batchPreviewCount > 0 && (
                      <span className="text-xl text-primary font-medium">已识别 {batchPreviewCount} 条</span>
                    )}
                  </div>
                  <div className="border border-input rounded-xl px-4 py-3 bg-background">
                    <textarea
                      className="w-full text-xl text-foreground bg-transparent outline-none"
                      style={{ height: '30vh' }}
                      placeholder={'第37条：劳动者提前三十日以书面形式通知...\n第38条：用人单位有下列情形之一的...'}
                      value={batchText}
                      onInput={(e) => {
                        const ev = e as unknown as { detail?: { value?: string }; target?: { value?: string } }
                        setBatchText(ev.detail?.value ?? ev.target?.value ?? '')
                        setBatchResult(null)
                      }}
                    />
                  </div>
                </div>
                {batchProgress && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xl text-foreground font-medium">
                        {batchProgress.label}中 {batchProgress.current} / {batchProgress.total}
                      </span>
                      <span className="text-xl text-muted-foreground">
                        {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full" style={{ height: '8px' }}>
                      <div
                        className="bg-primary rounded-full transition-all"
                        style={{
                          height: '8px',
                          width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                {batchResult && !uploading && (
                  <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${batchResult.fail === 0 ? 'bg-primary/10' : 'bg-secondary'}`}>
                    <div className={`text-3xl ${batchResult.fail === 0 ? 'i-mdi-check-circle-outline text-primary' : 'i-mdi-alert-circle-outline text-muted-foreground'}`} />
                    <p className="text-xl text-foreground font-medium">
                      成功导入 {batchResult.success} 条{batchResult.fail > 0 ? `，${batchResult.fail} 条失败` : ''}
                    </p>
                  </div>
                )}
                <div className="flex flex-row gap-3 mt-2">
                  <button
                    type="button"
                    className={`flex-1 flex items-center justify-center leading-none rounded-xl text-2xl font-semibold transition-all ${uploading ? 'bg-primary/50 text-primary-foreground' : 'bg-primary text-primary-foreground'}`}
                    onClick={handleBatchImport}
                  >
                    <div className="py-4 flex items-center gap-2">
                      {uploading
                        ? <><div className="i-mdi-loading text-3xl animate-spin" /><span>导入中...</span></>
                        : <><div className="i-mdi-import text-3xl" /><span>开始批量导入</span></>
                      }
                    </div>
                  </button>
                  <button
                    type="button"
                    className="flex-1 flex items-center justify-center leading-none rounded-xl text-2xl text-muted-foreground bg-muted border border-border"
                    onClick={handleCloseForm}
                  >
                    <div className="py-4">取消</div>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RAG 说明卡片 */}
        <div className="bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3 mb-4 flex items-start gap-3">
          <div className="i-mdi-information-outline text-3xl text-primary flex-shrink-0 mt-1" />
          <div>
            <p className="text-xl font-semibold text-primary">RAG 知识库已启用</p>
            <p className="text-xl text-muted-foreground mt-1">向量化后的条文会在用户提问时被自动检索，注入 AI 回答上下文。</p>
          </div>
        </div>

        {/* 知识库列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="i-mdi-loading text-4xl text-primary animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <div className="i-mdi-database-off-outline text-6xl text-muted-foreground" />
            <p className="text-2xl text-muted-foreground">知识库为空</p>
            <p className="text-xl text-muted-foreground">添加第一条法律知识</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {docs.map(doc => (
              <div key={doc.id} className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-base px-2 py-0.5 rounded-full ${categoryColor[doc.category] ?? 'bg-muted text-muted-foreground'}`}>
                        {doc.category}
                      </span>
                      {/* 向量化状态徽章 */}
                      {doc.has_embedding
                        ? <span className="text-base px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                            <div className="i-mdi-check-circle text-base" />已向量化
                          </span>
                        : <span className="text-base px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 flex items-center gap-1">
                            <div className="i-mdi-clock-outline text-base" />待向量化
                          </span>
                      }
                    </div>
                    <p className="text-xl font-semibold text-foreground">{doc.title}</p>
                    {doc.source && (
                      <p className="text-xl text-primary mt-0.5">{doc.source}</p>
                    )}
                    <p className="text-xl text-muted-foreground mt-1" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {doc.content}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-destructive/10 active:bg-destructive/20 transition-all"
                    onClick={() => handleDelete(doc.id, doc.title)}
                  >
                    {deleting === doc.id
                      ? <div className="i-mdi-loading text-2xl text-destructive animate-spin" />
                      : <div className="i-mdi-trash-can-outline text-2xl text-destructive" />
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
