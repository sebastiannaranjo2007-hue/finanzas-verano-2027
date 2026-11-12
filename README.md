# NYC

App web sencilla para seguir el ahorro, el presupuesto y los gastos del verano 2027 (Cedar Point y Nueva York). Es una página estática: HTML, CSS y JavaScript, sin servidor ni base de datos, pensada para publicarse gratis con GitHub Pages.

## Qué muestra

Cuatro secciones, con pestañas arriba en el computador y una barra abajo en el celular: **Resumen**, **Ahorro**, **Presupuesto** (una bolsa a la vez) y **Ruta NYC** (el plan día por día del 4 al 7 de agosto, con links a Google Maps). Los **Movimientos** se abren desde el Resumen con "Ver todos". Cada sección tiene su link: `#resumen`, `#ahorro`, `#presupuesto`, `#ruta`, `#movimientos`.

- **Ahorro para Nueva York** frente a la meta y frente al plan a la fecha de hoy.
- **Fondo para imprevistos**: ahorro planeado + almuerzos invitados − presupuesto de Nueva York, menos lo que te pases.
- **Tres bolsas separadas**:
  - **Préstamo · Cedar Point**: programa, visa, tren y los primeros US$800 de los vuelos. Lo usado es lo que se devuelve.
  - **Tu plata · Nueva York**: lo que pasa de US$800 en vuelos, hotel, comida, metro, Estatua de la Libertad, AirTrain e iPhone.
  - **Sueldo en Cedar Point**: vivienda, mercado y almuerzo.
- **Movimientos**: cada gasto o ahorro registrado.

## Archivos

```
index.html          la página
favicon.svg         el ícono de la pestaña
styles.css          el diseño (modo claro y oscuro)
app.js              las cuentas y el gráfico
data/
  movimientos.csv   gastos y ahorros (aquí se agrega cada movimiento)
  presupuesto.csv   presupuesto por concepto y bolsa
  plan.csv          metas de ahorro acumulado
  parametros.csv    tasa de cambio del día y ahorro por almuerzos invitados
  ruta.json         plan de los días en Nueva York
.nojekyll           le dice a GitHub Pages que publique los archivos tal cual
```

## Cómo registrar un gasto o un ahorro

Agrega una fila al final de `data/movimientos.csv` y sube el cambio (en GitHub: abre el archivo → ícono del lápiz → editar → *Commit changes*).

```
id,fecha,tipo,grupo,concepto,detalle,moneda,monto,usd,cop
4,2026-12-05,ahorro,Ahorro,Ahorro,Ahorro de diciembre,COP,300000,90.99,300000
```

- `id`: el siguiente número.
- `fecha`: AAAA-MM-DD.
- `tipo`: `gasto` o `ahorro`.
- `concepto`: para un gasto, el mismo texto de la columna `cuenta` de `presupuesto.csv` (por ejemplo `Hotel`, `Mercado`, `Vuelos`). Todos los vuelos van con el concepto `Vuelos`; la app reparte sola los primeros US$800 al préstamo y el resto a Nueva York.
- `usd` y `cop`: el valor en las dos monedas, con la TRM del día del movimiento.

Para cambiar la tasa, edita `data/parametros.csv`.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `finanzas-verano-2027`).
2. Sube todos estos archivos, incluida la carpeta `data/` y el archivo `.nojekyll`.
3. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)` → **Save**.
4. En uno o dos minutos la página queda en `https://TU-USUARIO.github.io/finanzas-verano-2027/`.

**Clave de entrada:** la página pide una clave de 4 dígitos y la recuerda 30 días en cada dispositivo. Es un candado para la vista, no seguridad real: el repositorio es público y cualquiera puede leer los archivos de `data/` directamente en GitHub.

**Ojo con la privacidad:** con una cuenta gratis, GitHub Pages solo publica repositorios públicos, así que cualquiera con el link (o que encuentre el repositorio) puede ver las cifras. La página le pide a los buscadores que no la indexen, pero eso no la hace privada.

## Verla en tu computador

Abrir `index.html` con doble clic no carga los datos (el navegador bloquea la lectura de archivos locales). Desde esta carpeta:

```
python3 -m http.server 8000
```

y abre `http://localhost:8000`.
