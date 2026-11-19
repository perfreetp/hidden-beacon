/** Entry point: registers every component and mounts the shell. */

import './ui/base';
import './style.css';
import { defineControls } from './ui/controls';
import { defineStage } from './ui/stage';
import { defineInspector } from './ui/inspector';
import { defineTimeline } from './ui/timeline';
import { defineDiffView } from './ui/diffview';
import { definePrintView } from './ui/printview';
import { defineShell } from './ui/shell';
import { defineVersionBar } from './ui/versionbar';

defineControls();
defineStage();
defineInspector();
defineTimeline();
defineDiffView();
definePrintView();
defineVersionBar();
defineShell();

const mount = document.getElementById('app');
if (mount) {
  mount.innerHTML = '<app-shell></app-shell>';
}
