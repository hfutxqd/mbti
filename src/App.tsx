import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import "./App.css"

import { Moon, Sun, Upload, Link2, RefreshCw, Download, Copy, Info, AlertCircle, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"

// ================= 类型定义 =================

type DimensionKey = "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P"

const DIM_KEYS: DimensionKey[] = ["E", "I", "S", "N", "T", "F", "J", "P"]
const QUESTIONS_PER_GROUP = 10

type BuiltinBankKey = "pro-120" | "standard-80" | "simple-40" | "custom"

interface BuiltinBankConfig {
  key: BuiltinBankKey
  label: string
  description: string
  file?: string
}

const BUILTIN_BANKS: BuiltinBankConfig[] = [
  {
    key: "pro-120",
    label: "MBTI 专业版 120题",
    description: "覆盖更全面的情境与行为，适合个人深度评估与教练场景。",
    file: "/mbti_pro_120.json",
  },
  {
    key: "standard-80",
    label: "MBTI 标准版 80题",
    description: "平衡测评时长与题目覆盖度，适合团队与工作坊使用。",
    file: "/mbti_standard_80.json",
  },
  {
    key: "simple-40",
    label: "MBTI 简版 40题",
    description: "快速自测版本，适合时间有限或首次尝试 MBTI 时使用。",
    file: "/mbti_simple_40.json",
  },
  {
    key: "custom",
    label: "自定义题库",
    description: "通过本地上传或 URL 加载的题库。",
  },
]

const DEFAULT_BUILTIN_KEY: BuiltinBankKey = "simple-40"

interface Weights {
  E: number
  I: number
  S: number
  N: number
  T: number
  F: number
  J: number
  P: number
}

interface Choice {
  label: string
  weights: Weights
}

interface Question {
  id: string
  text: string
  choices: Choice[]
}

interface QuestionBankMetadata {
  title: string
  version: string
  language: string
}

interface QuestionBank {
  metadata: QuestionBankMetadata
  dimensions: DimensionKey[]
  questions: Question[]
}

interface PairScore {
  key: "EI" | "SN" | "TF" | "JP"
  left: DimensionKey
  right: DimensionKey
  leftLabel: string
  rightLabel: string
  leftScore: number
  rightScore: number
  leftPercent: number
  rightPercent: number
}

interface MBTIResult {
  type: string
  pairScores: PairScore[]
  rawScores: Record<DimensionKey, number>
  answeredCount: number
  totalQuestions: number
  bankMetadata: QuestionBankMetadata
  createdAt: string
}

// ================= 工具函数 =================

function validateQuestionBank(raw: unknown): { ok: true; data: QuestionBank } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "题库 JSON 顶层必须是对象" }
  }

  const obj = raw as any
  const metadata = obj.metadata
  const dimensions = obj.dimensions
  const questions = obj.questions

  if (!metadata || typeof metadata !== "object") {
    return { ok: false, error: "缺少 metadata 字段或类型不正确" }
  }

  if (typeof metadata.title !== "string" || typeof metadata.version !== "string") {
    return { ok: false, error: "metadata.title 或 metadata.version 缺失或类型错误" }
  }

  if (typeof metadata.language !== "string") {
    return { ok: false, error: "metadata.language 必须为字符串，例如 'zh-CN'" }
  }

  if (!Array.isArray(dimensions)) {
    return { ok: false, error: "dimensions 必须为字符串数组" }
  }

  const requiredDims: DimensionKey[] = ["E", "I", "S", "N", "T", "F", "J", "P"]
  const hasAllDims = requiredDims.every((d) => dimensions.includes(d))
  if (!hasAllDims) {
    return { ok: false, error: "dimensions 必须至少包含 E、I、S、N、T、F、J、P" }
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    return { ok: false, error: "questions 必须为非空数组" }
  }

  const normalizedQuestions: Question[] = []

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    if (!q || typeof q !== "object") {
      return { ok: false, error: `第 ${i + 1} 题格式错误（不是对象）` }
    }
    if (typeof q.id !== "string" || typeof q.text !== "string") {
      return { ok: false, error: `第 ${i + 1} 题缺少 id 或 text 字段` }
    }
    if (!Array.isArray(q.choices) || q.choices.length < 2) {
      return { ok: false, error: `题目 ${q.id} 的 choices 至少需要两个选项` }
    }

    const normalizedChoices: Choice[] = []

    for (let j = 0; j < q.choices.length; j++) {
      const c = q.choices[j]
      if (!c || typeof c !== "object") {
        return { ok: false, error: `题目 ${q.id} 的第 ${j + 1} 个选项格式错误` }
      }
      if (typeof c.label !== "string") {
        return { ok: false, error: `题目 ${q.id} 的第 ${j + 1} 个选项缺少 label` }
      }

      const w = c.weights
      if (!w || typeof w !== "object") {
        return { ok: false, error: `题目 ${q.id} 的第 ${j + 1} 个选项缺少 weights 对象` }
      }

      const safeWeights: Weights = {
        E: 0,
        I: 0,
        S: 0,
        N: 0,
        T: 0,
        F: 0,
        J: 0,
        P: 0,
      }

      for (const dim of DIM_KEYS) {
        const v = (w as any)[dim]
        if (typeof v === "number" && !Number.isNaN(v)) {
          safeWeights[dim] = v
        }
      }

      normalizedChoices.push({ label: c.label, weights: safeWeights })
    }

    normalizedQuestions.push({ id: q.id, text: q.text, choices: normalizedChoices })
  }

  const normalizedBank: QuestionBank = {
    metadata: {
      title: metadata.title,
      version: metadata.version,
      language: metadata.language,
    },
    dimensions: requiredDims,
    questions: normalizedQuestions,
  }

  return { ok: true, data: normalizedBank }
}

const TYPE_DESCRIPTIONS: Record<
  string,
  {
    name: string
    summary: string
    advice: string
  }
> = {
  ISTJ: {
    name: "务实负责型",
    summary: "你重视规则与秩序，做事稳健可靠，习惯用事实和经验说话，是团队中值得托付的人。",
    advice:
      "在坚持原则的同时，可以适当分享自己的感受，多给他人一些情绪上的回应，会让合作更顺畅。",
  },
  ISFJ: {
    name: "守护照料型",
    summary: "你细腻体贴，善于照顾他人的需求，愿意在幕后默默付出，是团队中的稳定力量。",
    advice:
      "在照顾他人的同时，也要给自己留出空间，适时表达边界和需求，才能长期稳定地付出。",
  },
  INFJ: {
    name: "洞察策划型",
    summary: "你敏感而有洞察力，关注长期价值和他人的成长，常常扮演策划者和支持者的角色。",
    advice:
      "你的直觉很宝贵，但也可以主动把想法说出来，与更多人共创，避免独自承担过多压力。",
  },
  INTJ: {
    name: "战略规划型",
    summary: "你善于从全局思考问题，擅长制定长期规划与系统方案，对效率与逻辑有高要求。",
    advice:
      "在追求高标准的同时，适当关注团队的节奏与感受，解释你的想法，会让他人更愿意跟随。",
  },
  ISTP: {
    name: "冷静实干型",
    summary: "你动手能力强，遇事冷静、客观，擅长在复杂环境中迅速找出关键并解决问题。",
    advice:
      "可以多向他人分享你的思路与经验，这不仅能帮助团队，也能让你的价值被更清晰地看到。",
  },
  ISFP: {
    name: "温柔体验型",
    summary: "你温和平实，重视真实感受与当下体验，喜欢以自己的节奏悄然完成高质量的工作。",
    advice:
      "在尊重内心节奏的同时，也可以适度表达自己的想法和审美，你的观点往往比你想象得更重要。",
  },
  INFP: {
    name: "理想主义型",
    summary: "你重视价值观与意义，对人和世界有自己的理想与期望，常常在内心进行丰富的思考。",
    advice:
      "可以尝试把理想拆解成具体可行的小步骤，在现实中一点点落地，你的理想值得被看见。",
  },
  INTP: {
    name: "理性分析型",
    summary: "你好奇心强，喜欢研究本质问题，擅长搭建逻辑框架，是思考型与创意型工作的重要力量。",
    advice:
      "在深入思考的同时，可以有意识地关注执行与落地，多与实践者合作，让好点子真正发生。",
  },
  ESTP: {
    name: "行动挑战型",
    summary: "你反应敏捷、喜欢尝试，擅长在现场做决策，也乐于在变化环境中寻找机会。",
    advice:
      "适当为自己预留复盘时间，思考长期影响，可以让你的敏捷与行动力发挥得更持久稳定。",
  },
  ESFP: {
    name: "活力表达型",
    summary: "你热情外向，关注当下体验，善于活跃氛围，让身边的人感到轻松愉快。",
    advice:
      "在照顾氛围之余，也可以偶尔停下来，想一想自己真正想要什么，让热情更好地为自己服务。",
  },
  ENFP: {
    name: "灵感驱动型",
    summary: "你充满好奇与创意，善于发现可能性，喜欢与人连接并激发他人的热情。",
    advice:
      "可以尝试给灵感设定一些边界和优先级，把部分想法落到具体计划上，避免精力被过度分散。",
  },
  ENTP: {
    name: "辩证创新型",
    summary: "你思维敏捷，喜欢挑战既有观点，从不同角度论证问题，常能提出意想不到的方案。",
    advice:
      "在享受讨论的同时，也要留意他人的感受与节奏，适度收敛锋芒，有助于长久合作关系。",
  },
  ESTJ: {
    name: "执行管理型",
    summary: "你重视秩序和效率，擅长组织资源、推动落地，是天然的执行者和管理者。",
    advice:
      "在坚持标准的同时，多听听不同声音，适当留出弹性空间，往往能收获更好的整体效果。",
  },
  ESFJ: {
    name: "协调支持型",
    summary: "你乐于维护团队和谐，重视责任与承诺，善于在关系网络中进行协调与照应。",
    advice:
      "可以学着区分“我应该”与“我想要”，在承担责任之外，也照顾好自己的节奏与界限。",
  },
  ENFJ: {
    name: "鼓舞引导型",
    summary: "你关注他人的潜力与情绪，擅长激励和组织，是天然的引导者与支持者。",
    advice:
      "在投入大量精力帮助他人时，也别忽略自己的需要，适时补充能量，才能持续地给予。",
  },
  ENTJ: {
    name: "果断领航型",
    summary: "你目标感强，善于统筹规划和决策，愿意为长期愿景承担责任，是典型的领导型人格。",
    advice:
      "在追求结果与效率的同时，适度放慢节奏、倾听他人感受，会让你的领导更具温度与凝聚力。",
  },
}

function computeMbtiResult(bank: QuestionBank, answers: Record<string, number>): MBTIResult {
  const scores: Record<DimensionKey, number> = {
    E: 0,
    I: 0,
    S: 0,
    N: 0,
    T: 0,
    F: 0,
    J: 0,
    P: 0,
  }

  let answeredCount = 0

  for (const q of bank.questions) {
    const choiceIndex = answers[q.id]
    if (choiceIndex === undefined || choiceIndex === null) continue
    const choice = q.choices[choiceIndex]
    if (!choice) continue
    answeredCount++
    for (const dim of DIM_KEYS) {
      scores[dim] += choice.weights[dim] ?? 0
    }
  }

  const pairConfigs: Array<{
    key: PairScore["key"]
    left: DimensionKey
    right: DimensionKey
    leftLabel: string
    rightLabel: string
  }> = [
    {
      key: "EI",
      left: "E",
      right: "I",
      leftLabel: "外向 (E)",
      rightLabel: "内向 (I)",
    },
    {
      key: "SN",
      left: "S",
      right: "N",
      leftLabel: "实感 (S)",
      rightLabel: "直觉 (N)",
    },
    {
      key: "TF",
      left: "T",
      right: "F",
      leftLabel: "思考 (T)",
      rightLabel: "情感 (F)",
    },
    {
      key: "JP",
      left: "J",
      right: "P",
      leftLabel: "判断 (J)",
      rightLabel: "感知 (P)",
    },
  ]

  const pairScores: PairScore[] = pairConfigs.map((cfg) => {
    const leftScore = scores[cfg.left]
    const rightScore = scores[cfg.right]
    const total = leftScore + rightScore
    const leftPercent = total > 0 ? Math.round((leftScore / total) * 100) : 50
    const rightPercent = 100 - leftPercent
    return {
      key: cfg.key,
      left: cfg.left,
      right: cfg.right,
      leftLabel: cfg.leftLabel,
      rightLabel: cfg.rightLabel,
      leftScore,
      rightScore,
      leftPercent,
      rightPercent,
    }
  })

  const letters = pairScores.map((p) => {
    if (p.leftScore === 0 && p.rightScore === 0) {
      // 完全无差异时，以左侧字母作为默认
      return p.left
    }
    return p.leftScore >= p.rightScore ? p.left : p.right
  })

  const type = letters.join("")

  return {
    type,
    pairScores,
    rawScores: scores,
    answeredCount,
    totalQuestions: bank.questions.length,
    bankMetadata: bank.metadata,
    createdAt: new Date().toISOString(),
  }
}

function buildResultSummaryText(result: MBTIResult): string {
  const lines: string[] = []
  lines.push(`MBTI 类型：${result.type}`)
  lines.push("")
  lines.push("各维度偏好：")
  for (const p of result.pairScores) {
    lines.push(`${p.leftLabel} vs ${p.rightLabel}：${p.leftPercent}% / ${p.rightPercent}%`)
  }
  lines.push("")
  lines.push(`题库：${result.bankMetadata.title}（版本 ${result.bankMetadata.version}）`)
  lines.push(`答题进度：${result.answeredCount} / ${result.totalQuestions}`)
  lines.push(`生成时间：${new Date(result.createdAt).toLocaleString()}`)
  return lines.join("\n")
}

function getTimeEstimateRange(totalQuestions: number): string {
  if (!totalQuestions || totalQuestions <= 0) {
    return "约 5–10 分钟"
  }

  const baselineQuestions = 40
  const minPer40 = 6
  const maxPer40 = 10
  const factor = totalQuestions / baselineQuestions

  const min = Math.round(minPer40 * factor)
  const max = Math.round(maxPer40 * factor)

  return `约 ${min}–${max} 分钟`
}

// ================= 主组件 =================

function App() {
  const isMobile = useIsMobile()
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const [questionBank, setQuestionBank] = useState<QuestionBank | null>(null)
  const [selectedBankKey, setSelectedBankKey] = useState<BuiltinBankKey>(DEFAULT_BUILTIN_KEY)
  const [bankSourceLabel, setBankSourceLabel] = useState<string>("内置题库：MBTI 简版 40题")
  const [loadingBank, setLoadingBank] = useState(false)
  const [bankError, setBankError] = useState<string | null>(null)

  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<MBTIResult | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)

  const [urlInput, setUrlInput] = useState("")
  const [loadingFromUrl, setLoadingFromUrl] = useState(false)

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const [autoNext, setAutoNext] = useState(true)

  const questionSectionRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)
  const bottomBarRef = useRef<HTMLDivElement | null>(null)

  // 初始化主题
  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem("mbti-pro-theme") as "light" | "dark" | null
    if (stored === "light" || stored === "dark") {
      setTheme(stored)
      document.documentElement.classList.toggle("dark", stored === "dark")
    } else {
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      const initial = prefersDark ? "dark" : "light"
      setTheme(initial)
      document.documentElement.classList.toggle("dark", initial === "dark")
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    if (typeof window !== "undefined") {
      window.localStorage.setItem("mbti-pro-theme", theme)
    }
  }, [theme])

  const applyNewBank = useCallback(
    (bank: QuestionBank, sourceLabel: string) => {
      setQuestionBank(bank)
      setBankSourceLabel(sourceLabel)
      setAnswers({})
      setResult(null)
      setSubmitError(null)
      setCopyHint(null)
      if (bank.questions.length > 0) {
        setActiveGroupId("0")
      }
    },
    []
  )

  // 加载或切换内置题库
  useEffect(() => {
    if (selectedBankKey === "custom") {
      return
    }

    const config = BUILTIN_BANKS.find((b) => b.key === selectedBankKey && b.file)
    if (!config || !config.file) {
      return
    }

    let cancelled = false

    const loadBuiltin = async () => {
      try {
        setLoadingBank(true)
        setBankError(null)
        const res = await fetch(config.file!, { cache: "no-store" })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const data = await res.json()
        const validated = validateQuestionBank(data)
        if (!validated.ok) {
          if (!cancelled) {
            setBankError(`内置题库格式校验失败：${validated.error}`)
          }
          return
        }
        if (!cancelled) {
          applyNewBank(validated.data, `内置题库：${validated.data.metadata.title}`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) {
          setBankError(`加载内置题库时出现问题：${msg}`)
        }
      } finally {
        if (!cancelled) {
          setLoadingBank(false)
        }
      }
    }

    loadBuiltin()

    return () => {
      cancelled = true
    }
  }, [selectedBankKey, applyNewBank])
  const groups = useMemo(() => {
    if (!questionBank) return [] as { id: string; label: string; start: number; end: number }[]
    const size = QUESTIONS_PER_GROUP
    const res: { id: string; label: string; start: number; end: number }[] = []
    for (let i = 0; i < questionBank.questions.length; i += size) {
      const start = i
      const end = Math.min(i + size, questionBank.questions.length)
      res.push({ id: String(start), label: `第 ${start + 1}-${end} 题`, start, end })
    }
    return res
  }, [questionBank])

  useEffect(() => {
    if (questionBank && questionBank.questions.length > 0) {
      setActiveGroupId("0")
    } else {
      setActiveGroupId(null)
    }
  }, [questionBank])

  const totalQuestions = questionBank?.questions.length ?? 0
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers])
  const progressValue = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0

  useEffect(() => {
    if (typeof window === "undefined") return
    const root = document.documentElement

    const updateLayoutVars = () => {
      const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0
      const bottomBarHeight = bottomBarRef.current?.getBoundingClientRect().height ?? 0

      if (headerHeight > 0) {
        root.style.setProperty("--sticky-header-h", `${headerHeight}px`)
      }

      root.style.setProperty("--bottom-bar-h", `${bottomBarHeight > 0 ? bottomBarHeight : 0}px`)
    }

    updateLayoutVars()
    window.addEventListener("resize", updateLayoutVars)
    return () => {
      window.removeEventListener("resize", updateLayoutVars)
    }
  }, [isMobile, questionBank, totalQuestions])

  const handleAnswerChange = (questionId: string, choiceIndex: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceIndex }))
    setSubmitError(null)
    setResult(null)

    if (!questionBank || !isMobile || !autoNext) return

    const currentIndex = questionBank.questions.findIndex((q) => q.id === questionId)
    if (currentIndex === -1) return

    const nextIndex = currentIndex + 1
    if (nextIndex >= questionBank.questions.length) return

    const nextGroupId = String(Math.floor(nextIndex / QUESTIONS_PER_GROUP) * QUESTIONS_PER_GROUP)
    if (nextGroupId !== activeGroupId) {
      setActiveGroupId(nextGroupId)
    }

    const nextQuestionId = questionBank.questions[nextIndex].id
    const elementId = `question-card-${nextQuestionId}`

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const el = document.getElementById(elementId)
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      })
    }
  }

  const handleSubmit = () => {
    if (!questionBank) return
    if (answeredCount < totalQuestions) {
      const remain = totalQuestions - answeredCount
      setSubmitError(`还有 ${remain} 题未作答，请完成所有题目后再生成结果。`)
      if (questionSectionRef.current) {
        questionSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
      }
      return
    }
    const r = computeMbtiResult(questionBank, answers)
    setResult(r)
    setSubmitError(null)
    setCopyHint(null)
  }

  const handleReset = () => {
    setAnswers({})
    setResult(null)
    setSubmitError(null)
    setCopyHint(null)
    if (questionSectionRef.current) {
      questionSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBankError(null)

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = reader.result
        if (typeof text !== "string") {
          throw new Error("文件内容读取失败")
        }
        const json = JSON.parse(text)
        const validated = validateQuestionBank(json)
        if (!validated.ok) {
          setBankError(`题库文件不符合要求：${validated.error}`)
          return
        }
        applyNewBank(validated.data, `本地文件：${file.name}`)
        setSelectedBankKey("custom")
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setBankError(`解析题库 JSON 时出错：${msg}`)
      }
    }
    reader.onerror = () => {
      setBankError("读取文件时发生错误，请重试或更换文件。")
    }
    reader.readAsText(file, "utf-8")
  }

  const handleLoadFromUrl = async () => {
    if (!urlInput.trim()) {
      setBankError("请输入题库 JSON 的 URL。")
      return
    }
    try {
      setLoadingFromUrl(true)
      setBankError(null)
      const res = await fetch(urlInput.trim(), { cache: "no-store" })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const text = await res.text()
      const json = JSON.parse(text)
      const validated = validateQuestionBank(json)
      if (!validated.ok) {
        setBankError(`从 URL 加载的题库格式不符合要求：${validated.error}`)
        return
      }
      applyNewBank(validated.data, `远程 URL：${urlInput.trim()}`)
      setSelectedBankKey("custom")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setBankError(`从 URL 加载题库失败：${msg}。可能是网络、跨域（CORS）或 JSON 格式问题。`)
    } finally {
      setLoadingFromUrl(false)
    }
  }

  const handleExportJson = () => {
    if (!result) return
    try {
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `mbti-result-${result.type}-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      // 静默失败，不阻断用户
    }
  }

  const handleCopyResult = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(buildResultSummaryText(result))
      setCopyHint("结果已复制到剪贴板，可直接粘贴到聊天或文档中。")
    } catch {
      setCopyHint("复制到剪贴板失败，请手动选择结果区域内容进行复制。")
    }
  }

  const handleStartTest = () => {
    setHasStarted(true)
    if (questionSectionRef.current) {
      questionSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const activeTypeInfo = result ? TYPE_DESCRIPTIONS[result.type] : undefined

  const chartData = useMemo(
    () =>
      result
        ? result.pairScores.map((p) => ({
            name: p.key,
            左: p.leftPercent,
            右: p.rightPercent,
            leftLabel: p.leftLabel,
            rightLabel: p.rightLabel,
          }))
        : [],
    [result]
  )

  const timeEstimate = useMemo(() => getTimeEstimateRange(totalQuestions), [totalQuestions])

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 transition-colors">
        {/* 顶部导航 */}
        <header ref={headerRef} className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-sky-400 text-xs font-bold text-white shadow-sm">
                MBTI
              </div>
              <div>
                <div className="text-sm font-semibold sm:text-base">MBTI 专业版测试</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">专业题库 · 支持外部题库加载 · 实时百分比解析</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate-500 sm:inline dark:text-slate-400">暗色模式</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full border-slate-300 dark:border-slate-700"
                onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
                aria-label="切换明暗主题"
              >
                {theme === "light" ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <Sun className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </header>

        <main
          className="mx-auto max-w-5xl px-4 py-8 space-y-10"
          style={
            isMobile
              ? { paddingBottom: "calc(var(--bottom-bar-h, 72px) + env(safe-area-inset-bottom))" }
              : undefined
          }
        >
          {/* Hero 区 */}
          <section className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)] md:items-stretch">
            <Card className="border-slate-200 bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950/30">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span className="text-lg sm:text-xl">MBTI 专业版 · 在线性格评估</span>
                  <Badge variant="outline" className="border-indigo-400/70 bg-indigo-50 text-[10px] font-medium text-indigo-700 dark:border-indigo-500/70 dark:bg-indigo-950/60 dark:text-indigo-200">
                    专业题库
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed text-slate-600 sm:text-sm dark:text-slate-400">
                  本测评基于 MBTI 理论四大维度（E/I、S/N、T/F、J/P），通过多维度题目采集偏好倾向，自动计算百分比分布，
                  生成你的四字母类型与简要解读。你也可以加载自己的题库，用于团队测评或课程场景。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span>{timeEstimate} · 单页作答</span>
                  </div>
                  <Separator orientation="vertical" className="hidden h-3 sm:inline" />
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-sky-400" />
                    <span>支持本地 / URL 题库 JSON</span>
                  </div>
                  <Separator orientation="vertical" className="hidden h-3 sm:inline" />
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-indigo-400" />
                    <span>结果可导出 JSON 与复制分享</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="lg"
                    className="gap-2"
                    onClick={handleStartTest}
                    aria-label={hasStarted ? "继续作答 MBTI 测试" : "开始 MBTI 测试"}
                  >
                    <span>{hasStarted ? "继续作答" : "开始测试"}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    本测评结果仅供个人探索与沟通参考，不作为临床或招聘决定的唯一依据。
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">题库来源与当前状态</CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                  内置三套中文题库（简版 40题 / 标准版 80题 / 专业版 120题），也可以加载符合 Schema 的自定义题库 JSON。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-xs">
                  <Label className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <Info className="h-3.5 w-3.5" />
                      <span>题库选择</span>
                    </span>
                    {selectedBankKey === "custom" && (
                      <Badge
                        variant="outline"
                        className="border-amber-300 bg-amber-50 text-[11px] font-normal text-amber-700 dark:border-amber-500/70 dark:bg-amber-950/40 dark:text-amber-100"
                      >
                        当前为自定义题库
                      </Badge>
                    )}
                  </Label>
                  <Select
                    value={selectedBankKey}
                    onValueChange={(value) => {
                      const key = value as BuiltinBankKey
                      if (key === "custom") return
                      setSelectedBankKey(key)
                    }}
                  >
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue placeholder="选择要使用的题库" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUILTIN_BANKS.filter((b) => b.key !== "custom").map((bank) => (
                        <SelectItem key={bank.key} value={bank.key} className="text-xs">
                          {bank.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom" disabled className="text-xs">
                        自定义题库（通过下方上传 / URL 加载）
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    默认使用简版 40题，可在此切换为标准版或专业版。加载外部题库后会自动切换为“自定义题库”状态。
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <Info className="h-3.5 w-3.5" />
                    <span>当前题库概览</span>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <div className="font-medium">{bankSourceLabel}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {questionBank ? (
                        <>
                          <span>标题：{questionBank.metadata.title}</span>
                          <span>·</span>
                          <span>版本：{questionBank.metadata.version}</span>
                          <span>·</span>
                          <span>语言：{questionBank.metadata.language}</span>
                        </>
                      ) : (
                        <span>题库尚未成功加载或正在校验中。</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        题目数：{totalQuestions > 0 ? totalQuestions : "--"}
                      </span>
                      <span>·</span>
                      <span>
                        已作答：{answeredCount} / {totalQuestions || "--"}
                      </span>
                      <span>·</span>
                      <span>维度：E/I · S/N · T/F · J/P</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <Label htmlFor="bank-file" className="flex items-center gap-2 text-xs">
                      <Upload className="h-3.5 w-3.5" />
                      从本地上传题库 JSON
                    </Label>
                    <Input
                      id="bank-file"
                      type="file"
                      accept="application/json"
                      className="h-8 cursor-pointer text-xs file:mr-2 file:rounded-md file:border file:border-slate-200 file:bg-slate-50 file:px-2 file:py-1 file:text-xs file:font-medium hover:file:bg-slate-100 dark:file:border-slate-700 dark:file:bg-slate-900 dark:hover:file:bg-slate-800"
                      onChange={handleFileChange}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bank-url" className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <Link2 className="h-3.5 w-3.5" />
                        通过 URL 加载题库 JSON
                      </span>
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="bank-url"
                        placeholder="例如：https://example.com/mbti_pro_120.json"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 whitespace-nowrap gap-1"
                        onClick={handleLoadFromUrl}
                        disabled={loadingFromUrl}
                      >
                        {loadingFromUrl ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5" />
                        )}
                        <span>加载</span>
                      </Button>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Schema 需包含 metadata、dimensions 和 questions，详见页面下方 FAQ。
                    </p>
                  </div>
                </div>

                {loadingBank && (
                  <Alert className="border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
                    <AlertTitle className="text-xs">正在加载内置题库</AlertTitle>
                    <AlertDescription className="text-[11px]">
                      首次打开页面时会自动拉取内置题库，如长时间无响应，可尝试刷新页面。
                    </AlertDescription>
                  </Alert>
                )}

                {bankError && (
                  <Alert variant="destructive" className="border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-xs">题库加载失败</AlertTitle>
                    <AlertDescription className="text-[11px] leading-relaxed">{bankError}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </section>

          {/* 作答进度与题目区 */}
          <section ref={questionSectionRef} className="space-y-4">
            <Card className="border-slate-200 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm sm:text-base">答题进度</CardTitle>
                    <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                      请根据日常真实偏好作答，无需“选对”，只需选择更贴近你的一项。
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <div>
                      已完成：
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {answeredCount}
                      </span>
                      /{totalQuestions || "--"}
                    </div>
                    {!isMobile && (
                      <div className="hidden items-center gap-2 sm:flex">
                        <span>强制答完再出结果</span>
                        <Switch checked disabled className="scale-75" />
                      </div>
                    )}
                    {isMobile && (
                      <div className="flex items-center gap-2">
                        <span>自动下一题</span>
                        <Switch
                          checked={autoNext}
                          onCheckedChange={setAutoNext}
                          className="scale-75"
                          aria-label="切换作答后是否自动跳转到下一题"
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <Progress value={progressValue} className="h-2" />
                  <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>整体完成度：{progressValue}%</span>
                    <span>建议一次性完成，过程中可中途暂停。</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {questionBank && groups.length > 0 ? (
                  <Tabs
                    value={activeGroupId ?? groups[0]?.id}
                    onValueChange={(v) => setActiveGroupId(v)}
                    className="space-y-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="w-full overflow-x-auto">
                        <TabsList className="flex w-max gap-1">
                        {groups.map((g) => (
                          <TabsTrigger
                            key={g.id}
                            value={g.id}
                            className="px-2 py-1 text-[11px] sm:text-xs"
                          >
                            {g.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>点击分组可快速跳转不同题段。</span>
                      </div>
                    </div>

                    {groups.map((g) => (
                      <TabsContent key={g.id} value={g.id} className="space-y-3">
                        {questionBank.questions.slice(g.start, g.end).map((q, idx) => {
                          const globalIndex = g.start + idx
                          const selectedIndex = answers[q.id]
                          return (
                            <Card
                              key={q.id}
                              id={`question-card-${q.id}`}
                              className="border-slate-200 bg-slate-50/60 transition hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-indigo-500/70"
                              style={{ scrollMarginTop: "var(--sticky-header-h, 64px)" }}
                            >
                              <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
                                <div>
                                  <CardTitle className="text-sm font-medium sm:text-[15px]">
                                    第 {globalIndex + 1} 题
                                  </CardTitle>
                                  <CardDescription className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                                    {q.text}
                                  </CardDescription>
                                </div>
                                {selectedIndex !== undefined && (
                                  <Badge
                                    variant="outline"
                                    className="mt-1 border-emerald-300 bg-emerald-50 text-[10px] font-medium text-emerald-700 dark:border-emerald-500/70 dark:bg-emerald-950/40 dark:text-emerald-200"
                                  >
                                    已作答
                                  </Badge>
                                )}
                              </CardHeader>
                              <CardContent className="pt-0">
                                <RadioGroup
                                  value={selectedIndex !== undefined ? String(selectedIndex) : ""}
                                  onValueChange={(value) => handleAnswerChange(q.id, Number(value))}
                                  className="space-y-2.5"
                                >
                                  {q.choices.map((choice, cIdx) => {
                                    const checked = selectedIndex === cIdx
                                    return (
                                      <label
                                        key={cIdx}
                                        className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-sm transition ${
                                          checked
                                            ? "border-indigo-500 bg-indigo-50/80 shadow-sm dark:border-indigo-400 dark:bg-indigo-950/50"
                                            : "border-slate-200 bg-white/70 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-indigo-500/70"
                                        }`}
                                      >
                                        <RadioGroupItem value={String(cIdx)} className="mt-0.5" />
                                        <span>{choice.label}</span>
                                      </label>
                                    )
                                  })}
                                </RadioGroup>
                              </CardContent>
                            </Card>
                          )
                        })}
                      </TabsContent>
                    ))}
                  </Tabs>
                ) : (
                  <div className="rounded-md bg-slate-50 px-4 py-6 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    {bankError ? (
                      <p>题库尚未成功加载，请先检查上方题库加载区的提示信息。</p>
                    ) : (
                      <p>正在准备题库，请稍候片刻。如果长时间无响应，可以尝试刷新页面或重新加载题库。</p>
                    )}
                  </div>
                )}
              </CardContent>

              <CardFooter className="hidden border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 sm:flex sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    className="gap-1"
                    disabled={!questionBank || totalQuestions === 0}
                    onClick={handleSubmit}
                  >
                    生成结果
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={handleReset}
                    disabled={!questionBank || totalQuestions === 0}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    重新作答
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  <span>
                    请基于「真实、稳定的日常偏好」作答，而非理想中的自己。
                  </span>
                </div>
              </CardFooter>

              {submitError && (
                <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-[11px] text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
                  {submitError}
                </div>
              )}
            </Card>
          </section>

          {/* 结果区 */}
          {result && (
            <section className="space-y-4">
              <Card className="border-slate-200 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-baseline gap-2 text-lg sm:text-xl">
                        <span>你的 MBTI 类型：</span>
                        <span className="font-mono text-2xl tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
                          {result.type}
                        </span>
                        {activeTypeInfo && (
                          <Badge variant="outline" className="text-xs font-normal">
                            {activeTypeInfo.name}
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        基于当前题库与作答情况计算的四维偏好比例，仅代表在本测评框架下的倾向分布。
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>题库：{result.bankMetadata.title}</span>
                      <span>· 版本：{result.bankMetadata.version}</span>
                      <span>· 已答：{result.answeredCount}/{result.totalQuestions}</span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)]">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                        <span>四维偏好强度条形图</span>
                        <span className="text-[11px]">越接近 100%，代表在该方向上的偏好越明显。</span>
                      </div>
                      <div className="h-56 rounded-md border border-slate-100 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-950/70">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                            <RechartsTooltip
                              formatter={(value: any, _name: any, props: any) => {
                                const p = props?.payload as any
                                if (!p) return value
                                const label = props.dataKey === "左" ? p.leftLabel : p.rightLabel
                                return [`${value}%`, label]
                              }}
                              labelFormatter={(label: any) => `维度组：${label}`}
                            />
                            <Bar dataKey="左" name="左侧维度" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="右" name="右侧维度" fill="#22c55e" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                      {result.pairScores.map((p) => (
                        <div key={p.key} className="flex flex-col gap-1 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900/70">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">
                              {p.leftLabel} vs {p.rightLabel}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {p.leftPercent}% / {p.rightPercent}%
                            </span>
                          </div>
                          <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                            <div
                              className="h-full bg-indigo-500"
                              style={{ width: `${p.leftPercent}%` }}
                            />
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${p.rightPercent}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Card className="border-slate-200 bg-slate-50/80 shadow-none dark:border-slate-700 dark:bg-slate-900/70">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">类型简要说明</CardTitle>
                        <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                          结合你的四字母类型，从整体气质与常见倾向两个角度给出简要描述与发展建议。
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        <p>{activeTypeInfo?.summary ?? "当前类型暂无预设描述，你可以结合维度百分比自行理解和补充。"}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          建议：{activeTypeInfo?.advice ?? "建议关注每一条维度的强弱分布，将结果作为探索自我偏好和沟通风格的起点，而非标签。"}
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-dashed border-slate-200 bg-slate-50/60 shadow-none dark:border-slate-700 dark:bg-slate-900/60">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">结果导出与分享</CardTitle>
                        <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                          可导出 JSON 文件，或复制文本结果，便于后续在团队 workshop、教练会谈或个人记录中使用。
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="outline" className="gap-1" onClick={handleExportJson}>
                            <Download className="h-3.5 w-3.5" />
                            导出结果 JSON
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1" onClick={handleCopyResult}>
                            <Copy className="h-3.5 w-3.5" />
                            复制结果到剪贴板
                          </Button>
                        </div>
                        {copyHint && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{copyHint}</p>
                        )}
                        <div className="space-y-1">
                          <Label className="text-[11px]">结果 JSON 预览（只读）</Label>
                          <Textarea
                            readOnly
                            className="h-32 resize-none text-[11px] font-mono"
                            value={JSON.stringify(result, null, 2)}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                      <Info className="mt-px h-3.5 w-3.5" />
                      <p>
                        MBTI 更关注「偏好」而非「能力」或「价值判断」。同一类型的人之间也会存在显著个体差异，请避免用类型标签替代对一个人的完整理解。
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          )}

          {/* FAQ 区 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight sm:text-base">常见问题（FAQ）</h2>
            </div>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger className="text-xs sm:text-sm">
                  1. 题库 JSON 需要满足什么格式？
                </AccordionTrigger>
                <AccordionContent className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  <p>
                    题库 JSON 顶层需包含三个字段：<code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-slate-800">metadata</code>、
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-slate-800">dimensions</code> 和
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-slate-800">questions</code>。
                    其中 metadata 至少包含 <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-slate-800">title</code>、
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-slate-800">version</code> 和
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-slate-800">language</code>；
                    dimensions 需至少包含 E、I、S、N、T、F、J、P；questions 为题目数组，每题含 id、text 以及 choices，
                    每个 choice 内需提供 label 与 weights（各维度的数值权重）。
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2">
                <AccordionTrigger className="text-xs sm:text-sm">
                  2. URL 加载题库时，为什么会报跨域或网络错误？
                </AccordionTrigger>
                <AccordionContent className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  <p>
                    通过 URL 拉取题库时，浏览器会受到 CORS（跨域访问）和网络策略限制。如果服务器未正确设置 CORS 头，或网络暂时不可达，
                    页面会提示加载失败。你可以：
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    <li>优先使用同源或支持 CORS 的静态资源服务；</li>
                    <li>在浏览器中单独打开该 URL，确认能正常返回 JSON；</li>
                    <li>如仍受限，可改为下载后通过「本地上传」方式加载。</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3">
                <AccordionTrigger className="text-xs sm:text-sm">
                  3. 本测试结果可以用于招聘或诊断吗？
                </AccordionTrigger>
                <AccordionContent className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  <p>
                    建议不要将 MBTI 结果作为招聘录用、岗位调整或临床诊断的唯一依据。MBTI 更适合作为个人探索、团队沟通、
                    工作风格讨论的起点工具。若涉及重要人事决策或心理健康议题，请优先咨询具备专业资质的机构或人员。
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>
        </main>

        {isMobile && questionBank && totalQuestions > 0 && (
          <div
            ref={bottomBarRef}
            className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-2 pb-[env(safe-area-inset-bottom)] text-xs text-slate-700 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 dark:text-slate-100"
          >
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
              <div className="flex flex-1 items-center gap-2">
                <Button
                  size="sm"
                  className="flex-1 gap-1"
                  disabled={!questionBank || totalQuestions === 0}
                  onClick={handleSubmit}
                  aria-label="生成 MBTI 测试结果"
                >
                  生成结果
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1"
                  onClick={handleReset}
                  disabled={!questionBank || totalQuestions === 0}
                  aria-label="重新作答 MBTI 测试题目"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  重新作答
                </Button>
              </div>
              <div className="hidden text-[11px] text-slate-500 sm:block dark:text-slate-400">
                已完成 {answeredCount}/{totalQuestions || "--"}
              </div>
            </div>
          </div>
        )}

        <footer className="mt-8 border-t border-slate-200 bg-slate-50/80 py-4 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-400">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4">
            <span>本页面仅用于 MBTI 风格偏好自测与教学演示，不构成任何形式的专业诊断。</span>
            <span>
              当前题库支持自定义加载，如需将结果用于课程或团队，可导出 JSON 统一归档。
            </span>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  )
}

export default App
