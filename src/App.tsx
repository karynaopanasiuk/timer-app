import { Background } from './components/Background/Background.tsx'
import { Timer } from './components/Timer/Timer.tsx'
import './App.css'

function App() {
  return (
    <>
      <Background />
      <main className="app">
        <Timer />
      </main>
    </>
  )
}

export default App
