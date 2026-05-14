'use client'

import { useEffect, useState } from 'react'

export default function Clock() {
  const [now, setNow] = useState('')

  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    setNow(fmt())
    const id = setInterval(() => setNow(fmt()), 60000)
    return () => clearInterval(id)
  }, [])

  return <span className="text-sm text-gray-500">{now}</span>
}
