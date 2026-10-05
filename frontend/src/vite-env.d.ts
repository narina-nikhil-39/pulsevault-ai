/// <reference types="vite/client" />

// Side-effect stylesheet imports (e.g. `import './index.css'`) carry no value binding, so
// they need an explicit declaration for TypeScript to accept them under `verbatimModuleSyntax`.
declare module '*.css'
