import Taro from '@tarojs/taro'
import { useLocation } from '@tarojs/router'

const NAV_ITEMS = [
  { path: '/pages/home/index', label: '首页', icon: '🏠' },
  { path: '/pages/consult/index', label: '法律咨询', icon: '💬' },
  { path: '/pages/contract/index', label: '合同审查', icon: '📄' },
  { path: '/pages/plaza/index', label: '案例广场', icon: '🌐' },
]

export default function WebLayout({ children }: { children: React.ReactNode }) {
  // 仅 H5 渲染
  if (process.env.TARO_ENV !== 'h5') return <>{children}</>

  const location = useLocation()
  const currentPath = location?.path || ''

  return (
    <div style={{ minHeight: '100vh', background: 'hsl(var(--background))' }}>
      {/* 顶部导航栏 */}
      <nav style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'hsl(172 56% 23%)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        height: '56px',
        gap: '8px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '32px' }}>
          <span style={{ fontSize: '20px' }}>⚖️</span>
          <span style={{ color: 'white', fontWeight: 700, fontSize: '18px' }}>法律助手</span>
        </div>

        {/* 导航项 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
          {NAV_ITEMS.map(item => {
            const isActive = currentPath.includes(item.path.replace('/pages', 'pages'))
            return (
              <div
                key={item.path}
                onClick={() => Taro.switchTab({ url: item.path })}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: isActive ? 'white' : 'rgba(255,255,255,0.7)',
                  background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: '15px',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            )
          })}
        </div>

        {/* 右侧按钮 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            onClick={() => Taro.navigateTo({ url: '/pages/profile/index' })}
            style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'white', fontSize: '18px',
            }}
          >
            👤
          </div>
        </div>
      </nav>

      {/* 内容区 */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
        {children}
      </main>
    </div>
  )
}
