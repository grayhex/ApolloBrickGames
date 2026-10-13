import './styles.css';
import { startApp } from './app/app';

startApp().catch((error: unknown) => {
  const box = document.getElementById('fatal');
  const text = document.getElementById('fatal-text');
  if (box && text) {
    box.hidden = false;
    text.textContent = error instanceof Error ? error.message : String(error);
  }
  console.error(error);
});
