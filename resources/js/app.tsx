import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';

const container = document.getElementById('app');

if (!container) {
    throw new Error('The frontend root element was not found.');
}

ReactDOM.createRoot(container).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
