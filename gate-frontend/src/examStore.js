export function createExamState(questions) {
  return {
    questions,
    current: 0,
    answers: {},      // qid -> answer (string | number | array)
    review: {},       // qid -> true
    visited: {},      // qid -> true
    startedAt: Date.now(),
    durationSec: 180 * 60, // 180 min
  }
}

export function getQStatus(state, qid) {
  const answered = state.answers[qid] !== undefined && state.answers[qid] !== null && state.answers[qid] !== ''
  const marked = !!state.review[qid]
  const visited = !!state.visited[qid]
  if (marked) return 'review'       // 🟨
  if (answered) return 'answered'   // 🟩
  if (visited) return 'visited'     // 🟥 (visited but not answered)
  return 'unvisited'                // ⬜
}

