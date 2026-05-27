/**
 * @file Taro application entry file
 */

// Ensure 'react' is pre-bundled in Vite's initial dep scan.
// Without this, lazily-loaded route pages trigger a separate Vite dep optimization
// for 'react', creating a second React instance that conflicts with the framework bundle.
import 'react'
import type React from 'react'
import type {PropsWithChildren} from 'react'
import {useTabBarPageClass} from '@/hooks/useTabBarPageClass'
import {AuthProvider} from '@/contexts/AuthContext'

import './app.scss'

const App: React.FC = ({children}: PropsWithChildren<unknown>) => {
  useTabBarPageClass()

  return <AuthProvider>{children}</AuthProvider>
}

export default App
