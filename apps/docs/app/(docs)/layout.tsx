import { TreeContextProvider } from 'fumadocs-ui/contexts/tree'
import React from 'react'
import { NextProvider } from 'fumadocs-core/framework/next'
import { source } from '@/lib/source'

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <NextProvider>
        <TreeContextProvider tree={source.pageTree}>
            {children}
        </TreeContextProvider>
    </NextProvider>
  )
}

export default Layout
