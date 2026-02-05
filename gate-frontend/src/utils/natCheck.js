function toNumberOrNull(x) {
  if (x === null || x === undefined) return null
  if (typeof x === 'number') return Number.isFinite(x) ? x : null
  if (typeof x === 'string') {
    const t = x.trim()
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function normalizeNatAnswer(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (raw.min !== undefined || raw.max !== undefined) {
      return {
        kind: 'range',
        min: Number(raw.min),
        max: Number(raw.max)
      }
    }
    if (raw.values !== undefined) {
      return {
        kind: 'set',
        values: Array.isArray(raw.values) ? raw.values : [raw.values]
      }
    }
    if (raw.value !== undefined) {
      return { kind: 'set', values: [raw.value] }
    }
  }

  if (Array.isArray(raw)) return { kind: 'set', values: raw }
  return { kind: 'set', values: [raw] }
}

export function isNatCorrect(userInput, rawAnswer, eps = 0.01) {
  const ans = normalizeNatAnswer(rawAnswer)

  if (ans.kind === 'range') {
    const u = toNumberOrNull(userInput)
    if (u === null) return false
    return u >= ans.min - eps && u <= ans.max + eps
  }

  const uNum = toNumberOrNull(userInput)
  const uStr = String(userInput ?? '').trim().toLowerCase()

  for (const v of ans.values) {
    const vNum = toNumberOrNull(v)
    if (uNum !== null && vNum !== null) {
      if (Math.abs(uNum - vNum) <= eps) return true
    } else {
      if (uStr === String(v).trim().toLowerCase()) return true
    }
  }
  return false
}
