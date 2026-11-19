<script>
  import { link, router } from 'svelte-spa-router';
  import { dbStore } from '../lib/repo.js';

  const tabs = [
    { href: '/', label: '① 生成', match: ['/', ''] },
    { href: '/edit', label: '② 编辑', match: ['/edit'] },
    { href: '/review', label: '③ 审核', match: ['/review'] },
    { href: '/archive', label: '④ 档案', match: ['/archive'] }
  ];
  let loc = $state('');
  $effect(() => { loc = router.location; });
  const stats = $derived({
    n: $dbStore.projects.length,
    review: $dbStore.projects.filter((p) => p.status === 'review').length,
    archived: $dbStore.projects.filter((p) => p.status === 'archived').length
  });
</script>

<header class="topnav">
  <div class="brand">
    <span class="logo">烟</span>
    <div>
      <div class="title">烟气监测立面生成与档案加工台</div>
      <div class="sub">生物质电厂 · 巡检立面过程式生成</div>
    </div>
  </div>
  <nav>
    {#each tabs as tab (tab.href)}
      <a use:link href={tab.href} class:on={tab.match.includes(loc)}>{tab.label}</a>
    {/each}
  </nav>
  <div class="stats">
    <span class="tag gray">项目 {stats.n}</span>
    <span class="tag amber">待审 {stats.review}</span>
    <span class="tag green">归档 {stats.archived}</span>
  </div>
</header>

<style>
  .topnav {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 8px 20px;
    background: #0f172a;
    color: #fff;
    flex: none;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .logo {
    width: 38px; height: 38px; border-radius: 9px;
    background: linear-gradient(135deg, #38bdf8, #1d4ed8);
    display: grid; place-items: center;
    font-weight: 800; font-size: 18px;
  }
  .title { font-weight: 700; font-size: 15px; }
  .sub { font-size: 11px; color: #94a3b8; }
  nav { display: flex; gap: 4px; margin-left: 12px; }
  nav a {
    color: #cbd5e1;
    text-decoration: none;
    padding: 7px 16px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 600;
  }
  nav a:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
  nav a.on { background: #1d4ed8; color: #fff; }
  .stats { margin-left: auto; display: flex; gap: 6px; }
</style>
