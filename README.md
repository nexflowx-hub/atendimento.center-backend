# Atendimento.Center Backend

Backend multi-tenant e camada de orquestração do **Atendimento.Center**, uma solução Atlas Global.

## Responsabilidades

- API/BFF para o frontend próprio
- Integração headless com Chatwoot
- Orquestração de IA e base de conhecimento
- Integração com WhatsApp/Evolution API e futura WhatsApp Cloud API
- Gestão de tenants, utilizadores, permissões e auditoria
- Agendamentos, automações e métricas

## Arquitetura inicial

- Node.js + TypeScript
- NestJS
- Prisma + PostgreSQL/Supabase
- Redis + BullMQ
- Chatwoot como conversation engine
- OpenRouter como primeiro AI provider
- Docker Compose

> Nunca versionar credenciais ou ficheiros `.env`.
