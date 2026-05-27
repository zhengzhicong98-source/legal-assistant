import { useState, useEffect, useCallback } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { getCasePostDetail, getUserCaseReactions, toggleLike, toggleSave } from '@/db/api'
import { callEdgeFunction } from '@/utils/callEdgeFunction'
import type { CasePost } from '@/db/types'

const CATEGORY_COLORS: Record<string, string> = {
  '租房': 'bg-blue-100 text-blue-700',
  '劳动': 'bg-orange-100 text-orange-700',
  '消费': 'bg-purple-100 text-purple-700',
  '其他': 'bg-gray-100 text-gray-600',
}

const RESULT_COLORS: Record<string, string> = {
  '维权成功': 'bg-green-100 text-green-700',
  '协商解决': 'bg-amber-100 text-amber-700',
  '待处理': 'bg-gray-100 text-gray-500',
}

const RESULT_ICON: Record<string, string> = {
  '维权成功': 'i-mdi-check-circle',
  '协商解决': 'i-mdi-handshake',
  '待处理': 'i-mdi-clock-outline',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getUserId(): string {
  let uid = Taro.getStorageSync('userId')
  if (!uid) {
    uid = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    Taro.setStorageSync('userId', uid)
  }
  return uid
}

export default function PlazaDetail() {
  const [post, setPost] = useState<CasePost | null>(null)
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState('')
  const postId = Taro.getCurrentInstance().router?.params?.id || ''

  useShareAppMessage(() => ({
    title: post ? `${post.title} - 案例分享` : '案例详情',
    path: `/pages/plaza/detail?id=${postId}`,
  }))
  useShareTimeline(() => ({
    title: post ? `${post.title} - 案例分享` : '案例详情',
  }))

  const loadData = useCallback(async () => {
    if (!postId) return
    setLoading(true)
    const data = await getCasePostDetail(postId)
    setPost(data)
    if (data) {
      const userId = getUserId()
      const reactions = await getUserCaseReactions(postId, userId)
      setLiked(reactions.liked)
      setSaved(reactions.saved)
    }
    setLoading(false)
  }, [postId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleLike = async () => {
    if (!post) return
    const userId = getUserId()
    const ok = await toggleLike(post.id, userId, liked)
    if (ok) {
      setLiked(!liked)
      setPost(prev => prev ? { ...prev, likes_count: prev.likes_count + (liked ? -1 : 1) } : prev)
    }
  }

  const handleSave = async () => {
    if (!post) return
    const userId = getUserId()
    const ok = await toggleSave(post.id, userId, saved)
    if (ok) {
      setSaved(!saved)
      setPost(prev => prev ? { ...prev, saves_count: prev.saves_count + (saved ? -1 : 1) } : prev)
    }
  }

  const handleAiAnalysis = async () => {
    if (!post || aiLoading) return
    if (aiAnalysis) {
      // 如果已有分析结果，切换显示/隐藏
      setAiAnalysis('')
      return
    }
    setAiLoading(true)
    const prompt = `请作为法律助手，对以下维权案例进行法律分析和建议：\n\n标题：${post.title}\n分类：${post.category}\n问题：${post.question || '无'}\n解决方法：${post.solution || '无'}\n结果：${post.result || '待处理'}\n\n请从以下角度分析：1.法律定性（该案例涉及哪些法律法规）；2.维权建议（如果还在处理中，给出下一步建议）；3.类似案例提醒。回答控制在300字以内，用通俗语言。`

    const { data, error } = await callEdgeFunction<{ content?: string }>('legal-chat', {
      body: { messages: [{ role: 'user', content: prompt }], mode: 'chat' },
    })
    setAiLoading(false)
    if (error) {
      Taro.showToast({ title: 'AI 分析失败', icon: 'none' })
    } else {
      setAiAnalysis(data?.content || '暂无分析结果')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="i-mdi-loading animate-spin text-4xl text-primary" />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-muted-foreground">
        <div className="i-mdi-alert-circle-outline text-4xl mb-3" />
        <p className="text-xl">案例不存在或已被删除</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-4 py-3 bg-card border-b border-border">
        <div className="i-mdi-arrow-left text-2xl text-foreground" onClick={() => Taro.navigateBack()} />
        <span className="text-2xl font-semibold text-foreground">案例详情</span>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        {/* 分类 + 标题 */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded text-xl font-medium ${CATEGORY_COLORS[post.category] || CATEGORY_COLORS['其他']}`}>
              {post.category}
            </span>
            {post.result && (
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xl ${RESULT_COLORS[post.result]}`}>
                <div className={`${RESULT_ICON[post.result]} text-lg`} />
                {post.result}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-foreground leading-snug">{post.title}</h1>
          <div className="flex items-center gap-2 mt-2 text-xl text-muted-foreground">
            <span>{post.is_anonymous ? post.nickname : post.nickname}</span>
            <span>·</span>
            <span>{formatTime(post.created_at)}</span>
          </div>
        </div>

        {/* 问题 */}
        {post.question && (
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="i-mdi-help-circle-outline text-xl text-primary" />
              <span className="text-xl font-semibold text-foreground">遇到的问题</span>
            </div>
            <p className="text-xl text-muted-foreground leading-relaxed whitespace-pre-line">{post.question}</p>
          </div>
        )}

        {/* 解决方法 */}
        {post.solution && (
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="i-mdi-lightbulb-outline text-xl text-amber-500" />
              <span className="text-xl font-semibold text-foreground">解决方法</span>
            </div>
            <p className="text-xl text-muted-foreground leading-relaxed whitespace-pre-line">{post.solution}</p>
          </div>
        )}

        {/* AI 解读 */}
        <div
          className="flex items-center gap-2 px-4 py-3 bg-primary/10 rounded-xl active:opacity-80 transition-opacity"
          onClick={handleAiAnalysis}
        >
          <div className={`text-xl ${aiLoading ? 'i-mdi-loading animate-spin text-primary' : 'i-mdi-robot-outline text-primary'}`} />
          <span className="text-xl font-medium text-primary">
            {aiAnalysis ? '收起 AI 解读' : aiLoading ? 'AI 正在分析...' : 'AI 法律解读'}
          </span>
        </div>

        {aiAnalysis && (
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xl text-muted-foreground leading-relaxed whitespace-pre-line">{aiAnalysis}</p>
          </div>
        )}

        {/* 底部操作栏 */}
        <div className="sticky bottom-0 flex items-center justify-around py-3 bg-card border-t border-border rounded-b-xl">
          <div className="flex flex-col items-center gap-1 active:opacity-70" onClick={handleLike}>
            <div className={`text-2xl ${liked ? 'i-mdi-heart text-red-500' : 'i-mdi-heart-outline text-muted-foreground'}`} />
            <span className={`text-xl ${liked ? 'text-red-500' : 'text-muted-foreground'}`}>{post.likes_count}</span>
          </div>
          <div className="flex flex-col items-center gap-1 active:opacity-70" onClick={handleSave}>
            <div className={`text-2xl ${saved ? 'i-mdi-bookmark text-primary' : 'i-mdi-bookmark-outline text-muted-foreground'}`} />
            <span className={`text-xl ${saved ? 'text-primary' : 'text-muted-foreground'}`}>{post.saves_count}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
