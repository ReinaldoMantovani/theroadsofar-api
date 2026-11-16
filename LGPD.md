# Checklist LGPD — The Road So Far

Conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).

---

## Princípios implementados (Art. 6º LGPD)

| Princípio | Implementação |
|---|---|
| **Finalidade** | Dados coletados apenas para funcionamento do blog (cadastro, comentários) |
| **Adequação** | Nenhum dado coletado além do estritamente necessário |
| **Necessidade** | User + UserProfile separados; mínimo de dados pessoais |
| **Livre acesso** | Usuário pode ver e baixar seus dados (`GET /users/me`) |
| **Qualidade dos dados** | Usuário pode atualizar perfil a qualquer momento |
| **Transparência** | Política de Privacidade acessível antes do cadastro |
| **Segurança** | BCrypt, JWT, HTTPS, sanitização |
| **Prevenção** | Rate limiting, validação, auditoria |
| **Não discriminação** | Nenhuma decisão automatizada sobre usuários |
| **Responsabilização** | Logs de auditoria, soft delete, checklist documentado |

---

## Dados coletados e base legal

### Usuários (cadastro)
| Dado | Finalidade | Base Legal | Retenção |
|---|---|---|---|
| E-mail | Autenticação, comunicação | Contrato (Art. 7º, V) | Enquanto conta ativa + 5 anos |
| Senha (hash BCrypt) | Autenticação | Contrato | Enquanto conta ativa |
| Data de cadastro | Auditoria | Legítimo interesse | Permanente |
| Consentimento (data/hora) | Prova legal | Consentimento (Art. 7º, I) | Permanente |

### Perfil (opcional)
| Dado | Finalidade | Base Legal | Retenção |
|---|---|---|---|
| Nome de exibição | Identificação pública | Contrato | Enquanto conta ativa |
| Bio, website | Personalização | Contrato | Enquanto conta ativa |
| Avatar | Personalização | Contrato | Enquanto conta ativa |

### Logs de auditoria
| Dado | Finalidade | Base Legal | Retenção |
|---|---|---|---|
| IP anonimizado (xxx) | Segurança, investigação | Legítimo interesse | 90 dias |
| Ação realizada | Auditoria | Legítimo interesse | 90 dias |
| Data/hora | Auditoria | Legítimo interesse | 90 dias |

---

## Direitos dos titulares implementados (Art. 18 LGPD)

- [x] **Confirmação e acesso** — `GET /users/me` retorna todos os dados do usuário
- [x] **Correção** — `PUT /users/me/profile` atualiza dados de perfil
- [x] **Anonimização/bloqueio/eliminação** — `DELETE /users/me` aplica soft delete
- [x] **Portabilidade** — `GET /users/me/export` retorna JSON com todos os dados
- [x] **Revogação do consentimento** — usuário pode revogar e excluir a conta
- [x] **Oposição** — usuário pode solicitar exclusão a qualquer momento

---

## Consentimento (Art. 7º, I e 8º LGPD)

- [x] Formulário de cadastro exige marcação explícita de duas checkboxes:
  - Aceite dos Termos de Uso
  - Aceite da Política de Privacidade
- [x] Data e hora do consentimento registradas em `consent_terms_at` e `consent_privacy_at`
- [x] Ambas as colunas são NOT NULL — cadastro impossível sem consentimento
- [x] Texto das checkboxes inclui link para os documentos completos
- [x] Nenhuma checkbox pré-marcada

---

## Privacy by Design (Art. 46, §2º LGPD)

- [x] Tabelas `users` e `user_profiles` separadas — dados pessoais isolados
- [x] Senha nunca retornada nas respostas da API (`select: false`)
- [x] Refresh token armazenado como hash — token raw nunca persistido
- [x] IP anonimizado nos logs (último octeto IPv4 substituído por `.xxx`)
- [x] Soft delete — dados marcados como excluídos, não apagados
- [x] HTTPS obrigatório — dados em trânsito sempre criptografados

---

## Incidente de dados (Art. 48 LGPD)

Em caso de vazamento ou acesso não autorizado:
1. Identificar quais dados foram afetados (logs de auditoria)
2. Estimar quantidade de titulares impactados
3. Notificar a ANPD em até **72 horas** após ciência (Art. 48, §1º)
4. Notificar os titulares afetados caso o risco seja alto
5. Documentar o incidente, causa e medidas tomadas

---

## Dados de menores

- [x] Sem coleta intencional de dados de menores de 18 anos
- [x] Termos de Uso indicam que o serviço é para maiores de 18 anos

---

## Encarregado de Dados (DPO)

Indicar nome e contato do encarregado de dados conforme Art. 41 LGPD:

> **Encarregado:** [Nome completo]  
> **E-mail:** privacidade@seudominio.com.br  
> **Publicar em:** https://seudominio.com.br/privacidade

---

## Documentos a publicar no site

- [ ] Política de Privacidade — descreve todos os pontos acima
- [ ] Termos de Uso — condições de uso do blog
- [ ] Formulário de exercício de direitos — como o usuário pode solicitar dados/exclusão

---

## Revisão periódica

Este checklist deve ser revisado:
- [ ] Sempre que novos dados forem coletados
- [ ] Após mudanças na legislação
- [ ] Anualmente (mínimo)

Última revisão: novembro/2026
