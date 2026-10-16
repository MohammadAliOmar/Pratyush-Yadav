import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { testFirebaseConnection } from './services/firebase';

testFirebaseConnection();

createRoot(document.getElementById('root')!).render(<App />);
