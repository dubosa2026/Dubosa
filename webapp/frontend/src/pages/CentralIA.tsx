import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "../lib/api";
import { Button } from "../components/ui";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGESTOES = [
  "Quanto vendemos este mês?",
  "Quais vendedores precisam de atenção?",
  "Quais clientes devo priorizar hoje?",
  "Quais clientes estão em risco?",
  "Quem cresceu mais?",
  "Qual estado está puxando o resultado?",
  "Mostre os clientes que pararam de comprar.",
];

export function CentralIA() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Pergunte sobre faturamento, vendedores, clientes em risco, prioridades do dia ou cenários. Eu respondo com base nos dados reais disponíveis — quando não houver dados suficientes, aviso.",
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const askMutation = useMutation({
    mutationFn: (question: string) => apiPost<{ answer: string }>("/ia/perguntar", { question }),
    onSuccess: (res) => {
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
    },
    onError: () => setMessages((m) => [...m, { role: "assistant", content: "Não consegui processar essa pergunta agora." }]),
  });

  function send(question: string) {
    if (!question.trim()) return;
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    askMutation.mutate(question);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)]">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Pergunte à IA</h1>
        <p className="text-sm text-gray-500">Respostas baseadas nos dados reais da sua operação.</p>
      </div>

      <div className="flex flex-wrap gap-2 my-3">
        {SUGESTOES.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            className="text-xs bg-white border border-gray-200 rounded-full px-3 py-1.5 hover:border-brand-400 hover:text-brand-600"
          >
            {s}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 py-2">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] md:max-w-[70%] rounded-2xl border shadow-sm p-5 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-white border-gray-200 text-gray-800"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {askMutation.isPending && <div className="text-xs text-gray-400 px-2">Consultando os dados...</div>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 pt-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite sua pergunta..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <Button type="submit" disabled={askMutation.isPending}>
          Enviar
        </Button>
      </form>
    </div>
  );
}
