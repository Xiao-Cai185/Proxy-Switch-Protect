import { createRoot } from 'react-dom/client';
import '../../styles/base.css';
import './blocked.css';
import { App } from './App';

createRoot(document.getElementById('app')!).render(<App />);
