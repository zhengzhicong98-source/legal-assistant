import { useState } from 'react'
import Taro from '@tarojs/taro'
import { createCasePost } from '@/db/api'
import type { CaseCategory, CasePost } from '@/db/types'

const CATEGORIES: { key: CaseCategory; label: string; color: string }[] = [
  { key: '租房', label: '租房纠纷', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { key: '劳动', label: '劳动纠纷', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { key: '消费', label: '消费维权', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { key: '其他', label: '其他', color: 'bg-gray-100 text-gray-600 border-gray-300' },
]

const RESULTS: { key: CasePost['result']; label: string }[] = [
  { key: '维权成功', label: '维权成功' },
  { key: '协商解决', label: '协商解决' },
  { key: '待处理', label: '待处理' },
]

/** 获取或生成 userId */
function getUserId(): string {
  let uid = Taro.getStorageSync('userId')
  if (!uid) {
    uid = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    Taro.setStorageSync('userId', uid)
  }
  return uid
}

export default function PlazaPost() {
  const [category, setCategory] = useState<CaseCategory>('租房')
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [solution, setSolution] = useState('')
  const [result, setResult] = useState<CasePost['result']>('待处理')
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = title.trim().length > 0 && title.trim().length <= 30 &&
    question.trim().length > 0 && question.trim().length <= 200

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return
    if (title.trim().length > 30) {
      Taro.showToast({ title: '标题最多30字', icon: 'none' })
      return
    }
    if (question.trim().length > 200) {
      Taro.showToast({ title: '问题描述最多200字', icon: 'none' })
      return
    }
    if (solution.trim().length > 200) {
      Taro.showToast({ title: '解决方法最多200字', icon: 'none' })
      return
    }

    setSubmitting(true)
    const userId = getUserId()
    const content = `问题：${question.trim()}\n解决方法：${solution.trim() || '暂无'}`

    const post = await createCasePost({
      user_id: userId,
      nickname: '匿名学长',
      category,
      title: title.trim(),
      content,
      question: question.trim(),
      solution: solution.trim() || undefined,
      result: result || undefined,
      is_anonymous: isAnonymous,
    })

    setSubmitting(false)
    if (post) {
      Taro.showToast({ title: '发布成功', icon: 'success' })
      setTimeout(() => {
        Taro.navigateBack()
      }, 800)
    } else {
      Taro.showToast({ title: '发布失败，请重试', icon: 'none' })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <div className="i-mdi-arrow-left text-2xl text-foreground" onClick={() => Taro.navigateBack()} />
          <span className="text-2xl font-semibold text-foreground">分享我的案例</span>
        </div>
        <button
          className={`px-5 py-2 rounded-lg text-xl font-medium transition-all ${
            canSubmit && !submitting
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground opacity-50'
          }`}
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? '发布中...' : '发布'}
        </button>
      </div>

      <div className="px-4 py-4 flex flex-col gap-5">
        {/* 分类选择 */}
        <div>
          <p className="text-xl font-medium text-foreground mb-2">选择分类</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <div
                key={c.key}
                className={`px-4 py-2 rounded-lg text-xl font-medium border transition-all ${
                  category === c.key ? c.color + ' border-2' : 'bg-card text-muted-foreground border-border'
                }`}
                onClick={() => setCategory(c.key)}
              >
                {c.label}
              </div>
            ))}
          </div>
        </div>

        {/* 标题 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xl font-medium text-foreground">标题</p>
            <span className="text-xl text-muted-foreground">{title.length}/30</span>
          </div>
          <input
            className="w-full px-4 py-3 bg-card border border-border rounded-xl text-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            placeholder="简短概括你的经历"
            value={title}
            onInput={e => setTitle((e.target as HTMLInputElement).value)}
            maxLength={30}
          />
        </div>

        {/* 问题描述 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xl font-medium text-foreground">遇到的问题</p>
            <span className="text-xl text-muted-foreground">{question.length}/200</span>
          </div>
          <textarea
            className="w-full px-4 py-3 bg-card border border-border rounded-xl text-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
            placeholder="描述你遇到的法律问题..."
            value={question}
            onInput={e => setQuestion((e.target as HTMLTextAreaElement).value)}
            maxLength={200}
            rows={4}
          />
        </div>

        {/* 解决方法 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xl font-medium text-foreground">解决方法（选填）</p>
            <span className="text-xl text-muted-foreground">{solution.length}/200</span>
          </div>
          <textarea
            className="w-full px-4 py-3 bg-card border border-border rounded-xl text-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
            placeholder="你采取了哪些措施？结果如何？"
            value={solution}
            onInput={e => setSolution((e.target as HTMLTextAreaElement).value)}
            maxLength={200}
            rows={4}
          />
        </div>

        {/* 结果选择 */}
        <div>
          <p className="text-xl font-medium text-foreground mb-2">最终结果</p>
          <div className="flex gap-2">
            {RESULTS.map(r => (
              <div
                key={r.key}
                className={`flex-1 py-3 rounded-xl text-xl font-medium text-center border transition-all ${
                  result === r.key
                    ? 'bg-primary/10 text-primary border-primary'
                    : 'bg-card text-muted-foreground border-border'
                }`}
                onClick={() => setResult(r.key)}
              >
                {r.label}
              </div>
            ))}
          </div>
        </div>

        {/* 匿名发布 */}
        <div
          className="flex items-center gap-3 py-2"
          onClick={() => setIsAnonymous(!isAnonymous)}
        >
          <div className={`w-5 h-5 rounded border flex items-center justify-center ${
            isAnonymous ? 'bg-primary border-primary' : 'border-border'
          }`}>
            {isAnonymous && <div className="i-mdi-check text-sm text-primary-foreground" />}
          </div>
          <span className="text-xl text-muted-foreground">匿名发布</span>
        </div>
      </div>
    </div>
  )
}
