This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Convocação via WhatsApp

O disparo de convocações usa as seguintes variáveis de ambiente:

```bash
# URL pública usada para montar /convocacao/{token}
NEXT_PUBLIC_APP_URL=https://seu-dominio.com.br

# Endpoint que receberá o payload JSON do WhatsApp
CONVOCATION_WHATSAPP_ENDPOINT=https://seu-servico.com/api/convocacao

# Opcional: enviado como Authorization: Bearer {token}
CONVOCATION_WHATSAPP_TOKEN=
```

Payload enviado ao endpoint:

```json
{
  "nome": "Nome do candidato",
  "numero": "5584999999999",
  "cargo": "Cargo informado",
  "local": "Local de comparecimento",
  "link": "https://seu-dominio.com.br/convocacao/{token}"
}
```

## API externa de consulta de propostas

Configure no servidor uma chave exclusiva para a integração (o nome legado
`XAPIKEY` também é aceito por compatibilidade):

```bash
PROPOSAL_API_KEY=gere-uma-chave-longa-e-aleatoria
```

O sistema de atendimento pode consultar uma proposta por `GET`:

```bash
curl 'https://seu-dominio.com.br/api/external/proposals?cpf=123.456.789-09' \
  -H 'Authorization: Bearer gere-uma-chave-longa-e-aleatoria'
```

Ou por `POST` (também é aceito o cabeçalho `x-api-key`):

```bash
curl -X POST 'https://seu-dominio.com.br/api/external/proposals' \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: gere-uma-chave-longa-e-aleatoria' \
  -d '{"cpf":"12345678909"}'
```

Resposta de sucesso (`200`):

```json
{
  "success": true,
  "data": {
    "id": "id-da-proposta",
    "nomeCompleto": "Nome do associado",
    "cpf": "123.456.789-09",
    "status": "signature_requested",
    "assinatura": {
      "status": "pendente",
      "assinado": false,
      "link": "https://link-de-assinatura.example",
      "assinadoEm": null,
      "statusProvedor": "pending"
    }
  }
}
```

A rota retorna `400` para CPF inválido, `401` para chave ausente/incorreta,
`404` quando não existe proposta e `503` quando a chave não foi configurada.
As respostas usam `Cache-Control: no-store` e não incluem tokens de upload,
chaves internas da assinatura ou histórico de verificação.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
