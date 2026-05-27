import { useState, useEffect, useCallback } from 'react'
import Taro, { useShareAppMessage, useShareTimeline, useReachBottom, usePullDownRefresh } from '@tarojs/taro'
import { getCasePosts } from '@/db/api'
import type { CasePost, CaseCategory } from '@/db/types'

const TABS: { key: string; label: string }[] = [
  { key: 'latest', label: '最新' },
  { key: 'hottest', label: '最热' },
  { key: '租房', label: '租房' },
  { key: '劳动', label: '劳动' },
  { key: '消费', label: '消费' },
]

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

/** 格式化发布时间 */
function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export default function Plaza() {
  useShareAppMessage(() => ({ title: '案例分享广场 - 法律助手', path: '/pages/plaza/index' }))
  useShareTimeline(() => ({ title: '案例分享广场 - 法律助手' }))

  const [activeTab, setActiveTab] = useState('latest')
  const [posts, setPosts] = useState<CasePost[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const PAGE_SIZE = 10

  const fetchPosts = useCallback(async (isRefresh = false) => {
    const currentOffset = isRefresh ? 0 : offset
    const sort: 'latest' | 'hottest' = activeTab === 'hottest' ? 'hottest' : 'latest'
    const category: CaseCategory | '全部' = ['租房', '劳动', '消费'].includes(activeTab)
      ? (activeTab as CaseCategory)
      : '全部'

    setLoading(true)
    const data = await getCasePosts({ category, sort, limit: PAGE_SIZE, offset: currentOffset })

    if (isRefresh) {
      setPosts(data)
      setOffset(PAGE_SIZE)
    } else {
      setPosts(prev => [...prev, ...data])
      setOffset(currentOffset + PAGE_SIZE)
    }
    setHasMore(data.length === PAGE_SIZE)
    setLoading(false)
    setRefreshing(false)
  }, [activeTab, offset])

  useEffect(() => {
    setPosts([])
    setOffset(0)
    setHasMore(true)
    fetchPosts(true)
  }, [activeTab])

  usePullDownRefresh(() => {
    setRefreshing(true)
    setOffset(0)
    setHasMore(true)
    fetchPosts(true)
  })

  useReachBottom(() => {
    if (!loading && hasMore) fetchPosts(false)
  })

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/plaza/detail?id=${id}` })
  }

  const goPost = () => {
    Taro.navigateTo({ url: '/pages/plaza/post' })
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* 顶部 Tab */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 overflow-x-auto">
          {TABS.map(tab => (
            <div
              key={tab.key}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xl font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </div>
          ))}
        </div>
      </div>

      {/* 帖子列表 */}
      <div className="px-4 pt-3">
        {posts.length === 0 && !loading ? (
          <div className="flex flex-col items-center pt-12 text-muted-foreground">
            <div className="i-mdi-forum-outline text-4xl mb-3 opacity-40" />
            <p className="text-xl">还没有相关案例</p>
            <p className="text-xl mt-1">快来分享你的经历吧</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {posts.map(post => (
              <div
                key={post.id}
                className="bg-card rounded-xl border border-border p-4 active:opacity-80 transition-opacity"
                onClick={() => goDetail(post.id)}
              >
                {/* 分类 + 标题 */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded text-xl font-medium ${CATEGORY_COLORS[post.category] || CATEGORY_COLORS['其他']}`}>
                    {post.category}
                  </span>
                  <h3 className="text-xl font-semibold text-foreground line-clamp-1 flex-1">{post.title}</h3>
                </div>

                {/* 内容预览 */}
                <p className="text-xl text-muted-foreground leading-relaxed line-clamp-2 mb-3">{post.content}</p>

                {/* 底部信息 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {post.result && (
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xl ${RESULT_COLORS[post.result]}`}>
                        <div className={`${RESULT_ICON[post.result]} text-lg`} />
                        {post.result}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xl text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <div className="i-mdi-heart-outline text-lg" />
                      <span>{post.likes_count}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="i-mdi-bookmark-outline text-lg" />
                      <span>{post.saves_count}</span>
                    </div>
                    <span>{formatTime(post.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="text-center py-4 text-muted-foreground text-xl">
                <div className="i-mdi-loading animate-spin inline-block mr-2" />
                加载中...
              </div>
            )}
            {!hasMore && posts.length > 0 && (
              <div className="text-center py-4 text-muted-foreground text-xl">已经到底啦</div>
            )}
          </div>
        )}
      </div>

      {/* 浮动发帖按钮 */}
      <div
        className="fixed bottom-6 right-6 w-14 h-14 bg-primary rounded-full shadow-lg flex items-center justify-center active:opacity-80 z-20"
        onClick={goPost}
      >
        <div className="i-mdi-plus text-3xl text-primary-foreground" />
      </div>
    </div>
  )
}
