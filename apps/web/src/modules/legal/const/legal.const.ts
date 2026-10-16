import type { LegalDocument } from '../types/legal.types';

export const LEGAL_VERSION = '2026-10';
export const LEGAL_UPDATED = '15 de octubre de 2026';

export const TERMS: LegalDocument = {
  slug: 'terminos',
  title: 'Términos y condiciones',
  intro:
    'Estos términos regulan el uso de Parla, un servicio de mensajería para equipos de trabajo. Al crear una cuenta aceptas estas condiciones.',
  sections: [
    {
      heading: '1. El servicio',
      paragraphs: [
        'Parla permite a equipos crear espacios de trabajo, conversar en chats individuales y grupales, compartir archivos, hacer llamadas de voz y video, y organizar tareas.',
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
        'Los administradores de cada espacio pueden retirar a miembros del espacio. Podemos suspender cuentas que incumplan estos términos.',
      ],
    },
    {
      heading: '4. Planes, pagos y cancelación',
      paragraphs: [
        'El plan Gratis no tiene costo. Los planes Equipo y Empresa se pagan por espacio de trabajo y por mes, de forma anticipada, a través de MercadoPago.',
        'No hay cobros automáticos: cada pago cubre un mes. Si no renuevas, al vencer el periodo el espacio vuelve al plan Gratis sin perder chats ni archivos; solo se aplican de nuevo sus límites (por ejemplo, no se podrán sumar miembros por encima de 10).',
        'Puedes dejar de pagar en cualquier momento; eso equivale a cancelar. Conforme al derecho de retracto (Ley 1480 de 2011, art. 47), puedes pedir el reembolso de un pago dentro de los 5 días hábiles siguientes, escribiendo a soporte@parla.app.',
        'Los precios incluyen los impuestos aplicables y pueden cambiar con al menos 30 días de aviso; un cambio nunca afecta un mes ya pagado.',
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
        'Datos de cuenta: nombre, usuario o teléfono, contraseña (solo guardamos un hash), foto o color de perfil, información que escribas en tu perfil.',
        'Datos técnicos: espacios a los que perteneces, con quién conversas, fechas de los mensajes, estado de entrega, a quién mencionas y datos de las tareas (responsable, fecha, estado). Estos metadatos son necesarios para que el servicio funcione.',
        'Lo que NO podemos leer: el contenido de tus mensajes, archivos, notas de voz, títulos de tareas y llamadas. Se cifran en tu dispositivo y solo los participantes tienen las claves.',
        'Pagos: los datos de tu tarjeta los procesa MercadoPago; nosotros solo guardamos el importe, el plan y el estado del pago.',
      ],
    },
    {
      heading: '3. Para qué los usamos',
      paragraphs: [
        'Prestar el servicio (entregar mensajes, notificaciones y llamadas), gestionar planes y pagos, proteger la seguridad de las cuentas y cumplir obligaciones legales. No vendemos tus datos ni los usamos para publicidad.',
      ],
    },
    {
      heading: '4. Tus derechos',
      paragraphs: [
        'Puedes conocer, actualizar, rectificar y suprimir tus datos, revocar la autorización y presentar quejas ante la Superintendencia de Industria y Comercio.',
        'Desde Ajustes → Tus datos puedes descargar una copia de tus datos y eliminar tu cuenta. Al eliminarla borramos tu nombre, usuario, teléfono, contraseña y tus claves de respaldo, y sales de todos tus espacios.',
      ],
    },
    {
      heading: '5. Conservación y seguridad',
      paragraphs: [
        'Conservamos los datos mientras tu cuenta esté activa. Los mensajes cifrados enviados a otras personas siguen en sus conversaciones, sin tu nombre, si eliminas tu cuenta.',
        'Aplicamos cifrado en tránsito (HTTPS) y de extremo a extremo, control de acceso por espacio, límites de intentos de inicio de sesión y cabeceras de seguridad.',
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
