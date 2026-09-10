<script setup>
/**
 * WorkspaceModal —— 应用内工作区（0910 需求一）
 *
 * 多作品暂存/恢复/管理：列表、搜索、新建、打开、重命名、复制、导出、删除（回收站）。
 * 另含：容量展示、持久化存储申请、一键备份全部、批量导入。
 * 数据读写统一走 utils/workspace/*（IndexedDB，兜底 localStorage）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  NDrawer,
  NDrawerContent,
  NButton,
  NInput,
  NEmpty,
  NPopconfirm,
  NProgress,
  NSpin,
  NTag,
  useMessage
} from 'naive-ui'
import { useWorkspaceStore } from '../../stores/workspace.js'

const props = defineProps({
  show: { type: Boolean, default: false }
})
const emit = defineEmits(['update:show', 'fit'])

const workspace = useWorkspaceStore()
const message = useMessage()

const keyword = ref('')
const view = ref('active') // 'active' | 'trash'
const busy = ref(false)
const renameId = ref('')
const renameValue = ref('')

/** 抽屉宽度：桌面 640，窄屏（pad 竖屏）自适应不溢出 */
const viewportW = ref(typeof window === 'undefined' ? 1024 : window.innerWidth)
const drawerWidth = computed(() =>
  Math.min(640, Math.max(300, Math.round(viewportW.value * 0.94)))
)
function onResize() {
  viewportW.value = window.innerWidth
}
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

/** 打开面板时：刷新缩略图与容量 */
watch(
  () => props.show,
  async (v) => {
    if (!v) return
    keyword.value = ''
    renameId.value = ''
    view.value = 'active'
    await workspace.refreshCurrentThumbnail().catch(() => {})
    await workspace.refreshStorage().catch(() => {})
  }
)

const list = computed(() => {
  const src = view.value === 'trash' ? workspace.trashedWorks : workspace.activeWorks
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return src
  return src.filter((w) => w.name.toLowerCase().includes(kw))
})

const modeHint = computed(() =>
  workspace.isFallbackMode
    ? '当前为兼容模式（localStorage，容量有限），建议定期「备份全部」'
    : ''
)

const persistHint = computed(() => {
  if (workspace.persisted) return '已获得持久化存储授权，数据不易被系统清理'
  return '尚未获得持久化存储授权，数据可能被系统清理，建议定期备份'
})

const usagePercent = computed(() =>
  Math.min(100, Math.round((workspace.usageRatio || 0) * 100))
)

function close() {
  emit('update:show', false)
}

function formatTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 统一处理异步动作：加锁 + 错误提示 */
async function run(fn, successMsg) {
  if (busy.value) return
  busy.value = true
  try {
    const r = await fn()
    if (successMsg) message.success(successMsg)
    return r
  } catch (e) {
    message.error(e?.message || String(e))
    return null
  } finally {
    busy.value = false
  }
}

async function onOpen(id) {
  if (id === workspace.currentId) {
    close()
    return
  }
  const rec = await run(() => workspace.openWork(id))
  if (!rec) return
  emit('fit')
  close()
  message.success(`已打开「${rec.name}」`)
}

async function onNew() {
  const rec = await run(() => workspace.createWork())
  if (!rec) return
  emit('fit')
  close()
  message.success(`已新建「${rec.name}」`)
}

async function onImport() {
  const r = await run(() => workspace.importFromPicker())
  if (!r || !r.created.length) {
    if (r && r.failed.length) message.error(`导入失败 ${r.failed.length} 个文件`)
    return
  }
  message.success(`已导入 ${r.created.length} 个作品`)
  if (r.failed.length) message.warning(`${r.failed.length} 个文件解析失败，已跳过`)
  // 打开最后导入的作品
  const last = r.created[r.created.length - 1]
  const rec = await run(() => workspace.openWork(last.id))
  if (rec) {
    emit('fit')
    close()
  }
}

async function onBackupAll() {
  const n = await run(() => workspace.exportAll())
  if (n) message.success(`已备份 ${n} 个作品（zip）`)
  else if (n === 0) message.warning('工作区为空，没有可备份的作品')
}

function startRename(rec) {
  renameId.value = rec.id
  renameValue.value = rec.name
}

function cancelRename() {
  renameId.value = ''
  renameValue.value = ''
}

async function confirmRename() {
  const name = renameValue.value.trim()
  if (!name) {
    message.warning('名称不能为空')
    return
  }
  const id = renameId.value
  cancelRename()
  await run(() => workspace.renameWork(id, name), '已重命名')
}

async function onDuplicate(id) {
  const copy = await run(() => workspace.duplicateWork(id))
  if (copy) message.success(`已复制为「${copy.name}」`)
}

async function onExport(id) {
  await run(() => workspace.exportWork(id), '已导出作品文件')
}

async function onTrash(id) {
  await run(() => workspace.trashWork(id), '已移入回收站')
}

async function onRestore(id) {
  await run(() => workspace.restoreWork(id), '已恢复')
}

async function onPurge(id) {
  await run(() => workspace.purgeWork(id), '已彻底删除')
}

async function onEmptyTrash() {
  const n = workspace.trashedWorks.length
  await run(() => workspace.emptyTrash(), `已清空回收站（${n} 项）`)
}

async function onRequestPersist() {
  const granted = await run(() => workspace.requestPersist())
  if (granted) message.success('已获得持久化存储授权')
  else message.warning('系统未授予持久化存储，请定期备份')
}

/** 项目占用统计（无缩略图时的占位信息） */
function statsOf(rec) {
  return `${rec.data?.patterns?.length || 0} 图案`
}

defineExpose({ list })
</script>

<template>
  <n-drawer
    :show="show"
    :width="drawerWidth"
    placement="right"
    @update:show="(v) => emit('update:show', v)"
  >
    <n-drawer-content closable>
      <template #header>
        <div class="ws-header">
          <span>工作区</span>
          <n-tag size="small" :bordered="false" type="info">
            {{ workspace.activeWorks.length }} 个作品
          </n-tag>
        </div>
      </template>

      <n-spin :show="busy">
        <!-- 顶部操作 -->
        <div class="ws-bar">
          <n-input
            v-model:value="keyword"
            placeholder="搜索作品名称"
            clearable
            size="medium"
            class="ws-search"
          />
          <n-button type="primary" @click="onNew">＋ 新建</n-button>
          <n-button @click="onImport">⇧ 导入</n-button>
          <n-button :disabled="!workspace.activeWorks.length" @click="onBackupAll">
            ⇩ 备份全部
          </n-button>
        </div>

        <!-- 视图切换 -->
        <div class="ws-tabs">
          <button
            class="ws-tab"
            :class="{ active: view === 'active' }"
            @click="view = 'active'"
          >
            作品（{{ workspace.activeWorks.length }}）
          </button>
          <button
            class="ws-tab"
            :class="{ active: view === 'trash' }"
            @click="view = 'trash'"
          >
            回收站（{{ workspace.trashedWorks.length }}）
          </button>
          <div class="ws-tabs-spacer"></div>
          <n-popconfirm v-if="view === 'trash' && workspace.trashedWorks.length" @positive-click="onEmptyTrash">
            <template #trigger>
              <n-button size="small" tertiary type="error">清空回收站</n-button>
            </template>
            清空后不可恢复，确定删除回收站中的全部作品吗？
          </n-popconfirm>
        </div>

        <!-- 列表 -->
        <div v-if="!list.length" class="ws-empty">
          <n-empty
            :description="
              view === 'trash'
                ? '回收站是空的'
                : keyword
                  ? '没有匹配的作品'
                  : '还没有作品，点「＋ 新建」开始'
            "
          />
        </div>

        <div v-else class="ws-list">
          <div
            v-for="rec in list"
            :key="rec.id"
            class="ws-card"
            :class="{ current: rec.id === workspace.currentId }"
          >
            <div class="ws-thumb">
              <img v-if="rec.thumbnail" :src="rec.thumbnail" alt="" />
              <div v-else class="ws-thumb-empty">空</div>
            </div>

            <div class="ws-info">
              <div v-if="renameId === rec.id" class="ws-rename">
                <n-input
                  v-model:value="renameValue"
                  size="small"
                  :maxlength="60"
                  autofocus
                  @keydown.enter.prevent="confirmRename"
                  @keydown.esc.prevent="cancelRename"
                />
                <n-button size="small" type="primary" @click="confirmRename">确定</n-button>
                <n-button size="small" @click="cancelRename">取消</n-button>
              </div>
              <div v-else class="ws-name">
                {{ rec.name }}
                <n-tag v-if="rec.id === workspace.currentId" size="tiny" type="success" :bordered="false">
                  编辑中
                </n-tag>
              </div>
              <div class="ws-meta">
                <span>{{ formatTime(rec.updatedAt) }}</span>
                <span>·</span>
                <span>{{ statsOf(rec) }}</span>
                <span>·</span>
                <span>{{ rec.size ? (rec.size / 1024).toFixed(1) + ' KB' : '—' }}</span>
                <span v-if="rec.deletedAt" class="ws-deleted">
                  · 已删除 {{ formatTime(rec.deletedAt) }}
                </span>
              </div>
            </div>

            <div class="ws-actions">
              <template v-if="view === 'active'">
                <n-button
                  size="small"
                  :type="rec.id === workspace.currentId ? 'default' : 'primary'"
                  @click="onOpen(rec.id)"
                >
                  {{ rec.id === workspace.currentId ? '回到画布' : '打开' }}
                </n-button>
                <n-button size="small" tertiary @click="startRename(rec)">重命名</n-button>
                <n-button size="small" tertiary @click="onDuplicate(rec.id)">复制</n-button>
                <n-button size="small" tertiary @click="onExport(rec.id)">导出</n-button>
                <n-popconfirm @positive-click="onTrash(rec.id)">
                  <template #trigger>
                    <n-button size="small" tertiary type="error">删除</n-button>
                  </template>
                  删除后可在「回收站」恢复。确定删除「{{ rec.name }}」吗？
                </n-popconfirm>
              </template>

              <template v-else>
                <n-button size="small" type="primary" @click="onRestore(rec.id)">恢复</n-button>
                <n-button size="small" tertiary @click="onExport(rec.id)">导出</n-button>
                <n-popconfirm @positive-click="onPurge(rec.id)">
                  <template #trigger>
                    <n-button size="small" tertiary type="error">彻底删除</n-button>
                  </template>
                  彻底删除后不可恢复。确定删除「{{ rec.name }}」吗？
                </n-popconfirm>
              </template>
            </div>
          </div>
        </div>

        <!-- 底部：容量与持久化 -->
        <div class="ws-foot">
          <div class="ws-usage">
            <span>
              已用 {{ workspace.usageText }}
              <template v-if="workspace.quota">/ {{ workspace.quotaText }}</template>
            </span>
            <n-progress
              v-if="workspace.quota"
              type="line"
              :percentage="usagePercent"
              :height="6"
              :show-indicator="false"
              :status="usagePercent >= 80 ? 'warning' : 'default'"
            />
            <span v-if="usagePercent >= 80" class="ws-warn">存储接近上限，建议「备份全部」后清理</span>
          </div>
          <div class="ws-persist">
            <span class="ws-persist-text">{{ persistHint }}</span>
            <n-button v-if="!workspace.persisted" size="tiny" tertiary @click="onRequestPersist">
              申请持久化存储
            </n-button>
          </div>
          <div v-if="modeHint" class="ws-warn">{{ modeHint }}</div>
        </div>
      </n-spin>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.ws-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}
.ws-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.ws-search {
  flex: 1 1 180px;
  min-width: 140px;
}
.ws-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 14px 0 8px;
}
.ws-tabs-spacer {
  flex: 1;
}
.ws-tab {
  border: 1px solid var(--kd-border, #e2e2dc);
  background: #fff;
  border-radius: 8px;
  padding: 6px 14px;
  min-height: 40px;
  cursor: pointer;
  font-size: 13px;
  color: #444;
}
.ws-tab.active {
  background: #e8effc;
  border-color: #b7cdf0;
  color: #1f4e9c;
  font-weight: 600;
}
.ws-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ws-card {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--kd-border, #e2e2dc);
  border-radius: 10px;
  background: #fff;
}
.ws-card.current {
  border-color: #b7cdf0;
  background: #f6f9ff;
}
.ws-thumb {
  flex: none;
  width: 84px;
  height: 64px;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fafafa;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.ws-thumb img {
  max-width: 100%;
  max-height: 100%;
  display: block;
}
.ws-thumb-empty {
  font-size: 12px;
  color: #bbb;
}
.ws-info {
  flex: 1;
  min-width: 0;
}
.ws-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #222;
  word-break: break-all;
}
.ws-rename {
  display: flex;
  gap: 6px;
  align-items: center;
}
.ws-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #888;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.ws-deleted {
  color: #c0392b;
}
.ws-actions {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
  max-width: 220px;
}
.ws-actions :deep(.n-button) {
  min-height: 36px;
}
.ws-empty {
  padding: 40px 0;
}
.ws-foot {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--kd-border, #e2e2dc);
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: #777;
}
.ws-usage {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ws-persist {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ws-persist-text {
  flex: 1 1 240px;
}
.ws-warn {
  color: #c07c00;
}

/* pad（触屏）：触控目标加大，列表项换行 */
@media (max-width: 820px) {
  .ws-card {
    flex-wrap: wrap;
  }
  .ws-actions {
    max-width: none;
    width: 100%;
    justify-content: flex-start;
  }
  .ws-actions :deep(.n-button) {
    min-height: 44px;
    padding: 0 14px;
  }
  .ws-tab {
    min-height: 44px;
  }
}
</style>
