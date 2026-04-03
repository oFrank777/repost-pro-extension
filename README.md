# 🎭 TikTok Repost PRO - Browser Extension (SaaS)

Extensión industrial para la gestión masiva y limpieza de reposts de TikTok con un motor de simulación humana avanzada.

## 🚀 Características
- **Bypass de Bloqueos:** Pausas inteligentes y comportamiento humano real.
- **Validación Enterprise:** Fingerprinting de hardware para mitigar compartir licencias.
- **Integración Nativa:** Lógica de validación en tiempo de ejecución con Supabase.
- **SaaS Ready:** Soporte para licencias de LemonSqueezy y periodos de suscripción.
- **Seguridad en el Lado del Cliente:** Detección de orfandad (Vectores de desconexión) y blindaje de sesión.

## 🧱 Estructura y Tecnologías
- **Framework:** [Plasmo](https://plasmo.com/) (Browser Extension SDK)
- **Frontend:** React + Tailwind (Optional) + Vanilla Styles
- **Seguridad:** [JavaScript Obfuscator](https://javascript-obfuscator.com/) (Control Flow Flattening y Dead Code Injection)

## 📦 Compilación para Producción (Cifrada)
Para generar el paquete `.zip` seguro que subirás a Microsoft Edge o Chrome:

```bash
npm run build
```
*Este comando genera la carpeta `/build` y automáticamente **ofusca** todo el código JavaScript para proteger tu propiedad intelectual.*

## 🔒 Variables de Entorno (.env.production)
Crea un archivo `.env.production` con:

```env
PLASMO_PUBLIC_SUPABASE_URL=tu_supabase_url
PLASMO_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
PLASMO_PUBLIC_LANDING_URL=https://repost-pro-enterprise.vercel.app
```

---
© 2026 Repost PRO Enterprise SaaS.
