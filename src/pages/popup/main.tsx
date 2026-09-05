import { createRoot } from 'react-dom/client';
import '../../styles/base.css';
import './popup.css';
import { App } from './App';

createRoot(document.getElementById('app')!).render(<App />);
