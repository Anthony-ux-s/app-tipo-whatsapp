# Guía de Estructura y Arquitectura Estándar para Módulos (Screaming Architecture)

Esta guía define el estándar oficial de arquitectura, estructuración y refactorización para todos los módulos de negocio en el proyecto. Su objetivo es implementar una **Screaming Architecture Premium**: limpia, auto-explicativa, desacoplada, sin redundancias y lista para integraciones fluidas con el backend.

---

## 1. Estructura General de un Módulo Estándar

Cada módulo de negocio debe ser auto-contenido y seguir esta estructura limpia de directorios:
text
[nombre-del-modulo]/
├── components/                     # Capa de Presentación (JSX/TSX puro)
│   ├── [NombreModulo]View.tsx      # Orquestador/Contenedor principal del módulo
│   ├── [NombrePanel]Panel.tsx      # Secciones o paneles estructurales complejos (opcional)
│   └── [NombreComponente].tsx      # Componentes de UI atómicos específicos del módulo
├── const/                          # Datos estáticos del módulo
│   └── [nombre-modulo].const.ts    # Configuración estática y Mocks para desarrollo local
├── hooks/                          # Capa de Lógica y Estado
│   ├── use-[nombre].hook.ts        # Controladores de estado, efectos y peticiones al backend
│   └── ...                         # Otros hooks utilitarios locales del módulo
├── types/                          # Capa de Contratos y Tipado
│   └── [nombre-modulo].types.ts    # Tipos e interfaces específicas del módulo
└── utils/                          # Utilidades estrictamente propietarias
    └── [nombre-utilidad].utils.ts  # Lógica auxiliar NO reutilizable en otros módulos

---

## 2. Regla de Oro: Pureza en la Capa de Presentación (/components)

Para lograr un código extremadamente limpio, desacoplado y mantenible, los archivos de la carpeta components/ deben cumplir estrictamente con la siguiente directriz:

  **Código JSX/TSX Puro:** Los componentes de UI deben limitarse a estructurar la maquetación y la visualización de datos usando estilos. Su código debe verse simple y descriptivo de la interfaz.
  **Sin Lógica de Estado:** Bajo ninguna circunstancia deben declarar estados locales complejos (useState, useReducer) que controlen lógica de negocio, flujos o datos del dominio.
  **Sin Funciones ni Handlers de Negocio:** No se deben declarar funciones que procesen información ni handlers de eventos complejos que ejecuten flujos de control dentro del componente.
  **Delegación Total a Hooks:** Toda la reactividad, mutaciones de estado, llamadas a APIs o validaciones deben delegarse a los **Custom Hooks** (ubicados en /hooks). El componente solo consume el estado expuesto por el hook y enlaza callbacks directos a las interacciones físicas.
>[!IMPORTANT]
>**Ejemplo de lo que NO se debe hacer en un componente:**
>
sx
> / ❌ INCORRECTO: Contiene estados y handlers con lógica de negocio
> xport function SpecialityCard() {
>  const [isOpen, setIsOpen] = useState(false); // Lógica de estado local en componente
>  const handleSave = async (data) => { ... };  // Handler complejo en componente
>  return <div onClick={() => setIsOpen(true)}>...</div>;
> 
> 
>**Ejemplo correcto:**
>
sx
> / ✅ CORRECTO: El componente es visual y consume todo del hook
> xport function SpecialityCard() {
>  const { isOpen, openModal, handleSave } = useSpecialityCard(); // Delegado a un Hook
>  return <div onClick={openModal}>...</div>;
> 
> 
--

## 3. Diseño Premium, Responsividad y Paleta Corporativa

Para garantizar una experiencia de usuario de primer nivel (premium) y homogeneidad visual en toda la plataforma, cada módulo de UI debe cumplir estrictamente con los siguientes estándares de diseño:

### A. Paleta de Colores Corporativa Restringida
El diseño visual debe limitarse exclusivamente a la gama de colores corporativos oficiales. Bajo ningún concepto se deben incorporar colores genéricos o ajenos a esta identidad:
* **Teal (Verde Azulado):** Color primario para fondos de marca, botones principales y bordes acentuados.
* **Emerald (Esmeralda):** Color secundario para estados exitosos, etiquetas positivas e indicadores activos.
* **Cyan (Cian):** Color de realce/destaque para elementos interactivos, degradados luminosos y acentos visuales secundarios.

### B. Responsividad Fluida y Adaptativa
La interfaz debe estar diseñada para lucir perfecta en cualquier tamaño de pantalla (móviles, tabletas, laptops y pantallas de escritorio):
* **Tipografía Adaptativa:** Ajustar dinámicamente los tamaños de fuentes utilizando clases responsivas (ej: `txt-xs sm:text-sm md:text-base lg:text-lg`)
* **Márgenes y Espaciados Flexibles:** Adaptar los `pddings`  `mrgins` egún el tamaño de la pantalla (ej: `p3 sm:p-4 md:p-6 lg:p-8`,`gp-2 md:gap-4 lg:gap-6`)
* **Layouts Responsivos:** Implementar rejillas y flexbox que reorganicen el contenido automáticamente al cambiar de dispositivo (ej: `gid-cols-1 md:grid-cols-2 xl:grid-cols-3`  flex layouts con `fex-col lg:flex-row`)

---

## 4. Convenciones de Nombres según Funcionalidad

Para asegurar la uniformidad en el proyecto, cada archivo debe ser nombrado según su propósito utilizando las siguientes extensiones:

| Tipo de Archivo | Convención de Nombre | Ejemplo |
| :--- | :--- | :--- |
| **Componentes de React** | `PscalCase.tsx`  `SecialityPage.tsx`,`SecialityCard.tsx` 
| **Custom Hooks** | `ue-[nombre].hook.ts`  `ue-speciality.hook.ts` 
| **Constantes** | `[ombre-modulo].const.ts`  `seciality.const.ts` 
| **Tipos de TypeScript** | `[ombre-modulo].types.ts`  `seciality.types.ts` 
| **Utilidades Locales** | `[ombre-utilidad].utils.ts`  `seciality-calculations.utils.ts` 

---

## 5. Filosofía de Refactorización y Uso de la Capa `@shared`
La regla fundamental para evitar código redundante y mantener módulos limpios es la **reutilización agresiva y la centralización en `@shared`*.

### El Proceso de Pre-Verificación (¡Obligatorio!)
Antes de crear un nuevo componente, función utilitaria, validador o constante en un módulo, o al refactorizar uno existente, se debe realizar una verificación en la carpeta global:
1. **Buscar en `@shared/ui/`*: Si el elemento visual (ej: botón, modal, switch, selector) ya existe con estilos y accesibilidad listos, **debe** usarse el componente compartido.
2. **Buscar en `@shared/utils/`*: Si la operación (formateo de fechas, procesamiento de textos, cálculos financieros, validación de inputs) ya está implementada, **debe** importarse desde allí.

### Criterio de Extracción a `@shared` Migración de Funciones)
Durante una refactorización de módulo (por ejemplo, al limpiar la carpeta `/tils` e un módulo existente):
* **¿Es de utilidad global?** Si una función o componente resuelve una necesidad que potencialmente se usará en otros módulos, **debe ser movido a `@shared/`*.
* **Renombrado Semántico:** Al moverlo a `@shared`,se le debe asignar un archivo con nombre genérico y claro de acuerdo a su dominio de negocio o funcionalidad (ej: `@shared/utils/date.ts`,`@shared/utils/text.ts`,`@shared/utils/validators.ts`)
* **¿Es estrictamente propietario?** Solo se mantendrán funciones dentro de la carpeta `[ombre-del-modulo]/utils/` i el desarrollador senior justifica técnicamente que dicha lógica **únicamente pertenece al dominio cerrado de este módulo** y es altamente improbable que se requiera en el resto del proyecto.

### Eliminación de Código Muerto y Duplicidad Local
Toda refactorización debe incluir una depuración exhaustiva del módulo. Se debe asegurar la eliminación total de código muerto (dead code), variables sin usar, funciones obsoletas e importaciones innecesarias. Del mismo modo, se debe verificar que no exista duplicidad interna de lógica o archivos que afecten o interfieran con el correcto y estable funcionamiento del módulo.

---

## 6. Flujo de Dependencias y Screaming Architecture

Los módulos gritan su funcionalidad gracias a la organización visual y la separación de capas:

`
rmaid
graph TD
    Page[[Orquestador: Page.tsx]] -->|1. Consume estado y acciones| Hook(use-[modulo].hook.ts)
    Hook -->|2. Usa funciones globales| SharedUtils[Shared Utils <br/> @/shared/utils/*]
    Page -->|3. Estructura el Layout| Panels[Paneles del Módulo]
    Panels -->|4. Renderizan átomos| AtomicComponents[Componentes locales]
    Panels -->|5. Reutilizan base visual| SharedUI[Shared UI <br/> @/shared/ui/*]
    AtomicComponents -->|6. Reutilizan base visual| SharedUI
`
--

## 7. Lista de Verificación (Checklist) para Refactorización de Módulos

Al refactorizar un módulo existente para adaptarlo a este estándar, siga este checklist paso a paso:

- ] **Pre-verificar duplicidad:** Analizar los archivos de `uils/`,`cmponents/`  `cnst/` ctuales del módulo y compararlos contra `@shared/`.
- ] **Mover utilidades globales:** Extraer las funciones reutilizables del módulo (ej: formateadores, parseadores, validadores) hacia `@shared/utils/[funcionalidad].ts`.
- ] **Mover componentes globales:** Extraer modales de confirmación genéricos, inputs estilizados comunes, layouts, etc., hacia `@shared/ui/`.
- ] **Purgar imports locales:** Actualizar todas las importaciones del módulo para apuntar a los nuevos paths globales `@shared/...`.
- ] **Limpiar componentes de UI:** Asegurar que los componentes en `cmponents/` ontengan únicamente código JSX/TSX de maquetación pura, sin lógica de estado (`ueState`) funciones ni handlers.
- ] **Validar lógica propietaria:** Asegurar que las carpetas locales `uils/` ontengan única y exclusivamente código 100% específico de la funcionalidad del módulo.
- ] **Eliminar código muerto y redundancias:** Asegurar la remoción total de código sin usar, funciones obsoletas y duplicidades internas que afecten o comprometan el correcto funcionamiento y rendimiento del módulo.
- ] **Validar responsividad y paleta corporativa:** Comprobar que la UI se adapte correctamente a distintos tamaños de pantalla (ajuste responsivo de fuentes, paddings y margins) y use estrictamente la paleta corporativa: `can`,`tal`  `eerald`.
- ] **Renombrar según estándar:** Comprobar que todos los archivos cumplan estrictamente con las convenciones de nombres (`.ook.ts`,`.onst.ts`,`.ypes.ts`,`.tils.ts`)
