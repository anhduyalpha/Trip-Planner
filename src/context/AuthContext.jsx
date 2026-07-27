import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!alive) return
      setSession(s ?? null)
      setLoading(false)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const uid = session?.user?.id
    if (!uid) {
      setProfile(null)
      return
    }
    // Không để hồ sơ tài khoản trước nằm trên màn hình trong lúc đang tải hồ
    // sơ của tài khoản mới (hoặc mãi mãi nếu lần tải mới thất bại).
    setProfile(null)
    // Không có cờ huỷ thì hồ sơ của tài khoản CŨ vẫn được phép ghi vào state
    // khi nó về đích muộn: đăng xuất rồi đăng nhập tài khoản khác trong cùng
    // tab sẽ hiện "Chào <tên người trước>".
    let alive = true
    let timer = null

    // Ngay sau khi đăng ký, dòng profiles do trigger của database tạo ra. Lần
    // đọc đầu tiên thường tới trước trigger nên trả về null, và trước đây
    // không có gì đọc lại: người dùng bị chào bằng địa chỉ email thô cho tới
    // khi họ tự tải lại trang. Thử lại vài nhịp ngắn rồi thôi.
    const fetchProfile = async (attempt = 0) => {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
      if (!alive) return
      if (data) {
        setProfile(data)
        return
      }
      if (attempt < 4) {
        timer = setTimeout(() => fetchProfile(attempt + 1), 400 * (attempt + 1))
      }
    }
    fetchProfile()

    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [session?.user?.id])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password, fullName) =>
      supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      }),
    requestPasswordReset: (email) =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      }),
    updatePassword: (password) => supabase.auth.updateUser({ password }),
    signOut: (options) => supabase.auth.signOut(options)
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
