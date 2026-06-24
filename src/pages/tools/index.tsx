import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'

const toolGroups = [
  {
    title: '法律文书',
    items: [
      { icon: 'i-mdi-file-document-edit-outline', title: '文书生成', desc: '劳动合同解除书、催收函等', path: '/pages/document/index' },
    ],
  },
  {
    title: '计算工具',
    items: [
      { icon: 'i-mdi-stethoscope', title: '病假工资计算器', desc: '根据工资和病假天数计算应得工资', path: '/pages/calculator/index?type=sick' },
      { icon: 'i-mdi-home-alert-outline', title: '违约金计算器', desc: '租房提前退租违约金计算', path: '/pages/calculator/index?type=penalty' },
      { icon: 'i-mdi-clock-outline', title: '加班工资计算器', desc: '平日/休息日/法定假日加班费', path: '/pages/calculator/index?type=overtime' },
      { icon: 'i-mdi-cash-multiple', title: '离职补偿计算器', desc: 'N/N+1/2N 经济补偿金速算', path: '/pages/calculator/index?type=severance' },
      { icon: 'i-mdi-account-cash-outline', title: '试用期工资计算器', desc: '试用期工资不得低于转正80%', path: '/pages/calculator/index?type=probation' },
    ],
  },
  {
    title: '法律资源',
    items: [
      { icon: 'i-mdi-bookshelf', title: '法律知识库', desc: '浏览劳动法、租房、消费等法律法规原文', path: '/pages/knowledge/index' },
      { icon: 'i-mdi-map-marker-outline', title: '维权导航', desc: '全国劳动仲裁、消协、法援中心', path: '/pages/rights/index' },
      { icon: 'i-mdi-clipboard-check-outline', title: '证据采集向导', desc: '勾选已有证据，AI提示补充方向', path: '/pages/evidence/index' },
    ],
  },
  {
    title: '管理员',
    items: [
      { icon: 'i-mdi-database-cog-outline', title: '知识库管理', desc: '上传法律条文，启用 RAG 增强回答', path: '/pages/admin/index' },
    ],
  },
]

export default function Tools() {
  useShareAppMessage(() => ({
    title: '工具箱 - 法律助手',
    path: '/pages/tools/index',
  }))
  useShareTimeline(() => ({ title: '工具箱 - 法律助手' }))

  const navigate = (path: string) => {
    Taro.navigateTo({ url: path })
  }

  return (
    <div className="min-h-screen bg-background px-4 py-4">
      {toolGroups.map((group) => (
        <div key={group.title} className="mb-4">
          <p className="text-xl font-semibold text-muted-foreground mb-2 px-1">{group.title}</p>
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {group.items.map((item, idx) => (
              <div
                key={item.title}
                className={`flex items-center gap-4 px-4 py-4 transition-all active:bg-muted ${idx < group.items.length - 1 ? 'border-b border-border' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <div className={`${item.icon} text-3xl text-primary flex-shrink-0`} />
                <div className="flex-1">
                  <p className="text-xl font-medium text-foreground">{item.title}</p>
                  <p className="text-xl text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 免责声明 */}
      <div className="mt-4 px-4 py-4 bg-muted rounded-2xl">
        <div className="flex items-start gap-2">
          <div className="i-mdi-information-outline text-xl text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xl text-muted-foreground leading-relaxed">
            本工具提供的信息仅供参考，不构成正式法律建议。如涉及重大法律事务，请咨询持证律师。
          </p>
        </div>
      </div>
    </div>
  )
}
