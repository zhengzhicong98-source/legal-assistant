import { useState, useEffect } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { Swiper, SwiperItem } from '@tarojs/components'
import { callEdgeFunction } from '@/utils/callEdgeFunction'
import { getWeeklyHotQuestions, getConsultHistory, getUnreadCount, getWarnings, type Warning } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import type { QuestionStat } from '@/db/types'

const features = [
  {
    icon: 'i-mdi-file-search-outline',
    title: '合同审查',
    desc: '上传合同照片，AI识别霸王条款',
    path: '/pages/contract/index',
    color: 'bg-primary',
  },
  {
    icon: 'i-mdi-message-question-outline',
    title: '法律咨询',
    desc: '场景式法律问答，含话术模板',
    path: '/pages/consult/index',
    color: 'bg-primary',
  },
  {
    icon: 'i-mdi-file-document-edit-outline',
    title: '文书生成',
    desc: '一键生成标准法律文书',
    path: '/pages/document/index',
    color: 'bg-primary',
  },
  {
    icon: 'i-mdi-map-marker-outline',
    title: '维权导航',
    desc: '全国机构联系方式与流程',
    path: '/pages/rights/index',
    color: 'bg-primary',
  },
  {
    icon: 'i-mdi-clipboard-check-outline',
    title: '证据采集',
    desc: '勾选已有证据，AI提示补充方向',
    path: '/pages/evidence/index',
    color: 'bg-primary',
  },
]

const tools = [
  {
    icon: 'i-mdi-calculator-variant-outline',
    title: '病假工资计算',
    path: '/pages/calculator/index',
    query: 'type=sick',
  },
  {
    icon: 'i-mdi-home-alert-outline',
    title: '违约金计算',
    path: '/pages/calculator/index',
    query: 'type=penalty',
  },
]

const tips = [
  '试用期最长不超过6个月，超出部分无效',
  '押金最多不超过2个月租金（部分地区规定）',
  '用人单位不得要求劳动者缴纳保证金',
  '合法仲裁申请时效为1年',
]

// 热门避雷指南 - 真实高发案例提示
const WARNINGS = [
  '避雷 | 中介要求签"独家委托"并收取高额手续费，均属违规，可向住建局投诉',
  '避雷 | 试用期工资低于转正工资50%违法，可要求补发差额',
  '避雷 | 培训机构"概不退费"条款无效，7天冷静期内可全额退款',
  '避雷 | 押金超过2个月租金属违规，可向市场监管局举报',
  '避雷 | 求职被要求缴纳保证金/押金/培训费，均属违法行为',
  '避雷 | 房东不提供书面合同即收租，拒付前请先拍照留存付款记录',
  '避雷 | 网签合同与纸质合同内容不符，以网签备案版本为准',
  '避雷 | 不签劳动合同满1个月，公司须支付2倍工资',
]

const TAB_BAR_PATHS = ['/pages/home/index', '/pages/consult/index', '/pages/contract/index', '/pages/tools/index']

export default function Home() {
  useShareAppMessage(() => ({
    title: '法律助手 - 大学生法律知识搜索工具',
    path: '/pages/home/index',
  }))
  useShareTimeline(() => ({
    title: '法律助手 - 大学生法律知识搜索工具',
  }))

  const { user } = useAuth()
  const [currentCity, setCurrentCity] = useState('')
  /** 精确到区级的位置文字，如"海淀区"；成功后展示「城市·区」组合 */
  const [currentDistrict, setCurrentDistrict] = useState('')
  const [hotQuestions, setHotQuestions] = useState<QuestionStat[]>([])
  const [warnings, setWarnings] = useState<Warning[]>([])
  const [recommended, setRecommended] = useState<string[]>([])
  const [unread, setUnread] = useState(0)

  // 1. IP 定位（快速、无需授权）
  useEffect(() => {
    callEdgeFunction<{ city?: string; province?: string }>('ip-location', { method: 'GET' })
      .then(({ data }) => {
        const city = data?.city || data?.province || ''
        if (city) setCurrentCity(city)
      })
      .catch(() => { /* 静默忽略 */ })
  }, [])

  // 2. GPS 模糊定位 + 逆地理编码（异步，失败不影响 IP 城市）
  useEffect(() => {
    const fetchDistrict = async () => {
      try {
        const loc = await Taro.getFuzzyLocation({ type: 'wgs84' })
        const { data } = await callEdgeFunction<{
          status: number
          result?: { addressComponent?: { district?: string; city?: string } }
        }>('reverse-geocoding', {
          body: {
            location: `${loc.latitude},${loc.longitude}`,
            coordtype: 'wgs84ll',
          },
        })
        if (data?.status === 0) {
          const district = data.result?.addressComponent?.district || ''
          if (district) setCurrentDistrict(district)
          // 如果 IP 定位还未回来，用逆地理编码的城市补充
          const city = data.result?.addressComponent?.city || ''
          if (city) setCurrentCity(prev => prev || city)
        }
      } catch {
        /* 定位权限被拒等情况静默忽略，保留 IP 城市 */
      }
    }
    fetchDistrict()
  }, [])

  // 3. 加载本周热点问题
  useEffect(() => {
    getWeeklyHotQuestions().then(data => setHotQuestions(data)).catch(() => {})
  }, [])

  // 3b. 从后端加载避雷指南
  useEffect(() => {
    getWarnings().then(data => { if (data.length > 0) setWarnings(data) }).catch(() => {})
  }, [])

  // 4. 未读通知计数（每 30s 轮询）
  useEffect(() => {
    if (!user) { setUnread(0); return }
    getUnreadCount(user.id).then(setUnread).catch(() => {})
    const timer = setInterval(() => getUnreadCount(user.id).then(setUnread).catch(() => {}), 30000)
    return () => clearInterval(timer)
  }, [user])

  // 5. 个性化推荐：基于历史咨询提取高频关键词作为推荐
  useEffect(() => {
    if (!user) { setRecommended([]); return }
    getConsultHistory(user.id, 10, 0).then(history => {
      if (history.length === 0) return
      const keywords = ['租房', '押金', '合同', '试用期', '工资', '加班', '离职', '赔偿', '退款', '投诉', '仲裁', '起诉']
      const scored = keywords.map(kw => {
        const count = history.filter(h => h.question.includes(kw)).length
        return { kw, count }
      }).filter(s => s.count > 0).sort((a, b) => b.count - a.count).slice(0, 5)
      if (scored.length > 0) {
        const recs = scored.map(s => {
          if (s.kw === '租房' || s.kw === '押金') return '房东不退押金怎么办？'
          if (s.kw === '合同') return '签合同时要注意哪些条款？'
          if (s.kw === '试用期' || s.kw === '离职') return '试用期被辞退有赔偿吗？'
          if (s.kw === '工资' || s.kw === '加班') return '加班费怎么计算？'
          if (s.kw === '赔偿' || s.kw === '仲裁' || s.kw === '起诉') return '怎么申请劳动仲裁？'
          if (s.kw === '退款' || s.kw === '投诉') return '买到假货如何维权？'
          return `${s.kw}相关问题`
        }).filter((v, i, a) => a.indexOf(v) === i)
        setRecommended(recs)
      }
    }).catch(() => {})
  }, [user])

  const navigate = (path: string) => {
    // TabBar 页面必须用 switchTab，非 TabBar 页面用 navigateTo
    if (TAB_BAR_PATHS.includes(path)) {
      Taro.switchTab({ url: path })
    } else {
      Taro.navigateTo({ url: path })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero区域 */}
      <div className="bg-primary-solid px-6 pt-8 pb-12">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="i-mdi-scale-balance text-3xl text-primary-foreground opacity-80" />
            <span className="text-2xl font-bold text-primary-foreground">法律助手</span>
          </div>
          <div className="flex items-center gap-2">
            {/* 位置标签 */}
            {currentCity ? (
              <div className="flex items-center gap-1 px-3 py-1 bg-white/20 rounded-full">
                <div className="i-mdi-map-marker text-xl text-primary-foreground opacity-80" />
                <span className="text-xl text-primary-foreground opacity-90">
                  {currentDistrict ? `${currentCity}·${currentDistrict}` : currentCity}
                </span>
              </div>
            ) : null}
            {/* 个人中心入口 */}
            <div className="relative"
              onClick={() => {
                if (user) Taro.navigateTo({ url: '/pages/profile/index' })
                else Taro.navigateTo({ url: '/pages/login/index' })
              }}>
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/20 active:opacity-70 transition-opacity">
                <div className="i-mdi-account-outline text-2xl text-primary-foreground" />
              </div>
              {unread > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                  <span className="text-xs text-white font-bold">{unread > 9 ? '9+' : unread}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <p className="text-xl text-primary-foreground opacity-80">专为大学生设计的法律知识平台</p>
        <p className="text-xl text-primary-foreground opacity-60 mt-1">租房 · 求职 · 维权</p>
      </div>

      {/* 热门避雷指南滚动条 */}
      <div className="px-4 -mt-4 mb-0">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <div className="i-mdi-alert-outline text-xl text-amber-600 flex-shrink-0" />
            <span className="text-xl font-semibold text-amber-700">热门避雷指南</span>
          </div>
          <Swiper
            autoplay
            interval={3500}
            duration={400}
            vertical
            style={{ height: '48px' }}
            circular
          >
            {(warnings.length > 0 ? warnings.map(w => w.content) : WARNINGS).map((w, i) => (
              <SwiperItem key={i}>
                <div
                  className="flex items-center px-4 h-full active:opacity-70"
                  onClick={() => {
                    // 提取避雷要点作为咨询问题
                    const point = w.replace(/^避雷\s*\|\s*/, '')
                    Taro.setStorageSync('consult_prefill', `${point}，请问相关法律依据是什么？`)
                    Taro.switchTab({ url: '/pages/consult/index' })
                  }}
                >
                  <p className="text-xl text-amber-800 leading-snug line-clamp-1">{w}</p>
                  <div className="i-mdi-arrow-right text-xl text-amber-400 flex-shrink-0 ml-1" />
                </div>
              </SwiperItem>
            ))}
          </Swiper>
        </div>
      </div>

      {/* 核心功能 */}
      <div className="px-4 mt-3">
        <div className="bg-card rounded-2xl shadow-sm p-4">
          <p className="text-xl font-semibold text-foreground mb-3">核心功能</p>
          <div className="grid grid-cols-2 gap-3">
            {features.map((item) => (
              <div
                key={item.title}
                className="bg-secondary rounded-xl p-4 flex flex-col gap-2 transition-all active:scale-95"
                onClick={() => navigate(item.path)}
              >
                <div className={`${item.icon} text-3xl text-primary`} />
                <p className="text-xl font-semibold text-foreground">{item.title}</p>
                <p className="text-xl text-muted-foreground leading-snug">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 为你推荐 — 基于咨询历史 */}
      {recommended.length > 0 && (
        <div className="px-4 mt-4">
          <div className="bg-card rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="i-mdi-star-outline text-2xl text-amber-500" />
              <p className="text-xl font-semibold text-foreground">为你推荐</p>
              <span className="text-base text-muted-foreground">基于你的咨询历史</span>
            </div>
            <div className="flex flex-col gap-2">
              {recommended.map((q, i) => (
                <div key={i}
                  className="flex items-center gap-3 py-2 border-b border-border last:border-0 active:opacity-70 transition-opacity"
                  onClick={() => {
                    Taro.setStorageSync('consult_prefill', q)
                    Taro.switchTab({ url: '/pages/consult/index' })
                  }}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${i === 0 ? 'bg-amber-100' : 'bg-secondary'}`}>
                    <span className={`text-base font-bold ${i === 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>{i + 1}</span>
                  </div>
                  <p className="text-xl text-foreground leading-snug flex-1">{q}</p>
                  <div className="i-mdi-arrow-right text-xl text-muted-foreground flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 本周热点问题 */}
      {hotQuestions.length > 0 && (
        <div className="px-4 mt-4">
          <div className="bg-card rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="i-mdi-trending-up text-2xl text-primary" />
              <p className="text-xl font-semibold text-foreground">本周大家都在问</p>
            </div>
            <div className="flex flex-col gap-2">
              {hotQuestions.map((q, i) => {
                const rankColors = ['text-amber-500', 'text-gray-400', 'text-orange-400', 'text-muted-foreground', 'text-muted-foreground']
                return (
                  <div
                    key={q.id}
                    className="flex items-center gap-3 py-2 border-b border-border last:border-0 active:opacity-70 transition-opacity"
                    onClick={() => {
                      Taro.setStorageSync('consult_prefill', q.question_text)
                      Taro.switchTab({ url: '/pages/consult/index' })
                    }}
                  >
                    <span className={`text-xl font-bold w-5 text-center ${rankColors[i] || 'text-muted-foreground'}`}>
                      {i + 1}
                    </span>
                    <p className="text-xl text-foreground leading-snug flex-1 line-clamp-1">{q.question_text}</p>
                    <span className="text-xl text-muted-foreground flex-shrink-0">{q.count}次</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 快捷工具 */}
      <div className="px-4 mt-4">
        <div className="bg-card rounded-2xl shadow-sm p-4">
          <p className="text-xl font-semibold text-foreground mb-3">快捷计算器</p>
          <div className="flex flex-col gap-3">
            {tools.map((tool) => (
              <div
                key={tool.title}
                className="flex items-center justify-between px-4 py-3 bg-secondary rounded-xl transition-all active:scale-95"
                onClick={() => navigate(`${tool.path}?${tool.query}`)}
              >
                <div className="flex items-center gap-3">
                  <div className={`${tool.icon} text-2xl text-primary`} />
                  <span className="text-xl text-foreground">{tool.title}</span>
                </div>
                <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 法律小贴士 */}
      <div className="px-4 mt-4 mb-8">
        <div className="bg-card rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="i-mdi-lightbulb-on-outline text-2xl text-primary" />
            <p className="text-xl font-semibold text-foreground">法律小贴士</p>
          </div>
          <div className="flex flex-col gap-2">
            {tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                <span className="text-xl font-bold text-primary mt-0.5">{i + 1}</span>
                <p className="text-xl text-foreground leading-relaxed flex-1">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
