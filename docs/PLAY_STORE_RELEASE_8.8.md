# Play Store Release — Iter 8.8 (Pivot a padres de cachorros)

Documento de referencia para actualizar la ficha en Play Console y
preparar la versión "puppy parent niche" del listing. Pega los bloques
tal cual.

**Pre-requisito**: build 20 nativa (no OTA) — el rename de `app.json` solo
se aplica con rebuild. Si lanzas OTA con esto, los testers seguirán viendo
"Dogly Train" hasta su próxima actualización nativa.

---

## 1. Nombre de la app (Play Console > Ficha de la app > Detalles)

> Campo: **Nombre de la aplicación** (max 30 chars)

```
Dogly: Educar Cachorro
```

23 chars. Cero competencia directa en España con esa frase exacta.
Mantiene "Dogly" como brand recognizable.

---

## 2. Descripción corta (max 80 chars)

> Campo: **Descripción breve**

```
Educa, vacuna y socializa a tu cachorro. Encuentra adiestrador o cuidador.
```

74 chars. Cubre 3 verbos puppy + el marketplace en una sola línea.

---

## 3. Descripción completa (max 4000 chars)

> Campo: **Descripción completa**
>
> Las primeras 3 líneas son las que Google indexa más fuerte para SEO.
> Densidad de "cachorro" objetivo: ≥3 menciones en los primeros 250 chars.

```
Dogly es la app para padres primerizos de cachorro. Educa, cuida y socializa a tu perro durante sus primeros 12 meses con un plan personalizado.

Aprende a adiestrar con refuerzo positivo, controla vacunas y desparasitaciones, y conecta con adiestradores caninos y cuidadores de perros cerca de ti.

Diseñada en España para nuevos dueños: desde la primera noche en casa hasta el final de la fase cachorro.

🐶 PLAN DIARIO DE CACHORRO
Cada día te decimos qué hacer con tu cachorro: socialización, descanso, mordeduras, refuerzo positivo. Adaptado a su edad en meses.

🏆 CURSOS DE ADIESTRAMIENTO
20 cursos paso a paso desde "sentado" hasta "andar sin tirar de la correa". 5 minutos al día bastan. Sistema de XP y niveles para mantener la motivación.

💉 SALUD Y VACUNAS
Calendario completo de vacunación cachorro (parvovirus, moquillo, rabia). Recordatorios automáticos. Historial veterinario y curva de peso.

🎾 PASEOS GPS
Registra los paseos con mapa del recorrido. Ideal para ver cuánto camina tu cachorro y cuándo necesita más socialización.

🆘 EMERGENCIAS
Protocolos para atragantamiento, intoxicación, golpe de calor, convulsiones. Contactos veterinarios a un toque.

👥 PROFESIONALES CERCA
Adiestrador canino o cuidador de perros validados, con reseñas. Reserva con calendario, paga con Bizum sin comisiones. Madrid, Barcelona, Valencia, Sevilla y toda España.

🐾 PARA CADA CACHORRO
La app se adapta automáticamente a la edad de tu perro. Si tu cachorro tiene 3 meses, ves contenido de socialización. Si tiene 8 meses, ves contenido de control de impulsos.

📱 SIN ANUNCIOS Y SIN COMISIONES
Marketplace transparente: profesional cobra el 100%. Tú pagas directo por Bizum o efectivo. Sin intermediarios.

— Diseñada con veterinarios y adiestradores españoles.
— Hecha por padres de cachorros, para padres de cachorros.

Etiquetas relevantes: cachorro, educar cachorro, primer perro, vacunas cachorro, adiestramiento cachorro, refuerzo positivo, socialización cachorro, mordeduras cachorro, cuidador perros, adiestrador canino.
```

**Densidad de "cachorro"**: 18 menciones en 1700 chars (~1%). Justo
por encima del threshold de keyword recognition de Google Play.

---

## 4. Categoría y tags

- **Categoría principal**: `Estilo de vida` (o `Mascotas` si está disponible
  en la región)
- **Categoría secundaria** (Apple): `Education` para Apple, pero Play no
  tiene secundaria.

**Etiquetas Play** (max 5):
- `cachorro`
- `adiestramiento`
- `mascotas`
- `veterinaria`
- `educación`

---

## 5. Screenshots (5 mínimo, hasta 8 recomendado)

Subir 5 capturas con overlay de caption arriba (texto grande, fondo
naranja semi-transparente para legibilidad). Ratio 9:16, ≥320px ancho.

| # | Captura | Caption overlay (es-ES) |
|---|---|---|
| 1 | Hoy con DailyRail mostrando "Día 14 de socialización" para un cachorro | **Tu cachorro, semana a semana** |
| 2 | Pantalla dog-health con calendario de vacunas + curva de peso | **Vacunas, socialización y trucos en un solo sitio** |
| 3 | Buscar Pros con 2-3 cards de adiestradores/cuidadores | **Adiestrador o cuidador a un toque** |
| 4 | Hero shot del Today con foto del cachorro + plan + level | **Diseñada para los primeros 12 meses** |
| 5 | Booking detail mostrando "Pagar con Bizum" con número del provider | **Bizum, sin comisiones** |

**Notas de producción**:
- Hacer las capturas en device REAL (Xiaomi MIUI), no emulador — los
  emuladores renderizan ligeramente distinto y Play lo detecta.
- Quitar contenido sensible: emails, números de teléfono reales, fotos
  identificables. Usar cuenta de test poblada con datos genéricos.
- Mantener consistencia: mismo perro en todas, mismo theme (light mode),
  mismo locale (es-ES).

---

## 6. Apple App Store (futuro, cuando lancemos en iOS)

> Campo: **Keywords field** (max 100 chars, separados por coma, sin espacios)

```
cachorro,educar,adiestrar,perro,vacunas,socializacion,cuidador,adiestrador,clicker,refuerzo,positivo,primer,nuevo,canino,12meses
```

96 chars. Estos son keywords SOLO para Apple — Google Play los indexa
desde la descripción completa.

---

## 7. Brand names a EVITAR (no mencionar en descripción ni keywords)

- Dogo, Woofz, Pupford, Puppr (apps competidoras directas)
- Rover, Gudog (marketplaces internacionales)
- Tractive (GPS para mascotas)
- Mister Cooper (servicio español)
- PawChamp, 11pets, Ruffo (otros nichos)
- Cartilla Canina (DGT canina)

Mencionarlas activa filtros anti-spam de Play y puede tumbar el ranking.

---

## 8. Privacy / Data Safety

- **Sin cambios** desde la versión actual. La declaración existente
  cubre todo lo de Iter 8.8 (no añadimos categorías de datos nuevas).
- Recordar verificar que `app.json` rename no requiere re-aprobar la
  ficha (Play normalmente lo permite si el package name no cambia).

---

## 9. Estrategia de lanzamiento del rename

1. **Subir build 20** con `app.json` rename + Iter 8.8 changes
2. **Closed Testing primero**: 14 días con testers para validar que el
   nuevo nombre no confunde a usuarios existentes
3. **Cambiar Play Console listing** (título + descripción + screenshots)
   en paralelo durante esos 14 días
4. **Promote a Production** cuando ambos estén green
5. **Cambio visible en grid**: el icono no cambia, solo el nombre debajo.
   Los usuarios actuales verán "Dogly Train" hasta su próxima actualización
   nativa. Cuando se actualicen → ven "Dogly: Educar Cachorro" y el listing
   nuevo.

---

## 10. Métricas a vigilar post-rename (primeras 4 semanas)

| Métrica | Baseline actual | Target post-rename |
|---|---|---|
| Ranking en Play para "cachorro" (es-ES) | >100 (sin posición) | Top 30 a 30 días |
| Ranking en Play para "educar cachorro" (es-ES) | >100 | Top 10 a 30 días |
| Conversion install → registration | (medir baseline) | +20% por mejor ASO |
| Day-7 retention | (medir baseline) | +15% por mejor product-market fit |

Medir vía Play Console > Adquisición + Firebase Analytics si configurado.

---

## Notas operacionales

- **El rename de `app.json` requiere build 20** (`eas build --platform android --profile production`). NO se aplica con `eas update` (OTA).
- Las screenshots y la descripción NO son OTA — se cambian directamente en Play Console y se aplican inmediatamente tras "Enviar a revisión" (1-3 días).
- Si Google rechaza el rename por "demasiado parecido a otra app", probar variante: "Dogly Cachorros" o "Dogly · Tu Cachorro" (sin "Educar").
- **NO** cambiar el `package` Android (`com.dogly.train`) — eso requeriría una app nueva y perderíamos reviews + usuarios.
