import React from 'react'
import "./globals.css"

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html>
        <body>
            {children}
        </body>
    </html>
  )
}

export default Layout