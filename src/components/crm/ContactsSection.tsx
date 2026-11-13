"use client";

import { UserPlus, Sparkles, CheckCircle2, Download } from "lucide-react";

// Secao de contatos do painel do cliente, extraida de ClientWorkspace.tsx.
// Recebe apenas o que usa, em vez de depender do estado gigante do workspace.
export type ContactsSectionProps = {
  contacts: Array<{ id: string; display_name?: string | null; phone?: string | null; created_at?: string | null }>;
  contactName: string;
  contactPhone: string;
  contactNotice: string | null;
  newContactOpen: boolean;
  onContactNameChange: (v: string) => void;
  onContactPhoneChange: (v: string) => void;
  onToggleNewContact: (open: boolean) => void;
  onRegisterContact: (e: React.FormEvent<HTMLFormElement>) => void;
  reengageOpen: boolean;
  reengageDays: string;
  reengageCoupon: string;
  reengageMessage: string;
  reengageNotice: string | null;
  reengageLoading: boolean;
  onReengageDaysChange: (v: string) => void;
  onReengageCouponChange: (v: string) => void;
  onReengageMessageChange: (v: string) => void;
  onExecuteReengagement: () => void | Promise<void>;
  dateTime: (iso?: string | null) => string;
  loading: boolean;
};

export default function ContactsSection(props: ContactsSectionProps) {
  const {
    contacts, contactName, contactPhone, contactNotice, newContactOpen,
    onContactNameChange, onContactPhoneChange, onToggleNewContact, onRegisterContact,
    reengageOpen, reengageDays, reengageCoupon, reengageMessage, reengageNotice,
    reengageLoading, onReengageDaysChange, onReengageCouponChange,
    onReengageMessageChange, onExecuteReengagement, dateTime, loading,
  } = props;

  return (
              <section className="op-card op-contacts-section" aria-label="Cadastro de contatos">
                <div className="op-contact-heading" style={{display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #372f4d", paddingBottom: "16px", marginBottom: "16px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                    <UserPlus size={24} color="#ec4899"/>
                    <div>
                      <h2 style={{margin: 0, fontSize: "18px"}}>Contatos da Loja</h2>
                      <span style={{fontSize: "12px", color: "#aba8bf"}}>{contacts.length} cadastrados</span>
                    </div>
                  </div>
                  <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                    <a
                      href="/api/crm/operator/export?type=contacts"
                      download
                      className="op-refresh"
                      style={{display: "inline-flex", alignItems: "center", gap: "6px", textDecoration: "none", color: "inherit"}}
                      title="Baixar lista de contatos em formato CSV"
                    >
                      <Download size={14} /> Exportar CSV
                    </a>
                    <button className="op-refresh" onClick={() => onToggleNewContact(!newContactOpen)} aria-expanded={newContactOpen}>
                      {newContactOpen ? "Fechar formulário" : "+ Novo Contato"}
                    </button>
                  </div>
                </div>

                                {/* Painel do Recuperador de Clientes Inativos */}
                {reengageOpen && (
                  <form onSubmit={onExecuteReengagement} style={{
                    marginBottom: "20px",
                    background: "linear-gradient(135deg, rgba(236, 72, 153, 0.1), rgba(139, 92, 246, 0.1))",
                    border: "1px solid rgba(236, 72, 153, 0.35)",
                    borderRadius: "14px",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px"
                  }}>
                    <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                      <div>
                        <strong style={{color: "#fff", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px"}}>
                          <Sparkles size={18} color="#ec4899" /> Campanha de Reativação de Vendas
                        </strong>
                        <small style={{color: "#aba8bf", fontSize: "12px"}}>
                          Recupere clientes antigos que não compram há algum tempo com uma oferta exclusiva via WhatsApp.
                        </small>
                      </div>
                      <span style={{fontSize: "12px", background: "rgba(0, 219, 140, 0.2)", color: "#00db8c", padding: "4px 10px", borderRadius: "999px", fontWeight: 700}}>
                        {contacts.length} contatos disponíveis
                      </span>
                    </div>

                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px"}}>
                      <label style={{fontSize: "13px", color: "#c2bed4"}}>
                        Filtrar Clientes Sem Interação Há:
                        <select
                          value={reengageDays}
                          onChange={e => onReengageDaysChange(e.target.value)}
                          style={{width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", marginTop: "4px"}}
                        >
                          <option value="15">Mais de 15 dias sem comprar</option>
                          <option value="30">Mais de 30 dias sem comprar (Recomendado)</option>
                          <option value="60">Mais de 60 dias sem comprar</option>
                          <option value="all">Todos os contatos da lista</option>
                        </select>
                      </label>

                      <label style={{fontSize: "13px", color: "#c2bed4"}}>
                        Cupom Promocional (Opcional):
                        <input
                          type="text"
                          value={reengageCoupon}
                          onChange={e => onReengageCouponChange(e.target.value)}
                          placeholder="Ex.: VOLTEI10 ou OFF15"
                          style={{width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", marginTop: "4px"}}
                        />
                      </label>
                    </div>

                    <label style={{fontSize: "13px", color: "#c2bed4"}}>
                      Mensagem de Reativação (Use <em>{'{nome}'}</em>, <em>{'{loja}'}</em> e <em>{'{cupom}'}</em>):
                      <textarea
                        rows={3}
                        required
                        value={reengageMessage}
                        onChange={e => onReengageMessageChange(e.target.value)}
                        style={{width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", marginTop: "4px", fontSize: "13px"}}
                      />
                    </label>

                    {reengageNotice && (
                      <div style={{
                        padding: "10px 14px",
                        borderRadius: "8px",
                        background: reengageNotice.startsWith("⚠️") ? "rgba(239, 68, 68, 0.15)" : "rgba(0, 219, 140, 0.15)",
                        border: reengageNotice.startsWith("⚠️") ? "1px solid #ef4444" : "1px solid #00db8c",
                        color: reengageNotice.startsWith("⚠️") ? "#fca5a5" : "#6ee7b7",
                        fontSize: "13px",
                        fontWeight: 600
                      }}>
                        {reengageNotice}
                      </div>
                    )}

                    <div style={{display: "flex", justifyContent: "flex-end", gap: "10px"}}>
                      <button
                        type="submit"
                        disabled={reengageLoading || !contacts.length}
                        className="op-primary"
                        style={{
                          padding: "10px 22px",
                          borderRadius: "10px",
                          fontWeight: 800,
                          fontSize: "13px",
                          background: "linear-gradient(135deg, #00db8c, #059669)",
                          color: "#052e16",
                          border: "none",
                          cursor: "pointer"
                        }}
                      >
                        {reengageLoading ? "Disparando mensagens..." : "🚀 Disparar Campanha de Reativação"}
                      </button>
                    </div>
                  </form>
                )}

                {newContactOpen && (
                  <form className="op-contact-form" onSubmit={e => void onRegisterContact(e)} style={{marginBottom: "20px", background: "rgba(0,0,0,0.25)", padding: "18px", borderRadius: "12px"}}>
                    <h3 style={{margin: "0 0 12px", fontSize: "15px"}}>Cadastrar Novo Cliente</h3>
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "12px"}}>
                      <label style={{fontSize: "13px", color: "#c2bed4"}}>
                        Nome do Cliente
                        <input
                          type="text"
                          required
                          value={contactName}
                          onChange={e => onContactNameChange(e.target.value)}
                          placeholder="Ex.: Maria Souza"
                          style={{width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", marginTop: "4px"}}
                        />
                      </label>
                      <label style={{fontSize: "13px", color: "#c2bed4"}}>
                        Telefone (WhatsApp com DDD)
                        <input
                          type="tel"
                          required
                          value={contactPhone}
                          onChange={e => onContactPhoneChange(e.target.value)}
                          placeholder="Ex.: 51988887777"
                          style={{width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", marginTop: "4px"}}
                        />
                      </label>
                    </div>
                    <button type="submit" className="op-primary" disabled={loading} style={{padding: "10px 20px", fontWeight: 700, borderRadius: "8px"}}>
                      Salvar Contato
                    </button>
                  </form>
                )}

                {contactNotice && (
                  <div style={{padding: "12px 16px", borderRadius: "10px", background: "rgba(10, 46, 32, 0.8)", border: "1px solid #00db8c", color: "#b6f5dd", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px"}}>
                    <CheckCircle2 size={16} color="#00db8c"/>
                    <span>{contactNotice}</span>
                  </div>
                )}

                <div style={{display: "flex", flexDirection: "column", gap: "10px"}}>
                  {contacts.length ? contacts.map(c => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "14px 18px",
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "12px",
                        border: "1px solid #332b49",
                        flexWrap: "wrap",
                        gap: "10px"
                      }}
                    >
                      <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                        <div style={{width: "38px", height: "38px", borderRadius: "50%", background: "var(--grad-primary)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "14px", color: "white"}}>
                          {(c.display_name || c.phone || "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong style={{color: "white", fontSize: "15px", display: "block"}}>{c.display_name || "Sem nome"}</strong>
                          <span style={{color: "#8e87a2", fontSize: "13px"}}>{c.phone}</span>
                        </div>
                      </div>
                      <span style={{fontSize: "12px", color: "#9ca3af"}}>
                        Cadastrado em {dateTime(c.created_at ?? undefined)}
                      </span>
                    </div>
                  )) : (
                    <div style={{textAlign: "center", padding: "40px", color: "#8c879b"}}>
                      Nenhum contato cadastrado ainda.
                    </div>
                  )}
                </div>
              </section>
  );
}
