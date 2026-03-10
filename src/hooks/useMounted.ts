// src/hooks/useMounted.ts
import { useSyncExternalStore } from 'react'



export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},   
    () => true,       
    () => false,      
  )
}