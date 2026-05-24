# Play Store Release — Iter 8.8 (Pivot a marketplace de adiestradores)

Documento de referencia para actualizar la ficha en Play Console.
Pega los bloques tal cual.

**Pre-requisito**: build 20 nativa (no OTA) — el rename de `app.json` solo
se aplica con rebuild. Si lanzas OTA con esto, los testers seguirán viendo
el nombre anterior hasta su próxima actualización nativa.

**Estrategia de posicionamiento (decidido tras audit de competencia)**:
- **Mercado cuidadores en España = saturado** (Gudog domina con 10+ años,
  Rover internacional). Competir cara a cara con Gudog = perder.
- **Mercado adiestradores caninos en España = vacío** (sin marketplace
  dominante; la gente busca via Google Maps, Facebook groups, recomendación).
- **Estrategia**: dominar el vertical adiestradores primero, ofrecer
  cuidadores en la app como funcionalidad secundaria, expandir el messaging
  a ambos cuando tengamos tracción.
- **Moat técnico que no tiene la competencia**:
  1. Live GPS + fotos en tiempo real durante el servicio
  2. Bizum directo entre owner y provider (cero comisión vs. 15-25% de Rover/Gudog)

---

## 1. Nombre de la app (Play Console > Ficha de la app > Detalles)

> Campo: **Nombre de la aplicación** (max 30 chars)

```
Dogly: Tu Adiestrador Canino
```

28 chars. Captura la palabra clave de búsqueda más valiosa
(`adiestrador canino`) en el campo que más pesa para ranking ASO.
"Tu" añade ownership emocional. "Dogly" mantiene el brand.

**Por qué este y no "Dogly: Adiestrador y Cuidador"**:
- Adiestradores = mercado vacío; cuidadores = saturado (Gudog)
- Pelear por cuidadores nos pone como "Gudog wannabe"
- Liderar adiestradores = posicionamiento defensible
- Cuidadores sigue en la app pero NO lo marketamos hasta tener tracción

---

## 2. Descripción corta (max 80 chars)

> Campo: **Descripción breve**

```
Encuentra tu adiestrador canino con seguimiento en vivo. Sin comisiones.
```

72 chars. Tres mensajes en una línea:
- Función principal: encontrar adiestrador
- Moat técnico: seguimiento en vivo (no lo tiene Gudog/Rover)
- Moat económico: sin comisiones (Bizum directo)

---

## 3. Descripción completa (max 4000 chars)

> Campo: **Descripción completa**
>
> Las primeras 3 líneas son las que Google indexa más fuerte para SEO.
> Densidad objetivo: "adiestrador" ≥4 menciones en los primeros 250 chars.

```
Dogly es la app para encontrar adiestrador canino en España. Reserva con calendario, paga directo por Bizum, y sigue el adiestramiento de tu perro en tiempo real con GPS y fotos en vivo.

Adiestradores caninos validados con identidad verificada y reseñas reales. Sin comisiones de plataforma: el adiestrador cobra el 100% y tú pagas lo justo.

Diseñada en España para dueños primerizos y experimentados: desde el primer "siéntate" hasta resolver mordeduras, agresividad y ansiedad.

🎯 ADIESTRADOR CANINO A UN TOQUE
Adiestradores con identidad verificada, especialidad declarada y reseñas reales de otros clientes. Busca por ciudad y reserva con calendario. Madrid, Barcelona, Valencia, Sevilla, Bilbao, Málaga y toda España.

📍 SEGUIMIENTO EN VIVO DEL SERVICIO
Ve a tu perro durante la sesión con GPS en tiempo real y fotos que el adiestrador comparte en directo. Tranquilidad total, sin tener que llamar para preguntar cómo va.

💳 BIZUM DIRECTO SIN COMISIONES
El adiestrador cobra el 100% del servicio. Tú pagas directo por Bizum. Sin comisiones de plataforma, sin sorpresas, sin pasarelas.

📚 CURSOS DE ADIESTRAMIENTO INCLUIDOS
20 cursos paso a paso desde "sentado" hasta "andar sin tirar". 5 minutos al día bastan. Aprende lo básico tú mismo y deja para el adiestrador profesional lo difícil (mordeduras, agresividad, fearful).

🐶 PLAN DIARIO PARA TU PERRO
Cada día te decimos qué hacer: socialización, descanso, refuerzo positivo. Adaptado a la edad de tu perro, especialmente útil en los primeros 12 meses (fase cachorro).

💉 SALUD Y VACUNAS
Calendario completo de vacunación canina (parvovirus, moquillo, rabia). Recordatorios automáticos. Historial veterinario y curva de peso.

🐕‍🦺 CUIDADORES Y PASEADORES TAMBIÉN
Además de adiestradores, encuentra cuidadores de perros y paseadores cerca de ti. Mismo sistema: reservas, reseñas, Bizum directo.

🆘 EMERGENCIAS
Protocolos para atragantamiento, intoxicación, golpe de calor, convulsiones. Contactos veterinarios a un toque.

🏆 SISTEMA DE PROGRESO
XP por cada curso completado, niveles del 1 al 5, certificados PDF de los cursos. Mantén la motivación día a día.

— Diseñada con adiestradores y veterinarios españoles.
— Hecha por padres de perros, para padres de perros.

Etiquetas: adiestrador canino, adiestramiento perros, cuidador de perros, paseador de perros, educación canina, refuerzo positivo, socialización cachorro, vacunas perro, clicker training, comportamiento canino.
```

**Densidad de "adiestrador"**: 13 menciones en ~1800 chars. Suficiente
para keyword recognition sin keyword stuffing.

---

## 4. Categoría y tags

- **Categoría principal**: `Estilo de vida` o `Mascotas` (si está disponible)

**Etiquetas Play** (max 5):
- `adiestrador`
- `cuidador`
- `mascotas`
- `educación canina`
- `veterinaria`

---

## 5. Screenshots (5 mínimo, hasta 8 recomendado)

Subir 5 capturas con overlay de caption arriba (texto grande, fondo
naranja semi-transparente para legibilidad). Ratio 9:16, ≥320px ancho.

**NUEVO orden** (alineado con posicionamiento marketplace-first):

| # | Captura | Caption overlay (es-ES) |
|---|---|---|
| 1 | Buscar Pros con 2-3 cards de adiestradores caninos (nombres, fotos, ratings, especialidades) | **Adiestrador canino a un toque** |
| 2 | Live session activa con mapa GPS + foto del perro durante la sesión | **Ve el adiestramiento en tiempo real** |
| 3 | Booking detail mostrando "Pagar con Bizum" con número del adiestrador | **Bizum directo, sin comisiones** |
| 4 | Pantalla cursos mostrando 4-6 cards con XP/niveles | **20 cursos para aprender en casa** |
| 5 | Today/Hoy con DailyRail + dog hero card | **Plan diario para los primeros 12 meses** |

**Notas de producción**:
- Hacer las capturas en device REAL (Xiaomi MIUI), no emulador
- Quitar contenido sensible: emails, números reales, fotos identificables
- Mantener consistencia: mismo perro en todas, light mode, locale es-ES
- La #1 es la más crítica — debe vender el marketplace de adiestradores en 1 segundo

---

## 6. Apple App Store (futuro, cuando lancemos en iOS)

> Campo: **Keywords field** (max 100 chars, separados por coma, sin espacios)

```
adiestrador,canino,perro,cuidador,adiestramiento,educacion,clicker,refuerzo,positivo,bizum,gps,cachorro,vacunas
```

99 chars. Priorizado por intención comercial:
1. `adiestrador` + `canino` + `adiestramiento` = tu vertical principal
2. `cuidador` = vertical secundario
3. `clicker` + `refuerzo` + `positivo` = método de adiestramiento
4. `bizum` + `gps` = tus moats únicos
5. `cachorro` + `vacunas` = audiencia secundaria (padres primerizos)

---

## 7. Brand names a EVITAR (no mencionar en descripción ni keywords)

- Gudog (competidor directo en cuidadores)
- Rover (competidor internacional)
- Mister Cooper, TopDog, Wuf (cuidadores españoles menores)
- Dogo, Pupford, Woofz, Puppr (apps de contenido training)
- 11pets (records de salud)
- Tractive (GPS hardware)
- Cartilla Canina (DGT)

Mencionarlas activa filtros anti-spam de Play y puede tumbar el ranking.

---

## 8. Privacy / Data Safety

- **Sin cambios** desde la versión actual. La declaración existente
  cubre todo lo de Iter 8.8 (no añadimos categorías de datos nuevas).
- El rename del nombre NO requiere re-aprobar la ficha siempre que el
  `package` name siga siendo `com.dogly.train` (que no cambia).

---

## 9. Estrategia de lanzamiento del rename

1. **Subir build 20** con `app.json` rename + Iter 8.8 changes ya OTA-deployadas
2. **Closed Testing primero**: 14 días con testers para validar que el
   nuevo nombre no confunde a usuarios existentes
3. **Cambiar Play Console listing** (título + descripción + screenshots)
   en paralelo durante esos 14 días
4. **Promote a Production** cuando ambos estén green
5. **Cambio visible en grid**: el icono no cambia, solo el nombre debajo.
   Los usuarios actuales verán el nombre antiguo hasta su próxima
   actualización nativa. Cuando se actualicen → ven el nuevo nombre + listing.

---

## 10. Métricas a vigilar post-rename (primeras 4 semanas)

| Métrica | Baseline actual | Target post-rename |
|---|---|---|
| Ranking en Play para `adiestrador canino` (es-ES) | >100 (sin posición) | Top 10 a 30 días |
| Ranking en Play para `adiestrador perros` (es-ES) | >100 | Top 20 a 30 días |
| Ranking en Play para `cuidador perros` (es-ES) | >100 | Top 30 a 60 días (no es nuestra prioridad) |
| Conversion install → 1ª búsqueda de adiestrador | 0% (no medido) | 40%+ |
| Day-7 retention | (medir baseline) | +15% por mejor product-market fit |

Medir vía Play Console > Adquisición + Firebase Analytics si configurado.

**Decision point a 60 días**:
- Si `adiestrador canino` rankea top-20 → consolidar y subir presupuesto marketing en esta keyword
- Si los bookings reales son más cuidadores que adiestradores → re-evaluar messaging hacia "Dogly: Adiestrador y Cuidador"

---

## Notas operacionales

- **El rename de `app.json` requiere build 20** (`eas build --platform android --profile production`). NO se aplica con `eas update` (OTA).
- Las screenshots y la descripción NO son OTA — se cambian directamente en Play Console y se aplican inmediatamente tras "Enviar a revisión" (1-3 días).
- Si Google rechaza el rename, alternativas en orden de preferencia:
  1. `Dogly · Adiestrador Canino` (sin "Tu") — 26 chars
  2. `Dogly: Adiestramiento Canino` — 28 chars (verbo en lugar de profesión)
  3. `Dogly · Adiestrador en Vivo` — 27 chars (lleva el moat al título)
- **NO** cambiar el `package` Android (`com.dogly.train`) — eso requeriría una app nueva y perderíamos reviews + usuarios.
- **Re-evaluar el nombre a 90 días post-lanzamiento** según métricas reales — el nombre no es para siempre, es la mejor hipótesis con los datos que tenemos hoy.
