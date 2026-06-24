import { useState, useCallback } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { Image } from '@tarojs/components'
import { supabase } from '@/client/supabase'
import { selectMediaFiles, uploadToSupabase } from '@/utils/upload'
import { callEdgeFunction } from '@/utils/callEdgeFunction'
import { saveContractReview } from '@/db/api'
import type { ContractReviewResult, RiskItem } from '@/db/types'

const RISK_CONFIG = {
  高风险: { class: 'risk-high', icon: 'i-mdi-alert-circle-outline' },
  中风险: { class: 'risk-medium', icon: 'i-mdi-alert-outline' },
  低风险: { class: 'risk-low', icon: 'i-mdi-information-outline' },
}

const DISCLAIMER = '本回复由AI生成，仅供参考，不构成正式法律建议。若情况紧急请咨询专业律师。'

function RiskCard({ item, index }: { item: RiskItem; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const config = RISK_CONFIG[item.risk_level] || RISK_CONFIG['低风险']

  return (
    <div className="bg-card rounded-xl border border-border mb-3 overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3"
        onClick={() => setExpanded(!expanded)}
      >
        {/* 序号徽标 */}
        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-xl font-bold text-primary-foreground" style={{ fontSize: '12px', lineHeight: 1 }}>{index}</span>
        </div>
        <span className={`text-xl px-2 py-1 rounded flex-shrink-0 ${config.class}`}>{item.risk_level}</span>
        <p className="flex-1 text-xl text-foreground leading-snug">{item.clause}</p>
        <div className={`i-mdi-chevron-down text-xl text-muted-foreground transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
      </div>
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          <div>
            <p className="text-xl font-medium text-foreground mb-1">风险说明</p>
            <p className="text-xl text-muted-foreground leading-relaxed">{item.description}</p>
          </div>
          {item.law_basis && (
            <div className="law-quote">
              <p className="text-xl font-medium text-foreground mb-1">法律依据</p>
              <p className="text-xl text-foreground leading-relaxed">{item.law_basis}</p>
            </div>
          )}
          {(item as any).plain_translation && (
            <div className="flex items-start gap-2 px-3 py-3 bg-secondary rounded-xl">
              <div className="i-mdi-translate text-xl text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xl font-medium text-primary mb-1">学长翻译官</p>
                <p className="text-xl text-foreground leading-relaxed">{(item as any).plain_translation}</p>
              </div>
            </div>
          )}
          {item.suggestion && (
            <div>
              <p className="text-xl font-medium text-foreground mb-1">处理建议</p>
              <p className="text-xl text-foreground leading-relaxed">{item.suggestion}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface UploadedFile {
  preview: string
  name: string
  url: string
  storagePath: string
  fileObj: any
}

export default function Contract() {
  useShareAppMessage(() => ({
    title: '合同审查 - 法律助手',
    path: '/pages/contract/index',
  }))
  useShareTimeline(() => ({ title: '合同审查 - 法律助手' }))

  const [compareMode, setCompareMode] = useState(false)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [filesB, setFilesB] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<ContractReviewResult | null>(null)
  const [showScoreAlert, setShowScoreAlert] = useState(false)
  const [filesDestroyed, setFilesDestroyed] = useState(false)
  const [blurDetected, setBlurDetected] = useState(false)

  const handleSelectFiles = useCallback(async (target?: 'a' | 'b') => {
    try {
      const selectedFiles = await selectMediaFiles({ mediaType: ['image'], count: 5 })
      if (!selectedFiles || selectedFiles.length === 0) return

      setUploading(true)
      const newFiles: UploadedFile[] = []

      for (const file of selectedFiles) {
        const preview = 'tempFilePath' in file ? (file as any).tempFilePath : URL.createObjectURL(file as File)
        const name = 'tempFilePath' in file ? ((file as any).name || `合同${newFiles.length + 1}.jpg`) : (file as File).name

        const uploadResult = await uploadToSupabase(file as any, { bucket: 'contracts' })
        if (!uploadResult.success || !uploadResult.data) continue

        const publicUrl = supabase.storage.from('contracts').getPublicUrl(uploadResult.data.path).data.publicUrl
        newFiles.push({ preview, name, url: publicUrl, storagePath: uploadResult.data.path, fileObj: file })
      }

      if (newFiles.length === 0) {
        Taro.showToast({ title: '文件上传失败，请重试', icon: 'none' })
        setUploading(false)
        return
      }

      if (compareMode && target === 'b') {
        setFilesB(prev => [...prev, ...newFiles].slice(0, 5))
      } else {
        setFiles(prev => [...prev, ...newFiles].slice(0, 5))
      }
      setResult(null)
      setFilesDestroyed(false)
      setBlurDetected(false)
      Taro.showToast({ title: `已上传${newFiles.length}个文件${compareMode && target === 'b' ? '至合同B' : ''}`, icon: 'success' })
    } catch (err) {
      console.error('文件选择错误:', err)
      Taro.showToast({ title: '文件选择失败，请重试', icon: 'none' })
    } finally {
      setUploading(false)
    }
  }, [compareMode])

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
    setResult(null)
  }

  const removeFileB = (idx: number) => {
    setFilesB(prev => prev.filter((_, i) => i !== idx))
    setResult(null)
  }

  const handleAnalyze = useCallback(async () => {
    if (files.length === 0 || (compareMode && filesB.length === 0)) {
      Taro.showToast({ title: compareMode ? '请上传合同A和合同B' : '请先上传合同文件', icon: 'none' })
      return
    }
    setAnalyzing(true)
    setFilesDestroyed(false)
    setBlurDetected(false)
    try {
      const imageUrls = files.map(f => f.url)
      let body: Record<string, unknown>
      if (compareMode) {
        body = { image_urls: imageUrls, image_urls_b: filesB.map(f => f.url), file_name: '合同A vs 合同B', mode: 'compare' }
      } else if (imageUrls.length === 1) {
        body = { image_url: imageUrls[0], file_name: files[0].name }
      } else {
        body = { image_urls: imageUrls, file_name: `${files.length}份合同文件` }
      }

      const { data, error } = await callEdgeFunction<{ result: ContractReviewResult & { differences?: unknown[]; risks_a?: unknown[]; risks_b?: unknown[] } }>('contract-review', { body })
      if (error) {
        console.error('合同审查错误:', error.message)
        Taro.showToast({ title: '审查失败，请稍后重试', icon: 'none' })
        return
      }
      const reviewResult: ContractReviewResult = data!.result
      setResult(reviewResult)

      // 图片清晰度检测：如果summary包含模糊关键词，提示重拍
      const blurKeywords = ['模糊', '不清晰', '清晰度', '无法识别', '看不清', '识别困难', '图片质量']
      const summaryText = (reviewResult.summary || '').toLowerCase()
      if (blurKeywords.some(kw => summaryText.includes(kw))) {
        setBlurDetected(true)
      }

      // 低分告警
      if ((reviewResult as any).score !== undefined && (reviewResult as any).score < 60) {
        setShowScoreAlert(true)
      }

      await saveContractReview({
        file_url: imageUrls[0],
        file_name: files.map(f => f.name).join('、'),
        review_result: reviewResult,
      })

      // 即时销毁：分析完成后删除云端文件
      const storagePaths = [...files.map(f => f.storagePath), ...(compareMode ? filesB.map(f => f.storagePath) : [])].filter(Boolean)
      if (storagePaths.length > 0) {
        await supabase.storage.from('contracts').remove(storagePaths)
        setFilesDestroyed(true)
      }
    } catch {
      Taro.showToast({ title: '网络异常，请稍后重试', icon: 'none' })
    } finally {
      setAnalyzing(false)
    }
  }, [files, filesB, compareMode])

  const overallConfig = result ? RISK_CONFIG[result.risk_level] || RISK_CONFIG['低风险'] : null
  const score = result ? (result as any).score : undefined
  const crossIssues = result ? (result as any).cross_issues : ''
  return (
    <div className="min-h-screen bg-background">
      {/* 分数低告警弹窗 */}
      {showScoreAlert && (
        <div
          className="fixed inset-0 flex items-center justify-center px-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000 }}
          onClick={() => setShowScoreAlert(false)}
        >
          <div className="bg-card rounded-2xl p-6 w-full">
            <div className="flex flex-col items-center gap-3 mb-4">
              <div className="i-mdi-alert-circle text-6xl text-destructive" />
              <p className="text-2xl font-bold text-destructive text-center">合同评分：{score}分</p>
              <p className="text-xl font-bold text-destructive text-center">学长建议：这份合同极度危险</p>
              <p className="text-xl text-foreground text-center leading-relaxed">千万别签！请仔细阅读每项风险条款，建议咨询专业律师后再作决定。</p>
            </div>
            <button
              type="button"
              className="flex items-center justify-center leading-none w-full bg-destructive rounded-xl"
              onClick={() => setShowScoreAlert(false)}
            >
              <div className="py-4">
                <span className="text-xl text-primary-foreground">我已知晓，查看详情</span>
              </div>
            </button>
          </div>
        </div>
      )}

      <div className="px-4 py-4">
        {/* 隐私保护说明 */}
        <div className="flex items-start gap-2 px-4 py-3 bg-secondary rounded-xl mb-4">
          <div className="i-mdi-shield-lock-outline text-xl text-primary flex-shrink-0 mt-0.5" />
          <p className="text-xl text-primary leading-relaxed">所有图片分析完毕后立即销毁，不用于模型训练，请放心上传。</p>
        </div>

        {/* 对比模式开关 */}
        <div className="flex items-center justify-between px-4 py-3 bg-card rounded-2xl border border-border mb-4">
          <div className="flex items-center gap-2">
            <div className="i-mdi-compare-horizontal text-2xl text-primary" />
            <span className="text-xl font-medium text-foreground">合同对比模式</span>
            <span className="text-base text-muted-foreground">（同时审查并对比两份合同差异）</span>
          </div>
          <div className={`w-12 h-7 rounded-full transition-all flex items-center px-1 ${compareMode ? 'bg-primary' : 'bg-gray-300'}`}
            onClick={() => { setCompareMode(!compareMode); setFiles([]); setFilesB([]); setResult(null) }}>
            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${compareMode ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
        </div>

        {/* 上传区域 - 合同A */}
        <div className="bg-card rounded-2xl p-4 mb-4 border border-border">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xl font-semibold text-foreground">{compareMode ? '合同A' : '上传合同文件'}</p>
            <span className="text-xl text-muted-foreground">{files.length}/5</span>
          </div>
          <p className="text-xl text-muted-foreground mb-4">支持同时上传多份相关文件（如租房合同+物业规约+清单）</p>

          {/* 已上传文件列表 */}
          {files.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {files.map((f, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 bg-secondary rounded-xl">
                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-border flex-shrink-0">
                    <Image src={f.preview} mode="aspectFill" className="w-full h-full" />
                  </div>
                  <span className="flex-1 text-xl text-foreground">{f.name}</span>
                  <div
                    className="i-mdi-close-circle text-2xl text-muted-foreground"
                    onClick={() => removeFile(idx)}
                  />
                </div>
              ))}
            </div>
          )}

          {files.length === 0 && (
            <div
              className="border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center py-10 mb-3"
              onClick={() => handleSelectFiles('a')}
            >
              <div className="i-mdi-cloud-upload-outline text-5xl text-muted-foreground mb-3" />
              <p className="text-xl text-muted-foreground">点击上传合同照片</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {files.length < 5 && (
              <button
                type="button"
                className="flex items-center justify-center leading-none gap-2 rounded-xl border border-primary bg-background"
                style={{ opacity: uploading ? 0.5 : 1 }}
                onClick={() => handleSelectFiles('a')}
              >
                <div className="py-3 flex items-center gap-2">
                  {uploading ? (
                    <div className="i-mdi-loading text-2xl text-primary animate-spin" />
                  ) : (
                    <div className="i-mdi-image-plus-outline text-2xl text-primary" />
                  )}
                  <span className="text-xl text-primary">{uploading ? '上传中...' : files.length > 0 ? '继续添加文件' : '选择文件'}</span>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* 上传区域 - 合同B（仅对比模式） */}
        {compareMode && (
          <div className="bg-card rounded-2xl p-4 mb-4 border border-amber-200 bg-amber-50">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xl font-semibold text-foreground">合同B</p>
              <span className="text-xl text-muted-foreground">{filesB.length}/5</span>
            </div>
            <p className="text-xl text-muted-foreground mb-4">上传需要对比的第二份合同</p>

            {filesB.length > 0 && (
              <div className="flex flex-col gap-2 mb-3">
                {filesB.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 bg-white rounded-xl">
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-border flex-shrink-0">
                      <Image src={f.preview} mode="aspectFill" className="w-full h-full" />
                    </div>
                    <p className="flex-1 text-xl text-foreground truncate">{f.name}</p>
                    <div className="i-mdi-close-circle text-2xl text-muted-foreground" onClick={() => removeFileB(idx)} />
                  </div>
                ))}
              </div>
            )}

            {filesB.length === 0 && (
              <div className="border-2 border-dashed border-amber-300 rounded-xl flex flex-col items-center justify-center py-10 mb-3"
                onClick={() => handleSelectFiles('b')}>
                <div className="i-mdi-cloud-upload-outline text-5xl text-muted-foreground mb-3" />
                <p className="text-xl text-muted-foreground">点击上传合同B照片</p>
              </div>
            )}

            {filesB.length < 5 && (
              <button type="button"
                className="flex items-center justify-center leading-none gap-2 rounded-xl border border-primary bg-background w-full"
                style={{ opacity: uploading ? 0.5 : 1 }}
                onClick={() => handleSelectFiles('b')}>
                <div className="py-3 flex items-center gap-2">
                  {uploading ? (
                    <div className="i-mdi-loading text-2xl text-primary animate-spin" />
                  ) : (
                    <div className="i-mdi-image-plus-outline text-2xl text-primary" />
                  )}
                  <span className="text-xl text-primary">{uploading ? '上传中...' : '选择合同B文件'}</span>
                </div>
              </button>
            )}
          </div>
        )}

        {/* 开始分析按钮（在A和B之下） */}
        <div className="mb-4">
          {(files.length > 0 || (compareMode && filesB.length > 0)) && (
            <button type="button"
              className="flex items-center justify-center leading-none gap-2 rounded-xl bg-primary w-full"
              style={{ opacity: analyzing || uploading ? 0.5 : 1 }}
              onClick={handleAnalyze}>
              <div className="py-3 flex items-center gap-2">
                {analyzing ? (
                  <div className="i-mdi-loading text-2xl text-primary-foreground animate-spin" />
                ) : (
                  <div className="i-mdi-magnify text-2xl text-primary-foreground" />
                )}
                <span className="text-xl text-primary-foreground">
                  {analyzing ? 'AI分析中...' : compareMode ? `开始对比（A:${files.length}份 B:${filesB.length}份）` : `开始审查（${files.length}份文件）`}
                </span>
              </div>
            </button>
          )}
        </div>

        {/* 分析中骨架屏 */}
        {analyzing && (
          <div className="bg-card rounded-2xl p-4 border border-border mb-4">
            <div className="skeleton h-6 rounded mb-3 w-24" />
            <div className="skeleton h-4 rounded mb-2" />
            <div className="skeleton h-4 rounded mb-2 w-5/6" />
            <div className="skeleton h-4 rounded w-4/6" />
          </div>
        )}

        {/* 审查结果 */}
        {result && !analyzing && (
          <div>
            {/* 图片模糊检测提示 */}
            {blurDetected && (
              <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                <div className="i-mdi-flashlight text-xl text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xl font-medium text-amber-700">图片可能不够清晰</p>
                  <p className="text-xl text-amber-600 leading-relaxed mt-1">建议打开手机闪光灯，在光线充足的环境下重新拍摄合同，以获得更准确的分析结果。</p>
                </div>
              </div>
            )}

            {/* 文件销毁确认 */}
            {filesDestroyed && (
              <div className="flex items-center gap-2 px-4 py-3 bg-secondary border border-border rounded-xl mb-4">
                <div className="i-mdi-shield-check text-xl text-primary flex-shrink-0" />
                <p className="text-xl text-primary leading-relaxed">合同文件已从云端安全销毁，不留任何副本。</p>
              </div>
            )}

            {/* 总体评估 */}
            <div className="bg-card rounded-2xl p-4 border border-border mb-4">
              <div className="flex items-center gap-3 mb-3">
                <p className="text-xl font-semibold text-foreground">总体评估</p>
                {overallConfig && (
                  <span className={`text-xl px-3 py-1 rounded-full ${overallConfig.class}`}>
                    {result.risk_level}
                  </span>
                )}
                {score !== undefined && (
                  <span className={`text-xl font-bold px-3 py-1 rounded-full ${score < 60 ? 'risk-high' : score < 80 ? 'risk-medium' : 'risk-low'}`}>
                    {score}分
                  </span>
                )}
              </div>
              <p className="text-xl text-foreground leading-relaxed mb-3">{result.summary}</p>
              {crossIssues && (
                <div className="mb-3 px-3 py-3 bg-secondary rounded-xl">
                  <p className="text-xl font-medium text-primary mb-1">跨文档关联问题</p>
                  <p className="text-xl text-foreground leading-relaxed">{crossIssues}</p>
                </div>
              )}
              {result.advice && (
                <div className="law-quote">
                  <p className="text-xl font-medium text-foreground mb-1">律师建议</p>
                  <p className="text-xl text-foreground leading-relaxed">{result.advice}</p>
                </div>
              )}
            </div>

            {/* 对比模式：差异清单 */}
            {compareMode && (result as any).differences && (
              <div className="bg-card rounded-2xl p-4 border border-amber-200 mb-4">
                <p className="text-xl font-semibold text-foreground mb-3">📋 合同差异清单（{(result as any).differences.length} 处差异）</p>
                {(result as any).differences.map((diff: any, i: number) => (
                  <div key={i} className="mb-3 last:mb-0 p-3 bg-secondary rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl font-medium text-foreground">{diff.field}</span>
                      <span className={`text-base px-2 py-0.5 rounded-full ${diff.advantage === 'A更有利' ? 'bg-green-100 text-green-700' : diff.advantage === 'B更有利' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {diff.advantage}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="p-2 bg-white rounded-lg"><p className="text-base text-muted-foreground mb-1">合同A</p><p className="text-xl text-foreground">{diff.contract_a}</p></div>
                      <div className="p-2 bg-white rounded-lg"><p className="text-base text-muted-foreground mb-1">合同B</p><p className="text-xl text-foreground">{diff.contract_b}</p></div>
                    </div>
                    <p className="text-xl text-muted-foreground leading-relaxed">{diff.analysis}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 风险条款列表 */}
            {result.risks && result.risks.length > 0 ? (
              <div className="bg-card rounded-2xl p-4 border border-border mb-4">
                <p className="text-xl font-semibold text-foreground mb-3">
                  发现 {result.risks.length} 处风险条款
                </p>
                {result.risks.map((risk, i) => (
                  <RiskCard key={i} item={risk} index={i + 1} />
                ))}
              </div>
            ) : (
              <div className="bg-card rounded-2xl p-4 border border-border flex flex-col items-center py-8 mb-4">
                <div className="i-mdi-check-circle-outline text-5xl text-primary mb-3" />
                <p className="text-xl font-medium text-foreground">未发现明显风险条款</p>
                <p className="text-xl text-muted-foreground mt-1">建议签署前仍咨询专业律师</p>
              </div>
            )}

            {/* 免责声明 */}
            <div className="flex items-start gap-2 px-4 py-3 bg-muted rounded-xl">
              <div className="i-mdi-information-outline text-xl text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xl text-muted-foreground leading-relaxed">{DISCLAIMER}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
