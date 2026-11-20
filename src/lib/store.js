import { writable, derived, get } from 'svelte/store';
import { DEFAULT_PARAMS } from './generate.js';
import { computeStats } from './stats.js';

export const params = writable({ ...DEFAULT_PARAMS });
export const seed = writable('butterfly-01');
export const season = writable('spring');
export const scene = writable({ plants: [], rocks: [] });
export const mode = writable('view'); // view | move | plant | select
export const plantSpeciesId = writable('zuiyucao'); // 补种/替换用品种
export const pickedPlant = writable(null);   // 点击选中的植株 id
export const boxSelected = writable([]);     // 框选中的植株 id 列表
export const activeAssignment = writable(null); // 学员当前作答的题目
export const role = writable('student');     // student | teacher
export const panelTab = writable('params');  // params | info | stats | archive | class

export const stats = derived([scene, params], ([$scene, $params]) =>
  computeStats($scene, $params)
);

export function currentState() {
  return {
    params: get(params),
    seed: get(seed),
    scene: get(scene)
  };
}
