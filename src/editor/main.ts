/** The entry point of the editor in Electron: wires the editor to the Electron platform. */
import { createApp } from 'vue';
import { getElectronPlatform } from '../platform/electron/renderer';
import App from './App.vue';
import { EditorSession } from './session';
import './styles.css';

const session = new EditorSession(getElectronPlatform());
createApp(App, { session }).mount('#app');
