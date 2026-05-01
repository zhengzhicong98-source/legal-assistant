import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { Swiper, SwiperItem } from '@tarojs/components'

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
        <div className="flex items-center gap-3 mb-3">
          <div className="i-mdi-scale-balance text-3xl text-primary-foreground opacity-80" />
          <span className="text-2xl font-bold text-primary-foreground">法律助手</span>
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
            {WARNINGS.map((w, i) => (
              <SwiperItem key={i}>
                <div className="flex items-center px-4 h-full">
                  <p className="text-xl text-amber-800 leading-snug line-clamp-1">{w}</p>
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
