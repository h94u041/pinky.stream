<script setup lang="ts">
import { ref } from 'vue'
import { Plus } from '@element-plus/icons-vue'

const count = ref(0)
const name = ref('')
</script>

<template>
  <el-container class="page">
    <el-header class="header">
      <h1>Pinky</h1>
      <el-tag type="success" round>Vue 3 + Element Plus</el-tag>
    </el-header>

    <el-main>
      <el-card shadow="hover" class="card">
        <template #header>快速試用</template>

        <el-form label-position="top">
          <el-form-item label="你的名字">
            <el-input v-model="name" placeholder="輸入名字" clearable>
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>
        </el-form>

        <el-space>
          <el-button type="primary" :icon="Plus" @click="count++">
            點了 {{ count }} 次
          </el-button>
          <el-button @click="count = 0">重設</el-button>
        </el-space>

        <el-alert
          v-if="name"
          class="greet"
          :title="`哈囉，${name}！`"
          type="info"
          :closable="false"
          show-icon
        />
      </el-card>
    </el-main>
  </el-container>
</template>

<style scoped>
.page {
  min-height: 100vh;
}
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--el-border-color);
}
.card {
  max-width: 480px;
  margin: 0 auto;
}
.greet {
  margin-top: 16px;
}
</style>
