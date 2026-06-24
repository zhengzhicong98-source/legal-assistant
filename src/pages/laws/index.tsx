import { useState, useEffect, useMemo, useRef } from 'react'
import Taro from '@tarojs/taro'
import { searchLaws, getLawsList } from '@/db/api'

export default function LawsPage() {
  const [laws, setLaws] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    getLawsList().then(data => { setLaws(data); setLoading(false) })
  }, [])

  useEffect(() => {
    // 取消前一次请求，防止快速输入/删除时的竞态
    if (abortRef.current) abortRef.current.abort()
    if (searchText.trim().length === 0) { getLawsList().then(setLaws); return }
    const controller = new AbortController()
    abortRef.current = controller
    const timer = setTimeout(() => {
      // 用 AbortController 标记，searchLaws 目前是纯 Supabase 调用无法真正 abort，
      // 但可以防止旧结果覆盖新结果
      searchLaws(searchText.trim()).then(data => {
        if (!controller.signal.aborted) setLaws(data)
      })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [searchText])

  // 按法律分组
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {}
    laws.forEach(l => { if (!map[l.law_name]) map[l.law_name] = []; map[l.law_name].push(l) })
    return Object.entries(map)
  }, [laws])

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <div className="i-mdi-arrow-left text-2xl text-foreground" onClick={() => Taro.navigateBack()} />
          <span className="text-2xl font-semibold text-foreground">法律法规原文库</span>
        </div>
        <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-2">
          <div className="i-mdi-magnify text-2xl text-muted-foreground flex-shrink-0" />
          <input className="flex-1 text-xl bg-transparent outline-none" placeholder="搜索法律名称或条文内容…"
            value={searchText} onInput={e => setSearchText((e as any).detail?.value ?? (e as any).target?.value ?? '')} />
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <div className="text-center py-16 text-muted-foreground"><div className="i-mdi-loading animate-spin text-3xl" /></div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center pt-16 text-muted-foreground">
            <div className="i-mdi-book-open-outline text-5xl opacity-40 mb-3" />
            <p className="text-xl">未找到匹配的法律条文</p>
          </div>
        ) : (
          grouped.map(([lawName, articles]) => (
            <div key={lawName} className="mb-4">
              <p className="text-xl font-bold text-primary mb-2 px-1">{lawName}</p>
              {articles.map(a => (
                <div key={a.id} className="bg-card rounded-xl border border-border mb-2 overflow-hidden"
                  onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                  <div className="flex items-start justify-between px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xl font-semibold text-foreground">
                        {a.chapter ? `${a.chapter} · ` : ''}{a.article_number ? `第${a.article_number}条` : ''}{a.title ? ` ${a.title}` : ''}
                      </p>
                      {!expandedId || expandedId !== a.id ? (
                        <p className="text-xl text-muted-foreground truncate mt-1">{a.content.slice(0, 80)}…</p>
                      ) : null}
                    </div>
                    <div className={`i-mdi-chevron-down text-xl text-muted-foreground transition-transform flex-shrink-0 ml-2 ${expandedId === a.id ? 'rotate-180' : ''}`} />
                  </div>
                  {expandedId === a.id && (
                    <div className="px-4 pb-4 border-t border-border">
                      <p className="text-xl text-foreground leading-relaxed mt-3 whitespace-pre-line">{a.content}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
