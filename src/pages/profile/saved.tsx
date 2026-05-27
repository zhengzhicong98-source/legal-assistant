import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { useAuth } from '@/contexts/AuthContext'
import { withRouteGuard } from '@/components/RouteGuard'
import { getSavedLaws, removeSavedLaw } from '@/db/api'
import type { SavedLaw } from '@/db/types'

const CATEGORY_COLORS: Record<string, string> = {
  '劳动': 'bg-orange-100 text-orange-700',
  '租房': 'bg-blue-100 text-blue-700',
  '消费': 'bg-purple-100 text-purple-700',
  '合同': 'bg-green-100 text-green-700',
}

function SavedPage() {
  const { user } = useAuth()
  const [laws, setLaws] = useState<SavedLaw[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const data = await getSavedLaws(user.id)
    setLaws(data)
    setLoading(false)
  }, [user])

  useEffect(() => { loadData() }, [loadData])

  const handleRemove = (id: string) => {
    Taro.showModal({
      title: '取消收藏',
      content: '确定要取消收藏这条法条吗？',
      confirmText: '取消收藏',
      cancelText: '保留',
      success: async ({ confirm }) => {
        if (!confirm) return
        const ok = await removeSavedLaw(id)
        if (ok) {
          setLaws(prev => prev.filter(l => l.id !== id))
          Taro.showToast({ title: '已取消收藏', icon: 'success' })
        }
      },
    })
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="flex items-center gap-2 px-4 py-3 bg-card border-b border-border">
        <div className="i-mdi-arrow-left text-2xl text-foreground" onClick={() => Taro.navigateBack()} />
        <span className="text-2xl font-semibold text-foreground">我的收藏法条</span>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <div className="flex items-center justify-center pt-16 text-muted-foreground text-xl">
            <div className="i-mdi-loading animate-spin mr-2" />加载中...
          </div>
        ) : laws.length === 0 ? (
          <div className="flex flex-col items-center pt-16 text-muted-foreground">
            <div className="i-mdi-bookmark-off-outline text-4xl opacity-40 mb-3" />
            <p className="text-xl">暂无收藏法条</p>
            <p className="text-xl mt-1">在法律咨询中收藏相关法条</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {laws.map(law => {
              const knowledge = law.legal_knowledge
              if (!knowledge) return null
              return (
                <div key={law.id} className="bg-card rounded-xl border border-border overflow-hidden">
                  <div
                    className="flex items-start gap-3 px-4 py-3 active:opacity-70 transition-opacity"
                    onClick={() => setExpandedId(expandedId === law.id ? null : law.id)}
                  >
                    <div className="flex-1">
                      <p className="text-xl font-semibold text-foreground leading-snug">{knowledge.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xl text-muted-foreground">{knowledge.source}</span>
                        {knowledge.category && (
                          <span className={`px-2 py-0.5 rounded text-xl ${CATEGORY_COLORS[knowledge.category] || 'bg-gray-100 text-gray-600'}`}>
                            {knowledge.category}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`i-mdi-chevron-down text-2xl text-muted-foreground transition-transform flex-shrink-0 mt-1 ${expandedId === law.id ? 'rotate-180' : ''}`} />
                  </div>

                  {expandedId === law.id && (
                    <div className="px-4 pb-3 border-t border-border">
                      <p className="text-xl text-muted-foreground leading-relaxed mt-3 whitespace-pre-line">{knowledge.content}</p>
                      <div
                        className="flex items-center gap-1 mt-3 text-xl text-muted-foreground"
                        onClick={() => handleRemove(law.id)}
                      >
                        <div className="i-mdi-bookmark-remove-outline text-xl" />
                        <span>取消收藏</span>
                      </div>
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

export default withRouteGuard(SavedPage)
