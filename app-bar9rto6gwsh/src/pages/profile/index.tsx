import { useState, useCallback, useEffect } from 'react'
import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { useAuth } from '@/contexts/AuthContext'
import { withRouteGuard } from '@/components/RouteGuard'
import { getUserStats } from '@/db/api'

function ProfilePage() {
  useShareAppMessage(() => ({ title: '个人中心 - 法律助手' }))
  useShareTimeline(() => ({ title: '个人中心 - 法律助手' }))

  const { user, profile, signOut, refreshProfile } = useAuth()
  const [stats, setStats] = useState({ consultCount: 0, savedCount: 0, caseCount: 0 })

  const loadStats = useCallback(async () => {
    if (!user) return
    await refreshProfile()
    const s = await getUserStats(user.id)
    setStats(s)
  }, [user, refreshProfile])

  useEffect(() => { loadStats() }, [loadStats])
  useDidShow(() => { loadStats() })

  const joinDays = user?.created_at
    ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000)
    : 0

  const nickname = (profile as any)?.nickname || '法律学长'
  const avatarUrl = (profile as any)?.avatar_url || ''

  const handleSignOut = async () => {
    Taro.showModal({
      title: '确认退出',
      content: '退出登录后需要重新登录才能查看历史记录',
      confirmText: '退出',
      cancelText: '取消',
      success: async ({ confirm }) => {
        if (confirm) {
          await signOut()
          Taro.reLaunch({ url: '/pages/login/index' })
        }
      },
    })
  }

  const menuItems = [
    { icon: 'i-mdi-history', label: '我的咨询记录', path: '/pages/profile/history', color: 'text-blue-500' },
    { icon: 'i-mdi-bookmark-multiple-outline', label: '我的收藏法条', path: '/pages/profile/saved', color: 'text-amber-500' },
    { icon: 'i-mdi-forum-outline', label: '我发布的案例', path: '/pages/plaza/index', color: 'text-teal-500' },
  ]

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* 顶部用户卡片 */}
      <div className="px-4 pt-4">
        <div className="bg-card rounded-2xl p-5 shadow-sm" style={{ boxShadow: '0 4px 20px rgba(26,92,84,0.1)' }}>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-primary/20 flex items-center justify-center flex-shrink-0">
              {avatarUrl ? (
                <Image src={avatarUrl} mode="aspectFill" className="w-full h-full" />
              ) : (
                <div className="i-mdi-account-circle-outline text-5xl text-primary" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-2xl font-bold text-foreground">{nickname}</p>
              <p className="text-xl text-muted-foreground mt-1">加入 {joinDays} 天</p>
            </div>
          </div>

          {/* 统计数据 */}
          <div className="flex items-center mt-5 pt-4 border-t border-border">
            {[
              { label: '咨询次数', value: stats.consultCount },
              { label: '收藏法条', value: stats.savedCount },
              { label: '分享案例', value: stats.caseCount },
            ].map((item, i) => (
              <div key={item.label} className={`flex-1 flex flex-col items-center gap-1 ${i > 0 ? 'border-l border-border' : ''}`}>
                <span className="text-2xl font-bold text-primary">{item.value}</span>
                <span className="text-xl text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 功能菜单 */}
      <div className="px-4 mt-4">
        <div className="bg-card rounded-2xl overflow-hidden">
          {menuItems.map((item, i) => (
            <div
              key={item.path}
              className={`flex items-center gap-4 px-5 py-4 active:opacity-70 transition-opacity ${i > 0 ? 'border-t border-border' : ''}`}
              onClick={() => Taro.navigateTo({ url: item.path })}
            >
              <div className={`${item.icon} text-2xl ${item.color}`} />
              <span className="text-xl text-foreground flex-1">{item.label}</span>
              <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
            </div>
          ))}
        </div>
      </div>

      {/* 退出登录 */}
      <div className="px-4 mt-4">
        <div
          className="bg-card rounded-2xl flex items-center justify-center py-4 active:opacity-70 transition-opacity"
          onClick={handleSignOut}
        >
          <div className="i-mdi-logout text-xl text-destructive mr-2" />
          <span className="text-xl text-destructive font-medium">退出登录</span>
        </div>
      </div>
    </div>
  )
}

export default withRouteGuard(ProfilePage)
