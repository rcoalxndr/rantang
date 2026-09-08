import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const KonteksAuth = createContext(null);

/**
 * Sumber kebenaran soal "siapa yang sedang masuk" adalah SERVER, bukan state di
 * browser. Saat aplikasi dibuka, kita tanya /api/auth/me — kalau cookie sesinya
 * masih sah, server menjawab siapa pemiliknya.
 *
 * Menyimpan status login di localStorage akan berbohong: cookie bisa sudah
 * kedaluwarsa atau dicabut sementara localStorage masih berkata "sudah masuk".
 */
export function PenyediaAuth({ children }) {
  const [user, setUser] = useState(null);
  const [memuat, setMemuat] = useState(true);

  useEffect(() => {
    api
      .get('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setMemuat(false));
  }, []);

  const masuk = useCallback(async (email, kataSandi) => {
    const d = await api.post('/auth/login', { email, kataSandi });
    setUser(d.user);
    return d.user;
  }, []);

  const daftar = useCallback(async (data) => {
    await api.post('/auth/register', data);
    const d = await api.post('/auth/login', {
      email: data.email,
      kataSandi: data.kataSandi,
    });
    setUser(d.user);
    return d.user;
  }, []);

  const keluar = useCallback(async () => {
    await api.post('/auth/logout');
    setUser(null);
  }, []);

  return (
    <KonteksAuth.Provider value={{ user, memuat, masuk, daftar, keluar }}>
      {children}
    </KonteksAuth.Provider>
  );
}

export function useAuth() {
  const nilai = useContext(KonteksAuth);
  if (!nilai) throw new Error('useAuth harus dipakai di dalam PenyediaAuth.');
  return nilai;
}
