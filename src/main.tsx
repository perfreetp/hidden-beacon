import { render } from 'solid-js/web';
import { App } from './App';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('缺少 #root 挂载点');
render(() => <App />, root);
