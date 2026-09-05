import { defineStore } from 'pinia'
import { useProjectStore } from './project.js'

/**
 * history store —— 撤销/重做（V2 §8.2）
 * 快照为 project 的 JSON 字符串（纯数据），不入响应式深代理。
 * 单向依赖 project store。
 * 用法：beginEdit(actionFn) —— actionFn 执行前记录变更前状态；
 * 若 actionFn 后数据无变化则丢弃该条记录。
 */
export const useHistoryStore = defineStore('history', {
  state: () => ({
    past: [], // 变更前快照（字符串栈）
    future: [] // 已撤销的快照
  }),

  getters: {
    canUndo: (s) => s.past.length > 0,
    canRedo: (s) => s.future.length > 0
  },

  actions: {
    /** 执行一次「可撤销操作」：mutator 前压入变更前快照 */
    beginEdit(mutator) {
      const project = useProjectStore()
      const before = project.snapshot()
      mutator()
      const after = project.snapshot()
      if (before === after) return // 无实际变更不入栈
      this.past.push(before)
      this.future = []
    },

    /** 直接压入一条「变更前」快照（用于编辑会话结束提交，见属性面板） */
    push(beforeSnapshot) {
      this.past.push(beforeSnapshot)
      this.future = []
    },

    undo() {
      const project = useProjectStore()
      if (!this.past.length) return
      const current = project.snapshot()
      const prev = this.past.pop()
      project.restore(prev)
      this.future.push(current)
    },

    redo() {
      const project = useProjectStore()
      if (!this.future.length) return
      const current = project.snapshot()
      const next = this.future.pop()
      project.restore(next)
      this.past.push(current)
    },

    clear() {
      this.past = []
      this.future = []
    }
  }
})
