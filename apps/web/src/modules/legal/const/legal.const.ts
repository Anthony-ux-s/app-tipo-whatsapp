import type { LegalDocument } from '../types/legal.types';

export const LEGAL_VERSION = '2026-10';
export const LEGAL_UPDATED = '15 de octubre de 2026';

export const TERMS: LegalDocument = {
  slug: 'terminos',
  title: 'Términos y condiciones',
  intro:
    'Estos términos regulan el uso de Parla, una app de mensajería con servicios integrados (compras con delivery y pago con QR). Al crear una cuenta aceptas estas condiciones.',
  sections: [
    {
      heading: '1. El servicio',
      paragraphs: [
        'Parla permite conversar con cualquier persona registrada en chats individuales y grupales, compartir archivos, hacer llamadas de voz y video, organizar tareas y usar servicios de terceros (por ahora, un mercado con delivery) sin salir de la app.',
        'Los mensajes, archivos y títulos de tareas se cifran de extremo a extremo en tu dispositivo. Las llamadas viajan cifradas directamente entre los participantes.',
      ],
    },
    {
      heading: '2. Tu cuenta',
      paragraphs: [
        'Eres responsable de mantener segura tu contraseña. Tu clave privada de cifrado se protege con ella: si la olvidas, no podremos recuperar el contenido cifrado de tus conversaciones.',
        'Debes tener al menos 14 años o la edad mínima que exija la ley de tu país para usar el servicio.',
      ],
    },
    {
      heading: '3. Uso aceptable',
      paragraphs: [
        'No puedes usar Parla para actividades ilegales, para enviar spam, acosar a otras personas, distribuir malware ni para vulnerar derechos de terceros.',
        'Quien crea un grupo lo administra y puede agregar personas. Podemos suspender cuentas que incumplan estos términos.',
      ],
    },
    {
      heading: '4. Servicios, pagos y cancelación',
      paragraphs: [
        'Chatear y llamar en Parla no tiene costo. Los servicios (como el Mercado) los prestan comercios y empresas de delivery independientes; Parla te conecta con ellos, te muestra sus precios y suma el total antes de que pagues.',
        'No hay cobros automáticos: cada pedido se paga una sola vez, con el código QR que generamos para ese pedido. Si el cobro vence sin pagarse, no se cobra nada y el pedido se anula.',
        'El total que pagas es el que muestra Parla al confirmar: los precios de la tienda más la tarifa del delivery. Para reclamos sobre un producto o una entrega, escribe a soporte@parla.app y lo gestionamos con el comercio; aplican los derechos de la ley de protección al consumidor de tu país.',
      ],
    },
    {
      heading: '5. Disponibilidad y responsabilidad',
      paragraphs: [
        'Hacemos lo posible por mantener el servicio disponible y seguro, pero no garantizamos que funcione sin interrupciones. En la medida que la ley lo permita, nuestra responsabilidad se limita al valor pagado en los últimos 3 meses.',
      ],
    },
    {
      heading: '6. Cambios y contacto',
      paragraphs: [
        'Si cambiamos estos términos te avisaremos en la app. Puedes escribirnos a soporte@parla.app. Estos términos se rigen por la ley colombiana.',
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  slug: 'privacidad',
  title: 'Política de privacidad y tratamiento de datos',
  intro:
    'Esta política explica qué datos personales tratamos, para qué y cuáles son tus derechos, según la Ley 1581 de 2012 y el Decreto 1377 de 2013 (Colombia), la LGPD (Brasil) y normas equivalentes en Latinoamérica.',
  sections: [
    {
      heading: '1. Responsable',
      paragraphs: ['Parla es responsable del tratamiento de tus datos. Contacto para temas de privacidad: privacidad@parla.app.'],
    },
    {
      heading: '2. Qué datos tratamos',
      paragraphs: [
        'Datos de cuenta: teléfono (verificado con un código por SMS), nombre, usuario si eliges uno, contraseña (solo guardamos un hash), correo de recuperación si lo agregas, foto de perfil e información que escribas en tu perfil. Tu foto la ven las personas con las que conversas.',
        'Contactos: si buscas a tus contactos, tu navegador envía solo los números que tú eliges para ver quiénes usan Parla. No los guardamos ni los usamos para nada más.',
        'Códigos de verificación: los SMS y correos con códigos los entrega OneSignal por encargo nuestro; solo recibe el número o correo y el texto del mensaje.',
        'Datos técnicos: con quién conversas, fechas de los mensajes, estado de entrega, a quién mencionas y datos de las tareas (responsable, fecha, estado). Estos metadatos son necesarios para que el servicio funcione.',
        'Lo que NO podemos leer: el contenido de tus mensajes, archivos, notas de voz, títulos de tareas y llamadas. Se cifran en tu dispositivo y solo los participantes tienen las claves.',
        'Servicios: al hacer un pedido compartimos con la tienda los productos, con la empresa de delivery tu dirección y referencia, y con la billetera el monto a cobrar. Guardamos el pedido (productos, montos, dirección y estado) para tu historial; los datos de tu cuenta bancaria o billetera los maneja ella, nunca Parla.',
      ],
    },
    {
      heading: '3. Para qué los usamos',
      paragraphs: [
        'Prestar el servicio (entregar mensajes, notificaciones y llamadas), gestionar tus pedidos y sus pagos, proteger la seguridad de las cuentas y cumplir obligaciones legales. No vendemos tus datos ni los usamos para publicidad.',
      ],
    },
    {
      heading: '4. Tus derechos',
      paragraphs: [
        'Puedes conocer, actualizar, rectificar y suprimir tus datos, revocar la autorización y presentar quejas ante la Superintendencia de Industria y Comercio.',
        'Desde Ajustes → Tus datos puedes descargar una copia de tus datos y eliminar tu cuenta. Al eliminarla borramos tu nombre, usuario, teléfono, contraseña y tus claves de respaldo, y sales de todos tus chats; tu historial de pedidos se borra.',
      ],
    },
    {
      heading: '5. Conservación y seguridad',
      paragraphs: [
        'Conservamos los datos mientras tu cuenta esté activa. Los mensajes cifrados enviados a otras personas siguen en sus conversaciones, sin tu nombre, si eliminas tu cuenta.',
        'Aplicamos cifrado en tránsito (HTTPS) y de extremo a extremo, control de acceso por chat, límites de intentos de inicio de sesión y cabeceras de seguridad.',
      ],
    },
    {
      heading: '6. Transferencias',
      paragraphs: [
        'Podemos alojar los datos con proveedores de infraestructura fuera de tu país que ofrecen niveles adecuados de protección. Al aceptar esta política autorizas esa transferencia.',
      ],
    },
  ],
};
