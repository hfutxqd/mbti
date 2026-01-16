import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import "./App.css"

import { Moon, Sun, RefreshCw, Info, AlertCircle, ArrowRight, Image } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
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

import ISTJImage from "@/assets/mbti/ISTJ.svg"
import ISFJImage from "@/assets/mbti/ISFJ.svg"
import INFJImage from "@/assets/mbti/INFJ.svg"
import INTJImage from "@/assets/mbti/INTJ.svg"
import ISTPImage from "@/assets/mbti/ISTP.svg"
import ISFPImage from "@/assets/mbti/ISFP.svg"
import INFPImage from "@/assets/mbti/INFP.svg"
import INTPImage from "@/assets/mbti/INTP.svg"
import ESTPImage from "@/assets/mbti/ESTP.svg"
import ESFPImage from "@/assets/mbti/ESFP.svg"
import ENFPImage from "@/assets/mbti/ENFP.svg"
import ENTPImage from "@/assets/mbti/ENTP.svg"
import ESTJImage from "@/assets/mbti/ESTJ.svg"
import ESFJImage from "@/assets/mbti/ESFJ.svg"
import ENFJImage from "@/assets/mbti/ENFJ.svg"
import ENTJImage from "@/assets/mbti/ENTJ.svg"

// ================= 类型定义 =================

type DimensionKey = "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P" | "A" | "Turb" | "H" | "C"

const CORE_DIM_KEYS: DimensionKey[] = ["E", "I", "S", "N", "T", "F", "J", "P"]
const EXT_DIM_KEYS: DimensionKey[] = ["A", "Turb", "H", "C"]
const ALL_DIM_KEYS: DimensionKey[] = [...CORE_DIM_KEYS, ...EXT_DIM_KEYS]
const QUESTIONS_PER_GROUP = 10

type BuiltinBankKey = "pro-120" | "standard-80" | "simple-40" | "ext-60" | "ext-120" | "ext-180"

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
    key: "ext-60",
    label: "MBTI 扩展版 60题（含 A/T、H/C）",
    description: "在经典四维基础上增加 A/T 与 H/C 两组扩展维度，适合快速体验扩展版。",
    file: "/mbti_ext_60.json",
  },
  {
    key: "ext-120",
    label: "MBTI 扩展版 120题（含 A/T、H/C）",
    description: "扩展题量与情境覆盖，更细腻地刻画六组维度偏好。",
    file: "/mbti_ext_120.json",
  },
  {
    key: "ext-180",
    label: "MBTI 扩展版 180题（含 A/T、H/C）",
    description: "高精度测评版本，适合深度辅导与研究场景。",
    file: "/mbti_ext_180.json",
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
  A: number
  Turb: number
  H: number
  C: number
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
  key: "EI" | "SN" | "TF" | "JP" | "AT" | "HC"
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
  // 核心四字母类型，用于说明文案与查表
  type: string
  // 展示用类型字符串：可能是 4 字母或 6 字母（含 A/T、H/C 后缀）
  displayType: string
  pairScores: PairScore[]
  extendedPairScores?: PairScore[]
  rawScores: Record<DimensionKey, number>
  answeredCount: number
  totalQuestions: number
  bankMetadata: QuestionBankMetadata
  createdAt: string
}

interface TypeDescription {
  name: string
  summary: string
  advice: string
  career: string
  relationship: string
  cautions: string[]
}

// ================= 工具函数 =================

// 4 字母与 6 字母类型正则，用于解析 URL 中的 result 参数
const MBTI_TYPE_4_REGEX = /^[EI][SN][TF][JP]$/
// 6 字母：前四位为经典 MBTI 类型，后两位分别为 A/T 与 H/C
const MBTI_TYPE_6_REGEX = /^[EI][SN][TF][JP][AT][HC]$/

function buildNeutralPairScores(): PairScore[] {
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

  return pairConfigs.map((cfg) => ({
    key: cfg.key,
    left: cfg.left,
    right: cfg.right,
    leftLabel: cfg.leftLabel,
    rightLabel: cfg.rightLabel,
    leftScore: 0,
    rightScore: 0,
    leftPercent: 50,
    rightPercent: 50,
  }))
}

function buildNeutralExtendedPairScores(): PairScore[] {
  const extConfigs: Array<{
    key: PairScore["key"]
    left: DimensionKey
    right: DimensionKey
    leftLabel: string
    rightLabel: string
  }> = [
    {
      key: "AT",
      left: "A",
      right: "Turb",
      leftLabel: "自信 (A)",
      rightLabel: "敏感 (T)",
    },
    {
      key: "HC",
      left: "H",
      right: "C",
      leftLabel: "活跃 (H)",
      rightLabel: "沉稳 (C)",
    },
  ]

  return extConfigs.map((cfg) => ({
    key: cfg.key,
    left: cfg.left,
    right: cfg.right,
    leftLabel: cfg.leftLabel,
    rightLabel: cfg.rightLabel,
    leftScore: 0,
    rightScore: 0,
    leftPercent: 50,
    rightPercent: 50,
  }))
}

function createEmptyRawScores(): Record<DimensionKey, number> {
  const scores: Record<DimensionKey, number> = {
    E: 0,
    I: 0,
    S: 0,
    N: 0,
    T: 0,
    F: 0,
    J: 0,
    P: 0,
    A: 0,
    Turb: 0,
    H: 0,
    C: 0,
  }
  return scores
}

function parsePercentParam(params: URLSearchParams, name: string): number | null {
  const raw = params.get(name)
  if (raw == null) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  const clamped = Math.min(100, Math.max(0, rounded))
  return clamped
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  const rounded = Math.round(value)
  return Math.min(100, Math.max(0, rounded))
}

const PERCENT_PARAM_KEYS = [
  "p_e",
  "p_i",
  "p_s",
  "p_n",
  "p_t",
  "p_f",
  "p_j",
  "p_p",
  "p_a",
  "p_turb",
  "p_h",
  "p_c",
] as const

type PercentParamKey = (typeof PERCENT_PARAM_KEYS)[number]

const PAIR_PARAM_NAME_MAP: Record<
  PairScore["key"],
  { left: PercentParamKey; right: PercentParamKey }
> = {
  EI: { left: "p_e", right: "p_i" },
  SN: { left: "p_s", right: "p_n" },
  TF: { left: "p_t", right: "p_f" },
  JP: { left: "p_j", right: "p_p" },
  AT: { left: "p_a", right: "p_turb" },
  HC: { left: "p_h", right: "p_c" },
}

function normalizePairPercents(
  leftRaw: number | null,
  rightRaw: number | null
): { leftPercent: number; rightPercent: number } {
  if (leftRaw == null && rightRaw == null) {
    return { leftPercent: 50, rightPercent: 50 }
  }

  if (leftRaw != null && rightRaw != null) {
    const sum = leftRaw + rightRaw
    if (sum >= 90 && sum <= 110) {
      return {
        leftPercent: clampPercent(leftRaw),
        rightPercent: clampPercent(rightRaw),
      }
    }
    const left = clampPercent(leftRaw)
    return { leftPercent: left, rightPercent: 100 - left }
  }

  if (leftRaw != null) {
    const left = clampPercent(leftRaw)
    return { leftPercent: left, rightPercent: 100 - left }
  }

  const right = clampPercent(rightRaw!)
  return { leftPercent: 100 - right, rightPercent: right }
}

function updateUrlWithResult(result: MBTIResult | null) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)

  // 清理所有维度相关参数
  for (const key of PERCENT_PARAM_KEYS) {
    url.searchParams.delete(key)
  }

  if (result) {
    url.searchParams.set("result", result.displayType)

    const allPairs: PairScore[] = [
      ...result.pairScores,
      ...(result.extendedPairScores ?? []),
    ]

    for (const pair of allPairs) {
      const names = PAIR_PARAM_NAME_MAP[pair.key]
      if (!names) continue

      // 对于扩展维度，在得分为 0/0（无效维度）时不写入 URL
      if ((pair.key === "AT" || pair.key === "HC") && pair.leftScore === 0 && pair.rightScore === 0) {
        continue
      }

      const left = clampPercent(pair.leftPercent)
      const right = clampPercent(pair.rightPercent)

      url.searchParams.set(names.left, String(left))
      url.searchParams.set(names.right, String(right))
    }
  } else {
    url.searchParams.delete("result")
  }

  window.history.pushState(null, "", url.toString())
}

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

  const dimStrings: string[] = dimensions
  const hasAllDims = CORE_DIM_KEYS.every((d) => dimStrings.includes(d))
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
        A: 0,
        Turb: 0,
        H: 0,
        C: 0,
      }

      for (const dim of ALL_DIM_KEYS) {
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
    dimensions: ALL_DIM_KEYS.filter((d) => dimStrings.includes(d)),
    questions: normalizedQuestions,
  }

  return { ok: true, data: normalizedBank }
}

const TYPE_DESCRIPTIONS: Record<string, TypeDescription> = {
  ISTJ: {
    name: "务实负责型",
    summary:
      "你重视规则与秩序，做事稳健可靠，习惯用事实和经验说话，是团队中值得托付的人。",
    advice:
      "在坚持原则的同时，可以适当分享自己的感受，多给他人一些情绪上的回应，会让合作更顺畅。",
    career:
      "在有清晰流程和标准的环境中表现稳定可靠，适合从事项目管理、质量管理、财务、运营、行政等需要细致、守时和负责任的岗位。你擅长把事情按既定规则一步步推进，保证结果落地。",
    relationship:
      "在人际关系中，你更习惯用行动而非语言表达关心，重视承诺和可靠性。你不太喜欢情绪化的场景，但会默默记住对方的需求并落实在具体安排上。",
    cautions: [
      "容易对自己和他人要求过高，以“对/错”“应该/不应该”来评估行为，忽略情境的弹性。",
      "面对变化或模糊时可能本能地抗拒，过于依赖旧经验，导致适应新规则的节奏偏慢。",
      "习惯把情绪收起来独自消化，长期下来可能让别人难以读懂你的真实状态。",
    ],
  },
  ISFJ: {
    name: "守护照料型",
    summary:
      "你细腻体贴，善于照顾他人的需求，愿意在幕后默默付出，是团队中的稳定力量。",
    advice:
      "在照顾他人的同时，也要给自己留出空间，适时表达边界和需求，才能长期稳定地付出。",
    career:
      "你在需要耐心、细致和稳定投入的岗位上表现突出，例如行政支持、客户服务、护理、教学、HR 等。你擅长照顾细节，维护秩序，让团队在安稳的环境中运转。",
    relationship:
      "你敏感细腻，很在意他人的感受，会主动记住对方的喜好与习惯，用周到的照顾表达关心。与亲近的人相处时，你期望彼此可靠、稳定，但不一定擅长直接表达自己真正的需要。",
    cautions: [
      "容易把“照顾大家”当成自己的责任，长期忽略自己的感受与极限。",
      "不擅长拒绝，害怕让人失望，从而承担超出能力或意愿的任务。",
      "面对冲突时倾向于回避或自责，可能需要练习更直接、温和地表达不满。",
    ],
  },
  INFJ: {
    name: "洞察策划型",
    summary:
      "你敏感而有洞察力，关注长期价值和他人的成长，常常扮演策划者和支持者的角色。",
    advice:
      "你的直觉很宝贵，但也可以主动把想法说出来，与更多人共创，避免独自承担过多压力。",
    career:
      "你适合在关注意义、成长与长期规划的岗位发挥价值，例如咨询、教练、心理相关工作、HRBP、产品策划、品牌策略等。你擅长从复杂信息中抽取趋势，为个人或团队提供方向性建议。",
    relationship:
      "在人际关系中，你重视深度与真实性，倾向于少而稳的亲密关系。你很会读空气，能敏锐感知他人情绪，但不总会把自己的困惑说出口，容易在内心默默承受。",
    cautions: [
      "容易过度解读他人的言行，把尚不确定的信号视为“已经定局”。",
      "习惯自己消化压力，不愿麻烦别人，长期可能形成隐形的累积怨气。",
      "对“理想关系/理想自己”标准较高，需留意在现实中给自己更多宽容与弹性。",
    ],
  },
  INTJ: {
    name: "战略规划型",
    summary:
      "你善于从全局思考问题，擅长制定长期规划与系统方案，对效率与逻辑有高要求。",
    advice:
      "在追求高标准的同时，适当关注团队的节奏与感受，解释你的想法，会让他人更愿意跟随。",
    career:
      "你在需要系统思考和长期规划的领域会很有优势，例如战略规划、产品与技术架构、数据分析、研究设计等。你擅长拆解复杂问题，建立结构清晰、可复用的解决方案。",
    relationship:
      "在关系中，你重视共同目标和价值观，表达关心的方式偏理性、务实。你可能不太擅长细腻的情绪回应，但一旦认定一段关系，会愿意投入长期的建设和优化。",
    cautions: [
      "容易把“效率”和“正确”放在首位，忽略他人的情感接受度和节奏。",
      "对自己和他人要求高，可能在不自觉中传递出苛刻或挑剔的氛围。",
      "当他人观点缺乏逻辑时容易失去耐心，需要刻意练习“说给对方听得懂”的沟通方式。",
    ],
  },
  ISTP: {
    name: "冷静实干型",
    summary:
      "你动手能力强，遇事冷静、客观，擅长在复杂环境中迅速找出关键并解决问题。",
    advice:
      "可以多向他人分享你的思路与经验，这不仅能帮助团队，也能让你的价值被更清晰地看到。",
    career:
      "你适合在需要动手能力和现场判断的环境中工作，例如工程维护、技术支持、研发、运维、应急处理等。你冷静客观，擅长在混乱中快速定位问题、找到可行解。",
    relationship:
      "你不喜欢情绪过度渲染，更愿意用实际帮助、解决问题来表达关心。你重视个人空间和自由节奏，喜欢在关系中保留一定独立性。",
    cautions: [
      "在冲突或压力情境中可能选择“消失”“不回应”，让对方感到被冷落。",
      "不擅长长篇情绪对话，容易被误解为“不在乎”“不认真”。",
      "偏好即时决策与尝试，需留意在关键事务上和他人提前沟通风险与后果。",
    ],
  },
  ISFP: {
    name: "温柔体验型",
    summary:
      "你温和平实，重视真实感受与当下体验，喜欢以自己的节奏悄然完成高质量的工作。",
    advice:
      "在尊重内心节奏的同时，也可以适度表达自己的想法和审美，你的观点往往比你想象得更重要。",
    career:
      "你在需要审美感受、细腻体验和稳定节奏的岗位表现良好，例如设计、手作/工艺、视觉内容、文案、艺术相关工作，或需要耐心服务的前线岗位。你重视工作与生活的和谐度。",
    relationship:
      "你温和体贴，不喜欢强硬对抗，更擅长在安静陪伴或小小细节中表达爱。你希望被温柔对待，也希望对方尊重你的节奏与边界。",
    cautions: [
      "面对不舒服的事情时，可能选择装作没事，长期积累后才一次性爆发。",
      "很难对喜欢的人说“不”，容易让自己处于委屈或透支状态。",
      "在重要决定上可能拖延或犹豫，需要给自己一些明确的时间点与行动计划。",
    ],
  },
  INFP: {
    name: "理想主义型",
    summary:
      "你重视价值观与意义，对人和世界有自己的理想与期望，常常在内心进行丰富的思考。",
    advice:
      "可以尝试把理想拆解成具体可行的小步骤，在现实中一点点落地，你的理想值得被看见。",
    career:
      "你更在意工作的意义感，适合从事写作/内容、教育、公益、心理相关、产品与品牌故事等岗位。你愿意为认同的价值和理念投入大量精力，并在创意和表达上有优势。",
    relationship:
      "你情感细腻，容易在关系中投入很深，对“被理解”和“被看见”有很强的期待。你通常温柔而包容，但内心标准较高，也容易在失望时悄然抽离。",
    cautions: [
      "容易在脑海中构建“理想的自己/对方/关系”，现实与理想差距会带来较大落差感。",
      "情绪低落时倾向于内耗与自责，而非向外求助或行动调整。",
      "在设置边界与表达不满时较为困难，需练习把“感受”转化为具体、清晰的需求表达。",
    ],
  },
  INTP: {
    name: "理性分析型",
    summary:
      "你好奇心强，喜欢研究本质问题，擅长搭建逻辑框架，是思考型与创意型工作的重要力量。",
    advice:
      "在深入思考的同时，可以有意识地关注执行与落地，多与实践者合作，让好点子真正发生。",
    career:
      "你适合在需要抽象思考和系统搭建的领域工作，例如研发、算法、架构设计、策略分析、咨询、知识产品等。你擅长提出新思路、构建模型，为复杂问题寻找优雅解法。",
    relationship:
      "在关系中，你更习惯用讨论观点、分享知识来建立连接。你不太擅长频繁的小情绪互动，可能忽略日常的仪式感和关系维护节奏。",
    cautions: [
      "容易陷入长时间的分析与比较，推迟决策或行动，给他人造成“拖延”“不定”的印象。",
      "喜欢就事论理，辩论时可能忽略对方的情绪承受度。",
      "对日常琐事与关系维护缺乏耐心，需要刻意安排一些“例行维护”的时间。",
    ],
  },
  ESTP: {
    name: "行动挑战型",
    summary:
      "你反应敏捷、喜欢尝试，擅长在现场做决策，也乐于在变化环境中寻找机会。",
    advice:
      "适当为自己预留复盘时间，思考长期影响，可以让你的敏捷与行动力发挥得更持久稳定。",
    career:
      "你在需要即时反应和现场判断的岗位上优势明显，例如销售、商务拓展、渠道运营、现场运营、应急管理等。你勇于尝试新方案，善于抓住即时机会。",
    relationship:
      "你直率、大方，喜欢和人当面互动，通过一起体验活动来拉近关系。你不太习惯长时间的情绪拉扯，更偏好直接、开门见山的沟通。",
    cautions: [
      "容易因为追求“当下好玩”而忽略中长期的代价与承诺。",
      "在冲突中可能反应过快、话说得太满，事后需要花时间修复关系。",
      "习惯凭临场感觉做决定，需在关键节点上多预留一点思考和复盘时间。",
    ],
  },
  ESFP: {
    name: "活力表达型",
    summary:
      "你热情外向，关注当下体验，善于活跃氛围，让身边的人感到轻松愉快。",
    advice:
      "在照顾氛围之余，也可以偶尔停下来，想一想自己真正想要什么，让热情更好地为自己服务。",
    career:
      "你在需要与人频繁互动、营造氛围的岗位中表现亮眼，例如活动运营、销售顾问、培训主持、主播/内容创作、客服等。你能快速察觉现场气氛并做出调整。",
    relationship:
      "你热情外向，善于用幽默和陪伴带给身边人愉悦感。你不喜欢过于压抑或冷淡的关系，倾向于用轻松方式处理矛盾，有时会回避更沉重的话题。",
    cautions: [
      "容易为了“大家开心”忽略自己真实的疲惫或不满。",
      "在消费和时间安排上可能偏向随性，需要适度规划以避免事后压力。",
      "面对严肃对话或长期承诺时可能有逃避倾向，需要刻意面对并表达真实立场。",
    ],
  },
  ENFP: {
    name: "灵感驱动型",
    summary:
      "你充满好奇与创意，善于发现可能性，喜欢与人连接并激发他人的热情。",
    advice:
      "可以尝试给灵感设定一些边界和优先级，把部分想法落到具体计划上，避免精力被过度分散。",
    career:
      "你在需要创意、连接人与点子的场景中很有优势，例如品牌与市场、创新项目、产品探索、组织发展、社区运营等。你善于启动新项目、调动他人热情。",
    relationship:
      "你重视灵魂层面的交流，擅长倾听和共情，也喜欢在关系中一起探索新鲜体验。你在关系初期通常投入度高，但在进入稳定日常后可能感到乏味。",
    cautions: [
      "兴趣点多，容易“广撒网、少收尾”，导致项目与关系都缺少稳定沉淀。",
      "对他人回应较为敏感，容易过度解读对方的情绪或语气。",
      "需要注意在照顾他人感受的同时，也清晰表达自己的底线与节奏。",
    ],
  },
  ENTP: {
    name: "辩证创新型",
    summary:
      "你思维敏捷，喜欢挑战既有观点，从不同角度论证问题，常能提出意想不到的方案。",
    advice:
      "在享受讨论的同时，也要留意他人的感受与节奏，适度收敛锋芒，有助于长久合作关系。",
    career:
      "你适合在需要不断提出新观点和挑战现状的环境中工作，例如创新业务、战略咨询、产品探索、创业、媒体与内容策划等。你擅长从不同角度拆解问题并找到非传统解法。",
    relationship:
      "在关系中，你机智幽默，喜欢通过“斗嘴”和观点碰撞来建立亲密感。对你来说，好玩、有思想交流的关系比形式上的浪漫更重要。",
    cautions: [
      "喜欢辩论和拆台，有时会让对方感到被挑衅或不被尊重。",
      "容易在新鲜感消退后失去耐心，需要刻意练习长期陪伴与落实细节。",
      "对规则和约束不耐烦，在团队或亲密关系中需要平衡个人自由与共同约定。",
    ],
  },
  ESTJ: {
    name: "执行管理型",
    summary:
      "你重视秩序和效率，擅长组织资源、推动落地，是天然的执行者和管理者。",
    advice:
      "在坚持标准的同时，多听听不同声音，适当留出弹性空间，往往能收获更好的整体效果。",
    career:
      "你在需要组织资源、制定流程并确保执行到位的岗位上表现突出，例如项目管理、运营管理、团队负责人、行政管理等。你擅长把目标拆解成具体步骤并推动落实。",
    relationship:
      "在关系中，你讲原则、重承诺，习惯用“解决问题”的方式表达关心。你会在乎对方是否负责、是否守约，对“说一套做一套”较难容忍。",
    cautions: [
      "容易把自己的标准当成“唯一正确方式”，在无意间给他人较大压力。",
      "表达直接，有时在语气上显得过于强硬，削弱了本意中的关心。",
      "在面对情绪问题时容易急于给出解决方案，而忽略单纯的理解和陪伴。",
    ],
  },
  ESFJ: {
    name: "协调支持型",
    summary:
      "你乐于维护团队和谐，重视责任与承诺，善于在关系网络中进行协调与照应。",
    advice:
      "可以学着区分“我应该”与“我想要”，在承担责任之外，也照顾好自己的节奏与界限。",
    career:
      "你在需要协调人与资源、维护关系氛围的岗位上很有优势，例如 HR、客户成功、班主任/教务、行政协调、社区运营等。你擅长建立照顾周全的支持系统。",
    relationship:
      "你很愿意为身边的人付出时间和精力，主动组织聚会、记住重要日子，让大家感到被照顾和被连接。你也在意他人对自己的评价和反馈。",
    cautions: [
      "过于关注他人感受和外界评价，容易忽略自己的真实需要。",
      "不擅长处理负面冲突，可能选择用忙碌和服务来掩盖不满。",
      "容易把“维持和谐”放在第一位，压抑真实观点，长期下来会感到疲惫。",
    ],
  },
  ENFJ: {
    name: "鼓舞引导型",
    summary:
      "你关注他人的潜力与情绪，擅长激励和组织，是天然的引导者与支持者。",
    advice:
      "在投入大量精力帮助他人时，也别忽略自己的需要，适时补充能量，才能持续地给予。",
    career:
      "你适合在需要引导、激励和培育他人的岗位上工作，例如培训讲师、教练/咨询、HR 与组织发展、团队负责人、社群运营等。你擅长看见他人潜力并为其设计成长路径。",
    relationship:
      "在关系中，你会投入大量精力去理解和照顾对方，希望成为对方可以依赖的支撑者。你重视互动质量，也很敏感对方的情绪变化。",
    cautions: [
      "容易在关系中承担过多责任，把别人的问题也揽在自己身上。",
      "在关心他人时可能不自觉地带入“指导/劝说”姿态，让对方感到压力。",
      "长期把注意力放在他人身上，可能忽略自己真正的感受和界限。",
    ],
  },
  ENTJ: {
    name: "果断领航型",
    summary:
      "你目标感强，善于统筹规划和决策，愿意为长期愿景承担责任，是典型的领导型人格。",
    advice:
      "在追求结果与效率的同时，适度放慢节奏、倾听他人感受，会让你的领导更具温度与凝聚力。",
    career:
      "你在需要决策、统筹和带领团队达成目标的岗位上具备明显优势，例如业务负责人、项目总监、创业者、咨询顾问等。你擅长设定方向、分配资源并推动执行。",
    relationship:
      "在关系中，你希望彼此在目标感和能力上是可以并肩的伙伴关系。你表达直接、务实，习惯用“共同规划未来”的方式来体现重视。",
    cautions: [
      "容易在无意间把工作节奏带入所有关系，对效率与结果的强调让对方感到紧绷。",
      "对他人失误容忍度不高，容易在语气上显得批评性较强。",
      "需要刻意练习放慢节奏，倾听和共情，而不仅是给出解决方案。",
    ],
  },
}

const TYPE_IMAGE_MAP: Record<string, string> = {
  ISTJ: ISTJImage,
  ISFJ: ISFJImage,
  INFJ: INFJImage,
  INTJ: INTJImage,
  ISTP: ISTPImage,
  ISFP: ISFPImage,
  INFP: INFPImage,
  INTP: INTPImage,
  ESTP: ESTPImage,
  ESFP: ESFPImage,
  ENFP: ENFPImage,
  ENTP: ENTPImage,
  ESTJ: ESTJImage,
  ESFJ: ESFJImage,
  ENFJ: ENFJImage,
  ENTJ: ENTJImage,
}

function computeMbtiResult(bank: QuestionBank, answers: Record<string, number>): MBTIResult {
  const scores: Record<DimensionKey, number> = createEmptyRawScores()

  let answeredCount = 0

  for (const q of bank.questions) {
    const choiceIndex = answers[q.id]
    if (choiceIndex === undefined || choiceIndex === null) continue
    const choice = q.choices[choiceIndex]
    if (!choice) continue
    answeredCount++
    for (const dim of ALL_DIM_KEYS) {
      scores[dim] += choice.weights[dim] ?? 0
    }
  }

  const corePairConfigs: Array<{
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

  const extendedPairConfigs: Array<{
    key: PairScore["key"]
    left: DimensionKey
    right: DimensionKey
    leftLabel: string
    rightLabel: string
  }> = [
    {
      key: "AT",
      left: "A",
      right: "Turb",
      leftLabel: "自信 (A)",
      rightLabel: "敏感 (T)",
    },
    {
      key: "HC",
      left: "H",
      right: "C",
      leftLabel: "活跃 (H)",
      rightLabel: "沉稳 (C)",
    },
  ]

  const pairScores: PairScore[] = corePairConfigs.map((cfg) => {
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

  const extendedPairScores: PairScore[] = extendedPairConfigs.map((cfg) => {
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

  // 判断题库是否为扩展版（包含 A/T 与 H/C 维度），且扩展维度有有效得分
  const hasExtendedDimsInBank =
    bank.dimensions.includes("A") &&
    bank.dimensions.includes("Turb") &&
    bank.dimensions.includes("H") &&
    bank.dimensions.includes("C")

  const atPair = extendedPairScores.find((p) => p.key === "AT")
  const hcPair = extendedPairScores.find((p) => p.key === "HC")
  const hasATValid = !!(atPair && (atPair.leftScore !== 0 || atPair.rightScore !== 0))
  const hasHCValid = !!(hcPair && (hcPair.leftScore !== 0 || hcPair.rightScore !== 0))

  let displayType = type
  if (hasExtendedDimsInBank && hasATValid && hasHCValid && atPair && hcPair) {
    const fifth = atPair.leftScore >= atPair.rightScore ? "A" : "T"
    const sixth = hcPair.leftScore >= hcPair.rightScore ? "H" : "C"
    displayType = `${type}${fifth}${sixth}`
  }

  return {
    type,
    displayType,
    pairScores,
    extendedPairScores,
    rawScores: scores,
    answeredCount,
    totalQuestions: bank.questions.length,
    bankMetadata: bank.metadata,
    createdAt: new Date().toISOString(),
  }
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

function App(): React.ReactElement {
  const isMobile = useIsMobile()
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const [questionBank, setQuestionBank] = useState<QuestionBank | null>(null)
  const [selectedBankKey, setSelectedBankKey] = useState<BuiltinBankKey>(DEFAULT_BUILTIN_KEY)
  const [bankError, setBankError] = useState<string | null>(null)

  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<MBTIResult | null>(null)
  const [captureHint, setCaptureHint] = useState<string | null>(null)


  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const [autoNext, setAutoNext] = useState(true)

  const questionSectionRef = useRef<HTMLDivElement | null>(null)
  const resultSectionRef = useRef<HTMLElement | null>(null)
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

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const url = new URL(window.location.href)
      const rawType = url.searchParams.get("result")
      if (!rawType) return
      const upper = rawType.toUpperCase()

      let baseType: string
      let displayType: string

      if (MBTI_TYPE_6_REGEX.test(upper)) {
        baseType = upper.slice(0, 4)
        displayType = upper
      } else if (MBTI_TYPE_4_REGEX.test(upper)) {
        baseType = upper
        displayType = upper
      } else {
        return
      }

      const params = url.searchParams

      const pairScores = buildNeutralPairScores()
      const extendedPairScores = buildNeutralExtendedPairScores()

      for (const pair of pairScores) {
        const names = PAIR_PARAM_NAME_MAP[pair.key]
        if (!names) continue
        const leftRaw = parsePercentParam(params, names.left)
        const rightRaw = parsePercentParam(params, names.right)
        if (leftRaw == null && rightRaw == null) {
          // 保持 50/50 占位
          continue
        }
        const { leftPercent, rightPercent } = normalizePairPercents(leftRaw, rightRaw)
        pair.leftPercent = leftPercent
        pair.rightPercent = rightPercent
        pair.leftScore = leftPercent
        pair.rightScore = rightPercent
      }

      for (const pair of extendedPairScores) {
        const names = PAIR_PARAM_NAME_MAP[pair.key]
        if (!names) continue
        const leftRaw = parsePercentParam(params, names.left)
        const rightRaw = parsePercentParam(params, names.right)
        if (leftRaw == null && rightRaw == null) {
          // 对于扩展维度：未提供参数时保持 50/50 占位，分数为 0，
          // 这样在条形图中不会展示，但在需要时可以作为中性参考比例。
          continue
        }
        const { leftPercent, rightPercent } = normalizePairPercents(leftRaw, rightRaw)
        pair.leftPercent = leftPercent
        pair.rightPercent = rightPercent
        pair.leftScore = leftPercent
        pair.rightScore = rightPercent
      }

      const placeholderMetadata: QuestionBankMetadata = {
        title: "外部结果（仅类型与维度百分比）",
        version: "1.0.0",
        language: "zh-CN",
      }

      const placeholderResult: MBTIResult = {
        type: baseType,
        displayType,
        pairScores,
        extendedPairScores,
        rawScores: createEmptyRawScores(),
        answeredCount: 0,
        totalQuestions: 0,
        bankMetadata: placeholderMetadata,
        createdAt: new Date().toISOString(),
      }

      setResult(placeholderResult)
      setHasStarted(true)
    } catch {
      // 忽略不合法的 URL
    }
  }, [])

  const applyNewBank = useCallback(
    (bank: QuestionBank) => {
      setQuestionBank(bank)
      setAnswers({})
      setResult(null)
      setSubmitError(null)
      setCaptureHint(null)
      if (bank.questions.length > 0) {
        setActiveGroupId("0")
      }
    },
    []
  )

  // 加载或切换内置题库
  useEffect(() => {
    // 当 URL 中已经携带合法的 result 参数时，优先展示结果页，占位结果不依赖题库，避免自动切换回答题模式
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href)
        const rawType = url.searchParams.get("result")
        if (rawType) {
          const upper = rawType.toUpperCase()
          if (MBTI_TYPE_4_REGEX.test(upper) || MBTI_TYPE_6_REGEX.test(upper)) {
            return
          }
        }
      } catch {
        // 忽略 URL 解析错误，继续按正常流程加载题库
      }
    }

    const config = BUILTIN_BANKS.find((b) => b.key === selectedBankKey && b.file)
    if (!config || !config.file) {
      return
    }

    let cancelled = false

    const loadBuiltin = async () => {
      try {
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
          applyNewBank(validated.data)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) {
          setBankError(`加载内置题库时出现问题：${msg}`)
        }
      } finally {
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
    updateUrlWithResult(r)
    setSubmitError(null)
    setCaptureHint(null)
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        if (resultSectionRef.current) {
          resultSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      })
    }
  }

  const handleReset = () => {
    setAnswers({})
    setResult(null)
    setSubmitError(null)
    setCaptureHint(null)
    updateUrlWithResult(null)
    if (questionSectionRef.current) {
      questionSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const handleCaptureImage = async () => {
    if (!result) {
      setCaptureHint("请先完成测评并生成结果，再保存图片。")
      return
    }
    if (!resultSectionRef.current) {
      setCaptureHint("暂未找到可截图的结果区域，请稍后重试或刷新页面。")
      return
    }
    try {
      setCaptureHint(null)
      const html2canvasModule = await import("html2canvas")
      const html2canvas = (html2canvasModule as any).default ?? (html2canvasModule as any)
      const canvas = await html2canvas(resultSectionRef.current, {
        backgroundColor: theme === "dark" ? "#020617" : "#f8fafc",
        scale: Math.min(window.devicePixelRatio || 1, 2),
      })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      if (!blob) {
        throw new Error("生成图片数据失败")
      }
      const fileName = `mbti-result-${result.displayType}-${Date.now()}.png`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setCaptureHint("已生成并下载 PNG 图片，可在相册或下载目录中查看。")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知错误"
      setCaptureHint(`生成图片时出现问题：${msg}。你可以尝试刷新页面后重试。`)
    }
  }

  const handleStartTest = () => {
    setHasStarted(true)
    if (questionSectionRef.current) {
      questionSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const activeTypeInfo = result ? TYPE_DESCRIPTIONS[result.type] : undefined

  const atPair = result?.extendedPairScores?.find((p) => p.key === "AT")
  const hcPair = result?.extendedPairScores?.find((p) => p.key === "HC")
  const hasATData = !!(atPair && (atPair.leftScore !== 0 || atPair.rightScore !== 0))
  const hasHCData = !!(hcPair && (hcPair.leftScore !== 0 || hcPair.rightScore !== 0))

  const typeImage = result ? TYPE_IMAGE_MAP[result.type] : undefined

  const allPairScores = useMemo(
    () =>
      result
        ? [
            ...result.pairScores,
            ...(result.extendedPairScores?.filter((p) => p.leftScore !== 0 || p.rightScore !== 0) ?? []),
          ]
        : [],
    [result]
  )

  const chartData = useMemo(
    () =>
      allPairScores.map((p) => ({
        name: p.key,
        左: p.leftPercent,
        右: p.rightPercent,
        leftLabel: p.leftLabel,
        rightLabel: p.rightLabel,
      })),
    [allPairScores]
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
                <div className="text-xs text-slate-500 dark:text-slate-400">多题库 · 含扩展维度 A/T 与 H/C · 实时百分比解析</div>
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
          {!result && (
            <section>
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
                  生成你的四字母类型与简要解读。你可以根据场景选择简版、标准版、专业版或扩展版题库，用于个人或团队测评。
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
                    <span>内置多套中文题库（40/80/120 题，以及含 A/T、H/C 的扩展版）。</span>
                  </div>
                  <Separator orientation="vertical" className="hidden h-3 sm:inline" />
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-indigo-400" />
                    <span>结果支持保存为图片（PNG）分享</span>
                  </div>
                </div>
                <div className="space-y-2 text-xs">
                  <Label className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <Info className="h-3.5 w-3.5" />
                      <span>题库选择</span>
                    </span>
                  </Label>
                  <Select
                    value={selectedBankKey}
                    onValueChange={(value) => {
                      const key = value as BuiltinBankKey
                      setSelectedBankKey(key)
                    }}
                  >
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue placeholder="选择要使用的题库" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUILTIN_BANKS.map((bank) => (
                        <SelectItem key={bank.key} value={bank.key} className="text-xs">
                          {bank.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    默认使用简版 40题，可在此切换为标准版或专业版；也可选择包含 A/T 与 H/C 维度的扩展版题库。
                  </p>
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

          </section>
          )}

          {/* 作答进度与题目区 */}
          {!result && (
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

          )}

          {/* 结果区 */}
          {result && (
            <section ref={resultSectionRef} className="space-y-4">
              <Card className="border-slate-200 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-baseline gap-2 text-lg sm:text-xl">
                        <span>你的 MBTI 类型：</span>
                        <span className="font-mono text-2xl tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
                          {result.displayType}
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
                      {typeImage && (
                        <div className="mt-4 flex justify-center">
                          <div className="h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                            <img
                              src={typeImage}
                              alt={`${result.type} 类型示意图`}
                              className="h-full w-full object-contain"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>题库：{result.bankMetadata.title}</span>
                        <span>· 版本：{result.bankMetadata.version}</span>
                        <span>
                          · 已答：{result.answeredCount}/{result.totalQuestions}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={handleReset}
                        aria-label="重新测试，返回答题模式"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        重新测试
                      </Button>
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
                      {allPairScores.map((p) => (
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
                        <p>
                          {activeTypeInfo?.summary ??
                            "当前类型暂无预设描述，你可以结合维度百分比自行理解和补充。"}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          建议：
                          {activeTypeInfo?.advice ??
                            "建议关注每一条维度的强弱分布，将结果作为探索自我偏好和沟通风格的起点，而非标签。"}
                        </p>
                        {(hasATData || hasHCData) && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {hasATData && atPair && (
                              <>
                                在 A/T 维度上，你略偏向
                                {atPair.leftPercent >= atPair.rightPercent ? "自信型（A）" : "敏感型（T）"}，
                                A：{atPair.leftPercent}% / T：{atPair.rightPercent}%。
                              </>
                            )}
                            {hasHCData && hcPair && (
                              <>
                                {" "}
                                在 H/C 维度上，你偏向
                                {hcPair.leftPercent >= hcPair.rightPercent ? "活跃型（H）" : "沉稳型（C）"}，
                                H：{hcPair.leftPercent}% / C：{hcPair.rightPercent}%。
                              </>
                            )}
                          </p>
                        )}
                      </CardContent>
                    </Card>


                    <Card className="border-slate-200 bg-slate-50/70 shadow-none dark:border-slate-700 dark:bg-slate-900/70">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">职业与工作风格</CardTitle>
                        <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                          从工作场景中的优势、动力来源和适合的协作方式进行简要概览。
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        <p>
                          {activeTypeInfo?.career ??
                            "当前类型暂无预设的职业说明，你可以结合自己的岗位和维度百分比，思考“我更习惯怎样工作、怎样协作”。"}
                        </p>
                        {(hasATData || hasHCData) && (
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {hasATData && atPair && (
                              <>
                                在工作压力和关键决策场景中，
                                {atPair.leftPercent >= atPair.rightPercent
                                  ? "自信型（A）的倾向让你更愿意拍板和承担责任，但也需要留意给团队留出讨论空间。"
                                  : "敏感型（T）的倾向让你更能捕捉风险与细节，但也要避免因为过度担心而拖慢决策节奏。"}
                              </>
                            )}
                            {hasHCData && hcPair && (
                              <>
                                {" "}
                                在工作节奏上，
                                {hcPair.leftPercent >= hcPair.rightPercent
                                  ? "活跃型（H）帮助你快速推进、带动氛围，同时可以多安排复盘时间，避免频繁变更方向。"
                                  : "沉稳型（C）让你更擅长稳定执行与风险控制，但也要在低风险事项上适度加快节奏。"}
                              </>
                            )}
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200 bg-slate-50/70 shadow-none dark:border-slate-700 dark:bg-slate-900/70">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">人际与情感倾向</CardTitle>
                        <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                          关注你在沟通方式、亲密关系和日常相处中的自然偏好。
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        <p>
                          {activeTypeInfo?.relationship ??
                            "当前类型暂无预设的人际说明，你可以留意自己在表达需求、处理冲突和亲近/保持距离上的习惯模式。"}
                        </p>
                        {(hasATData || hasHCData) && (
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {hasATData && atPair && (
                              <>
                                在人际互动中，
                                {atPair.leftPercent >= atPair.rightPercent
                                  ? "自信型（A）让你在表达观点和边界时相对直接、稳定，同时需要留意给他人保留发言空间。"
                                  : "敏感型（T）让你对氛围和他人情绪特别敏锐，也更容易在意评价和细微变化，需要照顾好自己的情绪边界。"}
                              </>
                            )}
                            {hasHCData && hcPair && (
                              <>
                                {" "}
                                在相处节奏上，
                                {hcPair.leftPercent >= hcPair.rightPercent
                                  ? "活跃型（H）会让你更倾向主动找话题、组织活动，但也要留意对方可能需要安静和停顿。"
                                  : "沉稳型（C）让你偏爱安静、稳定的陪伴，有时需要适度主动表达好感和在意，避免被误解为冷淡。"}
                              </>
                            )}
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200 bg-slate-50/70 shadow-none dark:border-slate-700 dark:bg-slate-900/70">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">需要留意的地方</CardTitle>
                        <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                          并非缺点，而是在高压或惯性下容易出现的盲区，适合作为自我调节的参考。
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        {activeTypeInfo?.cautions && activeTypeInfo.cautions.length > 0 ? (
                          <ul className="list-disc space-y-1 pl-4">
                            {activeTypeInfo.cautions.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                            {hasATData && atPair && (
                              <li>
                                在高压情境下，
                                {atPair.leftPercent >= atPair.rightPercent
                                  ? "A 向的自信有时会被他人理解为“太强势/不听劝”，适合多说一句“你怎么看？”。"
                                  : "T 向的敏感可能让你更容易自责或过度反刍，适合找信任的人一起澄清事实与责任边界。"}
                              </li>
                            )}
                            {hasHCData && hcPair && (
                              <li>
                                在推进事务和关系时，
                                {hcPair.leftPercent >= hcPair.rightPercent
                                  ? "H 向的活跃可能忽略他人需要缓冲和安静的时刻，可以刻意留出“停顿”和听反馈的空间。"
                                  : "C 向的沉稳可能让你显得过于慢热或被动，适度主动表达好感和想法有助于建立信任。"}
                              </li>
                            )}
                          </ul>
                        ) : (
                          <p>
                            当前类型暂无预设的注意事项，你可以结合最近的压力场景，思考自己在哪些模式下容易“过度用力”或忽略他人感受。
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-dashed border-slate-200 bg-slate-50/60 shadow-none dark:border-slate-700 dark:bg-slate-900/60">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">结果导出与分享</CardTitle>
                        <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                          生成当前结果截图，便于在团队 workshop、教练会谈或个人记录中保存与回顾。
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            className="gap-1"
                            onClick={handleCaptureImage}
                            aria-label="将结果保存为 PNG 图片"
                          >
                            <Image className="h-3.5 w-3.5" />
                            保存结果图片（PNG）
                          </Button>
                        </div>
                        {captureHint && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{captureHint}</p>
                        )}
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
                  1. 当前题库是如何设计的？
                </AccordionTrigger>
                <AccordionContent className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  <p>
                    页面内置了多套基于 MBTI 理论的中文题库，包括不同题量的经典四维版本，以及包含 A/T 与 H/C 扩展维度的版本。每道题都会为相关维度分配权重，系统会在你答题完成后进行累加并计算百分比分布。
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2">
                <AccordionTrigger className="text-xs sm:text-sm">
                  2. 本测试结果可以用于招聘或诊断吗？
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

        {isMobile && !result && questionBank && totalQuestions > 0 && (
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
              当前题库为内置多套版本；如需在课程或团队中统一管理结果，可通过保存结果图片的方式进行归档。
            </span>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  )
}

export default App
