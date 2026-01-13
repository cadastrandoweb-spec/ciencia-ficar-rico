<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Curso A Ciência de Ficar Rico - Checkout

Checkout para o produto "Curso A Ciência de Ficar Rico" com valor de R$47,00.

## Características

- **Produto**: Curso A Ciência de Ficar Rico
- **Valor**: R$47,00
- **Sem Upsell**: Este checkout não possui upsell/order bump
- **Métodos de pagamento**: PIX e Cartão de Crédito
- **Integração**: Mercado Pago para processamento de pagamentos

## Configuração

1. Instale as dependências:
```bash
npm install
```

2. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas credenciais do Mercado Pago e outras configurações.

3. Inicie o desenvolvimento:
```bash
npm run dev
```

## Deploy

Este projeto está configurado para deploy na Vercel através do arquivo `vercel.json`.

## Estrutura

- `/components` - Componentes React do checkout
- `/services` - Serviços de integração com APIs
- `/api` - Endpoints da API (se necessário)
- `/public` - Arquivos estáticos (imagens, etc.)

## Personalização

- Altere o produto em `constants.ts`
- Modifique os estilos nos componentes em `/components`
- Configure as integrações de pagamento nos arquivos de serviço
