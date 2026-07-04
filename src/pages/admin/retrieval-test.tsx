import { useState, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { RoleGuard } from '@/components/RoleGuard'
import { supabase } from '@/client/supabase'
import { callEdgeFunction } from '@/utils/callEdgeFunction'

interface RetrievalResult {
  id: string
  title: string
  source: string
  category: string
  content: string
  similarity: number
  keyword_score: number
  hybrid_score: number
}

interface SearchTestResponse {
  query?: string
  expanded_query?: string
  results?: RetrievalResult[]
  count?: number
}

/** 获取用户 JWT token 用于 Edge Function 认证 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}
}

export default function RetrievalTest() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RetrievalResult[]>([])
  const [expandedQuery, setExpandedQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }, [])

  const handleSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) { setError('请输入检索问题'); return }
    setError('')
    setLoading(true)
    setResults([])
    setExpandedIds(new Set())

    try {
      const authHeaders = await getAuthHeaders()
      const { data, error: fnError } = await callEdgeFunction<SearchTestResponse>('legal-chat', {
        body: { messages: [{ role: 'user', content: q }], mode: 'search-test' },
        headers: authHeaders,
      })
      if (fnError) {
        setError(`检索失败：${fnError}`)
      } else if (data?.results && data.results.length > 0) {
        setResults(data.results)
        setExpandedQuery(data.expanded_query || '')
      } else {
        setError('未检索到匹配法条（知识库中暂无相关内容）')
      }
    } catch (e) {
      setError(`网络异常：${String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [query])

  const scoreColor = (score: number, threshold: number) =>
    score >= threshold ? 'text-green-600' : score >= threshold * 0.5 ? 'text-amber-500' : 'text-red-500'

  return (
    <RoleGuard requiredRole="admin">
      <div className="min-h-screen bg-background flex flex-col">
        {/* 头部 */}
        <div className="bg-gradient-primary px-4 py-6">
          <h1 className="text-2xl font-semibold text-primary-foreground">检索质量测试</h1>
          <p className="text-lg text-primary-foreground/70 mt-1">
            输入问题，查看知识库检索命中的法条及多维分数，判断检索质量
          </p>
        </div>

        {/* 搜索区域 */}
        <div className="px-4 py-4 flex flex-col gap-3">
          <div className="border border-input rounded-xl px-4 py-3 bg-card">
            <textarea
              className="w-full text-xl text-foreground bg-transparent outline-none resize-none"
              rows={3}
              placeholder="输入测试问题，如：试用期被辞退有赔偿吗"
              value={query}
              onInput={(e) => {
                const val = (e as any).detail?.value ?? (e as any).target?.value ?? ''
                setQuery(val)
              }}
            />
          </div>
          <button
            className={`w-full py-3 rounded-xl text-xl font-medium flex items-center justify-center gap-2 transition ${
              loading
                ? 'bg-muted text-muted-foreground'
                : 'bg-primary text-primary-foreground active:scale-[0.98]'
            }`}
            disabled={loading}
            onClick={handleSearch}
          >
            {loading ? (
              <>
                <div className="i-mdi-loading animate-spin text-xl" />
                检索中...
              </>
            ) : (
              <>
                <div className="i-mdi-magnify text-xl" />
                开始检索
              </>
            )}
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mx-4 mb-4 px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-xl">
            <p className="text-lg text-destructive">{error}</p>
          </div>
        )}

        {/* 查询改写提示 */}
        {expandedQuery && results.length > 0 && (
          <div className="mx-4 mb-2 px-4 py-2 bg-muted rounded-lg">
            <span className="text-base text-muted-foreground">
              查询改写：<span className="text-foreground font-medium">{expandedQuery}</span>
            </span>
          </div>
        )}

        {/* 结果统计 */}
        {results.length > 0 && (
          <div className="mx-4 mb-4 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
            <div className="flex items-center gap-2">
              <div className="i-mdi-database-check-outline text-2xl text-primary" />
              <span className="text-xl text-primary font-medium">
                命中 {results.length} 条法条
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="text-center px-2 py-2 bg-white rounded-lg">
                <p className="text-base text-muted-foreground">向量均值</p>
                <p className="text-2xl font-semibold text-foreground">
                  {Math.round(results.reduce((s, r) => s + r.similarity, 0) / results.length * 100)}%
                </p>
              </div>
              <div className="text-center px-2 py-2 bg-white rounded-lg">
                <p className="text-base text-muted-foreground">关键词均值</p>
                <p className="text-2xl font-semibold text-foreground">
                  {Math.round(results.reduce((s, r) => s + r.keyword_score, 0) / results.length * 100)}%
                </p>
              </div>
              <div className="text-center px-2 py-2 bg-white rounded-lg">
                <p className="text-base text-muted-foreground">融合最高</p>
                <p className="text-2xl font-semibold text-foreground">
                  {Math.round(Math.max(...results.map(r => r.hybrid_score)) * 100)}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 检索结果列表 */}
        {results.map((r, i) => (
          <div key={r.id} className="mx-4 mb-3 bg-card rounded-xl border border-border overflow-hidden">
            {/* 排名 + 标题 */}
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-base font-semibold text-primary-foreground">{i + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xl text-foreground font-medium truncate">{r.title}</p>
                  <span className="text-sm text-muted-foreground bg-muted rounded px-1.5 py-0.5 flex-shrink-0">
                    {r.category}
                  </span>
                </div>
                <p className="text-base text-muted-foreground truncate mt-0.5">{r.source}</p>

                {/* 三路分数 */}
                <div className="flex gap-3 mt-2">
                  <div className="flex-1 px-2 py-1.5 bg-background rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">向量</p>
                    <p className={`text-lg font-semibold ${scoreColor(r.similarity, 0.6)}`}>
                      {Math.round(r.similarity * 100)}%
                    </p>
                  </div>
                  <div className="flex-1 px-2 py-1.5 bg-background rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">关键词</p>
                    <p className={`text-lg font-semibold ${scoreColor(r.keyword_score, 0.3)}`}>
                      {Math.round(r.keyword_score * 100)}%
                    </p>
                  </div>
                  <div className="flex-1 px-2 py-1.5 bg-primary/5 rounded-lg text-center border border-primary/10">
                    <p className="text-sm text-primary">融合 Score</p>
                    <p className="text-lg font-semibold text-primary">
                      {Math.round(r.hybrid_score * 100)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 展开原文 */}
            <div
              className="flex items-center justify-between px-4 py-2.5 border-t border-border/50 active:bg-muted/50"
              onClick={() => toggleExpand(r.id)}
            >
              <span className="text-base text-muted-foreground">
                {expandedIds.has(r.id) ? '收起法条原文' : '查看法条原文'}
              </span>
              <div className={`i-mdi-chevron-down text-lg text-muted-foreground transition-transform ${
                expandedIds.has(r.id) ? 'rotate-180' : ''
              }`} />
            </div>
            {expandedIds.has(r.id) && (
              <div className="px-4 pb-4 pt-2 border-t border-border/50">
                <div className="law-quote">
                  <p className="text-base text-foreground leading-relaxed whitespace-pre-wrap">{r.content}</p>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* 空态 */}
        {!results.length && !loading && !error && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
            <div className="i-mdi-database-search-outline text-6xl text-muted-foreground/40" />
            <p className="text-xl text-muted-foreground">输入问题，测试检索命中情况</p>
            <p className="text-base text-muted-foreground/60">向量分 + 关键词分 + 混合分，一目了然</p>
          </div>
        )}

        <div className="h-8 flex-shrink-0" />
      </div>
    </RoleGuard>
  )
}
