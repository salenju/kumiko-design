/**
 * PWA 运行时状态与动作（安装引导 / 离线就绪 / 版本更新）
 *
 * ⚠️ 本模块 import 'virtual:pwa-register'（构建期虚拟模块），
 * 只能在真实构建产物中运行；vite-plugin-pwa 在 vitest 下为 disabled，
 * 因此请勿在单元测试中导入本模块（或导入它的组件）。
 */
import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

/** 可安装：捕获到 beforeinstallprompt 且尚未安装 */
export const canInstall = ref(false)
/** 已以独立窗口（安装态）运行 */
export const isStandalone = ref(false)
/** 首次预缓存完成，已可离线使用 */
export const offlineReady = ref(false)
/** 有新版本待生效 */
export const needRefresh = ref(false)

let deferredPrompt = null
let updateSW = null

function detectStandalone() {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia?.('(display-mode: standalone)')
  return !!mq?.matches || window.navigator?.standalone === true
}

/** 应用启动时调用一次：监听安装事件 + 注册 Service Worker */
export function initPwa() {
  if (typeof window === 'undefined') return
  isStandalone.value = detectStandalone()

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    canInstall.value = true
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    canInstall.value = false
    isStandalone.value = true
  })

  try {
    updateSW = registerSW({
      onOfflineReady() {
        offlineReady.value = true
      },
      onNeedRefresh() {
        needRefresh.value = true
      },
      onRegisterError(e) {
        console.warn('[pwa] Service Worker 注册失败', e)
      }
    })
  } catch (e) {
    console.warn('[pwa] Service Worker 注册异常', e)
  }
}

/** 触发浏览器安装提示；返回用户是否接受 */
export async function promptInstall() {
  if (!deferredPrompt) return false
  deferredPrompt.prompt()
  let outcome = 'dismissed'
  try {
    outcome = (await deferredPrompt.userChoice)?.outcome || 'dismissed'
  } catch {
    /* noop */
  }
  deferredPrompt = null
  canInstall.value = false
  return outcome === 'accepted'
}

/** 应用新版本（skipWaiting 后刷新，仅换资源不动本地数据） */
export async function applyUpdate() {
  needRefresh.value = false
  if (updateSW) await updateSW(true)
  else window.location.reload()
}

export function dismissOfflineReady() {
  offlineReady.value = false
}

export function dismissNeedRefresh() {
  needRefresh.value = false
}

export function dismissInstall() {
  canInstall.value = false
}
