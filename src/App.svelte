<script>
  import Router from 'svelte-spa-router';
  import { wrap } from 'svelte-spa-router/wrap';
  import TopNav from './components/TopNav.svelte';
  import GeneratePage from './pages/GeneratePage.svelte';
  import EditPage from './pages/EditPage.svelte';
  import ReviewPage from './pages/ReviewPage.svelte';
  import ArchivePage from './pages/ArchivePage.svelte';

  const routes = {
    '/': GeneratePage,
    '/edit': wrap({ component: EditPage }),
    '/review': wrap({ component: ReviewPage }),
    '/archive': wrap({ component: ArchivePage }),
    '*': GeneratePage
  };
</script>

<div class="shell">
  <TopNav />
  <Router {routes} />
</div>

<style>
  .shell { height: 100%; display: flex; flex-direction: column; }
  :global(main) { flex: 1; min-height: 0; overflow: auto; }
</style>
