import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { pageTitle } from './pageTitles'

export function PageTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.title = pageTitle(pathname)
  }, [pathname])
  return null
}
