import { useState } from 'react'
import Taro from '@tarojs/taro'
import { useAuth } from '@/contexts/AuthContext'
import { STORAGE_KEY_REDIRECT_PATH } from '@/components/RouteGuard'

const TAB_BAR_PATHS = [
  '/pages/home/index',
  '/pages/consult/index',
  '/pages/contract/index',
  '/pages/plaza/index',
]

export default function Login() {
  const { signInWithWechat, signInWithUsername, signUpWithUsername } = useAuth()
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'wechat' | 'username'>('wechat')
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const redirectAfterLogin = () => {
    const redirectPath: string = Taro.getStorageSync(STORAGE_KEY_REDIRECT_PATH) || '/pages/home/index'
    Taro.removeStorageSync(STORAGE_KEY_REDIRECT_PATH)
    const normalized = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`
    if (TAB_BAR_PATHS.includes(normalized)) {
      Taro.switchTab({ url: normalized })
    } else {
      Taro.redirectTo({ url: normalized })
    }
  }

  const handleWechatLogin = async () => {
    if (!agreed) {
      Taro.showToast({ title: '请先同意用户协议', icon: 'none' })
      return
    }
    setLoading(true)
    const { error } = await signInWithWechat()
    setLoading(false)
    if (error) {
      Taro.showToast({ title: error.message || '登录失败，请重试', icon: 'none' })
    } else {
      redirectAfterLogin()
    }
  }

  const handleUsernameSubmit = async () => {
    if (!agreed) {
      Taro.showToast({ title: '请先同意用户协议', icon: 'none' })
      return
    }
    if (!username.trim() || !password.trim()) {
      Taro.showToast({ title: '请填写账号和密码', icon: 'none' })
      return
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
      Taro.showToast({ title: '用户名仅限字母、数字、下划线（3-20位）', icon: 'none' })
      return
    }
    setLoading(true)
    const fn = isRegister ? signUpWithUsername : signInWithUsername
    const { error } = await fn(username.trim(), password)
    setLoading(false)
    if (error) {
      Taro.showToast({ title: error.message || (isRegister ? '注册失败' : '登录失败'), icon: 'none' })
    } else {
      redirectAfterLogin()
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#1A5C54' }}>
      {/* 顶部品牌区 */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 pt-16 pb-8">
        <div className="i-mdi-scale-balance text-6xl text-white opacity-90 mb-4" />
        <h1 className="text-4xl font-bold text-white mb-2">法律助手</h1>
        <p className="text-2xl text-white opacity-70">大学生法律知识口袋书</p>

        <p className="text-xl text-white opacity-60 mt-6 text-center leading-relaxed">
          登录后可保存咨询记录和收藏内容
        </p>
      </div>

      {/* 登录区域 */}
      <div className="bg-background rounded-t-3xl px-6 pt-8 pb-10">
        {/* 模式切换 */}
        <div className="flex items-center gap-2 bg-muted rounded-xl p-1 mb-6">
          {[
            { key: 'wechat' as const, label: '微信一键登录' },
            { key: 'username' as const, label: '账号登录' },
          ].map(m => (
            <div
              key={m.key}
              className={`flex-1 py-3 rounded-lg text-xl font-medium text-center transition-all ${mode === m.key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </div>
          ))}
        </div>

        {mode === 'wechat' ? (
          /* 微信登录 */
          <div className="flex flex-col gap-4">
            <button
              type="button"
              className={`w-full flex items-center justify-center leading-none gap-3 rounded-2xl py-5 text-2xl font-semibold transition-all ${loading ? 'opacity-50' : 'active:opacity-80'}`}
              style={{ backgroundColor: '#07C160', color: '#fff' }}
              onClick={handleWechatLogin}
              disabled={loading}
            >
              <div className="i-mdi-wechat text-3xl" />
              <span>{loading ? '登录中...' : '微信一键登录'}</span>
            </button>
          </div>
        ) : (
          /* 账号登录 / 注册 */
          <div className="flex flex-col gap-4">
            <div className="border border-border rounded-xl px-4 py-3 bg-card">
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                placeholder="用户名（字母/数字/下划线）"
                value={username}
                onInput={e => { const ev = e as any; setUsername(ev.detail?.value ?? ev.target?.value ?? '') }}
                maxLength={20}
              />
            </div>
            <div className="border border-border rounded-xl px-4 py-3 bg-card">
              <input
                type="password"
                className="w-full text-xl text-foreground bg-transparent outline-none"
                placeholder="密码（至少6位）"
                value={password}
                onInput={e => { const ev = e as any; setPassword(ev.detail?.value ?? ev.target?.value ?? '') }}
                maxLength={32}
              />
            </div>
            <button
              type="button"
              className={`w-full flex items-center justify-center leading-none rounded-2xl py-5 text-2xl font-semibold transition-all ${loading ? 'opacity-50' : 'active:opacity-80'} bg-primary text-primary-foreground`}
              onClick={handleUsernameSubmit}
              disabled={loading}
            >
              {loading ? '处理中...' : isRegister ? '注册' : '登录'}
            </button>
            <div
              className="text-center text-xl text-muted-foreground py-1"
              onClick={() => setIsRegister(!isRegister)}
            >
              {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
            </div>
          </div>
        )}

        {/* 用户协议 */}
        <div className="flex items-start gap-3 mt-5" onClick={() => setAgreed(!agreed)}>
          <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 transition-all ${agreed ? 'bg-primary border-primary' : 'border-border'}`}>
            {agreed && <div className="i-mdi-check text-sm text-white" />}
          </div>
          <div className="flex flex-wrap text-xl text-muted-foreground">
            <span>我已阅读并同意</span>
            <span className="text-primary">《用户协议》</span>
            <span>和</span>
            <span className="text-primary">《隐私政策》</span>
          </div>
        </div>
      </div>
    </div>
  )
}
