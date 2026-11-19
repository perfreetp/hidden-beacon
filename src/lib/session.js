// 跨页面会话：当前项目 / 版本（hash 路由不便携带复杂参数）
import { writable } from 'svelte/store';

export const session = writable({ projectId: null, versionId: null });

export function openProject(projectId, versionId = null) {
  session.set({ projectId, versionId });
}
