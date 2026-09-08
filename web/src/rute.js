import { useEffect, useState } from 'react';

/**
 * Routing seadanya lewat hash URL, tanpa pustaka.
 *
 * Untuk enam layar, react-router adalah dependency yang tidak sebanding dengan
 * manfaatnya — dan menulis ini sendiri memperlihatkan bahwa "routing" pada
 * dasarnya cuma membaca alamat dan memilih komponen. Kalau nanti butuh rute
 * bersarang atau pemuatan malas, barulah pustaka layak dipertimbangkan.
 */
export function useRute() {
  const [rute, setRuteState] = useState(() => window.location.hash.slice(1) || '/');

  useEffect(() => {
    const perbarui = () => setRuteState(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', perbarui);
    return () => window.removeEventListener('hashchange', perbarui);
  }, []);

  const pergiKe = (tujuan) => {
    window.location.hash = tujuan;
  };

  return [rute, pergiKe];
}
