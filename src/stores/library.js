import { defineStore } from 'pinia'
import {
  BUILTIN_MODULES,
  loadCustomModules,
  saveCustomModules,
  moduleFromPatterns
} from '../core/library/index.js'
import { uid } from '../utils/id.js'

/**
 * library store —— 图案库（不随作品持久化）
 *
 * 内置模块来自 core/library/catalog.js（代码常量）；
 * 自定义模块（「存为图案」所得）持久化在 localStorage，跨作品可用。
 */
export const useLibraryStore = defineStore('library', {
  state: () => ({
    custom: loadCustomModules(),
    /** 上次持久化是否成功（失败时 UI 提示） */
    persistOk: true
  }),

  getters: {
    /** 全部可用模块（内置 + 我的图案） */
    modules(state) {
      return [...BUILTIN_MODULES, ...state.custom]
    },
    byId() {
      return (id) => this.modules.find((m) => m.id === id) || null
    },
    customCount(state) {
      return state.custom.length
    }
  },

  actions: {
    persist() {
      this.persistOk = saveCustomModules(this.custom)
      return this.persistOk
    },

    /** 新增自定义模块（返回该模块） */
    addCustom(module) {
      if (!module) return null
      this.custom = [...this.custom, module]
      this.persist()
      return module
    },

    /** 把当前选中的图案「存为图案」 */
    saveFromSelection(patterns, name) {
      const mod = moduleFromPatterns(patterns, { name })
      if (!mod) return null
      return this.addCustom(mod)
    },

    removeCustom(id) {
      this.custom = this.custom.filter((m) => m.id !== id)
      this.persist()
    },

    renameCustom(id, name) {
      const n = String(name || '').trim().slice(0, 40)
      if (!n) return
      this.custom = this.custom.map((m) => (m.id === id ? { ...m, name: n } : m))
      this.persist()
    },

    /** 复制自定义模块（新 id + 名称加「副本」） */
    duplicateCustom(id) {
      const m = this.custom.find((x) => x.id === id)
      if (!m) return null
      const copy = {
        ...m,
        id: uid('mod'),
        name: `${m.name} 副本`.slice(0, 40),
        families: m.families ? m.families.map((f) => ({ ...f })) : undefined,
        segs: m.segs ? m.segs.map((s) => ({ ...s })) : undefined
      }
      this.custom = [...this.custom, copy]
      this.persist()
      return copy
    }
  }
})
