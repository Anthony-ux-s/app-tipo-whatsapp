/**
 * Plantillas de los correos de Parla. HTML con tablas y estilos en línea (así se ven bien en Gmail, Outlook y
 * el celular), más una versión en texto plano para los programas de correo que no muestran HTML.
 * Todos comparten el mismo marco: franja verde con el nombre, tarjeta blanca, aviso de seguridad y pie.
 */
export type EmailKind = 'register' | 'confirm_email' | 'reset_password' | 'welcome';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailContext {
  /** Código de 6 dígitos (no aplica a la bienvenida). */
  code?: string;
  /** Minutos de vigencia del código. */
  minutes?: number;
  /** Nombre de la persona (bienvenida). */
  name?: string;
  /** Dirección de la web (enlaces del correo). */
  webUrl?: string;
}

const BRAND = '#009d71';
const BRAND_DARK = '#007353';
const INK = '#111b21';
const MUTED = '#54656f';
const CANVAS = '#f0f2f5';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Marco común: franja de marca, contenido, y pie. `preheader` es el texto que se ve junto al asunto en la bandeja. */
function frame(preheader: string, body: string, webUrl: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Parla</title></head>
<body style="margin:0;padding:0;background:${CANVAS};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
    <tr><td style="background:${BRAND};border-radius:16px 16px 0 0;padding:22px 28px;">
      <span style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">parla</span>
      <span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#d6f3ea;margin-left:8px;">chats y servicios</span>
    </td></tr>
    <tr><td style="background:#ffffff;padding:30px 28px 26px;border-radius:0 0 16px 16px;font-family:Arial,Helvetica,sans-serif;color:${INK};">
      ${body}
    </td></tr>
    <tr><td style="padding:18px 8px 4px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${MUTED};">
      Recibiste este correo porque alguien lo usó en <a href="${escape(webUrl)}" style="color:${BRAND_DARK};text-decoration:underline;">Parla</a>.<br>
      Es un mensaje automático: no hace falta responderlo.
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

/** La caja con el código, grande y fácil de copiar. */
function codeBox(code: string): string {
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:22px auto;"><tr><td style="background:#e6f7f1;border:2px dashed ${BRAND};border-radius:14px;padding:16px 30px;font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:700;letter-spacing:10px;color:${BRAND_DARK};text-align:center;">${escape(code)}</td></tr></table>`;
}

const h1 = (text: string) => `<h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;color:${INK};">${text}</h1>`;
const p = (text: string, extra = '') => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${INK};${extra}">${text}</p>`;
const small = (text: string) => `<p style="margin:14px 0 0;font-size:13px;line-height:1.55;color:${MUTED};">${text}</p>`;
const button = (label: string, url: string) =>
  `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:22px auto 4px;"><tr><td style="background:${BRAND};border-radius:12px;"><a href="${escape(url)}" style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">${escape(label)}</a></td></tr></table>`;

/** Código de seguridad: lo que más importa va primero (asunto con el código, para verlo sin abrir el correo). */
function codeEmail(opts: { subject: string; title: string; intro: string; code: string; minutes: number; warning: string; webUrl: string }): RenderedEmail {
  const body = `${h1(opts.title)}${p(opts.intro)}${codeBox(opts.code)}
${p(`El código vence en <strong>${opts.minutes} minutos</strong> y solo sirve una vez.`, 'text-align:center;')}
<hr style="border:none;border-top:1px solid #e9edef;margin:20px 0 4px;">
${small(`<strong style="color:${INK};">Cuida tu cuenta:</strong> ${opts.warning}`)}`;
  return {
    subject: opts.subject,
    html: frame(`Tu código es ${opts.code}. Vence en ${opts.minutes} minutos.`, body, opts.webUrl),
    text: `${opts.title}\n\n${opts.intro}\n\n    ${opts.code}\n\nEl código vence en ${opts.minutes} minutos y solo sirve una vez.\n\nCuida tu cuenta: ${opts.warning}\n\n— Parla`,
  };
}

/** Arma el correo de cada tipo. Los textos están en español neutro, claros para quien no es técnico. */
export function renderEmail(kind: EmailKind, ctx: EmailContext = {}): RenderedEmail {
  const webUrl = (ctx.webUrl ?? 'https://www.kronito.com').replace(/\/$/, '');
  const code = ctx.code ?? '';
  const minutes = ctx.minutes ?? 10;

  switch (kind) {
    case 'register':
      return codeEmail({
        subject: `${code} es tu código para crear tu cuenta en Parla`,
        title: 'Confirma tu correo',
        intro: 'Estás creando tu cuenta de Parla. Escribe este código en la app para continuar:',
        code,
        minutes,
        warning: 'si no fuiste tú, ignora este correo. Sin el código nadie puede crear una cuenta con tu correo, y nunca te lo pediremos por chat ni por teléfono.',
        webUrl,
      });
    case 'confirm_email':
      return codeEmail({
        subject: `${code} es tu código para confirmar tu correo en Parla`,
        title: 'Confirma tu correo',
        intro: 'Escribe este código en Parla para dejar tu correo confirmado. Lo usaremos para ayudarte a recuperar tu cuenta:',
        code,
        minutes,
        warning: 'si no pediste este código, ignóralo. Tu correo no se agregará a ninguna cuenta sin él.',
        webUrl,
      });
    case 'reset_password':
      return codeEmail({
        subject: `${code} es tu código para restablecer tu contraseña de Parla`,
        title: 'Restablece tu contraseña',
        intro: 'Pediste cambiar tu contraseña de Parla. Escribe este código en la app para elegir una nueva:',
        code,
        minutes,
        warning: 'si no fuiste tú, ignora este correo: tu contraseña sigue igual y nadie puede cambiarla sin el código. Si te preocupa, entra a Parla y cámbiala desde Ajustes.',
        webUrl,
      });
    case 'welcome': {
      const name = ctx.name?.trim() ? escape(ctx.name.trim().split(/\s+/)[0]) : '';
      const body = `${h1(`¡Bienvenido${name ? `, ${name}` : ''}!`)}
${p('Tu cuenta de Parla ya está lista. Esto es lo que puedes hacer desde hoy:')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 8px;width:100%;">
  <tr><td style="padding:8px 0;font-size:15px;line-height:1.5;color:${INK};"><span style="color:${BRAND};font-weight:700;">&#128274;</span>&nbsp; <strong>Chatea con cifrado de extremo a extremo.</strong> Solo tú y quien escribes pueden leer los mensajes.</td></tr>
  <tr><td style="padding:8px 0;font-size:15px;line-height:1.5;color:${INK};"><span style="color:${BRAND};font-weight:700;">&#128722;</span>&nbsp; <strong>Compra sin salir del chat.</strong> Elige una tienda, paga y sigue tu pedido en vivo.</td></tr>
  <tr><td style="padding:8px 0;font-size:15px;line-height:1.5;color:${INK};"><span style="color:${BRAND};font-weight:700;">&#127873;</span>&nbsp; <strong>Gana descuentos.</strong> Mira la ruleta y las ofertas pensadas para ti.</td></tr>
</table>
${button('Abrir Parla', `${webUrl}/app`)}
${small('Consejo: instala la app desde el menú ☰ → «Instalar la app» para tenerla en tu pantalla de inicio.')}`;
      return {
        subject: `¡Bienvenido a Parla${name ? `, ${ctx.name!.trim().split(/\s+/)[0]}` : ''}!`,
        html: frame('Tu cuenta de Parla ya está lista.', body, webUrl),
        text: `¡Bienvenido${name ? `, ${ctx.name!.trim().split(/\s+/)[0]}` : ''}!\n\nTu cuenta de Parla ya está lista:\n- Chatea con cifrado de extremo a extremo.\n- Compra sin salir del chat y sigue tu pedido en vivo.\n- Gana descuentos con la ruleta y las ofertas para ti.\n\nAbre Parla: ${webUrl}/app\n\n— Parla`,
      };
    }
  }
}
