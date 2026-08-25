import ReactDOM from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
// Extracted by vite into its own file, so it applies before first paint
// rather than after React mounts. See the header of the file for why.
import './styles/modern.css'
import App from './App.jsx'
import ErrorBoundary from './shared/components/ErrorBoundary.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
