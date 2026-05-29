import { useState, useMemo, useCallback } from 'react'
import Taro from '@tarojs/taro'
import type { ConsultHistory } from '@/db/types'

// ==================== 类型定义 ====================

interface StarData {
  id: string
  question: string
  date: string
  category: string
  color: string
  x: number
  y: number
  radius: number
  animationDelay: string
}

interface CategoryGroup {
  category: string
  color: string
  stars: StarData[]
  labelX: number
  labelY: number
}

interface Props {
  history: ConsultHistory[]
}

// ==================== 常量 ====================

const CATEGORY_ORDER = ['劳动法', '租房', '消费者权益', '合同法', '通用'] as const

const CATEGORY_ICONS: Record<string, string> = {
  '劳动法': '⚖️',
  '租房': '🏠',
  '消费者权益': '🛡️',
  '合同法': '📜',
  '通用': '⭐',
}

const SVG_W = 390
const SVG_H = 300
const MARGIN = 30
const ZONE_TOP = 50
const ZONE_BOTTOM = 270

// 预生成的背景装饰星星（25 颗固定位置）
const BACKGROUND_STARS: { x: number; y: number; r: number; opacity: number }[] = [
  { x: 12, y: 45, r: 1, opacity: 0.4 },
  { x: 55, y: 18, r: 1.5, opacity: 0.3 },
  { x: 100, y: 72, r: 1, opacity: 0.5 },
  { x: 150, y: 15, r: 1.2, opacity: 0.35 },
  { x: 200, y: 55, r: 1, opacity: 0.45 },
  { x: 245, y: 22, r: 1.3, opacity: 0.3 },
  { x: 310, y: 60, r: 1, opacity: 0.5 },
  { x: 350, y: 18, r: 1.1, opacity: 0.4 },
  { x: 375, y: 48, r: 1, opacity: 0.35 },
  { x: 30, y: 130, r: 1.2, opacity: 0.3 },
  { x: 75, y: 180, r: 1, opacity: 0.5 },
  { x: 125, y: 230, r: 1, opacity: 0.4 },
  { x: 175, y: 165, r: 1.3, opacity: 0.3 },
  { x: 220, y: 210, r: 1, opacity: 0.45 },
  { x: 280, y: 140, r: 1.1, opacity: 0.35 },
  { x: 330, y: 195, r: 1, opacity: 0.4 },
  { x: 370, y: 135, r: 1.2, opacity: 0.3 },
  { x: 45, y: 260, r: 1, opacity: 0.5 },
  { x: 105, y: 140, r: 1, opacity: 0.3 },
  { x: 160, y: 275, r: 1.1, opacity: 0.4 },
  { x: 255, y: 265, r: 1, opacity: 0.35 },
  { x: 295, y: 250, r: 1.3, opacity: 0.45 },
  { x: 340, y: 275, r: 1, opacity: 0.3 },
  { x: 195, y: 108, r: 1, opacity: 0.4 },
  { x: 380, y: 240, r: 1.1, opacity: 0.5 },
]

// ==================== 工具函数 ====================

/** 从问题文本推断分类和颜色 */
function inferCategory(question: string): { category: string; color: string } {
  const q = question || ''
  if (/工资|劳动|辞退|试用期|五险一金|加班|解雇|赔偿|劳动合同|被开除|被裁|裁员/.test(q)) {
    return { category: '劳动法', color: '#4fc3f7' }
  }
  if (/租房|押金|房东|房租|合租|退房/.test(q)) {
    return { category: '租房', color: '#81c784' }
  }
  if (/退款|退货|消费|购买|商品|质量|网购/.test(q)) {
    return { category: '消费者权益', color: '#ffb74d' }
  }
  if (/合同|协议|违约|条款/.test(q)) {
    return { category: '合同法', color: '#ce93d8' }
  }
  return { category: '通用', color: '#f48fb1' }
}

/** 格式化日期为 MM月DD日 */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '未知日期'
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

// ==================== 子组件 ====================

function BackgroundDots() {
  return (
    <>
      {BACKGROUND_STARS.map((s, i) => (
        <circle
          key={`bg-${i}`}
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill='white'
          opacity={s.opacity}
        />
      ))}
    </>
  )
}

function BackgroundGradient() {
  return (
    <defs>
      <radialGradient id='spaceGlow' cx='50%' cy='50%' r='50%'>
        <stop offset='0%' stopColor='#1a1f3a' />
        <stop offset='100%' stopColor='#0a0e1a' />
      </radialGradient>
    </defs>
  )
}

function ConstellationLines({ stars, color }: { stars: StarData[]; color: string }) {
  if (stars.length < 2) return null
  return (
    <>
      {stars.slice(0, -1).map((star, i) => (
        <line
          key={`line-${star.id}`}
          x1={star.x}
          y1={star.y}
          x2={stars[i + 1].x}
          y2={stars[i + 1].y}
          stroke={color}
          strokeOpacity={0.35}
          strokeWidth={1}
          strokeDasharray='4 4'
        />
      ))}
    </>
  )
}

function StarElement({ star, onClick }: { star: StarData; onClick: (s: StarData) => void }) {
  return (
    <g onClick={() => onClick(star)}>
      {/* 外层光晕 */}
      <circle
        cx={star.x}
        cy={star.y}
        r={star.radius + 4}
        fill={star.color}
        opacity={0.15}
        style={{
          animation: `pulse-glow 3s ease-in-out infinite`,
          animationDelay: star.animationDelay,
        }}
      />
      {/* 主星 */}
      <circle
        cx={star.x}
        cy={star.y}
        r={star.radius}
        fill={star.color}
        style={{
          filter: `drop-shadow(0 0 ${star.radius * 2}px ${star.color})`,
          animation: `twinkle 2s ease-in-out infinite`,
          animationDelay: star.animationDelay,
        }}
      />
    </g>
  )
}

function CategoryLabel({ group }: { group: CategoryGroup }) {
  const icon = CATEGORY_ICONS[group.category] || '⭐'
  // 中文 + emoji 宽度估算
  const labelText = `${group.category}${icon}`
  return (
    <text
      x={group.labelX}
      y={group.labelY}
      textAnchor='middle'
      fill={group.color}
      fontSize='11'
      fontWeight='500'
      opacity={0.8}
      style={{ pointerEvents: 'none' }}
    >
      {labelText}
    </text>
  )
}

function TooltipOverlay({ star, onClose }: { star: StarData; onClose: () => void }) {
  const TOOLTIP_W = 180
  const TOOLTIP_H = 70
  let left = star.x - TOOLTIP_W / 2
  let top = star.y - TOOLTIP_H - 16

  // 边界修正
  if (left < 4) left = 4
  if (left + TOOLTIP_W > SVG_W - 4) left = SVG_W - 4 - TOOLTIP_W
  if (top < 4) {
    // 星星下方显示
    top = star.y + star.radius + 8
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${TOOLTIP_W}px`,
        background: 'rgba(30,35,55,0.95)',
        border: `1px solid ${star.color}40`,
        borderRadius: '10px',
        boxShadow: `0 4px 16px rgba(0,0,0,0.5), 0 0 8px ${star.color}30`,
        backdropFilter: 'blur(8px)',
        zIndex: 10,
        padding: '10px 12px',
      }}
      onClick={onClose}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span
          style={{
            color: star.color,
            fontSize: '11px',
            fontWeight: 600,
            background: `${star.color}20`,
            padding: '1px 6px',
            borderRadius: '4px',
          }}
        >
          {star.category}
        </span>
        <span
          style={{
            color: '#999',
            fontSize: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          <span style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23999' d='M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z'/%3E%3C/svg%3E") center/contain no-repeat`,
          }} />
        </span>
      </div>
      <p style={{
        color: '#e0e0e0',
        fontSize: '13px',
        lineHeight: 1.4,
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        margin: 0,
      }}>
        {star.question.length > 30 ? star.question.slice(0, 30) + '...' : star.question}
      </p>
      <p style={{ color: '#888', fontSize: '11px', marginTop: '4px', marginBottom: 0 }}>{star.date}</p>
    </div>
  )
}

function StatsBar({ groups }: { groups: CategoryGroup[] }) {
  const totalStars = groups.reduce((sum, g) => sum + g.stars.length, 0)
  const activeGroups = groups.filter(g => g.stars.length > 0)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '10px', padding: '0 4px' }}>
      <span style={{ fontSize: '13px', color: 'hsl(var(--foreground))', fontWeight: 500 }}>
        宇宙中共有 <span style={{ color: '#f48fb1', fontWeight: 700 }}>{totalStars}</span> 颗星
      </span>
      <span style={{ fontSize: '10px', color: '#555' }}>·</span>
      <span style={{ fontSize: '13px', color: 'hsl(var(--foreground))', fontWeight: 500 }}>
        探索了 <span style={{ color: '#81c784', fontWeight: 700 }}>{activeGroups.length}</span> 个星座
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
        {activeGroups.map(g => (
          <div key={g.category} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{
              display: 'inline-block',
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: g.color,
            }} />
            <span style={{ fontSize: '11px', color: '#888' }}>{g.stars.length}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ShareButton() {
  const handleShare = useCallback(() => {
    Taro.showShareMenu({
      withShareTicket: false,
      menus: ['shareAppMessage'],
    } as any)
    Taro.showToast({ title: '请点击右上角分享', icon: 'none' })
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '10px 0',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.12)',
        marginTop: '10px',
      }}
      onClick={handleShare}
    >
      <span style={{
        display: 'inline-block',
        width: '16px',
        height: '16px',
        background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23aaa' d='M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81c1.66 0 3-1.34 3-3s-1.34-3-3-3s-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65c0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z'/%3E%3C/svg%3E") center/contain no-repeat`,
      }} />
      <span style={{ fontSize: '13px', color: '#aaa' }}>分享我的维权宇宙</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 10px' }}>
      <div style={{ width: '100%', height: '200px', position: 'relative' }}>
        <svg width='100%' height='200' viewBox='0 0 390 200' style={{ display: 'block' }}>
          {/* 几颗背景星星 */}
          {[1, 2, 3, 4, 5].map(i => (
            <circle
              key={`es-${i}`}
              cx={60 + i * 60}
              cy={30 + (i % 3) * 25}
              r={1}
              fill='white'
              opacity={0.3 + i * 0.05}
            />
          ))}
          {/* 中央孤独的星星 */}
          <circle
            cx={195}
            cy={90}
            r={8}
            fill='#f48fb1'
            style={{
              filter: 'drop-shadow(0 0 16px #f48fb1)',
              animation: 'twinkle 2s ease-in-out infinite',
            }}
          />
          <circle
            cx={195}
            cy={90}
            r={14}
            fill='#f48fb1'
            opacity={0.1}
            style={{
              animation: 'pulse-glow 3s ease-in-out infinite',
            }}
          />
        </svg>
      </div>
      <p style={{ fontSize: '16px', fontWeight: 600, color: 'hsl(var(--foreground))', marginTop: '4px', marginBottom: 0 }}>
        你的维权宇宙还是一片虚空
      </p>
      <p style={{ fontSize: '13px', color: 'hsl(var(--muted-foreground))', marginTop: '4px', marginBottom: 0 }}>
        开始第一次法律咨询，点亮你的第一颗星 ✨
      </p>
      <div
        style={{
          marginTop: '16px',
          padding: '10px 24px',
          borderRadius: '12px',
          color: 'hsl(var(--primary-foreground))',
          fontWeight: 500,
          fontSize: '14px',
          backgroundColor: 'hsl(var(--primary))',
          transition: 'transform 0.15s',
        }}
        onClick={() => Taro.switchTab({ url: '/pages/consult/index' })}
      >
        去咨询
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

export default function LegalUniverse({ history }: Props) {
  const [activeStar, setActiveStar] = useState<StarData | null>(null)

  // 使用 history ID 列表作为 seed，确保位置在数据不变时稳定
  const positionSeed = useMemo(() => history.map(h => h.id).sort().join('|'), [history])

  const { starDatas, groups } = useMemo(() => {
    // 1. 分类
    const catMap = new Map<string, { color: string; items: ConsultHistory[] }>()

    for (const item of history) {
      const { category, color } = inferCategory(item.question)
      if (!catMap.has(category)) {
        catMap.set(category, { color, items: [] })
      }
      catMap.get(category)!.items.push(item)
    }

    // 按固定顺序排列
    const sortedCategories = CATEGORY_ORDER.filter(c => catMap.has(c))
    const activeGroups: CategoryGroup[] = []
    const allStars: StarData[] = []

    const innerWidth = SVG_W - MARGIN * 2
    const zoneWidth = innerWidth / Math.max(sortedCategories.length, 1)

    for (let gi = 0; gi < sortedCategories.length; gi++) {
      const cat = sortedCategories[gi]
      const { color, items } = catMap.get(cat)!
      const zoneLeft = MARGIN + gi * zoneWidth + 12
      const zoneRight = MARGIN + (gi + 1) * zoneWidth - 12
      const zoneCenter = MARGIN + gi * zoneWidth + zoneWidth / 2

      // 根据该分类的总数确定半径
      const radius = items.length >= 4 ? 12 : items.length >= 2 ? 9 : 6

      const groupStars: StarData[] = []
      const placedCoords: { x: number; y: number }[] = []

      for (let si = 0; si < items.length; si++) {
        const item = items[si]
        let x: number
        let y: number
        let attempts = 0

        do {
          x = zoneLeft + Math.random() * (zoneRight - zoneLeft)
          y = ZONE_TOP + Math.random() * (ZONE_BOTTOM - ZONE_TOP)
          attempts++
        } while (
          attempts < 100 &&
          placedCoords.some(p => Math.hypot(p.x - x, p.y - y) < 22)
        )

        // 回退策略
        if (attempts >= 100 && placedCoords.length > 0) {
          const last = placedCoords[placedCoords.length - 1]
          x = last.x + 24
          y = last.y + (si % 2 === 0 ? 24 : -24)
          if (x > zoneRight) x = zoneRight - 4
          if (y > ZONE_BOTTOM) y = ZONE_BOTTOM - 4
          if (y < ZONE_TOP) y = ZONE_TOP + 4
        }

        placedCoords.push({ x, y })

        const star: StarData = {
          id: item.id,
          question: item.question || '',
          date: formatDate(item.created_at),
          category: cat,
          color,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          radius,
          animationDelay: `${((si * 0.3 + gi * 0.15) % 2).toFixed(1)}s`,
        }

        groupStars.push(star)
        allStars.push(star)
      }

      activeGroups.push({
        category: cat,
        color,
        stars: groupStars,
        labelX: Math.round(zoneCenter),
        labelY: 26,
      })
    }

    return { starDatas: allStars, groups: activeGroups }
  }, [positionSeed]) // eslint-disable-line react-hooks/exhaustive-deps

  if (history.length === 0) {
    return <EmptyState />
  }

  return (
    <div>
      {/* 区域标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <span style={{ fontSize: '18px' }}>🌌</span>
        <span style={{ fontSize: '16px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>我的维权宇宙</span>
      </div>
      <p style={{ fontSize: '12px', color: '#7986cb', marginTop: 0, marginBottom: '8px' }}>
        每一次维权都是宇宙中一颗星
      </p>

      {/* 星空 + SVG */}
      <div
        style={{
          width: '100%',
          height: `${SVG_H}px`,
          background: 'radial-gradient(ellipse at center, #1a1f3a 0%, #0a0e1a 100%)',
          borderRadius: '12px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <svg
          width='100%'
          height={SVG_H}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ display: 'block' }}
        >
          <BackgroundGradient />
          <rect width={SVG_W} height={SVG_H} fill='url(#spaceGlow)' />
          <BackgroundDots />

          {groups.map(g => (
            <ConstellationLines key={`lines-${g.category}`} stars={g.stars} color={g.color} />
          ))}

          {starDatas.map(star => (
            <StarElement key={star.id} star={star} onClick={setActiveStar} />
          ))}

          {groups.map(g => (
            <CategoryLabel key={`label-${g.category}`} group={g} />
          ))}
        </svg>

        {/* Tooltip 覆盖层 */}
        {activeStar && (
          <TooltipOverlay star={activeStar} onClose={() => setActiveStar(null)} />
        )}
      </div>

      {/* 统计 */}
      <StatsBar groups={groups} />

      {/* 分享按钮 */}
      <ShareButton />
    </div>
  )
}
