import { createClient } from "@supabase/supabase-js"

const supabaseUrl = "https://fuijicsetkgzrgdyxbup.supabase.co"
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1aWppY3NldGtnenJnZHl4YnVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5Mzg4MzgsImV4cCI6MjA2OTUxNDgzOH0.ZhnlppVcu90KuIW5iimuPrOTrYIVzVxPujAlxzzfpJU"

export const supabase = createClient(supabaseUrl, supabaseKey)
