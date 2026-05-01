import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { Picker } from '@tarojs/components'
import { getProvinces, getCitiesByProvince, getRightsCenters } from '@/db/api'
import { callEdgeFunction } from '@/utils/callEdgeFunction'
import type { RightsCenter } from '@/db/types'

const TYPE_OPTIONS = ['全部', '劳动仲裁委', '消费者协会', '法律援助中心'] as const
const TYPE_ICONS: Record<string, string> = {
  '劳动仲裁委': 'i-mdi-gavel',
  '消费者协会': 'i-mdi-shield-check-outline',
  '法律援助中心': 'i-mdi-scale-balance',
}

const SCENARIOS = [
  '房东不退押金',
  '劳动合同纠纷（拖欠工资）',
  '购买商品质量问题',
  '培训机构退款纠纷',
  '网购退换货被拒',
  '其他维权场景',
]

interface BaiduPlace {
  name: string
  address: string
  uid: string
  province?: string
  city?: string
  area?: string
  location: { lat: number; lng: number }
  detail_info?: { distance?: number; shop_hours?: string; overall_rating?: string }
}

/** 导航到指定经纬度（来自百度附近搜索结果） */
function openNavigation(place: BaiduPlace) {
  Taro.openLocation({
    latitude: place.location.lat,
    longitude: place.location.lng,
    name: place.name,
    address: place.address || '',
    scale: 17,
  }).catch(() => {
    Taro.showToast({ title: '导航打开失败，请手动复制地址', icon: 'none' })
  })
}

/** 通过机构名称+城市在百度地图搜索并导航 */
async function navigateByName(name: string, city: string) {
  Taro.showToast({ title: '正在定位...', icon: 'none', duration: 3000 })
  const { data, error } = await callEdgeFunction<{ results?: BaiduPlace[] }>(
    `place-search?mode=region&query=${encodeURIComponent(name)}&region=${encodeURIComponent(city)}`,
    { method: 'GET' }
  )
  if (error || !data?.results?.length) {
    Taro.showToast({ title: '未找到该机构位置，请手动搜索', icon: 'none' })
    return
  }
  const place = data.results[0]
  if (!place?.location) {
    Taro.showToast({ title: '位置数据异常，请手动搜索', icon: 'none' })
    return
  }
  openNavigation(place)
}

function CenterCard({ center }: { center: RightsCenter }) {
  const [expanded, setExpanded] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const icon = TYPE_ICONS[center.type] || 'i-mdi-office-building-outline'

  const callPhone = () => {
    if (center.phone) {
      Taro.makePhoneCall({ phoneNumber: center.phone })
    }
  }

  const handleNavigate = async () => {
    setNavigating(true)
    await navigateByName(center.name, center.city || center.province || '')
    setNavigating(false)
  }

  return (
    <div className="bg-card rounded-xl border border-border mb-3 overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-4" onClick={() => setExpanded(!expanded)}>
        <div className={`${icon} text-2xl text-primary flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          <p className="text-xl font-semibold text-foreground">{center.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xl px-2 py-0.5 bg-secondary text-primary rounded">{center.type}</span>
            <span className="text-xl text-muted-foreground">{center.city}</span>
          </div>
        </div>
        <div className={`i-mdi-chevron-down text-xl text-muted-foreground transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {center.address && (
            <div className="flex items-start gap-2">
              <div className="i-mdi-map-marker-outline text-xl text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xl text-foreground">{center.address}</p>
            </div>
          )}
          {center.working_hours && (
            <div className="flex items-start gap-2">
              <div className="i-mdi-clock-outline text-xl text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xl text-foreground">{center.working_hours}</p>
            </div>
          )}
          {center.process && (
            <div>
              <p className="text-xl font-medium text-foreground mb-2">办事流程</p>
              <div className="law-quote">
                <p className="text-xl text-foreground leading-relaxed">{center.process}</p>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            {center.phone && (
              <button
                type="button"
                className="flex-1 flex items-center justify-center leading-none gap-2 bg-primary rounded-xl"
                onClick={callPhone}
              >
                <div className="py-3 flex items-center gap-2">
                  <div className="i-mdi-phone-outline text-2xl text-primary-foreground" />
                  <span className="text-xl text-primary-foreground break-keep">拨打 {center.phone}</span>
                </div>
              </button>
            )}
            <button
              type="button"
              className="flex-1 flex items-center justify-center leading-none gap-2 bg-secondary rounded-xl border border-primary"
              style={{ opacity: navigating ? 0.6 : 1 }}
              onClick={handleNavigate}
            >
              <div className="py-3 flex items-center gap-2">
                {navigating
                  ? <div className="i-mdi-loading text-2xl text-primary animate-spin" />
                  : <div className="i-mdi-navigation-outline text-2xl text-primary" />
                }
                <span className="text-xl text-primary break-keep">{navigating ? '定位中' : '导航'}</span>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** 附近机构卡片 */
function NearbyCard({ place }: { place: BaiduPlace }) {
  return (
    <div className="bg-card rounded-xl border border-border mb-3 px-4 py-4 flex items-start gap-3">
      <div className="i-mdi-map-marker text-2xl text-primary flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-xl font-semibold text-foreground">{place.name}</p>
        <p className="text-xl text-muted-foreground mt-1">{place.address}</p>
        {place.detail_info?.distance != null && (
          <p className="text-xl text-primary mt-1">距您约 {place.detail_info.distance} 米</p>
        )}
        {place.detail_info?.shop_hours && (
          <div className="flex items-center gap-1 mt-1">
            <div className="i-mdi-clock-outline text-xl text-muted-foreground" />
            <span className="text-xl text-muted-foreground">{place.detail_info.shop_hours}</span>
          </div>
        )}
      </div>
      <button
        type="button"
        className="flex-shrink-0 flex items-center justify-center leading-none bg-primary rounded-xl"
        onClick={() => openNavigation(place)}
      >
        <div className="px-3 py-2 flex items-center gap-1">
          <div className="i-mdi-navigation text-xl text-primary-foreground" />
          <span className="text-xl text-primary-foreground break-keep">导航</span>
        </div>
      </button>
    </div>
  )
}

export default function Rights() {
  const [activeTab, setActiveTab] = useState<'region' | 'nearby'>('region')

  // 地区查询
  const [provinces, setProvinces] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [selectedProvince, setSelectedProvince] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedType, setSelectedType] = useState<string>('全部')
  const [centers, setCenters] = useState<RightsCenter[]>([])
  const [loading, setLoading] = useState(false)

  // 附近机构
  const [nearbyResults, setNearbyResults] = useState<BaiduPlace[]>([])
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [nearbySearched, setNearbySearched] = useState(false)

  // 投诉话术生成器
  const [showScriptGen, setShowScriptGen] = useState(false)
  const [scriptScenario, setScriptScenario] = useState('')
  const [scriptDetails, setScriptDetails] = useState('')
  const [scriptTarget, setScriptTarget] = useState('12315')
  const [generatingScript, setGeneratingScript] = useState(false)
  const [generatedScript, setGeneratedScript] = useState('')

  const loadProvinces = useCallback(async () => {
    const data = await getProvinces()
    setProvinces(data)
  }, [])

  useEffect(() => { loadProvinces() }, [loadProvinces])

  const handleProvinceChange = useCallback(async (province: string) => {
    setSelectedProvince(province)
    setSelectedCity('')
    setCenters([])
    if (province) {
      const data = await getCitiesByProvince(province)
      setCities(data)
    } else {
      setCities([])
    }
  }, [])

  const handleSearch = useCallback(async () => {
    if (!selectedProvince) {
      Taro.showToast({ title: '请先选择省份', icon: 'none' })
      return
    }
    setLoading(true)
    const data = await getRightsCenters({
      province: selectedProvince,
      city: selectedCity || undefined,
      type: selectedType === '全部' ? undefined : selectedType,
    })
    setCenters(data)
    setLoading(false)
  }, [selectedProvince, selectedCity, selectedType])

  /** 获取用户位置并搜索附近维权机构 */
  const handleSearchNearby = useCallback(async () => {
    setNearbyLoading(true)
    setNearbyResults([])
    try {
      const loc = await Taro.getFuzzyLocation({ type: 'wgs84' })
      const { data, error } = await callEdgeFunction<{ results?: BaiduPlace[]; status?: number }>(
        `place-search?mode=nearby&lat=${loc.latitude}&lng=${loc.longitude}&radius=5000`,
        { method: 'GET' }
      )
      if (error) {
        Taro.showToast({ title: '搜索失败，请稍后重试', icon: 'none' })
        return
      }
      const results = data?.results || []
      setNearbyResults(results)
      setNearbySearched(true)
      if (results.length === 0) {
        Taro.showToast({ title: '5公里内暂无相关机构', icon: 'none' })
      }
    } catch {
      Taro.showToast({ title: '获取位置失败，请检查定位权限', icon: 'none' })
    } finally {
      setNearbyLoading(false)
    }
  }, [])

  const handleGenerateScript = useCallback(async () => {
    if (!scriptScenario) {
      Taro.showToast({ title: '请选择维权场景', icon: 'none' })
      return
    }
    if (!scriptDetails.trim()) {
      Taro.showToast({ title: '请填写基本情况', icon: 'none' })
      return
    }
    setGeneratingScript(true)
    setGeneratedScript('')
    try {
      const prompt = `我需要拨打${scriptTarget}投诉，场景是：${scriptScenario}。\n\n具体情况：${scriptDetails}\n\n请帮我生成一段60秒左右的投诉话术，要求：开门见山说明诉求、关键事实清晰准确、口语化易于表达、语气礼貌但坚定。\n\n直接输出话术内容，不要额外分析。`

      const { data, error } = await callEdgeFunction<{ content?: string }>('legal-chat', {
        body: { messages: [{ role: 'user', content: prompt }], mode: 'chat' },
      })
      if (error) {
        Taro.showToast({ title: '生成失败，请重试', icon: 'none' })
        return
      }
      const rawContent: string = data?.content || ''
      const mainContent = rawContent.split('---法律依据---')[0].replace('[结论与分析]', '').trim()
      setGeneratedScript(mainContent)
    } catch {
      Taro.showToast({ title: '网络异常，请稍后重试', icon: 'none' })
    } finally {
      setGeneratingScript(false)
    }
  }, [scriptScenario, scriptDetails, scriptTarget])

  const filteredCenters = useMemo(() => {
    if (selectedType === '全部') return centers
    return centers.filter(c => c.type === selectedType)
  }, [centers, selectedType])

  return (
    <div className="min-h-screen bg-background">
      {/* 标签切换 */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 pt-3">
        <div className="flex gap-1 bg-muted rounded-xl p-1 mb-0">
          {[
            { key: 'region' as const, icon: 'i-mdi-map-search', label: '地区查询' },
            { key: 'nearby' as const, icon: 'i-mdi-map-marker-radius', label: '附近机构' },
          ].map(tab => (
            <div
              key={tab.key}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all ${activeTab === tab.key ? 'bg-card shadow-sm' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <div className={`${tab.icon} text-xl ${activeTab === tab.key ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-xl font-medium ${activeTab === tab.key ? 'text-primary' : 'text-muted-foreground'}`}>{tab.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 地区查询 Tab */}
      {activeTab === 'region' && (
        <>
          {/* 搜索条件 */}
          <div className="bg-card border-b border-border px-4 py-4">
            <div className="flex gap-3 mb-3">
              {/* 省份选择 */}
              <div className="flex-1 border border-input rounded-lg px-3 py-3 bg-background overflow-hidden">
                <Picker
                  mode="selector"
                  range={['请选择省份', ...provinces]}
                  value={selectedProvince ? provinces.indexOf(selectedProvince) + 1 : 0}
                  onChange={(e) => {
                    const ev = e as any
                    const idx = Number(ev.detail?.value ?? ev.target?.value ?? 0)
                    const province = idx === 0 ? '' : provinces[idx - 1] || ''
                    handleProvinceChange(province)
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xl ${selectedProvince ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {selectedProvince || '选择省份'}
                    </span>
                    <div className="i-mdi-chevron-down text-xl text-muted-foreground" />
                  </div>
                </Picker>
              </div>

              {/* 城市选择 */}
              <div className="flex-1 border border-input rounded-lg px-3 py-3 bg-background overflow-hidden">
                <Picker
                  mode="selector"
                  range={['全部城市', ...cities]}
                  value={selectedCity ? cities.indexOf(selectedCity) + 1 : 0}
                  disabled={cities.length === 0}
                  onChange={(e) => {
                    const ev = e as any
                    const idx = Number(ev.detail?.value ?? ev.target?.value ?? 0)
                    const city = idx === 0 ? '' : cities[idx - 1] || ''
                    setSelectedCity(city)
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xl ${selectedCity ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {selectedCity || (cities.length === 0 ? '请先选省份' : '全部城市')}
                    </span>
                    <div className="i-mdi-chevron-down text-xl text-muted-foreground" />
                  </div>
                </Picker>
              </div>
            </div>

            <div className="flex gap-2 mb-3 overflow-x-auto">
              {TYPE_OPTIONS.map(type => (
                <span
                  key={type}
                  className={`flex-shrink-0 text-xl px-3 py-2 rounded-full border transition-all ${selectedType === type ? 'border-primary bg-secondary text-primary' : 'border-border bg-background text-muted-foreground'}`}
                  onClick={() => setSelectedType(type)}
                >
                  {type}
                </span>
              ))}
            </div>

            <button
              type="button"
              className="flex items-center justify-center leading-none w-full bg-primary rounded-xl"
              style={{ opacity: loading ? 0.5 : 1 }}
              onClick={handleSearch}
            >
              <div className="py-3 flex items-center gap-2">
                {loading
                  ? <div className="i-mdi-loading text-2xl text-primary-foreground animate-spin" />
                  : <div className="i-mdi-magnify text-2xl text-primary-foreground" />
                }
                <span className="text-xl text-primary-foreground">{loading ? '查询中...' : '查询机构'}</span>
              </div>
            </button>
          </div>

          {/* 投诉话术生成器 */}
          <div className="px-4 py-3 border-b border-border">
            <div
              className="flex items-center gap-3 px-4 py-4 bg-card rounded-2xl border border-border"
              onClick={() => setShowScriptGen(!showScriptGen)}
            >
              <div className="i-mdi-microphone-outline text-2xl text-primary" />
              <div className="flex-1">
                <p className="text-xl font-semibold text-foreground">投诉话术生成器</p>
                <p className="text-xl text-muted-foreground">拨打12315/12348前，AI帮你准备</p>
              </div>
              <div className={`i-mdi-chevron-down text-xl text-muted-foreground transition-transform ${showScriptGen ? 'rotate-180' : ''}`} />
            </div>

            {showScriptGen && (
              <div className="mt-3 bg-card rounded-2xl border border-border p-4 flex flex-col gap-4">
                <div>
                  <p className="text-xl font-medium text-foreground mb-2">投诉至</p>
                  <div className="flex gap-3">
                    {['12315', '12348', '12333'].map(t => (
                      <span
                        key={t}
                        className={`flex-1 text-center text-xl px-3 py-2 rounded-xl border transition-all ${scriptTarget === t ? 'border-primary bg-secondary text-primary' : 'border-border bg-background text-muted-foreground'}`}
                        onClick={() => setScriptTarget(t)}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xl font-medium text-foreground mb-2">维权场景 <span className="text-destructive">*</span></p>
                  <div className="flex flex-col gap-2">
                    {SCENARIOS.map(s => (
                      <span
                        key={s}
                        className={`text-xl px-3 py-2 rounded-xl border transition-all ${scriptScenario === s ? 'border-primary bg-secondary text-primary' : 'border-border bg-background text-foreground'}`}
                        onClick={() => setScriptScenario(s)}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xl font-medium text-foreground mb-2">简述基本情况 <span className="text-destructive">*</span></p>
                  <div className="border border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
                    <textarea
                      className="w-full text-xl text-foreground bg-transparent outline-none"
                      style={{ height: '80px', resize: 'none' }}
                      placeholder="如：房东收了3000元押金，退房已过30天未退，发短信不回复..."
                      value={scriptDetails}
                      onInput={(e) => { const ev = e as any; setScriptDetails(ev.detail?.value ?? ev.target?.value ?? '') }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="flex items-center justify-center leading-none bg-primary rounded-xl"
                  style={{ opacity: generatingScript ? 0.5 : 1 }}
                  onClick={handleGenerateScript}
                >
                  <div className="py-3 flex items-center gap-2">
                    {generatingScript
                      ? <div className="i-mdi-loading text-2xl text-primary-foreground animate-spin" />
                      : <div className="i-mdi-text-box-outline text-2xl text-primary-foreground" />
                    }
                    <span className="text-xl text-primary-foreground">{generatingScript ? '生成中...' : '生成投诉话术'}</span>
                  </div>
                </button>

                {generatedScript && (
                  <div>
                    <p className="text-xl font-medium text-foreground mb-2">你的投诉话术</p>
                    <div className="law-quote">
                      <p className="text-xl text-foreground leading-relaxed whitespace-pre-wrap">{generatedScript}</p>
                    </div>
                    <div className="flex items-start gap-2 mt-3 px-3 py-2 bg-muted rounded-xl">
                      <div className="i-mdi-information-outline text-xl text-muted-foreground flex-shrink-0 mt-0.5" />
                      <p className="text-xl text-muted-foreground leading-relaxed">本回复由AI生成，仅供参考，不构成正式法律建议。若情况紧急请咨询专业律师。</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 地区查询结果 */}
          <div className="px-4 py-4">
            {!selectedProvince && centers.length === 0 && (
              <div className="flex flex-col items-center py-16">
                <div className="i-mdi-map-search-outline text-6xl text-muted-foreground opacity-30 mb-4" />
                <p className="text-xl text-muted-foreground">请选择省份查询维权机构</p>
              </div>
            )}
            {loading && (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-card rounded-xl border border-border p-4">
                    <div className="skeleton h-6 rounded mb-2 w-48" />
                    <div className="skeleton h-4 rounded w-24" />
                  </div>
                ))}
              </div>
            )}
            {!loading && centers.length > 0 && (
              <div>
                <p className="text-xl text-muted-foreground mb-3">共找到 {filteredCenters.length} 个机构</p>
                {filteredCenters.map(center => (
                  <CenterCard key={center.id} center={center} />
                ))}
              </div>
            )}
            {!loading && selectedProvince && centers.length === 0 && (
              <div className="flex flex-col items-center py-16">
                <div className="i-mdi-map-marker-off-outline text-6xl text-muted-foreground opacity-30 mb-4" />
                <p className="text-xl text-muted-foreground">暂无该地区机构数据</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* 附近机构 Tab */}
      {activeTab === 'nearby' && (
        <div className="px-4 py-4">
          {/* 说明卡片 */}
          <div className="bg-gradient-subtle rounded-2xl border border-border px-4 py-4 mb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="i-mdi-map-marker-radius text-2xl text-primary" />
              <p className="text-xl font-semibold text-foreground">附近维权机构</p>
            </div>
            <p className="text-xl text-muted-foreground leading-relaxed">搜索您当前位置5公里内的劳动仲裁委、消协、法律援助中心，支持一键导航。</p>
          </div>

          <button
            type="button"
            className="flex items-center justify-center leading-none w-full bg-primary rounded-xl mb-4"
            style={{ opacity: nearbyLoading ? 0.5 : 1 }}
            onClick={handleSearchNearby}
          >
            <div className="py-4 flex items-center gap-2">
              {nearbyLoading
                ? <div className="i-mdi-loading text-2xl text-primary-foreground animate-spin" />
                : <div className="i-mdi-crosshairs-gps text-2xl text-primary-foreground" />
              }
              <span className="text-xl text-primary-foreground">{nearbyLoading ? '定位搜索中...' : '获取位置并搜索'}</span>
            </div>
          </button>

          {nearbyLoading && (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-card rounded-xl border border-border p-4">
                  <div className="skeleton h-6 rounded mb-2 w-48" />
                  <div className="skeleton h-4 rounded w-32 mb-1" />
                  <div className="skeleton h-4 rounded w-20" />
                </div>
              ))}
            </div>
          )}

          {!nearbyLoading && nearbyResults.length > 0 && (
            <div>
              <p className="text-xl text-muted-foreground mb-3">找到 {nearbyResults.length} 个附近机构</p>
              {nearbyResults.map((place, idx) => (
                <NearbyCard key={place.uid || idx} place={place} />
              ))}
            </div>
          )}

          {!nearbyLoading && nearbySearched && nearbyResults.length === 0 && (
            <div className="flex flex-col items-center py-16">
              <div className="i-mdi-map-marker-off-outline text-6xl text-muted-foreground opacity-30 mb-4" />
              <p className="text-xl text-muted-foreground">附近5公里内暂无相关机构</p>
            </div>
          )}

          {!nearbyLoading && !nearbySearched && (
            <div className="flex flex-col items-center py-16">
              <div className="i-mdi-map-search text-6xl text-muted-foreground opacity-30 mb-4" />
              <p className="text-xl text-muted-foreground">点击上方按钮搜索附近机构</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
