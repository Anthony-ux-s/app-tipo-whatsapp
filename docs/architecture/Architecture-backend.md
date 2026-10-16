# Genoma API — Arquitectura y Reglas del backend

Backend `apps/api` (NestJS + Prisma). **Screaming Architecture + Ports & Adapters.**
Complementa `MONOREPO_PROJECT.md` (tipos compartidos).

> ✅ **Módulos de referencia** (construidos, compilan): `patients/ai-diagnosis`,
> `patients/appointments`, `doctors/appointments`, `platform/identity/auth`. Cópialos como
> plantilla.

## Las 3 reglas que mandan

1. **La carpeta grita el negocio, no la herramienta.** En `src/modules/` se lee *qué hace el
   sistema* (`inventory`, `appointments`, `ai-doctor`), nunca `controllers/`/`services/` como
   nivel superior. Espeja el front 1:1 (`modules/<rol>/<feature>`, mismo nombre, en inglés).
2. **Lo que no tiene dueño vive en el dominio general.** El primer nivel de `modules/` son los
   CINCO roles (`admin`, `clinics`, `doctors`, `patients`, `pharmacy`) y `platform/`, que agrupa
   por capacidad todo lo que comparten dos roles o más. Ver "El dominio general" más abajo.
3. **El negocio nunca nombra al proveedor.** Una feature usa un PUERTO (`ProductRepository`,
   `AuthProviderPort`); el nombre del proveedor (Supabase, Anthropic, MercadoPago) vive **solo**
   en `infra/<capacidad>/*.adapter.ts` y en una línea de binding. Cambiar de proveedor = un
   adaptador + una línea de config.

---

## Estructura de carpetas

```
apps/api/src/
├─ config/            # env tipada/validada (env.validation.ts)
├─ kernel/            # TS puro, sin Nest: domain-error, plan-proration, plan-trial, ttl-cache…
├─ http/              # transversales: jwt-auth.guard, current-user.decorator, public.decorator
├─ common/filters/    # http-exception.filter (DomainError → HTTP)
├─ infra/             # PROVEEDORES por capacidad = 1 puerto + N adaptadores intercambiables
│  ├─ prisma/         # PrismaService (@Global)
│  ├─ identity/       # AUTH_PROVIDER (supabase|postgres) + IDENTITY_ADMIN
│  ├─ ai-completion/  # AI_COMPLETION (anthropic)
│  └─ infra.module.ts # @Global: enchufa puerto→adaptador según env
└─ modules/           # EL NEGOCIO. Seis carpetas y ni una más: cinco roles y lo compartido
   ├─ admin/          # espejo del front: modules/<rol>/<feature>
   ├─ clinics/
   ├─ doctors/
   ├─ patients/
   ├─ pharmacy/
   └─ platform/       # EL DOMINIO GENERAL, por capacidad
      ├─ identity/    # auth · create-user · account-provisioning · legal-terms · ai-consent
      ├─ billing/     # payments · payment-market · appointment-charges · commissions ·
      │               # plans-catalog · plan-access · plan-gencoins
      ├─ scheduling/  # appointment-alerts · appointment-reminders · waitlist · calendar-sync
      ├─ messaging/   # notifications · push · order-alerts · notifications-retention
      ├─ support/     # support-contact · support-tickets · support-agent · complaints
      └─ sales/       # inbox · integrations · leads · labels · panel · agent · booking ·
                      # social-token-refresh
```

## El dominio general (`modules/platform/`)

### Cuándo una feature sale del rol

La pregunta no es "¿lo usa más de uno?", es **¿alguien es su DUEÑO?**

- **Sale al dominio general** cuando los que la usan la usan como IGUALES y ninguno manda: la
  bandeja (la misma conversación la miran la clínica, el consultorio, la farmacia y el paciente),
  el hub de conexiones, el cobro, los avisos, el alta de una cuenta.
- **Se queda en el rol** cuando ese rol es el dueño del dato y los demás lo consultan: la historia
  clínica es del PACIENTE aunque el médico la escriba y la clínica la lea; la agenda es del
  MÉDICO aunque el paciente reserve en ella; la afiliación la mantiene la CLÍNICA aunque el
  médico la acepte.

Con esa regla, una flecha de `pharmacy/` a `clinics/` es siempre un error de sitio, no un atajo.

Las flechas entre roles que SÍ quedan son las tres que apuntan al dueño del dato, y son
deliberadas:

```
clinics/medical-records-hce  →  doctors/medical-records   el acto clínico lo hace el profesional
doctors/my-clinics           →  clinics/affiliations      la afiliación la mantiene la clínica
patients/find-doctors        →  doctors/medical-schedule  la disponibilidad es del médico
```

### Un motor compartido, varias puertas

Cuando una capacidad la usan varios roles, el motor (puerto, adaptador Prisma, mapper y
use-cases) vive en `platform/` y **cada rol pone solo su controller** en su propia carpeta, con
su `@Roles`, su permiso de equipo y su ACTOR. Así está la bandeja y así está el hub de
conexiones:

```
platform/sales/inbox/            el MOTOR: puerto, Prisma, mapper, use-cases, sin una sola ruta
clinics/bandeja/                 la puerta de la clínica     (@Roles('clinic'))
doctors/bandeja/                 la puerta del consultorio   (@Roles('doctor'))
pharmacy/bandeja/                la puerta de la farmacia    (@Roles('pharmacy'))
patients/mensajes/               la puerta del paciente      (@Roles('patient'))
```

### Dos features del mismo rol no tienen dos motores

Dentro de un rol pasa lo mismo que entre roles: si dos pantallas miran o tocan lo mismo, el motor
es UNO y la otra lo pide prestado por su puerto. La agenda del médico y su CRM de citas tenían dos
repositorios con la misma consulta escrita palabra por palabra, y el propio código admitía por
escrito que se mantenían sincronizadas a mano.

Piezas que ya están extraídas y NO se vuelven a escribir:

| Pieza | Dónde | Qué evitaba |
| --- | --- | --- |
| `resolvePatientIdForUser` | `infra/prisma/resolve-patient-id.ts` | 11 copias del mismo `patients.findFirst` |
| `loadPatientIdentity` | `infra/prisma/resolve-patient-id.ts` | La identidad copiada al pedido y a la reserva, con dos nombres |
| `requireOwnedByDoctor` | `modules/doctors/service-ownership.ts` | 13 copias de la regla 404-no-403 |
| `dischargeStock` | `modules/pharmacy/inventario/stock-discharge.ts` | El descuento de stock del POS y del delivery |
| `deleteAccountCascade` | `modules/platform/identity/account-cascade.ts` | El borrado en cascada, copiado en los 4 `management-*` |
| `subscription.mapper` · `appointment.mapper` | `modules/platform/billing` y `…/scheduling` | 4 y 3 copias del mismo mapeo |

Las de `infra/prisma` solo las usan los ADAPTADORES, que son los únicos que conocen Prisma; los
casos de uso siguen hablando con su puerto.

Una puerta NO se lleva carpeta propia cuando su URL cuelga de otra feature del MISMO rol. El
cobro de una consulta (`POST /clinics/appointments/:id/charge`) es una acción sobre la cita, así
que su controller vive en `clinics/appointments` junto al resto de ese prefijo, y no en un
`clinics/appointment-charges` con dos archivos. La regla práctica: **un prefijo de `@Controller`,
una carpeta**. Si dos carpetas declaran el mismo prefijo, la ruta se busca donde no está y el
orden de registro pasa a depender del recorrido del grafo de módulos.

Si esa puerta necesita OTRO permiso que el resto del controller, se pone el decorador en el
método, que sustituye al de la clase. Así la exigencia se lee en la propia línea de la ruta:

```ts
@RequiresClinicPermission('billing')   // la clase pide `appointments`; cobrar es caja
@Post(':id/charge')
```

Dos cosas que NO se mueven al hacer esto:

1. **La cadena de la URL.** Un controller cambia de carpeta, nunca de `@Controller('...')`. Las
   rutas públicas que ya están declaradas fuera (el callback de OAuth y los webhooks de Meta)
   siguen colgando de su prefijo original aunque el motor viva en otro sitio.
2. **El orden de registro de dos controllers que casan con la misma URL.** Si dos rutas compiten
   (`oauth/callback` contra `oauth/:provider`), sus controllers se quedan en el MISMO módulo y
   en el mismo orden. Repartirlos deja esa decisión al recorrido del grafo de módulos, y ahí es
   donde un `@Public()` se convierte en un 401.

## Dentro de un feature (lean, crece por necesidad)

Obligatorio: `*.controller.ts` + `*.module.ts` + `use-cases/`. Lo demás solo si hace falta.

```
modules/<rol>/<feature>/
├─ <feature>.controller.ts        # entrada HTTP: valida → use-case → devuelve contrato
├─ <feature>.module.ts            # wiring: { provide: TOKEN, useClass: PrismaXRepository }
├─ use-cases/                     # GRITA el comportamiento (1 use-case = 1 acción)
├─ <feature>.repository.ts        # PUERTO (interface + Symbol token)
├─ prisma-<feature>.repository.ts # ADAPTADOR Prisma (lo ÚNICO que toca la BD)
├─ <feature>.mapper.ts            # fila Prisma ↔ contrato @genoma/types
├─ dto/                           # entrada validada (class-validator)
└─ domain/                        # SOLO si hay reglas/invariantes reales
```

Flujo: `controller → use-case (depende del PUERTO) → adaptador Prisma → mapper → contrato`.
El use-case no sabe si detrás hay Supabase o Postgres puro.

## Cambiar de proveedor

Cada capacidad externa tiene un puerto en `infra/<capacidad>/`; `InfraModule` (@Global) elige el
adaptador por env. Ej: `AUTH_PROVIDER=supabase|postgres`, `AI_PROVIDER`, BD por `DATABASE_URL`.
El puerto se define una vez, el adaptador una vez, el binding una vez.

---

## Dónde vive cada tipo (no romper el contrato del front)

| Tipo | Vive en |
|---|---|
| Fila de BD / **enum Postgres** / DTO request-response | **`@genoma/types`** (fuente única) |
| Entidad de **dominio** (modelo rico con reglas) | `modules/<…>/domain` (interna) |
| Request/Response DTO (la forma que ve el front) | `…/dto` → **= el contrato** |
| Fila Prisma cruda | la genera Prisma; el mapper la traduce al contrato |

### Enums: uno solo, en `@genoma/types`, reutilizable desde `/const`

**Todos los enums de `prisma/schema.prisma` (80) están espejados en `@genoma/types`** como
uniones de literales string (no `enum` de TS) — coinciden 1:1 con Postgres y con
`supabase gen types`, son tree-shakeables y componen con `Pick/Omit/Exclude`. Ubicación:

- **Compartido** (lo usan ≥2 dominios, p. ej. `gender`, `account_role`, `payment_status`):
  `contracts/shared/enums.types.ts`.
- **De un dominio** (p. ej. `prescription_status`): el archivo de ese dominio
  (`contracts/shared/<dominio>.types.ts`).
- Todos salen por el barrel: `import type { AppointmentStatus } from '@genoma/types'`.

**Acceso rápido desde el front** (no redeclaran, solo re-exportan para encontrarlos fácil):
- `apps/web/src/shared/const/enum.global.ts` → **todos** los enums de BD (re-export de `@genoma/types`).
- `apps/web/src/shared/types/index.ts` → barrel de los tipos compartidos del front.

**Regla:** ni el back ni el front **redeclaran** un enum de la BD. El front lo importa de
`@genoma/types` (o de `@/shared/const/enum.global`), y en `/const` solo guarda las
**etiquetas/colores** (lo que ve el cliente), con el enum como clave:

```ts
// apps/web/.../const/appointments.const.ts  — labels ES, keyed por el enum del contrato
import type { AppointmentStatus } from '@genoma/types';
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pendiente', confirmed: 'Confirmada', completed: 'Completada', /* … */
};
```

> Excepción (§2.4 de `MONOREPO_PROJECT.md`): si el view-model usa valores en **español que ve el
> cliente** (`'pendiente'`…), esa unión ES se queda LOCAL y el mapeo ES↔EN se hace en el
> `services/*.mapper.ts` del front. Nunca se cambia un valor de enum que ve el cliente.

---

## Reglas obligatorias por módulo (SÍ o SÍ)

1. **Screaming**: módulo = feature del front, mismo nombre; dentro, `use-cases/` grita lo que hace.
   Si lo van a usar dos roles o más como iguales, la carpeta va a `platform/<capacidad>/` y cada
   rol pone encima su propio controller.
2. **Controller solo orquesta**: valida (DTO) → use-case → contrato. Cero lógica/Prisma. El dueño
   del recurso sale de `@CurrentUser()` (token), **nunca** del body/query.
3. **Depender de PUERTOS, no de proveedores**: toda dependencia externa por su puerto (interface +
   Symbol); el adaptador se enchufa en el `*.module.ts`. El nombre del proveedor solo en `infra/`.
4. **Una sola fuente para lo que cruza la frontera**: filas/enums/DTOs en **`@genoma/types`** (el
   API los importa, no los recrea). El `*.mapper.ts` traduce fila Prisma ↔ contrato en un lugar.
5. **Errores de dominio neutros**: lanza `kernel/domain-error` (`NotFoundError`, `ForbiddenError`,
   `ConflictError`); el `HttpExceptionFilter` los mapea a HTTP. Use-cases testeables sin Nest.
6. **Latencia mínima**: streaming SSE en respuestas largas (IA/exportes); 1 query sin N+1
   (`include`); paginar siempre (`take`/cursor, no `OFFSET`); índices que respalden cada
   `where`/`orderBy`; `select` lo necesario; trabajo diferible a cola; `PrismaService` singleton.
7. **Verificación antes de cerrar PR**: `nx build @genoma/types` + `nx build genoma-api` (exit 0) +
   `cd apps/web && npx tsc --noEmit`. Idealmente test del use-case + e2e feliz/401/404.
8. **Persistencia sobre `prisma/schema.prisma`**: los adaptadores leen/escriben las tablas reales
   vía `PrismaService` (BD ya desplegada, ver `prisma/PRISMA_SETUP.md`). Nada de mocks/storage
   paralelo. Si falta una columna/enum, primero se agrega al schema y se migra. Auth incluido: el
   perfil sale de `users` + `patients`/`doctors`/`clinics`/`pharmacies`.
9. **Limpieza tras conectar (no dejar huérfanos)**: cuando un módulo del front pasa a consumir el
   API real, hay que **eliminar la lógica/código muerto** que quedó sin usar: mocks de prueba
   (`const/mock*.ts`, `INITIAL_*`, `MOCK_*`), simuladores (`setTimeout`/fakes de red), helpers,
   tipos, imports y ramas que ya no se referencian. Regla práctica: si tras la implementación un
   símbolo ya **no se importa en ningún lado**, se borra (no se deja "por si acaso"). El front debe
   quedar **sin mock de prueba** para ese feature; deja solo lo que la UI real usa (labels/colores,
   view-models, filtros). Verifica con una búsqueda del símbolo (`grep`) antes de dar por cerrado.

### Checklist por módulo nuevo

```
[ ] modules/<rol>/<feature> con el MISMO nombre que el feature del front, o
    modules/platform/<capacidad>/<feature> si ningún rol es su dueño
[ ] ningún import a un rol que no sea el DUEÑO del dato (pharmacy → clinics es error de sitio)
[ ] controller: solo valida + use-case + contrato (sin Prisma); dueño vía @CurrentUser
[ ] use-cases/ (1 acción c/u); dependencias externas por PUERTO, adaptador en el *.module.ts
[ ] proveedor concreto solo en infra/<capacidad>; nada de su nombre en modules/
[ ] tipos y ENUMS importados de @genoma/types (no redeclarados); /const solo labels ES
[ ] *.mapper.ts traduce fila Prisma ↔ contrato en un solo lugar
[ ] errores con kernel/domain-error (no HttpException en el use-case)
[ ] LATENCIA: streaming si aplica; 1 query sin N+1; take/cursor; índices
[ ] PERSISTENCIA sobre tablas reales de prisma/schema.prisma
[ ] LIMPIEZA: borrado el mock de prueba + código/tipos/imports muertos (nada sin usar; grep del símbolo)
[ ] nx build genoma-api (exit 0) + tsc --noEmit del front en verde
```
