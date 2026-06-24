import { useState, useCallback, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { Picker } from '@tarojs/components'
import { getProvinces, getCitiesByProvince, getRightsCenters } from '@/db/api'
import { callEdgeFunction } from '@/utils/callEdgeFunction'
import type { RightsCenter } from '@/db/types'

const TYPE_OPTIONS = ['全部', '劳动仲裁委', '消费者协会', '法律援助中心', '劳动监察大队', '市场监督管理局', '人民法院立案庭'] as const
const TYPE_ICONS: Record<string, string> = {
  '劳动仲裁委': 'i-mdi-gavel',
  '消费者协会': 'i-mdi-shield-check-outline',
  '法律援助中心': 'i-mdi-scale-balance',
  '劳动监察大队': 'i-mdi-bullhorn-outline',
  '市场监督管理局': 'i-mdi-store-check-outline',
  '人民法院立案庭': 'i-mdi-bank-outline',
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
  if (process.env.TARO_ENV === 'h5') {
    // H5 环境：直接打开高德地图网页导航
    const url = `https://uri.amap.com/navigation?to=${place.location.lng},${place.location.lat},${encodeURIComponent(place.name)}&mode=car&callnative=1`
    window.open(url, '_blank')
    return
  }
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

/** 通过地址调用地理编码接口获取坐标（返回 bd09ll），失败返回 null */
async function geocodeAddress(
  address: string,
  city?: string
): Promise<{ lat: number; lng: number } | null> {
  const { data, error } = await callEdgeFunction<{
    status: string
    geocodes?: { location: string; level: string }[]
  }>('geocoding', { body: { address, city } })

  if (error || !data || data.status !== '1' || !data.geocodes?.length) return null

  const location = data.geocodes[0].location  // 格式："lng,lat"
  const [lng, lat] = location.split(',').map(Number)
  if (!lng || !lat) return null

  return { lat, lng }
}
/** 通过机构名称+城市在百度地图搜索并导航（兜底方案） */
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

/** 秒转"X分钟" / "约X小时" */
function formatDuration(seconds: number): string {
  if (seconds < 60) return '不到1分钟'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `约${mins}分钟`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return rest > 0 ? `约${hours}小时${rest}分` : `约${hours}小时`
}
/** 米转"X公里" / "X米" */
function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}公里`
  return `${Math.round(meters)}米`
}

interface RouteInfo {
  distance: number // 米
  duration: number // 秒
}

/** 查询单种出行方式路线 */
async function fetchRoute(
  mode: 'driving' | 'walking' | 'transit',
  origin: string,   // 格式 "纬度,经度"（来自 getFuzzyLocation）
  destination: string  // 格式 "纬度,经度"（来自 geocodeAddress）
): Promise<RouteInfo | null> {
  // 高德需要 "经度,纬度"，前端传来的是 "纬度,经度"，需要翻转
  const flipCoord = (coord: string) => coord.split(',').reverse().join(',')
  const amapOrigin = flipCoord(origin)
  const amapDest = flipCoord(destination)

  const { data, error } = await callEdgeFunction<{
    status: string
    route?: {
      paths?: { distance: string; duration: string }[]  // driving/walking
      transits?: { duration: string; distance: string }[]  // transit
    }
  }>(
    'route-direction',
    { body: { mode, origin: amapOrigin, destination: amapDest } }
  )

  if (error || !data || data.status !== '1') return null

  // driving/walking 用 paths，transit 用 transits
  const item = data.route?.paths?.[0] ?? data.route?.transits?.[0]
  if (!item) return null

  return {
    distance: Number(item.distance),
    duration: Number(item.duration),
  }
}

function CenterCard({ center }: { center: RightsCenter }) {
  const [expanded, setExpanded] = useState(false)
  const [navigating, setNavigating] = useState(false)
  // 路线预览状态
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeData, setRouteData] = useState<{
    driving: RouteInfo | null
    walking: RouteInfo | null
    transit: RouteInfo | null
  } | null>(null)

  const icon = TYPE_ICONS[center.type] || 'i-mdi-office-building-outline'

  const callPhone = () => {
    if (center.phone) Taro.makePhoneCall({ phoneNumber: center.phone })
  }

  const handleNavigate = async () => {
    setNavigating(true)
    Taro.showToast({ title: '正在定位...', icon: 'none', duration: 3000 })
    try {
      // 优先用精确地址做地理编码，无地址时降级到名称搜索
      if (center.address) {
        const loc = await geocodeAddress(center.address, center.city || center.province || undefined)
        if (loc) {
          if (process.env.TARO_ENV === 'h5') {
            const url = `https://uri.amap.com/navigation?to=${loc.lng},${loc.lat},${encodeURIComponent(center.name)}&mode=car&callnative=1`
            window.open(url, '_blank')
          } else {
            await Taro.openLocation({
              latitude: loc.lat,
              longitude: loc.lng,
              name: center.name,
              address: center.address,
              scale: 17,
            }).catch(() => {
              Taro.showToast({ title: '导航打开失败，请手动复制地址', icon: 'none' })
            })
          }
          return
        }
      }
      // 降级：place-search 名称搜索
      await navigateByName(center.name, center.city || center.province || '')
    } finally {
      setNavigating(false)
    }
  }

  /** 查看路线：获取用户位置 + 机构坐标，并行查三种出行方式 */
  const handleViewRoutes = async () => {
    if (routeData) { setRouteData(null); return } // 再次点击收起
    setRouteLoading(true)
    try {
      // 1. 获取用户模糊位置（wgs84）
      const loc = await Taro.getFuzzyLocation({ type: 'wgs84' }).catch(() => null)
      if (!loc) {
        Taro.showToast({ title: '获取位置失败，请检查定位权限', icon: 'none' })
        return
      }
      // 2. 获取机构坐标（bd09ll）：优先精确地址地理编码，降级到 place-search 名称搜索
      let destLoc: { lat: number; lng: number } | null = null
      if (center.address) {
        destLoc = await geocodeAddress(center.address, center.city || center.province || undefined)
      }
      if (!destLoc) {
        const { data: placeData } = await callEdgeFunction<{ results?: BaiduPlace[] }>(
          `place-search?mode=region&query=${encodeURIComponent(center.name)}&region=${encodeURIComponent(center.city || center.province || '')}`,
          { method: 'GET' }
        )
        const place = placeData?.results?.[0]
        if (place?.location) destLoc = place.location
      }
      if (!destLoc) {
        Taro.showToast({ title: '未能定位机构坐标，请使用导航功能', icon: 'none' })
        return
      }
      // origin 用 wgs84，destination 用 bd09ll；coord_type 省略使用默认，误差在城区级别可接受
      const origin = `${loc.latitude},${loc.longitude}`
      const destination = `${destLoc.lat},${destLoc.lng}`
      // 3. 并行查驾车/步行/公交
      const [driving, walking, transit] = await Promise.all([
        fetchRoute('driving', origin, destination),
        fetchRoute('walking', origin, destination),
        fetchRoute('transit', origin, destination),
      ])
      setRouteData({ driving, walking, transit })
    } catch {
      Taro.showToast({ title: '路线查询失败，请稍后重试', icon: 'none' })
    } finally {
      setRouteLoading(false)
    }
  }

  const routeModes = [
    { key: 'driving' as const, icon: 'i-mdi-car-outline', label: '驾车' },
    { key: 'walking' as const, icon: 'i-mdi-walk', label: '步行' },
    { key: 'transit' as const, icon: 'i-mdi-bus-outline', label: '公交' },
  ]

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

          {/* 路线预览区块 */}
          <button
            type="button"
            className="w-full flex items-center justify-center leading-none gap-2 bg-muted rounded-xl border border-border"
            style={{ opacity: routeLoading ? 0.6 : 1 }}
            onClick={handleViewRoutes}
          >
            <div className="py-3 flex items-center gap-2">
              {routeLoading
                ? <div className="i-mdi-loading text-xl text-muted-foreground animate-spin" />
                : <div className={`${routeData ? 'i-mdi-chevron-up' : 'i-mdi-routes'} text-xl text-primary`} />
              }
              <span className="text-xl text-primary break-keep">
                {routeLoading ? '查询路线中...' : routeData ? '收起路线' : '查看出行路线'}
              </span>
            </div>
          </button>

          {/* 路线结果表 */}
          {routeData && (
            <div className="rounded-xl border border-border overflow-hidden">
              {routeModes.map((m) => {
                const info = routeData[m.key]
                return (
                  <div key={m.key} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
                    <div className={`${m.icon} text-2xl text-primary flex-shrink-0`} />
                    <div className="flex-1">
                      <span className="text-xl font-medium text-foreground">{m.label}</span>
                      {info
                        ? <span className="text-xl text-muted-foreground ml-2">{formatDistance(info.distance)} · {formatDuration(info.duration)}</span>
                        : <span className="text-xl text-muted-foreground ml-2">暂无数据</span>
                      }
                    </div>
                  </div>
                )
              })}
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
                <span className="text-xl text-primary break-keep">{navigating ? '定位中' : '打开地图'}</span>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** 附近机构卡片（walkInfo 为批量算路得到的精确步行数据） */
function NearbyCard({ place, walkInfo }: { place: BaiduPlace; walkInfo?: { distance: string; duration: string } | null }) {
  return (
    <div className="bg-card rounded-xl border border-border mb-3 px-4 py-4 flex items-start gap-3">
      <div className="i-mdi-map-marker text-2xl text-primary flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-xl font-semibold text-foreground">{place.name}</p>
        <p className="text-xl text-muted-foreground mt-1">{place.address}</p>
        {/* 优先展示精确步行距离，无则回落到 POI 直线距离 */}
        {walkInfo
          ? (
            <div className="flex items-center gap-1 mt-1">
              <div className="i-mdi-walk text-xl text-primary" />
              <span className="text-xl text-primary">步行 {walkInfo.duration} · {walkInfo.distance}</span>
            </div>
          )
          : place.detail_info?.distance != null && (
            <p className="text-xl text-primary mt-1">直线距离约 {place.detail_info.distance} 米</p>
          )
        }
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
  /** IP 自动定位状态：显示「已自动定位到 XX」提示 */
  const [autoLocCity, setAutoLocCity] = useState('')

  // 附近机构
  const [nearbyResults, setNearbyResults] = useState<BaiduPlace[]>([])
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [nearbySearched, setNearbySearched] = useState(false)
  /** 批量算路得到的精确步行信息，index 与 nearbyResults 对应 */
  const [nearbyWalkInfos, setNearbyWalkInfos] = useState<({ distance: string; duration: string } | null)[]>([])

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

  /** 页面加载时通过模糊定位自动定位到当地维权机构 */
  useEffect(() => {
    const autoLocate = async () => {
      try {
        const loc = await Taro.getFuzzyLocation({ type: 'gcj02' }).catch(() => null)
        if (!loc) return

        const { data, error } = await callEdgeFunction<{
          status: string
          regeocode?: {
            addressComponent?: {
              province?: string
              city?: string | string[]
            }
          }
        }>('reverse-geocoding', {
          body: { location: `${loc.longitude},${loc.latitude}` }
        })

        if (error || !data || data.status !== '1') return

        const component = data.regeocode?.addressComponent
        const province = component?.province || ''
        const city = Array.isArray(component?.city)
          ? province
          : (component?.city || province)

        if (!province) return

        const [citiesData, centersData] = await Promise.all([
          getCitiesByProvince(province),
          getRightsCenters({ province, city: city || undefined }),
        ])
        setProvinces(prev => prev.length > 0 ? prev : [province])
        setCities(citiesData)
        setSelectedProvince(province)
        setSelectedCity(city || '')
        setCenters(centersData)
        setAutoLocCity(city || province)
      } catch {
        // 静默失败
      }
    }
    autoLocate()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- callEdgeFunction/getCitiesByProvince/getRightsCenters are stable imports
  }, [])

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

  /** 获取用户位置并搜索附近维权机构，搜索完成后批量算步行距离 */
  const handleSearchNearby = useCallback(async () => {
    setNearbyLoading(true)
    setNearbyResults([])
    setNearbyWalkInfos([])
    try {
      const loc = await Taro.getFuzzyLocation({ type: 'wgs84' }).catch(() => null)
      if (!loc) {
        Taro.showToast({ title: '获取位置失败，请检查定位权限', icon: 'none' })
        setNearbyLoading(false)
        return
      }
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
        return
      }
      // 批量步行算路：1 个 origin（用户位置），N 个 destination（机构坐标）
      const destinations = results
        .filter(p => p.location?.lat && p.location?.lng)
        .map(p => `${p.location.lat},${p.location.lng}`)
      if (destinations.length > 0) {
        const { data: matrixData } = await callEdgeFunction<{
          status: number
          result?: { distance: { text: string; value: number }; duration: { text: string; value: number } }[]
        }>('route-matrix', {
          body: {
            mode: 'walking',
            origins: [`${loc.latitude},${loc.longitude}`],
            destinations,
          },
        })
        if (matrixData?.status === 0 && matrixData.result) {
          // 结果按 origin×dest 笛卡尔积，只有1个 origin，所以 index 直接对应 destinations
          const infos = results.map((p, i) => {
            if (!p.location?.lat) return null
            const item = matrixData.result![i]
            if (!item) return null
            return { distance: item.distance.text, duration: item.duration.text }
          })
          setNearbyWalkInfos(infos)
        }
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
      {/* IP 自动定位提示条 */}
      {autoLocCity ? (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border-b border-primary/20">
          <div className="i-mdi-map-marker-check text-xl text-primary flex-shrink-0" />
          <p className="text-xl text-primary">已根据 IP 自动定位到 <span className="font-semibold">{autoLocCity}</span></p>
        </div>
      ) : null}
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
                <NearbyCard key={place.uid || idx} place={place} walkInfo={nearbyWalkInfos[idx]} />
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

