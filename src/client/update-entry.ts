import { refreshAppVersion, updateStageLabels } from './app-update';

const button = document.querySelector<HTMLButtonElement>('#update-button');
const status = document.querySelector<HTMLParagraphElement>('#update-status');
const version = document.querySelector<HTMLParagraphElement>('#update-version');
if (!button || !status || !version) throw new Error('更新页面缺少必要控件。');
version.textContent = `更新工具版本：${import.meta.env.VITE_APP_VERSION}`;
button.disabled = false;
button.textContent = '检查并更新版本';
button.addEventListener('click', () => {
  button.disabled = true;
  status.dataset.error = 'false';
  void refreshAppVersion({ returnToApp: true, onStage: (stage, build) => {
    status.textContent = `${updateStageLabels[stage]}${build ? `（${build.version}）` : ''}`;
  } }).catch(error => {
    status.dataset.error = 'true';
    status.textContent = error instanceof Error ? error.message : String(error);
    button.disabled = false;
    button.textContent = '重试更新';
  });
});
