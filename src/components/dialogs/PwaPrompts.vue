<script setup>
/**
 * PwaPrompts —— PWA 轻提示条（安装引导 / 离线就绪 / 新版本）
 * 仅在相关状态出现时显示，不占常驻空间；pad 上触控目标 ≥ 44px。
 */
import { NButton } from 'naive-ui'
import {
  applyUpdate,
  canInstall,
  dismissInstall,
  dismissNeedRefresh,
  dismissOfflineReady,
  isStandalone,
  needRefresh,
  offlineReady,
  promptInstall
} from '../../pwa.js'

async function onInstall() {
  await promptInstall()
}
</script>

<template>
  <div v-if="needRefresh" class="pwa-bar update">
    <span class="pwa-text">发现新版本，刷新后生效（本地作品数据不会丢失）。</span>
    <n-button size="small" type="primary" @click="applyUpdate">立即刷新</n-button>
    <n-button size="small" text @click="dismissNeedRefresh">稍后</n-button>
  </div>

  <div v-else-if="canInstall && !isStandalone" class="pwa-bar install">
    <span class="pwa-text">把「组子细工绘图助手」安装到主屏，可全屏离线使用。</span>
    <n-button size="small" type="primary" @click="onInstall">安装到主屏</n-button>
    <n-button size="small" text @click="dismissInstall">以后再说</n-button>
  </div>

  <div v-else-if="offlineReady" class="pwa-bar offline">
    <span class="pwa-text">已可离线使用，断网也能打开继续编辑。</span>
    <n-button size="small" text @click="dismissOfflineReady">知道了</n-button>
  </div>
</template>

<style scoped>
.pwa-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 12px;
  font-size: 13px;
  border-bottom: 1px solid var(--kd-border, #e2e2dc);
}
.pwa-text {
  flex: 1 1 240px;
}
.pwa-bar.install {
  background: #eef2fa;
  color: #1f4e9c;
}
.pwa-bar.update {
  background: #fff7e6;
  color: #a06a00;
}
.pwa-bar.offline {
  background: #eefaf2;
  color: #0f7c43;
}
.pwa-bar :deep(.n-button) {
  min-height: 38px;
}
@media (max-width: 820px) {
  .pwa-bar :deep(.n-button) {
    min-height: 44px;
  }
}
</style>
