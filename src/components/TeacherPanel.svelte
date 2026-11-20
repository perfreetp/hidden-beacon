<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { params, seed, scene, stats, role, activeAssignment } from '../lib/store.js';
  import { doGenerateFresh, autoScore } from '../lib/actions.js';
  import { storage, uid } from '../lib/storage.js';
  import { SEASONS, SEASON_NAMES } from '../lib/species.js';
  import { downloadCsv } from '../lib/stats.js';

  let assignments = [];
  let submissions = [];
  let title = '';
  let studentName = '';
  let message = '';

  // 出题时以当前场景的覆盖率为目标值,可微调
  let targets = { spring: 0, summer: 0, autumn: 0 };

  onMount(() => {
    assignments = storage.listAssignments();
    submissions = storage.listSubmissions();
  });

  $: if ($stats) {
    // 仅在表单未手动编辑时同步意义不大,这里出题按钮点击时抓取
  }

  function captureTargets() {
    targets = { ...get(stats).coverage };
  }

  function createAssignment() {
    captureTargets();
    const a = {
      id: uid('task'),
      title: title.trim() || `题目 ${assignments.length + 1}`,
      time: new Date().toLocaleString(),
      seed: get(seed),
      params: { ...get(params) },
      targets: { ...targets }
    };
    storage.saveAssignment(a);
    assignments = storage.listAssignments();
    title = '';
    message = `已出题「${a.title}」,目标覆盖率 春${(a.targets.spring * 100).toFixed(0)}% 夏${(a.targets.summer * 100).toFixed(0)}% 秋${(a.targets.autumn * 100).toFixed(0)}%`;
  }

  function delAssignment(id) {
    storage.deleteAssignment(id);
    assignments = storage.listAssignments();
  }

  function takeAssignment(a) {
    // 学员领题:载入题目参数与种子并生成,开始作答
    params.set({ ...a.params });
    seed.set(a.seed);
    activeAssignment.set(a);
    doGenerateFresh();
    message = `已领取「${a.title}」,请按要求调整参数与布局后提交。`;
  }

  function submit() {
    const a = get(activeAssignment);
    if (!a) {
      message = '请先在下方领取一道题。';
      return;
    }
    if (!studentName.trim()) {
      message = '请填写学员姓名。';
      return;
    }
    const result = autoScore(a, get(params), get(scene));
    const sub = {
      id: uid('sub'),
      assignmentId: a.id,
      assignmentTitle: a.title,
      student: studentName.trim(),
      time: new Date().toLocaleString(),
      params: { ...get(params) },
      seed: get(seed),
      ...result,
      reviewScore: null,
      reviewNote: ''
    };
    storage.saveSubmission(sub);
    submissions = storage.listSubmissions();
    message = `提交成功:自动评分 ${sub.autoScore} 分(参数 ${sub.paramScore}/40,覆盖率 ${sub.covScore}/60)`;
  }

  function setReview(sub, field, value) {
    const list = storage.listSubmissions();
    const t = list.find((x) => x.id === sub.id);
    if (!t) return;
    t[field] = field === 'reviewScore' ? (value === '' ? null : +value) : value;
    storage.saveSubmission(t);
    submissions = storage.listSubmissions();
  }

  function delSubmission(id) {
    storage.deleteSubmission(id);
    submissions = storage.listSubmissions();
  }

  function exportSummary() {
    const rows = submissions.map((s) => ({
      学员: s.student,
      题目: s.assignmentTitle,
      提交时间: s.time,
      自动评分: s.autoScore,
      参数分: s.paramScore,
      覆盖率分: s.covScore,
      复核分: s.reviewScore ?? '',
      复核备注: s.reviewNote,
      错题点: s.mismatches.join(';') || '无'
    }));
    downloadCsv('成绩汇总.csv', rows, ['学员', '题目', '提交时间', '自动评分', '参数分', '覆盖率分', '复核分', '复核备注', '错题点']);
  }
</script>

<div class="panel">
  <div class="rolebar">
    <span>身份:</span>
    <button class:on={$role === 'student'} on:click={() => role.set('student')}>学员</button>
    <button class:on={$role === 'teacher'} on:click={() => role.set('teacher')}>老师</button>
  </div>
  {#if message}<p class="msg">{message}</p>{/if}

  {#if $role === 'teacher'}
    <h3>老师出题</h3>
    <p class="hint">以左侧当前参数 + 种子作为标准答案,以当前场景三季开花覆盖率为目标值。</p>
    <div class="row">
      <input placeholder="题目标题" bind:value={title} />
      <button on:click={createAssignment}>出题</button>
    </div>
  {/if}

  <h3>题目列表({assignments.length})</h3>
  {#each assignments as a}
    <div class="item">
      <div>
        <b>{a.title}</b>
        <small>
          {a.params.length}×{a.params.width}m · {a.params.aspect}坡 · 水系{a.params.water} · 密度{Math.round(a.params.density * 100)}%
          · 目标 春{(a.targets.spring * 100).toFixed(0)}% 夏{(a.targets.summer * 100).toFixed(0)}% 秋{(a.targets.autumn * 100).toFixed(0)}%
        </small>
      </div>
      <div class="ops">
        {#if $role === 'student'}
          <button on:click={() => takeAssignment(a)}>领取</button>
        {:else}
          <button class="danger" on:click={() => delAssignment(a.id)}>删</button>
        {/if}
      </div>
    </div>
  {:else}
    <p class="hint">暂无题目。</p>
  {/each}

  {#if $role === 'student'}
    <h3>提交作答</h3>
    {#if $activeAssignment}
      <p class="hint">当前作答:「{$activeAssignment.title}」</p>
    {/if}
    <div class="row">
      <input placeholder="学员姓名" bind:value={studentName} />
      <button on:click={submit}>提交</button>
    </div>
  {/if}

  <h3>成绩汇总({submissions.length})</h3>
  <div class="scroll">
    <table>
      <thead>
        <tr><th>学员</th><th>题目</th><th>自动分</th><th>复核分</th><th>错题点</th><th></th></tr>
      </thead>
      <tbody>
        {#each submissions as s}
          <tr>
            <td>{s.student}</td>
            <td>{s.assignmentTitle}</td>
            <td>{s.autoScore}</td>
            <td>
              {#if $role === 'teacher'}
                <input
                  class="score"
                  type="number"
                  min="0"
                  max="100"
                  value={s.reviewScore ?? ''}
                  placeholder={s.autoScore}
                  on:change={(e) => setReview(s, 'reviewScore', e.currentTarget.value)}
                />
              {:else}
                {s.reviewScore ?? '—'}
              {/if}
            </td>
            <td class="mis" title={s.mismatches.join('\n')}>
              {s.mismatches.length ? s.mismatches.length + ' 处' : '无'}
              {#if $role === 'teacher' && s.mismatches.length}
                <details><summary>详情</summary>
                  {#each s.mismatches as m}<div>· {m}</div>{/each}
                  <input
                    class="note"
                    placeholder="复核备注"
                    value={s.reviewNote}
                    on:change={(e) => setReview(s, 'reviewNote', e.currentTarget.value)}
                  />
                </details>
              {/if}
            </td>
            <td>
              {#if $role === 'teacher'}
                <button class="danger sm" on:click={() => delSubmission(s.id)}>删</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if submissions.length}
    <button on:click={exportSummary}>导出成绩汇总 CSV</button>
  {/if}
</div>

<style>
  .panel { display: flex; flex-direction: column; gap: 8px; }
  h3 { margin: 8px 0 2px; font-size: 13px; color: #9fc48f; border-bottom: 1px solid #33402e; padding-bottom: 4px; }
  .rolebar { display: flex; gap: 6px; align-items: center; font-size: 12px; color: #c9d6c0; }
  .rolebar button { background: #26301f; }
  .rolebar button.on { background: #3f7a35; color: #fff; }
  .row { display: flex; gap: 6px; }
  input { flex: 1; background: #1c211a; color: #e6efe0; border: 1px solid #3a4a35; border-radius: 4px; padding: 6px 8px; font-size: 13px; }
  input.score { width: 56px; flex: none; padding: 2px 4px; font-size: 12px; }
  input.note { width: 100%; margin-top: 4px; font-size: 11px; padding: 3px 6px; }
  button { background: #33502c; color: #e6efe0; border: 1px solid #4a6b40; border-radius: 4px; padding: 5px 10px; cursor: pointer; font-size: 12px; }
  button.danger { background: #5a2c2c; border-color: #7a4040; }
  button.sm { padding: 2px 6px; }
  .hint { font-size: 11px; color: #7d8f76; margin: 0; }
  .msg { font-size: 12px; color: #e8d98a; background: #33301c; border-radius: 4px; padding: 6px 8px; margin: 0; }
  .item { display: flex; justify-content: space-between; align-items: center; gap: 6px; background: #232a20; border-radius: 5px; padding: 7px 9px; font-size: 12px; color: #d8e4cf; }
  .item small { display: block; color: #7d8f76; }
  .ops { display: flex; gap: 4px; }
  .scroll { max-height: 260px; overflow: auto; border: 1px solid #2a3325; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; color: #d8e4cf; }
  td, th { padding: 3px 5px; border-bottom: 1px solid #2a3325; text-align: left; }
  th { color: #8ba07e; font-weight: normal; }
  td.mis { max-width: 90px; }
  details { font-size: 10px; color: #a8bb9c; }
</style>
