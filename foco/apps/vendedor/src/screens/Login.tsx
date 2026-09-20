import { useState, type FormEvent } from "react";
import type { HomeData } from "../../shared/ipc";

export default function Login({ onLoggedIn }: { onLoggedIn: (data: HomeData) => void }) {
  const [email, setEmail] = useState("vendedor1@foco.local");
  const [senha, setSenha] = useState("foco123");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const resposta = await window.foco.login({ email, senha });
    setCarregando(false);
    if (!resposta.ok) {
      setErro(resposta.erro);
      return;
    }
    onLoggedIn(resposta.data);
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">FOCO</div>
        <p className="login-tagline">Proteja o tempo de quem vende.</p>
        <form onSubmit={handleSubmit}>
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Senha
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </label>
          {erro && <div className="login-erro">{erro}</div>}
          <button type="submit" disabled={carregando}>
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <p className="login-hint">Demonstração: vendedor1@foco.local … vendedor10@foco.local — senha foco123</p>
      </div>
    </div>
  );
}
