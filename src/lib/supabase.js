import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ablyibvltiassukupmwq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibHlpYnZsdGlhc3N1a3VwbXdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODAyNTAsImV4cCI6MjA5MDI1NjI1MH0.O-nFnlJiWM7yiFMA3u-dzXV0hH2no6cir9dhsok0IFo'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
