import './platform' // install window.api bridge (Capacitor on mobile) before App renders
import { createRoot } from 'react-dom/client'
// Crepe's theme CSS is imported HERE, before app.css, so app.css can override it
// at equal specificity by source order (paragraph/heading font sizes track the
// --editor-font-size / --editor-line-height vars). Editor.jsx is a lazy chunk —
// left to its own imports, this CSS would inject at runtime AFTER app.css and
// Crepe's hardcoded `.ProseMirror p { font-size:16px }` etc. would win instead.
// Vite dedupes the modules, so the Editor chunk doesn't re-inject them.
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import '@milkdown/crepe/theme/common/link-tooltip.css'
import App from './App.jsx'
import './styles/app.css'

createRoot(document.getElementById('root')).render(<App />)
