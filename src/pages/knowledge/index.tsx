import { useState, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { getLegalKnowledgeDocs } from '@/db/api'
import { saveLaw } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import type { LegalKnowledge } from '@/db/types'

const CATEGORIES = ['全部', '劳动法', '租房', '消费', '合同', '其他'] as const
type Category = (typeof CATEGORIES)[number]

const CATEGORY_COLORS: Record<string, string> = {
  '劳动法': 'bg-orange-100 text-orange-700',
  '租房': 'bg-blue-100 text-blue-700',
  '消费': 'bg-purple-100 text-purple-700',
  '合同': 'bg-green-100 text-green-700',
  '其他': 'bg-gray-100 text-gray-600',
}

/** 从标题和原文中截取预览文本（去除多余空白，限制 120 字） */
function previewContent(content: string): string {
  const cleaned = content.replace(/\s+/g, ' ').trim()
  return cleaned.length > 120 ? cleaned.slice(0, 120) + '…' : cleaned
}

export default function KnowledgePage() {
  const { user } = useAuth()
  const [docs, setDocs] = useState<LegalKnowledge[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<Category>('全部')
  const [searchText, setSearchText] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    getLegalKnowledgeDocs()
      .then(setDocs)
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let result = docs
    if (activeCategory !== '全部') {
      result = result.filter(d => d.category === activeCategory)
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      result = result.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.source.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q)
      )
    }
    return result
  }, [docs, activeCategory, searchText])

  const handleSave = async (knowledgeId: string) => {
    if (!user) {
      Taro.showModal({ title: '请先登录', content: '登录后才能收藏法条', confirmText: '去登录', success: r => { if (r.confirm) Taro.navigateTo({ url: '/pages/login/index' }) } })
      return
    }
    const ok = await saveLaw(user.id, knowledgeId)
    if (ok) {
      setSavedIds(prev => new Set(prev).add(knowledgeId))
      Taro.showToast({ title: '已收藏', icon: 'success', duration: 1500 })
    } else {
      Taro.showToast({ title: '收藏失败', icon: 'none' })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部搜索栏 */}
      <div className="px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-2">
          <div className="i-mdi-magnify text-2xl text-muted-foreground flex-shrink-0" />
          <input
            className="flex-1 text-xl text-foreground bg-transparent outline-none"
            placeholder="搜索法律条文、法规名称…"
            value={searchText}
            onInput={e => setSearchText((e as any).detail?.value ?? (e as any).target?.value ?? '')}
          />
          {searchText && (
            <div className="i-mdi-close-circle text-2xl text-muted-foreground flex-shrink-0" onClick={() => setSearchText('')} />
          )}
        </div>
      </div>

      {/* 分类标签 */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto bg-card border-b border-border">
        {CATEGORIES.map(cat => (
          <div
            key={cat}
            className={`px-4 py-2 rounded-full text-xl whitespace-nowrap transition-all flex-shrink-0 ${activeCategory === cat ? 'bg-primary text-primary-foreground font-medium' : 'bg-secondary text-foreground'}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </div>
        ))}
      </div>

      {/* 结果统计 */}
      <div className="px-4 py-2">
        <span className="text-base text-muted-foreground">
          {loading ? '加载中…' : `共 ${filtered.length} 条法条`}
          {activeCategory !== '全部' && `（${activeCategory}）`}
          {searchText && ` - 搜索「${searchText}」`}
        </span>
      </div>

      {/* 法条列表 */}
      <div className="px-4 pb-8">
        {loading ? (
          <div className="flex items-center justify-center pt-16 text-muted-foreground text-xl">
            <div className="i-mdi-loading animate-spin mr-2" />加载中…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center pt-16 gap-3">
            <div className="i-mdi-bookshelf text-5xl text-muted-foreground" />
            <p className="text-xl text-muted-foreground">
              {searchText ? '未找到匹配的法条' : '知识库暂无数据'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(doc => {
              const isExpanded = expandedId === doc.id
              const isSaved = savedIds.has(doc.id)
              return (
                <div key={doc.id} className="bg-card rounded-xl border border-border overflow-hidden">
                  {/* 卡片头部 */}
                  <div className="px-4 py-3" onClick={() => setExpandedId(isExpanded ? null : doc.id)}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xl font-semibold text-foreground truncate">{doc.title}</p>
                        <p className="text-base text-muted-foreground mt-1">{doc.source}</p>
                      </div>
                      <div className={`px-2 py-1 rounded text-base flex-shrink-0 ${CATEGORY_COLORS[doc.category] || CATEGORY_COLORS['其他']}`}>
                        {doc.category}
                      </div>
                    </div>
                    {!isExpanded && (
                      <p className="text-xl text-muted-foreground leading-relaxed">{previewContent(doc.content)}</p>
                    )}
                  </div>

                  {/* 展开的完整内容 */}
                  {isExpanded && (
                    <div className="px-4 pb-4">
                      <div className="law-quote mb-3">
                        <p className="text-xl text-foreground leading-relaxed whitespace-pre-line">{doc.content}</p>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-border">
                        <span className="text-base text-muted-foreground">
                          {doc.created_at ? new Date(doc.created_at).toLocaleDateString('zh-CN') : ''}
                        </span>
                        <div
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${isSaved ? 'bg-green-50 text-green-600' : 'bg-secondary text-muted-foreground active:bg-primary/10'}`}
                          onClick={(e) => { e.stopPropagation(); handleSave(doc.id) }}
                        >
                          <div className={`text-xl ${isSaved ? 'i-mdi-bookmark' : 'i-mdi-bookmark-outline'}`} />
                          <span className="text-base">{isSaved ? '已收藏' : '收藏'}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 未展开时的指示 */}
                  {!isExpanded && (
                    <div className="flex justify-center pb-2">
                      <div className="i-mdi-chevron-down text-xl text-muted-foreground" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
