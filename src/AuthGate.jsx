import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const ALLOWED_EMAIL = "administracion@cofrumon.es"; // <-- tu email

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState(ALLOWED_EMAIL);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (e) => {
    e.preventDefault();
    setErr("");
    if (email.trim().toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
      setErr("Este email no está autorizado.");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) setErr(error.message);
    else setSent(true);
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  if (loading) return <div className="p-8 text-center">Cargando…</div>;

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50">
        <form onSubmit={signIn} className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-sm">
          <h1 className="text-xl font-semibold mb-2">Acceso a FactuOS</h1>
          <p className="text-sm text-gray-600 mb-4">Introduce tu email para recibir un enlace de acceso.</p>
          <input
            className="w-full rounded-xl border border-emerald-200 px-3 py-2 mb-2"
            type="email"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            placeholder="tu@correo.com"
            required
          />
          {err && <div className="text-red-600 text-sm mb-2">{err}</div>}
          <button className="w-full rounded-xl bg-emerald-600 text-white font-semibold px-4 py-2">Enviar enlace</button>
          {sent && <div className="text-sm text-emerald-700 mt-3">Revisa tu correo para completar el acceso.</div>}
        </form>
      </div>
    );
  }

  return (
    <>
      <div className="fixed right-3 top-3">
        <button onClick={signOut} className="rounded-xl bg-gray-800 text-white px-3 py-1 text-sm">Salir</button>
      </div>
      {children}
    </>
  );
}
