# DIRETRIZ ESTRITA DE SEGURANÇA PARA TESTES DE DISPARO

ATENÇÃO:
O WhatsApp do usuário fica conectado ao vivo no Baileys. Qualquer mensagem disparada pelo backend é enviada imediatamente no WhatsApp real.

1. NUNCA disparar mensagens ou criar campanhas para números fictícios ou de clientes em testes automatizados.
2. NÚMEROS AUTORIZADOS EXCLUSIVAMENTE PARA TESTES:
   - 5511952171047 (ou 11952171047)
   - 5511982815534 (ou 11982815534)
3. Se for testar rotas de template ou lógica, utilize testes unitários puros chamando as funções diretamente em Node sem disparar mensagens na rede Baileys.
4. Se for disparar mensagem de teste real via Baileys, envie APENAS para os dois números acima.
